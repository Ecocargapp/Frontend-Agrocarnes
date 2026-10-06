// Comprobante de egreso imprimible (se abre en una ventana y lanza imprimir).
import { api } from './api.js';
import { esc } from './ui.js';

const fmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const cop = (n) => fmt.format(Math.round(Number(n) || 0));
const MEDIOS = { efectivo: 'Efectivo', transferencia: 'Transferencia', pse: 'PSE', consignacion: 'Consignación', cheque: 'Cheque', tarjeta_debito: 'Tarjeta débito', tarjeta_credito: 'Tarjeta de crédito', tarjeta: 'Tarjeta', otro: 'Otro' };

// Número en letras (pesos colombianos), para el "son:" del comprobante.
export function enLetras(valor) {
  const U = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince',
    'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
  const D = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
  const C = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];
  const cientos = (n) => {
    if (n === 100) return 'cien';
    const c = Math.floor(n / 100); const r = n % 100;
    const dec = r < 30 ? U[r] : `${D[Math.floor(r / 10)]}${r % 10 ? ` y ${U[r % 10]}` : ''}`;
    return [C[c], dec].filter(Boolean).join(' ');
  };
  // "uno" se apocopa delante de sustantivo: veintiún mil, un millón, treinta y un pesos.
  const apocope = (t) => t.replace(/veintiuno$/, 'veintiún').replace(/uno$/, 'un');
  const miles = (n) => {
    const m = Math.floor(n / 1000); const r = n % 1000;
    const pm = m === 0 ? '' : m === 1 ? 'mil' : `${apocope(cientos(m))} mil`;
    return [pm, cientos(r)].filter(Boolean).join(' ');
  };
  let n = Math.round(Number(valor) || 0);
  if (n === 0) return 'cero pesos';
  const mill = Math.floor(n / 1e6); const resto = n % 1e6;
  const pm = mill === 0 ? '' : mill === 1 ? 'un millón' : `${apocope(miles(mill))} millones`;
  const txt = [pm, apocope(miles(resto))].filter(Boolean).join(' ');
  return `${txt}${resto === 0 && mill > 0 ? ' de' : ''} ${n === 1 ? 'peso' : 'pesos'} m/cte`.replace(/^./, (c) => c.toUpperCase());
}

export async function imprimirEgreso(id) {
  const ventana = window.open('', '_blank');
  if (ventana) ventana.document.write('<p style="font-family:sans-serif">Preparando comprobante…</p>');
  const e = await api(`/cartera/pagos/${id}/comprobante`);
  const fecha = new Date(`${String(e.fecha).slice(0, 10)}T12:00:00`).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });
  const docs = e.documentos.map((d) => `
    <tr>
      <td>${d.clase === 'gasto' ? 'Gasto' : 'Compra'} ${esc(d.numero_factura_proveedor || '')}<br><small>${esc(d.descripcion || d.detalle_gasto || '')}</small></td>
      <td>${esc(String(d.fecha).slice(0, 10))}</td>
      <td class="n">${cop(Number(d.subtotal) + Number(d.iva))}</td>
      <td class="n">${cop(Number(d.retefuente) + Number(d.reteiva) + Number(d.reteica))}</td>
      <td class="n"><b>${cop(d.pagado)}</b></td>
    </tr>`).join('');
  const asiento = e.asiento.map((l) => `<tr><td>${esc(l.cuenta)}</td><td>${esc(l.nombre)}</td><td class="n">${Number(l.debito) ? cop(l.debito) : ''}</td><td class="n">${Number(l.credito) ? cop(l.credito) : ''}</td></tr>`).join('');
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Comprobante de egreso ${e.consecutivo}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111; margin: 24px; font-size: 12px; }
    .enc { display: flex; justify-content: space-between; border-bottom: 2px solid #111; padding-bottom: 8px; }
    .enc h1 { font-size: 16px; margin: 0; } .num { font-size: 18px; font-weight: bold; text-align: right; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; } th, td { border: 1px solid #999; padding: 5px 6px; text-align: left; vertical-align: top; }
    th { background: #eee; } .n { text-align: right; white-space: nowrap; } small { color: #555; }
    .datos td { border: none; padding: 3px 6px; } .valor { font-size: 15px; font-weight: bold; }
    .firmas { display: flex; gap: 24px; margin-top: 48px; } .firmas div { flex: 1; border-top: 1px solid #111; padding-top: 4px; text-align: center; }
    @media print { body { margin: 10mm; } }
  </style></head><body>
  <div class="enc">
    <div><h1>${esc(e.empresa)}</h1>${e.empresa_nit ? `<div>NIT ${esc(e.empresa_nit)}</div>` : ''}</div>
    <div class="num">COMPROBANTE DE EGRESO<br>N.° ${esc(e.consecutivo)}</div>
  </div>
  <table class="datos">
    <tr><td><b>Fecha:</b> ${esc(fecha)}</td><td><b>Valor:</b> <span class="valor">${cop(e.total)}</span></td></tr>
    <tr><td colspan="2"><b>Pagado a:</b> ${esc(e.beneficiario)} · ${esc(e.tipo_documento || '')} ${esc(e.numero_documento || '')}</td></tr>
    <tr><td colspan="2"><b>La suma de:</b> ${esc(enLetras(e.total))}</td></tr>
    <tr><td><b>Medio de pago:</b> ${esc(MEDIOS[e.medio_pago] || e.medio_pago)}${e.referencia ? ` · Ref. ${esc(e.referencia)}` : ''}</td>
        <td><b>Pagado desde:</b> ${esc(e.cuenta_pago || 'Sin cuenta asignada')}${e.cuenta_numero ? ` (N.° ${esc(e.cuenta_numero)})` : ''}</td></tr>
    ${e.notas ? `<tr><td colspan="2"><b>Concepto:</b> ${esc(e.notas)}</td></tr>` : ''}
  </table>
  <table><thead><tr><th>Documento pagado</th><th>Fecha</th><th class="n">Valor + IVA</th><th class="n">Retenciones</th><th class="n">Pagado</th></tr></thead><tbody>${docs}</tbody></table>
  <table><thead><tr><th>Cuenta</th><th>Nombre</th><th class="n">Débito</th><th class="n">Crédito</th></tr></thead><tbody>${asiento}</tbody></table>
  <div class="firmas"><div>Elaboró${e.elaborado_por ? `: ${esc(e.elaborado_por)}` : ''}</div><div>Aprobó</div><div>Recibí conforme (firma y C.C./NIT)</div></div>
  <script>window.onload = () => setTimeout(() => window.print(), 300);<\/script>
  </body></html>`;
  if (ventana) { ventana.document.open(); ventana.document.write(html); ventana.document.close(); }
}
