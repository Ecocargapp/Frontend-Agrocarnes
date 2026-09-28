// Utilidades de interfaz: plantillas, formato y componentes pequeños.

export const html = (strings, ...values) =>
  strings.reduce((out, s, i) => out + s + (values[i] ?? ''), '');

export const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const fmtCOP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const fmtNum = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 });
const fmtFecha = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
const fmtDia = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' });

export const cop = (v) => fmtCOP.format(Number(v) || 0);
export const num = (v) => fmtNum.format(Number(v) || 0);
export const fecha = (v) => (v ? fmtFecha.format(new Date(v)) : '');
export const dia = (v) => (v ? fmtDia.format(new Date(v.length === 10 ? `${v}T12:00:00` : v)) : '');
export const hoy = () => new Date().toISOString().slice(0, 10);

let toastTimer;
export function toast(msg, tipo = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${tipo}`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, tipo === 'error' ? 6000 : 3500);
}

// <select> con opciones; `grupo` agrupa por una clave (ej. empresa).
export function opciones(items, { valor = 'id', texto = 'nombre', grupo, seleccionado, vacio } = {}) {
  const opt = (it) => {
    const t = typeof texto === 'function' ? texto(it) : it[texto];
    const sel = it[valor] === seleccionado ? ' selected' : '';
    return `<option value="${esc(it[valor])}"${sel}>${esc(t)}</option>`;
  };
  let out = vacio !== undefined ? `<option value="">${esc(vacio)}</option>` : '';
  if (!grupo) return out + items.map(opt).join('');
  const grupos = new Map();
  for (const it of items) {
    const g = typeof grupo === 'function' ? grupo(it) : it[grupo];
    if (!grupos.has(g)) grupos.set(g, []);
    grupos.get(g).push(it);
  }
  for (const [g, its] of grupos) out += `<optgroup label="${esc(g)}">${its.map(opt).join('')}</optgroup>`;
  return out;
}

export function tabla({ columnas, filas, vacio = 'Sin registros todavía.', filaAttrs }) {
  if (!filas.length) return `<p class="empty">${esc(vacio)}</p>`;
  const th = columnas.map((c) => `<th class="${c.num ? 'num' : ''}">${esc(c.titulo)}</th>`).join('');
  const tr = filas.map((f, i) => {
    const attrs = filaAttrs ? filaAttrs(f, i) : '';
    const td = columnas.map((c) => `<td class="${c.num ? 'num' : ''}">${c.render ? c.render(f) : esc(f[c.campo])}</td>`).join('');
    return `<tr ${attrs}>${td}</tr>`;
  }).join('');
  return `<div class="table-wrap"><table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
}

export function badge(texto, tipo = '') { return `<span class="badge ${tipo}">${esc(texto)}</span>`; }

export const datosForm = (form) => Object.fromEntries(new FormData(form).entries());

// Exporta un arreglo de objetos a un archivo .xlsx descargable.
//   columnas: [{ titulo: 'Fecha', campo: 'fecha' }, { titulo: 'Total', valor: (f) => Number(f.total) }]
//   filas: los datos (los mismos objetos que llenan las tablas en pantalla)
export function descargarExcel({ nombreArchivo, hoja = 'Hoja1', columnas, filas }) {
  if (!window.XLSX) { toast('No se pudo cargar el generador de Excel; revisa tu conexión e intenta de nuevo.', 'error'); return; }
  const encabezado = columnas.map((c) => c.titulo);
  const datos = filas.map((f) => columnas.map((c) => (c.valor ? c.valor(f) : f[c.campo] ?? '')));
  const hojaDatos = window.XLSX.utils.aoa_to_sheet([encabezado, ...datos]);
  hojaDatos['!cols'] = columnas.map((c) => ({ wch: c.ancho || 16 }));
  const libro = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(libro, hojaDatos, hoja);
  window.XLSX.writeFile(libro, nombreArchivo);
}

// Envuelve un handler de submit: deshabilita el botón, muestra errores como toast.
export function alEnviar(form, fn) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    try { await fn(e); }
    catch (err) { toast(err.message, 'error'); }
    finally { if (btn) btn.disabled = false; }
  });
}
