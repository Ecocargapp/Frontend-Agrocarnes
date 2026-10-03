// Bloque de retenciones para Compras y Gastos: concepto + retefuente, reteIVA
// y reteICA calculadas por el servidor (tabla Decreto 572/2025, bases en UVT).
// Si el usuario escribe un valor a mano, ese valor se respeta hasta que cambie
// el concepto.
import { api } from './api.js';
import { html, esc, cop } from './ui.js';

let conceptosCache = null;
export async function conceptosRetencion() {
  if (!conceptosCache) conceptosCache = (await api('/gastos/catalogos')).conceptos_retencion;
  return conceptosCache;
}

export async function widgetRetencion(contenedor, { alCambiar } = {}) {
  const conceptos = await conceptosRetencion();
  contenedor.innerHTML = html`
    <div class="ret-widget">
      <label><span>Retención en la fuente que practicamos</span>
        <select data-r="concepto">${conceptos.map((c) => `<option value="${esc(c.codigo)}">${esc(c.nombre)}${Number(c.tarifa_declarante) ? ` · ${Number(c.tarifa_declarante)}%${Number(c.base_uvt) ? ` (base ${Number(c.base_uvt)} UVT)` : ''}` : ''}</option>`).join('')}</select>
      </label>
      <div class="row">
        <label><span>Retefuente</span><input data-r="retefuente" type="number" step="1" min="0" value="0" /></label>
        <label><span>ReteIVA</span><input data-r="reteiva" type="number" step="1" min="0" value="0" /></label>
        <label><span>ReteICA</span><input data-r="reteica" type="number" step="1" min="0" value="0" /></label>
      </div>
      <p class="muted" data-r="motivo" style="margin:0"></p>
    </div>`;
  const q = (k) => contenedor.querySelector(`[data-r=${k}]`);
  const manual = new Set();
  let ultimo = {};
  ['retefuente', 'reteiva', 'reteica'].forEach((k) => q(k).addEventListener('input', () => { manual.add(k); alCambiar?.(); }));
  q('concepto').addEventListener('change', () => { manual.clear(); recalcular(ultimo); });

  let timer;
  async function recalcular(datos) {
    ultimo = datos;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (!datos.empresa_id || !datos.proveedor_id || !(datos.base > 0)) {
        q('motivo').textContent = 'Se calcula al elegir proveedor y digitar valores.';
        ['retefuente', 'reteiva', 'reteica'].forEach((k) => { if (!manual.has(k)) q(k).value = 0; });
        alCambiar?.();
        return;
      }
      const r = await api('/gastos/calcular-retenciones', { method: 'POST', body: { ...datos, concepto: q('concepto').value } });
      ['retefuente', 'reteiva', 'reteica'].forEach((k) => { if (!manual.has(k)) q(k).value = r[k]; });
      q('motivo').textContent = r.motivo || (r.tarifa ? `Tarifa ${r.tarifa}% sobre ${cop(datos.base)}.` : '');
      alCambiar?.();
    }, 250);
  }

  return {
    recalcular,
    fijarConcepto(codigo) { if (codigo && q('concepto').value !== codigo) { q('concepto').value = codigo; manual.clear(); } },
    total: () => ['retefuente', 'reteiva', 'reteica'].reduce((a, k) => a + (Number(q(k).value) || 0), 0),
    leer: () => ({
      concepto_retencion: q('concepto').value,
      retefuente: Number(q('retefuente').value) || 0,
      reteiva: Number(q('reteiva').value) || 0,
      reteica: Number(q('reteica').value) || 0,
    }),
    reiniciar() { manual.clear(); q('concepto').value = 'ninguna'; ['retefuente', 'reteiva', 'reteica'].forEach((k) => { q(k).value = 0; }); q('motivo').textContent = ''; },
  };
}
