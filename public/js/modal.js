/**
 * Modal controller. Implements the WAI-ARIA dialog pattern:
 *   - focus is trapped inside the dialog while open
 *   - Escape closes the dialog
 *   - clicking the backdrop or any [data-modal-close] closes the dialog
 *   - focus is restored to the previously-focused element on close
 *   - the confirm callback is invoked when the dialog's confirm button
 *     is clicked (the dialog markup is responsible for wiring that
 *     button to openModal's onConfirm)
 *
 * Only one modal is open at a time.
 */

let lastFocused = null;
let activeOnConfirm = null;

export function initModal() {
  // Wire close handlers for every modal in the DOM.
  document.querySelectorAll('.modal').forEach((modal) => {
    modal.addEventListener('click', (e) => {
      const t = e.target;
      if (t instanceof HTMLElement && t.dataset.modalClose !== undefined) {
        closeModal(modal.id);
      }
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activeOnConfirm !== null) {
      const open = document.querySelector('.modal:not([hidden])');
      if (open instanceof HTMLElement) closeModal(open.id);
    }
  });
  // Trap focus.
  document.addEventListener('focusin', (e) => {
    const open = document.querySelector('.modal:not([hidden])');
    if (!open) return;
    if (!open.contains(e.target)) {
      const focusable = open.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (focusable instanceof HTMLElement) focusable.focus();
    }
  });
}

export function openModal(id, onConfirm) {
  const modal = document.getElementById(id);
  if (!modal) return;
  lastFocused = document.activeElement;
  activeOnConfirm = onConfirm ?? null;
  modal.hidden = false;
  // Wire confirm button (only one per modal in this UI).
  const confirmBtn = modal.querySelector('[id^="btn-modal-confirm"]');
  if (confirmBtn instanceof HTMLElement) {
    // Replace listener so we don't double-bind on re-open.
    const handler = () => {
      if (activeOnConfirm) activeOnConfirm();
      activeOnConfirm = null;
    };
    confirmBtn.onclick = handler;
  }
  // Move focus into the dialog.
  const focusable = modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (focusable instanceof HTMLElement) focusable.focus();
}

export function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.hidden = true;
  activeOnConfirm = null;
  if (lastFocused instanceof HTMLElement) lastFocused.focus();
}
