/**
 * Scanner panel. Three actions:
 *   - Run audit (dry scan)
 *   - Audit + cleanup (no PR)
 *   - Audit + cleanup + PR
 *
 * Each action disables its buttons while in flight, surfaces a status
 * pill, and writes a toast on completion. The result card re-renders
 * from the API response.
 */

import { api, ApiError } from './api.js';
import { toast } from './toast.js';
import { h } from './dom.js';

export function initScanner() {
  const btnQuick = document.getElementById('btn-quick-scan');
  const btnAudit = document.getElementById('btn-run-audit');
  const btnCleanup = document.getElementById('btn-run-cleanup');
  btnQuick?.addEventListener('click', () => run(false, false));
  btnAudit?.addEventListener('click', () => run(true, false));
  btnCleanup?.addEventListener('click', () => run(true, true));
}

async function run(cleanup, openPullRequest) {
  setPill('running', 'running');
  setButtonsDisabled(true);
  try {
    const res = await api.scan({ cleanup, openPullRequest });
    renderResult(res);
    if (res.status === 'no-changes') {
      toast('info', 'Scan complete — no cleanup needed.');
      setPill('partial', 'no-changes');
    } else if (res.pullRequestUrl) {
      toast('success', `Cleanup PR opened: ${res.pullRequestUrl}`);
      setPill('success', 'pr-opened');
    } else if (res.cleanupPerformed) {
      toast('success', 'Cleanup applied. No PR opened.');
      setPill('success', 'cleaned');
    } else {
      toast('info', 'Audit complete.');
      setPill('success', 'audited');
    }
  } catch (e) {
    const msg = e instanceof ApiError ? `${e.code}: ${e.message}` : (e?.message ?? String(e));
    toast('error', `Scan failed: ${msg}`);
    setPill('failure', 'failed');
  } finally {
    setButtonsDisabled(false);
  }
}

function setPill(state, label) {
  const pill = document.getElementById('scan-status-pill');
  if (!pill) return;
  pill.dataset.state = state;
  pill.textContent = label;
}

function setButtonsDisabled(disabled) {
  for (const id of ['btn-quick-scan', 'btn-run-audit', 'btn-run-cleanup']) {
    const el = document.getElementById(id);
    if (el instanceof HTMLButtonElement) el.disabled = disabled;
  }
}

function renderResult(res) {
  const container = document.getElementById('scan-results');
  if (!container) return;
  container.replaceChildren();

  const summary = h('div', { class: 'scan-summary' }, []);
  summary.append(
    statCard('Files', String(res.scan.unusedFiles.length)),
    statCard('Deps', String(res.scan.unusedDependencies.length)),
    statCard('Exports', String(res.scan.unusedExports.reduce((n, e) => n + e.names.length, 0))),
    statCard('Health', String(res.scan.healthScore))
  );
  container.append(summary);

  const lines = [];
  if (res.cleanupPerformed) lines.push(`Cleanup: applied`);
  else lines.push(`Cleanup: skipped (audit only)`);
  if (res.branch) lines.push(`Branch: ${res.branch}`);
  if (res.pullRequestUrl) {
    const a = h('a', { href: res.pullRequestUrl, target: '_blank', rel: 'noopener' }, [res.pullRequestUrl]);
    const line = h('div', { class: 'scan-result-line' }, ['PR: ']);
    line.append(a);
    container.append(line);
  }
  for (const l of lines) {
    container.append(h('div', { class: 'scan-result-line' }, [l]));
  }
}

function statCard(label, value) {
  const card = h('article', { class: 'stat-card' }, []);
  card.append(
    h('h3', { class: 'stat-label' }, [label]),
    h('p', { class: 'stat-value' }, [value])
  );
  return card;
}
