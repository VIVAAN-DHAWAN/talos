/**
 * Panic panel.
 *
 * Safety layers, in order:
 *   1. Reason field is required (min 3 chars).
 *   2. SHA field is optional but if present must look like a 7..40 hex.
 *   3. A confirmation checkbox must be checked before the submit button
 *      is enabled.
 *   4. The submit handler intercepts the form, opens a confirmation
 *      modal that summarises the action, and only fires the request
 *      after the operator clicks the modal's "Confirm and revert"
 *      button.
 *   5. The modal traps focus and restores it on close.
 */

import { api, ApiError } from './api.js';
import { toast } from './toast.js';
import { byId, h, shortSha } from './dom.js';
import { openModal, closeModal } from './modal.js';

const SHA_RE = /^[0-9a-f]{7,40}$/i;

export function initPanic() {
  const form = byId('panic-form');
  const sha = byId('panic-sha');
  const reason = byId('panic-reason');
  const confirm = byId('panic-confirm');
  const submit = byId('btn-trigger-panic');

  const refresh = () => {
    const reasonOk = reason.value.trim().length >= 3;
    const shaOk = sha.value.trim().length === 0 || SHA_RE.test(sha.value.trim());
    submit.disabled = !(reasonOk && shaOk && confirm.checked);
    reason.setCustomValidity(reasonOk ? '' : 'Reason must be at least 3 characters.');
    sha.setCustomValidity(shaOk ? '' : 'SHA must be 7..40 hex characters, or blank.');
  };
  [sha, reason, confirm].forEach((el) => el.addEventListener('input', refresh));
  refresh();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (submit.disabled) return;
    openPanicModal({
      sha: sha.value.trim() || 'HEAD',
      reason: reason.value.trim()
    });
  });
}

function openPanicModal({ sha, reason }) {
  const summary = byId('panic-modal-summary');
  const details = byId('panic-modal-details');
  if (summary) {
    summary.textContent = `Reverting ${sha === 'HEAD' ? 'HEAD' : shortSha(sha)} and opening a recovery PR.`;
  }
  if (details) {
    details.replaceChildren();
    details.append(
      h('dt', {}, ['SHA']),
      h('dd', {}, [sha]),
      h('dt', {}, ['Reason']),
      h('dd', {}, [reason])
    );
  }
  openModal('panic-modal', async () => {
    closeModal('panic-modal');
    await executePanic(sha, reason);
  });
}

async function executePanic(sha, reason) {
  const submit = byId('btn-trigger-panic');
  if (submit) submit.disabled = true;
  try {
    const body = { reason };
    if (sha !== 'HEAD') body.sha = sha;
    const res = await api.revert(body);
    if (res.status === 'success') {
      const link = res.pullRequestUrl ? ` PR: ${res.pullRequestUrl}` : '';
      toast('success', `Reverted ${shortSha(res.sha)} on ${res.branch}.${link}`);
    } else {
      toast('warn', `Revert partial: ${res.message}`);
    }
    const form = byId('panic-form');
    if (form && res.status === 'success') form.reset();
    byId('panic-confirm').checked = false;
    byId('btn-trigger-panic').disabled = true;
  } catch (e) {
    const msg = e instanceof ApiError ? `${e.code}: ${e.message}` : (e?.message ?? String(e));
    toast('error', `Revert failed: ${msg}`);
  } finally {
    if (submit) submit.disabled = false;
  }
}
