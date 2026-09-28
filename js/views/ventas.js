import { api, catalogo, invalidar } from '../api.js';
import { html, esc, num, cop, fecha, toast, opciones, tabla, badge, datosForm, alEnviar } from '../ui.js';

const ESTADO = { pendiente: 'warn', enviada: 'warn', aceptada: 'ok', rechazada: 'danger', error: 'danger', sin_configurar: '', contingencia: 'warn' };

export async function vistaVentas(root) {
  const [bodegas, clientes] = await Promise.all([catalogo('bodegas'), catalogo('clientes')]);

  root.innerHTML = html`
    <div class="page-head">
      <h1>Ventas</h1>
      <span class="hint">Venta al cliente final: mostrador de Agrocarnes o consumo del Restaurante. Descuenta inventario y deja la factura lista para la DIAN.</span>
    </div>
    <div class="grid">
      <div>
        <div class="card">
          <h2>Nueva venta</h2>
          <form id="form-venta">
            <label><span>Punto de venta (empresa / bodega)</span>
              <select id="v-bodega" required>${opciones(bodegas, { texto: (b) => `${b.empresa} · ${b.nombre}`, grupo: 'empresa', seleccionado: localStorage.getItem('venta_bodega') })}</select>
            </label>
            <label><span>Cliente</span>
              <div class="row">
                <select id="v-cliente">${opciones(clientes, { vacio: 'Consumidor final' })}</select>
                <button type="button" class="btn-secondary w-sm" id="btn-nuevo-cli">+ Nuevo</button>
              </div>
            </label>
            <div>
              <span class="muted">Productos</span>
              <div class="items" id="v-items"></div>
              <button type="button" class="btn-link" id="btn-linea">+ Agregar producto</button>
            </div>
            <p class="total" id="v-total">Total: $0</p>
            <button type="submit" class="btn-primary">Facturar</button>
          </form>
        </div>
        <div class="card" id="card-cli" hidden>
          <h2>Nuevo cliente</h2>
          <form id="form-cli">
            <label><span>Nombre / razón social</span><input name="nombre" required /></label>
            <div class="row">
              <label class="w-sm"><span>Tipo doc.</span>
                <select name="tipo_documento"><option>CC</option><option>NIT</option><option>CE</option></select>
              </label>
              <label><span>Número</span><input name="numero_documento" /></label>
            </div>
            <label><span>Correo (para enviar la factura electrónica)</span><input type="email" name="email" /></label>
            <div class="row">
              <label><span>Dirección</span><input name="direccion" /></label>
              <label class="w-sm"><span>Ciudad DANE</span><input name="ciudad_id" value="05001" /></label>
            </div>
            <div class="row">
              <button type="submit" class="btn-primary">Guardar cliente</button>
              <button type="button" class="btn-secondary" id="btn-cancelar-cli">Cancelar</button>
            </div>
          </form>
        </div>
      </div>
      <div>
        <div class="card">
          <h2>Últimas facturas</h2>
          <div id="lista-ventas"></div>
        </div>
        <div class="card" id="card-detalle" hidden>
          <h2 id="titulo-detalle">Factura</h2>
          <div id="detalle"></div>
        </div>
      </div>
    </div>
  `;

  const form = root.querySelector('#form-venta');
  const selBodega = root.querySelector('#v-bodega');
  const selCliente = root.querySelector('#v-cliente');
  const items = root.querySelector('#v-items');
  const totalEl = root.querySelector('#v-total');
  let existencias = [];

  async function cargarBodega() {
    localStorage.setItem('venta_bodega', selBodega.value);
    existencias = (await api(`/inventario/existencias?bodega_id=${selBodega.value}`)).filter((e) => Number(e.cantidad) > 0);
    items.innerHTML = '';
    agregarLinea();
    calcularTotal();
  }

  function agregarLinea() {
    const div = document.createElement('div');
    div.className = 'row linea';
    div.innerHTML = html`
      <select data-campo="producto_id" required>${opciones(existencias, { valor: 'producto_id', vacio: existencias.length ? 'Producto…' : 'Sin existencias en este punto', texto: (e) => `${e.producto} — ${num(e.cantidad)} ${e.unidad_medida}` })}</select>
      <input class="w-sm" data-campo="cantidad" type="number" step="0.001" min="0.001" placeholder="Cant." required />
      <input class="w-sm" data-campo="precio_unitario" type="number" step="1" min="0" placeholder="Precio u." required />
      <button type="button" class="btn-icon w-xs" title="Quitar">✕</button>
    `;
    div.querySelector('button').addEventListener('click', () => { div.remove(); calcularTotal(); });
    div.querySelectorAll('input').forEach((i) => i.addEventListener('input', calcularTotal));
    div.querySelector('select').addEventListener('change', (e) => {
      const ex = existencias.find((x) => x.producto_id === e.target.value);
      div.querySelector('[data-campo=cantidad]').max = ex ? ex.cantidad : '';
    });
    items.appendChild(div);
  }

  function leerLineas() {
    return [...items.querySelectorAll('.linea')].map((l) => ({
      producto_id: l.querySelector('[data-campo=producto_id]').value,
      cantidad: Number(l.querySelector('[data-campo=cantidad]').value),
      precio_unitario: Number(l.querySelector('[data-campo=precio_unitario]').value),
    }));
  }

  function calcularTotal() {
    const t = leerLineas().reduce((a, l) => a + (l.cantidad || 0) * (l.precio_unitario || 0), 0);
    totalEl.textContent = `Total: ${cop(t)}`;
  }

  async function cargarLista() {
    const filas = await api('/ventas');
    root.querySelector('#lista-ventas').innerHTML = tabla({
      columnas: [
        { titulo: 'Factura', render: (v) => `<span class="mono">${esc(v.consecutivo || '—')}</span>` },
        { titulo: 'Fecha', render: (v) => fecha(v.fecha) },
        { titulo: 'Empresa', campo: 'empresa' },
        { titulo: 'Cliente', render: (v) => esc(v.cliente || 'Consumidor final') },
        { titulo: 'Total', num: true, render: (v) => cop(v.total) },
        { titulo: 'DIAN', render: (v) => badge(v.estado_dian, ESTADO[v.estado_dian] || '') + (v.dian_mensaje && ['error', 'rechazada'].includes(v.estado_dian) ? ` <span class="muted" title="${esc(v.dian_mensaje)}">ⓘ</span>` : '') },
      ],
      filas,
      filaAttrs: (v) => `class="clickable" data-id="${v.id}"`,
    });
  }

  async function verDetalle(id) {
    const card = root.querySelector('#card-detalle');
    card.hidden = false;
    const f = await api(`/ventas/${id}`);
    root.querySelector('#titulo-detalle').textContent = `Factura ${f.consecutivo || ''} · ${f.empresa}`;
    root.querySelector('#detalle').innerHTML = html`
      <p class="muted">${esc(fecha(f.fecha))} · Cliente: ${esc(f.cliente || 'Consumidor final')} · DIAN: ${badge(f.estado_dian, ESTADO[f.estado_dian] || '')}${f.arco_factura_id ? ` · Arco #${esc(f.arco_factura_id)}` : ''}</p>
      ${f.cufe ? `<p class="muted">CUFE: <span class="mono" style="word-break:break-all">${esc(f.cufe)}</span>${f.pdf_url ? ` · <a href="${esc(f.pdf_url)}" target="_blank" rel="noopener">Ver representación gráfica</a>` : ''}</p>` : ''}
      ${f.dian_mensaje ? `<p class="${['error', 'rechazada'].includes(f.estado_dian) ? 'error' : 'muted'}">${esc(f.dian_mensaje)}</p>` : ''}
      <p class="row" style="gap:8px">
        ${['pendiente', 'error', 'rechazada', 'sin_configurar'].includes(f.estado_dian) ? `<button type="button" class="btn-secondary" data-dian="reenviar" data-id="${f.id}">Reintentar envío a la DIAN</button>` : ''}
        ${f.arco_factura_id && f.estado_dian !== 'aceptada' ? `<button type="button" class="btn-secondary" data-dian="estado" data-id="${f.id}">Actualizar estado</button>` : ''}
      </p>
      ${tabla({
        columnas: [
          { titulo: 'Producto', campo: 'producto' },
          { titulo: 'Cantidad', num: true, render: (l) => `${num(l.cantidad)} ${esc(l.unidad_medida)}` },
          { titulo: 'Precio u.', num: true, render: (l) => cop(l.precio_unitario) },
          { titulo: 'Subtotal', num: true, render: (l) => cop(Number(l.cantidad) * Number(l.precio_unitario)) },
        ],
        filas: f.items,
      })}
      <p class="total">Total: ${cop(f.total)}</p>
    `;
  }

  selBodega.addEventListener('change', cargarBodega);
  root.querySelector('#btn-linea').addEventListener('click', agregarLinea);
  root.querySelector('#detalle').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-dian]');
    if (!btn) return;
    btn.disabled = true;
    try {
      const r = await api(`/ventas/${btn.dataset.id}/dian${btn.dataset.dian === 'estado' ? '/estado' : ''}`, { method: 'POST' });
      toast(r.estado === 'aceptada' ? 'Factura aceptada por la DIAN' : `Estado: ${r.estado}${r.mensaje ? ` · ${r.mensaje}` : ''}`, r.estado === 'aceptada' ? 'ok' : '');
      await Promise.all([cargarLista(), verDetalle(btn.dataset.id)]);
    } catch (err) { toast(err.message, 'error'); btn.disabled = false; }
  });
  root.querySelector('#lista-ventas').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (tr) verDetalle(tr.dataset.id);
  });

  const cardCli = root.querySelector('#card-cli');
  root.querySelector('#btn-nuevo-cli').addEventListener('click', () => { cardCli.hidden = false; cardCli.querySelector('input').focus(); });
  root.querySelector('#btn-cancelar-cli').addEventListener('click', () => { cardCli.hidden = true; });
  alEnviar(root.querySelector('#form-cli'), async (e) => {
    const c = await api('/terceros', { method: 'POST', body: { tipo: 'cliente', ...datosForm(e.target) } });
    invalidar('clientes');
    clientes.push(c);
    selCliente.innerHTML = opciones(clientes, { vacio: 'Consumidor final', seleccionado: c.id });
    e.target.reset();
    cardCli.hidden = true;
    toast(`Cliente "${c.nombre}" creado`, 'ok');
  });

  alEnviar(form, async () => {
    const lineas = leerLineas();
    if (!lineas.length) throw new Error('Agrega al menos un producto');
    if (lineas.some((l) => !l.producto_id || !(l.cantidad > 0) || !(l.precio_unitario >= 0))) {
      throw new Error('Revisa las líneas: producto, cantidad y precio son obligatorios');
    }
    const bodega = bodegas.find((b) => b.id === selBodega.value);
    const r = await api('/ventas', {
      method: 'POST',
      body: { empresa_id: bodega.empresa_id, bodega_id: bodega.id, cliente_id: selCliente.value || null, items: lineas },
    });
    toast(`Factura ${r.consecutivo} registrada`, 'ok');
    await Promise.all([cargarBodega(), cargarLista()]);
    verDetalle(r.id);
  });

  await Promise.all([cargarBodega(), cargarLista()]);
}
