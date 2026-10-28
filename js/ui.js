/**
 * UI primitives: toasts, modal dialogs / bottom sheets (with focus trap), confirm dialog, image lightbox.
 */
(function (PGC) {
  'use strict';

  const { html, $ } = PGC.utils;
  const prefersReducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- toasts ---------- */

  /** @param {string} message  @param {{type?:'info'|'success'|'error', ms?:number}} [opts] */
  function toast(message, { type = 'info', ms = 3800 } = {}) {
    const root = $('#toast-root');
    if (!root) return;
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.textContent = message; // textContent: never interpret messages as HTML
    root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-in'));
    const remove = () => {
      el.classList.remove('is-in');
      setTimeout(() => el.remove(), prefersReducedMotion() ? 0 : 250);
    };
    const timer = setTimeout(remove, ms);
    el.addEventListener('click', () => { clearTimeout(timer); remove(); });
  }

  /* ---------- modals ---------- */

  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const stack = [];

  /**
   * Opens a modal and returns `{ el, close }`.
   * variant: 'dialog' (centered), 'sheet' (bottom sheet on small screens), 'lightbox' (full-screen image viewer).
   * Esc and a click on the backdrop close it; Tab is trapped inside; focus returns to the opener on close.
   */
  function openModal({ content, variant = 'dialog', label = 'Dialog', onClose, onKey } = {}) {
    const root = $('#modal-root');
    const opener = document.activeElement;
    const backdrop = document.createElement('div');
    backdrop.className = `modal-backdrop modal-backdrop--${variant}`;
    const panel = document.createElement('div');
    panel.className = `modal modal--${variant}`;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', label);
    panel.tabIndex = -1;
    if (content instanceof Node) panel.appendChild(content); else panel.innerHTML = String(content);
    backdrop.appendChild(panel);
    root.appendChild(backdrop);
    document.body.classList.add('modal-open');
    requestAnimationFrame(() => backdrop.classList.add('is-open'));

    let closed = false;
    const modal = {
      el: panel,
      close(result) {
        if (closed) return;
        closed = true;
        const i = stack.indexOf(modal);
        if (i >= 0) stack.splice(i, 1);
        document.removeEventListener('keydown', keydown, true);
        backdrop.classList.remove('is-open');
        setTimeout(() => backdrop.remove(), prefersReducedMotion() ? 0 : 200);
        if (!stack.length) document.body.classList.remove('modal-open');
        if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus({ preventScroll: true });
        if (onClose) onClose(result);
      },
    };

    function keydown(e) {
      if (stack[stack.length - 1] !== modal) return; // only the top-most modal reacts
      if (e.key === 'Escape') { e.stopPropagation(); modal.close(); return; }
      if (onKey && onKey(e) === true) return;
      if (e.key !== 'Tab') return;
      const items = Array.from(panel.querySelectorAll(FOCUSABLE)).filter((n) => n.offsetParent !== null || n === document.activeElement);
      if (!items.length) { e.preventDefault(); panel.focus(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) modal.close(); });
    panel.addEventListener('click', (e) => { if (e.target.closest('[data-modal-close]')) modal.close(); });
    document.addEventListener('keydown', keydown, true);
    stack.push(modal);

    const autofocus = panel.querySelector('[data-autofocus]') || panel.querySelector(FOCUSABLE) || panel;
    autofocus.focus({ preventScroll: true });
    return modal;
  }

  /** Promise-based confirmation dialog. Resolves true only when the user confirms. */
  function confirmDialog({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) {
    return new Promise((resolve) => {
      const modal = openModal({
        variant: 'dialog',
        label: title,
        content: html`
          <div class="dialog">
            <h2 class="dialog__title">${title}</h2>
            <p class="dialog__text">${message}</p>
            <div class="dialog__actions">
              <button type="button" class="btn btn--ghost" data-modal-close data-testid="confirm-cancel">${cancelLabel}</button>
              <button type="button" class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-confirm data-autofocus data-testid="confirm-ok">${confirmLabel}</button>
            </div>
          </div>`,
        onClose: (result) => resolve(result === true),
      });
      modal.el.querySelector('[data-confirm]').addEventListener('click', () => modal.close(true));
    });
  }

  /** Full-screen image viewer with prev / next (buttons and arrow keys). */
  function openLightbox(images, startIndex = 0, altBase = 'Photo') {
    let index = startIndex;
    const many = images.length > 1;
    const modal = openModal({
      variant: 'lightbox',
      label: `${altBase} photo viewer`,
      content: html`
        <div class="lightbox">
          <button type="button" class="lightbox__close" data-modal-close aria-label="Close photo viewer">✕</button>
          ${many && html`<button type="button" class="lightbox__nav lightbox__nav--prev" data-step="-1" aria-label="Previous photo">‹</button>`}
          <img class="lightbox__img" alt="" src="">
          ${many && html`<button type="button" class="lightbox__nav lightbox__nav--next" data-step="1" aria-label="Next photo">›</button>`}
          <p class="lightbox__count" aria-live="polite"></p>
        </div>`,
      onKey(e) {
        if (!many) return false;
        if (e.key === 'ArrowLeft') { show(-1); return true; }
        if (e.key === 'ArrowRight') { show(1); return true; }
        return false;
      },
    });
    const img = modal.el.querySelector('.lightbox__img');
    const count = modal.el.querySelector('.lightbox__count');
    function show(step = 0) {
      index = (index + step + images.length) % images.length;
      img.src = images[index];
      img.alt = `${altBase}, photo ${index + 1} of ${images.length}`;
      count.textContent = `${index + 1} / ${images.length}`;
    }
    modal.el.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-step]');
      if (btn) show(Number(btn.dataset.step));
    });
    show(0);
    return modal;
  }

  PGC.ui = { toast, openModal, confirmDialog, openLightbox };
})(window.PGC);
