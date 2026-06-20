/**
 * Dashboard panel rendering. Subscribes to the store and re-renders
 * the health ring, stat grid, and detail lists whenever the status
 * payload changes.
 */

import { store } from './state.js';
import { h } from './dom.js';

const RING_CIRCUMFERENCE = 2 * Math.PI * 52; // r=52 in the SVG

export function initDashboard() {
  store.subscribe(render);
  render(store.get());
}

function render(state) {
  const status = state.status;
  const loading = state.statusLoading;

  setText('stat-source-files', loading ? '—' : status ? String(status.stats.sourceFileCount) : '—');
  setText('stat-unused-files', loading || !status?.scan ? '—' : String(status.scan.unusedFiles.length));
  setText('stat-unused-deps', loading || !status?.scan ? '—' : String(status.scan.unusedDependencies.length));
  setText('stat-unused-exports', loading || !status?.scan
    ? '—'
    : String(status.scan.unusedExports.reduce((n, e) => n + e.names.length, 0)));

  renderHealthRing(status?.scan?.healthScore ?? null);
  renderHero(status);
  renderList('list-unused-files', 'count-unused-files', status?.scan?.unusedFiles ?? []);
  renderList('list-unused-deps', 'count-unused-deps', status?.scan?.unusedDependencies ?? []);

  const version = document.getElementById('brand-version');
  if (version && status?.package?.version) version.textContent = `v${status.package.version}`;
}

function renderHealthRing(score) {
  const ring = document.getElementById('health-ring');
  const valueEl = document.getElementById('health-score');
  if (!ring || !valueEl) return;
  if (score === null) {
    valueEl.textContent = '—';
    ring.dataset.state = '';
    return;
  }
  valueEl.textContent = String(score);
  const clamped = Math.max(0, Math.min(100, score));
  const offset = RING_CIRCUMFERENCE * (1 - clamped / 100);
  const progress = ring.querySelector('.ring-progress');
  if (progress) progress.style.strokeDashoffset = String(offset);
  ring.dataset.state = clamped >= 80 ? '' : clamped >= 50 ? 'warn' : 'danger';
}

function renderHero(status) {
  const headline = document.getElementById('hero-headline');
  const subline = document.getElementById('hero-subline');
  if (!headline || !subline) return;
  if (!status) {
    headline.textContent = 'Repository health unavailable.';
    subline.textContent = 'Try refreshing, or check /api/status directly.';
    return;
  }
  const score = status.scan?.healthScore ?? 0;
  const verdict = score >= 80 ? 'Healthy' : score >= 50 ? 'Needs attention' : 'At risk';
  headline.textContent = `${verdict} — ${status.repo.name} @ ${status.package.version}`;
  const branch = status.repo.branch ?? 'detached';
  const sha = status.repo.headSha ? status.repo.headSha.slice(0, 12) : 'no HEAD';
  const clean = status.repo.isClean ? 'clean' : 'dirty';
  subline.textContent = `branch ${branch} · ${sha} · working tree ${clean}`;
}

function renderList(listId, countId, items) {
  const list = document.getElementById(listId);
  const count = document.getElementById(countId);
  if (!list || !count) return;
  count.textContent = String(items.length);
  list.replaceChildren();
  if (items.length === 0) {
    const li = h('li', { class: 'empty-state-li' }, []);
    const p = h('p', { class: 'empty-state' }, ['None detected.']);
    li.append(p);
    list.append(li);
    return;
  }
  for (const item of items) {
    const text = typeof item === 'string' ? item : `${item.file} :: ${item.names.join(', ')}`;
    const li = h('li', {}, [text]);
    list.append(li);
  }
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}
