// Cartera: cuentas por cobrar (clientes) y por pagar (proveedores).
import { api, catalogo } from '../api.js';
import { html, esc, cop, dia, hoy, toast, opciones, tabla, badge, datosForm, alEnviar, descargarExcel } from '../ui.js';

const MEDIOS_PAGO = ['efectivo', 'transferencia', 'tarjeta', 'otro'];

export async function vistaCartera(root, params) {
  const empresas = await catalogo('empresas');
  let tab = params?.get('tab') === 'pagar' ? 'pagar' : 'cobrar';
  let empresaId = localStorage.getItem('cartera_empresa') || empresas[0]?.id || '';
  let seleccionado = null; // tercero_id activo en el panel de la derecha

  root.innerHTML = html`
    <div class="page-head">
      <h1>Cartera</h1>
      <span class="hint">Cuentas por cobrar y por pagar propias del sistema: recibos de caja, pagos a proveedores y antigüedad de saldos.</span>
    </div>
    <div class="card">
      <div id="resumen" class="row" style="gap:20px"></div>
    </div>
    <div class="tabs">
      <button type="button" data-tab="cobrar">Por cobrar</button>
      <button type="button" data-tab="pagar">Por pagar</button>
      <div class="spacer"></div>
      <label style="flex-direction:row;align-items:center;gap:8px">
        <span class="muted">Empresa</span>
        <select id="f-empresa">${opciones(empresas, { vacio: 'Todas', seleccionado: empresaId })}</select>
      </label>
    </div>
    <div class="grid">
      <div>
        <div class="card">
          <div class="row" style="align-items:baseline">
            <h2 id="titulo-lista" style="margin:0">Clientes</h2>
            <button type="button" class="btn-link" id="btn-exportar">Descargar Excel</button>
          </div>
          <div id="lista-terceros"></div>
        </div>
      </div>
      <div>
        <div class="card" id="card-detalle" hidden>
          <h2 id="titulo-detalle">Documentos</h2>
          <div id="documentos"></div>
          <p id="aviso-empresa" class="muted" hidden>Elige una empresa arriba (no "Todas") para poder registrar recibos o pagos.</p>
          <form id="form-aplicacion">
            <div class="row">
              <label class="w-sm"><span>Fecha</span><input type="date" name="fecha" value="${hoy()}" /></label>
              <label><span>Medio de pago</span>
                <select name="medio_pago">${MEDIOS_PAGO.map((m) => `<option value="${m}">${esc(m[0].toUpperCase() + m.slice(1))}</option>`).join('')}</select>
              </label>
            </div>
            <label><span>Notas</span><input name="notas" placeholder="Opcional" /></label>
            <div id="ap-retenciones">
              <p class="muted" style="margin:6px 0 4px">¿El cliente nos practicó retenciones al pagar? (quedan como anticipo de impuestos)</p>
              <div class="row">
                <label><span>Retefuente</span><input type="number" step="1" min="0" name="retefuente" value="0" /></label>
                <label><span>ReteIVA</span><input type="number" step="1" min="0" name="reteiva" value="0" /></label>
                <label><span>ReteICA</span><input type="number" step="1" min="0" name="reteica" value="0" /></label>
              </div>
            </div>
            <p class="total" id="ap-total">Total a aplicar: $0</p>
            <button type="submit" class="btn-primary" id="btn-aplicar">Registrar recibo</button>
          </form>
        </div>
      </div>
    </div>
  `;

  const selEmpresa = root.querySelector('#f-empresa');
  const tabsEl = root.querySelector('.tabs');
  const cardDetalle = root.querySelector('#card-detalle');

  function empresaNombre(id) { return empresas.find((e) => e.id === id)?.nombre; }

  async function cargarResumen() {
    const r = await api(`/cartera/resumen${empresaId ? `?empresa_id=${empresaId}` : ''}`);
    root.querySelector('#resumen').innerHTML = html`
      <div><span class="muted">Por cobrar</span><p class="total" style="text-align:left">${cop(r.por_cobrar.saldo)}</p></div>
      <div><span class="muted">Vencido (cobrar)</span><p class="total" style="text-align:left;color:var(--danger)">${cop(r.por_cobrar.vencido)}</p></div>
      <div><span class="muted">Por pagar</span><p class="total" style="text-align:left">${cop(r.por_pagar.saldo)}</p></div>
      <div><span class="muted">Vencido (pagar)</span><p class="total" style="text-align:left;color:var(--danger)">${cop(r.por_pagar.vencido)}</p></div>
    `;
  }

  function columnasAntiguedad(entidad) {
    return [
      { titulo: entidad, campo: entidad === 'Cliente' ? 'cliente' : 'proveedor' },
      { titulo: 'Por vencer', num: true, render: (r) => cop(r.por_vencer) },
      { titulo: '1-30 días', num: true, render: (r) => cop(r.vencido_1_30) },
      { titulo: '31-60 días', num: true, render: (r) => cop(r.vencido_31_60) },
      { titulo: '61-90 días', num: true, render: (r) => cop(r.vencido_61_90) },
      { titulo: '+90 días', num: true, render: (r) => cop(r.vencido_mas_90) },
      { titulo: 'Saldo', num: true, render: (r) => cop(r.saldo) },
    ];
  }

  async function cargarLista() {
    cardDetalle.hidden = true;
    seleccionado = null;
    root.querySelector('#titulo-lista').textContent = tab === 'cobrar' ? 'Clientes' : 'Proveedores';
    const ruta = tab === 'cobrar' ? '/cartera/clientes' : '/cartera/proveedores';
    const filas = await api(`${ruta}${empresaId ? `?empresa_id=${empresaId}` : ''}`);
    root.querySelector('#lista-terceros').innerHTML = tabla({
      columnas: columnasAntiguedad(tab === 'cobrar' ? 'Cliente' : 'Proveedor'),
      filas,
      vacio: 'No hay saldos pendientes.',
      filaAttrs: (r) => `class="clickable" data-id="${esc(r.tercero_id)}" data-nombre="${esc(r.cliente || r.proveedor)}"`,
    });
  }

  async function verDocumentos(terceroId, nombre) {
    seleccionado = terceroId;
    cardDetalle.hidden = false;
    root.querySelector('#titulo-detalle').textContent = nombre;
    root.querySelector('#aviso-empresa').hidden = Boolean(empresaId);
    root.querySelector('#form-aplicacion').hidden = !empresaId;
    const ruta = tab === 'cobrar' ? `/cartera/clientes/${terceroId}/documentos` : `/cartera/proveedores/${terceroId}/documentos`;
    const docs = (await api(`${ruta}${empresaId ? `?empresa_id=${empresaId}` : ''}`)).filter((d) => Number(d.saldo) > 0);
    root.querySelector('#documentos').innerHTML = docs.length ? html`
      <table>
        <thead><tr><th></th><th>${tab === 'cobrar' ? 'Factura' : 'N° factura'}</th><th>F. factura</th><th>Vence</th><th class="num">Saldo</th><th class="num">A aplicar</th></tr></thead>
        <tbody>${docs.map((d) => `
          <tr>
            <td><input type="checkbox" data-id="${esc(d.id)}" data-saldo="${d.saldo}" checked /></td>
            <td><span class="mono">${esc(d.consecutivo || d.numero_factura_proveedor || '—')}</span>${d.clase === 'gasto' ? ` ${badge('Gasto', '')}${d.descripcion ? ` <span class="muted">${esc(d.descripcion)}</span>` : ''}` : ''}</td>
            <td>${esc(dia(d.fecha))}</td>
            <td>${esc(dia(d.fecha_vencimiento))}${d.dias_vencido > 0 ? ` <span class="error">(${d.dias_vencido}d)</span>` : ''}</td>
            <td class="num">${cop(d.saldo)}</td>
            <td class="num"><input class="w-sm" type="number" step="1" min="0" max="${d.saldo}" data-valor="${esc(d.id)}" value="${Math.round(d.saldo)}" /></td>
          </tr>`).join('')}
        </tbody>
      </table>
    ` : '<p class="empty">Sin documentos con saldo.</p>';
    root.querySelectorAll('[data-valor]').forEach((i) => i.addEventListener('input', calcularAplicar));
    root.querySelectorAll('[data-id]').forEach((c) => c.addEventListener('change', (e) => {
      const valor = root.querySelector(`[data-valor="${e.target.dataset.id}"]`);
      if (valor) valor.closest('tr').style.opacity = e.target.checked ? 1 : .4;
      calcularAplicar();
    }));
    calcularAplicar();
  }

  function calcularAplicar() {
    const total = [...root.querySelectorAll('#documentos [data-id]:checked')]
      .reduce((a, c) => a + (Number(root.querySelector(`[data-valor="${c.dataset.id}"]`)?.value) || 0), 0);
    const f = root.querySelector('#form-aplicacion');
    const ret = tab === 'cobrar' ? ['retefuente', 'reteiva', 'reteica'].reduce((a, k) => a + (Number(f.elements[k].value) || 0), 0) : 0;
    root.querySelector('#ap-total').textContent = ret
      ? `Total a aplicar: ${cop(total)} · retenciones ${cop(ret)} · dinero recibido ${cop(total - ret)}`
      : `Total a aplicar: ${cop(total)}`;
  }

  function leerAplicaciones() {
    return [...root.querySelectorAll('#documentos [data-id]:checked')]
      .map((c) => ({ id: c.dataset.id, valor: Number(root.querySelector(`[data-valor="${c.dataset.id}"]`)?.value) || 0 }))
      .filter((a) => a.valor > 0);
  }

  function activarTab(nuevo) {
    tab = nuevo;
    tabsEl.querySelectorAll('button[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    root.querySelector('#btn-aplicar').textContent = tab === 'cobrar' ? 'Registrar recibo' : 'Registrar pago';
    root.querySelector('#ap-retenciones').hidden = tab !== 'cobrar';
    cargarLista();
  }

  tabsEl.querySelectorAll('button[data-tab]').forEach((b) => b.addEventListener('click', () => activarTab(b.dataset.tab)));
  root.querySelectorAll('#ap-retenciones input').forEach((i) => i.addEventListener('input', calcularAplicar));
  selEmpresa.addEventListener('change', () => {
    empresaId = selEmpresa.value;
    localStorage.setItem('cartera_empresa', empresaId);
    cargarResumen();
    cargarLista();
  });
  root.querySelector('#lista-terceros').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (tr) verDocumentos(tr.dataset.id, tr.dataset.nombre);
  });

  root.querySelector('#btn-exportar').addEventListener('click', async () => {
    const ruta = tab === 'cobrar' ? '/cartera/clientes/documentos' : '/cartera/proveedores/documentos';
    const filas = await api(`${ruta}${empresaId ? `?empresa_id=${empresaId}` : ''}`);
    if (!filas.length) { toast('No hay documentos con saldo para exportar', ''); return; }
    descargarExcel({
      nombreArchivo: `cartera-${tab === 'cobrar' ? 'por-cobrar' : 'por-pagar'}_${hoy()}.xlsx`,
      hoja: tab === 'cobrar' ? 'Por cobrar' : 'Por pagar',
      columnas: [
        { titulo: 'Empresa', campo: 'empresa', ancho: 14 },
        { titulo: tab === 'cobrar' ? 'Cliente' : 'Proveedor', campo: tab === 'cobrar' ? 'cliente' : 'proveedor', ancho: 24 },
        { titulo: 'Documento', valor: (d) => d.consecutivo || d.numero_factura_proveedor || '', ancho: 16 },
        { titulo: 'Fecha factura', valor: (d) => dia(d.fecha), ancho: 14 },
        { titulo: 'Fecha vencimiento', valor: (d) => dia(d.fecha_vencimiento), ancho: 16 },
        { titulo: 'Días vencido', valor: (d) => Number(d.dias_vencido) || 0, ancho: 12 },
        { titulo: 'Total', valor: (d) => Number(d.total), ancho: 14 },
        { titulo: 'Saldo', valor: (d) => Number(d.saldo), ancho: 14 },
      ],
      filas,
    });
  });

  alEnviar(root.querySelector('#form-aplicacion'), async (e) => {
    if (!seleccionado) return;
    const aplicaciones = leerAplicaciones();
    if (!aplicaciones.length) throw new Error('Marca al menos un documento con un valor mayor que cero');
    if (!empresaId) throw new Error('Elige una empresa arriba (no se puede registrar con "Todas" seleccionado)');
    const d = datosForm(e.target);
    const terceroId = seleccionado === 'consumidor_final' ? null : seleccionado;
    if (tab === 'cobrar') {
      const r = await api('/cartera/recibos', {
        method: 'POST',
        body: {
          empresa_id: empresaId, tercero_id: terceroId, fecha: d.fecha, medio_pago: d.medio_pago, notas: d.notas || null,
          aplicaciones: aplicaciones.map((a) => ({ factura_venta_id: a.id, valor: a.valor })),
          retefuente: Number(d.retefuente) || 0, reteiva: Number(d.reteiva) || 0, reteica: Number(d.reteica) || 0,
        },
      });
      ['retefuente', 'reteiva', 'reteica'].forEach((k) => { e.target.elements[k].value = 0; });
      toast(`Recibo N.° ${r.consecutivo} registrado por ${cop(r.total)}${r.recibido !== r.total ? ` (entran ${cop(r.recibido)})` : ''}`, 'ok');
    } else {
      const r = await api('/cartera/pagos', {
        method: 'POST',
        body: {
          empresa_id: empresaId, tercero_id: seleccionado, fecha: d.fecha, medio_pago: d.medio_pago, notas: d.notas || null,
          aplicaciones: aplicaciones.map((a) => ({ compra_id: a.id, valor: a.valor })),
        },
      });
      toast(`Pago N.° ${r.consecutivo} registrado por ${cop(r.total)}`, 'ok');
    }
    await Promise.all([cargarResumen(), cargarLista()]);
  });

  activarTab(tab);
  await cargarResumen();
}
