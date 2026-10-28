/**
 * Explore (tenant home, also public): search, city / type chips, sort, filters, PG grid (and the Map view).
 * All filter state lives in the URL query string so results are shareable, for example:
 *   #/?q=kora&city=Pune&type=female&food=1&sort=price-asc&maxp=9000&minr=4
 *   upgrade params: area, minp, incl, share, ac, short, avail, grade, safety, dist, ref, view
 * The server call and its cache key are unchanged; every new filter runs on the client with PGC.lib.applyFilters.
 */
(function (PGC) {
  'use strict';

  const { html, debounce, formatINR, pluralPG } = PGC.utils;
  const { chip, pgCard, skeletonGrid, emptyState } = PGC.c;
  const lib = PGC.lib;
  PGC.views = PGC.views || {};

  const CITIES = ['Bengaluru', 'Delhi', 'Pune', 'Hyderabad'];
  const TYPES = [['', 'All', 'all'], ['female', 'Girls', 'female'], ['male', 'Boys', 'male'], ['unisex', 'Co-living', 'unisex']];
  const SORTS = [
    ['newest', 'Newest'],
    ['price-asc', 'Price: low to high'],
    ['price-desc', 'Price: high to low'],
    ['rating', 'Top rated'],
  ];
  const SORTS_ADV = [['distance', 'Nearest'], ['beds', 'Most beds free']];
  const SORT_ALIASES = { price_asc: 'price-asc', price_desc: 'price-desc', relevance: 'newest' }; // brief names are accepted when reading a URL
  const SORT_TO_LIB = { newest: 'relevance', 'price-asc': 'price_asc', 'price-desc': 'price_desc', rating: 'rating', distance: 'distance', beds: 'beds' };
  const GRADES = [['', 'Any', 'any'], ['verified', 'Verified', 'verified'], ['verified_plus', 'Verified Plus', 'verified_plus'], ['assured', 'Assured', 'assured']];
  const SAFETY = [
    ['wov', 'Women-only (verified)'], ['cctv', 'CCTV on entrances and common areas'], ['guard', 'Night guard or warden'],
    ['fire', 'Clear fire exit'], ['curfew', 'Flexible curfew'], ['wfloor', 'Women-only floor'],
  ];
  const SHARES = ['single', 'double', 'triple'];
  const DISTS = [1, 2, 5, 10];

  const HOW_IT_WORKS = [
    ['🔎', 'Search', 'Filter by city, type and budget to shortlist verified PGs.'],
    ['💬', 'Chat', 'Ask the owner anything before you commit.'],
    ['📅', 'Book', 'Pick a room and send a booking request in a minute.'],
    ['💰', 'Pay rent', 'Once the owner accepts, pay your rent in the app.'],
  ];
  const TRUST = [
    ['✓', 'Verified listings', 'Look for the Verified badge on every PG.'],
    ['📷', 'Real photos', 'Browse each PG’s photo gallery before you book.'],
    ['₹', 'Upfront pricing', 'Room prices are shown per month, no surprises.'],
    ['⭐', 'Genuine reviews', 'Read and write reviews from other tenants.'],
  ];

  /** A switch (accessible checkbox) used by the filter panel. */
  const sw = (testid, field, label, checked, value) => html`
    <label class="switch">
      <input type="checkbox" role="switch" data-f="${field}" ${value !== undefined ? html`value="${value}"` : ''} ${checked ? 'checked' : ''} data-testid="${testid}">
      <span class="switch__track" aria-hidden="true"></span>
      <span class="switch__label">${label}</span>
    </label>`;

  PGC.views.explore = async function explore(ctx) {
    const F = PGC.features.on;
    const adv = F('ADV_FILTERS');
    const safetyOn = F('SAFETY_FILTERS');
    const costOn = F('TRUE_COST');
    const mapOn = F('MAP') && !!PGC.exploreMap;
    const compareOn = F('COMPARE') && !!PGC.compare && !PGC.auth.isOwner;
    const BMAX = adv ? lib.BUDGET_MAX : 20000; // slider upper bound; the pre-upgrade panel stopped at 20,000
    const BMIN = lib.BUDGET_MIN;

    const q = ctx.query;
    const list3 = (v, allowed) => (v ? v.split(',').filter((x, i, a) => allowed.includes(x) && a.indexOf(x) === i) : []);
    const num = (v) => (v === undefined || v === '' ? NaN : Number(v));
    const maxRaw = num(q.maxp ?? (adv ? q.max : undefined));
    const minRaw = adv ? num(q.minp ?? q.min) : NaN;
    const sortRaw = SORT_ALIASES[q.sort] || q.sort;
    const allSorts = SORTS.concat(adv ? SORTS_ADV : []);
    const state = {
      q: (q.q || '').trim(),
      city: CITIES.includes(q.city) ? q.city : '',
      type: ['female', 'male', 'unisex'].includes(q.type) ? q.type : '',
      food: q.food === '1',
      sort: allSorts.some(([k]) => k === sortRaw) ? sortRaw : 'newest',
      maxp: maxRaw >= BMIN && maxRaw < BMAX ? maxRaw : 0,
      minr: [4, 4.5].includes(Number(q.minr)) ? Number(q.minr) : 0,
      visible: PGC_CONFIG.PAGE_SIZE,
      // upgrade state (ignored entirely when its feature switch is off)
      minp: adv && minRaw > BMIN && minRaw < BMAX ? minRaw : 0,
      incl: adv && costOn && q.incl === '1',
      share: adv ? list3(q.share, SHARES) : [],
      ac: adv && q.ac === '1', short: adv && q.short === '1', avail: adv && q.avail === '1',
      grade: adv && ['verified', 'verified_plus', 'assured'].includes(q.grade) ? q.grade : '',
      safety: safetyOn ? list3(q.safety, SAFETY.map(([k]) => k)) : [],
      dist: adv && DISTS.includes(Number(q.dist)) ? Number(q.dist) : 0,
      ref: adv && (q.ref === 'near' || lib.AREAS.some((a) => a.area === q.ref)) ? q.ref : '',
      area: mapOn ? (q.area || '') : '',
      view: mapOn && q.view === 'map' ? 'map' : 'list',
    };
    let nearCoords = null; // set only after the visitor taps "Near me" and allows location
    if (state.ref === 'near') state.ref = ''; // a reload cannot re-use a location the page never asked for
    let saved = new Set();
    let loadedOnce = false;
    let requestId = 0;
    let lastList = [];

    const heartMode = () => (PGC.auth.isTenant ? 'tenant' : PGC.auth.isOwner ? null : 'guest');
    const refCoords = () => (state.ref === 'near' ? nearCoords : state.ref ? (lib.AREAS.find((a) => a.area === state.ref) || {}).center || null : null);

    /** The brief's FilterState built from this page's state. */
    const filterState = () => ({
      ...lib.DEFAULT_FILTERS,
      q: state.q, city: state.city || null, gender: state.type || null, food: state.food, area: state.area || null,
      min: state.minp || BMIN, max: state.maxp || lib.BUDGET_MAX, budgetIncludesExtras: state.incl,
      share: state.share, ac: state.ac, shortStay: state.short, minGrade: state.grade || 'any', availableNow: state.avail,
      safety: state.safety, distKm: state.dist || null, ref: refCoords(), sort: SORT_TO_LIB[state.sort] || 'relevance',
    });
    /** Number on the Filters badge: everything except the controls that already show on the page (search, city, type, food, area). */
    const activeCount = () => lib.activeFilterCount({ ...filterState(), q: '', city: null, gender: null, food: false, area: null }) + (state.minr ? 1 : 0);
    const visibleList = (list) => lib.applyFilters(list, filterState()).filter((p) => !state.minr || p.rating >= state.minr);

    const budgetGroup = html`
      <div class="fgroup">
        ${adv && html`<h3 class="fgroup__title">Budget (per month)</h3>`}
        <div class="field">
          <label class="field__label" for="budget-range">Max budget: <strong data-budget-label></strong></label>
          <input class="range" id="budget-range" type="range" min="${BMIN}" max="${BMAX}" step="${lib.BUDGET_STEP}" value="${state.maxp || BMAX}" data-testid="budget-range">
        </div>
        ${adv && html`
          <div class="field">
            <label class="field__label" for="filter-min-range">Min budget: <strong data-min-label></strong></label>
            <input class="range" id="filter-min-range" type="range" min="${BMIN}" max="${BMAX}" step="${lib.BUDGET_STEP}" value="${state.minp || BMIN}" data-testid="filter-min-range">
          </div>
          <div class="field-row field-row--tight">
            <label class="field"><span class="field__label">From (₹)</span>
              <input class="input input--sm" type="number" inputmode="numeric" min="${BMIN}" max="${BMAX}" step="${lib.BUDGET_STEP}" value="${state.minp || BMIN}" data-num="min" data-testid="filter-min"></label>
            <label class="field"><span class="field__label">To (₹)</span>
              <input class="input input--sm" type="number" inputmode="numeric" min="${BMIN}" max="${BMAX}" step="${lib.BUDGET_STEP}" value="${state.maxp || BMAX}" data-num="max" data-testid="filter-max"></label>
          </div>
          ${costOn && sw('filter-incl-extras', 'incl', 'Include electricity and maintenance', state.incl)}`}
      </div>`;

    const advGroups = adv ? html`
      <div class="fgroup">
        <h3 class="fgroup__title" id="share-label">Sharing</h3>
        <div class="chip-row chip-row--wrap" role="group" aria-labelledby="share-label">
          ${SHARES.map((t) => html`<label class="chip-radio"><input type="checkbox" data-f="share" value="${t}" ${state.share.includes(t) ? 'checked' : ''} data-testid="filter-share-${t}"><span class="chip">${t.charAt(0).toUpperCase() + t.slice(1)}</span></label>`)}
        </div>
      </div>
      <div class="fgroup">
        <h3 class="fgroup__title">Room</h3>${sw('filter-ac', 'ac', 'AC available', state.ac)}
        <h3 class="fgroup__title">Stay</h3>${sw('filter-short-stay', 'short', 'Short stay OK (under 3 months)', state.short)}
        <h3 class="fgroup__title">Availability</h3>${sw('filter-available', 'avail', 'Beds free now', state.avail)}
      </div>
      <fieldset class="fgroup">
        <legend class="fgroup__title">Verified level</legend>
        <div class="chip-row chip-row--wrap">
          ${GRADES.map(([v, label, id]) => html`<label class="chip-radio"><input type="radio" name="grade" data-f="grade" value="${v}" ${state.grade === v ? 'checked' : ''} data-testid="filter-grade-${id}"><span class="chip">${label}</span></label>`)}
        </div>
        <p class="fgroup__note">Levels are set by the PGConnect team in this demo.</p>
      </fieldset>
      <div class="fgroup">
        <h3 class="fgroup__title">Distance</h3>
        <label class="field"><span class="field__label">From</span>
          <select class="input input--sm" data-f="ref" data-testid="filter-dist-from">
            <option value="">Choose a place</option>
            <option value="near" ${state.ref === 'near' ? 'selected' : ''}>Near me</option>
            ${lib.AREAS.map((a) => html`<option value="${a.area}" ${state.ref === a.area ? 'selected' : ''}>${a.area}, ${a.city}</option>`)}
          </select></label>
        <div class="chip-row chip-row--wrap" role="group" aria-label="Distance">
          ${DISTS.map((d) => chip(`${d} km`, { active: state.dist === d, 'data-dist': d, 'data-testid': `filter-dist-${d}` }))}
        </div>
      </div>` : '';

    const safetyGroup = safetyOn ? html`
      <div class="fgroup">
        <h3 class="fgroup__title">Safety</h3>
        ${SAFETY.map(([k, label]) => sw(`filter-safety-${k}`, 'safety', label, state.safety.includes(k), k))}
        <p class="fgroup__note">Safety details are declared by the owner. Visit the PG in person before you pay.</p>
      </div>` : '';

    ctx.title('Find your perfect PG');
    ctx.render(html`
      <section class="hero">
        <h1 class="hero__title">Find your perfect PG</h1>
        <p class="hero__sub">Verified listings. Upfront pricing. No surprises.</p>

        <form class="search" role="search" data-form="search">
          <span class="search__icon" aria-hidden="true">🔎</span>
          <input class="search__input" type="search" name="q" value="${state.q}" placeholder="Search city, locality, PG name"
            aria-label="Search city, locality or PG name" autocomplete="off" enterkeyhint="search" data-testid="tenant-search-input">
        </form>

        <div class="chip-row" role="group" aria-label="City" data-chips="city"></div>
        <div class="chip-row" role="group" aria-label="PG type" data-chips="type"></div>
        <div data-region="areas"></div>
      </section>

      <div class="results-bar">
        <p class="counter" data-count aria-live="polite"></p>
        <div class="results-tools">
          ${mapOn && html`
            <div class="seg" role="group" aria-label="Results view">
              <button type="button" class="seg__btn" data-view="list" aria-pressed="${String(state.view === 'list')}" data-testid="view-list">List</button>
              <button type="button" class="seg__btn" data-view="map" aria-pressed="${String(state.view === 'map')}" data-testid="view-map">Map</button>
            </div>`}
          <button type="button" class="btn btn--ghost btn--sm" data-action="toggle-filters" aria-expanded="false" aria-controls="filter-panel" data-testid="filters-toggle">
            Filters<span class="filters-count" data-filters-count data-testid="filters-count" hidden></span>
          </button>
          <label class="sort">
            <span class="sr-only">Sort by</span>
            <select class="input select--sm" name="sort" data-testid="sort-select">
              ${allSorts.map(([k, label]) => html`<option value="${k}" ${state.sort === k ? 'selected' : ''} ${k === 'distance' ? 'data-needs-ref' : ''}>${label}</option>`)}
            </select>
          </label>
        </div>
      </div>

      <div class="filter-panel card card--pad" id="filter-panel" role="region" aria-label="Filters" data-testid="filters-sheet" hidden>
        <div class="filter-panel__grid">
          ${budgetGroup}
          <div class="fgroup">
            <span class="field__label" id="minr-label">Minimum rating</span>
            <div class="chip-row chip-row--wrap" role="group" aria-labelledby="minr-label" data-chips="minr"></div>
          </div>
          ${advGroups}
          ${safetyGroup}
        </div>
        <div class="filter-panel__foot">
          <button type="button" class="btn btn--ghost btn--sm" data-action="reset-filters">Reset filters</button>
          ${adv && html`<button type="button" class="btn btn--ghost btn--sm" data-action="reset-all" data-testid="filter-reset">Reset all</button>
          <button type="button" class="btn btn--primary btn--sm filter-panel__apply" data-action="apply-filters" data-testid="filter-apply">Show PGs</button>`}
        </div>
      </div>

      <div data-region="map"></div>
      <div data-list></div>
      <div class="load-more" data-more></div>

      <section class="strip" aria-labelledby="how-title">
        <h2 class="strip__title" id="how-title">How it works</h2>
        <ol class="strip__grid">
          ${HOW_IT_WORKS.map(([icon, title, text], i) => html`
            <li class="strip__item"><span class="strip__icon" aria-hidden="true">${icon}</span>
              <div><h3>${i + 1}. ${title}</h3><p>${text}</p></div></li>`)}
        </ol>
      </section>

      <section class="strip strip--trust" aria-labelledby="trust-title">
        <h2 class="strip__title" id="trust-title">Why PGConnect?</h2>
        <ul class="strip__grid">
          ${TRUST.map(([icon, title, text]) => html`
            <li class="strip__item"><span class="strip__icon strip__icon--brand" aria-hidden="true">${icon}</span>
              <div><h3>${title}</h3><p>${text}</p></div></li>`)}
        </ul>
      </section>`);

    const $ = (sel) => ctx.app.querySelector(sel);
    const $list = $('[data-list]');
    const $more = $('[data-more]');
    const $count = $('[data-count]');
    const $panel = $('#filter-panel');
    const $toggle = $('[data-action="toggle-filters"]');
    const $budgetLabel = $('[data-budget-label]');
    const $minLabel = $('[data-min-label]');
    const $filtersCount = $('[data-filters-count]');
    const $apply = $('[data-action="apply-filters"]');

    /* ----- chips and panel state ----- */
    function renderChips() {
      $('[data-chips="city"]').innerHTML = [
        chip('All', { active: !state.city, 'data-city': '', 'data-testid': 'city-chip-All' }),
        ...CITIES.map((c) => chip(c, { active: state.city === c, 'data-city': c, 'data-testid': `city-chip-${c}` })),
      ].map(String).join('');

      $('[data-chips="type"]').innerHTML = [
        ...TYPES.map(([value, label, id]) => chip(label, { active: state.type === value, 'data-type': value, 'data-testid': `gender-chip-${id}` })),
        chip('🍱 Food included', { active: state.food, 'data-food': '1', 'data-testid': 'food-chip' }),
      ].map(String).join('');

      $('[data-chips="minr"]').innerHTML = [[0, 'Any'], [4, '4.0+'], [4.5, '4.5+']]
        .map(([v, label]) => chip(label, { active: state.minr === v, 'data-minr': v, 'data-testid': `minr-chip-${v || 'any'}` })).map(String).join('');

      $budgetLabel.textContent = state.maxp ? `${formatINR(state.maxp)}/mo` : 'Any';
      if ($minLabel) $minLabel.textContent = state.minp ? `${formatINR(state.minp)}/mo` : 'Any';
      const n = activeCount();
      $filtersCount.hidden = !n;
      $filtersCount.textContent = n ? ` · ${n}` : '';
      // "Nearest" only makes sense once a reference point exists
      const nearest = ctx.app.querySelector('option[data-needs-ref]');
      if (nearest) nearest.disabled = !refCoords();
      if (PGC.exploreMap && mapOn) PGC.exploreMap.renderAreas({ ctx, state, CITIES });
    }

    function syncControls() { // push state back into inputs (after Reset or Clear)
      $('[name="q"]').value = state.q;
      $('[name="sort"]').value = state.sort;
      $('#budget-range').value = state.maxp || BMAX;
      if (adv) {
        $('#filter-min-range').value = state.minp || BMIN;
        $('[data-num="min"]').value = state.minp || BMIN;
        $('[data-num="max"]').value = state.maxp || BMAX;
        ctx.app.querySelectorAll('[data-f]').forEach((el) => {
          const k = el.dataset.f;
          if (el.type === 'checkbox' && k === 'share') el.checked = state.share.includes(el.value);
          else if (el.type === 'checkbox' && k === 'safety') el.checked = state.safety.includes(el.value);
          else if (el.type === 'checkbox') el.checked = !!state[k];
          else if (el.type === 'radio') el.checked = state.grade === el.value;
          else if (k === 'ref') el.value = state.ref;
        });
      }
    }

    function syncUrl() {
      ctx.setQuery({
        q: state.q, city: state.city, type: state.type, food: state.food,
        sort: state.sort === 'newest' ? '' : state.sort, maxp: state.maxp || '', minr: state.minr || '',
        minp: state.minp || '', incl: state.incl, share: state.share.join(','), ac: state.ac, short: state.short, avail: state.avail,
        grade: state.grade, safety: state.safety.join(','), dist: state.dist || '', ref: state.ref === 'near' ? '' : state.ref,
        area: state.area, view: state.view === 'map' ? 'map' : '',
      });
    }

    /* ----- data ----- */
    const serverKey = () => ['pgs', state.q, state.type, state.city, state.food];

    function renderList(list, errorMessage) {
      const filtered = errorMessage ? [] : visibleList(list);
      $count.textContent = errorMessage ? '' : `${filtered.length} verified ${pluralPG(filtered.length)}`;
      if ($apply) $apply.textContent = errorMessage ? 'Show PGs' : `Show ${filtered.length} ${pluralPG(filtered.length)}`;
      $more.innerHTML = '';

      if (state.view === 'map' && mapOn && !errorMessage) {
        $list.innerHTML = '';
        PGC.exploreMap.render({ ctx, state, filtered, allCityList: list, $list, $more, saved, heartMode, compareOn, CITIES, onPick: (id) => PGC.router.go(`/pg/${encodeURIComponent(id)}`) });
        return;
      }
      if (mapOn) PGC.exploreMap.hide(ctx);

      if (errorMessage || !filtered.length) {
        $list.innerHTML = emptyState({
          icon: '🔎',
          title: errorMessage ? 'Could not load PGs' : 'No PGs match your filters',
          text: errorMessage || 'Try a different search or clear the filters.',
          action: html`<button type="button" class="btn btn--soft" data-action="clear-filters" data-testid="clear-filters">Clear filters / retry</button>`,
        }).toString();
        return;
      }
      const shown = filtered.slice(0, state.visible);
      $list.innerHTML = html`<div class="pg-grid">${shown.map((pg) => pgCard(pg, { heart: heartMode(), saved: saved.has(pg.pg_id), compare: compareOn }))}</div>`.toString();
      if (filtered.length > shown.length) {
        $more.innerHTML = html`<button type="button" class="btn btn--outline" data-action="load-more" data-testid="load-more">Show more (${filtered.length - shown.length} left)</button>`.toString();
      }
      if (compareOn) PGC.compare.refresh();
    }

    async function refresh({ force = false } = {}) {
      const id = ++requestId;
      if (!loadedOnce) $list.innerHTML = skeletonGrid(6).toString();
      else $list.classList.add('is-loading');
      $list.setAttribute('aria-busy', 'true');
      try {
        const [list, ids] = await Promise.all([
          PGC.query.get(serverKey(), () => PGC.api.listPgs({ q: state.q, gender: state.type, city: state.city, food: state.food }), { force }),
          PGC.actions.savedIds(),
        ]);
        if (!ctx.alive() || id !== requestId) return;
        saved = ids;
        lastList = list;
        loadedOnce = true;
        renderChips(); // area chips depend on the loaded list
        renderList(list);
      } catch (e) {
        if (!ctx.alive() || id !== requestId) return;
        renderList([], e.message);
      } finally {
        if (ctx.alive() && id === requestId) { $list.classList.remove('is-loading'); $list.removeAttribute('aria-busy'); }
      }
    }

    const applyServerChange = () => { state.visible = PGC_CONFIG.PAGE_SIZE; renderChips(); syncUrl(); refresh(); };
    const applyClientChange = () => { state.visible = PGC_CONFIG.PAGE_SIZE; renderChips(); syncUrl(); renderList(lastList); };
    // The exposed hook lets the map module re-run the page after it changes the area or view.
    state.apply = applyClientChange;
    state.applyServer = applyServerChange;
    state.lastList = () => lastList;
    state.filtered = () => visibleList(lastList);
    state.refCoords = refCoords;

    /* ----- events: search + original chips ----- */
    const debouncedSearch = debounce((value) => { if (value === state.q) return; state.q = value; applyServerChange(); }, 300);
    ctx.on('input', '[name="q"]', (e, el) => debouncedSearch(el.value.trim()));
    ctx.on('submit', '[data-form="search"]', (e, form) => {
      e.preventDefault();
      debouncedSearch.cancel();
      const value = form.q.value.trim();
      if (value !== state.q) { state.q = value; applyServerChange(); }
    });
    ctx.onDestroy(() => debouncedSearch.cancel());

    ctx.on('click', '[data-city]', (e, el) => { state.city = el.dataset.city; state.area = ''; applyServerChange(); });
    ctx.on('click', '[data-type]', (e, el) => { state.type = el.dataset.type; applyServerChange(); });
    ctx.on('click', '[data-food]', () => { state.food = !state.food; applyServerChange(); });
    ctx.on('click', '[data-minr]', (e, el) => { state.minr = Number(el.dataset.minr); applyClientChange(); });

    ctx.on('change', '[name="sort"]', (e, el) => { state.sort = el.value; applyClientChange(); });

    /* ----- events: panel ----- */
    const setPanel = (open) => { $panel.hidden = !open; $toggle.setAttribute('aria-expanded', String(open)); };
    ctx.on('click', '[data-action="toggle-filters"]', () => setPanel($panel.hidden));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$panel.hidden && $panel.contains(document.activeElement)) { setPanel(false); $toggle.focus(); }
    }, { signal: ctx.signal });

    ctx.on('input', '#budget-range', (e, el) => {
      const v = Number(el.value);
      state.maxp = v >= BMAX ? 0 : v;
      if (state.minp && state.maxp && state.minp > state.maxp) { state.minp = state.maxp; if (adv) $('#filter-min-range').value = state.minp; }
      if (adv) $('[data-num="max"]').value = state.maxp || BMAX;
      applyClientChange();
    });
    if (adv) {
      ctx.on('input', '#filter-min-range', (e, el) => {
        const v = Number(el.value);
        state.minp = v <= BMIN ? 0 : v;
        if (state.maxp && state.minp > state.maxp) { state.maxp = state.minp; $('#budget-range').value = state.maxp; }
        $('[data-num="min"]').value = state.minp || BMIN;
        $('[data-num="max"]').value = state.maxp || BMAX;
        applyClientChange();
      });
      ctx.on('change', '[data-num]', (e, el) => {
        let v = Math.round(Number(el.value) / lib.BUDGET_STEP) * lib.BUDGET_STEP;
        if (!Number.isFinite(v)) v = el.dataset.num === 'min' ? BMIN : BMAX;
        v = Math.min(BMAX, Math.max(BMIN, v));
        if (el.dataset.num === 'min') { state.minp = v <= BMIN ? 0 : v; if (state.maxp && state.minp > state.maxp) state.maxp = state.minp; }
        else { state.maxp = v >= BMAX ? 0 : v; if (state.minp && state.maxp && state.maxp < state.minp) state.minp = state.maxp; }
        syncControls();
        applyClientChange();
      });
      ctx.on('change', '[data-f]', (e, el) => {
        const k = el.dataset.f;
        if (k === 'share') state.share = SHARES.filter((t) => (t === el.value ? el.checked : state.share.includes(t)));
        else if (k === 'safety') state.safety = SAFETY.map(([s]) => s).filter((s) => (s === el.value ? el.checked : state.safety.includes(s)));
        else if (k === 'grade') state.grade = el.value;
        else if (k === 'ref') return pickRef(el.value);
        else state[k] = el.checked; // ac, short, avail, incl
        applyClientChange();
      });
      ctx.on('click', '[data-dist]', (e, el) => { const d = Number(el.dataset.dist); state.dist = state.dist === d ? 0 : d; applyClientChange(); });
    } else if (safetyOn) {
      ctx.on('change', '[data-f="safety"]', (e, el) => {
        state.safety = SAFETY.map(([s]) => s).filter((s) => (s === el.value ? el.checked : state.safety.includes(s)));
        applyClientChange();
      });
    }

    /** "From" picker: an area centre, or the visitor's own location (asked only now, on this tap). */
    function pickRef(value) {
      if (value !== 'near') { state.ref = value; if (!value) state.dist = 0; if (state.sort === 'distance' && !value) state.sort = 'newest'; syncControls(); applyClientChange(); return; }
      if (!navigator.geolocation) { PGC.ui.toast('Location is not available. Pick an area instead.'); state.ref = ''; syncControls(); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => { nearCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude }; state.ref = 'near'; applyClientChange(); },
        () => { PGC.ui.toast('Location is off. Pick an area instead.'); state.ref = ''; syncControls(); applyClientChange(); },
        { timeout: 8000, maximumAge: 300000 },
      );
    }

    const resetNew = () => Object.assign(state, { maxp: 0, minp: 0, minr: 0, incl: false, share: [], ac: false, short: false, avail: false, grade: '', safety: [], dist: 0, ref: '' });
    ctx.on('click', '[data-action="reset-filters"]', () => { state.maxp = 0; state.minr = 0; if (adv) state.minp = 0; syncControls(); applyClientChange(); });
    ctx.on('click', '[data-action="reset-all"]', () => {
      resetNew();
      Object.assign(state, { q: '', city: '', type: '', food: false, area: '', sort: 'newest', view: 'list' });
      syncControls(); applyServerChange(); // the panel stays open so filters can be set again
    });
    ctx.on('click', '[data-action="apply-filters"]', () => { setPanel(false); $toggle.focus(); (mapOn && state.view === 'map' ? $('[data-region="map"]') : $list).scrollIntoView({ block: 'start' }); });

    /* clear-filters (shown in the empty state) resets old AND new filters */
    ctx.on('click', '[data-action="clear-filters"]', () => {
      resetNew();
      Object.assign(state, { q: '', city: '', type: '', food: false, area: '', sort: 'newest', view: 'list' });
      state.visible = PGC_CONFIG.PAGE_SIZE;
      syncControls(); renderChips(); syncUrl();
      refresh({ force: true });
    });

    ctx.on('click', '[data-action="load-more"]', () => { state.visible += PGC_CONFIG.PAGE_SIZE; renderList(lastList); });

    if (mapOn) {
      PGC.exploreMap.bindAreaChips(ctx, state);
      ctx.on('click', '[data-view]', (e, el) => { state.view = el.dataset.view; ctx.app.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b === el))); applyClientChange(); });
    }

    ctx.on('click', '[data-action="toggle-save"]', async (e, btn) => {
      e.preventDefault();
      const pgId = btn.dataset.pgId;
      const was = btn.getAttribute('aria-pressed') === 'true';
      if (!PGC.auth.isTenant) { PGC.actions.requireLogin('Log in to save PGs'); return; }
      PGC.actions.paintHeart(btn, !was); // optimistic
      try {
        await PGC.actions.toggleSave(pgId, was);
        if (was) saved.delete(pgId); else saved.add(pgId);
      } catch (err) {
        PGC.actions.paintHeart(btn, was);
        PGC.ui.toast(err.message, { type: 'error' });
      }
    });

    renderChips();
    if (activeCount()) setPanel(true);
    await refresh();
  };
})(window.PGC);
