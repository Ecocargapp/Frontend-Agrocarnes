import { api, catalogo, invalidar } from '../api.js';
import { html, esc, num, cop, fecha, toast, opciones, tabla, badge, datosForm, alEnviar } from '../ui.js';

const TIPO_MOV = {
  compra: ['Compra', 'ok'],
  porcionado_entrada: ['Porcionado (entra)', 'ok'],
  porcionado_salida: ['Porcionado (sale)', 'warn'],
  traslado_entrada: ['Traslado (entra)', 'ok'],
  traslado_salida: ['Traslado (sale)', 'warn'],
  produccion_entrada: ['Producción (entra)', 'ok'],
  produccion_consumo: ['Producción (consume)', 'warn'],
  venta: ['Venta', 'brand'],
};
const ENTRADAS = new Set(['compra', 'porcionado_entrada', 'traslado_entrada', 'produccion_entrada']);

export async function vistaInventario(root) {
  const [empresas, bodegas] = await Promise.all([catalogo('empresas'), catalogo('bodegas')]);
  let bodegaId = localStorage.getItem('inv_bodega') || bodegas[0]?.id || '';
  let seleccion = null;

  root.innerHTML = html`
    <div class="page-head">
      <h1>Inventario</h1>
      <span class="hint">Existencias por bodega, con costo promedio. Clic en un producto para ver su kardex.</span>
    </div>
    <div class="grid">
      <div>
        <div class="card">
          <h2>Bodega</h2>
          <label><span>Ver existencias de</span>
            <select id="sel-bodega">${opciones(bodegas, { texto: (b) => `${b.empresa} · ${b.nombre}`, grupo: 'empresa', seleccionado: bodegaId })}</select>
          </label>
        </div>
        <div class="card">
          <h2>Nuevo producto</h2>
          <form id="form-producto">
            <label><span>Empresa dueña</span>
              <select name="empresa_id" required>${opciones(empresas)}</select>
            </label>
            <label><span>Nombre</span><input name="nombre" required placeholder="Ej. Lomo de cerdo" /></label>
            <div class="row">
              <label><span>Tipo</span>
                <select name="tipo">
                  <option value="materia_prima">Materia prima</option>
                  <option value="intermedio">Intermedio</option>
                  <option value="terminado" selected>Terminado</option>
                </select>
              </label>
              <label class="w-sm"><span>Unidad</span>
                <select name="unidad_medida">
                  <option>kg</option><option>un</option><option>lb</option><option>g</option><option>l</option>
                </select>
              </label>
            </div>
            <button type="submit" class="btn-primary">Crear producto</button>
          </form>
        </div>
      </div>
      <div>
        <div class="card">
          <h2 id="titulo-existencias">Existencias</h2>
          <div id="existencias"></div>
        </div>
        <div class="card" id="card-kardex" hidden>
          <h2 id="titulo-kardex">Kardex</h2>
          <div id="kardex"></div>
        </div>
      </div>
    </div>
  `;

  const selBodega = root.querySelector('#sel-bodega');
  const cont = root.querySelector('#existencias');
  const cardKardex = root.querySelector('#card-kardex');

  async function cargarExistencias() {
    bodegaId = selBodega.value;
    localStorage.setItem('inv_bodega', bodegaId);
    seleccion = null;
    cardKardex.hidden = true;
    const b = bodegas.find((x) => x.id === bodegaId);
    root.querySelector('#titulo-existencias').textContent = b ? `Existencias · ${b.empresa} / ${b.nombre}` : 'Existencias';
    cont.innerHTML = '<p class="muted">Cargando…</p>';
    const filas = await api(`/inventario/existencias?bodega_id=${bodegaId}`);
    const valorTotal = filas.reduce((a, f) => a + Number(f.cantidad) * Number(f.costo_promedio), 0);
    cont.innerHTML = tabla({
      columnas: [
        { titulo: 'Producto', campo: 'producto' },
        { titulo: 'Cantidad', num: true, render: (f) => `${num(f.cantidad)} ${esc(f.unidad_medida)}` },
        { titulo: 'Costo prom.', num: true, render: (f) => cop(f.costo_promedio) },
        { titulo: 'Valor', num: true, render: (f) => cop(Number(f.cantidad) * Number(f.costo_promedio)) },
      ],
      filas,
      vacio: 'Esta bodega no tiene existencias. Registra una compra o un traslado hacia ella.',
      filaAttrs: (f) => `class="clickable" data-producto="${f.producto_id}" data-nombre="${esc(f.producto)}"`,
    }) + (filas.length ? `<p class="total">Valor del inventario: ${cop(valorTotal)}</p>` : '');
  }

  async function cargarKardex(productoId, nombre) {
    seleccion = productoId;
    cont.querySelectorAll('tr').forEach((tr) => tr.classList.toggle('selected', tr.dataset.producto === productoId));
    cardKardex.hidden = false;
    root.querySelector('#titulo-kardex').textContent = `Kardex · ${nombre}`;
    const k = root.querySelector('#kardex');
    k.innerHTML = '<p class="muted">Cargando…</p>';
    const movs = await api(`/inventario/movimientos?producto_id=${productoId}&bodega_id=${bodegaId}`);
    k.innerHTML = tabla({
      columnas: [
        { titulo: 'Fecha', render: (m) => fecha(m.creado_en) },
        { titulo: 'Movimiento', render: (m) => badge(...(TIPO_MOV[m.tipo] || [m.tipo, ''])) },
        { titulo: 'Cantidad', num: true, render: (m) => `${ENTRADAS.has(m.tipo) ? '+' : '−'}${num(m.cantidad)}` },
        { titulo: 'Costo unit.', num: true, render: (m) => cop(m.costo_unitario) },
      ],
      filas: movs,
    });
  }

  selBodega.addEventListener('change', cargarExistencias);
  cont.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-producto]');
    if (tr) cargarKardex(tr.dataset.producto, tr.dataset.nombre);
  });

  alEnviar(root.querySelector('#form-producto'), async (e) => {
    const p = await api('/productos', { method: 'POST', body: datosForm(e.target) });
    invalidar('productos');
    e.target.reset();
    toast(`Producto "${p.nombre}" creado`, 'ok');
  });

  await cargarExistencias();
}
