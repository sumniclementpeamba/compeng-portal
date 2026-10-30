const TOKEN_KEY = 'compeng.token';

// Backend origin for cross-origin fetches (Render + Vercel setup).
// Empty string in local dev — Vite's proxy handles /api.
export const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

/** Prefix a relative path (e.g. "/api/me/avatar/") with the backend origin. */
export function apiUrl(path) {
  if (!path) return path;
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE}${path}`;
}

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function apiRequest(path, { method = 'GET', body } = {}) {
  const opts = { method, headers: {} };

  if (body instanceof FormData) {
    opts.body = body;
  } else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }

  const token = getToken();
  if (token) opts.headers.Authorization = `Token ${token}`;

  const res = await fetch(`${API_BASE}/api${path}`, opts);

  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const message =
      (data && (data.detail || data.message)) ||
      (data && Object.values(data).flat().join(' ')) ||
      `Request failed (${res.status})`;
    throw new ApiError(message, res.status, data);
  }

  return data;
}

export const api = {
  get: (p) => apiRequest(p),
  post: (p, b) => apiRequest(p, { method: 'POST', body: b }),
  patch: (p, b) => apiRequest(p, { method: 'PATCH', body: b }),
  del: (p) => apiRequest(p, { method: 'DELETE' }),
};

// ── File helpers ─────────────────────────────────────────────

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Token ${token}` } : {};
}

export async function downloadResourceFile(id) {
  const res = await fetch(`${API_BASE}/api/resources/${id}/download/`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  return res.blob();
}

export async function viewResourceFile(id) {
  const res = await fetch(`${API_BASE}/api/resources/${id}/view/`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Unable to open file (${res.status})`);
  return res.blob();
}

export async function downloadVersionFile(versionId) {
  const res = await fetch(`${API_BASE}/api/resources/versions/${versionId}/download/`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  return res.blob();
} 