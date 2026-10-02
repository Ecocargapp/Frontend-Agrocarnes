// Cliente HTTP + caché ligera de catálogos (empresas, bodegas, productos, terceros).

export const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:4001'
  : 'https://api-agrocarnes.agrofranpabel.com';

const TOKEN_KEY = 'agrocarnes_token';
const USER_KEY = 'agrocarnes_usuario';

export const session = {
  get token() { return localStorage.getItem(TOKEN_KEY); },
  get usuario() { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; } },
  set(token, usuario) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(usuario));
  },
  clear() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); },
};

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401 && !path.startsWith('/auth')) {
    session.clear();
    window.dispatchEvent(new CustomEvent('agrocarnes:logout'));
    throw new ApiError('Sesión expirada, vuelve a entrar', 401);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `Error ${res.status}`, res.status);
  return data;
}

// Descarga un archivo (ej. PDF) autenticado y devuelve un Blob.
export async function apiArchivo(path) {
  const res = await fetch(`${API_BASE}${path}`, { headers: session.token ? { Authorization: `Bearer ${session.token}` } : {} });
  if (res.status === 401) {
    session.clear();
    window.dispatchEvent(new CustomEvent('agrocarnes:logout'));
    throw new ApiError('Sesión expirada, vuelve a entrar', 401);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(data.error || `Error ${res.status}`, res.status);
  }
  return res.blob();
}

// ---- catálogos (se cachean hasta que algo los invalide) ----
const cache = new Map();

export async function catalogo(nombre, force = false) {
  if (!force && cache.has(nombre)) return cache.get(nombre);
  const rutas = {
    empresas: '/empresas',
    bodegas: '/bodegas',
    productos: '/productos',
    proveedores: '/terceros?tipo=proveedor',
    clientes: '/terceros?tipo=cliente',
  };
  const data = await api(rutas[nombre]);
  cache.set(nombre, data);
  return data;
}

export function invalidar(...nombres) {
  if (nombres.length === 0) cache.clear();
  nombres.forEach((n) => cache.delete(n));
}
