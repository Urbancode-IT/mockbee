/**
 * API base URL
 * - Dev: empty string → Vite proxies /api → backend (127.0.0.1:8001)
 * - Override with VITE_API_BASE in frontend/.env
 * - Production fallback: Render URL
 */
const envBase = import.meta.env.VITE_API_BASE

const isLocal =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.protocol === 'file:' ||
    window.location.hostname === '')

export const API_BASE =
  envBase !== undefined && envBase !== ''
    ? envBase.replace(/\/$/, '')
    : isLocal
      ? ''
      : 'https://mockbee.onrender.com'

export async function apiFetch(path, options = {}) {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })

  const body = await res.json().catch(() => ({}))
  return { status: res.status, body, ok: res.ok }
}
