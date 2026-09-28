import { api, catalogo } from '../api.js';
import { html, esc, num, cop, fecha, toast, opciones, tabla, badge, alEnviar } from '../ui.js';

export async function vistaTraslados(root) {
  const bodegas = await catalogo('bodegas');

  root.innerHTML = html`
    <div class="page-head">
      <h1>Traslados</h1>
      <span class="hint">Mueve producto de una bodega a otra al costo, sin factura (ej. Agrocarnes → Restaurante, o la carne para embutidos → D'Monsa).</span>
    </div>
    <div class="grid">
      <div class="card">
        <h2>Nuevo traslado</h2>
        <form id="form-traslado">
          <label><span>Desde (bodega de origen)</span>
            <select id="t-origen" required>${opciones(bodegas, { texto: (b) => `${b.empresa} · ${b.nombre}`, grupo: 'empresa' })}</select>
          </label>
          <label><span>Producto (según existencia en origen)</span>
            <select id="t-producto" required></select>
          </label>
          <p class="muted" id="t-disponible"></p>
          <label><span>Hacia (bodega de destino)</span>
            <select id="t-destino" required></select>
          </label>
          <label><span>Cantidad</span><input id="t-cantidad" type="number" step="0.001" min="0.001" required /></label>
          <button type="submit" class="btn-primary">Registrar traslado</button>
        </form>
      </div>
      <div class="card">
        <h2>Últimos traslados</h2>
        <div id="lista-traslados"></div>
      </div>
    </div>
  `;

  const selOrigen = root.querySelector('#t-origen');
  const selProducto = root.querySelector('#t-producto');
  const selDestino = root.querySelector('#t-destino');
  const inpCantidad = root.querySelector('#t-cantidad');
  const disponible = root.querySelector('#t-disponible');
  let existencias = [];

  async function cargarOrigen() {
    selDestino.innerHTML = opciones(bodegas.filter((b) => b.id !== selOrigen.value), { texto: (b) => `${b.empresa} · ${b.nombre}`, grupo: 'empresa' });
    existencias = (await api(`/inventario/existencias?bodega_id=${selOrigen.value}`)).filter((e) => Number(e.cantidad) > 0);
    selProducto.innerHTML = opciones(existencias, {
      valor: 'producto_id', vacio: existencias.length ? 'Producto…' : 'Sin existencias en esta bodega',
      texto: (e) => `${e.producto} — ${num(e.cantidad)} ${e.unidad_medida}`,
    });
    mostrarDisponible();
  }

  function mostrarDisponible() {
    const e = existencias.find((x) => x.producto_id === selProducto.value);
    if (!e) { disponible.textContent = ''; inpCantidad.max = ''; return; }
    disponible.textContent = `Disponible: ${num(e.cantidad)} ${e.unidad_medida} · costo promedio ${cop(e.costo_promedio)} (el traslado se valora a ese costo)`;
    inpCantidad.max = e.cantidad;
  }

  async function cargarLista() {
    const filas = await api('/traslados');
    root.querySelector('#lista-traslados').innerHTML = tabla({
      columnas: [
        { titulo: 'Fecha', render: (t) => fecha(t.creado_en) },
        { titulo: 'Producto', campo: 'producto' },
        { titulo: 'Cantidad', num: true, render: (t) => `${num(t.cantidad)} ${esc(t.unidad_medida)}` },
        { titulo: 'Desde', render: (t) => `${esc(t.empresa_origen)} <span class="muted">/ ${esc(t.bodega_origen)}</span>` },
        { titulo: 'Hacia', render: (t) => `${esc(t.empresa_destino)} <span class="muted">/ ${esc(t.bodega_destino)}</span>` },
        { titulo: 'Valor', num: true, render: (t) => cop(Number(t.cantidad) * Number(t.costo_unitario)) },
        { titulo: '', render: (t) => (t.es_venta_intercompania ? badge('Intercompañía', 'brand') : '') },
      ],
      filas,
    });
  }

  selOrigen.addEventListener('change', cargarOrigen);
  selProducto.addEventListener('change', mostrarDisponible);

  alEnviar(root.querySelector('#form-traslado'), async () => {
    if (!selProducto.value) throw new Error('Selecciona un producto con existencia');
    const r = await api('/traslados', {
      method: 'POST',
      body: { producto_id: selProducto.value, bodega_origen_id: selOrigen.value, bodega_destino_id: selDestino.value, cantidad: Number(inpCantidad.value) },
    });
    toast(`Traslado registrado a ${cop(r.costo_unitario)} por unidad`, 'ok');
    inpCantidad.value = '';
    await Promise.all([cargarOrigen(), cargarLista()]);
  });

  await Promise.all([cargarOrigen(), cargarLista()]);
}
