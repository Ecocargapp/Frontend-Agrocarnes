// Formulario de tercero (cliente o proveedor) con los mismos campos de la
// plantilla de importación de terceros del software contable
// (Template-7580.xlsx). Lo usan Ventas (clientes) y Compras (proveedores).
import { html, esc } from './ui.js';

const opt = (pares, sel) => pares.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(sel ?? '') ? 'selected' : ''}>${esc(t)}</option>`).join('');

export const TIPOS_DOCUMENTO = [
  ['CC', '13 · Cédula'], ['NIT', '31 · NIT'], ['CE', '22 · Cédula de extranjería'], ['TE', '21 · Tarjeta de extranjería'],
  ['PA', '41 · Pasaporte'], ['DE', '42 · Documento extranjero'], ['TI', '12 · Tarjeta de identidad'], ['RC', '11 · Registro civil'], ['EX', '43 · Exógena'],
];
const CODIGO_DOC = Object.fromEntries(TIPOS_DOCUMENTO.map(([v, t]) => [v, t.split(' ')[0]]));

const REGIMEN_RENTA = {
  natural: [['4', '4 · Régimen ordinario'], ['6', '6 · Persona natural no retenedora'], ['10', '10 · Régimen simple'], ['7', '7 · Extranjero domiciliado'], ['8', '8 · Extranjero no domiciliado']],
  juridica: [['4', '4 · Régimen ordinario'], ['3', '3 · Gran contribuyente'], ['2', '2 · Régimen especial'], ['10', '10 · Régimen simple'], ['1', '1 · Entidad estatal']],
};
const REGIMEN_IVA = {
  natural: [['3', '3 · Responsable de IVA (48)'], ['4', '4 · No responsable de IVA (49)']],
  juridica: [['3', '3 · Responsable de IVA (48)'], ['2', '2 · Agente retenedor / gran contribuyente'], ['1', '1 · Entidad del Estado']],
};
const REGIMEN_ICA = {
  natural: [['2', '2 · Régimen común'], ['3', '3 · Profesional independiente'], ['4', '4 · Régimen simplificado'], ['8', '8 · Transportador']],
  juridica: [['2', '2 · Régimen común'], ['7', '7 · Gran contribuyente'], ['6', '6 · Consorcio o UT'], ['8', '8 · Transportador'], ['1', '1 · Entidad del Estado']],
};
const BANCOS = [['1', 'Bco. Bogotá'], ['2', 'Bco. Popular'], ['6', 'Itaú'], ['7', 'Bancolombia'], ['9', 'Citibank'], ['10', 'HSBC'], ['12', 'Sudameris'],
  ['13', 'BBVA'], ['14', 'Helm Bank'], ['19', 'Red Colpatria'], ['23', 'Occidente'], ['32', 'Caja Social'], ['40', 'Bco. Agrario'], ['51', 'Davivienda'],
  ['52', 'AV Villas'], ['58', 'Procredit'], ['60', 'Pichincha'], ['61', 'Bancoomeva'], ['76', 'Coopcentral'], ['82', 'Coomeva'], ['83', 'Compensar'],
  ['90', 'Corficolombiana'], ['283', 'Coop. Financiera de Antioquia'], ['292', 'Confiar'], ['1062', 'Bco. Falabella']];
const LIMITE = [['legal', 'Límite legal'], ['cualquier', 'Cualquier valor > 0']];

// HTML del formulario. `t` = tercero existente (para editar) o {}.
export function formularioTercero(t = {}, { rol = 'cliente' } = {}) {
  const persona = t.tipo_persona || (rol === 'proveedor' ? 'juridica' : 'natural');
  return html`
    <div class="row">
      <label class="w-sm"><span>Tipo persona</span>
        <select name="tipo_persona" data-tercero="persona">${opt([['natural', '1 · Natural'], ['juridica', '0 · Jurídica']], persona)}</select>
      </label>
      <label><span>Tipo documento</span><select name="tipo_documento">${opt(TIPOS_DOCUMENTO, t.tipo_documento || (persona === 'juridica' ? 'NIT' : 'CC'))}</select></label>
      <label><span>Número (sin DV)</span><input name="numero_documento" required inputmode="numeric" value="${esc(t.numero_documento || '')}" /></label>
    </div>
    <div data-solo="natural">
      <div class="row">
        <label><span>Primer nombre *</span><input name="primer_nombre" value="${esc(t.primer_nombre || '')}" /></label>
        <label><span>Segundo nombre</span><input name="segundo_nombre" value="${esc(t.segundo_nombre || '')}" /></label>
      </div>
      <div class="row">
        <label><span>Primer apellido *</span><input name="primer_apellido" value="${esc(t.primer_apellido || '')}" /></label>
        <label><span>Segundo apellido</span><input name="segundo_apellido" value="${esc(t.segundo_apellido || '')}" /></label>
      </div>
    </div>
    <div data-solo="juridica">
      <label><span>Razón social *</span><input name="razon_social" value="${esc(t.razon_social || '')}" /></label>
    </div>
    <label><span>Nombre comercial</span><input name="nombre_comercial" value="${esc(t.nombre_comercial || '')}" /></label>
    <div class="row">
      <label><span>Dirección * (mín. 8 caracteres)</span><input name="direccion" required minlength="8" value="${esc(t.direccion || '')}" /></label>
      <label class="w-sm"><span>Ciudad DANE *</span><input name="ciudad_id" required pattern="\\d{5}" title="5 dígitos, ej. 05001 Medellín" value="${esc(t.ciudad_id || '05001')}" /></label>
    </div>
    <div class="row">
      <label><span>Teléfono *</span><input name="telefono" required value="${esc(t.telefono || '')}" /></label>
      <label><span>Correo (factura electrónica)</span><input type="email" name="email" value="${esc(t.email || '')}" /></label>
    </div>
    <details class="tercero-tributario">
      <summary>Información tributaria y bancaria</summary>
      <div class="row">
        <label><span>Régimen renta</span><select name="regimen_renta" data-lista="renta"></select></label>
        <label><span>Régimen IVA</span><select name="regimen_iva" data-lista="iva"></select></label>
        <label><span>Régimen ICA</span><select name="regimen_ica" data-lista="ica"></select></label>
      </div>
      <div class="row">
        <label class="check" data-solo="juridica"><input type="checkbox" name="autorretenedor_renta" value="true" ${t.autorretenedor_renta ? 'checked' : ''} /> Autorretenedor de renta</label>
        <label class="w-sm"><span>Tarifa rete IVA (%)</span><input name="tarifa_rete_iva" type="number" step="0.01" min="0" max="100" value="${esc(Number(t.tarifa_rete_iva || 0))}" /></label>
      </div>
      <div class="row">
        <label><span>Límite rete renta (facturar)</span><select name="limite_rete_renta_facturar">${opt(LIMITE, t.limite_rete_renta_facturar)}</select></label>
        <label><span>Límite rete renta (comprar)</span><select name="limite_rete_renta_comprar">${opt(LIMITE, t.limite_rete_renta_comprar)}</select></label>
        <label><span>Límite rete IVA (facturar)</span><select name="limite_rete_iva_facturar">${opt(LIMITE, t.limite_rete_iva_facturar)}</select></label>
      </div>
      <div class="row">
        <label><span>Banco</span><select name="cod_banco"><option value="">—</option>${opt(BANCOS, t.cod_banco)}</select></label>
        <label class="w-sm"><span>Tipo cuenta</span><select name="tipo_cuenta"><option value="">—</option>${opt([['37', '37 · Ahorros'], ['27', '27 · Corriente']], t.tipo_cuenta)}</select></label>
        <label><span>Cuenta a debitar</span><input name="cuenta_bancaria" value="${esc(t.cuenta_bancaria || '')}" /></label>
      </div>
      <div class="row">
        <label><span>Id exterior</span><input name="id_exterior" value="${esc(t.id_exterior || '')}" /></label>
        <label class="w-sm"><span>Código país</span><input name="codigo_pais" value="${esc(t.codigo_pais || '169')}" /></label>
        <label class="check"><input type="checkbox" name="activo" value="true" ${t.activo === false ? '' : 'checked'} /> Activo</label>
      </div>
    </details>
  `;
}

// Conecta el cambio natural/jurídica (muestra los campos que aplican y
// recarga las listas de régimen). Llamar después de insertar el HTML.
export function activarFormularioTercero(form, t = {}) {
  const selPersona = form.querySelector('[data-tercero=persona]');
  const valores = { renta: t.regimen_renta, iva: t.regimen_iva, ica: t.regimen_ica };
  const listas = { renta: REGIMEN_RENTA, iva: REGIMEN_IVA, ica: REGIMEN_ICA };
  function aplicar() {
    const p = selPersona.value;
    form.querySelectorAll('[data-solo]').forEach((el) => { el.hidden = el.dataset.solo !== p; });
    form.querySelectorAll('[data-lista]').forEach((sel) => {
      const actual = sel.value || valores[sel.dataset.lista];
      sel.innerHTML = `<option value="">—</option>${opt(listas[sel.dataset.lista][p], actual)}`;
    });
    const doc = form.elements.tipo_documento;
    if (p === 'juridica' && doc.value === 'CC') doc.value = 'NIT';
    if (p === 'natural' && doc.value === 'NIT') doc.value = 'CC';
  }
  selPersona.addEventListener('change', aplicar);
  aplicar();
}

// Lee el formulario como objeto para POST/PUT /terceros.
export function leerTercero(form) {
  const d = Object.fromEntries(new FormData(form).entries());
  d.autorretenedor_renta = Boolean(form.elements.autorretenedor_renta?.checked);
  d.activo = Boolean(form.elements.activo?.checked);
  if (d.tipo_persona === 'natural') d.razon_social = '';
  else ['primer_nombre', 'segundo_nombre', 'primer_apellido', 'segundo_apellido'].forEach((c) => { d[c] = ''; });
  return d;
}

// Fila de la plantilla Template-7580.xlsx para un tercero (mismas columnas y códigos).
export const COLUMNAS_PLANTILLA = [
  { titulo: 'Nit (Sin DV)', valor: (t) => t.numero_documento || '' },
  { titulo: 'Tipo Persona', valor: (t) => (t.tipo_persona === 'juridica' ? 0 : 1) },
  { titulo: 'Tipo Documento', valor: (t) => Number(CODIGO_DOC[t.tipo_documento] || 13) },
  { titulo: 'Primer Nombre', campo: 'primer_nombre' }, { titulo: 'Segundo Nombre', campo: 'segundo_nombre' },
  { titulo: 'Primer Apellido', campo: 'primer_apellido' }, { titulo: 'Segundo Apellido', campo: 'segundo_apellido' },
  { titulo: 'Razón Social', campo: 'razon_social' }, { titulo: 'Nombre Comercial', campo: 'nombre_comercial' },
  { titulo: 'Dirección', campo: 'direccion' }, { titulo: 'Cod.Ciudad', campo: 'ciudad_id' }, { titulo: 'Teléfono', campo: 'telefono' },
  { titulo: 'Auto Retenedor Renta', valor: (t) => (t.autorretenedor_renta ? 1 : '') },
  { titulo: 'Régimen Renta', valor: (t) => (t.regimen_renta ? Number(t.regimen_renta) : '') },
  { titulo: 'Límite Rete Renta Facturar', valor: (t) => (t.limite_rete_renta_facturar === 'cualquier' ? 0 : 'FALSO') },
  { titulo: 'Límite Rete Renta Comprar', valor: (t) => (t.limite_rete_renta_comprar === 'cualquier' ? 0 : 'FALSO') },
  { titulo: 'Régimen IVA', valor: (t) => (t.regimen_iva ? Number(t.regimen_iva) : '') },
  { titulo: 'Tarifa Rete IVA', valor: (t) => Number(t.tarifa_rete_iva || 0) / 100 },
  { titulo: 'Régimen ICA', valor: (t) => (t.regimen_ica ? Number(t.regimen_ica) : '') },
  { titulo: 'Cuenta a Debitar', campo: 'cuenta_bancaria' },
  { titulo: 'Tipo Cuenta', valor: (t) => (t.tipo_cuenta ? Number(t.tipo_cuenta) : '') },
  { titulo: 'Cod Banco', valor: (t) => (t.cod_banco ? Number(t.cod_banco) : '') },
  { titulo: 'Límite Rete IVA Facturar', valor: (t) => (t.limite_rete_iva_facturar === 'cualquier' ? 0 : 'FALSO') },
  { titulo: 'Email', campo: 'email' }, { titulo: 'Tiene RUT', valor: () => '' }, { titulo: 'Id Exterior', campo: 'id_exterior' },
  { titulo: 'Estado', valor: (t) => (t.activo === false ? '' : 'S') },
  { titulo: 'Código País', valor: (t) => Number(t.codigo_pais || 169) },
];
