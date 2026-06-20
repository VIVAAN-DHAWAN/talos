/**
 * History panel. Renders the audit log as a dense, sortable table.
 * Newest entries first (the API already returns them newest-first).
 */

import { api, ApiError } from './api.js';
import { store } from './state.js';
import { h, formatTime, shortSha } from './dom.js';

export function initHistory() {
  store.subscribe(render);
  render(store.get());
}

export async function refreshHistory() {
  store.set({ historyLoading: true });
  try {
    const res = await api.history();
    store.set({ history: res, historyLoading: false });
  } catch (e) {
    store.set({ historyLoading: false });
    const msg = e instanceof ApiError ? `${e.code}: ${e.message}` : (e?.message ?? String(e));
    import('./toast.js').then(({ toast }) => toast('error', `Failed to load history: ${msg}`));
  }
}

function render(state) {
  const tbody = document.getElementById('history-log-rows');
  const count = document.getElementById('history-count');
  if (!tbody || !count) return;
  const records = state.history?.records ?? [];
  count.textContent = String(records.length);
  tbody.replaceChildren();

  if (records.length === 0) {
    const tr = h('tr', {}, [
      h('td', { colspan: '5', class: 'empty-state' }, ['No audit entries yet.'])
    ]);
    tbody.append(tr);
    return;
  }

  for (const r of records) {
    const tr = h('tr', {}, []);
    tr.append(
      h('td', {}, [formatTime(r.timestamp)]),
      h('td', { class: 'kind' }, [r.kind]),
      h('td', {}, [h('span', { class: `status status-${r.status}` }, [r.status])]),
      h('td', { class: 'msg' }, [r.message]),
      h('td', { class: 'ref' }, [refLabel(r)])
    );
    tbody.append(tr);
  }
}

function refLabel(r) {
  if (r.pullRequestUrl) return `PR ${shortSha(r.branch ?? r.pullRequestUrl)}`;
  if (r.sha) return shortSha(r.sha);
  if (r.branch) return r.branch;
  return '—';
}
