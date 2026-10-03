// Gastos y activos fijos (separados de Compras de inventario). Un gasto se
// guarda como documento del proveedor: entra a cuentas por pagar si es a
// crédito, genera su asiento (51xx/52xx/53xx o 15xx) y, si tiene activos
// fijos, se deprecian solos cada mes.
import { api, catalogo, invalidar } from '../api.js';
import { formularioTercero, activarFormularioTercero, leerTercero } from '../tercero-form.js';
import { html, esc, cop, dia, hoy, toast, opciones, tabla, badge, datosForm, alEnviar, descargarExcel } from '../ui.js';
import { widgetRetencion } from '../retencion-widget.js';

const MEDIOS_PAGO = ['efectivo', 'transferencia', 'tarjeta', 'otro'];

export async function vistaGastos(root) {
  const [empresas, proveedores, cat] = await Promise.all([catalogo('empresas'), catalogo('proveedores'), api('/gastos/catalogos')]);
  const categorias = Object.entries(cat.categorias).map(([id, c]) => ({ id, ...c }));
  const clases = Object.entries(cat.clases_activo).map(([id, c]) => ({ id, ...c }));

  root.innerHTML = html`
    <div class="page-head">
      <h1>Gastos y activos fijos</h1>
      <span class="hint">Arriendos, servicios, nómina, honorarios… y compras de equipos, muebles o vehículos. La mercancía para vender va en <a href="#compras">Compras</a>.</span>
    </div>
    <div class="grid">
      <div>
        <div class="card">
          <h2>Registrar gasto</h2>
          <form id="form-gasto">
            <label><span>Empresa / centro de costo</span><select name="empresa_id" id="g-empresa" required>${opciones(empresas)}</select></label>
            <label><span>Proveedor</span>
              <div class="row">
                <select name="proveedor_id" id="g-proveedor" required>${opciones(proveedores, { vacio: 'Selecciona…' })}</select>
                <button type="button" class="btn-secondary w-sm" id="btn-nuevo-prov">+ Nuevo</button>
              </div>
            </label>
            <div class="row">
              <label><span>N° factura / documento</span><input name="numero_factura_proveedor" placeholder="Opcional" /></label>
              <label class="w-sm"><span>Fecha</span><input type="date" name="fecha" value="${hoy()}" /></label>
            </div>
            <label><span>Descripción</span><input name="descripcion" placeholder="Ej. Arriendo local octubre" /></label>
            <div class="row">
              <label class="w-sm"><span>Forma de pago</span>
                <select id="g-forma" name="forma_pago"><option value="contado">Contado</option><option value="credito">Crédito</option></select>
              </label>
              <label id="g-medio-label"><span>Medio de pago</span>
                <select name="medio_pago">${MEDIOS_PAGO.map((m) => `<option value="${m}"${m === 'transferencia' ? ' selected' : ''}>${esc(m[0].toUpperCase() + m.slice(1))}</option>`).join('')}</select>
              </label>
              <label id="g-plazo-label" hidden><span>Plazo (días)</span><input type="number" name="dias_plazo" value="30" min="1" /></label>
            </div>
            <div>
              <span class="muted">Renglones</span>
              <div class="items" id="g-items"></div>
              <div class="row">
                <button type="button" class="btn-link" id="btn-gasto">+ Gasto</button>
                <button type="button" class="btn-link" id="btn-activo">+ Activo fijo</button>
              </div>
            </div>
            <div id="g-retencion"></div>
            <div class="resumen-doc" id="g-total"></div>
            <button type="submit" class="btn-primary">Registrar gasto</button>
          </form>
        </div>
        <div class="card" id="card-prov" hidden>
          <h2>Nuevo proveedor</h2>
          <form id="form-prov">
            ${formularioTercero({}, { rol: 'proveedor' })}
            <div class="row">
              <button type="submit" class="btn-primary">Guardar proveedor</button>
              <button type="button" class="btn-secondary" id="btn-cancelar-prov">Cancelar</button>
            </div>
          </form>
        </div>
      </div>
      <div>
        <div class="card">
          <h2>Últimos gastos</h2>
          <div id="lista-gastos"></div>
        </div>
        <div class="card" id="card-detalle" hidden>
          <h2 id="titulo-detalle">Detalle</h2>
          <div id="detalle"></div>
        </div>
        <div class="card">
          <h2>Activos fijos</h2>
          <p class="muted">Se deprecian en línea recta cada mes (vida útil fiscal). La depreciación va aparte de los gastos para calcular el EBITDA.</p>
          <div id="lista-activos"></div>
        </div>
      </div>
    </div>
  `;

  const form = root.querySelector('#form-gasto');
  const selEmpresa = root.querySelector('#g-empresa');
  const selProv = root.querySelector('#g-proveedor');
  const selForma = root.querySelector('#g-forma');
  const items = root.querySelector('#g-items');
  const totalEl = root.querySelector('#g-total');

  function actualizarForma() {
    const credito = selForma.value === 'credito';
    root.querySelector('#g-medio-label').hidden = credito;
    root.querySelector('#g-plazo-label').hidden = !credito;
  }
  selForma.addEventListener('change', actualizarForma);
  actualizarForma();

  const IVA = '<option value="0">IVA 0%</option><option value="5">5%</option><option value="19">19%</option>';

  function agregarRenglon(tipo) {
    const div = document.createElement('div');
    div.className = 'linea';
    div.dataset.tipo = tipo;
    div.innerHTML = tipo === 'gasto' ? html`
      <div class="row">
        <select data-campo="categoria">${categorias.map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('')}</select>
        <button type="button" class="btn-icon w-xs" title="Quitar">✕</button>
      </div>
      <div class="row">
        <input data-campo="descripcion" placeholder="Detalle (opcional)" />
        <input class="w-sm" data-campo="valor" type="number" step="1" min="0" placeholder="Valor sin IVA" required />
        <select class="w-sm" data-campo="iva_pct">${IVA}</select>
      </div>` : html`
      <div class="row">
        <span class="badge brand">Activo fijo</span>
        <select data-campo="clase">${clases.map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('')}</select>
        <button type="button" class="btn-icon w-xs" title="Quitar">✕</button>
      </div>
      <div class="row">
        <input data-campo="descripcion" placeholder="Ej. Nevera vertical 2 puertas" required />
        <input class="w-sm" data-campo="valor" type="number" step="1" min="0" placeholder="Valor sin IVA" required />
        <select class="w-sm" data-campo="iva_pct">${IVA}</select>
      </div>
      <p class="muted" data-campo="vida" style="margin:0 0 6px"></p>`;
    div.querySelector('button').addEventListener('click', () => { div.remove(); calcular(); });
    div.querySelectorAll('input, select').forEach((i) => i.addEventListener('input', calcular));
    const selCat = div.querySelector('[data-campo=categoria]');
    if (selCat) selCat.addEventListener('change', () => { const c = cat.categorias[selCat.value]; if (c) ret?.fijarConcepto(c.retencion); calcular(); });
    const selClase = div.querySelector('[data-campo=clase]');
    if (selClase) {
      const vida = () => { const c = cat.clases_activo[selClase.value]; div.querySelector('[data-campo=vida]').textContent = c.vida_util_meses ? `Se deprecia en ${c.vida_util_meses / 12} años (${c.vida_util_meses} meses). El IVA se suma al costo del activo.` : 'Los terrenos no se deprecian.'; };
      selClase.addEventListener('change', vida); vida();
      ret?.fijarConcepto('compras');
    } else {
      ret?.fijarConcepto(cat.categorias[selCat.value]?.retencion);
    }
    items.appendChild(div);
    calcular();
  }

  function leerRenglones() {
    return [...items.querySelectorAll('.linea')].map((l) => {
      const v = (k) => l.querySelector(`[data-campo=${k}]`)?.value;
      return l.dataset.tipo === 'gasto'
        ? { tipo: 'gasto', categoria: v('categoria'), descripcion: v('descripcion'), valor: Number(v('valor')) || 0, iva_pct: Number(v('iva_pct')) || 0 }
        : { tipo: 'activo_fijo', clase: v('clase'), descripcion: v('descripcion'), valor: Number(v('valor')) || 0, iva_pct: Number(v('iva_pct')) || 0 };
    });
  }

  let ret = null;
  function pintar() {
    const rs = leerRenglones();
    const sub = rs.reduce((a, r) => a + r.valor, 0);
    const iva = rs.reduce((a, r) => a + r.valor * r.iva_pct / 100, 0);
    const r = ret ? ret.total() : 0;
    totalEl.innerHTML = `<div><span>Subtotal</span><b>${cop(sub)}</b></div><div><span>IVA</span><b>${cop(iva)}</b></div>`
      + `<div><span>Retenciones</span><b>− ${cop(r)}</b></div><div class="total"><span>Neto a pagar</span><b>${cop(sub + iva - r)}</b></div>`;
    return { sub, iva };
  }
  function calcular() {
    const { sub, iva } = pintar();
    ret?.recalcular({ empresa_id: selEmpresa.value, proveedor_id: selProv.value, base: sub, iva });
  }

  async function cargarLista() {
    const gastos = await api('/gastos');
    root.querySelector('#lista-gastos').innerHTML = tabla({
      columnas: [
        { titulo: 'Fecha', render: (g) => dia(g.fecha) },
        { titulo: 'Empresa', campo: 'empresa' },
        { titulo: 'Proveedor', render: (g) => `${esc(g.proveedor)}${g.descripcion ? `<br><span class="muted">${esc(g.descripcion)}</span>` : ''}` },
        { titulo: 'Tipo', render: (g) => (g.tiene_activo ? badge('Activo fijo', 'brand') : esc((g.categorias || '').split(', ').map((c) => cat.categorias[c]?.nombre.split(' (')[0] || c).join(', '))) },
        { titulo: 'Subtotal', num: true, render: (g) => cop(g.subtotal) },
        { titulo: 'Ret.', num: true, render: (g) => { const r = Number(g.retefuente) + Number(g.reteiva) + Number(g.reteica); return r ? cop(r) : '—'; } },
        { titulo: 'Neto', num: true, render: (g) => cop(g.total) },
        { titulo: 'Saldo', num: true, render: (g) => (Number(g.saldo) > 0 ? cop(g.saldo) : '—') },
      ],
      filas: gastos,
      vacio: 'Todavía no hay gastos registrados.',
      filaAttrs: (g) => `class="clickable" data-id="${g.id}" data-titulo="${esc(`${g.proveedor} · ${dia(g.fecha)}`)}"`,
    });
  }

  async function cargarActivos() {
    const activos = await api('/gastos/activos-fijos');
    root.querySelector('#lista-activos').innerHTML = tabla({
      columnas: [
        { titulo: 'Activo', render: (a) => `${esc(a.descripcion)}<br><span class="muted">${esc(cat.clases_activo[a.clase]?.nombre || a.clase)} · ${esc(a.empresa)}</span>` },
        { titulo: 'Compra', render: (a) => dia(a.fecha_compra) },
        { titulo: 'Costo', num: true, render: (a) => cop(a.costo) },
        { titulo: 'Dep. acumulada', num: true, render: (a) => cop(a.depreciacion_acumulada) },
        { titulo: 'Valor en libros', num: true, render: (a) => cop(a.valor_en_libros) },
        { titulo: 'Cuota mensual', num: true, render: (a) => (a.vida_util_meses ? cop(Number(a.costo) / a.vida_util_meses) : '—') },
      ],
      filas: activos,
      vacio: 'No hay activos fijos registrados.',
    });
  }

  async function verDetalle(id, titulo) {
    const card = root.querySelector('#card-detalle');
    card.hidden = false;
    root.querySelector('#titulo-detalle').textContent = `Detalle · ${titulo}`;
    const rs = await api(`/gastos/${id}`);
    root.querySelector('#detalle').innerHTML = tabla({
      columnas: [
        { titulo: 'Tipo', render: (r) => (r.tipo === 'activo_fijo' ? badge('Activo fijo', 'brand') : esc(cat.categorias[r.categoria]?.nombre || r.categoria)) },
        { titulo: 'Detalle', campo: 'descripcion' },
        { titulo: 'Cuenta', render: (r) => `<span class="mono">${esc(r.cuenta)}</span>` },
        { titulo: 'Valor', num: true, render: (r) => cop(r.valor) },
        { titulo: 'IVA', num: true, render: (r) => `${Number(r.iva_pct)}%` },
      ],
      filas: rs,
    });
  }
  root.querySelector('#lista-gastos').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (tr) verDetalle(tr.dataset.id, tr.dataset.titulo);
  });

  root.querySelector('#btn-gasto').addEventListener('click', () => agregarRenglon('gasto'));
  root.querySelector('#btn-activo').addEventListener('click', () => agregarRenglon('activo_fijo'));
  selProv.addEventListener('change', calcular);
  selEmpresa.addEventListener('change', calcular);

  // Proveedor nuevo
  const cardProv = root.querySelector('#card-prov');
  activarFormularioTercero(root.querySelector('#form-prov'));
  root.querySelector('#btn-nuevo-prov').addEventListener('click', () => { cardProv.hidden = false; cardProv.querySelector('input').focus(); });
  root.querySelector('#btn-cancelar-prov').addEventListener('click', () => { cardProv.hidden = true; });
  alEnviar(root.querySelector('#form-prov'), async (e) => {
    const p = await api('/terceros', { method: 'POST', body: { tipo: 'proveedor', ...leerTercero(e.target) } });
    invalidar('proveedores');
    proveedores.push(p);
    selProv.innerHTML = opciones(proveedores, { vacio: 'Selecciona…', seleccionado: p.id });
    e.target.reset();
    activarFormularioTercero(e.target);
    cardProv.hidden = true;
    toast(`Proveedor "${p.nombre}" creado`, 'ok');
    calcular();
  });

  alEnviar(form, async () => {
    const rs = leerRenglones();
    if (!rs.length) throw new Error('Agrega al menos un renglón (gasto o activo fijo)');
    if (rs.some((r) => !(r.valor > 0))) throw new Error('Cada renglón necesita un valor');
    if (rs.some((r) => r.tipo === 'activo_fijo' && !r.descripcion?.trim())) throw new Error('Describe cada activo fijo');
    const d = datosForm(form);
    const r = await api('/gastos', {
      method: 'POST',
      body: {
        empresa_id: d.empresa_id, proveedor_id: d.proveedor_id, numero_factura_proveedor: d.numero_factura_proveedor || null,
        fecha: d.fecha, descripcion: d.descripcion || null, forma_pago: d.forma_pago,
        ...(d.forma_pago === 'credito' ? { dias_plazo: Number(d.dias_plazo) || 30 } : { medio_pago: d.medio_pago }),
        items: rs, ...ret.leer(),
      },
    });
    toast(`Gasto registrado · neto a pagar ${cop(r.total)}${r.retefuente ? ` (retención ${cop(r.retefuente)})` : ''}`, 'ok');
    form.querySelector('[name=numero_factura_proveedor]').value = '';
    form.querySelector('[name=descripcion]').value = '';
    items.innerHTML = '';
    ret.reiniciar();
    agregarRenglon('gasto');
    await Promise.all([cargarLista(), cargarActivos()]);
  });

  ret = await widgetRetencion(root.querySelector('#g-retencion'), { alCambiar: pintar });
  agregarRenglon('gasto');
  await Promise.all([cargarLista(), cargarActivos()]);
}
