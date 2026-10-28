/**
 * Reusable markup builders. Each returns SafeHtml (see utils.html), so user text is always escaped.
 */
(function (PGC) {
  'use strict';

  const { html, raw, esc, formatINR, genderLabel, formatRating, capitalize } = PGC.utils;

  const FALLBACK_IMAGE = 'assets/images/pg-image-5.jpg';

  /** Builds an HTML attribute string from an object; false/null/undefined are skipped, true renders a bare attribute. */
  const attrs = (obj) => raw(Object.entries(obj || {})
    .filter(([, v]) => v !== false && v !== null && v !== undefined)
    .map(([k, v]) => (v === true ? k : `${k}="${esc(v)}"`))
    .join(' '));

  const spinner = () => html`<span class="spinner" aria-hidden="true"></span>`;

  /** Pill-shaped toggle used for filters (city, type...). */
  const chip = (label, { active = false, ...rest } = {}) => html`
    <button type="button" class="chip${active ? ' is-active' : ''}" aria-pressed="${active ? 'true' : 'false'}" ${attrs(rest)}>${label}</button>`;

  /** Booking status pill. A paid booking reads "Rent paid" regardless of its status. */
  const statusPill = (booking) => booking.paid
    ? html`<span class="status-pill status-pill--paid">Rent paid</span>`
    : html`<span class="status-pill status-pill--${booking.status}">${capitalize(booking.status)}</span>`;

  const stars = (n) => '⭐'.repeat(Math.max(0, Math.min(5, Number(n) || 0)));

  /**
   * PG card used on Explore, Saved and Owner listings.
   * @param {object} pg  PG summary
   * @param {{heart?:'tenant'|'guest'|null, saved?:boolean}} [opts]
   */
  function pgCard(pg, { heart = null, saved = false, compare = false } = {}) {
    const inCompare = compare && PGC.compare && PGC.compare.has(pg.pg_id);
    const cover = (pg.images && pg.images[0]) || FALLBACK_IMAGE;
    const location = `${pg.locality}, ${pg.city}`;
    return html`
      <article class="pg-card" data-testid="pg-card-${pg.pg_id}">
        <a class="pg-card__link" href="#/pg/${encodeURIComponent(pg.pg_id)}">
          <div class="pg-card__media">
            <img src="${cover}" alt="Room photo at ${pg.name}" loading="lazy" decoding="async" width="800" height="500">
            ${pg.verified && html`<span class="verified-pill">✓ Verified</span>`}
            <span class="price-pill">${formatINR(pg.price_from)} <small>/mo</small></span>
          </div>
          <div class="pg-card__body">
            <div class="pg-card__meta">
              <div class="pg-card__titles">
                <h3 class="pg-card__name">${pg.name}</h3>
                <p class="pg-card__loc">${location}</p>
              </div>
              ${pg.rating > 0 && html`<span class="rating-chip"><span class="rating-chip__star" aria-hidden="true">★</span><span class="sr-only">Rated </span>${formatRating(pg.rating)}</span>`}
            </div>
            <div class="pg-card__tags">
              <span class="tag">${genderLabel(pg.gender)}</span>
              ${pg.food_included && html`<span class="tag">🍱 Food included</span>`}
            </div>
          </div>
        </a>
        ${heart && html`
          <button type="button" class="card-heart" data-action="toggle-save" data-pg-id="${pg.pg_id}" data-heart="${heart}"
            aria-pressed="${saved ? 'true' : 'false'}" aria-label="${saved ? 'Remove' : 'Save'} ${pg.name}" data-testid="save-${pg.pg_id}">
            <span aria-hidden="true">${saved ? '❤️' : '🤍'}</span>
          </button>`}
        ${compare && html`
          <button type="button" class="card-compare compare-btn" data-action="toggle-compare" data-pg-id="${pg.pg_id}"
            aria-pressed="${inCompare ? 'true' : 'false'}" data-name="${pg.name}" aria-label="${inCompare ? '✓ Added' : '+ Compare'} ${pg.name}" data-testid="compare-btn-${pg.pg_id}">${inCompare ? '✓ Added' : '+ Compare'}</button>`}
      </article>`;
  }

  /* ---------- skeletons (match the real card shapes, no layout jump) ---------- */

  const skeletonCard = () => html`
    <div class="pg-card pg-card--skeleton" aria-hidden="true">
      <div class="pg-card__media skeleton"></div>
      <div class="pg-card__body">
        <div class="skeleton skeleton--line" style="width:62%"></div>
        <div class="skeleton skeleton--line skeleton--sm" style="width:40%"></div>
        <div class="skeleton skeleton--pill" style="width:30%"></div>
      </div>
    </div>`;

  const skeletonGrid = (n = 6) => html`<div class="pg-grid" role="status" aria-label="Loading">${Array.from({ length: n }, skeletonCard)}</div>`;

  const skeletonRows = (n = 3) => html`
    <div class="stack" role="status" aria-label="Loading">
      ${Array.from({ length: n }, () => html`
        <div class="card card--pad skeleton-row" aria-hidden="true">
          <div class="skeleton skeleton--thumb"></div>
          <div class="skeleton-row__text">
            <div class="skeleton skeleton--line" style="width:55%"></div>
            <div class="skeleton skeleton--line skeleton--sm" style="width:75%"></div>
            <div class="skeleton skeleton--line skeleton--sm" style="width:45%"></div>
          </div>
        </div>`)}
    </div>`;

  const skeletonStats = () => html`
    <div class="stat-grid" role="status" aria-label="Loading">
      ${Array.from({ length: 4 }, () => html`<div class="card card--pad" aria-hidden="true"><div class="skeleton skeleton--line" style="width:30%"></div><div class="skeleton skeleton--line" style="width:50%;height:28px"></div><div class="skeleton skeleton--line skeleton--sm" style="width:60%"></div></div>`)}
    </div>`;

  /* ---------- states ---------- */

  const emptyState = ({ icon, title, text, action }) => html`
    <div class="empty">
      ${icon && html`<div class="empty__icon" aria-hidden="true">${icon}</div>`}
      <h3 class="empty__title">${title}</h3>
      ${text && html`<p class="empty__text">${text}</p>`}
      ${action || ''}
    </div>`;

  const errorState = (message) => html`
    <div class="empty empty--error" role="alert">
      <div class="empty__icon" aria-hidden="true">⚠️</div>
      <h3 class="empty__title">Something went wrong</h3>
      <p class="empty__text">${message}</p>
      <button type="button" class="btn btn--soft" data-action="retry">Try again</button>
    </div>`;

  /**
   * Shows a skeleton, awaits `fetcher`, then renders. On failure shows an error state with a retry button.
   * Bails out silently if the view was left while loading (ctx.alive() === false).
   */
  async function loadInto(ctx, el, { skeleton, fetcher, render, onReady }) {
    if (!el) return;
    el.innerHTML = skeleton.toString();
    el.setAttribute('aria-busy', 'true');
    try {
      const data = await fetcher();
      if (!ctx.alive()) return;
      el.innerHTML = render(data).toString();
      el.removeAttribute('aria-busy');
      if (onReady) onReady(data);
    } catch (e) {
      if (!ctx.alive()) return;
      el.innerHTML = errorState(e.message).toString();
      el.removeAttribute('aria-busy');
      const retry = el.querySelector('[data-action="retry"]');
      if (retry) retry.addEventListener('click', () => loadInto(ctx, el, { skeleton, fetcher, render, onReady }), { once: true });
    }
  }

  /** Disables a button and swaps its label for a spinner while an async action runs. */
  function setLoading(btn, loading) {
    if (!btn) return;
    if (loading) {
      btn.dataset.label = btn.innerHTML;
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      btn.innerHTML = '<span class="spinner spinner--on-brand" aria-hidden="true"></span><span class="sr-only">Loading</span>';
    } else {
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      if (btn.dataset.label !== undefined) { btn.innerHTML = btn.dataset.label; delete btn.dataset.label; }
    }
  }

  /** Writes (or clears) an inline form error. */
  function showError(form, message) {
    const el = form.querySelector('[data-error]');
    if (!el) return;
    el.textContent = message || '';
    el.hidden = !message;
  }

  const formError = () => html`<p class="form-error" role="alert" data-error hidden></p>`;

  PGC.c = {
    attrs, spinner, chip, statusPill, stars, pgCard, skeletonCard, skeletonGrid, skeletonRows, skeletonStats,
    emptyState, errorState, loadInto, setLoading, showError, formError, FALLBACK_IMAGE,
  };
})(window.PGC);
