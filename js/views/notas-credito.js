// Notas crédito sobre facturas de venta y anulación de facturas ya emitidas.
import { api, apiArchivo, catalogo } from '../api.js';
import { html, esc, num, cop, fecha, toast, opciones, tabla, badge, datosForm, alEnviar } from '../ui.js';

const RAZONES = {
  1: 'Devolución parcial',
  3: 'Rebaja o descuento',
  4: 'Ajuste de precio',
  5: 'Descuento pronto pago',
  6: 'Descuento por volumen',
};
const ESTADO = { pendiente: 'warn', enviada: 'warn', aceptada: 'ok', rechazada: 'danger', error: 'danger', sin_configurar: '', no_aplica: '' };

export async function vistaNotasCredito(root, params) {
  const empresas = await catalogo('empresas');
  const facturaInicial = params?.get('factura') || '';
  const facturas = (await api('/ventas')).filter((f) => f.estado === 'vigente');

  root.innerHTML = html`
    <div class="page-head">
      <h1>Notas crédito</h1>
      <span class="hint">Devolución, rebaja, ajuste de precio o descuento sobre una factura; o anulación completa de una factura ya emitida.</span>
    </div>
    <div class="grid">
      <div>
        <div class="card">
          <h2>Nueva nota crédito</h2>
          <form id="form-buscar">
            <label><span>Factura</span>
              <select id="nc-factura" required>${opciones(facturas, { valor: 'id', vacio: 'Selecciona una factura…', texto: (f) => `${f.consecutivo || '—'} · ${f.cliente || 'Consumidor final'} · saldo ${cop(f.saldo)}`, seleccionado: facturaInicial })}</select>
            </label>
          </form>
          <div id="detalle-factura"></div>
        </div>
      </div>
      <div>
        <div class="card">
          <h2>Notas crédito registradas</h2>
          <label style="flex-direction:row;align-items:center;gap:8px;max-width:260px">
            <span class="muted">Empresa</span>
            <select id="f-empresa">${opciones(empresas, { vacio: 'Todas' })}</select>
          </label>
          <div id="lista-nc"></div>
        </div>
        <div class="card" id="card-nc" hidden>
          <h2 id="titulo-nc">Nota crédito</h2>
          <div id="detalle-nc"></div>
        </div>
      </div>
    </div>
  `;

  const selFactura = root.querySelector('#nc-factura');
  const detalleEl = root.querySelector('#detalle-factura');
  const selEmpresaLista = root.querySelector('#f-empresa');

  async function cargarLista() {
    const filas = await api(`/notas-credito${selEmpresaLista.value ? `?empresa_id=${selEmpresaLista.value}` : ''}`);
    root.querySelector('#lista-nc').innerHTML = tabla({
      columnas: [
        { titulo: 'Nota', render: (n) => `<span class="mono">${esc(n.consecutivo)}</span>` },
        { titulo: 'Fecha', render: (n) => fecha(n.fecha) },
        { titulo: 'Factura', render: (n) => `<span class="mono">${esc(n.factura)}</span>` },
        { titulo: 'Cliente', campo: 'cliente' },
        { titulo: 'Razón', campo: 'razon_texto' },
        { titulo: 'Total', num: true, render: (n) => cop(n.total) },
        { titulo: 'DIAN', render: (n) => badge(n.estado_dian === 'no_aplica' ? 'No aplica' : n.estado_dian, ESTADO[n.estado_dian] || '') + (n.dian_mensaje && ['error', 'rechazada'].includes(n.estado_dian) ? ` <span class="muted" title="${esc(n.dian_mensaje)}">ⓘ</span>` : '') },
      ],
      filas,
      filaAttrs: (n) => `class="clickable" data-id="${esc(n.id)}"`,
      vacio: 'Todavía no se han registrado notas crédito.',
    });
  }

  // Detalle de una nota: estado DIAN con el mensaje de error, reintento y PDF.
  async function verNota(id) {
    const card = root.querySelector('#card-nc');
    card.hidden = false;
    const n = await api(`/notas-credito/${id}`);
    root.querySelector('#titulo-nc').textContent = `Nota crédito ${n.consecutivo || ''} · factura ${n.factura || ''}`;
    const reenviable = ['pendiente', 'error', 'rechazada', 'sin_configurar'].includes(n.estado_dian);
    root.querySelector('#detalle-nc').innerHTML = html`
      <p class="muted">${esc(fecha(n.fecha))} · ${esc(n.empresa)} · ${esc(n.razon_texto || (n.razon === 2 ? 'Anulación' : ''))} · Total: ${cop(n.total)} ·
        DIAN: ${badge(n.estado_dian === 'no_aplica' ? 'No aplica' : n.estado_dian, ESTADO[n.estado_dian] || '')}</p>
      ${n.cufe ? `<p class="muted">CUFE: <span class="mono" style="word-break:break-all">${esc(n.cufe)}</span></p>` : ''}
      ${n.dian_mensaje ? `<p class="${['error', 'rechazada'].includes(n.estado_dian) ? 'error' : 'muted'}" style="word-break:break-word">${esc(n.dian_mensaje)}</p>` : ''}
      <p class="row" style="gap:8px">
        ${n.cufe ? `<button type="button" class="btn-primary" data-nc-pdf="${n.id}">Ver / imprimir PDF</button>` : ''}
        ${reenviable ? `<button type="button" class="btn-secondary" data-nc-dian="reenviar" data-id="${n.id}">Reintentar envío a la DIAN</button>` : ''}
        ${n.estado_dian === 'enviada' && !n.cufe ? `<button type="button" class="btn-secondary" data-nc-dian="estado" data-id="${n.id}">Actualizar estado</button>` : ''}
      </p>
      ${n.items?.length ? tabla({
        columnas: [
          { titulo: 'Producto', campo: 'producto' },
          { titulo: 'Cantidad', num: true, render: (l) => `${num(l.cantidad)} ${esc(l.unidad_medida || '')}` },
          { titulo: 'Precio u.', num: true, render: (l) => cop(l.precio_unitario) },
          { titulo: 'Subtotal', num: true, render: (l) => cop(Number(l.cantidad) * Number(l.precio_unitario)) },
        ],
        filas: n.items,
      }) : ''}`;
  }

  root.querySelector('#lista-nc').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (tr) verNota(tr.dataset.id).catch((err) => toast(err.message, 'error'));
  });
  root.querySelector('#detalle-nc').addEventListener('click', async (e) => {
    const pdf = e.target.closest('button[data-nc-pdf]');
    if (pdf) {
      // La pestaña se abre antes del await para que el navegador no la bloquee.
      const ventana = window.open('', '_blank');
      if (ventana) ventana.document.write('<p style="font-family:sans-serif">Cargando la nota crédito…</p>');
      pdf.disabled = true;
      try {
        const url = URL.createObjectURL(await apiArchivo(`/notas-credito/${pdf.dataset.ncPdf}/pdf`));
        if (ventana) ventana.location = url; else window.location = url;
      } catch (err) {
        if (ventana) ventana.close();
        toast(err.message, 'error');
      } finally { pdf.disabled = false; }
      return;
    }
    const btn = e.target.closest('button[data-nc-dian]');
    if (!btn) return;
    btn.disabled = true;
    try {
      const r = await api(`/notas-credito/${btn.dataset.id}/dian${btn.dataset.ncDian === 'estado' ? '/estado' : ''}`, { method: 'POST' });
      toast(r.estado === 'aceptada' ? 'Nota crédito aceptada por la DIAN' : `Estado: ${r.estado}${r.mensaje ? ` · ${r.mensaje}` : ''}`, r.estado === 'aceptada' ? 'ok' : '');
      await Promise.all([cargarLista(), verNota(btn.dataset.id)]);
    } catch (err) { toast(err.message, 'error'); btn.disabled = false; }
  });

  async function cargarFactura(id) {
    if (!id) { detalleEl.innerHTML = ''; return; }
    const f = await api(`/ventas/${id}`);
    detalleEl.innerHTML = html`
      <p class="muted">${esc(fecha(f.fecha))} · ${esc(f.empresa)} · Cliente: ${esc(f.cliente || 'Consumidor final')} · Total: ${cop(f.total)} · Saldo: ${cop(f.saldo)}</p>
      <form id="form-nc">
        <table>
          <thead><tr><th></th><th>Producto</th><th class="num">Facturado</th><th class="num">Precio u.</th><th class="num">Cant. a devolver</th></tr></thead>
          <tbody>${f.items.map((it, i) => `
            <tr>
              <td><input type="checkbox" data-linea="${i}" /></td>
              <td>${esc(it.producto)}</td>
              <td class="num">${num(it.cantidad)} ${esc(it.unidad_medida)}</td>
              <td class="num">${cop(it.precio_unitario)}</td>
              <td class="num"><input class="w-sm" type="number" step="0.001" min="0" max="${it.cantidad}" data-cantidad="${i}" data-producto="${esc(it.producto_id || '')}" data-precio="${it.precio_unitario}" value="0" disabled /></td>
            </tr>`).join('')}
          </tbody>
        </table>
        <div class="row">
          <label><span>Razón</span>
            <select name="razon">${Object.entries(RAZONES).map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join('')}</select>
          </label>
          <label style="flex-direction:row;align-items:center;gap:8px;padding-top:22px">
            <input type="checkbox" id="nc-reingresa" checked /> <span>Reingresa a inventario</span>
          </label>
        </div>
        <label><span>Notas</span><input name="notas" placeholder="Opcional" /></label>
        <p class="total" id="nc-total">Total de la nota: $0</p>
        <div class="row">
          <button type="submit" class="btn-primary">Registrar nota crédito</button>
          <button type="button" class="btn-secondary" id="btn-anular">Anular factura completa</button>
        </div>
      </form>
    `;
    const formNc = detalleEl.querySelector('#form-nc');
    formNc.querySelectorAll('[data-linea]').forEach((chk) => {
      chk.addEventListener('change', () => {
        const cant = formNc.querySelector(`[data-cantidad="${chk.dataset.linea}"]`);
        cant.disabled = !chk.checked;
        if (!chk.checked) cant.value = 0;
        calcularTotalNc();
      });
    });
    formNc.querySelectorAll('[data-cantidad]').forEach((inp) => inp.addEventListener('input', calcularTotalNc));

    function calcularTotalNc() {
      const t = [...formNc.querySelectorAll('[data-cantidad]:not(:disabled)')]
        .reduce((a, inp) => a + (Number(inp.value) || 0) * Number(inp.dataset.precio), 0);
      formNc.querySelector('#nc-total').textContent = `Total de la nota: ${cop(t)}`;
    }

    alEnviar(formNc, async () => {
      const items = [...formNc.querySelectorAll('[data-linea]:checked')].map((chk) => {
        const inp = formNc.querySelector(`[data-cantidad="${chk.dataset.linea}"]`);
        return { producto_id: inp.dataset.producto, cantidad: Number(inp.value), precio_unitario: Number(inp.dataset.precio) };
      }).filter((it) => it.cantidad > 0);
      if (!items.length) throw new Error('Marca al menos un producto con una cantidad a devolver mayor que cero');
      if (items.some((it) => !it.producto_id)) throw new Error('No se pudo identificar el producto de una línea; recarga la factura e intenta de nuevo');
      const d = datosForm(formNc);
      const reingresa = formNc.querySelector('#nc-reingresa').checked;
      const r = await api('/notas-credito', {
        method: 'POST',
        body: { factura_venta_id: id, razon: Number(d.razon), items, reingresa_inventario: reingresa, notas: d.notas || null },
      });
      toast(`Nota crédito ${r.consecutivo} registrada por ${cop(r.total)}`, 'ok');
      if (r.saldo_a_favor > 0) toast(`El cliente queda con ${cop(r.saldo_a_favor)} a favor`, '');
      await Promise.all([cargarLista(), cargarFactura(id)]);
    });

    detalleEl.querySelector('#btn-anular').addEventListener('click', async (e) => {
      if (!confirm(`¿Anular por completo la factura ${f.consecutivo}? Esto reingresa todo el inventario vendido y no se puede deshacer.`)) return;
      const motivo = prompt('Motivo de la anulación:');
      if (!motivo) return;
      e.target.disabled = true;
      try {
        const r = await api('/notas-credito', { method: 'POST', body: { factura_venta_id: id, anulacion: true, notas: motivo } });
        toast(`Factura anulada con nota crédito ${r.consecutivo}`, 'ok');
        await Promise.all([cargarLista(), cargarFactura(id)]);
      } catch (err) { toast(err.message, 'error'); } finally { e.target.disabled = false; }
    });
  }

  selFactura.addEventListener('change', () => cargarFactura(selFactura.value));
  selEmpresaLista.addEventListener('change', cargarLista);

  await Promise.all([cargarLista(), cargarFactura(facturaInicial)]);
}
