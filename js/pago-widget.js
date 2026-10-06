// Selector de pago: medio de pago + cuenta (caja, banco o tarjeta) + referencia.
// Lo usan Compras y Gastos de contado, los pagos y recibos de Cartera y las
// ventas de contado. La cuenta se filtra por empresa y por medio de pago
// (efectivo → cajas; transferencia/cheque/PSE → bancos; tarjeta de crédito
// → tarjetas al pagar, banco al recibir).
import { api } from './api.js';
import { esc } from './ui.js';

let cacheCuentas = null;
let cacheMedios = null;
export function invalidarCuentasPago() { cacheCuentas = null; }

async function datos() {
  if (!cacheCuentas) [cacheCuentas, cacheMedios] = await Promise.all([api('/cuentas-pago'), api('/cuentas-pago/medios')]);
  return { cuentas: cacheCuentas, medios: cacheMedios };
}

const ETIQUETA = { caja: 'Caja', banco: 'Banco', tarjeta_credito: 'Tarjeta' };

// contenedor: elemento donde se pinta. empresa(): id de la empresa actual.
// sentido: 'egreso' (sale dinero) | 'ingreso' (entra dinero).
export async function selectorPago(contenedor, { empresa, sentido = 'egreso', medioInicial = 'efectivo' }) {
  const { cuentas, medios } = await datos();
  const lista = sentido === 'ingreso' ? medios.filter((m) => m.id !== 'cheque' || true) : medios;
  contenedor.innerHTML = `
    <div class="row">
      <label><span>Medio de pago</span>
        <select data-p="medio">${lista.map((m) => `<option value="${m.id}"${m.id === medioInicial ? ' selected' : ''}>${esc(m.nombre)}</option>`).join('')}</select>
      </label>
      <label><span>${sentido === 'egreso' ? 'Sale de' : 'Entra a'}</span><select data-p="cuenta"></select></label>
    </div>
    <label data-p="ref-label"><span>Referencia</span><input data-p="referencia" placeholder="" /></label>
    <p class="muted" data-p="aviso" style="margin:0" hidden></p>`;
  const q = (k) => contenedor.querySelector(`[data-p=${k}]`);

  function tiposPara(medio) {
    if (medio === 'efectivo') return ['caja'];
    if (medio === 'tarjeta_credito') return sentido === 'egreso' ? ['tarjeta_credito'] : ['banco'];
    if (medio === 'otro') return ['caja', 'banco', 'tarjeta_credito'];
    return ['banco'];
  }
  function pintar() {
    const medio = q('medio').value;
    const tipos = tiposPara(medio);
    const opciones = cuentas.filter((c) => c.empresa_id === empresa() && c.activa && tipos.includes(c.tipo));
    const previa = q('cuenta').value;
    q('cuenta').innerHTML = opciones.length
      ? opciones.map((c) => `<option value="${c.id}"${c.id === previa ? ' selected' : ''}>${esc(ETIQUETA[c.tipo])} · ${esc(c.nombre)}</option>`).join('')
      : '<option value="">— sin cuentas configuradas —</option>';
    q('cuenta').disabled = !opciones.length;
    const aviso = q('aviso');
    aviso.hidden = opciones.length > 0;
    aviso.textContent = medio === 'efectivo' ? 'Esta empresa no tiene caja configurada.'
      : `No hay ${tipos.includes('tarjeta_credito') ? 'tarjetas de crédito' : 'cuentas bancarias'} registradas para esta empresa: agrégalas en Configuración → Cajas y cuentas bancarias.`;
    q('ref-label').hidden = medio === 'efectivo';
    q('referencia').placeholder = { cheque: 'N.° de cheque', tarjeta_credito: 'N.° de aprobación', tarjeta_debito: 'N.° de aprobación' }[medio] || 'N.° de transacción o comprobante (opcional)';
  }
  q('medio').addEventListener('change', pintar);
  pintar();

  return {
    recargar: pintar,
    leer: () => ({ medio_pago: q('medio').value, cuenta_pago_id: q('cuenta').value || null, referencia: q('referencia').value.trim() || null }),
    limpiar() { q('referencia').value = ''; },
  };
}
