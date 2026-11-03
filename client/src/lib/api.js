/**
 * Small helpers for talking to the server.
 *
 * Where is the backend?
 *   - Development / single-server production: VITE_BACKEND_URL is empty, so we
 *     use relative URLs (/api, ws://<same host>/yjs). The Vite proxy (dev) or
 *     Express itself (prod) handles them.
 *   - Split deployment (frontend on Vercel/Netlify, backend on a VM): set
 *     VITE_BACKEND_URL=https://api.example.com at BUILD time. Vercel/Netlify
 *     cannot proxy WebSockets, so the browser must connect to the backend directly.
 */
const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || '').replace(/\/+$/, '');

async function request(path, options = {}) {
  const res = await fetch(`${BACKEND_URL}/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

export const api = {
  languages: () => request('/languages'),
  createRoom: () => request('/rooms', { method: 'POST' }),
  run: (roomId, payload) =>
    request(`/rooms/${roomId}/run`, { method: 'POST', body: JSON.stringify(payload) }),
  runs: (roomId) => request(`/rooms/${roomId}/runs`),
  runDetail: (roomId, runId) => request(`/rooms/${roomId}/runs/${runId}`),
};

/** Base URL for WebSockets: wss://api.example.com, or ws(s)://<current host>. */
export function wsBase() {
  if (BACKEND_URL) return BACKEND_URL.replace(/^http/, 'ws'); // https -> wss, http -> ws
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}`;
}
