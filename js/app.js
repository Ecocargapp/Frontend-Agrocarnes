const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:4001'
  : 'https://api-agrocarnes.agrofranpabel.com';

const loginView = document.getElementById('login-view');
const contentView = document.getElementById('content-view');
const nav = document.getElementById('nav');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');

function getToken() {
  return localStorage.getItem('agrocarnes_token');
}

function setSession(token) {
  localStorage.setItem('agrocarnes_token', token);
  showApp();
}

function showApp() {
  loginView.hidden = true;
  contentView.hidden = false;
  nav.hidden = false;
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginError.hidden = true;

  const data = new FormData(loginForm);
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: data.get('email'), password: data.get('password') }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'No se pudo iniciar sesión');
    }
    const { token } = await res.json();
    setSession(token);
  } catch (err) {
    loginError.textContent = err.message;
    loginError.hidden = false;
  }
});

if (getToken()) showApp();

export async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Error ${res.status}`);
  }
  return res.json();
}
