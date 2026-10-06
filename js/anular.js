// Anulación de documentos con doble confirmación:
//   1) se explica qué va a pasar y se pide el motivo;
//   2) se pide escribir ANULAR para confirmar definitivamente.
// Solo lo ven los administradores (el servidor también lo exige).
import { api, session } from './api.js';
import { esc, toast } from './ui.js';

export const puedeAnular = () => session.usuario?.rol === 'admin';

export function botonAnular(tipo, id, extra = '') {
  if (!puedeAnular()) return '';
  return `<button type="button" class="btn-anular" data-anular="${esc(tipo)}" data-id="${esc(id)}" ${extra} title="Anular este documento">Anular</button>`;
}

// Diálogo de dos pasos. Devuelve el motivo o null si se cancela.
export function confirmarAnulacion({ titulo, consecuencias = [] }) {
  return new Promise((resolve) => {
    const fondo = document.createElement('div');
    fondo.className = 'modal-fondo';
    fondo.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="anular-titulo">
        <div data-paso="1">
          <h2 id="anular-titulo">Anular ${esc(titulo)}</h2>
          <p>Al anular:</p>
          <ul>${consecuencias.map((c) => `<li>${esc(c)}</li>`).join('')}
            <li>El documento no se borra: queda marcado como <b>anulado</b> con el motivo, la fecha y quién lo anuló.</li>
          </ul>
          <label><span>Motivo de la anulación</span><textarea data-motivo rows="3" placeholder="Ej. Factura del proveedor registrada dos veces"></textarea></label>
          <p class="error" data-error hidden></p>
          <div class="row modal-botones">
            <button type="button" class="btn-secondary" data-cancelar>Cancelar</button>
            <button type="button" class="btn-primary" data-continuar>Continuar</button>
          </div>
        </div>
        <div data-paso="2" hidden>
          <h2>¿Seguro que quieres anular ${esc(titulo)}?</h2>
          <p class="error">Esta acción no se puede deshacer.</p>
          <p>Motivo: <i data-motivo-txt></i></p>
          <label><span>Escribe <b>ANULAR</b> para confirmar</span><input data-confirmar autocomplete="off" /></label>
          <div class="row modal-botones">
            <button type="button" class="btn-secondary" data-volver>Volver</button>
            <button type="button" class="btn-peligro" data-definitivo disabled>Anular definitivamente</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(fondo);
    const q = (s) => fondo.querySelector(s);
    const cerrar = (v) => { fondo.remove(); document.removeEventListener('keydown', esc_); resolve(v); };
    const esc_ = (e) => { if (e.key === 'Escape') cerrar(null); };
    document.addEventListener('keydown', esc_);
    q('[data-motivo]').focus();
    q('[data-cancelar]').onclick = () => cerrar(null);
    fondo.addEventListener('click', (e) => { if (e.target === fondo) cerrar(null); });
    q('[data-continuar]').onclick = () => {
      const m = q('[data-motivo]').value.trim();
      if (m.length < 5) { q('[data-error]').textContent = 'Escribe el motivo (mínimo 5 caracteres).'; q('[data-error]').hidden = false; return; }
      q('[data-motivo-txt]').textContent = m;
      q('[data-paso="1"]').hidden = true; q('[data-paso="2"]').hidden = false;
      q('[data-confirmar]').focus();
    };
    q('[data-volver]').onclick = () => { q('[data-paso="2"]').hidden = true; q('[data-paso="1"]').hidden = false; };
    q('[data-confirmar]').oninput = (e) => { q('[data-definitivo]').disabled = e.target.value.trim().toUpperCase() !== 'ANULAR'; };
    q('[data-definitivo]').onclick = () => cerrar(q('[data-motivo]').value.trim());
  });
}

// Qué pasa al anular cada tipo de documento y a qué ruta se llama.
const TIPOS = {
  compra: { titulo: 'esta compra', ruta: (id) => `/compras/${id}/anular`, consecuencias: [
    'Sale del inventario la mercancía que entró con la compra (si ya se vendió, no se podrá anular).',
    'Se elimina la cuenta por pagar y su asiento contable (IVA descontable y retenciones incluidos).',
    'Si fue de contado, también se anula su comprobante de egreso.'] },
  gasto: { titulo: 'este gasto', ruta: (id) => `/gastos/${id}/anular`, consecuencias: [
    'Se elimina la cuenta por pagar y su asiento contable (IVA y retenciones incluidos).',
    'Si incluía activos fijos, se dan de baja y se eliminan sus depreciaciones.',
    'Si fue de contado, también se anula su comprobante de egreso.'] },
  factura: { titulo: 'esta factura', ruta: (id) => `/ventas/${id}/anular`, consecuencias: [
    'La mercancía vuelve al inventario.',
    'Se elimina la cuenta por cobrar y su asiento contable.',
    'Si se cobró con un recibo que solo cubría esta factura, el recibo también se anula.'] },
  factura_electronica: { titulo: 'esta factura electrónica', consecuencias: [
    'Como ya fue aceptada por la DIAN, se emite una NOTA CRÉDITO de anulación por el total y se envía a la DIAN.',
    'La mercancía vuelve al inventario y se reversa la venta en la contabilidad.'] },
  recibo: { titulo: 'este recibo de caja', ruta: (id) => `/cartera/recibos/${id}/anular`, consecuencias: [
    'Las facturas que pagaba vuelven a quedar con saldo por cobrar.',
    'Se elimina su asiento: el dinero sale de la caja o banco donde había entrado.'] },
  egreso: { titulo: 'este comprobante de egreso', ruta: (id) => `/cartera/pagos/${id}/anular`, consecuencias: [
    'Las compras y gastos que pagaba vuelven a quedar con saldo por pagar.',
    'Se elimina su asiento: el dinero vuelve a la caja, banco o tarjeta de donde había salido.'] },
  traslado: { titulo: 'este traslado', ruta: (id) => `/traslados/${id}/anular`, consecuencias: [
    'El producto vuelve de la bodega de destino a la de origen (si ya se usó en destino, no se podrá anular).'] },
  produccion: { titulo: 'esta orden de producción', ruta: (id) => `/produccion/${id}/anular`, consecuencias: [
    'Sale del inventario el producto terminado y vuelven los insumos que se consumieron.'] },
};

// Conecta los botones [data-anular] dentro de `contenedor`. `alTerminar` recarga la vista.
export function activarAnulaciones(contenedor, alTerminar) {
  contenedor.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-anular]');
    if (!b) return;
    e.stopPropagation();
    const tipo = TIPOS[b.dataset.anular];
    const motivo = await confirmarAnulacion({ titulo: b.dataset.titulo || tipo.titulo, consecuencias: tipo.consecuencias });
    if (!motivo) return;
    b.disabled = true;
    try {
      if (b.dataset.anular === 'factura_electronica') {
        const r = await api('/notas-credito', { method: 'POST', body: { factura_venta_id: b.dataset.id, anulacion: true, reingresa_inventario: true, notas: motivo } });
        toast(`Nota crédito ${r.consecutivo} emitida: la factura quedó anulada`, 'ok');
      } else {
        const r = await api(tipo.ruta(b.dataset.id), { method: 'POST', body: { motivo } });
        const extra = r.egresos_anulados ? ` (y ${r.egresos_anulados} egreso)` : r.recibos_anulados ? ` (y ${r.recibos_anulados} recibo)` : '';
        toast(`Se anuló ${b.dataset.titulo || tipo.titulo}${extra}`, 'ok');
      }
      await alTerminar?.();
    } catch (err) {
      toast(err.message, 'error');
      b.disabled = false;
    }
  }, true);
}

export const marcaAnulado = (doc) => (doc.estado === 'anulado' || doc.estado === 'anulada'
  ? ` <span class="badge danger" title="${esc(doc.motivo_anulacion || '')}">Anulado</span>` : '');

const esAnulado = (doc) => doc.estado === 'anulado' || doc.estado === 'anulada';

// Columna para las tablas: botón "Anular" si está vigente, o la marca "Anulado" con el motivo.
export const columnaAnular = (tipo, titulo) => ({
  titulo: '',
  render: (doc) => (esAnulado(doc) ? marcaAnulado(doc) : botonAnular(tipo, doc.id, titulo ? `data-titulo="${esc(titulo(doc))}"` : '')),
});

// Clase extra para la fila de un documento anulado (texto tachado y gris).
export const claseAnulado = (doc) => (esAnulado(doc) ? ' anulado' : '');
