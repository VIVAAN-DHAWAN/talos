/**
 * API client. Thin fetch wrappers that throw typed errors on non-2xx
 * responses. The error message carries the API's `error.code` so the
 * UI can branch on it without string matching.
 *
 * Response shapes mirror the contracts in src/types/api.ts but are
 * declared inline here so the browser never needs to load backend types.
 */

export class ApiError extends Error {
  constructor(code, message, status, details) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

async function request(path, init) {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) }
  });
  const text = await res.text();
  const body = text ? safeJson(text) : null;
  if (!res.ok) {
    const err = body && typeof body === 'object' && 'error' in body
      ? body.error
      : { code: 'HTTP_ERROR', message: `HTTP ${res.status}` };
    throw new ApiError(err.code, err.message, res.status, err.details);
  }
  return body;
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

export const api = {
  health: () => request('/health'),
  status: () => request('/api/status'),
  history: () => request('/api/history'),
  scan: (body) => request('/api/scan', { method: 'POST', body: JSON.stringify(body) }),
  revert: (body) => request('/api/revert', { method: 'POST', body: JSON.stringify(body) })
};
