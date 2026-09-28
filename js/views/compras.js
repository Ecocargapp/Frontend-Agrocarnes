import { api, catalogo, invalidar } from '../api.js';
import { html, esc, num, cop, dia, hoy, toast, opciones, tabla, badge, datosForm, alEnviar } from '../ui.js';

const MEDIOS_PAGO = ['efectivo', 'transferencia', 'tarjeta', 'otro'];

export async function vistaCompras(root) {
  const [empresas, bodegas, productos, proveedores] = await Promise.all([
    catalogo('empresas'), catalogo('bodegas'), catalogo('productos'), catalogo('proveedores'),
  ]);

  root.innerHTML = html`
    <div class="page-head">
      <h1>Compras</h1>
      <span class="hint">Factura del proveedor (ej. Agro Franpabel). Cada línea entra al inventario al costo facturado.</span>
    </div>
    <div class="grid">
      <div>
        <div class="card">
          <h2>Registrar compra</h2>
          <form id="form-compra">
            <label><span>Empresa que compra</span>
              <select name="empresa_id" id="c-empresa" required>${opciones(empresas)}</select>
            </label>
            <label><span>Bodega que recibe</span>
              <select name="bodega_id" id="c-bodega" required></select>
            </label>
            <label><span>Proveedor</span>
              <div class="row">
                <select name="proveedor_id" id="c-proveedor" required>${opciones(proveedores, { vacio: 'Selecciona…' })}</select>
                <button type="button" class="btn-secondary w-sm" id="btn-nuevo-prov">+ Nuevo</button>
              </div>
            </label>
            <div class="row">
              <label><span>N° factura proveedor</span><input name="numero_factura_proveedor" placeholder="Opcional" /></label>
              <label class="w-sm"><span>Fecha</span><input type="date" name="fecha" value="${hoy()}" /></label>
            </div>
            <div class="row">
              <label class="w-sm"><span>Forma de pago</span>
                <select id="c-forma-pago" name="forma_pago">
                  <option value="contado">Contado</option>
                  <option value="credito">Crédito</option>
                </select>
              </label>
              <label id="c-medio-pago-label"><span>Medio de pago</span>
                <select name="medio_pago">${MEDIOS_PAGO.map((m) => `<option value="${m}"${m === 'transferencia' ? ' selected' : ''}>${esc(m[0].toUpperCase() + m.slice(1))}</option>`).join('')}</select>
              </label>
              <label id="c-plazo-label" hidden><span>Plazo (días)</span><input type="number" name="dias_plazo" value="30" min="1" /></label>
            </div>
            <div>
              <span class="muted">Líneas</span>
              <div class="items" id="c-items"></div>
              <button type="button" class="btn-link" id="btn-linea">+ Agregar línea</button>
            </div>
            <p class="total" id="c-total">Total: $0</p>
            <button type="submit" class="btn-primary">Registrar compra</button>
          </form>
        </div>
        <div class="card" id="card-prov" hidden>
          <h2>Nuevo proveedor</h2>
          <form id="form-prov">
            <label><span>Nombre / razón social</span><input name="nombre" required /></label>
            <div class="row">
              <label class="w-sm"><span>Tipo doc.</span>
                <select name="tipo_documento"><option>NIT</option><option>CC</option><option>CE</option></select>
              </label>
              <label><span>Número</span><input name="numero_documento" /></label>
            </div>
            <div class="row">
              <label><span>Correo</span><input type="email" name="email" /></label>
              <label><span>Teléfono</span><input name="telefono" /></label>
            </div>
            <div class="row">
              <button type="submit" class="btn-primary">Guardar proveedor</button>
              <button type="button" class="btn-secondary" id="btn-cancelar-prov">Cancelar</button>
            </div>
          </form>
        </div>
      </div>
      <div>
        <div class="card">
          <h2>Últimas compras</h2>
          <div id="lista-compras"></div>
        </div>
        <div class="card" id="card-detalle" hidden>
          <h2 id="titulo-detalle">Detalle</h2>
          <div id="detalle"></div>
        </div>
      </div>
    </div>
  `;

  const form = root.querySelector('#form-compra');
  const selEmpresa = root.querySelector('#c-empresa');
  const selBodega = root.querySelector('#c-bodega');
  const selProv = root.querySelector('#c-proveedor');
  const selFormaPago = root.querySelector('#c-forma-pago');
  const items = root.querySelector('#c-items');
  const totalEl = root.querySelector('#c-total');

  function actualizarFormaPago() {
    const credito = selFormaPago.value === 'credito';
    root.querySelector('#c-medio-pago-label').hidden = credito;
    root.querySelector('#c-plazo-label').hidden = !credito;
  }
  selFormaPago.addEventListener('change', actualizarFormaPago);
  actualizarFormaPago();

  function productosDe(empresaId) {
    return productos.filter((p) => p.empresa_id === empresaId);
  }

  function cargarBodegas() {
    const lista = bodegas.filter((b) => b.empresa_id === selEmpresa.value);
    selBodega.innerHTML = opciones(lista);
    items.innerHTML = '';
    agregarLinea();
  }

  function agregarLinea() {
    const div = document.createElement('div');
    div.className = 'row linea';
    div.innerHTML = html`
      <select data-campo="producto_id" required>${opciones(productosDe(selEmpresa.value), { vacio: 'Producto…', texto: (p) => `${p.nombre} (${p.unidad_medida})` })}</select>
      <input class="w-sm" data-campo="cantidad" type="number" step="0.001" min="0.001" placeholder="Cant." required />
      <input class="w-sm" data-campo="costo_unitario" type="number" step="1" min="0" placeholder="Costo u." required />
      <button type="button" class="btn-icon w-xs" title="Quitar">✕</button>
    `;
    div.querySelector('button').addEventListener('click', () => { div.remove(); calcularTotal(); });
    div.querySelectorAll('input').forEach((i) => i.addEventListener('input', calcularTotal));
    items.appendChild(div);
  }

  function leerLineas() {
    return [...items.querySelectorAll('.linea')].map((l) => ({
      producto_id: l.querySelector('[data-campo=producto_id]').value,
      bodega_id: selBodega.value,
      cantidad: Number(l.querySelector('[data-campo=cantidad]').value),
      costo_unitario: Number(l.querySelector('[data-campo=costo_unitario]').value),
    }));
  }

  function calcularTotal() {
    const t = leerLineas().reduce((a, l) => a + (l.cantidad || 0) * (l.costo_unitario || 0), 0);
    totalEl.textContent = `Total: ${cop(t)}`;
  }

  async function cargarLista() {
    const compras = await api('/compras');
    root.querySelector('#lista-compras').innerHTML = tabla({
      columnas: [
        { titulo: 'Fecha', render: (c) => dia(c.fecha) },
        { titulo: 'Empresa', campo: 'empresa' },
        { titulo: 'Proveedor', campo: 'proveedor' },
        { titulo: 'Factura', render: (c) => `<span class="mono">${esc(c.numero_factura_proveedor || '—')}</span>` },
        { titulo: 'Líneas', num: true, campo: 'items' },
        { titulo: 'Pago', render: (c) => badge(c.forma_pago === 'credito' ? 'Crédito' : 'Contado', c.forma_pago === 'credito' ? 'warn' : 'ok') },
        { titulo: 'Total', num: true, render: (c) => cop(c.total) },
        { titulo: 'Saldo', num: true, render: (c) => (Number(c.saldo) > 0 ? cop(c.saldo) : '—') },
      ],
      filas: compras,
      filaAttrs: (c) => `class="clickable" data-id="${c.id}" data-titulo="${esc(`${c.proveedor} · ${dia(c.fecha)}`)}"`,
    });
  }

  async function verDetalle(id, titulo) {
    const card = root.querySelector('#card-detalle');
    card.hidden = false;
    root.querySelector('#titulo-detalle').textContent = `Detalle · ${titulo}`;
    const lineas = await api(`/compras/${id}`);
    root.querySelector('#detalle').innerHTML = tabla({
      columnas: [
        { titulo: 'Producto', campo: 'producto' },
        { titulo: 'Bodega', campo: 'bodega' },
        { titulo: 'Cantidad', num: true, render: (l) => `${num(l.cantidad)} ${esc(l.unidad_medida)}` },
        { titulo: 'Costo u.', num: true, render: (l) => cop(l.costo_unitario) },
        { titulo: 'Subtotal', num: true, render: (l) => cop(Number(l.cantidad) * Number(l.costo_unitario)) },
      ],
      filas: lineas,
    });
  }

  selEmpresa.addEventListener('change', cargarBodegas);
  root.querySelector('#btn-linea').addEventListener('click', agregarLinea);
  root.querySelector('#lista-compras').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (tr) verDetalle(tr.dataset.id, tr.dataset.titulo);
  });

  const cardProv = root.querySelector('#card-prov');
  root.querySelector('#btn-nuevo-prov').addEventListener('click', () => { cardProv.hidden = false; cardProv.querySelector('input').focus(); });
  root.querySelector('#btn-cancelar-prov').addEventListener('click', () => { cardProv.hidden = true; });
  alEnviar(root.querySelector('#form-prov'), async (e) => {
    const p = await api('/terceros', { method: 'POST', body: { tipo: 'proveedor', ...datosForm(e.target) } });
    invalidar('proveedores');
    proveedores.push(p);
    selProv.innerHTML = opciones(proveedores, { vacio: 'Selecciona…', seleccionado: p.id });
    e.target.reset();
    cardProv.hidden = true;
    toast(`Proveedor "${p.nombre}" creado`, 'ok');
  });

  alEnviar(form, async () => {
    const lineas = leerLineas();
    if (!lineas.length) throw new Error('Agrega al menos una línea');
    if (lineas.some((l) => !l.producto_id || !(l.cantidad > 0) || !(l.costo_unitario >= 0))) {
      throw new Error('Revisa las líneas: producto, cantidad y costo son obligatorios');
    }
    const d = datosForm(form);
    const r = await api('/compras', {
      method: 'POST',
      body: {
        empresa_id: d.empresa_id, proveedor_id: d.proveedor_id, numero_factura_proveedor: d.numero_factura_proveedor || null, fecha: d.fecha, items: lineas,
        forma_pago: d.forma_pago,
        ...(d.forma_pago === 'credito' ? { dias_plazo: Number(d.dias_plazo) || 30 } : { medio_pago: d.medio_pago }),
      },
    });
    toast(`Compra registrada por ${cop(r.total)}`, 'ok');
    form.querySelector('[name=numero_factura_proveedor]').value = '';
    items.innerHTML = '';
    agregarLinea();
    calcularTotal();
    cargarLista();
  });

  cargarBodegas();
  await cargarLista();
}
