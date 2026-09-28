import { api, session } from './api.js';
import { toast, datosForm } from './ui.js';
import { vistaInventario } from './views/inventario.js';
import { vistaCompras } from './views/compras.js';
import { vistaTraslados } from './views/traslados.js';
import { vistaFormulacion } from './views/formulacion.js';
import { vistaVentas } from './views/ventas.js';

const vistas = {
  inventario: vistaInventario,
  compras: vistaCompras,
  traslados: vistaTraslados,
  formulacion: vistaFormulacion,
  ventas: vistaVentas,
};

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
  navegar();
}

async function navegar() {
  const nombre = (location.hash || '#inventario').slice(1);
  const vista = vistas[nombre] || vistas.inventario;
  nav.querySelectorAll('a').forEach((a) => a.classList.toggle('active', a.dataset.view === nombre));
  contentView.innerHTML = '<p class="muted">Cargando…</p>';
  try {
    await vista(contentView);
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
