/**
 * Compare provider (F5): up to 3 PG ids, a bottom tray, and the "+ Compare" buttons.
 * Persists in localStorage under `pgc.compare` (inside try/catch: private windows can throw; the page works without it).
 * The tray holds only public PG ids, so it is not cleared on sign-out. Hidden for owners and when the flag is off.
 */
(function (PGC) {
  'use strict';

  const { html } = PGC.utils;
  const KEY = 'pgc.compare';
  const MAX = 3;
  const ID_RE = /^[A-Za-z0-9_-]{4,40}$/;
  const listeners = new Set();
  const info = {}; // id -> { name, image } for the tray thumbnails, filled from the existing ["pg", id] cache
  let ids = [];

  const clean = (list) => (Array.isArray(list) ? list.filter((x, i, a) => typeof x === 'string' && ID_RE.test(x) && a.indexOf(x) === i).slice(0, MAX) : []);
  function load() { try { ids = clean(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch (_) { ids = []; } }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(ids)); } catch (_) { /* storage blocked: memory only */ } }

  const enabled = () => PGC.features.on('COMPARE') && !PGC.auth.isOwner;
  const has = (id) => ids.includes(id);
  const list = () => ids.slice();

  function emit() { persist(); listeners.forEach((fn) => fn(ids.slice())); refresh(); }

  function add(id) {
    if (!ID_RE.test(id) || has(id)) return true;
    if (ids.length >= MAX) {
      PGC.ui.toast('You can compare up to 3 PGs. Remove one to add another.');
      const tray = document.getElementById('compare-tray');
      if (tray) { tray.classList.remove('is-shake'); void tray.offsetWidth; tray.classList.add('is-shake'); }
      return false;
    }
    ids.push(id); emit(); return true;
  }
  function remove(id) { if (has(id)) { ids = ids.filter((x) => x !== id); emit(); } }
  function clear() { if (ids.length) { ids = []; emit(); } }
  function set(next) { ids = clean(next); emit(); }
  const toggle = (id) => (has(id) ? (remove(id), true) : add(id));

  /** Keeps every "+ Compare" button on the page in step with the state. */
  function syncButtons() {
    document.querySelectorAll('[data-action="toggle-compare"]').forEach((btn) => {
      const on = has(btn.dataset.pgId);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.textContent = on ? '✓ Added' : '+ Compare';
      if (btn.dataset.name) btn.setAttribute('aria-label', `${btn.textContent} ${btn.dataset.name}`);
    });
  }

  /* ---------- tray ---------- */
  function ensureTray() {
    let tray = document.getElementById('compare-tray');
    if (!tray) {
      tray = document.createElement('div');
      tray.id = 'compare-tray';
      tray.className = 'compare-tray';
      tray.setAttribute('role', 'region');
      tray.setAttribute('aria-label', 'Compare PGs');
      tray.setAttribute('data-testid', 'compare-tray');
      tray.hidden = true;
      document.body.appendChild(tray);
      tray.addEventListener('animationend', () => tray.classList.remove('is-shake'));
    }
    return tray;
  }

  function renderTray() {
    const tray = ensureTray();
    const show = enabled() && ids.length > 0;
    tray.hidden = !show;
    document.body.classList.toggle('has-compare-tray', show);
    if (!show) { tray.innerHTML = ''; return; }
    const query = PGC.router.parse(PGC.router.currentHash()).query;
    tray.innerHTML = html`
      <div class="compare-tray__inner">
        <ul class="compare-tray__items">
          ${ids.map((id) => html`
            <li class="compare-tray__item">
              <img src="${(info[id] && info[id].image) || PGC.c.FALLBACK_IMAGE}" alt="" width="40" height="40">
              <span class="compare-tray__name">${(info[id] && info[id].name) || 'Loading'}</span>
              <button type="button" class="compare-tray__x" data-action="compare-remove" data-pg-id="${id}" aria-label="Remove ${(info[id] && info[id].name) || 'PG'} from compare" data-testid="compare-remove-${id}">✕</button>
            </li>`)}
        </ul>
        <p class="compare-tray__count" data-testid="compare-count" aria-live="polite">Compare (${ids.length}/${MAX})</p>
        <div class="compare-tray__actions">
          <button type="button" class="btn btn--primary btn--sm" data-action="compare-go" data-ref="${query.ref || ''}" ${ids.length < 2 ? 'disabled' : ''} data-testid="compare-go">Compare now</button>
          <button type="button" class="btn btn--ghost btn--sm" data-action="compare-clear" data-testid="compare-clear">Clear</button>
        </div>
      </div>`.toString();
    // fill in names and photos from the existing PG cache (same key as the detail page)
    ids.filter((id) => !info[id]).forEach((id) => {
      PGC.query.get(['pg', id], () => PGC.api.getPg(id)).then((pg) => { info[id] = { name: pg.name, image: pg.images && pg.images[0] }; renderTray(); }, () => { info[id] = { name: 'Unavailable PG' }; renderTray(); });
    });
  }

  function refresh() { syncButtons(); renderTray(); }

  function init() {
    load();
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action="toggle-compare"]');
      if (btn) { e.preventDefault(); e.stopPropagation(); toggle(btn.dataset.pgId); return; }
      const rm = e.target.closest('[data-action="compare-remove"]');
      if (rm) { remove(rm.dataset.pgId); return; }
      if (e.target.closest('[data-action="compare-clear"]')) { clear(); return; }
      const go = e.target.closest('[data-action="compare-go"]');
      if (go && ids.length >= 2) PGC.router.go(`/compare?ids=${ids.join(',')}${go.dataset.ref ? `&ref=${encodeURIComponent(go.dataset.ref)}` : ''}`);
    });
    window.addEventListener('hashchange', renderTray); // the tray's "ref" follows the current Explore URL
    PGC.events.on('auth', refresh);
    refresh();
  }

  PGC.compare = { enabled, has, list, add, remove, clear, set, toggle, refresh, init, MAX, clean };
})(window.PGC);
