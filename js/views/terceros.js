// Terceros: lista de clientes y proveedores con búsqueda y edición de sus
// datos (NIT, razón social, dirección, correo para factura electrónica…).
import { api, invalidar } from '../api.js';
import { formularioTercero, activarFormularioTercero, leerTercero, digitoVerificacion } from '../tercero-form.js';
import { html, esc, toast, tabla, badge, alEnviar } from '../ui.js';

const TIPO = { cliente: ['Cliente', 'ok'], proveedor: ['Proveedor', 'brand'], ambos: ['Cliente y proveedor', 'warn'] };

// Documento con problemas evidentes (ej. NIT "1"): se marca para revisar.
function docSospechoso(t) {
  const n = String(t.numero_documento || '');
  if (!n) return true;
  if (t.tipo_documento === 'NIT') return !/^\d{6,10}$/.test(n);
  return ['CC', 'TI', 'RC', 'CE', 'TE'].includes(t.tipo_documento) && !/^\d{5,12}$/.test(n);
}

export async function vistaTerceros(root, params) {
  let terceros = [];
  let filtro = { texto: '', tipo: params?.get('tipo') || '' };

  root.innerHTML = html`
    <div class="page-head">
      <h1>Clientes y proveedores</h1>
      <span class="hint">Corrige aquí los datos de un tercero (NIT, razón social, dirección, correo). Las facturas que se envíen a la DIAN después del cambio salen con los datos nuevos.</span>
    </div>
    <div class="grid">
      <div class="card">
        <div class="row">
          <label><span>Buscar (nombre o documento)</span><input id="t-buscar" placeholder="Ej. Porto Madero o 902033593" /></label>
          <label class="w-sm"><span>Tipo</span>
            <select id="t-tipo">
              <option value="">Todos</option><option value="cliente">Clientes</option><option value="proveedor">Proveedores</option>
            </select>
          </label>
        </div>
        <div id="t-lista"><p class="muted">Cargando…</p></div>
      </div>
      <div>
        <div class="card" id="t-card" hidden>
          <h2 id="t-titulo">Editar</h2>
          <form id="t-form"></form>
        </div>
      </div>
    </div>
  `;

  const lista = root.querySelector('#t-lista');
  const card = root.querySelector('#t-card');
  const form = root.querySelector('#t-form');
  root.querySelector('#t-tipo').value = filtro.tipo;

  function pintar() {
    const q = filtro.texto.toLowerCase();
    const filas = terceros.filter((t) => (!filtro.tipo || t.tipo === filtro.tipo || t.tipo === 'ambos')
      && (!q || (t.nombre || '').toLowerCase().includes(q) || String(t.numero_documento || '').includes(q)));
    lista.innerHTML = tabla({
      columnas: [
        { titulo: 'Nombre', render: (t) => `${esc(t.nombre)}${t.activo === false ? ` ${badge('Inactivo', '')}` : ''}` },
        { titulo: 'Documento', render: (t) => `<span class="mono">${esc(t.tipo_documento || '')} ${esc(t.numero_documento || '—')}${t.tipo_documento === 'NIT' && /^\d{6,10}$/.test(t.numero_documento || '') ? `-${digitoVerificacion(t.numero_documento)}` : ''}</span>${docSospechoso(t) ? ` ${badge('Revisar', 'danger')}` : ''}` },
        { titulo: 'Tipo', render: (t) => badge(...(TIPO[t.tipo] || [t.tipo, ''])) },
        { titulo: 'Ciudad', render: (t) => esc(t.ciudad_id || '') },
        { titulo: 'Correo', render: (t) => esc(t.email || '') },
      ],
      filas,
      vacio: 'No hay terceros con ese filtro.',
      filaAttrs: (t) => `class="clickable" data-id="${esc(t.id)}"`,
    });
  }

  async function cargar() {
    terceros = await api('/terceros');
    pintar();
  }

  function editar(id) {
    const t = terceros.find((x) => x.id === id);
    if (!t) return;
    const rol = t.tipo === 'proveedor' ? 'proveedor' : 'cliente';
    card.hidden = false;
    root.querySelector('#t-titulo').textContent = `Editar · ${t.nombre}`;
    form.dataset.id = t.id;
    form.dataset.rol = rol;
    form.innerHTML = html`
      ${formularioTercero(t, { rol })}
      <div class="row">
        <button type="submit" class="btn-primary">Guardar cambios</button>
        <button type="button" class="btn-secondary" id="t-cancelar">Cancelar</button>
      </div>`;
    activarFormularioTercero(form, t);
    // En edición el "Tipo persona" y los datos ya existen: se abre la sección tributaria si tiene datos.
    if (t.regimen_renta || t.regimen_iva || t.cuenta_bancaria) form.querySelector('details')?.setAttribute('open', '');
    form.querySelector('#t-cancelar').addEventListener('click', () => { card.hidden = true; });
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  alEnviar(form, async () => {
    const d = leerTercero(form);
    const t = await api(`/terceros/${form.dataset.id}`, { method: 'PUT', body: { ...d, rol: form.dataset.rol } });
    invalidar('clientes', 'proveedores');
    const i = terceros.findIndex((x) => x.id === t.id);
    if (i >= 0) terceros[i] = t;
    terceros.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    pintar();
    card.hidden = true;
    toast(`"${t.nombre}" actualizado`, 'ok');
  });

  lista.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (tr) editar(tr.dataset.id);
  });
  root.querySelector('#t-buscar').addEventListener('input', (e) => { filtro.texto = e.target.value.trim(); pintar(); });
  root.querySelector('#t-tipo').addEventListener('change', (e) => { filtro.tipo = e.target.value; pintar(); });

  await cargar();
}
