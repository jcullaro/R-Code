// Thin fetch wrapper. If the server has MARGINS_TOKEN set, the UI asks for the
// token once and keeps it in localStorage.

function token() {
  return localStorage.getItem('margins_token') || '';
}

export async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (opts.body && !(opts.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    opts = { ...opts, body: JSON.stringify(opts.body) };
  }
  if (token()) headers['Authorization'] = `Bearer ${token()}`;
  const res = await fetch(path, { ...opts, headers });
  if (res.status === 401) {
    const t = prompt('This Margins server requires an access token:');
    if (t) {
      localStorage.setItem('margins_token', t.trim());
      return api(path, opts);
    }
    throw new Error('unauthorized');
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg = (await res.json()).error || msg; } catch { /* keep status */ }
    throw new Error(msg);
  }
  return res.json();
}

export function toast(msg, ms = 2600) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
