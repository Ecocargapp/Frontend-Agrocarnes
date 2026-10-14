// Formulación y producción (carne de hamburguesa, chorizos…).
// La fórmula se escribe por tanda ("para 10 kg uso…"). Al producir, el sistema
// propone las cantidades según la fórmula, se ajustan a lo realmente usado, y
// al registrar descarga del inventario los insumos y carga el producto
// terminado al costo de lo consumido.
import { api, catalogo } from '../api.js';
import { html, esc, num, cop, dia, toast, opciones, tabla, alEnviar } from '../ui.js';
import { columnaAnular, claseAnulado, activarAnulaciones } from '../anular.js';

const hoyBogota = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);

export async function vistaFormulacion(root) {
  const [empresas, bodegas, productos] = await Promise.all([catalogo('empresas'), catalogo('bodegas'), catalogo('productos', true)]);
  const terminados = productos.filter((p) => p.tipo !== 'materia_prima');
  const nombreEmpresa = (id) => empresas.find((e) => e.id === id)?.nombre || '';
  const prodPorId = (id) => productos.find((p) => p.id === id);
  const textoProd = (p) => `${p.codigo ? `${p.codigo} · ` : ''}${p.nombre} (${p.unidad_medida})`;

  root.innerHTML = html`
    <div class="page-head">
      <h1>Formulación y producción</h1>
      <span class="hint">Crea la fórmula de cada producto (carne de hamburguesa, chorizos…) y regístrala como producción: descuenta del inventario los insumos usados y carga el producto terminado con su costo real.</span>
    </div>
    <div class="tabs">
      <button class="active" data-tab="producir">Producir</button>
      <button data-tab="recetas">Fórmulas</button>
    </div>

    <section data-panel="producir" class="grid">
      <div class="card">
        <h2>Registrar producción</h2>
        <form id="form-produccion">
          <label><span>Producto a producir</span><select id="p-producto" required></select></label>
          <div class="row">
            <label><span>Bodega (salen los insumos y entra el producto)</span><select id="p-bodega" required></select></label>
            <label class="w-sm"><span>Fecha</span><input type="date" id="p-fecha" value="${hoyBogota()}" /></label>
          </div>
          <div class="row">
            <label><span>Cantidad producida</span><input id="p-cantidad" type="number" step="0.001" min="0.001" required placeholder="Lo que salió de la tanda" /></label>
            <label class="w-sm"><span>Lote</span><input id="p-lote" placeholder="Opcional" /></label>
          </div>
          <div id="p-preview"></div>
          <label><span>Notas</span><input id="p-notas" placeholder="Opcional" /></label>
          <button type="submit" class="btn-primary">Producir: descargar insumos y cargar producto</button>
        </form>
      </div>
      <div class="card">
        <h2>Producciones</h2>
        <div id="lista-produccion"></div>
        <div id="detalle-produccion"></div>
      </div>
    </section>

    <section data-panel="recetas" class="grid" hidden>
      <div class="card">
        <h2>Fórmula de un producto</h2>
        <form id="form-receta">
          <label><span>Producto (terminado o intermedio)</span>
            <select id="r-producto" required>${opciones(terminados, { vacio: 'Selecciona…', grupo: (p) => nombreEmpresa(p.empresa_id), texto: textoProd })}</select>
          </label>
          <p class="muted" style="margin:0">¿No está el producto? Créalo en <a href="#inventario">Inventario</a> como "Terminado" (p. ej. Carne de hamburguesa, Chorizo santarrosano).</p>
          <div class="row" style="align-items:end">
            <label class="w-sm"><span>La fórmula es para</span><input id="r-base" type="number" step="0.001" min="0.001" value="1" required /></label>
            <span id="r-unidad" class="muted" style="padding-bottom:10px">unidades del producto</span>
          </div>
          <p class="muted" style="margin:0">Escribe las cantidades de una tanda tal como la preparan (p. ej. "para 10 kg de hamburguesa: 6 kg de res, 3 kg de cerdo, 0,2 kg de sal…").</p>
          <div class="items" id="r-items"></div>
          <button type="button" class="btn-link" id="btn-insumo">+ Agregar insumo</button>
          <div class="resumen-doc" id="r-resumen"></div>
          <label><span>Notas de la fórmula</span><input id="r-notas" placeholder="Procedimiento, tiempos, temperatura… (opcional)" /></label>
          <div class="row" style="gap:8px">
            <button type="submit" class="btn-primary">Guardar fórmula</button>
            <button type="button" class="btn-secondary" id="btn-borrar-formula" hidden>Borrar fórmula</button>
          </div>
        </form>
      </div>
      <div class="card">
        <h2>Productos con fórmula</h2>
        <div id="lista-recetas"></div>
      </div>
    </section>
  `;
  const q = (s) => root.querySelector(s);

  root.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
    root.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('active', x === b));
    root.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== b.dataset.tab; });
  }));

  // ============================================================ fórmulas
  const selR = q('#r-producto');
  const rItems = q('#r-items');

  function lineaInsumo(sel = '', cant = '') {
    const div = document.createElement('div');
    div.className = 'row linea';
    div.innerHTML = html`
      <select data-campo="producto_insumo_id" required>${opciones(productos.filter((p) => p.id !== selR.value), { vacio: 'Insumo…', seleccionado: sel, grupo: (p) => nombreEmpresa(p.empresa_id), texto: textoProd })}</select>
      <input class="w-sm" data-campo="cantidad" type="number" step="0.0001" min="0.0001" placeholder="Cantidad" value="${cant}" required />
      <span class="muted" data-unidad style="align-self:center;min-width:28px">${esc(prodPorId(sel)?.unidad_medida || '')}</span>
      <button type="button" class="btn-icon w-xs" title="Quitar">✕</button>
    `;
    div.querySelector('button').addEventListener('click', () => { div.remove(); resumenFormula(); });
    div.querySelector('select').addEventListener('change', (e) => { div.querySelector('[data-unidad]').textContent = prodPorId(e.target.value)?.unidad_medida || ''; resumenFormula(); });
    div.querySelector('input').addEventListener('input', resumenFormula);
    rItems.appendChild(div);
  }

  function leerInsumos() {
    return [...rItems.querySelectorAll('.linea')].map((l) => ({
      producto_insumo_id: l.querySelector('[data-campo=producto_insumo_id]').value,
      cantidad: Number(l.querySelector('[data-campo=cantidad]').value),
    }));
  }

  // Suma de insumos en kg frente a la base: muestra la merma o el rendimiento.
  function resumenFormula() {
    const p = prodPorId(selR.value);
    const base = Number(q('#r-base').value);
    const ins = leerInsumos().filter((i) => i.producto_insumo_id && i.cantidad > 0);
    if (!p || !ins.length || !(base > 0)) { q('#r-resumen').innerHTML = ''; return; }
    const kg = ins.filter((i) => (prodPorId(i.producto_insumo_id)?.unidad_medida || '').toLowerCase() === 'kg').reduce((a, i) => a + i.cantidad, 0);
    const esKg = (p.unidad_medida || '').toLowerCase() === 'kg';
    q('#r-resumen').innerHTML = html`
      <div><span>Insumos en kg de la tanda</span><b>${num(kg)} kg</b></div>
      ${esKg && kg > 0 ? `<div><span>Rendimiento (producto ÷ insumos en kg)</span><b>${num((base / kg) * 100)} %</b></div>` : ''}
      <div><span>Por cada 1 ${esc(p.unidad_medida)} de ${esc(p.nombre)}</span><span>${ins.map((i) => `${num(i.cantidad / base)} ${esc(prodPorId(i.producto_insumo_id)?.unidad_medida || '')} ${esc(prodPorId(i.producto_insumo_id)?.nombre || '')}`).join(' · ')}</span></div>`;
  }

  async function cargarReceta() {
    rItems.innerHTML = '';
    q('#r-unidad').textContent = `${prodPorId(selR.value)?.unidad_medida || 'unidades'} de producto`;
    if (!selR.value) { resumenFormula(); return; }
    const f = await api(`/recetas/${selR.value}?detalle`);
    q('#r-base').value = f.cantidad_base;
    q('#r-notas').value = f.notas || '';
    q('#btn-borrar-formula').hidden = !f.insumos.length;
    if (f.insumos.length) f.insumos.forEach((r) => lineaInsumo(r.producto_insumo_id, Number(r.cantidad)));
    else { lineaInsumo(); lineaInsumo(); }
    resumenFormula();
  }

  async function cargarListaRecetas() {
    const filas = await api('/recetas');
    q('#lista-recetas').innerHTML = tabla({
      columnas: [
        { titulo: 'Empresa', campo: 'empresa' },
        { titulo: 'Producto', render: (r) => `${esc(r.producto_terminado)} <span class="muted">(${esc(r.unidad_medida)})</span>` },
        { titulo: 'Tanda', num: true, render: (r) => `${num(r.cantidad_base)} ${esc(r.unidad_medida)}` },
        { titulo: 'Insumos', num: true, campo: 'insumos' },
      ],
      filas,
      vacio: 'Todavía no hay fórmulas. Crea la primera a la izquierda.',
      filaAttrs: (r) => `class="clickable" data-id="${r.producto_terminado_id}"`,
    });
    cargarProductosProducibles(filas);
  }

  selR.addEventListener('change', cargarReceta);
  q('#r-base').addEventListener('input', resumenFormula);
  q('#btn-insumo').addEventListener('click', () => lineaInsumo());
  q('#lista-recetas').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (tr) { selR.value = tr.dataset.id; cargarReceta(); }
  });
  q('#btn-borrar-formula').addEventListener('click', async (e) => {
    const b = e.target;
    if (b.dataset.confirmar !== '1') { b.dataset.confirmar = '1'; b.textContent = '¿Seguro? Clic otra vez'; return; }
    await api(`/recetas/${selR.value}`, { method: 'DELETE' });
    b.dataset.confirmar = ''; b.textContent = 'Borrar fórmula';
    toast('Fórmula borrada', 'ok');
    await cargarListaRecetas(); cargarReceta();
  });

  alEnviar(q('#form-receta'), async () => {
    if (!selR.value) throw new Error('Selecciona el producto');
    const insumos = leerInsumos();
    if (!insumos.length || insumos.some((i) => !i.producto_insumo_id || !(i.cantidad > 0))) throw new Error('Cada insumo necesita producto y cantidad mayor que cero');
    await api(`/recetas/${selR.value}`, { method: 'PUT', body: { cantidad_base: Number(q('#r-base').value), notas: q('#r-notas').value, insumos } });
    toast('Fórmula guardada', 'ok');
    q('#btn-borrar-formula').hidden = false;
    cargarListaRecetas();
  });

  // ============================================================ producir
  const selP = q('#p-producto');
  const selPB = q('#p-bodega');
  const inpP = q('#p-cantidad');
  const preview = q('#p-preview');
  let calc = null;

  function cargarProductosProducibles(conReceta) {
    const actual = selP.value;
    const ids = new Set(conReceta.map((r) => r.producto_terminado_id));
    const lista = terminados.filter((p) => ids.has(p.id));
    selP.innerHTML = opciones(lista, { vacio: lista.length ? 'Producto…' : 'Primero crea una fórmula (pestaña Fórmulas)', grupo: (p) => nombreEmpresa(p.empresa_id), texto: textoProd, seleccionado: actual });
    cargarBodegasProduccion();
  }

  function cargarBodegasProduccion() {
    const prod = prodPorId(selP.value);
    const actual = selPB.value;
    // Primero las bodegas de la empresa dueña del producto.
    const orden = [...bodegas].sort((a, b) => (b.empresa_id === prod?.empresa_id) - (a.empresa_id === prod?.empresa_id));
    selPB.innerHTML = opciones(orden, { texto: (b) => `${b.empresa} · ${b.nombre}`, grupo: 'empresa', seleccionado: actual });
    previsualizar();
  }

  let timer;
  function previsualizar(reales = null) {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const cantidad = Number(inpP.value);
      if (!selP.value || !selPB.value || !(cantidad > 0)) { preview.innerHTML = ''; calc = null; return; }
      try {
        calc = await api('/produccion/previsualizar', { method: 'POST', body: { producto_terminado_id: selP.value, bodega_id: selPB.value, cantidad_producida: cantidad, insumos: reales } });
        pintarPreview();
      } catch (err) { preview.innerHTML = `<p class="error">${esc(err.message)}</p>`; calc = null; }
    }, 250);
  }

  function pintarPreview() {
    const unidad = prodPorId(selP.value)?.unidad_medida || '';
    preview.innerHTML = html`
      <p class="muted" style="margin:8px 0 4px">Insumos que se descargan del inventario. Ajusta la <b>cantidad real</b> si usaste más o menos de lo que dice la fórmula.</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Insumo</th><th class="num">Fórmula</th><th class="num">Cantidad real</th><th class="num">Hay en bodega</th><th class="num">Costo</th></tr></thead>
        <tbody>${calc.lineas.map((l) => `<tr>
          <td>${esc(l.insumo)}</td>
          <td class="num">${num(l.teorica)} ${esc(l.unidad_medida)}</td>
          <td class="num"><input type="number" step="0.001" min="0" data-real="${l.producto_insumo_id}" value="${l.cantidad}" style="width:110px;text-align:right" /></td>
          <td class="num">${l.falta ? `<span class="neg">${num(l.existencia)} · faltan ${num(l.falta)}</span>` : num(l.existencia)}</td>
          <td class="num">${cop(l.costo)}</td></tr>`).join('')}</tbody>
      </table></div>
      <div class="resumen-doc">
        <div><span>Costo total de los insumos</span><b>${cop(calc.costo_total)}</b></div>
        <div class="total"><span>Costo por ${esc(unidad)} del producto</span><b>${cop(calc.costo_unitario)}</b></div>
      </div>
      ${calc.faltantes.length ? `<p class="error">No alcanza el inventario de: ${calc.faltantes.map((f) => esc(f.insumo)).join(', ')}. Registra primero la compra o el traslado de esos insumos a esta bodega.</p>` : ''}`;
  }

  const reales = () => [...preview.querySelectorAll('[data-real]')].map((i) => ({ producto_insumo_id: i.dataset.real, cantidad: Number(i.value) || 0 }));
  preview.addEventListener('change', (e) => { if (e.target.dataset.real) previsualizar(reales()); });
  selP.addEventListener('change', cargarBodegasProduccion);
  selPB.addEventListener('change', () => previsualizar(calc ? reales() : null));
  inpP.addEventListener('input', () => previsualizar());

  alEnviar(q('#form-produccion'), async () => {
    if (!selP.value) throw new Error('Selecciona el producto');
    if (!calc) throw new Error('Escribe la cantidad producida');
    const prod = prodPorId(selP.value);
    const r = await api('/produccion', {
      method: 'POST',
      body: {
        producto_terminado_id: prod.id, bodega_id: selPB.value, cantidad_producida: Number(inpP.value),
        insumos: reales(), fecha: q('#p-fecha').value || null, lote: q('#p-lote').value || null, notas: q('#p-notas').value || null,
      },
    });
    toast(`Producción registrada: ${num(Number(inpP.value))} ${prod.unidad_medida} de ${prod.nombre} a ${cop(r.costo_unitario_terminado)} por ${prod.unidad_medida}`, 'ok');
    inpP.value = ''; q('#p-lote').value = ''; q('#p-notas').value = '';
    preview.innerHTML = ''; calc = null;
    await cargarListaProduccion();
    verDetalle(r.id);
  });

  async function cargarListaProduccion() {
    const filas = await api('/produccion');
    q('#lista-produccion').innerHTML = tabla({
      columnas: [
        { titulo: 'Fecha', render: (o) => esc(dia(String(o.fecha || o.creado_en).slice(0, 10))) },
        { titulo: 'Producto', render: (o) => `${esc(o.producto)}${o.lote ? ` <span class="muted">· lote ${esc(o.lote)}</span>` : ''}` },
        { titulo: 'Cantidad', num: true, render: (o) => `${num(o.cantidad_producida)} ${esc(o.unidad_medida)}` },
        { titulo: 'Costo unit.', num: true, render: (o) => (o.costo_unitario ? cop(o.costo_unitario) : '—') },
        { titulo: 'Bodega', render: (o) => `${esc(o.empresa)} · ${esc(o.bodega)}` },
        columnaAnular('produccion', (o) => `la producción de ${num(o.cantidad_producida)} ${o.unidad_medida} de ${o.producto}`),
      ],
      filas,
      vacio: 'Todavía no hay producciones.',
      filaAttrs: (o) => `class="clickable ${claseAnulado(o)}" data-orden="${o.id}"`,
    });
  }

  async function verDetalle(id) {
    const o = await api(`/produccion/${id}`);
    q('#detalle-produccion').innerHTML = html`
      <h2 style="margin-top:16px">${esc(o.producto)} · ${num(o.cantidad_producida)} ${esc(o.unidad_medida)}</h2>
      <p class="muted">${esc(dia(String(o.fecha).slice(0, 10)))} · ${esc(o.bodega)}${o.lote ? ` · lote ${esc(o.lote)}` : ''}${o.notas ? ` · ${esc(o.notas)}` : ''}${o.estado === 'anulado' ? ' · <b class="neg">Anulada</b>' : ''}</p>
      ${tabla({
        columnas: [
          { titulo: 'Insumo descargado', campo: 'producto' },
          { titulo: 'Fórmula', num: true, render: (i) => (i.teorica == null ? '—' : `${num(i.teorica)} ${esc(i.unidad_medida)}`) },
          { titulo: 'Real', num: true, render: (i) => `${num(i.cantidad)} ${esc(i.unidad_medida)}` },
          { titulo: 'Costo', num: true, render: (i) => cop(i.costo) },
        ],
        filas: o.insumos,
      })}
      <div class="resumen-doc"><div class="total"><span>Producto cargado al inventario a</span><b>${cop(o.costo_unitario)} por ${esc(o.unidad_medida)}</b></div></div>`;
  }

  activarAnulaciones(q('#lista-produccion'), cargarListaProduccion);
  q('#lista-produccion').addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    const tr = e.target.closest('tr[data-orden]');
    if (tr) verDetalle(tr.dataset.orden).catch((err) => toast(err.message, 'error'));
  });

  await Promise.all([cargarListaRecetas(), cargarListaProduccion()]);
}
