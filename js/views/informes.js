// Informes: venta diaria, estado de resultados (utilidad bruta, EBITDA,
// utilidad antes de impuestos), balance general, IVA/INC a pagar, retenciones
// a pagar y libro diario. Todo sale de los asientos contables automáticos.
import { api, catalogo, session } from '../api.js';
import { html, esc, cop, dia, toast, opciones, tabla, badge, alEnviar, datosForm, descargarExcel } from '../ui.js';

const INFORMES = [
  ['venta-diaria', 'Venta diaria'],
  ['resultados', 'Estado de resultados'],
  ['balance', 'Balance general'],
  ['iva', 'IVA e INC a pagar'],
  ['retenciones', 'Retenciones a pagar'],
  ['diario', 'Libro diario'],
];

const hoyBogota = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
const inicioMes = () => `${hoyBogota().slice(0, 8)}01`;
const v = (n) => `<td class="v${Number(n) < 0 ? ' neg' : ''}">${cop(n)}</td>`;
const pct = (n) => `<td class="pct">${n === null || n === undefined ? '' : `${Number(n).toLocaleString('es-CO', { maximumFractionDigits: 1 })}%`}</td>`;

export async function vistaInformes(root, params) {
  const empresas = await catalogo('empresas');
  const esAdmin = session.usuario?.rol === 'admin';
  let actual = params?.get('informe') || localStorage.getItem('informe_actual') || 'resultados';
  let datos = null;

  root.innerHTML = html`
    <div class="page-head">
      <h1>Informes</h1>
      <span class="hint">Salen de la contabilidad automática: cada venta, compra, gasto, recibo y pago genera su asiento con cuentas del PUC.</span>
    </div>
    <div class="card">
      <div class="tabs">${INFORMES.map(([k, t]) => `<button type="button" data-informe="${k}">${t}</button>`).join('')}</div>
      <div class="row" id="filtros">
        <label><span>Empresa / centro de costo</span>
          <select id="i-empresa">${opciones(empresas, { vacio: 'Consolidado (todas)' })}</select>
        </label>
        <label class="w-fecha" id="lbl-desde"><span>Desde</span><input type="date" id="i-desde" value="${inicioMes()}" /></label>
        <label class="w-fecha"><span id="lbl-hasta">Hasta</span><input type="date" id="i-hasta" value="${hoyBogota()}" /></label>
        <button type="button" class="btn-secondary w-sm" id="btn-excel">Excel</button>
      </div>
      <div id="informe"><p class="muted">Cargando…</p></div>
    </div>
    ${esAdmin ? html`
    <div class="grid">
      <div class="card">
        <h2>Aporte de capital</h2>
        <p class="muted">Dinero que los socios ponen en la empresa (cuenta 3115). Es el punto de partida del balance.</p>
        <form id="form-aporte">
          <div class="row">
            <label><span>Empresa</span><select name="empresa_id" required>${opciones(empresas)}</select></label>
            <label class="w-sm"><span>Fecha</span><input type="date" name="fecha" value="${hoyBogota()}" /></label>
          </div>
          <div class="row">
            <label><span>Socio / detalle</span><input name="socio" placeholder="Opcional" /></label>
            <label><span>Valor</span><input type="number" name="valor" step="1" min="1" required /></label>
            <label class="w-sm"><span>Entró a</span><select name="medio"><option value="transferencia">Bancos</option><option value="efectivo">Caja</option></select></label>
          </div>
          <button type="submit" class="btn-primary">Registrar aporte</button>
        </form>
        <div id="lista-aportes"></div>
      </div>
      <div class="card">
        <h2>Contabilidad</h2>
        <p class="muted">Los asientos se generan solos con cada documento. Si se corrige un documento o se cambia una regla, "Reconstruir" los vuelve a generar todos desde los documentos (los aportes de capital se conservan).</p>
        <button type="button" class="btn-secondary" id="btn-reconstruir">Reconstruir contabilidad</button>
        <p class="muted" id="res-reconstruir"></p>
      </div>
    </div>` : ''}
  `;

  const selEmpresa = root.querySelector('#i-empresa');
  const inDesde = root.querySelector('#i-desde');
  const inHasta = root.querySelector('#i-hasta');
  const cont = root.querySelector('#informe');
  try { const e = localStorage.getItem('informe_empresa'); if (e !== null && [...selEmpresa.options].some((o) => o.value === e)) selEmpresa.value = e; } catch { /* sin storage */ }

  const q = () => `empresa_id=${selEmpresa.value}&desde=${inDesde.value}&hasta=${inHasta.value}`;
  const nombreEmpresa = () => (selEmpresa.value ? selEmpresa.options[selEmpresa.selectedIndex].textContent : 'Consolidado');

  // ----------------------------------------------------------- renderizadores
  const R = {
    async 'venta-diaria'() {
      datos = await api(`/informes/venta-diaria?${q()}`);
      const t = datos.totales;
      return html`
        <div class="kpis">
          <div><span>Ventas (con impuestos)</span><b>${cop(t.total)}</b></div>
          <div><span>Facturas</span><b>${t.facturas}</b></div>
          <div><span>Efectivo</span><b>${cop(t.efectivo)}</b></div>
          <div><span>Transferencia + tarjeta</span><b>${cop(t.transferencia + t.tarjeta)}</b></div>
          <div><span>Crédito</span><b>${cop(t.credito)}</b></div>
        </div>
        ${tabla({
          columnas: [
            { titulo: 'Día', render: (d) => dia(d.dia) },
            { titulo: 'Facturas', num: true, campo: 'facturas' },
            { titulo: 'Base', num: true, render: (d) => cop(d.base) },
            { titulo: 'IVA', num: true, render: (d) => cop(d.iva) },
            { titulo: 'INC', num: true, render: (d) => cop(d.inc) },
            { titulo: 'Total', num: true, render: (d) => `<b>${cop(d.total)}</b>` },
            { titulo: 'Efectivo', num: true, render: (d) => cop(d.efectivo) },
            { titulo: 'Transf.', num: true, render: (d) => cop(d.transferencia) },
            { titulo: 'Tarjeta', num: true, render: (d) => cop(d.tarjeta) },
            { titulo: 'Crédito', num: true, render: (d) => cop(d.credito) },
          ],
          filas: datos.dias,
          vacio: 'No hay ventas en el rango.',
        })}
        ${t.ventas_internas ? `<p class="muted">Además hubo ventas internas entre centros de costo por ${cop(t.ventas_internas)} (no incluidas arriba).</p>` : ''}`;
    },

    async resultados() {
      const d = datos = await api(`/informes/estado-resultados?${q()}`);
      const det = (ls) => ls.map((l) => `<tr class="det"><td>${esc(l.cuenta)} · ${esc(l.nombre)}</td>${v(-l.valor)}<td class="pct"></td></tr>`).join('');
      const p = (x) => (d.ventas_netas ? (x / d.ventas_netas) * 100 : null);
      return html`
        <div class="kpis">
          <div><span>Ventas netas</span><b>${cop(d.ventas_netas)}</b></div>
          <div><span>Utilidad bruta</span><b class="${d.utilidad_bruta < 0 ? 'neg' : ''}">${cop(d.utilidad_bruta)}</b></div>
          <div><span>EBITDA</span><b class="${d.ebitda < 0 ? 'neg' : ''}">${cop(d.ebitda)}</b></div>
          <div><span>Utilidad antes de impuestos</span><b class="${d.utilidad_antes_impuestos < 0 ? 'neg' : ''}">${cop(d.utilidad_antes_impuestos)}</b></div>
        </div>
        <table class="informe">
          <tr><td>Ventas</td>${v(d.ventas_brutas)}${pct(null)}</tr>
          <tr><td>(−) Devoluciones y notas crédito</td>${v(-d.devoluciones)}${pct(null)}</tr>
          <tr class="sub"><td>Ventas netas</td>${v(d.ventas_netas)}${pct(100)}</tr>
          <tr><td>(−) Costo de ventas</td>${v(-d.costo_ventas)}${pct(p(d.costo_ventas))}</tr>
          <tr class="sub"><td>Utilidad bruta</td>${v(d.utilidad_bruta)}${pct(d.margen_bruto_pct)}</tr>
          <tr><td>(−) Gastos de administración</td>${v(-d.gastos_administracion.reduce((a, l) => a + l.valor, 0))}${pct(null)}</tr>
          ${det(d.gastos_administracion)}
          <tr><td>(−) Gastos de ventas</td>${v(-d.gastos_ventas.reduce((a, l) => a + l.valor, 0))}${pct(null)}</tr>
          ${det(d.gastos_ventas)}
          <tr class="sub"><td>EBITDA (utilidad antes de depreciación, intereses e impuestos)</td>${v(d.ebitda)}${pct(d.margen_ebitda_pct)}</tr>
          <tr><td>(−) Depreciación de activos fijos</td>${v(-d.depreciacion)}${pct(null)}</tr>
          <tr class="sub"><td>Utilidad operacional</td>${v(d.utilidad_operacional)}${pct(p(d.utilidad_operacional))}</tr>
          <tr><td>(+) Otros ingresos</td>${v(d.otros_ingresos.reduce((a, l) => a + l.valor, 0))}${pct(null)}</tr>
          <tr><td>(−) Gastos financieros y no operacionales</td>${v(-d.gastos_no_operacionales.reduce((a, l) => a + l.valor, 0))}${pct(null)}</tr>
          ${det(d.gastos_no_operacionales)}
          <tr class="tot"><td>Utilidad antes de impuestos</td>${v(d.utilidad_antes_impuestos)}${pct(d.margen_neto_pct)}</tr>
        </table>
        ${d.ventas_internas_incluidas ? `<p class="muted">Incluye ventas internas entre centros de costo por ${cop(d.ventas_internas_incluidas)} (en el consolidado se compensan con el costo del centro que compra).</p>` : ''}`;
    },

    async balance() {
      const d = datos = await api(`/informes/balance?empresa_id=${selEmpresa.value}&corte=${inHasta.value}`);
      const ls = (arr) => arr.map((l) => `<tr class="det"><td>${esc(l.cuenta)} · ${esc(l.nombre)}</td>${v(l.valor)}</tr>`).join('');
      return html`
        <div class="grid">
          <table class="informe">
            <tr class="sub"><td>ACTIVO</td><td></td></tr>
            <tr><td>Activo corriente</td>${v(d.total_activo_corriente)}</tr>${ls(d.activo_corriente)}
            <tr><td>Activo no corriente (fijos, neto de depreciación)</td>${v(d.total_activo_no_corriente)}</tr>${ls(d.activo_no_corriente)}
            <tr class="tot"><td>Total activo</td>${v(d.total_activo)}</tr>
          </table>
          <table class="informe">
            <tr class="sub"><td>PASIVO</td>${v(d.total_pasivo)}</tr>${ls(d.pasivo)}
            <tr class="sub"><td>PATRIMONIO</td>${v(d.total_patrimonio)}</tr>${ls(d.patrimonio)}
            <tr class="tot"><td>Total pasivo + patrimonio</td>${v(d.total_pasivo_patrimonio)}</tr>
          </table>
        </div>
        <p>${d.diferencia === 0 ? '<span class="cuadre-ok">✓ El balance cuadra: activo = pasivo + patrimonio.</span>' : `<span class="neg">Diferencia de ${cop(d.diferencia)}: usa "Reconstruir contabilidad".</span>`}
        <span class="muted"> Corte: ${dia(d.corte)}. El IVA descontable aparece restando dentro del pasivo.</span></p>`;
    },

    async iva() {
      const d = datos = await api(`/informes/iva?${q()}`);
      return html`
        <div class="grid">
          <table class="informe">
            <tr class="sub"><td>IVA (formulario 300)</td><td></td></tr>
            <tr><td>IVA generado en ventas (neto de notas crédito)</td>${v(d.iva.generado)}</tr>
            <tr><td>(−) IVA descontable en compras y gastos</td>${v(-d.iva.descontable)}</tr>
            <tr><td>(−) Retención de IVA que nos practicaron</td>${v(-d.iva.reteiva_que_nos_practicaron)}</tr>
            <tr class="tot"><td>${d.iva.saldo_a_pagar >= 0 ? 'IVA a pagar' : 'Saldo a favor'}</td>${v(Math.abs(d.iva.saldo_a_pagar))}</tr>
          </table>
          <table class="informe">
            <tr class="sub"><td>Impuesto nacional al consumo (formulario 310)</td><td></td></tr>
            <tr class="tot"><td>INC a pagar</td>${v(d.inc.generado)}</tr>
          </table>
        </div>
        <h3 style="margin-top:16px">Ventas por tarifa</h3>
        ${tabla({
          columnas: [
            { titulo: 'Impuesto', campo: 'impuesto' },
            { titulo: 'Tarifa', num: true, render: (b) => `${b.tarifa}%` },
            { titulo: 'Base', num: true, render: (b) => cop(b.base) },
            { titulo: 'Impuesto', num: true, render: (b) => cop(b.impuesto_valor) },
          ],
          filas: d.bases_por_tarifa,
          vacio: 'Sin ventas en el periodo.',
        })}
        <p class="muted">El IVA se declara cada dos o cuatro meses según los ingresos del año anterior; el INC, cada dos meses. Elige el periodo en las fechas.</p>`;
    },

    async retenciones() {
      const d = datos = await api(`/informes/retenciones?${q()}`);
      const n = d.nos_practicaron;
      return html`
        <h3>Retenciones que practicamos (formulario 350, mensual)</h3>
        ${tabla({
          columnas: [
            { titulo: 'Concepto', campo: 'nombre' },
            { titulo: 'Documentos', num: true, campo: 'documentos' },
            { titulo: 'Base', num: true, render: (p) => cop(p.base) },
            { titulo: 'Retefuente', num: true, render: (p) => cop(p.retefuente) },
            { titulo: 'ReteIVA', num: true, render: (p) => cop(p.reteiva) },
            { titulo: 'ReteICA', num: true, render: (p) => cop(p.reteica) },
          ],
          filas: d.practicadas,
          vacio: 'No se practicaron retenciones en el periodo.',
        })}
        <div class="grid" style="margin-top:12px">
          <table class="informe">
            <tr class="sub"><td>A pagar a la DIAN (formulario 350)</td><td></td></tr>
            <tr><td>Retención en la fuente (compras y servicios)</td>${v(d.a_pagar.retefuente)}</tr>
            <tr><td>Retención en la fuente por salarios (nómina)</td>${v(d.a_pagar.salarios || 0)}</tr>
            <tr><td>Retención de IVA</td>${v(d.a_pagar.reteiva)}</tr>
            <tr class="tot"><td>Total formulario 350</td>${v(d.a_pagar.total_formulario_350)}</tr>
            <tr><td>ReteICA a pagar al municipio</td>${v(d.a_pagar.reteica)}</tr>
          </table>
          <table class="informe">
            <tr class="sub"><td>Retenciones que nos practicaron los clientes</td><td></td></tr>
            <tr><td>Retención en la fuente <span class="muted">→ se descuenta en la declaración de renta</span></td>${v(n.retefuente)}</tr>
            <tr><td>Retención de IVA <span class="muted">→ ya se restó en el informe de IVA</span></td>${v(n.reteiva)}</tr>
            <tr><td>Retención de ICA <span class="muted">→ se descuenta en la declaración de ICA</span></td>${v(n.reteica)}</tr>
            <tr class="tot"><td>Resultado neto (informativo)</td>${v(d.resultado_neto)}</tr>
          </table>
        </div>
        <p class="muted">Las retenciones que nos practicaron no se pueden restar en el formulario 350: quedan como anticipo y se descuentan en renta, IVA o ICA. El "resultado neto" sirve para ver el efecto en caja.</p>`;
    },

    async diario() {
      datos = await api(`/informes/libro-diario?${q()}`);
      const td = datos.reduce((a, l) => a + l.debito, 0); const tc = datos.reduce((a, l) => a + l.credito, 0);
      return html`
        <p class="muted">${datos.length} líneas · débitos ${cop(td)} · créditos ${cop(tc)} ${Math.abs(td - tc) < 0.01 ? badge('cuadrado', 'ok') : badge('descuadrado', 'danger')}. Descárgalo en Excel para el contador.</p>
        ${tabla({
          columnas: [
            { titulo: 'Fecha', render: (l) => dia(l.fecha) },
            { titulo: 'Documento', render: (l) => `${esc(l.descripcion || '')}${!selEmpresa.value ? `<br><span class="muted">${esc(l.empresa)}</span>` : ''}` },
            { titulo: 'Cuenta', render: (l) => `<span class="mono">${esc(l.cuenta)}</span> ${esc(l.cuenta_nombre)}` },
            { titulo: 'Tercero', render: (l) => esc(l.tercero || '') },
            { titulo: 'Débito', num: true, render: (l) => (l.debito ? cop(l.debito) : '') },
            { titulo: 'Crédito', num: true, render: (l) => (l.credito ? cop(l.credito) : '') },
          ],
          filas: datos.slice(0, 500),
          vacio: 'Sin movimientos en el rango.',
        })}
        ${datos.length > 500 ? '<p class="muted">Se muestran las primeras 500 líneas; el Excel trae todas.</p>' : ''}`;
    },
  };

  // ------------------------------------------------------------- Excel por informe
  const filas = (pares) => pares.map(([concepto, valor]) => ({ concepto, valor }));
  const EXCEL = {
    'venta-diaria': () => ({ columnas: ['dia', 'facturas', 'base', 'iva', 'inc', 'total', 'efectivo', 'transferencia', 'tarjeta', 'otro', 'credito'].map((c) => ({ titulo: c, valor: (d) => (c === 'dia' ? d.dia : d[c]) })), filas: datos.dias }),
    resultados: () => ({ columnas: [{ titulo: 'Concepto', campo: 'concepto' }, { titulo: 'Valor', campo: 'valor' }], filas: filas([
      ['Ventas', datos.ventas_brutas], ['Devoluciones', -datos.devoluciones], ['Ventas netas', datos.ventas_netas], ['Costo de ventas', -datos.costo_ventas],
      ['Utilidad bruta', datos.utilidad_bruta], ...datos.gastos_administracion.map((l) => [`${l.cuenta} ${l.nombre}`, -l.valor]),
      ...datos.gastos_ventas.map((l) => [`${l.cuenta} ${l.nombre}`, -l.valor]), ['EBITDA', datos.ebitda], ['Depreciación', -datos.depreciacion],
      ['Utilidad operacional', datos.utilidad_operacional], ...datos.otros_ingresos.map((l) => [`${l.cuenta} ${l.nombre}`, l.valor]),
      ...datos.gastos_no_operacionales.map((l) => [`${l.cuenta} ${l.nombre}`, -l.valor]), ['Utilidad antes de impuestos', datos.utilidad_antes_impuestos]]) }),
    balance: () => ({ columnas: [{ titulo: 'Cuenta', campo: 'concepto' }, { titulo: 'Valor', campo: 'valor' }], filas: filas([
      ['ACTIVO CORRIENTE', datos.total_activo_corriente], ...datos.activo_corriente.map((l) => [`${l.cuenta} ${l.nombre}`, l.valor]),
      ['ACTIVO NO CORRIENTE', datos.total_activo_no_corriente], ...datos.activo_no_corriente.map((l) => [`${l.cuenta} ${l.nombre}`, l.valor]),
      ['TOTAL ACTIVO', datos.total_activo], ['PASIVO', datos.total_pasivo], ...datos.pasivo.map((l) => [`${l.cuenta} ${l.nombre}`, l.valor]),
      ['PATRIMONIO', datos.total_patrimonio], ...datos.patrimonio.map((l) => [`${l.cuenta} ${l.nombre}`, l.valor]), ['TOTAL PASIVO + PATRIMONIO', datos.total_pasivo_patrimonio]]) }),
    iva: () => ({ columnas: [{ titulo: 'Concepto', campo: 'concepto' }, { titulo: 'Valor', campo: 'valor' }], filas: filas([
      ['IVA generado', datos.iva.generado], ['IVA descontable', -datos.iva.descontable], ['ReteIVA que nos practicaron', -datos.iva.reteiva_que_nos_practicaron],
      ['IVA a pagar (saldo a favor si es negativo)', datos.iva.saldo_a_pagar], ['INC a pagar', datos.inc.generado],
      ...datos.bases_por_tarifa.map((b) => [`Base ${b.impuesto} ${b.tarifa}%`, b.base])]) }),
    retenciones: () => ({ columnas: ['nombre', 'documentos', 'base', 'retefuente', 'reteiva', 'reteica'].map((c) => ({ titulo: c, campo: c })), filas: datos.practicadas }),
    diario: () => ({ columnas: ['fecha', 'empresa', 'descripcion', 'cuenta', 'cuenta_nombre', 'tercero_documento', 'tercero', 'detalle', 'debito', 'credito'].map((c) => ({ titulo: c, campo: c })), filas: datos }),
  };

  async function mostrar() {
    root.querySelectorAll('[data-informe]').forEach((b) => b.classList.toggle('active', b.dataset.informe === actual));
    root.querySelector('#lbl-desde').hidden = actual === 'balance';
    root.querySelector('#lbl-hasta').textContent = actual === 'balance' ? 'Corte' : 'Hasta';
    try { localStorage.setItem('informe_actual', actual); localStorage.setItem('informe_empresa', selEmpresa.value); } catch { /* sin storage */ }
    cont.innerHTML = '<p class="muted">Calculando…</p>';
    try {
      cont.innerHTML = await R[actual]();
    } catch (err) {
      cont.innerHTML = `<p class="error">${esc(err.message)}</p>`;
    }
  }

  root.querySelectorAll('[data-informe]').forEach((b) => b.addEventListener('click', () => { actual = b.dataset.informe; mostrar(); }));
  [selEmpresa, inDesde, inHasta].forEach((el) => el.addEventListener('change', mostrar));
  root.querySelector('#btn-excel').addEventListener('click', () => {
    if (!datos) return;
    const titulo = INFORMES.find(([k]) => k === actual)[1];
    const { columnas, filas: fs } = EXCEL[actual]();
    descargarExcel({ nombreArchivo: `${titulo} - ${nombreEmpresa()} - ${actual === 'balance' ? inHasta.value : `${inDesde.value} a ${inHasta.value}`}.xlsx`, hoja: titulo.slice(0, 30), columnas, filas: fs });
  });

  if (esAdmin) {
    const cargarAportes = async () => {
      const as = await api('/informes/asientos-manuales');
      root.querySelector('#lista-aportes').innerHTML = as.length ? tabla({
        columnas: [
          { titulo: 'Fecha', render: (a) => dia(a.fecha) },
          { titulo: 'Empresa', campo: 'empresa' },
          { titulo: 'Detalle', campo: 'descripcion' },
          { titulo: 'Valor', num: true, render: (a) => cop(a.valor) },
        ],
        filas: as,
      }) : '';
    };
    alEnviar(root.querySelector('#form-aporte'), async (e) => {
      await api('/informes/aporte-capital', { method: 'POST', body: datosForm(e.target) });
      toast('Aporte de capital registrado', 'ok');
      e.target.elements.valor.value = '';
      await Promise.all([cargarAportes(), mostrar()]);
    });
    root.querySelector('#btn-reconstruir').addEventListener('click', async (e) => {
      e.target.disabled = true;
      try {
        const r = await api('/informes/reconstruir', { method: 'POST' });
        root.querySelector('#res-reconstruir').textContent = `Listo: ${r.factura_venta} facturas, ${r.compra} compras y gastos, ${r.recibo_caja} recibos, ${r.pago_proveedor} pagos, ${r.nota_credito} notas crédito, ${r.traslado} traslados, ${r.depreciaciones} depreciaciones. Débitos ${cop(r.debitos)} = créditos ${cop(r.creditos)}.`;
        await mostrar();
      } catch (err) { toast(err.message, 'error'); } finally { e.target.disabled = false; }
    });
    cargarAportes();
  }

  await mostrar();
}
