import { api, catalogo } from '../api.js';
import { html, esc, num, cop, fecha, toast, opciones, tabla, alEnviar } from '../ui.js';
import { columnaAnular, claseAnulado, activarAnulaciones } from '../anular.js';

export async function vistaFormulacion(root) {
  const [empresas, bodegas, productos] = await Promise.all([catalogo('empresas'), catalogo('bodegas'), catalogo('productos')]);
  const terminados = productos.filter((p) => p.tipo !== 'materia_prima');
  const nombreEmpresa = (id) => empresas.find((e) => e.id === id)?.nombre || '';

  root.innerHTML = html`
    <div class="page-head">
      <h1>Formulación y producción</h1>
      <span class="hint">Define la fórmula (receta) de cada producto y luego regístrala como producción: descuenta los insumos y entra el producto terminado con su costo real.</span>
    </div>
    <div class="tabs">
      <button class="active" data-tab="recetas">Fórmulas</button>
      <button data-tab="producir">Producir</button>
    </div>

    <section data-panel="recetas" class="grid">
      <div class="card">
        <h2>Fórmula de un producto</h2>
        <form id="form-receta">
          <label><span>Producto terminado / intermedio</span>
            <select id="r-producto" required>${opciones(terminados, { vacio: 'Selecciona…', grupo: (p) => nombreEmpresa(p.empresa_id), texto: (p) => `${p.nombre} (${p.unidad_medida})` })}</select>
          </label>
          <p class="muted" id="r-ayuda">Cantidad de cada insumo necesaria para producir <b>1 unidad</b> del producto.</p>
          <div class="items" id="r-items"></div>
          <button type="button" class="btn-link" id="btn-insumo">+ Agregar insumo</button>
          <button type="submit" class="btn-primary">Guardar fórmula</button>
        </form>
      </div>
      <div class="card">
        <h2>Productos con fórmula</h2>
        <div id="lista-recetas"></div>
      </div>
    </section>

    <section data-panel="producir" class="grid" hidden>
      <div class="card">
        <h2>Registrar producción</h2>
        <form id="form-produccion">
          <label><span>Producto a producir</span>
            <select id="p-producto" required></select>
          </label>
          <label><span>Bodega (de donde salen los insumos y donde entra el producto)</span>
            <select id="p-bodega" required></select>
          </label>
          <label><span>Cantidad producida</span><input id="p-cantidad" type="number" step="0.001" min="0.001" required /></label>
          <div id="p-preview" class="muted"></div>
          <button type="submit" class="btn-primary">Registrar producción</button>
        </form>
      </div>
      <div class="card">
        <h2>Últimas producciones</h2>
        <div id="lista-produccion"></div>
      </div>
    </section>
  `;

  // ---- pestañas ----
  root.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
    root.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('active', x === b));
    root.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== b.dataset.tab; });
  }));

  // ---- fórmulas ----
  const selR = root.querySelector('#r-producto');
  const rItems = root.querySelector('#r-items');

  function lineaInsumo(sel = '', cant = '') {
    const div = document.createElement('div');
    div.className = 'row linea';
    div.innerHTML = html`
      <select data-campo="producto_insumo_id" required>${opciones(productos.filter((p) => p.id !== selR.value), { vacio: 'Insumo…', seleccionado: sel, grupo: (p) => nombreEmpresa(p.empresa_id), texto: (p) => `${p.nombre} (${p.unidad_medida})` })}</select>
      <input class="w-sm" data-campo="cantidad_por_unidad" type="number" step="0.0001" min="0.0001" placeholder="Cant./u" value="${cant}" required />
      <button type="button" class="btn-icon w-xs" title="Quitar">✕</button>
    `;
    div.querySelector('button').addEventListener('click', () => div.remove());
    rItems.appendChild(div);
  }

  async function cargarReceta() {
    rItems.innerHTML = '';
    if (!selR.value) return;
    const receta = await api(`/recetas/${selR.value}`);
    if (receta.length) receta.forEach((r) => lineaInsumo(r.producto_insumo_id, r.cantidad_por_unidad));
    else lineaInsumo();
  }

  async function cargarListaRecetas() {
    const filas = await api('/recetas');
    root.querySelector('#lista-recetas').innerHTML = tabla({
      columnas: [
        { titulo: 'Empresa', campo: 'empresa' },
        { titulo: 'Producto', render: (r) => `${esc(r.producto_terminado)} <span class="muted">(${esc(r.unidad_medida)})</span>` },
        { titulo: 'Insumos', num: true, campo: 'insumos' },
      ],
      filas,
      vacio: 'Todavía no hay fórmulas. Crea la primera a la izquierda.',
      filaAttrs: (r) => `class="clickable" data-id="${r.producto_terminado_id}"`,
    });
    cargarProductosProducibles(filas);
  }

  selR.addEventListener('change', cargarReceta);
  root.querySelector('#btn-insumo').addEventListener('click', () => lineaInsumo());
  root.querySelector('#lista-recetas').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (tr) { selR.value = tr.dataset.id; cargarReceta(); }
  });

  alEnviar(root.querySelector('#form-receta'), async () => {
    if (!selR.value) throw new Error('Selecciona el producto');
    const insumos = [...rItems.querySelectorAll('.linea')].map((l) => ({
      producto_insumo_id: l.querySelector('[data-campo=producto_insumo_id]').value,
      cantidad_por_unidad: Number(l.querySelector('[data-campo=cantidad_por_unidad]').value),
    }));
    if (!insumos.length || insumos.some((i) => !i.producto_insumo_id || !(i.cantidad_por_unidad > 0))) {
      throw new Error('Cada insumo necesita producto y cantidad mayor que cero');
    }
    await api(`/recetas/${selR.value}`, { method: 'PUT', body: { insumos } });
    toast('Fórmula guardada', 'ok');
    cargarListaRecetas();
  });

  // ---- producir ----
  const selP = root.querySelector('#p-producto');
  const selPB = root.querySelector('#p-bodega');
  const inpP = root.querySelector('#p-cantidad');
  const preview = root.querySelector('#p-preview');
  let recetaActual = [];

  function cargarProductosProducibles(conReceta) {
    const ids = new Set(conReceta.map((r) => r.producto_terminado_id));
    const lista = terminados.filter((p) => ids.has(p.id));
    selP.innerHTML = opciones(lista, { vacio: lista.length ? 'Producto…' : 'Primero crea una fórmula', grupo: (p) => nombreEmpresa(p.empresa_id), texto: (p) => `${p.nombre} (${p.unidad_medida})` });
    cargarBodegasProduccion();
  }

  async function cargarBodegasProduccion() {
    const prod = productos.find((p) => p.id === selP.value);
    // Por defecto, las bodegas de la empresa dueña del producto primero; se permite cualquiera.
    const orden = [...bodegas].sort((a, b) => (a.empresa_id === prod?.empresa_id ? -1 : 0) - (b.empresa_id === prod?.empresa_id ? -1 : 0));
    selPB.innerHTML = opciones(orden, { texto: (b) => `${b.empresa} · ${b.nombre}`, grupo: 'empresa' });
    recetaActual = selP.value ? await api(`/recetas/${selP.value}`) : [];
    actualizarPreview();
  }

  function actualizarPreview() {
    const q = Number(inpP.value);
    if (!recetaActual.length || !(q > 0)) { preview.innerHTML = ''; return; }
    preview.innerHTML = 'Consumirá: ' + recetaActual
      .map((r) => `<b>${num(r.cantidad_por_unidad * q)} ${esc(r.unidad_medida)}</b> de ${esc(r.insumo)}`)
      .join(' · ');
  }

  async function cargarListaProduccion() {
    const filas = await api('/produccion');
    root.querySelector('#lista-produccion').innerHTML = tabla({
      columnas: [
        { titulo: 'Fecha', render: (o) => fecha(o.creado_en) },
        { titulo: 'Empresa', campo: 'empresa' },
        { titulo: 'Producto', campo: 'producto' },
        { titulo: 'Cantidad', num: true, render: (o) => `${num(o.cantidad_producida)} ${esc(o.unidad_medida)}` },
        { titulo: 'Costo unit.', num: true, render: (o) => (o.costo_unitario ? cop(o.costo_unitario) : '—') },
        { titulo: 'Bodega', campo: 'bodega' },
        columnaAnular('produccion', (o) => `la producción de ${num(o.cantidad_producida)} ${o.unidad_medida} de ${o.producto}`),
      ],
      filas,
      filaAttrs: (o) => `class="${claseAnulado(o)}"`,
    });
  }

  activarAnulaciones(root.querySelector('#lista-produccion'), cargarListaProduccion);
  selP.addEventListener('change', cargarBodegasProduccion);
  inpP.addEventListener('input', actualizarPreview);

  alEnviar(root.querySelector('#form-produccion'), async () => {
    if (!selP.value) throw new Error('Selecciona el producto');
    const prod = productos.find((p) => p.id === selP.value);
    const bodega = bodegas.find((b) => b.id === selPB.value);
    const r = await api('/produccion', {
      method: 'POST',
      body: { empresa_id: bodega.empresa_id, producto_terminado_id: prod.id, cantidad_producida: Number(inpP.value), bodega_id: bodega.id },
    });
    toast(`Producción registrada · costo ${cop(r.costo_unitario_terminado)} por ${prod.unidad_medida}`, 'ok');
    inpP.value = '';
    actualizarPreview();
    cargarListaProduccion();
  });

  await Promise.all([cargarListaRecetas(), cargarListaProduccion()]);
}
