/**
 * Explore: area picker and Map view (F7).
 * Leaflet 1.9.4 is vendored in assets/ and loaded only when the Map view is opened; the list works without it.
 * Pins are L.divIcon price pills (no marker image files). The map holds no data fetching: Explore passes plain data.
 * Only PGs with at least one free bed right now (and a position) get a pin, and the list shows exactly those PGs.
 */
(function (PGC) {
  'use strict';

  const { html, formatINR, pluralPG } = PGC.utils;
  const { pgCard, emptyState } = PGC.c;
  const lib = PGC.lib;

  /* ---------- lazy loading of Leaflet ---------- */
  let leafletPromise = null;
  function loadLeaflet() {
    if (window.L && window.L.map) return Promise.resolve(window.L);
    if (leafletPromise) return leafletPromise;
    leafletPromise = new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = 'assets/leaflet-1.9.4.min.css';
      document.head.appendChild(css);
      const js = document.createElement('script');
      js.src = 'assets/leaflet-1.9.4.min.js';
      js.onload = () => resolve(window.L);
      js.onerror = () => { leafletPromise = null; reject(new Error('Leaflet failed to load')); };
      document.head.appendChild(js);
    });
    return leafletPromise;
  }

  const priceLabel = (n) => (n >= 1000 ? `₹${(n / 1000).toFixed(n % 1000 ? 1 : 0)}k` : `₹${n}`);

  /* ---------- the map controller: plain props in, callbacks out ---------- */
  function createMap(L, host, { onSelect, onTilesFailed }) {
    const map = L.map(host, { center: [20.5, 78.9], zoom: 5, zoomControl: true, scrollWheelZoom: false });
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
    let failures = 0;
    tiles.on('tileerror', () => { failures += 1; if (failures === 2) onTilesFailed(); });
    const layer = L.layerGroup().addTo(map);
    const markers = new Map();

    return {
      update({ pgs, selectedId, anchor, center }) {
        layer.clearLayers(); markers.clear();
        const pts = [];
        pgs.forEach((pg) => {
          const c = lib.coordsOf(pg);
          if (!c) return;
          const sel = pg.pg_id === selectedId;
          const icon = L.divIcon({
            className: 'pg-pin-wrap',
            html: `<span class="pg-pin${sel ? ' pg-pin--sel' : ''}" data-testid="map-pin-${pg.pg_id}">${priceLabel(pg.price_from)}</span>`,
            iconSize: [64, 28], iconAnchor: [32, 14],
          });
          const mk = L.marker([c.lat, c.lng], { icon, keyboard: true, title: `${pg.name}, from ${priceLabel(pg.price_from)} a month`, zIndexOffset: sel ? 1000 : 0 });
          mk.on('click', () => onSelect(pg.pg_id));
          mk.addTo(layer);
          markers.set(pg.pg_id, mk);
          pts.push([c.lat, c.lng]);
        });
        if (anchor) { L.circleMarker([anchor.lat, anchor.lng], { radius: 6, color: '#1A1C1E', weight: 2, fillColor: '#fff', fillOpacity: 1 }).addTo(layer); pts.push([anchor.lat, anchor.lng]); }
        if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 16 });
        else map.setView(pts[0] || [center.lat, center.lng], pts.length ? 15 : 13);
      },
      /** Hovering a list card highlights its pin (and the reverse). */
      hover(id, on) { const mk = markers.get(id); const el = mk && mk.getElement() && mk.getElement().querySelector('.pg-pin'); if (el) el.classList.toggle('pg-pin--hover', on); },
      destroy() { map.remove(); },
    };
  }

  /* ---------- area picker ---------- */
  function renderAreas({ ctx, state }) {
    const region = ctx.app.querySelector('[data-region="areas"]');
    if (!region) return;
    if (!state.city) { region.innerHTML = ''; return; }
    const list = (state.lastList && state.lastList()) || [];
    const areas = [...new Set(list.filter((p) => p.city === state.city).map((p) => lib.areaOf(p)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    region.innerHTML = html`
      <div class="chip-row" role="group" aria-label="Area">
        ${PGC.c.chip('All areas', { active: !state.area, 'data-area': '', 'data-testid': 'area-chip-all' })}
        ${areas.map((a) => PGC.c.chip(a, { active: state.area === a, 'data-area': a, 'data-testid': `area-chip-${a}` }))}
      </div>`.toString();
  }

  /* ---------- Map view ---------- */
  function hide(ctx) {
    const s = ctx.__map;
    if (s && s.controller) { s.controller.destroy(); s.controller = null; }
    const region = ctx.app.querySelector('[data-region="map"]');
    if (region) region.innerHTML = '';
    const cityRow = ctx.app.querySelector('[data-chips="city"]');
    if (cityRow) cityRow.classList.remove('chip-row--nudge');
  }

  function render({ ctx, state, filtered, $list, $more, saved, heartMode, compareOn }) {
    const s = (ctx.__map = ctx.__map || { selected: null, controller: null, key: '' });
    const region = ctx.app.querySelector('[data-region="map"]');
    $list.innerHTML = ''; $more.innerHTML = '';
    const cityRow = ctx.app.querySelector('[data-chips="city"]');

    if (!s.bound) { // one set of delegated listeners per page visit
      s.bound = true;
      ctx.on('click', '[data-action="map-card-close"]', () => { s.selected = null; s.paint(); });
      ctx.on('click', '[data-action="show-list"]', () => { state.view = 'list'; ctx.app.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === 'list'))); state.apply(); });
      ctx.on('mouseover', '[data-map-list] .pg-card', (e, el) => s.controller && s.controller.hover(el.dataset.testid.replace('pg-card-', ''), true));
      ctx.on('mouseout', '[data-map-list] .pg-card', (e, el) => s.controller && s.controller.hover(el.dataset.testid.replace('pg-card-', ''), false));
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && s.selected) { s.selected = null; s.paint && s.paint(); } }, { signal: ctx.signal });
      ctx.onDestroy(() => { if (s.controller) { s.controller.destroy(); s.controller = null; } });
    }

    if (!state.city) {
      if (s.controller) { s.controller.destroy(); s.controller = null; }
      cityRow.classList.add('chip-row--nudge');
      region.innerHTML = emptyState({ icon: '🗺️', title: 'Pick a city and an area to see PGs with a bed free.' }).toString();
      return;
    }
    cityRow.classList.remove('chip-row--nudge');

    const free = filtered.filter((p) => lib.bedsLeft(p) > 0);
    const pins = free.filter((p) => lib.coordsOf(p));
    const placeName = state.area || state.city;
    if (s.selected && !pins.some((p) => p.pg_id === s.selected)) s.selected = null;

    if (!pins.length) {
      if (s.controller) { s.controller.destroy(); s.controller = null; }
      region.innerHTML = html`
        <div data-testid="map-empty">${emptyState({
          icon: '🛏️', title: 'No PGs with a free bed here right now', text: 'Try another area or relax a filter.',
          action: html`<button type="button" class="btn btn--soft" data-action="show-list" data-testid="map-show-list">Show list</button>`,
        })}</div>`.toString();
      return;
    }

    const noPos = free.length - pins.length;
    const listHtml = html`<div class="pg-grid pg-grid--map">${pins.map((pg) => pgCard(pg, { heart: heartMode(), saved: saved.has(pg.pg_id), compare: compareOn }))}</div>`.toString();

    // Keep the same Leaflet instance while only the data changes (no flicker); build the layout once per city.
    if (!s.controller || region.dataset.mapCity !== state.city) {
      if (s.controller) { s.controller.destroy(); s.controller = null; }
      region.dataset.mapCity = state.city;
      region.innerHTML = html`
        <p class="map-count" data-testid="map-count" aria-live="polite"></p>
        <div class="map-layout">
          <div class="map-wrap">
            <div class="pg-map" data-map-host role="region" aria-label="Map of PGs with a bed free" data-testid="map-canvas"></div>
            <p class="map-note" data-testid="map-tile-note" role="status" hidden>Map tiles could not load. The list below has the same PGs.</p>
            <div class="map-card" data-testid="map-card" hidden></div>
          </div>
          <div data-map-list></div>
        </div>
        <p class="map-note map-note--muted" data-testid="map-nopos-note" hidden></p>`.toString();
      const host = region.querySelector('[data-map-host]');
      const tileNote = region.querySelector('[data-testid="map-tile-note"]');
      loadLeaflet().then((L) => {
        if (!ctx.alive() || !region.contains(host)) return;
        s.controller = createMap(L, host, {
          onSelect: (id) => { s.selected = id; s.paint(); },
          onTilesFailed: () => { tileNote.hidden = false; },
        });
        s.paint();
      }).catch(() => { tileNote.hidden = false; });
    }

    // paint() redraws pins, the card and the list from the latest data
    s.data = { pins, placeName, noPos, listHtml, state, compareOn };
    s.paint = () => {
      const d = s.data;
      const count = d.pins.length;
      region.querySelector('[data-testid="map-count"]').textContent = `${count} ${pluralPG(count)} with a bed free in ${d.placeName}`;
      region.querySelector('[data-map-list]').innerHTML = d.listHtml;
      const np = region.querySelector('[data-testid="map-nopos-note"]');
      np.hidden = !d.noPos; np.textContent = d.noPos ? `${d.noPos} more ${pluralPG(d.noPos)} with a bed free ${d.noPos === 1 ? 'has' : 'have'} no map position. See ${d.noPos === 1 ? 'it' : 'them'} in the list view.` : '';
      if (s.controller) {
        const ref = d.state.refCoords && d.state.refCoords();
        const centre = (lib.AREAS.find((a) => a.area === d.state.area) || lib.areasOf(d.state.city)[0] || { center: { lat: 20.5, lng: 78.9 } }).center;
        s.controller.update({ pgs: d.pins, selectedId: s.selected, anchor: ref, center: centre });
      }
      const card = region.querySelector('[data-testid="map-card"]');
      const pg = d.pins.find((p) => p.pg_id === s.selected);
      if (!pg) { card.hidden = true; card.innerHTML = ''; }
      else {
        card.hidden = false;
        card.innerHTML = html`
          <img src="${(pg.images && pg.images[0]) || PGC.c.FALLBACK_IMAGE}" alt="" width="96" height="72" loading="lazy">
          <div class="map-card__body">
            <h3 class="map-card__name">${pg.name}</h3>
            <p class="map-card__loc">${lib.areaOf(pg)}, ${pg.city}</p>
            <p class="map-card__meta">from ${formatINR(pg.price_from)}/mo · ${lib.bedsLeft(pg)} beds free</p>
            <div class="map-card__actions">
              <a class="btn btn--primary btn--sm" href="#/pg/${encodeURIComponent(pg.pg_id)}" data-testid="map-card-view">View</a>
              ${d.compareOn && html`<button type="button" class="btn btn--ghost btn--sm" data-action="toggle-compare" data-pg-id="${pg.pg_id}" data-name="${pg.name}" aria-label="+ Compare ${pg.name}" data-testid="map-card-compare">+ Compare</button>`}
            </div>
          </div>
          <button type="button" class="map-card__close" data-action="map-card-close" aria-label="Close PG card">✕</button>`.toString();
        if (d.compareOn && PGC.compare) PGC.compare.refresh();
      }
    };
    s.paint();

  }

  /** Area chips are handled here so Explore only needs to know that `state.area` changed. */
  function bindAreaChips(ctx, state) {
    ctx.on('click', '[data-area]', (e, el) => { state.area = state.area === el.dataset.area ? '' : el.dataset.area; state.apply(); });
  }

  PGC.exploreMap = { render, renderAreas, hide, bindAreaChips };
})(window.PGC);
