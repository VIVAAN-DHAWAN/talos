/**
 * Toast notifications. Singleton region in the DOM with aria-live so
 * screen readers announce new messages.
 */

import { byId, h } from './dom.js';

const REGION_ID = 'toast-region';

export function toast(kind, message, ttl = 5_000) {
  const region = byId(REGION_ID);
  const el = h('div', { class: 'toast', 'data-kind': kind, role: 'status' }, [message]);
  region.append(el);
  setTimeout(() => {
    el.style.transition = 'opacity 200ms';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 220);
  }, ttl);
}
