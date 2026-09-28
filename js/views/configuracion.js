import { api, catalogo, invalidar } from '../api.js';
import { html, esc, toast, opciones, tabla, badge, alEnviar } from '../ui.js';

export async function vistaConfiguracion(root) {
  const empresas = await catalogo('empresas', true);

  root.innerHTML = html`
    <div class="page-head">
      <h1>Configuración · Facturación electrónica (Arco)</h1>
      <span class="hint">Cada empresa con NIT propio tiene su cuenta de Arco. Al facturar, el sistema crea la factura en Arco y Arco la numera, la firma y la transmite a la DIAN.</span>
    </div>
    <div class="grid">
      <div class="card">
        <h2>Cuenta de Arco</h2>
        <form id="form-arco">
          <label><span>Empresa</span>
            <select id="a-empresa">${opciones(empresas, { texto: (e) => `${e.nombre}${e.arco_configurada ? ' ✓' : ''}` })}</select>
          </label>
          <label><span>Host (servidor de Arco)</span><input name="host" placeholder="miempresa.arco365.com" required /></label>
          <div class="row">
            <label><span>Empresa en Arco (CompanyName)</span><input name="company" required /></label>
            <label><span>Usuario</span><input name="user" required /></label>
          </div>
          <label><span>Contraseña <span class="muted" id="a-pass-hint"></span></span><input name="password" type="password" autocomplete="new-password" /></label>
          <div class="row">
            <button type="button" class="btn-secondary" id="btn-probar">Probar conexión</button>
          </div>
          <div id="a-resultado"></div>
          <hr style="border:0;border-top:1px solid var(--border);margin:6px 0" />
          <div class="row">
            <label><span>DocumentoId (tipo de factura)</span><input name="documento_id" type="number" required /></label>
            <label class="w-sm"><span>Resolución</span><input name="resolucion_tipo" value="04" /></label>
          </div>
          <div class="row">
            <label><span>SucursalId</span><input name="sucursal_id" required /></label>
            <label><span>BodegaId en Arco</span><input name="bodega_id" required /></label>
          </div>
          <div class="row">
            <label><span>ClienteId consumidor final</span><input name="cliente_default_id" required placeholder="Cuantías menores" /></label>
            <label class="w-sm"><span>VendedorId</span><input name="vendedor_id" value="0" /></label>
          </div>
          <div class="row">
            <label class="w-sm"><span>Tipo de pago</span>
              <select name="tipo_pago"><option value="E">Efectivo</option><option value="C">Crédito</option></select>
            </label>
            <label><span>Ciudad (DANE) para clientes nuevos</span><input name="ciudad_id" value="05001" /></label>
          </div>
          <label class="row" style="align-items:center;flex-direction:row;gap:8px">
            <input type="checkbox" name="precios_incluyen_impuesto" checked style="width:auto" />
            <span>Los precios de venta ya incluyen el impuesto (se envía a Arco el valor base)</span>
          </label>
          <button type="submit" class="btn-primary">Guardar configuración</button>
        </form>
      </div>
      <div>
        <div class="card">
          <h2>Cómo funciona</h2>
          <ol class="muted" style="margin:0;padding-left:18px;line-height:1.6">
            <li>Ingresa host, empresa, usuario y contraseña de Arco y pulsa <b>Probar conexión</b>: verás las sucursales, bodegas y el DocumentoId que Arco usa hoy para facturar.</li>
            <li>Copia esos valores en los campos de abajo y guarda.</li>
            <li>En <b>Inventario</b>, a cada producto que se vende asígnale su <b>código Arco</b> (el ProductoId con el que existe en Arco) y el % de impuesto incluido en el precio.</li>
            <li>Al facturar en <b>Ventas</b>, la factura sale a Arco en segundo plano; el estado DIAN y el CUFE aparecen en la lista de facturas.</li>
            <li>Los clientes con documento se crean en Arco automáticamente la primera vez que se les factura.</li>
          </ol>
        </div>
        <div class="card">
          <h2>Estados DIAN</h2>
          <p class="muted" style="margin:0;line-height:1.8">
            ${badge('pendiente', 'warn')} aún no se envía ·
            ${badge('enviada', 'warn')} está en Arco, esperando CUFE ·
            ${badge('aceptada', 'ok')} CUFE recibido ·
            ${badge('error', 'danger')} falló, se reintenta solo ·
            ${badge('rechazada', 'danger')} Arco/DIAN la rechazó, revisa el mensaje ·
            ${badge('sin_configurar', '')} la empresa no tiene cuenta de Arco
          </p>
        </div>
      </div>
    </div>
  `;

  const form = root.querySelector('#form-arco');
  const selEmpresa = root.querySelector('#a-empresa');
  const resultado = root.querySelector('#a-resultado');
  const passHint = root.querySelector('#a-pass-hint');

  async function cargar() {
    resultado.innerHTML = '';
    const { config } = await api(`/empresas/${selEmpresa.value}/arco`);
    for (const el of form.elements) {
      if (!el.name) continue;
      if (el.type === 'checkbox') el.checked = config ? config[el.name] !== false : true;
      else if (el.name === 'password') el.value = '';
      else el.value = config?.[el.name] ?? el.defaultValue ?? '';
    }
    passHint.textContent = config?.password_guardada ? '(guardada; deja vacío para conservarla)' : '';
  }

  selEmpresa.addEventListener('change', cargar);

  root.querySelector('#btn-probar').addEventListener('click', async () => {
    const d = Object.fromEntries(new FormData(form).entries());
    resultado.innerHTML = '<p class="muted">Conectando con Arco…</p>';
    try {
      const r = await api(`/empresas/${selEmpresa.value}/arco/probar`, { method: 'POST', body: { host: d.host, company: d.company, user: d.user, password: d.password } });
      resultado.innerHTML = html`
        <p class="muted">${badge('Conexión correcta', 'ok')} Usa estos valores para llenar los campos:</p>
        <p class="muted"><b>Documentos de factura en uso</b></p>
        ${tabla({ columnas: [
          { titulo: 'DocumentoId', campo: 'DocumentoId' }, { titulo: 'Resol.', campo: 'FacturaResolucionTipo' },
          { titulo: 'Prefijo', campo: 'prefijo' }, { titulo: 'Sucursal', campo: 'sucursal' }, { titulo: 'Cliente ej.', campo: 'clienteEjemplo' },
        ], filas: r.documentos_en_uso, vacio: 'Arco no tiene facturas recientes; pide el DocumentoId a soporte de Arco.' })}
        <p class="muted"><b>Sucursales</b></p>
        ${tabla({ columnas: [{ titulo: 'SucursalId', campo: 'id' }, { titulo: 'Nombre', campo: 'nombre' }, { titulo: 'Bodega', campo: 'bodega' }, { titulo: 'Doc. fact.', campo: 'documento_factura' }], filas: r.sucursales })}
        <p class="muted"><b>Bodegas</b></p>
        ${tabla({ columnas: [{ titulo: 'BodegaId', campo: 'id' }, { titulo: 'Nombre', campo: 'nombre' }, { titulo: 'Tipo', campo: 'tipo' }], filas: r.bodegas })}
        ${r.errores?.length ? `<p class="error">${esc(r.errores.join(' · '))}</p>` : ''}
      `;
    } catch (err) {
      resultado.innerHTML = `<p class="error">${esc(err.message)}</p>`;
    }
  });

  alEnviar(form, async () => {
    const d = Object.fromEntries(new FormData(form).entries());
    d.precios_incluyen_impuesto = form.elements.precios_incluyen_impuesto.checked;
    await api(`/empresas/${selEmpresa.value}/arco`, { method: 'PUT', body: d });
    invalidar('empresas');
    toast('Configuración de Arco guardada', 'ok');
    passHint.textContent = '(guardada; deja vacío para conservarla)';
    form.elements.password.value = '';
  });

  await cargar();
}
