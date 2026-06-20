/**
 * Tiny DOM helpers. No jQuery, no framework. Plain JS so the browser
 * loads these without a build step.
 */

/** Type-safe `document.getElementById`. Throws if missing. */
export function byId(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element #${id} not found`);
  return el;
}

/** Optional variant that returns null instead of throwing. */
export function maybeById(id) {
  return document.getElementById(id);
}

/** Create an element with attributes and children in one call. */
export function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v);
  }
  for (const c of children) {
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

/**
 * Escape dynamic strings before interpolating into innerHTML.
 * Use this only when textContent is not an option (e.g. building rich
 * HTML with embedded anchors).
 */
export function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Promise-based delay. */
export function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Formats an ISO timestamp as a compact local string. */
export function formatTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Truncates a SHA to 12 chars for display. */
export function shortSha(sha) {
  if (!sha) return '—';
  return sha.length > 12 ? sha.slice(0, 12) : sha;
}
