// Usuarios del sistema (solo administrador).
import { api, catalogo, session } from '../api.js';
import { html, esc, toast, opciones, tabla, badge, alEnviar, datosForm, fecha } from '../ui.js';

const ROLES = {
  operador: 'Punto de venta',
  admin: 'Administrador',
};

const PERMISOS_PDV = [
  'Facturar (ventas) y consultar sus facturas',
  'Registrar compras y gastos',
  'Recibos de caja y comprobantes de egreso (Cartera)',
  'Traslados entre bodegas y formulación/producción',
  'Consultar inventario y la venta diaria (cuadre de caja)',
];
const NO_PDV = 'No puede anular documentos, hacer notas crédito, ver nómina, informes contables, usuarios ni configuración.';

export async function vistaUsuarios(root) {
  const empresas = await catalogo('empresas', true);

  root.innerHTML = html`
    <div class="page-head">
      <h1>Usuarios</h1>
      <span class="hint">Quién puede entrar al sistema y qué puede hacer.</span>
    </div>
    <div class="grid">
      <div class="card">
        <h2>Nuevo usuario</h2>
        <form id="form-usuario" autocomplete="off">
          <label><span>Nombre</span><input name="nombre" required placeholder="Nombre de la persona" /></label>
          <label><span>Correo (con el que entra)</span><input name="email" type="email" required autocomplete="off" /></label>
          <label><span>Contraseña</span><input name="password" type="password" required minlength="4" autocomplete="new-password" /></label>
          <div class="row">
            <label><span>Rol</span>
              <select name="rol">${Object.entries(ROLES).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select>
            </label>
            <label><span>Empresa</span>
              <select name="empresa_id">${opciones(empresas, { vacio: 'Todas las empresas' })}</select>
            </label>
          </div>
          <button type="submit" class="btn-primary">Crear usuario</button>
        </form>
      </div>
      <div class="card">
        <h2>Rol "Punto de venta"</h2>
        <ul style="margin:0 0 8px;padding-left:18px">${PERMISOS_PDV.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
        <p class="muted" style="margin:0">${esc(NO_PDV)}</p>
        <p class="muted">Si eliges una empresa, el usuario solo verá esa empresa en los formularios.</p>
      </div>
    </div>
    <div class="card"><h2>Usuarios registrados</h2><div id="lista"></div></div>`;

  const lista = root.querySelector('#lista');

  async function cargar() {
    const usuarios = await api('/usuarios');
    lista.innerHTML = tabla({
      columnas: [
        { titulo: 'Nombre', render: (u) => esc(u.nombre) },
        { titulo: 'Correo', render: (u) => esc(u.email) },
        { titulo: 'Rol', render: (u) => `<select data-rol="${u.id}" ${u.id === session.usuario?.id ? 'disabled' : ''}>${Object.entries(ROLES).map(([k, t]) => `<option value="${k}" ${u.rol === k ? 'selected' : ''}>${t}</option>`).join('')}</select>` },
        { titulo: 'Empresa', render: (u) => `<select data-empresa="${u.id}">${opciones(empresas, { vacio: 'Todas', seleccionado: u.empresa_id })}</select>` },
        { titulo: 'Estado', render: (u) => (u.activo ? badge('Activo', 'ok') : badge('Inactivo', 'danger')) },
        { titulo: 'Creado', render: (u) => fecha(u.creado_en) },
        {
          titulo: '',
          render: (u) => `<button type="button" class="btn-secondary" data-clave="${u.id}">Cambiar contraseña</button>
            ${u.id === session.usuario?.id ? '' : `<button type="button" class="btn-secondary" data-activo="${u.id}" data-valor="${!u.activo}">${u.activo ? 'Desactivar' : 'Activar'}</button>`}`,
        },
      ],
      filas: usuarios,
    });
  }

  async function actualizar(id, body, msg) {
    try {
      await api(`/usuarios/${id}`, { method: 'PATCH', body });
      toast(msg, 'ok');
    } catch (err) { toast(err.message, 'error'); }
    await cargar();
  }

  lista.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.rol) actualizar(t.dataset.rol, { rol: t.value }, 'Rol actualizado');
    if (t.dataset.empresa) actualizar(t.dataset.empresa, { empresa_id: t.value || null }, 'Empresa actualizada');
  });

  lista.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.activo) actualizar(t.dataset.activo, { activo: t.dataset.valor === 'true' }, t.dataset.valor === 'true' ? 'Usuario activado' : 'Usuario desactivado');
    if (t.dataset.clave) {
      const fila = t.closest('td');
      if (fila.querySelector('form')) return;
      const f = document.createElement('form');
      f.className = 'row';
      f.innerHTML = '<input type="password" name="password" minlength="4" required autocomplete="new-password" placeholder="Nueva contraseña" /><button type="submit" class="btn-primary">Guardar</button>';
      fila.appendChild(f);
      f.querySelector('input').focus();
      alEnviar(f, async () => { await actualizar(t.dataset.clave, { password: datosForm(f).password }, 'Contraseña actualizada'); });
    }
  });

  const form = root.querySelector('#form-usuario');
  alEnviar(form, async () => {
    const d = datosForm(form);
    await api('/usuarios', { method: 'POST', body: { ...d, empresa_id: d.empresa_id || null } });
    toast('Usuario creado', 'ok');
    form.reset();
    await cargar();
  });

  await cargar();
}
