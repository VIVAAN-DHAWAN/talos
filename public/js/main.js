/**
 * App entry. Wires modules and kicks off the initial data load.
 */

import { initTabs, activate } from './tabs.js';
import { initModal } from './modal.js';
import { initDashboard } from './dashboard.js';
import { initScanner } from './scanner.js';
import { initPanic } from './panic.js';
import { initHistory, refreshHistory } from './history.js';
import { api, ApiError } from './api.js';
import { store } from './state.js';
import { toast } from './toast.js';

async function boot() {
  initTabs();
  initModal();
  initDashboard();
  initScanner();
  initPanic();
  initHistory();

  // Refresh button — always re-fetches status + history.
  document.getElementById('btn-refresh')?.addEventListener('click', () => {
    refreshStatus();
    refreshHistory();
  });

  await Promise.allSettled([refreshStatus(), refreshHistory()]);
  refreshGithubStatus();
}

export async function refreshStatus() {
  store.set({ statusLoading: true });
  try {
    const status = await api.status();
    store.set({ status, statusLoading: false });
  } catch (e) {
    store.set({ statusLoading: false });
    const msg = e instanceof ApiError ? `${e.code}: ${e.message}` : (e?.message ?? String(e));
    toast('error', `Failed to load status: ${msg}`);
  }
}

async function refreshGithubStatus() {
  const pill = document.getElementById('github-status');
  if (!pill) return;
  const state = store.get().status;
  // The status payload surfaces `scannerAvailable` which we use as a proxy
  // for "is GitHub reachable from this server". A more precise check would
  // hit /api/scan with cleanup=true; that's destructive so we don't.
  const ok = state?.scannerAvailable ?? false;
  pill.dataset.state = ok ? 'ok' : 'warn';
  pill.querySelector('.text').textContent = ok ? 'GitHub reachable' : 'Shell disabled';
}

boot().catch((e) => {
  // Last-resort handler so a failure in init code is visible.
  console.error('[talos] boot failed', e);
  toast('error', 'Talos failed to start. See console for details.');
});
