// Nómina electrónica: liquidar la nómina de cada trabajador con sus
// novedades (horas extra, vacaciones, licencias, incapacidades, prima,
// cesantías…), enviarla a la DIAN por Factus, imprimir el PDF y anularla con
// nota de ajuste. También el registro de trabajadores y la cuenta de Factus.
import { api, apiArchivo, catalogo, session } from '../api.js';
import { selectorPago } from '../pago-widget.js';
import { html, esc, cop, dia, hoy, toast, opciones, tabla, badge, datosForm, alEnviar, descargarExcel } from '../ui.js';
import { columnaAnular, claseAnulado, activarAnulaciones } from '../anular.js';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const ESTADO = { aceptada: 'ok', pendiente: 'warn', rechazada: 'danger', error: 'danger', sin_configurar: '' };
const TIPO_DOC = [['13', 'Cédula de ciudadanía'], ['22', 'Cédula de extranjería'], ['41', 'Pasaporte'], ['47', 'PEP'], ['12', 'Tarjeta de identidad']];
const TIPO_CONTRATO = [['2', 'Término indefinido'], ['1', 'Término fijo'], ['3', 'Obra o labor'], ['4', 'Aprendizaje'], ['5', 'Prácticas o pasantías']];
const TIPO_TRABAJADOR = [['01', 'Dependiente'], ['51', 'Tiempo parcial'], ['02', 'Servicio doméstico'], ['12', 'Aprendiz SENA etapa lectiva'], ['19', 'Aprendiz SENA etapa productiva']];
const TIPO_CUENTA = [['2', 'Ahorros'], ['3', 'Corriente'], ['1', 'Nómina']];
const MEDIOS = [['transferencia', 'Transferencia'], ['consignacion', 'Consignación'], ['efectivo', 'Efectivo'], ['cheque', 'Cheque']];
const sel = (pares, valor) => pares.map(([v, t]) => `<option value="${v}"${String(valor) === v ? ' selected' : ''}>${esc(t)}</option>`).join('');
const periodoTxt = (n) => `${MESES[n.mes - 1]} ${n.anio}${n.quincena ? ` · ${n.quincena === '2nd' ? '2.ª' : '1.ª'} quincena` : ''}`;

export async function vistaNomina(root, params) {
  const empresas = await catalogo('empresas');
  const admin = session.usuario?.rol === 'admin';
  let tab = params?.get('tab') || 'liquidar';
  const hoyD = new Date();

  root.innerHTML = html`
    <div class="page-head">
      <h1>Nómina electrónica</h1>
      <span class="hint">Liquida, envía a la DIAN (Factus) e imprime el soporte de pago de nómina de cada trabajador.</span>
    </div>
    <div class="tabs">
      <button type="button" data-tab="liquidar">Liquidar nómina</button>
      <button type="button" data-tab="trabajadores">Trabajadores</button>
      ${admin ? '<button type="button" data-tab="cuenta">Cuenta DIAN (Factus)</button>' : ''}
    </div>
    <section data-panel="liquidar">
      <div class="grid">
        <div>
          <div class="card">
            <h2>Liquidar nómina de un trabajador</h2>
            <form id="form-nomina">
              <label><span>Trabajador</span><select id="n-empleado" required></select></label>
              <div class="row">
                <label><span>Mes</span><select name="mes" id="n-mes">${MESES.map((m, i) => `<option value="${i + 1}"${i === hoyD.getMonth() ? ' selected' : ''}>${m}</option>`).join('')}</select></label>
                <label class="w-sm"><span>Año</span><input type="number" name="anio" id="n-anio" value="${hoyD.getFullYear()}" min="2024" max="2100" /></label>
              </div>
              <div class="row">
                <label id="n-quincena-label" hidden><span>Quincena</span>
                  <select name="quincena" id="n-quincena"><option value="1st">Primera (1 al 15)</option><option value="2nd">Segunda (16 a fin de mes)</option></select></label>
                <label><span>Fecha de pago</span><input type="date" name="fecha_pago" id="n-fecha" value="${hoy()}" required /></label>
              </div>
              <div id="n-pago" class="pago-box"></div>

              <details class="novedad" open><summary>Horas extra y recargos</summary>
                <div class="items" id="nv-horas"></div><button type="button" class="btn-link" data-add="horas">+ Horas</button></details>
              <details class="novedad"><summary>Vacaciones</summary>
                <div class="items" id="nv-vacaciones"></div><button type="button" class="btn-link" data-add="vacaciones">+ Vacaciones</button></details>
              <details class="novedad"><summary>Licencias</summary>
                <div class="items" id="nv-licencias"></div><button type="button" class="btn-link" data-add="licencias">+ Licencia</button></details>
              <details class="novedad"><summary>Incapacidades</summary>
                <div class="items" id="nv-incapacidades"></div><button type="button" class="btn-link" data-add="incapacidades">+ Incapacidad</button></details>
              <details class="novedad"><summary>Prestaciones sociales</summary>
                <div class="row" style="align-items:end">
                  <label class="chk"><input type="checkbox" id="nv-prima" /> Pagar prima</label>
                  <label class="w-sm"><span>Días prima</span><input type="number" id="nv-prima-dias" min="1" max="180" placeholder="auto" /></label>
                </div>
                <div class="row" style="align-items:end">
                  <label class="chk"><input type="checkbox" id="nv-cesantias" /> Pagar cesantías</label>
                  <label class="w-sm"><span>Días</span><input type="number" id="nv-cesantias-dias" min="1" max="360" placeholder="auto" /></label>
                  <label class="w-sm"><span>Valor</span><input type="number" id="nv-cesantias-valor" min="0" placeholder="auto" /></label>
                </div>
                <label class="chk"><input type="checkbox" id="nv-intereses" checked /> Con intereses (12%)</label>
                <p class="muted" style="margin:4px 0 0">Prima: días del semestre; cesantías: días del año. Déjalos vacíos para calcularlos solos.</p>
              </details>
              <details class="novedad"><summary>Otros pagos (comisiones, bonificaciones, auxilios)</summary>
                <div class="items" id="nv-otros"></div><button type="button" class="btn-link" data-add="otros">+ Pago</button></details>
              <details class="novedad"><summary>Deducciones (libranzas, anticipos, otras)</summary>
                <div class="items" id="nv-deducciones"></div><button type="button" class="btn-link" data-add="deducciones">+ Deducción</button>
                <label><span>Retención en la fuente (vacío = cálculo automático)</span><input type="number" id="nv-retencion" min="0" placeholder="automática" /></label></details>
              <label><span>Observación</span><input name="observacion" placeholder="Opcional" /></label>
              <div class="resumen-doc" id="n-preview"><p class="muted">Elige un trabajador para ver la liquidación.</p></div>
              <button type="submit" class="btn-primary">Liquidar y enviar a la DIAN</button>
            </form>
          </div>
        </div>
        <div>
          <div class="card">
            <div class="row" style="align-items:end">
              <h2 style="margin:0">Nóminas</h2>
              <label class="w-sm"><span>Año</span><input type="number" id="f-anio" value="${hoyD.getFullYear()}" /></label>
              <label><span>Mes</span><select id="f-mes"><option value="">Todos</option>${MESES.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('')}</select></label>
              <button type="button" class="btn-link w-sm" id="btn-excel">Excel</button>
            </div>
            <div id="lista-nominas"></div>
          </div>
          <div class="card" id="card-detalle" hidden>
            <h2 id="titulo-detalle">Detalle</h2>
            <div id="detalle"></div>
          </div>
        </div>
      </div>
    </section>
    <section data-panel="trabajadores" hidden>
      <div class="grid">
        <div class="card">
          <h2 id="titulo-emp">Nuevo trabajador</h2>
          <form id="form-empleado"></form>
        </div>
        <div class="card">
          <div class="row" style="align-items:end"><h2 style="margin:0">Trabajadores</h2>
            <label><span>Empresa</span><select id="f-emp-empresa">${opciones(empresas, { vacio: 'Todas' })}</select></label></div>
          <div id="lista-empleados"></div>
        </div>
      </div>
    </section>
    ${admin ? html`<section data-panel="cuenta" hidden>
      <div class="grid">
        <div class="card">
          <h2>Cuenta de Factus para nómina</h2>
          <form id="form-cuenta">
            <label><span>Empresa</span><select name="empresa_id" id="c-empresa">${opciones(empresas)}</select></label>
            <p class="muted" id="c-estado"></p>
            <label><span>¿Qué cuenta usa?</span>
              <select name="modo" id="c-modo">
                <option value="propia">Credenciales propias de nómina (p. ej. el sandbox de habilitación)</option>
                <option value="factura">La misma cuenta de facturación electrónica de esta empresa</option>
                <option value="otra_empresa">La cuenta de nómina de otra empresa (misma razón social)</option>
              </select></label>
            <div id="c-propia">
              <label><span>Ambiente</span><select name="base_url" id="c-url">
                <option value="https://api-sandbox.factus.com.co">Sandbox (pruebas de habilitación)</option>
                <option value="https://api.factus.com.co">Producción</option></select></label>
              <div class="row"><label><span>Client ID</span><input name="client_id" autocomplete="off" /></label>
                <label><span>Client secret</span><input name="client_secret" type="password" autocomplete="new-password" placeholder="(sin cambios)" /></label></div>
              <div class="row"><label><span>Usuario (correo)</span><input name="email" autocomplete="off" /></label>
                <label><span>Contraseña</span><input name="password" type="password" autocomplete="new-password" placeholder="(sin cambios)" /></label></div>
            </div>
            <label id="c-otra" hidden><span>Usar la cuenta de</span><select name="usar_empresa_id" id="c-otra-empresa"></select></label>
            <div id="c-rangos-ids" class="row">
              <label><span>Rango de nómina (id)</span><input name="numbering_range_id_nomina" placeholder="Solo si hay varios" /></label>
              <label><span>Rango de notas de ajuste (id)</span><input name="numbering_range_id_ajuste" placeholder="Solo si hay varios" /></label>
            </div>
            <div class="row">
              <button type="submit" class="btn-primary">Guardar</button>
              <button type="button" class="btn-secondary" id="btn-probar">Probar conexión</button>
            </div>
          </form>
        </div>
        <div class="card">
          <h2>Rangos de numeración de nómina</h2>
          <div id="c-rangos"><p class="muted">Pulsa "Probar conexión" para ver los rangos de la cuenta.</p></div>
        </div>
      </div>
    </section>` : ''}
  `;

  const q = (s) => root.querySelector(s);
  const tabs = root.querySelectorAll('.tabs button[data-tab]');
  function activarTab(t) {
    tab = t;
    tabs.forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
    root.querySelectorAll('section[data-panel]').forEach((s) => { s.hidden = s.dataset.panel !== t; });
    if (t === 'trabajadores') cargarEmpleados();
    if (t === 'cuenta') cargarCuenta();
  }
  tabs.forEach((b) => b.addEventListener('click', () => activarTab(b.dataset.tab)));

  // ================================================================ liquidar
  let empleados = [];
  let parametros = await api(`/nomina/parametros?anio=${hoyD.getFullYear()}`);
  const selEmp = q('#n-empleado');
  const empleadoActual = () => empleados.find((e) => e.id === selEmp.value);
  let pago = null;

  async function cargarSelectorEmpleados() {
    empleados = await api('/nomina/empleados?activos=true');
    const previo = selEmp.value;
    selEmp.innerHTML = empleados.length
      ? opciones(empleados, { vacio: 'Selecciona…', grupo: 'empresa', texto: (e) => `${e.nombre} · ${cop(e.salario)}`, seleccionado: previo })
      : '<option value="">— registra los trabajadores en la pestaña Trabajadores —</option>';
  }

  // Editor de renglones de novedades.
  const fechaInput = (k, ph = '') => `<input type="date" data-k="${k}" title="${ph}" />`;
  const PLANTILLAS = {
    horas: () => `<select data-k="tipo">${parametros.tipos_hora.map((t) => `<option value="${t.codigo}">${esc(t.nombre)} (${t.porcentaje}%)</option>`).join('')}</select>
      <input type="number" data-k="cantidad" min="0.5" step="0.5" placeholder="Horas" required /><input type="date" data-k="fecha" title="Día (opcional)" />`,
    vacaciones: () => `<select data-k="tipo"><option value="1">Vacaciones disfrutadas</option><option value="2">Vacaciones compensadas en dinero</option></select>
      <input type="number" data-k="dias" min="1" placeholder="Días" required />${fechaInput('desde', 'Desde')}${fechaInput('hasta', 'Hasta')}`,
    licencias: () => `<select data-k="tipo"><option value="1">Maternidad o paternidad</option><option value="2">Remunerada (luto, calamidad…)</option><option value="3">No remunerada</option></select>
      <input type="number" data-k="dias" min="1" placeholder="Días" required />${fechaInput('desde', 'Desde')}${fechaInput('hasta', 'Hasta')}`,
    incapacidades: () => `<select data-k="tipo"><option value="1">Enfermedad general (66,67%)</option><option value="3">Accidente de trabajo (100%)</option><option value="2">Enfermedad profesional (100%)</option></select>
      <input type="number" data-k="dias" min="1" placeholder="Días" required />${fechaInput('desde', 'Desde')}${fechaInput('hasta', 'Hasta')}`,
    otros: () => `<select data-k="tipo"><option value="comision">Comisión</option><option value="boni_s">Bonificación salarial</option><option value="boni_n">Bonificación no salarial</option>
      <option value="auxi_n">Auxilio no salarial</option><option value="auxi_s">Auxilio salarial</option><option value="otro_n">Otro pago no salarial</option></select>
      <input type="number" data-k="valor" min="1" placeholder="Valor" required /><input data-k="descripcion" placeholder="Detalle (opcional)" />`,
    deducciones: () => `<select data-k="tipo"><option value="libranza">Libranza / crédito</option><option value="anticipo">Anticipo de nómina</option><option value="otra">Otra deducción</option></select>
      <input type="number" data-k="valor" min="1" placeholder="Valor" required /><input data-k="descripcion" placeholder="Entidad o detalle" />`,
  };
  function agregar(tipo) {
    const div = document.createElement('div');
    div.className = 'linea';
    div.innerHTML = `${PLANTILLAS[tipo]()}<button type="button" class="btn-icon" title="Quitar">✕</button>`;
    div.querySelector('.btn-icon').onclick = () => { div.remove(); previsualizar(); };
    q(`#nv-${tipo}`).appendChild(div);
    div.querySelector('input, select').focus();
  }
  root.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => agregar(b.dataset.add)));
  const leer = (tipo) => [...q(`#nv-${tipo}`).querySelectorAll('.linea')].map((l) => Object.fromEntries([...l.querySelectorAll('[data-k]')].map((i) => [i.dataset.k, i.value])));

  function novedades() {
    const num = (v) => (v === '' || v == null ? undefined : Number(v));
    const conFechas = (x) => ({ tipo: Number(x.tipo), dias: num(x.dias), desde: x.desde || undefined, hasta: x.hasta || undefined });
    const n = {
      horas: leer('horas').filter((h) => num(h.cantidad) > 0).map((h) => ({ tipo: Number(h.tipo), cantidad: num(h.cantidad), fecha: h.fecha || undefined })),
      vacaciones: leer('vacaciones').filter((x) => num(x.dias) > 0).map(conFechas),
      licencias: leer('licencias').filter((x) => num(x.dias) > 0).map(conFechas),
      incapacidades: leer('incapacidades').filter((x) => num(x.dias) > 0).map(conFechas),
      comisiones: [], bonificaciones: [], auxilios: [], otros: [],
      deducciones: { libranzas: [], anticipos: [], otras: [] },
    };
    for (const o of leer('otros').filter((x) => num(x.valor) > 0)) {
      const v = num(o.valor);
      if (o.tipo === 'comision') n.comisiones.push({ valor: v });
      else if (o.tipo.startsWith('boni')) n.bonificaciones.push({ valor: v, salarial: o.tipo === 'boni_s' });
      else if (o.tipo.startsWith('auxi')) n.auxilios.push({ valor: v, salarial: o.tipo === 'auxi_s' });
      else n.otros.push({ valor: v, salarial: false, descripcion: o.descripcion || 'Otro pago' });
    }
    for (const d of leer('deducciones').filter((x) => num(x.valor) > 0)) {
      if (d.tipo === 'libranza') n.deducciones.libranzas.push({ valor: num(d.valor), descripcion: d.descripcion || 'Libranza' });
      else if (d.tipo === 'anticipo') n.deducciones.anticipos.push({ valor: num(d.valor) });
      else n.deducciones.otras.push({ valor: num(d.valor), descripcion: d.descripcion || 'Otra deducción' });
    }
    if (q('#nv-retencion').value !== '') n.deducciones.retencion = num(q('#nv-retencion').value);
    if (q('#nv-prima').checked) n.prima = { dias: num(q('#nv-prima-dias').value) };
    if (q('#nv-cesantias').checked) n.cesantias = { dias: num(q('#nv-cesantias-dias').value), valor: num(q('#nv-cesantias-valor').value), intereses: q('#nv-intereses').checked };
    return n;
  }

  const entrada = () => {
    const e = empleadoActual();
    const periodo = e?.periodo_pago || '5';
    return { empleado_id: selEmp.value, anio: Number(q('#n-anio').value), mes: Number(q('#n-mes').value), periodo, quincena: periodo === '4' ? q('#n-quincena').value : undefined, novedades: novedades() };
  };

  let timer;
  function previsualizar() {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const box = q('#n-preview');
      if (!selEmp.value) { box.innerHTML = '<p class="muted">Elige un trabajador para ver la liquidación.</p>'; return; }
      try {
        const L = await api('/nomina/previsualizar', { method: 'POST', body: entrada() });
        const fila = (d, signo = '') => `<div><span>${esc(d.nombre)}${d.cantidad ? ` · ${d.cantidad}${d.clave === 'hora' ? ' h' : ' d'}` : ''}${d.porcentaje && d.clave !== 'hora' ? ` · ${d.porcentaje}%` : ''}</span><b>${signo}${cop(d.valor)}</b></div>`;
        box.innerHTML = html`
          <div><span>Días trabajados</span><b>${L.dias_trabajados}</b></div>
          ${L.devengados.map((d) => fila(d)).join('')}
          <div><span><b>Total devengado</b></span><b>${cop(L.total_devengado)}</b></div>
          ${L.deducciones.map((d) => fila(d, '−')).join('')}
          <div class="total"><span>Neto a pagar</span><b>${cop(L.neto)}</b></div>
          <div><span class="muted">IBC ${cop(L.ibc)} · aportes empresa ${cop(Object.values(L.aportes).reduce((a, b) => a + b, 0))}</span></div>`;
      } catch (err) {
        box.innerHTML = `<p class="error">${esc(err.message)}</p>`;
      }
    }, 250);
  }

  async function alCambiarEmpleado() {
    const e = empleadoActual();
    q('#n-quincena-label').hidden = e?.periodo_pago !== '4';
    if (e) {
      pago = await selectorPago(q('#n-pago'), { empresa: () => empleadoActual()?.empresa_id, sentido: 'egreso', medioInicial: e.medio_pago === 'consignacion' ? 'consignacion' : e.medio_pago });
    }
    previsualizar();
  }
  selEmp.addEventListener('change', alCambiarEmpleado);
  q('#n-anio').addEventListener('change', async () => { parametros = await api(`/nomina/parametros?anio=${q('#n-anio').value}`); previsualizar(); });
  q('#form-nomina').addEventListener('input', (e) => { if (e.target !== selEmp) previsualizar(); });
  q('#form-nomina').addEventListener('change', (e) => { if (e.target !== selEmp) previsualizar(); });

  alEnviar(q('#form-nomina'), async () => {
    if (!selEmp.value) throw new Error('Elige el trabajador');
    const d = datosForm(q('#form-nomina'));
    const p = pago?.leer() || {};
    const r = await api('/nomina', { method: 'POST', body: { ...entrada(), fecha_pago: d.fecha_pago, observacion: d.observacion || undefined, medio_pago: p.medio_pago, cuenta_pago_id: p.cuenta_pago_id } });
    const dn = r.dian;
    if (dn?.estado === 'aceptada') toast(`Nómina ${dn.numero} aceptada por la DIAN`, 'ok');
    else if (dn?.estado === 'sin_configurar') toast('Nómina guardada. Falta configurar la cuenta de Factus para enviarla a la DIAN', '');
    else toast(`Nómina guardada, pero la DIAN no la aceptó: ${dn?.mensaje || dn?.estado}`, 'error');
    for (const t of Object.keys(PLANTILLAS)) q(`#nv-${t}`).innerHTML = '';
    ['#nv-prima', '#nv-cesantias'].forEach((s) => { q(s).checked = false; });
    ['#nv-prima-dias', '#nv-cesantias-dias', '#nv-cesantias-valor', '#nv-retencion'].forEach((s) => { q(s).value = ''; });
    await cargarNominas();
    verDetalle(r.id);
    previsualizar();
  });

  // ------------------------------------------------------------ listado
  async function cargarNominas() {
    const anio = q('#f-anio').value;
    const mes = q('#f-mes').value;
    const filas = await api(`/nomina?${new URLSearchParams({ ...(anio ? { anio } : {}), ...(mes ? { mes } : {}) })}`);
    q('#lista-nominas').innerHTML = tabla({
      columnas: [
        { titulo: 'Periodo', render: (n) => `${esc(MESES[n.mes - 1].slice(0, 3))} ${n.anio}${n.quincena ? ` · Q${n.quincena === '2nd' ? 2 : 1}` : ''}` },
        { titulo: 'Trabajador', render: (n) => `${esc(n.empleado)}<br><span class="muted">${esc(n.empresa)}</span>` },
        { titulo: 'Devengado', num: true, render: (n) => cop(n.total_devengado) },
        { titulo: 'Deducciones', num: true, render: (n) => cop(n.total_deducciones) },
        { titulo: 'Neto', num: true, render: (n) => `<b>${cop(n.neto)}</b>` },
        { titulo: 'DIAN', render: (n) => `${n.numero ? `<span class="mono">${esc(n.numero)}</span> ` : ''}${badge(n.estado_dian, ESTADO[n.estado_dian] || '')}${n.ajuste_numero ? `<br><span class="muted">Ajuste ${esc(n.ajuste_numero)}</span>` : ''}` },
        columnaAnular('nomina', (n) => `la nómina de ${n.empleado} (${periodoTxt(n)})`),
      ],
      filas,
      vacio: 'No hay nóminas en este periodo.',
      filaAttrs: (n) => `class="clickable${claseAnulado(n)}" data-id="${n.id}"`,
    });
    return filas;
  }
  ['#f-anio', '#f-mes'].forEach((s) => q(s).addEventListener('change', cargarNominas));
  q('#lista-nominas').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) verDetalle(tr.dataset.id); });
  activarAnulaciones(q('#lista-nominas'), async () => { await cargarNominas(); q('#card-detalle').hidden = true; });
  activarAnulaciones(q('#detalle'), async () => { await cargarNominas(); q('#card-detalle').hidden = true; });

  q('#btn-excel').addEventListener('click', async () => {
    const filas = await cargarNominas();
    descargarExcel({
      nombreArchivo: `nomina_${q('#f-anio').value}${q('#f-mes').value ? `-${String(q('#f-mes').value).padStart(2, '0')}` : ''}.xlsx`, hoja: 'Nómina',
      columnas: [
        { titulo: 'Año', campo: 'anio', ancho: 6 }, { titulo: 'Mes', campo: 'mes', ancho: 5 }, { titulo: 'Quincena', campo: 'quincena', ancho: 9 },
        { titulo: 'Empresa', campo: 'empresa' }, { titulo: 'Trabajador', campo: 'empleado', ancho: 28 }, { titulo: 'Documento', campo: 'documento' },
        { titulo: 'Devengado', valor: (n) => Number(n.total_devengado) }, { titulo: 'Deducciones', valor: (n) => Number(n.total_deducciones) },
        { titulo: 'Neto', valor: (n) => Number(n.neto) }, { titulo: 'Número DIAN', campo: 'numero' }, { titulo: 'Estado DIAN', campo: 'estado_dian' },
        { titulo: 'Estado', campo: 'estado' },
      ],
      filas,
    });
  });

  async function verDetalle(id) {
    const n = await api(`/nomina/${id}`);
    const L = n.liquidacion;
    const e = n.empleado_snapshot;
    q('#card-detalle').hidden = false;
    q('#titulo-detalle').textContent = `${e.primer_nombre} ${e.primer_apellido} · ${periodoTxt(n)}`;
    const lineas = (arr) => arr.map((d) => `<tr><td>${esc(d.nombre)}${d.cantidad ? ` <span class="muted">(${d.cantidad}${d.clave === 'hora' ? ' h' : ' d'}${d.porcentaje ? ` · ${d.porcentaje}%` : ''})</span>` : ''}</td><td class="v">${cop(d.valor)}</td></tr>`).join('');
    q('#detalle').innerHTML = html`
      <p class="muted">${esc(n.empresa)} · C.C. ${esc(e.numero_documento)} · ${esc(e.cargo || '')} · Salario ${cop(e.salario)} · ${L.dias_trabajados} días · Pago ${esc(dia(String(n.fecha_pago).slice(0, 10)))} (${esc(n.medio_pago)}${n.cuenta_pago ? ` · ${esc(n.cuenta_pago)}` : ''})</p>
      <p>DIAN: ${n.numero ? `<span class="mono">${esc(n.numero)}</span> ` : ''}${badge(n.estado_dian, ESTADO[n.estado_dian] || '')}
        ${n.estado === 'anulado' ? ` · ${badge('Anulada', 'danger')} ${n.ajuste_numero ? `con nota de ajuste <span class="mono">${esc(n.ajuste_numero)}</span>` : ''}` : ''}</p>
      ${n.cune ? `<p class="muted">CUNE: <span class="mono" style="word-break:break-all">${esc(n.cune)}</span></p>` : ''}
      ${n.dian_mensaje ? `<p class="${n.estado_dian === 'aceptada' ? 'muted' : 'error'}">${esc(n.dian_mensaje)}</p>` : ''}
      ${n.motivo_anulacion ? `<p class="muted">Motivo de anulación: ${esc(n.motivo_anulacion)}</p>` : ''}
      <table class="informe">
        <tr class="sub"><td>Devengados</td><td></td></tr>${lineas(L.devengados)}
        <tr class="tot"><td>Total devengado</td><td class="v">${cop(L.total_devengado)}</td></tr>
        <tr class="sub"><td>Deducciones</td><td></td></tr>${lineas(L.deducciones)}
        <tr class="tot"><td>Total deducciones</td><td class="v">${cop(L.total_deducciones)}</td></tr>
        <tr class="tot"><td>Neto pagado</td><td class="v">${cop(L.neto)}</td></tr>
      </table>
      <p class="row" style="gap:8px;margin-top:12px">
        ${n.cune ? `<button type="button" class="btn-primary" data-pdf="${n.id}">Ver / imprimir PDF</button>` : ''}
        ${!n.cune && n.estado !== 'anulado' ? `<button type="button" class="btn-secondary" data-reenviar="${n.id}">Enviar a la DIAN</button>` : ''}
        ${n.estado !== 'anulado' ? columnaAnular('nomina', () => `la nómina de ${e.primer_nombre} ${e.primer_apellido} (${periodoTxt(n)})`).render(n) : ''}
      </p>`;
  }
  q('#detalle').addEventListener('click', async (ev) => {
    const pdf = ev.target.closest('[data-pdf]');
    const re = ev.target.closest('[data-reenviar]');
    if (pdf) {
      const ventana = window.open('', '_blank');
      if (ventana) ventana.document.write('<p style="font-family:sans-serif">Cargando la nómina…</p>');
      try {
        const url = URL.createObjectURL(await apiArchivo(`/nomina/${pdf.dataset.pdf}/pdf`));
        if (ventana) ventana.location = url; else window.location = url;
      } catch (err) { if (ventana) ventana.close(); toast(err.message, 'error'); }
    }
    if (re) {
      re.disabled = true;
      try {
        const r = await api(`/nomina/${re.dataset.reenviar}/dian`, { method: 'POST' });
        toast(r.estado === 'aceptada' ? `Nómina ${r.numero} aceptada por la DIAN` : `DIAN: ${r.mensaje || r.estado}`, r.estado === 'aceptada' ? 'ok' : 'error');
      } catch (err) { toast(err.message, 'error'); }
      await cargarNominas();
      verDetalle(re.dataset.reenviar);
    }
  });

  // ================================================================ trabajadores
  const formEmp = q('#form-empleado');
  let editando = null;
  function pintarFormEmpleado(e = {}) {
    editando = e.id || null;
    q('#titulo-emp').textContent = editando ? `Editar · ${e.primer_nombre} ${e.primer_apellido}` : 'Nuevo trabajador';
    const v = (k, d = '') => esc(e[k] ?? d);
    const f = (k) => (e[k] ? String(e[k]).slice(0, 10) : '');
    formEmp.innerHTML = html`
      <label><span>Empresa / centro de costo</span><select name="empresa_id" required>${opciones(empresas, { seleccionado: e.empresa_id })}</select></label>
      <div class="row">
        <label><span>Tipo de documento</span><select name="tipo_documento">${sel(TIPO_DOC, e.tipo_documento || '13')}</select></label>
        <label><span>Número</span><input name="numero_documento" required value="${v('numero_documento')}" /></label>
      </div>
      <div class="row"><label><span>Primer nombre</span><input name="primer_nombre" required value="${v('primer_nombre')}" /></label>
        <label><span>Otros nombres</span><input name="otros_nombres" value="${v('otros_nombres')}" /></label></div>
      <div class="row"><label><span>Primer apellido</span><input name="primer_apellido" required value="${v('primer_apellido')}" /></label>
        <label><span>Segundo apellido</span><input name="segundo_apellido" value="${v('segundo_apellido')}" /></label></div>
      <div class="row"><label><span>Dirección</span><input name="direccion" required value="${v('direccion')}" /></label>
        <label class="w-sm"><span>Municipio DANE</span><input name="municipio_codigo" pattern="\\d{5}" required value="${v('municipio_codigo', '05887')}" title="05887 Yarumal, 05001 Medellín" /></label></div>
      <div class="row"><label><span>Celular</span><input name="telefono" value="${v('telefono')}" /></label>
        <label><span>Correo</span><input type="email" name="email" value="${v('email')}" /></label></div>
      <div class="row"><label><span>Cargo</span><input name="cargo" value="${v('cargo')}" /></label>
        <label class="w-sm"><span>Código</span><input name="codigo" value="${v('codigo')}" placeholder="Interno" /></label></div>
      <div class="row"><label><span>Salario mensual</span><input type="number" name="salario" min="1" required value="${v('salario', parametros.smmlv)}" /></label>
        <label><span>Se paga</span><select name="periodo_pago"><option value="5"${e.periodo_pago !== '4' ? ' selected' : ''}>Mensual</option><option value="4"${e.periodo_pago === '4' ? ' selected' : ''}>Quincenal</option></select></label></div>
      <div class="row"><label><span>Contrato</span><select name="tipo_contrato">${sel(TIPO_CONTRATO, e.tipo_contrato || '2')}</select></label>
        <label><span>Tipo de trabajador</span><select name="tipo_trabajador">${sel(TIPO_TRABAJADOR, e.tipo_trabajador || '01')}</select></label></div>
      <div class="row"><label><span>Fecha de ingreso</span><input type="date" name="fecha_ingreso" required value="${f('fecha_ingreso')}" /></label>
        <label><span>Fecha de retiro</span><input type="date" name="fecha_retiro" value="${f('fecha_retiro')}" /></label></div>
      <div class="row"><label><span>Riesgo ARL</span><select name="clase_riesgo_arl">${[1, 2, 3, 4, 5].map((c) => `<option value="${c}"${Number(e.clase_riesgo_arl || 1) === c ? ' selected' : ''}>Clase ${c}</option>`).join('')}</select></label>
        <label class="chk"><input type="checkbox" name="salario_integral"${e.salario_integral ? ' checked' : ''} /> Salario integral</label>
        <label class="chk"><input type="checkbox" name="alto_riesgo"${e.alto_riesgo ? ' checked' : ''} /> Alto riesgo (pensión)</label></div>
      <div class="row"><label><span>Medio de pago</span><select name="medio_pago">${sel(MEDIOS, e.medio_pago || 'transferencia')}</select></label>
        <label><span>Banco</span><input name="banco" value="${v('banco')}" placeholder="Bancolombia, Nequi…" /></label></div>
      <div class="row"><label><span>Tipo de cuenta</span><select name="tipo_cuenta">${sel(TIPO_CUENTA, e.tipo_cuenta || '2')}</select></label>
        <label><span>Número de cuenta</span><input name="numero_cuenta" value="${v('numero_cuenta')}" /></label></div>
      ${editando ? `<label class="chk"><input type="checkbox" name="activo"${e.activo !== false ? ' checked' : ''} /> Activo</label>` : ''}
      <div class="row"><button type="submit" class="btn-primary">${editando ? 'Guardar cambios' : 'Registrar trabajador'}</button>
        ${editando ? '<button type="button" class="btn-secondary" id="btn-cancelar-emp">Cancelar</button>' : ''}</div>`;
    formEmp.querySelector('#btn-cancelar-emp')?.addEventListener('click', () => pintarFormEmpleado());
  }
  alEnviar(formEmp, async () => {
    const d = datosForm(formEmp);
    for (const k of ['salario_integral', 'alto_riesgo']) d[k] = formEmp.querySelector(`[name=${k}]`).checked;
    if (editando) d.activo = formEmp.querySelector('[name=activo]').checked;
    await api(editando ? `/nomina/empleados/${editando}` : '/nomina/empleados', { method: editando ? 'PATCH' : 'POST', body: d });
    toast(editando ? 'Trabajador actualizado' : 'Trabajador registrado', 'ok');
    pintarFormEmpleado();
    await Promise.all([cargarEmpleados(), cargarSelectorEmpleados()]);
  });

  let listaEmpleados = [];
  async function cargarEmpleados() {
    const emp = q('#f-emp-empresa').value;
    listaEmpleados = await api(`/nomina/empleados${emp ? `?empresa_id=${emp}` : ''}`);
    q('#lista-empleados').innerHTML = tabla({
      columnas: [
        { titulo: 'Trabajador', render: (e) => `${esc(e.nombre)}<br><span class="muted">${esc(e.cargo || '')}</span>` },
        { titulo: 'Documento', campo: 'numero_documento' },
        { titulo: 'Empresa', campo: 'empresa' },
        { titulo: 'Salario', num: true, render: (e) => cop(e.salario) },
        { titulo: 'Pago', render: (e) => (e.periodo_pago === '4' ? 'Quincenal' : 'Mensual') },
        { titulo: 'Ingreso', render: (e) => dia(String(e.fecha_ingreso).slice(0, 10)) },
        { titulo: '', render: (e) => (e.activo ? '' : badge('Inactivo', '')) },
      ],
      filas: listaEmpleados,
      vacio: 'Todavía no hay trabajadores registrados.',
      filaAttrs: (e) => `class="clickable" data-id="${e.id}"`,
    });
  }
  q('#f-emp-empresa').addEventListener('change', cargarEmpleados);
  q('#lista-empleados').addEventListener('click', (ev) => {
    const tr = ev.target.closest('tr[data-id]');
    if (tr && admin) pintarFormEmpleado(listaEmpleados.find((e) => e.id === tr.dataset.id));
  });
  pintarFormEmpleado();

  // ================================================================ cuenta DIAN
  async function cargarCuenta() {
    if (!admin) return;
    const empId = q('#c-empresa').value;
    q('#c-otra-empresa').innerHTML = opciones(empresas.filter((e) => e.id !== empId));
    const r = await api(`/nomina/config/${empId}`);
    const c = r.config || {};
    const form = q('#form-cuenta');
    q('#c-modo').value = c.usar_empresa_id ? 'otra_empresa' : c.misma_cuenta_factura ? 'factura' : 'propia';
    if (c.usar_empresa_id) q('#c-otra-empresa').value = c.usar_empresa_id;
    q('#c-url').value = c.base_url || 'https://api-sandbox.factus.com.co';
    form.client_id.value = c.client_id || '';
    form.email.value = c.email || '';
    form.client_secret.value = ''; form.password.value = '';
    form.client_secret.placeholder = c.client_secret_guardado ? '(guardado; escribe para cambiarlo)' : '';
    form.password.placeholder = c.password_guardada ? '(guardada; escribe para cambiarla)' : '';
    form.numbering_range_id_nomina.value = c.numbering_range_id_nomina || '';
    form.numbering_range_id_ajuste.value = c.numbering_range_id_ajuste || '';
    q('#c-estado').innerHTML = r.configurada
      ? `${badge('Configurada', 'ok')} ${r.cuenta_de !== r.empresa ? `usa la cuenta de ${esc(r.cuenta_de)} · ` : ''}${/sandbox/.test(r.base_url || '') ? badge('Sandbox (pruebas)', 'warn') : badge('Producción', 'brand')}`
      : badge('Sin configurar', '');
    modo();
  }
  function modo() {
    if (!admin) return;
    const m = q('#c-modo').value;
    q('#c-propia').hidden = m !== 'propia';
    q('#c-otra').hidden = m !== 'otra_empresa';
    q('#c-rangos-ids').hidden = m === 'otra_empresa';
  }
  if (admin) {
    q('#c-empresa').addEventListener('change', cargarCuenta);
    q('#c-modo').addEventListener('change', modo);
    alEnviar(q('#form-cuenta'), async () => {
      const d = datosForm(q('#form-cuenta'));
      await api(`/nomina/config/${d.empresa_id}`, { method: 'PUT', body: d });
      toast('Cuenta de nómina guardada', 'ok');
      cargarCuenta();
    });
    q('#btn-probar').addEventListener('click', async (ev) => {
      ev.target.disabled = true;
      try {
        const r = await api(`/nomina/config/${q('#c-empresa').value}/probar`, { method: 'POST' });
        toast('Conexión con Factus correcta', 'ok');
        q('#c-rangos').innerHTML = tabla({
          columnas: [
            { titulo: 'Id', render: (x) => `<span class="mono">${esc(x.id)}</span>` },
            { titulo: 'Documento', campo: 'documento' }, { titulo: 'Prefijo', campo: 'prefijo' }, { titulo: 'Siguiente', campo: 'actual' },
            { titulo: '', render: (x) => (x.activo ? badge('Activo', 'ok') : badge('Inactivo', '')) },
            { titulo: '', render: (x) => `<button type="button" class="btn-link" data-usar="${esc(x.id)}" data-doc="${esc(x.documento)}">Usar</button>` },
          ],
          filas: r.rangos,
          vacio: 'La cuenta no tiene rangos de nómina. Factus los crea al habilitar el sandbox.',
        });
      } catch (err) { toast(err.message, 'error'); q('#c-rangos').innerHTML = `<p class="error">${esc(err.message)}</p>`; }
      ev.target.disabled = false;
    });
    q('#c-rangos').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-usar]');
      if (!b) return;
      const ajuste = /ajuste/i.test(b.dataset.doc);
      q(`#form-cuenta [name=numbering_range_id_${ajuste ? 'ajuste' : 'nomina'}]`).value = b.dataset.usar;
      toast(`Rango puesto como ${ajuste ? 'notas de ajuste' : 'nómina'}; pulsa Guardar`, '');
    });
  }

  await cargarSelectorEmpleados();
  await cargarNominas();
  activarTab(tab);
}
