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
            <div class="row">
              <label class="w-sm"><span>Código</span><input name="codigo" placeholder="Ej. C1002" title="Platos sin inventario: si lo dejas vacío se asigna el siguiente A0001, A0002…" /></label>
              <label><span>Nombre</span><input name="nombre" required placeholder="Ej. Lomo de cerdo" /></label>
            </div>
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
            <div class="row">
              <label><span>Código en Arco (ProductoId)</span><input name="arco_producto_id" placeholder="Igual al de Arco" /></label>
              <label class="w-sm"><span>% imp. incluido</span><input name="impuesto_pct" type="number" step="0.01" min="0" value="0" /></label>
              <label class="w-sm"><span>Impuesto</span>
                <select name="tipo_impuesto"><option value="IVA">IVA</option><option value="INC">INC (consumo)</option></select>
              </label>
            </div>
            <div class="row">
              <label><span>Precio de venta (con impuesto)</span><input name="precio_venta" type="number" step="1" min="0" placeholder="Opcional" /></label>
              <label><span>Inventario</span>
                <select name="maneja_inventario">
                  <option value="true">Maneja inventario</option>
                  <option value="false">No (plato del menú / servicio)</option>
                </select>
              </label>
            </div>
            <button type="submit" class="btn-primary">Crear producto</button>
          </form>
        </div>
        <div class="card">
          <h2>Productos, precios e impuestos</h2>
          <p class="muted">Edita cualquier campo directamente; se guarda al salir del campo.</p>
          <div id="lista-productos"></div>
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

  async function cargarProductos() {
    const productos = await catalogo('productos', true);
    const nombreEmpresa = (id) => empresas.find((e) => e.id === id)?.nombre || '';
    root.querySelector('#lista-productos').innerHTML = tabla({
      columnas: [
        { titulo: 'Código', render: (p) => `<input class="mono" style="width:80px" data-id="${p.id}" data-campo="codigo" value="${esc(p.codigo || '')}" placeholder="—" />` },
        { titulo: 'Producto', render: (p) => `${esc(p.nombre)} <span class="muted">(${esc(p.unidad_medida)} · ${esc(nombreEmpresa(p.empresa_id))})</span>` },
        { titulo: 'Código Arco', render: (p) => `<input class="mono" style="width:120px" data-id="${p.id}" data-campo="arco_producto_id" value="${esc(p.arco_producto_id || '')}" placeholder="—" />` },
        { titulo: 'Unidad Factus', render: (p) => `<input class="mono" style="width:80px" data-id="${p.id}" data-campo="factus_unidad_medida_code" value="${esc(p.factus_unidad_medida_code || '')}" placeholder="auto" title="Código UN/CEFACT (ej. KGM, LTR, 94=unidad); vacío = se infiere de la unidad" />` },
        { titulo: '% imp.', render: (p) => `<input class="mono" style="width:70px" type="number" step="0.01" min="0" data-id="${p.id}" data-campo="impuesto_pct" value="${esc(p.impuesto_pct ?? 0)}" />` },
        { titulo: 'Impuesto', render: (p) => `<select data-id="${p.id}" data-campo="tipo_impuesto"><option ${p.tipo_impuesto !== 'INC' ? 'selected' : ''}>IVA</option><option ${p.tipo_impuesto === 'INC' ? 'selected' : ''}>INC</option></select>` },
        { titulo: 'Precio venta', render: (p) => `<input class="mono" style="width:100px" type="number" step="1" min="0" data-id="${p.id}" data-campo="precio_venta" value="${esc(p.precio_venta != null ? Math.round(p.precio_venta) : '')}" placeholder="—" />` },
        { titulo: 'Inventario', render: (p) => `<input type="checkbox" data-id="${p.id}" data-campo="maneja_inventario" ${p.maneja_inventario !== false ? 'checked' : ''} title="Desmarcado = plato del menú o servicio: se vende sin existencias" />` },
      ],
      filas: productos,
      vacio: 'Todavía no hay productos.',
    });
  }

  root.querySelector('#lista-productos').addEventListener('change', async (e) => {
    const inp = e.target.closest('input[data-id], select[data-id]');
    if (!inp) return;
    try {
      const valor = inp.type === 'checkbox' ? inp.checked : inp.value;
      await api(`/productos/${inp.dataset.id}`, { method: 'PATCH', body: { [inp.dataset.campo]: valor } });
      invalidar('productos');
      toast('Producto actualizado', 'ok');
    } catch (err) { toast(err.message, 'error'); }
  });

  alEnviar(root.querySelector('#form-producto'), async (e) => {
    const p = await api('/productos', { method: 'POST', body: datosForm(e.target) });
    invalidar('productos');
    e.target.reset();
    toast(`Producto "${p.nombre}" creado`, 'ok');
    cargarProductos();
  });

  await Promise.all([cargarExistencias(), cargarProductos()]);
}
