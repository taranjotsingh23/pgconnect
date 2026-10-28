/**
 * Compare page (F5): /compare?ids=a,b,c[&ref=Kothrud]. The URL is the source of truth.
 * Data comes from the existing detail endpoint through the existing ["pg", id] cache key (no new endpoint).
 * Cost numbers all come from PGC.lib.computePassport, so they always agree with the PG detail page.
 */
(function (PGC) {
  'use strict';

  const { html, formatINR, genderLabel, capitalize, formatRating } = PGC.utils;
  const lib = PGC.lib;
  PGC.views = PGC.views || {};
  const NOT_STATED = 'Not stated';
  const GRADE_LABEL = { verified: 'Verified', verified_plus: 'Verified Plus', assured: 'Assured' };

  const tickCell = (v) => (v === true ? html`<span class="check__mark check--yes" aria-hidden="true">✓</span><span class="sr-only">Yes</span>` : v === false ? 'No' : NOT_STATED);

  function foodText(p) {
    if (p.food.mode === 'included') return 'Included in rent';
    if (p.food.mode === 'optional') return p.food.optionalPrice != null ? `Optional, ${formatINR(p.food.optionalPrice)} a month` : 'Optional';
    if (p.food.mode === 'none') return 'Not offered';
    return NOT_STATED;
  }

  /** Builds every row of the table for the loaded PGs. Returns [{ section?, key, label, cells: [markup|string] }]. */
  function buildRows(pgs, ref) {
    const data = pgs.map((pg) => {
      const room = lib.cheapestRoom(pg);
      return { pg, room, p: room ? lib.computePassport(pg, room.type) : null };
    });
    const lowest = (pick) => { // ids carrying the "Lowest" label: needs 2+ known values, ties mark all
      const known = data.map((d) => ({ id: d.pg.pg_id, v: pick(d) })).filter((x) => x.v != null);
      if (known.length < 2) return new Set();
      const min = Math.min(...known.map((x) => x.v));
      return new Set(known.filter((x) => x.v === min).map((x) => x.id));
    };
    const lowTotal = lowest((d) => (d.p && d.p.complete ? d.p.trueMonthly : null));
    const lowCash = lowest((d) => (d.p ? d.p.moveInCash : null));
    const money = (v) => (v == null ? NOT_STATED : formatINR(v));
    const withLowest = (set, d, text) => html`${text}${set.has(d.pg.pg_id) && html`<span class="cmp__lowest" data-testid="compare-lowest-${d.pg.pg_id}">Lowest</span>`}`;
    const refCenter = ref ? (lib.AREAS.find((a) => a.area === ref) || {}).center : null;
    const S = (d, f) => (d.pg.safety && typeof d.pg.safety[f] === 'boolean' ? d.pg.safety[f] : undefined);
    const rows = [];
    const row = (key, label, fn, section) => rows.push({ key, label, section, cells: data.map(fn) });

    row('rent', 'Rent (cheapest room)', (d) => (d.p ? `${formatINR(d.p.rent)} (${capitalize(d.room.type)})` : NOT_STATED), 'Cost');
    row('total', 'Total per month', (d) => (d.p ? withLowest(lowTotal, d, `${formatINR(d.p.trueMonthly)}${d.p.complete ? '' : ' (partly stated)'}`) : NOT_STATED));
    row('extra', 'Extra over rent', (d) => (!d.p ? NOT_STATED : d.p.complete || d.p.extraOverRent > 0 ? `+${formatINR(d.p.extraOverRent)}` : NOT_STATED));
    row('food', 'Food', (d) => (d.p ? foodText(d.p) : NOT_STATED));
    row('deposit', 'Deposit', (d) => (!d.p || d.p.depositMonths == null ? NOT_STATED : d.p.depositMonths === 0 ? 'None' : `${d.p.depositMonths} ${d.p.depositMonths === 1 ? 'month' : 'months'} (${formatINR(d.p.depositAmount)})`));
    row('notice', 'Notice', (d) => (!d.p || d.p.noticeDays == null ? NOT_STATED : `${d.p.noticeDays} days`));
    row('lockin', 'Lock-in', (d) => (!d.p || d.p.lockInMonths == null ? NOT_STATED : d.p.lockInMonths === 0 ? 'None' : `${d.p.lockInMonths} months`));
    row('exit', 'Exit fee', (d) => (!d.p || d.p.exitFee == null ? NOT_STATED : d.p.exitFee === 0 ? 'None' : formatINR(d.p.exitFee)));
    row('movein', 'Cash needed to move in', (d) => withLowest(lowCash, d, money(d.p ? d.p.moveInCash : null)));

    row('sharing', 'Sharing and prices', (d) => ((d.pg.room_types || []).map((r) => `${capitalize(r.type)} ${formatINR(r.price)}`).join(', ') || NOT_STATED), 'Rooms');
    row('beds', 'Beds free now', (d) => String(lib.bedsLeft(d.pg)));

    row('safety-wov', 'Women-only (verified)', (d) => tickCell(d.pg.gender === 'female' && d.pg.verified ? true : false), 'Safety (declared by the owner)');
    row('safety-cctv', 'CCTV', (d) => tickCell(S(d, 'cctv')));
    row('safety-guard', 'Night guard or warden', (d) => tickCell(S(d, 'night_guard')));
    row('safety-fire', 'Clear fire exit', (d) => tickCell(S(d, 'fire_exit_clear')));
    row('safety-curfew', 'Flexible curfew', (d) => tickCell(S(d, 'curfew_flexible')));
    row('safety-wfloor', 'Women-only floor', (d) => tickCell(S(d, 'women_only_floor')));

    row('gender', 'Gender', (d) => genderLabel(d.pg.gender), 'Basics');
    row('ac', 'AC', (d) => tickCell(lib.hasAc(d.pg)));
    row('shortstay', 'Short stay OK', (d) => tickCell(typeof d.pg.short_stay_ok === 'boolean' ? d.pg.short_stay_ok : undefined));
    row('grade', 'Verified level', (d) => GRADE_LABEL[lib.gradeOf(d.pg)] || NOT_STATED);
    if (refCenter) row('distance', `Distance from ${ref}`, (d) => { const c = lib.coordsOf(d.pg); return c ? `${lib.roundKm(lib.haversineKm(refCenter, c))} km` : NOT_STATED; });
    return rows;
  }

  PGC.views.compare = async function compareView(ctx) {
    const fromUrl = PGC.compare ? PGC.compare.clean((ctx.query.ids || '').split(',')) : [];
    const ids = fromUrl.length || !PGC.compare ? fromUrl : PGC.compare.list(); // an empty URL falls back to the saved tray
    const ref = lib.AREAS.some((a) => a.area === ctx.query.ref) ? ctx.query.ref : '';
    ctx.title('Compare PGs');
    ctx.render(html`<div class="page-head"><h1 class="page-title">Compare PGs</h1></div><div data-testid="compare-page"><div class="skeleton" style="height:320px;border-radius:20px"></div></div>`);

    if (!ids.length) {
      ctx.render(PGC.c.emptyState({ icon: '⚖️', title: 'Add one more PG to compare.', text: 'Choose PGs with the + Compare button, then come back here.', action: html`<a class="btn btn--soft" href="#/">Browse PGs</a>` }));
      return;
    }

    // one query per id, through the same key the detail page uses
    const loaded = await Promise.all(ids.map((id) => PGC.query.get(['pg', id], () => PGC.api.getPg(id)).then((pg) => ({ id, pg }), () => ({ id, pg: null }))));
    if (!ctx.alive()) return;
    const good = loaded.filter((x) => x.pg);
    const rows = good.length ? buildRows(good.map((x) => x.pg), ref) : [];
    const colIndex = (id) => good.findIndex((x) => x.id === id);

    const header = (x) => (x.pg ? html`
      <th scope="col" class="cmp__col" data-testid="compare-col-${x.id}">
        <img class="cmp__photo" src="${(x.pg.images && x.pg.images[0]) || PGC.c.FALLBACK_IMAGE}" alt="" width="200" height="130" loading="lazy">
        <p class="cmp__name">${x.pg.name}</p>
        <p class="cmp__loc">${lib.areaOf(x.pg)}, ${x.pg.city}</p>
        <p class="cmp__pills">${x.pg.verified && html`<span class="soft-pill">✓ Verified</span>`}${x.pg.rating > 0 && html`<span class="rating-chip"><span class="rating-chip__star" aria-hidden="true">★</span><span class="sr-only">Rated </span>${formatRating(x.pg.rating)}</span>`}</p>
        <p class="cmp__actions"><a class="btn btn--primary btn--sm" href="#/pg/${encodeURIComponent(x.id)}">View PG</a>
          <button type="button" class="btn btn--ghost btn--sm" data-action="cmp-remove" data-pg-id="${x.id}" data-testid="compare-remove-${x.id}" aria-label="Remove ${x.pg.name}">Remove</button></p>
      </th>` : html`
      <th scope="col" class="cmp__col cmp__col--gone" data-testid="compare-col-${x.id}">
        <p class="cmp__name">This PG is no longer available</p>
        <p class="cmp__actions"><button type="button" class="btn btn--ghost btn--sm" data-action="cmp-remove" data-pg-id="${x.id}" data-testid="compare-remove-${x.id}">Remove</button></p>
      </th>`);

    const body = [];
    let lastSection = '';
    rows.forEach((r) => {
      if (r.section && r.section !== lastSection) { body.push(html`<tr class="cmp__section"><th scope="colgroup" colspan="${loaded.length + 1}">${r.section}</th></tr>`); lastSection = r.section; }
      body.push(html`<tr data-testid="compare-row-${r.key}"><th scope="row" class="cmp__label">${r.label}</th>
        ${loaded.map((x) => (x.pg ? html`<td>${r.cells[colIndex(x.id)]}</td>` : html`<td class="cmp__gone">-</td>`))}</tr>`);
    });

    ctx.render(html`
      <div class="page-head"><h1 class="page-title">Compare PGs</h1>
        <p class="page-sub">Costs use the same maths as each PG page. Details are declared by the owners. Visit in person before you pay.</p></div>
      <div data-testid="compare-page">
        ${good.length < 2 && html`<div class="map-note" role="status">Add one more PG to compare. <a href="#/">Browse PGs</a></div>`}
        <div class="cmp__scroll" tabindex="0" role="region" aria-label="Comparison table, scrolls sideways on small screens">
          <table class="cmp">
            <caption class="sr-only">Comparison of ${loaded.length} PGs</caption>
            <thead><tr><th scope="col" class="cmp__label cmp__label--head"><span class="sr-only">Attribute</span></th>${loaded.map(header)}</tr></thead>
            <tbody>${body}</tbody>
          </table>
        </div>
      </div>`);

    ctx.on('click', '[data-action="cmp-remove"]', (e, btn) => {
      const id = btn.dataset.pgId;
      if (PGC.compare) PGC.compare.remove(id);
      const left = ids.filter((x) => x !== id);
      ctx.go(`/compare${left.length ? `?ids=${left.join(',')}${ref ? `&ref=${encodeURIComponent(ref)}` : ''}` : ''}`, { replace: true });
    });
  };
})(window.PGC);
