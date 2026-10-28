/**
 * Owner screens: dashboard, listings, add listing. (Inquiries reuses the shared bookings view.)
 */
(function (PGC) {
  'use strict';

  const { html, formatINR, firstName } = PGC.utils;
  const { pgCard, skeletonGrid, skeletonStats, emptyState, loadInto, setLoading, showError, formError } = PGC.c;
  PGC.views = PGC.views || {};

  /* ------------------------------ Dashboard ------------------------------ */

  PGC.views.dashboard = async function dashboard(ctx) {
    ctx.title('Dashboard');
    ctx.render(html`
      <div class="page-head">
        <h1 class="page-title">Hello, ${firstName(PGC.auth.user.name)} <span aria-hidden="true">👋</span></h1>
        <p class="page-sub">Your PG command center</p>
      </div>
      <div data-stats></div>
      <div class="dash-actions">
        <a class="btn btn--primary btn--lg" href="#/owner/listings/new" data-testid="dash-add-pg">+ Add a new PG</a>
        <a class="btn btn--outline btn--lg" href="#/owner/inquiries" data-testid="dash-inquiries">Review inquiries</a>
        ${PGC.features.on('PG_MANAGER') && html`<a class="btn btn--outline btn--lg" href="#/owner/manage" data-testid="dash-manage">Open PG manager</a>`}
      </div>`);

    const stat = (icon, value, label, testid) => html`
      <div class="card card--pad stat" data-testid="${testid}">
        <span class="stat__icon" aria-hidden="true">${icon}</span>
        <p class="stat__value">${value}</p>
        <p class="stat__label">${label}</p>
      </div>`;

    await loadInto(ctx, ctx.app.querySelector('[data-stats]'), {
      skeleton: skeletonStats(),
      fetcher: () => PGC.query.get(['owner-stats'], () => PGC.api.ownerStats()),
      render: (s) => html`
        <div class="stat-grid">
          ${stat('🏠', s.total_listings, 'Total listings', 'stat-listings')}
          ${stat('👥', s.active_tenants, 'Active tenants', 'stat-tenants')}
          ${stat('📥', s.pending_inquiries, 'Pending inquiries', 'stat-pending')}
          ${stat('💰', formatINR(s.rent_collected), 'Rent collected', 'stat-rent')}
        </div>`,
    });
  };

  /* ------------------------------ Listings ------------------------------ */

  PGC.views.listings = async function listings(ctx) {
    ctx.title('My PGs');
    ctx.render(html`
      <div class="page-head page-head--row">
        <div>
          <h1 class="page-title">My PGs</h1>
          <p class="page-sub">Manage your properties</p>
        </div>
        <a class="fab" href="#/owner/listings/new" aria-label="Add a new PG" data-testid="add-pg-fab">+</a>
      </div>
      <div data-list></div>`);
    const el = ctx.app.querySelector('[data-list]');
    let list = [];

    const paint = () => (list.length
      ? html`<div class="pg-grid">${list.map((pg) => html`
          <div class="owner-listing">
            ${pgCard(pg)}
            <div class="owner-listing__actions">
              <button type="button" class="btn btn--ghost btn--sm btn--danger-text" data-action="delete-pg" data-id="${pg.pg_id}" data-name="${pg.name}" data-testid="delete-pg-${pg.pg_id}">Delete</button>
            </div>
          </div>`)}</div>`
      : emptyState({
        icon: '🏠', title: 'No listings yet', text: 'Tap + to add your first PG.',
        action: html`<a class="btn btn--primary" href="#/owner/listings/new">+ Add a new PG</a>`,
      }));

    await loadInto(ctx, el, {
      skeleton: skeletonGrid(3),
      fetcher: () => PGC.query.get(['owner-listings'], () => PGC.api.ownerPgs()),
      render: (data) => { list = data; return paint(); },
    });

    ctx.on('click', '[data-action="delete-pg"]', async (e, btn) => {
      const { id, name } = btn.dataset;
      const ok = await PGC.ui.confirmDialog({
        title: `Delete ${name}?`,
        message: 'This permanently removes the listing from PGConnect. This cannot be undone.',
        confirmLabel: 'Delete listing',
        danger: true,
      });
      if (!ok) return;
      try {
        await PGC.api.deletePg(id);
        PGC.query.invalidate(['owner-listings'], ['owner-stats'], ['pgs'], ['pg', id], ['bookings'], ['shortlist']);
        list = list.filter((p) => p.pg_id !== id);
        if (ctx.alive()) el.innerHTML = paint().toString();
        PGC.ui.toast('Listing deleted', { type: 'success' });
      } catch (err) {
        PGC.ui.toast(err.message, { type: 'error' });
      }
    });
  };

  /* ------------------------------ Add listing ------------------------------ */

  const CITIES = ['Bengaluru', 'Delhi', 'Pune', 'Hyderabad'];
  const GENDERS = [['female', 'Girls'], ['male', 'Boys'], ['unisex', 'Co-living']];
  const AMENITIES = ['WiFi', 'AC', 'Laundry', 'Housekeeping', 'CCTV', 'Parking', 'Gym', 'Hot Water', 'Power Backup'];
  const DEFAULT_AMENITIES = ['WiFi', 'Laundry'];
  const MSG_REQUIRED = 'Please fill in name, city, locality & at least a double-room price';


  /* Optional, collapsed sections on Add listing (safety details F2, charges and terms F4). */
  const num = (testid, label, max, ph) => html`
    <label class="field"><span class="field__label">${label}</span>
      <input class="input input--sm" type="number" inputmode="numeric" min="0" max="${max}" step="1" placeholder="${ph}" data-max="${max}" data-label="${label}" data-testid="${testid}"></label>`;
  const collapsible = (id, title, body) => html`
    <fieldset class="optional-section">
      <button type="button" class="optional-section__toggle" data-action="toggle-section" aria-expanded="false" aria-controls="${id}" data-testid="${id}-toggle">
        <span>${title}</span><span class="optional-section__caret" aria-hidden="true">+</span>
      </button>
      <div class="optional-section__body" id="${id}" hidden>${body}</div>
    </fieldset>`;
  const CURFEW_RE = /^\d{1,2}:\d{2}\s?(AM|PM)$/i;

  function optionalSections() {
    const safety = !PGC.features.on('SAFETY_FILTERS') ? '' : collapsible('al-safety', 'Safety details (optional)', html`
      <p class="fgroup__note">Tick only what is true. Anything you leave blank shows as "Not stated by owner".</p>
      ${[['cctv', 'CCTV'], ['guard', 'Night guard or warden'], ['fire', 'Clear fire exit'], ['curfew', 'Flexible curfew'], ['wfloor', 'Women-only floor']]
        .map(([k, label]) => html`<label class="switch"><input type="checkbox" role="switch" name="safety_${k}" data-testid="al-safety-${k}"><span class="switch__track" aria-hidden="true"></span><span class="switch__label">${label}</span></label>`)}
      <label class="field"><span class="field__label">Curfew time (optional)</span>
        <input class="input input--sm" name="curfew_time" placeholder="11:00 PM" maxlength="8" data-testid="al-curfew-time"></label>`);
    const charges = !PGC.features.on('TRUE_COST') ? '' : collapsible('al-charges', 'Charges and terms (optional)', html`
      <div class="field-row">
        <label class="field"><span class="field__label">Electricity</span>
          <select class="input input--sm" name="ch_elec_mode" data-testid="al-ch-electricity-mode">
            <option value="">Not stated</option><option value="metered">Metered</option><option value="included">Included</option><option value="fixed">Fixed</option></select></label>
        ${num('al-ch-electricity', 'Electricity estimate (₹ per month)', 100000, '900')}
      </div>
      <div class="field-row">
        ${num('al-ch-maintenance', 'Maintenance (₹ per month)', 100000, '500')}
        <label class="field"><span class="field__label">Food</span>
          <select class="input input--sm" name="ch_food_mode" data-testid="al-ch-food-mode">
            <option value="">Not stated</option><option value="included">Included</option><option value="optional">Optional</option><option value="none">None</option></select></label>
      </div>
      <div class="field-row">
        ${num('al-ch-food-price', 'Optional food price (₹ per month)', 100000, '3000')}
        ${num('al-ch-deposit-months', 'Refundable deposit (months of rent)', 6, '2')}
      </div>
      <div class="field-row">
        ${num('al-ch-refund-days', 'Deposit returned within (days)', 90, '15')}
        ${num('al-ch-notice', 'Notice period (days)', 180, '30')}
      </div>
      <div class="field-row">
        ${num('al-ch-lockin', 'Lock-in (months, 0 for none)', 24, '0')}
        ${num('al-ch-exit', 'Exit fee (₹, 0 for none)', 100000, '0')}
      </div>`);
    return html`${safety}${charges}`;
  }

  /** Reads the optional sections. A section contributes only if the owner opened it and filled something in. */
  function readOptional(form) {
    const out = {};
    const open = (id) => { const b = form.querySelector(`[data-testid="${id}-toggle"]`); return b && b.getAttribute('aria-expanded') === 'true'; };
    if (open('al-safety')) {
      const s = {};
      [['cctv', 'cctv'], ['guard', 'night_guard'], ['fire', 'fire_exit_clear'], ['curfew', 'curfew_flexible'], ['wfloor', 'women_only_floor']]
        .forEach(([k, field]) => { if (form.elements.namedItem(`safety_${k}`).checked) s[field] = true; });
      const t = form.elements.namedItem('curfew_time').value.trim();
      if (t) { if (!CURFEW_RE.test(t)) return { error: 'Enter the curfew time like 11:00 PM' }; s.curfew_time = t.toUpperCase(); }
      if (Object.keys(s).length) out.safety = s;
    }
    if (open('al-charges')) {
      const c = {};
      const val = (id) => {
        const el = form.querySelector(`[data-testid="${id}"]`);
        if (!el || el.value.trim() === '') return null;
        const n = Number(el.value);
        const max = Number(el.dataset.max);
        if (!Number.isInteger(n) || n < 0 || n > max) throw new Error(`${el.dataset.label.replace(/ \(.*\)/, '')} must be a whole number from 0 to ${max.toLocaleString('en-IN')}`);
        return n;
      };
      try {
        const mode = form.elements.namedItem('ch_elec_mode').value;
        const est = val('al-ch-electricity');
        if (mode) c.electricity = { mode, est_monthly: mode === 'included' ? 0 : est ?? 0 };
        const maint = val('al-ch-maintenance'); if (maint !== null) c.maintenance_monthly = maint;
        const food = form.elements.namedItem('ch_food_mode').value;
        if (food) { c.food = { mode: food }; if (food === 'optional') c.food.optional_price = val('al-ch-food-price') ?? 0; }
        [['al-ch-deposit-months', 'deposit_months'], ['al-ch-refund-days', 'deposit_refund_days'], ['al-ch-notice', 'notice_days'], ['al-ch-lockin', 'lock_in_months'], ['al-ch-exit', 'exit_fee']]
          .forEach(([id, field]) => { const v = val(id); if (v !== null) c[field] = v; });
      } catch (e) { return { error: e.message }; }
      if (Object.keys(c).length) out.charges = c;
    }
    return out;
  }

  PGC.views.addListing = async function addListing(ctx) {
    ctx.title('Add a new PG');
    ctx.render(html`
      <section class="narrow narrow--wide">
        <button type="button" class="back-link" data-action="back" data-fallback="/owner/listings" data-testid="add-listing-back">← Back</button>
        <h1 class="page-title page-title--md">Add a new PG</h1>
        <p class="page-sub">Tenants love complete, honest listings.</p>

        <form class="card card--pad form" data-form="listing" novalidate>
          <label class="field">
            <span class="field__label">PG name</span>
            <input class="input" name="name" placeholder="Sunshine PG" maxlength="80" data-testid="al-name">
          </label>

          <div class="field-row">
            <label class="field">
              <span class="field__label">City</span>
              <select class="input" name="city" data-testid="al-city">
                <option value="">Select a city</option>
                ${CITIES.map((c) => html`<option value="${c}">${c}</option>`)}
                <option value="__other">Other…</option>
              </select>
            </label>
            <label class="field" data-other-city hidden>
              <span class="field__label">Other city</span>
              <input class="input" name="city_other" placeholder="Bengaluru" maxlength="60" data-testid="al-city-other">
            </label>
            <label class="field">
              <span class="field__label">Locality</span>
              <input class="input" name="locality" placeholder="Koramangala" maxlength="80" data-testid="al-locality">
            </label>
          </div>

          <label class="field">
            <span class="field__label">Full address</span>
            <input class="input" name="address" placeholder="Door no, street, pincode" maxlength="200" data-testid="al-address">
          </label>

          <fieldset class="field fieldset">
            <legend class="field__label">Gender</legend>
            <div class="chip-row chip-row--wrap">
              ${GENDERS.map(([value, label]) => html`
                <label class="chip-radio">
                  <input type="radio" name="gender" value="${value}" ${value === 'unisex' ? 'checked' : ''} data-testid="al-gender-${value}">
                  <span class="chip">${label}</span>
                </label>`)}
            </div>
          </fieldset>

          <div class="field-row">
            <label class="field">
              <span class="field__label">Price - Single room (₹/mo)</span>
              <input class="input" name="price_single" type="number" inputmode="numeric" min="1" step="1" placeholder="14500" data-testid="al-price-single">
            </label>
            <label class="field">
              <span class="field__label">Price - Double room (₹/mo)</span>
              <input class="input" name="price_double" type="number" inputmode="numeric" min="1" step="1" placeholder="9500" data-testid="al-price-double">
            </label>
          </div>

          <label class="field">
            <span class="field__label">Description</span>
            <textarea class="input input--area" name="description" rows="4" maxlength="1000" placeholder="Fully furnished, 5 min from…" data-testid="al-desc"></textarea>
          </label>

          <fieldset class="field fieldset">
            <legend class="field__label">Amenities</legend>
            <div class="chip-row chip-row--wrap">
              ${AMENITIES.map((a) => html`
                <label class="chip-radio">
                  <input type="checkbox" name="amenity" value="${a}" ${DEFAULT_AMENITIES.includes(a) ? 'checked' : ''} data-testid="al-am-${a}">
                  <span class="chip">${a}</span>
                </label>`)}
            </div>
          </fieldset>

          <button type="button" class="food-toggle is-on" data-action="toggle-food" aria-pressed="true" data-testid="al-food">🍱 Food included</button>

          ${optionalSections()}

          <p class="fineprint">Sample photos are attached to new listings until photo upload is available.</p>
          ${formError()}
          <button type="submit" class="btn btn--primary btn--lg btn--block" data-testid="al-submit">Publish PG</button>
        </form>
      </section>`);

    let food = true;

    ctx.on('change', '[name="city"]', (e, select) => {
      const other = ctx.app.querySelector('[data-other-city]');
      other.hidden = select.value !== '__other';
      if (!other.hidden) other.querySelector('input').focus();
    });

    ctx.on('click', '[data-action="toggle-section"]', (e, btn) => {
      const open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(open));
      ctx.app.querySelector(`#${btn.getAttribute('aria-controls')}`).hidden = !open;
      btn.querySelector('.optional-section__caret').textContent = open ? '-' : '+';
    });
    ctx.on('change', '[name="ch_food_mode"]', (e, sel) => {
      if (!sel.value) return;
      food = sel.value === 'included';
      const t = ctx.app.querySelector('[data-action="toggle-food"]');
      t.classList.toggle('is-on', food); t.setAttribute('aria-pressed', String(food)); t.textContent = food ? '🍱 Food included' : 'No food';
    });

    ctx.on('click', '[data-action="toggle-food"]', (e, btn) => {
      food = !food;
      btn.classList.toggle('is-on', food);
      btn.setAttribute('aria-pressed', String(food));
      btn.textContent = food ? '🍱 Food included' : 'No food';
    });

    ctx.on('submit', '[data-form="listing"]', async (e, form) => {
      e.preventDefault();
      const name = form.elements.namedItem('name').value.trim();
      const cityRaw = form.city.value;
      const city = (cityRaw === '__other' ? form.city_other.value : cityRaw).trim();
      const locality = form.locality.value.trim();
      const single = form.price_single.value.trim();
      const double = form.price_double.value.trim();

      if (!name || !city || !locality || !double) { showError(form, MSG_REQUIRED); return; }
      const priceDouble = Number(double);
      const priceSingle = single ? Number(single) : 0;
      if (!(priceDouble > 0) || (single && !(priceSingle > 0))) { showError(form, 'Prices must be greater than 0'); return; }

      const room_types = [];
      if (priceSingle) room_types.push({ type: 'single', price: priceSingle, available: 2, total: 4 });
      room_types.push({ type: 'double', price: priceDouble, available: 4, total: 10 });

      const payload = {
        name,
        city,
        locality,
        address: form.address.value.trim() || `${locality}, ${city}`,
        gender: form.gender.value,
        description: form.description.value.trim(),
        price_from: Math.min(...room_types.map((r) => r.price)),
        amenities: Array.from(form.querySelectorAll('[name="amenity"]:checked'), (i) => i.value),
        rules: ['No smoking', 'Entry till 11 PM'],
        food_included: food,
        images: PGC.sampleImages(),
        room_types,
      };

      const extra = readOptional(form);
      if (extra.error) { showError(form, extra.error); return; }
      Object.assign(payload, extra);

      const btn = form.querySelector('[type="submit"]');
      showError(form, '');
      setLoading(btn, true);
      try {
        await PGC.api.createPg(payload);
        PGC.query.invalidate(['owner-listings'], ['owner-stats'], ['pgs']);
        PGC.ui.toast('Listing published', { type: 'success' });
        ctx.go('/owner/listings');
      } catch (err) {
        if (ctx.alive()) { setLoading(btn, false); showError(form, err.message); }
      }
    });
  };
})(window.PGC);
