import { api, session, invalidar } from './api.js';
import { toast, datosForm } from './ui.js';
import { vistaInventario } from './views/inventario.js';
import { vistaCompras } from './views/compras.js';
import { vistaTraslados } from './views/traslados.js';
import { vistaFormulacion } from './views/formulacion.js';
import { vistaVentas } from './views/ventas.js';
import { vistaCartera } from './views/cartera.js';
import { vistaNotasCredito } from './views/notas-credito.js';
import { vistaConfiguracion } from './views/configuracion.js';
import { vistaGastos } from './views/gastos.js';
import { vistaInformes } from './views/informes.js';
import { vistaNomina } from './views/nomina.js';
import { vistaUsuarios } from './views/usuarios.js';

const vistas = {
  inventario: vistaInventario,
  compras: vistaCompras,
  gastos: vistaGastos,
  traslados: vistaTraslados,
  formulacion: vistaFormulacion,
  ventas: vistaVentas,
  cartera: vistaCartera,
  'notas-credito': vistaNotasCredito,
  nomina: vistaNomina,
  informes: vistaInformes,
  configuracion: vistaConfiguracion,
  usuarios: vistaUsuarios,
};

// Vistas que solo ve el administrador (el operador es el punto de venta).
const SOLO_ADMIN = ['nomina', 'notas-credito', 'configuracion', 'usuarios'];
const esAdmin = () => session.usuario?.rol === 'admin';

const loginView = document.getElementById('login-view');
const contentView = document.getElementById('content-view');
const nav = document.getElementById('nav');
const userBox = document.getElementById('user-box');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');

function mostrarLogin() {
  loginView.hidden = false;
  contentView.hidden = true;
  nav.hidden = true;
  userBox.hidden = true;
}

function mostrarApp() {
  loginView.hidden = true;
  contentView.hidden = false;
  nav.hidden = false;
  userBox.hidden = false;
  document.getElementById('user-name').textContent = session.usuario?.nombre || session.usuario?.email || '';
  SOLO_ADMIN.forEach((v) => { const a = nav.querySelector(`[data-view=${v}]`); if (a) a.hidden = !esAdmin(); });
  navegar();
}

async function navegar() {
  const [nombre, query] = (location.hash || '#inventario').slice(1).split('?');
  const vista = (!esAdmin() && SOLO_ADMIN.includes(nombre) ? null : vistas[nombre]) || vistas.inventario;
  const params = new URLSearchParams(query || '');
  nav.querySelectorAll('a').forEach((a) => a.classList.toggle('active', a.dataset.view === nombre));
  contentView.innerHTML = '<p class="muted">Cargando…</p>';
  try {
    await vista(contentView, params);
  } catch (err) {
    contentView.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.hidden = true;
  try {
    const { token, usuario } = await api('/auth/login', { method: 'POST', body: datosForm(loginForm) });
    session.set(token, usuario);
    invalidar(); // los catálogos dependen del usuario (empresa asignada)
    loginForm.reset();
    mostrarApp();
  } catch (err) {
    loginError.textContent = err.message;
    loginError.hidden = false;
  }
});

document.getElementById('logout').addEventListener('click', () => {
  session.clear();
  mostrarLogin();
});

window.addEventListener('hashchange', () => { if (session.token) navegar(); });
window.addEventListener('agrocarnes:logout', () => { toast('Tu sesión expiró, vuelve a entrar', 'error'); mostrarLogin(); });

if (session.token) mostrarApp(); else mostrarLogin();
