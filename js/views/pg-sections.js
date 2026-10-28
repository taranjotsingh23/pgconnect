/**
 * Extra sections for the PG detail page: Safety (F2), True monthly cost (F4), Find a roommate card (F1).
 * Each returns markup (or '' when its feature switch is off) so pg-detail.js only needs one line per section.
 * The cost maths is PGC.lib.computePassport (brief Appendix A3) and is never recomputed here.
 */
(function (PGC) {
  'use strict';

  const { html, formatINR, capitalize } = PGC.utils;
  const lib = PGC.lib;
  const NOT_STATED = 'Not stated by owner';

  /* ------------------------------ F2: Safety ------------------------------ */

  const SAFETY_ROWS = [
    ['cctv', 'cctv', 'CCTV on entrances and common areas'],
    ['guard', 'night_guard', 'Night guard or warden'],
    ['fire', 'fire_exit_clear', 'Clear fire exit'],
    ['curfew', 'curfew_flexible', 'Flexible curfew'],
    ['wfloor', 'women_only_floor', 'Women-only floor'],
  ];

  /** yes: tick. no: plain dash with "No". missing: "Not stated by owner" (never a red mark). */
  function safetyLine(id, label, value) {
    const state = value === true ? 'yes' : value === false ? 'no' : 'missing';
    return html`
      <li class="check check--${state}" data-testid="pg-safety-${id}">
        <span class="check__mark" aria-hidden="true">${state === 'yes' ? '✓' : state === 'no' ? '-' : '·'}</span>
        <span class="check__label">${label}</span>
        <span class="check__state">${state === 'yes' ? html`<span class="sr-only">Yes</span>` : state === 'no' ? 'No' : NOT_STATED}</span>
      </li>`;
  }

  function safety(pg) {
    if (!PGC.features.on('SAFETY_FILTERS')) return '';
    const s = pg.safety || {};
    return html`
      <section class="section" data-testid="pg-safety-section" aria-labelledby="safety-title">
        <h2 class="section__title" id="safety-title">Safety</h2>
        <p class="section__sub">Declared by the owner</p>
        <ul class="checklist">
          ${pg.gender === 'female' && pg.verified && safetyLine('wov', 'Women-only (verified)', true)}
          ${SAFETY_ROWS.map(([id, field, label]) => safetyLine(id, label, typeof s[field] === 'boolean' ? s[field] : undefined))}
        </ul>
        ${s.curfew_time && html`<p class="section__text" data-testid="pg-safety-curfew-time">Curfew: ${s.curfew_time}</p>`}
        <p class="fineprint">Visit the PG in person before you pay.</p>
      </section>`;
  }

  /* ------------------------------ F4: True monthly cost ------------------------------ */

  const rupees = (n) => formatINR(n);

  /** The cost table and terms for one room. All numbers come from lib.computePassport. */
  function passportBody(pg, room) {
    const p = lib.computePassport(pg, room);
    if (!p) return '';
    const c = pg.charges || {};
    const elec = p.electricity == null ? null : c.electricity && c.electricity.mode === 'included' ? 'Included' : rupees(p.electricity);
    const maint = p.maintenance == null ? null : p.maintenance === 0 ? 'None' : rupees(p.maintenance);
    const cell = (testid, value) => (value == null
      ? html`<td class="is-missing" data-testid="${testid}">${NOT_STATED}</td>` : html`<td data-testid="${testid}">${value}</td>`);

    let food;
    if (p.food.mode === 'included') food = html`<p>Food: Included in rent</p>`;
    else if (p.food.mode === 'optional') {
      food = p.food.optionalPrice != null
        ? html`<p>Food: Optional, ${rupees(p.food.optionalPrice)} a month</p><p>Total with food: ${rupees(p.trueMonthlyWithFood)}</p>`
        : html`<p>Food: Optional</p>`;
    } else if (p.food.mode === 'none') food = html`<p>Food: Not offered</p>`;
    else food = html`<p>Food: ${NOT_STATED}</p>`;

    const term = (testid, label, value) => html`<li data-testid="${testid}">${label}: <strong>${value == null ? NOT_STATED : value}</strong></li>`;
    const depositText = p.depositMonths == null ? null : p.depositMonths === 0 ? 'None' : `${p.depositMonths} ${p.depositMonths === 1 ? 'month' : 'months'} (${rupees(p.depositAmount)})`;

    return html`
      <table class="ptable">
        <tbody>
          <tr><th scope="row">Rent</th><td data-testid="passport-rent">${rupees(p.rent)}</td></tr>
          <tr><th scope="row">Electricity (estimate)</th>${cell('passport-electricity', elec)}</tr>
          <tr><th scope="row">Maintenance</th>${cell('passport-maintenance', maint)}</tr>
          <tr class="is-total"><th scope="row">Total per month</th><td data-testid="passport-total">${rupees(p.trueMonthly)}</td></tr>
        </tbody>
      </table>
      ${p.extraOverRent > 0 && html`<p class="passport__extra" data-testid="passport-extra">+${rupees(p.extraOverRent)} a month over the rent shown on the card</p>`}
      <div class="passport__extra" data-testid="passport-food">${food}</div>
      <ul class="pterms">
        ${term('passport-deposit', 'Refundable deposit', depositText)}
        ${p.depositRefundDays != null && html`<li>Deposit returned within <strong>${p.depositRefundDays} days</strong></li>`}
        ${term('passport-notice', 'Notice period', p.noticeDays == null ? null : `${p.noticeDays} days`)}
        ${term('passport-lockin', 'Lock-in', p.lockInMonths == null ? null : p.lockInMonths === 0 ? 'None' : `${p.lockInMonths} ${p.lockInMonths === 1 ? 'month' : 'months'}`)}
        ${term('passport-exit', 'Exit fee', p.exitFee == null ? null : p.exitFee === 0 ? 'None' : rupees(p.exitFee))}
        <li class="pterms__movein" data-testid="passport-movein">Cash needed to move in: <strong>${p.moveInCash == null ? NOT_STATED : rupees(p.moveInCash)}</strong>
          <small>Deposit plus first month's rent</small></li>
      </ul>
      <p class="fineprint">Estimates from the owner. Electricity depends on how much you use.${p.complete ? '' : ' Some details were not stated by the owner. Ask them before you book.'}</p>`;
  }

  function passport(pg) {
    if (!PGC.features.on('TRUE_COST')) return '';
    const cheapest = lib.cheapestRoom(pg);
    if (!cheapest) return '';
    const types = (pg.room_types || []).map((r) => r.type);
    return html`
      <section class="section passport" data-testid="pg-passport" aria-labelledby="passport-title">
        <h2 class="section__title" id="passport-title">True monthly cost</h2>
        <p class="section__sub">What you pay each month, beyond the rent on the card.</p>
        ${types.length > 1 && html`
          <fieldset class="fieldset"><legend class="sr-only">Room type</legend>
            <div class="chip-row chip-row--wrap">
              ${types.map((t) => html`<label class="chip-radio"><input type="radio" name="passport_room" value="${t}" ${t === cheapest.type ? 'checked' : ''} data-testid="passport-room-${t}"><span class="chip">${capitalize(t)}</span></label>`)}
            </div>
          </fieldset>`}
        <div data-passport-body>${passportBody(pg, cheapest.type)}</div>
      </section>`;
  }

  /** Wires the room chips of the cost section (called by pg-detail.js after render). */
  function bind(ctx, pg) {
    ctx.on('change', '[name="passport_room"]', (e, input) => {
      const body = ctx.app.querySelector('[data-passport-body]');
      if (body) body.innerHTML = passportBody(pg, input.value).toString();
    });
  }

  /* ------------------------------ F1: "Find a roommate" card ------------------------------ */
  function roommateCard(pg) {
    if (!PGC.features.on('ROOMMATES') || PGC.auth.isOwner) return '';
    return html`
      <section class="section" data-testid="pg-roommate-card">
        <div class="card card--pad rm-card">
          <div><h2 class="section__title">Find a roommate in ${pg.city}</h2>
            <p class="muted">Answer 6 quick questions. See how your routines match.</p></div>
          <a class="btn btn--soft" href="#/roommates?city=${encodeURIComponent(pg.city)}">Find a roommate</a>
        </div>
      </section>`;
  }

  /* ------------------------------ F5: Compare button in the title row ------------------------------ */
  function compareButton(pg) {
    if (!PGC.compare || !PGC.compare.enabled()) return '';
    const on = PGC.compare.has(pg.pg_id);
    return html`<button type="button" class="compare-btn compare-btn--detail" data-action="toggle-compare" data-pg-id="${pg.pg_id}"
      aria-pressed="${on ? 'true' : 'false'}" data-name="${pg.name}" aria-label="${on ? '✓ Added' : '+ Compare'} ${pg.name}" data-testid="compare-btn-${pg.pg_id}">${on ? '✓ Added' : '+ Compare'}</button>`;
  }

  PGC.sections = { safety, passport, bind, passportBody, compareButton, roommateCard, NOT_STATED, formatINR, capitalize };
})(window.PGC);
