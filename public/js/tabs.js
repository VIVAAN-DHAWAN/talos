/**
 * Accessible tab navigation.
 *
 * - Arrow Left / Right move between tabs (WAI-ARIA tabs pattern).
 * - Home / End jump to first / last tab.
 * - Click and Enter/Space both activate a tab.
 * - The newly active tab receives focus (recommended pattern).
 * - The previously active panel is `hidden` so it's removed from the
 *   a11y tree and tab order.
 *
 * Tabs are real <button> elements so they get default keyboard semantics;
 * we only layer on roving tabindex and arrow handling.
 */

import { store } from './state.js';

const TAB_IDS = ['dashboard', 'scanner', 'panic', 'history'];

const TITLES = {
  dashboard: ['Dashboard', 'Repository health snapshot.'],
  scanner: ['Scanner', 'Run audit-only or audit-with-cleanup.'],
  panic: ['Panic', 'Revert a commit and open a recovery PR.'],
  history: ['Scan logs', 'Append-only audit trail of every action.']
};

export function initTabs() {
  const tabs = /** @type {HTMLButtonElement[]} */ (
    Array.from(document.querySelectorAll('[role="tab"][data-tab]'))
  );
  if (tabs.length === 0) return;

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => activate(tab.dataset.tab));
    tab.addEventListener('keydown', (e) => onKey(e, tab));
  });

  // Set initial state from the markup (dashboard is active by default).
  syncDom(store.get().activeTab);
}

function onKey(e, tab) {
  const current = TAB_IDS.indexOf(tab.dataset.tab);
  if (current === -1) return;
  let next = current;
  switch (e.key) {
    case 'ArrowRight': next = (current + 1) % TAB_IDS.length; break;
    case 'ArrowLeft': next = (current - 1 + TAB_IDS.length) % TAB_IDS.length; break;
    case 'Home': next = 0; break;
    case 'End': next = TAB_IDS.length - 1; break;
    default: return;
  }
  e.preventDefault();
  activate(TAB_IDS[next]);
  // Move focus to the newly activated tab.
  const target = document.querySelector(`[role="tab"][data-tab="${TAB_IDS[next]}"]`);
  if (target instanceof HTMLElement) target.focus();
}

export function activate(tabId) {
  if (!TAB_IDS.includes(tabId)) return;
  store.set({ activeTab: tabId });
  syncDom(tabId);
}

function syncDom(tabId) {
  const tabs = document.querySelectorAll('[role="tab"][data-tab]');
  const panels = document.querySelectorAll('[role="tabpanel"]');
  tabs.forEach((t) => {
    const active = t.dataset.tab === tabId;
    t.setAttribute('aria-selected', active ? 'true' : 'false');
    t.tabIndex = active ? 0 : -1;
  });
  panels.forEach((p) => {
    const active = p.id === `panel-${tabId}`;
    if (active) {
      p.removeAttribute('hidden');
      p.classList.add('panel-active');
    } else {
      p.setAttribute('hidden', '');
      p.classList.remove('panel-active');
    }
  });
  const [title, subtitle] = TITLES[tabId] ?? ['', ''];
  const t = document.getElementById('view-title');
  const s = document.getElementById('view-subtitle');
  if (t) t.textContent = title;
  if (s) s.textContent = subtitle;
}
