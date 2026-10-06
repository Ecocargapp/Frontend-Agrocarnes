import { api, catalogo, invalidar } from '../api.js';
import { html, esc, cop, toast, opciones, tabla, badge, alEnviar, datosForm } from '../ui.js';
import { invalidarCuentasPago } from '../pago-widget.js';

export async function vistaConfiguracion(root) {
  const empresas = await catalogo('empresas', true);

  root.innerHTML = html`
    <div class="page-head">
      <h1>Configuración · Facturación electrónica</h1>
      <span class="hint">Cada empresa con NIT propio tiene su propia cuenta con el proveedor de facturación electrónica. Al facturar, el sistema envía la factura al proveedor elegido, que la numera, la firma y la transmite a la DIAN.</span>
    </div>
    <div class="card">
      <h2>Proveedor por empresa</h2>
      <div class="row">
        <label><span>Empresa</span>
          <select id="p-empresa">${opciones(empresas, { texto: (e) => `${e.nombre}${e.arco_configurada ? ' · Arco ✓' : ''}${e.factus_configurada ? ' · Factus ✓' : ''}` })}</select>
        </label>
        <label class="w-sm"><span>Proveedor activo</span>
          <select id="p-proveedor">
            <option value="arco">Arco</option>
            <option value="factus">Factus</option>
          </select>
        </label>
      </div>
      <p class="muted" style="margin:4px 0 0">Las facturas y notas crédito nuevas de esta empresa se enviarán al proveedor elegido aquí; las que ya se enviaron no cambian.</p>
    </div>
    <div class="grid">
      <div class="card">
        <h2>Cuenta de Arco</h2>
        <form id="form-arco">
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
      <div class="card">
        <h2>Cuenta de Factus</h2>
        <form id="form-factus">
          <label class="w-sm"><span>Entorno</span>
            <select name="base_url">
              <option value="https://api-sandbox.factus.com.co">Sandbox (pruebas)</option>
              <option value="https://api.factus.com.co">Producción</option>
            </select>
          </label>
          <div class="row">
            <label><span>Client ID</span><input name="client_id" required /></label>
            <label><span>Client Secret <span class="muted" id="f-secret-hint"></span></span><input name="client_secret" type="password" autocomplete="new-password" /></label>
          </div>
          <div class="row">
            <label><span>Correo / usuario</span><input name="email" type="email" required /></label>
            <label><span>Contraseña <span class="muted" id="f-pass-hint"></span></span><input name="password" type="password" autocomplete="new-password" /></label>
          </div>
          <div class="row">
            <button type="button" class="btn-secondary" id="btn-probar-factus">Probar conexión</button>
          </div>
          <div id="f-resultado"></div>
          <div class="logo-factus">
            <p class="muted" style="margin:12px 0 6px"><b>Logo en las facturas (PDF).</b> Se ajusta solo al tamaño que pide Factus (máx. 300×300 px, menos de 200 KB). Es uno por cuenta de Factus: aplica a todas las empresas que usan esta cuenta.</p>
            <div class="row">
              <input type="file" id="f-logo" accept="image/png,image/jpeg" />
              <button type="button" class="btn-secondary" id="btn-logo-factus" disabled>Subir logo</button>
            </div>
            <img id="f-logo-vista" alt="" style="max-width:300px;max-height:150px;margin-top:8px" hidden />
          </div>
          <hr style="border:0;border-top:1px solid var(--border);margin:6px 0" />
          <div class="row">
            <label><span>Rango de numeración · Facturas</span><input name="numbering_range_id_factura" type="number" placeholder="ej. 389" /></label>
            <label><span>Rango de numeración · Notas crédito</span><input name="numbering_range_id_nota_credito" type="number" placeholder="ej. 1776" /></label>
          </div>
          <p class="muted" style="margin:0 0 6px">Es el <b>id interno de Factus</b> que aparece al pulsar "Probar conexión" (no el número de la resolución ni el "hasta"). Déjalo vacío si la cuenta tiene un solo rango.</p>
          <div class="row">
            <label><span>Método de pago por defecto (contado)</span><input name="payment_method_code_default" value="42" /></label>
            <label><span>Municipio (DANE) por defecto</span><input name="municipality_code_default" value="05001" /></label>
          </div>
          <button type="submit" class="btn-primary">Guardar configuración</button>
        </form>
      </div>
      <div>
        <div class="card">
          <h2>Cómo funciona</h2>
          <ol class="muted" style="margin:0;padding-left:18px;line-height:1.6">
            <li>Elige el proveedor arriba y llena la cuenta correspondiente (Arco o Factus) para la empresa seleccionada.</li>
            <li>En Factus, pulsa <b>Probar conexión</b> para confirmar las credenciales y ver los rangos de numeración disponibles.</li>
            <li>En <b>Inventario</b>, a cada producto que se vende asígnale su código en el proveedor (Arco) y, para Factus, la unidad de medida si no es "unidad", además del % de impuesto incluido en el precio.</li>
            <li>Al facturar en <b>Ventas</b>, la factura sale al proveedor activo en segundo plano; el estado DIAN y el CUFE aparecen en la lista de facturas. Factus normalmente devuelve el CUFE de inmediato.</li>
            <li>Los clientes con documento se envían automáticamente con cada factura; con Arco además quedan registrados allá la primera vez.</li>
          </ol>
        </div>
        <div class="card">
          <h2>Estados DIAN</h2>
          <p class="muted" style="margin:0;line-height:1.8">
            ${badge('pendiente', 'warn')} aún no se envía ·
            ${badge('enviada', 'warn')} enviada, esperando CUFE ·
            ${badge('aceptada', 'ok')} CUFE recibido ·
            ${badge('error', 'danger')} falló, se reintenta solo ·
            ${badge('rechazada', 'danger')} el proveedor/DIAN la rechazó, revisa el mensaje ·
            ${badge('sin_configurar', '')} la empresa no tiene cuenta configurada en el proveedor activo
          </p>
        </div>
      </div>
    </div>
    <div class="card">
      <h2>Cajas y cuentas bancarias</h2>
      <p class="muted">De aquí sale el dinero de los egresos (compras, gastos y pagos a proveedores) y aquí entra el de los recibos. Cada una tiene su propia cuenta contable, así el balance muestra el saldo de cada banco.</p>
      <div class="grid">
        <form id="form-cuenta-pago">
          <div class="row">
            <label><span>Empresa</span><select name="empresa_id" required>${opciones(empresas)}</select></label>
            <label class="w-sm"><span>Tipo</span>
              <select name="tipo" id="cp-tipo"><option value="banco">Cuenta bancaria</option><option value="caja">Caja</option><option value="tarjeta_credito">Tarjeta de crédito</option></select>
            </label>
          </div>
          <div class="row" data-cp="banco">
            <label><span>Banco</span><input name="banco" placeholder="Ej. Bancolombia" /></label>
            <label class="w-sm" data-cp="solo-banco"><span>Tipo de cuenta</span><select name="tipo_cuenta"><option value="ahorros">Ahorros</option><option value="corriente">Corriente</option></select></label>
            <label class="w-sm"><span>Número</span><input name="numero" placeholder="Ej. 123-456789-01" /></label>
          </div>
          <label><span>Nombre para mostrar</span><input name="nombre" placeholder="Opcional: se arma con banco, tipo y últimos dígitos" /></label>
          <button type="submit" class="btn-primary">Agregar</button>
        </form>
        <div id="lista-cuentas-pago"></div>
      </div>
    </div>
  `;

  const selEmpresa = root.querySelector('#p-empresa');
  const selProveedor = root.querySelector('#p-proveedor');

  const formArco = root.querySelector('#form-arco');
  const resultadoArco = root.querySelector('#a-resultado');
  const passHintArco = root.querySelector('#a-pass-hint');

  const formFactus = root.querySelector('#form-factus');
  const resultadoFactus = root.querySelector('#f-resultado');
  const passHintFactus = root.querySelector('#f-pass-hint');
  const secretHintFactus = root.querySelector('#f-secret-hint');

  function empresaSeleccionada() {
    return empresas.find((e) => e.id === selEmpresa.value);
  }

  async function cargarProveedor() {
    selProveedor.value = empresaSeleccionada()?.proveedor_dian || 'arco';
  }

  async function cargarArco() {
    resultadoArco.innerHTML = '';
    const { config } = await api(`/empresas/${selEmpresa.value}/arco`);
    for (const el of formArco.elements) {
      if (!el.name) continue;
      if (el.type === 'checkbox') el.checked = config ? config[el.name] !== false : true;
      else if (el.name === 'password') el.value = '';
      else el.value = config?.[el.name] ?? el.defaultValue ?? '';
    }
    passHintArco.textContent = config?.password_guardada ? '(guardada; deja vacío para conservarla)' : '';
  }

  async function cargarFactus() {
    resultadoFactus.innerHTML = '';
    const { config } = await api(`/empresas/${selEmpresa.value}/factus`);
    for (const el of formFactus.elements) {
      if (!el.name) continue;
      if (el.name === 'password') el.value = '';
      else if (el.name === 'client_secret') el.value = '';
      else el.value = config?.[el.name] ?? el.defaultValue ?? '';
    }
    passHintFactus.textContent = config?.password_guardada ? '(guardada; deja vacío para conservarla)' : '';
    secretHintFactus.textContent = config?.client_secret_guardado ? '(guardado; deja vacío para conservarlo)' : '';
  }

  async function cargarTodo() {
    await cargarProveedor();
    await Promise.all([cargarArco(), cargarFactus()]);
  }

  selEmpresa.addEventListener('change', cargarTodo);

  selProveedor.addEventListener('change', async () => {
    await api(`/empresas/${selEmpresa.value}/proveedor-dian`, { method: 'PUT', body: { proveedor: selProveedor.value } });
    const e = empresaSeleccionada();
    if (e) e.proveedor_dian = selProveedor.value;
    invalidar('empresas');
    toast(`Proveedor activo: ${selProveedor.value === 'factus' ? 'Factus' : 'Arco'}`, 'ok');
  });

  root.querySelector('#btn-probar').addEventListener('click', async () => {
    const d = Object.fromEntries(new FormData(formArco).entries());
    resultadoArco.innerHTML = '<p class="muted">Conectando con Arco…</p>';
    try {
      const r = await api(`/empresas/${selEmpresa.value}/arco/probar`, { method: 'POST', body: { host: d.host, company: d.company, user: d.user, password: d.password } });
      resultadoArco.innerHTML = html`
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
      resultadoArco.innerHTML = `<p class="error">${esc(err.message)}</p>`;
    }
  });

  async function probarFactus() {
    const d = Object.fromEntries(new FormData(formFactus).entries());
    resultadoFactus.innerHTML = '<p class="muted">Conectando con Factus…</p>';
    try {
      const r = await api(`/empresas/${selEmpresa.value}/factus/probar`, {
        method: 'POST',
        body: { base_url: d.base_url, client_id: d.client_id, client_secret: d.client_secret, email: d.email, password: d.password },
      });
      const actual = formFactus.elements.numbering_range_id_factura.value;
      const registrados = r.rangos_numeracion || [];
      const yaEnFactus = new Set(registrados.map((x) => `${x.prefijo}|${x.resolucion}`));
      const dian = Array.isArray(r.rangos_dian) ? r.rangos_dian : [];
      resultadoFactus.innerHTML = html`
        <p class="muted">${badge('Conexión correcta', 'ok')} Rangos registrados en Factus:</p>
        ${tabla({ columnas: [
          { titulo: 'id', campo: 'id' }, { titulo: 'Prefijo', campo: 'prefijo' },
          { titulo: 'Números', render: (x) => `${esc(x.desde ?? '')}–${esc(x.hasta ?? '')} (va en ${esc(x.actual ?? '')})` },
          { titulo: 'Activo', render: (x) => (x.activo ? 'Sí' : 'No') },
          { titulo: '', render: (x) => String(x.id) === String(actual) ? badge('En uso aquí', 'ok') : `<button type="button" class="btn-secondary" data-usar-rango="${x.id}">Usar en esta empresa</button>` },
        ], filas: registrados, vacio: 'Factus todavía no tiene rangos registrados.' })}
        <p class="muted" style="margin-top:12px">Rangos que la DIAN tiene asociados al software de Factus:</p>
        ${Array.isArray(r.rangos_dian) ? tabla({ columnas: [
          { titulo: 'Prefijo', campo: 'prefijo' }, { titulo: 'Resolución', campo: 'resolucion' },
          { titulo: 'Números', render: (x) => `${esc(x.desde)}–${esc(x.hasta)}` },
          { titulo: 'Vigencia', render: (x) => `${esc(x.inicio || '')} → ${esc(x.fin || '')}` },
          { titulo: '', render: (x) => yaEnFactus.has(`${x.prefijo}|${x.resolucion}`) ? badge('Registrado', 'ok') : `<button type="button" class="btn-primary" data-registrar-rango="${esc(x.prefijo)}" data-resolucion="${esc(x.resolucion)}" data-desde="${esc(x.desde)}">Registrar y usar aquí</button>` },
        ], filas: dian, vacio: 'La DIAN no tiene rangos asociados a Factus para esta cuenta.' }) : `<p class="error">${esc(r.rangos_dian?.error || 'No se pudieron consultar')}</p>`}
      `;
    } catch (err) {
      resultadoFactus.innerHTML = `<p class="error">${esc(err.message)}</p>`;
    }
  }
  root.querySelector('#btn-probar-factus').addEventListener('click', probarFactus);

  // Logo: se redimensiona en el navegador (≤300x300, PNG; JPEG si el PNG pasa de 200 KB).
  const inLogo = root.querySelector('#f-logo');
  const btnLogo = root.querySelector('#btn-logo-factus');
  const vistaLogo = root.querySelector('#f-logo-vista');
  let logoListo = null;
  inLogo.addEventListener('change', async () => {
    logoListo = null; btnLogo.disabled = true; vistaLogo.hidden = true;
    const archivo = inLogo.files[0];
    if (!archivo) return;
    const img = await new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = mal; i.src = URL.createObjectURL(archivo); });
    const escala = Math.min(1, 300 / img.width, 300 / img.height);
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * escala); c.height = Math.round(img.height * escala);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    let datos = c.toDataURL('image/png'); let nombre = 'logo.png';
    if (datos.length * 0.75 >= 200 * 1024) { datos = c.toDataURL('image/jpeg', 0.9); nombre = 'logo.jpg'; }
    logoListo = { imagen_base64: datos, nombre };
    vistaLogo.src = datos; vistaLogo.hidden = false; btnLogo.disabled = false;
  });
  btnLogo.addEventListener('click', async () => {
    if (!logoListo) return;
    btnLogo.disabled = true;
    try {
      await api(`/empresas/${selEmpresa.value}/factus/logo`, { method: 'POST', body: logoListo });
      toast('Logo actualizado en Factus: saldrá en los PDF de las facturas', 'ok');
    } catch (err) { toast(err.message, 'error'); }
    finally { btnLogo.disabled = false; }
  });

  resultadoFactus.addEventListener('click', async (e) => {
    const usar = e.target.closest('[data-usar-rango]');
    const reg = e.target.closest('[data-registrar-rango]');
    if (!usar && !reg) return;
    const boton = usar || reg;
    boton.disabled = true;
    try {
      if (usar) {
        await api(`/empresas/${selEmpresa.value}/factus/rango-factura`, { method: 'PUT', body: { rango_id: usar.dataset.usarRango } });
        formFactus.elements.numbering_range_id_factura.value = usar.dataset.usarRango;
        toast('Rango asignado a esta empresa', 'ok');
      } else {
        const r = await api(`/empresas/${selEmpresa.value}/factus/rangos`, {
          method: 'POST',
          body: { prefijo: reg.dataset.registrarRango, resolucion: reg.dataset.resolucion, actual: reg.dataset.desde || 1, usar_para_facturas: true },
        });
        if (r.rango?.id) formFactus.elements.numbering_range_id_factura.value = r.rango.id;
        toast(`Rango ${reg.dataset.registrarRango} registrado en Factus`, 'ok');
      }
      await probarFactus();
    } catch (err) {
      toast(err.message, 'error');
      boton.disabled = false;
    }
  });

  alEnviar(formArco, async () => {
    const d = Object.fromEntries(new FormData(formArco).entries());
    d.precios_incluyen_impuesto = formArco.elements.precios_incluyen_impuesto.checked;
    await api(`/empresas/${selEmpresa.value}/arco`, { method: 'PUT', body: d });
    invalidar('empresas');
    toast('Configuración de Arco guardada', 'ok');
    passHintArco.textContent = '(guardada; deja vacío para conservarla)';
    formArco.elements.password.value = '';
  });

  alEnviar(formFactus, async () => {
    const d = Object.fromEntries(new FormData(formFactus).entries());
    await api(`/empresas/${selEmpresa.value}/factus`, { method: 'PUT', body: d });
    invalidar('empresas');
    toast('Configuración de Factus guardada', 'ok');
    passHintFactus.textContent = '(guardada; deja vacío para conservarla)';
    secretHintFactus.textContent = '(guardado; deja vacío para conservarlo)';
    formFactus.elements.password.value = '';
    formFactus.elements.client_secret.value = '';
  });

  // ----------------------------------------------- cajas y cuentas bancarias
  const formCp = root.querySelector('#form-cuenta-pago');
  const selTipoCp = root.querySelector('#cp-tipo');
  const tipoCp = () => {
    formCp.querySelector('[data-cp=banco]').hidden = selTipoCp.value === 'caja';
    formCp.querySelector('[data-cp=solo-banco]').hidden = selTipoCp.value !== 'banco';
  };
  selTipoCp.addEventListener('change', tipoCp); tipoCp();
  const NOMBRE_TIPO = { caja: 'Caja', banco: 'Banco', tarjeta_credito: 'Tarjeta de crédito' };
  async function cargarCuentasPago() {
    const cuentas = await api('/cuentas-pago?todas=1');
    root.querySelector('#lista-cuentas-pago').innerHTML = tabla({
      columnas: [
        { titulo: 'Empresa', campo: 'empresa' },
        { titulo: 'Cuenta', render: (c) => `${badge(NOMBRE_TIPO[c.tipo], c.tipo === 'caja' ? 'ok' : c.tipo === 'banco' ? 'brand' : 'warn')} ${esc(c.nombre)}${c.numero ? `<br><span class="muted">N.° ${esc(c.numero)}</span>` : ''}` },
        { titulo: 'PUC', render: (c) => `<span class="mono">${esc(c.cuenta_contable)}</span>` },
        { titulo: 'Saldo', num: true, render: (c) => `<span class="${c.saldo < 0 && c.tipo !== 'tarjeta_credito' ? 'neg' : ''}">${cop(c.saldo)}</span>` },
        { titulo: '', render: (c) => `<button type="button" class="btn-link" data-cp-id="${c.id}" data-activa="${c.activa}">${c.activa ? 'Desactivar' : 'Activar'}</button>` },
      ],
      filas: cuentas,
      vacio: 'Sin cuentas.',
    });
  }
  root.querySelector('#lista-cuentas-pago').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-cp-id]');
    if (!b) return;
    try {
      await api(`/cuentas-pago/${b.dataset.cpId}`, { method: 'PATCH', body: { activa: b.dataset.activa !== 'true' } });
      invalidarCuentasPago();
      await cargarCuentasPago();
    } catch (err) { toast(err.message, 'error'); }
  });
  alEnviar(formCp, async () => {
    const d = datosForm(formCp);
    if (d.tipo !== 'banco') delete d.tipo_cuenta;
    const c = await api('/cuentas-pago', { method: 'POST', body: d });
    invalidarCuentasPago();
    toast(`"${c.nombre}" agregada (cuenta contable ${c.cuenta_contable})`, 'ok');
    ['banco', 'numero', 'nombre'].forEach((k) => { formCp.elements[k].value = ''; });
    await cargarCuentasPago();
  });
  cargarCuentasPago();

  await cargarTodo();
}
