// Thin client for the GreenOrb API. In dev, Vite proxies /api to the backend; in production
// set VITE_API_BASE to the API origin (e.g. https://greenorb-api.onrender.com).
export const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

const TOKEN_KEY = 'greenorb.reviewerToken';
export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}
export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable: token lives for this page only */
  }
  window.dispatchEvent(new Event('greenorb:token'));
}

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export async function api(path, { method = 'GET', body, form, signal, auth = true } = {}) {
  const headers = {};
  const token = auth ? getToken() : '';
  if (token) headers.authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`${API_BASE}/api${path}`, { method, headers, body: payload, signal });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, 'Cannot reach the GreenOrb API. Is the backend running?');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error || `Request failed (${res.status})`, data?.details);
  return data;
}

export const fileUrl = (reportId, page) => `${API_BASE}/api/reports/${reportId}/file${page ? `#page=${page}` : ''}`;
