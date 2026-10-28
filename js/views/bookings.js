/**
 * Saved PGs, Bookings (tenant) / Inquiries (owner), and the mock Payment screen.
 */
(function (PGC) {
  'use strict';

  const { html, formatINR, capitalize } = PGC.utils;
  const { pgCard, skeletonGrid, skeletonRows, emptyState, statusPill, loadInto, setLoading, showError, formError } = PGC.c;
  PGC.views = PGC.views || {};

  /* ------------------------------ Saved ------------------------------ */

  PGC.views.saved = async function saved(ctx) {
    ctx.title('Saved PGs');
    ctx.render(html`
      <div class="page-head"><h1 class="page-title">Saved PGs</h1></div>
      <div data-list></div>`);
    const el = ctx.app.querySelector('[data-list]');
    let list = [];

    const paint = () => (list.length
      ? html`<div class="pg-grid">${list.map((pg) => pgCard(pg, { heart: 'tenant', saved: true, compare: !!(PGC.compare && PGC.compare.enabled()) }))}</div>`
      : emptyState({
        icon: '🤍', title: 'Nothing saved yet', text: 'Tap the heart on a PG to shortlist it.',
        action: html`<a class="btn btn--soft" href="#/">Browse PGs</a>`,
      }));

    await loadInto(ctx, el, {
      skeleton: skeletonGrid(3),
      fetcher: () => PGC.query.get(['shortlist'], () => PGC.api.shortlist()),
      render: (data) => { list = data; return paint(); },
    });

    ctx.on('click', '[data-action="toggle-save"]', async (e, btn) => {
      e.preventDefault();
      const pgId = btn.dataset.pgId;
      try {
        await PGC.actions.toggleSave(pgId, true);
        list = list.filter((p) => p.pg_id !== pgId);
        el.innerHTML = paint().toString();
      } catch (err) {
        PGC.ui.toast(err.message, { type: 'error' });
      }
    });
  };

  /* ------------------------------ Bookings / Inquiries ------------------------------ */

  function bookingCard(b, isOwner) {
    const chatHref = `#/chat/${encodeURIComponent(b.pg_id)}?tenant_id=${encodeURIComponent(b.tenant_id)}`;
    const meta = `${isOwner ? `${b.tenant_name} · ` : ''}${b.room_type} · ${formatINR(b.price)}/mo`;
    return html`
      <article class="booking card card--pad" data-testid="booking-${b.booking_id}">
        <div class="booking__top">
          <img class="booking__thumb" src="${b.pg_image || PGC.c.FALLBACK_IMAGE}" alt="" width="64" height="64" loading="lazy" decoding="async">
          <div class="booking__info">
            <h3 class="booking__name"><a href="#/pg/${encodeURIComponent(b.pg_id)}">${b.pg_name}</a></h3>
            <p class="booking__meta">${meta}</p>
            <p class="booking__meta">Move-in ${b.move_in_date} · ${b.duration_months} mo</p>
          </div>
          ${statusPill(b)}
        </div>
        ${b.message && html`<p class="booking__msg">“${b.message}”</p>`}
        <div class="booking__actions">
          ${isOwner && b.status === 'pending' && html`
            <button type="button" class="btn btn--primary btn--sm" data-action="decide" data-status="accepted" data-id="${b.booking_id}" data-testid="accept-${b.booking_id}">Accept</button>
            <button type="button" class="btn btn--ghost btn--sm" data-action="decide" data-status="declined" data-id="${b.booking_id}" data-testid="decline-${b.booking_id}">Decline</button>`}
          ${!isOwner && b.status === 'accepted' && !b.paid && html`
            <a class="btn btn--primary btn--sm" href="#/pay/${encodeURIComponent(b.booking_id)}" data-testid="pay-${b.booking_id}">Pay ${formatINR(b.price)}</a>`}
          <a class="btn btn--ghost btn--sm" href="${chatHref}" data-testid="chat-${b.booking_id}"><span aria-hidden="true">💬</span> Chat</a>
        </div>
      </article>`;
  }

  PGC.views.bookings = async function bookings(ctx) {
    const isOwner = PGC.auth.isOwner;
    const title = isOwner ? 'Inquiries' : 'My bookings';
    const key = ['bookings', isOwner];
    ctx.title(title);
    ctx.render(html`
      <div class="page-head"><h1 class="page-title">${title}</h1></div>
      <div data-list></div>`);
    const el = ctx.app.querySelector('[data-list]');

    const paint = (list) => (list.length
      ? html`<div class="booking-grid">${list.map((b) => bookingCard(b, isOwner))}</div>`
      : isOwner
        ? emptyState({ icon: '📅', title: 'No inquiries yet', text: 'Requests from tenants will show up here.' })
        : emptyState({
          icon: '📅', title: 'No bookings yet', text: 'Browse PGs and send a booking request.',
          action: html`<a class="btn btn--soft" href="#/">Browse PGs</a>`,
        }));

    const fetcher = () => PGC.query.get(key, () => (isOwner ? PGC.api.ownerBookings() : PGC.api.myBookings()));
    await loadInto(ctx, el, { skeleton: skeletonRows(3), fetcher, render: paint });

    ctx.on('click', '[data-action="decide"]', async (e, btn) => {
      const { id, status } = btn.dataset;
      const sibling = btn.parentElement.querySelectorAll('button');
      sibling.forEach((b) => { b.disabled = true; });
      setLoading(btn, true);
      try {
        await PGC.api.setBookingStatus(id, status);
        PGC.query.invalidate(['bookings'], ['owner-stats']);
        PGC.ui.toast(status === 'accepted' ? 'Booking accepted' : 'Booking declined', { type: 'success' });
        const list = await fetcher();
        if (ctx.alive()) el.innerHTML = paint(list).toString();
      } catch (err) {
        PGC.ui.toast(err.message, { type: 'error' });
        if (ctx.alive()) { setLoading(btn, false); sibling.forEach((b) => { b.disabled = false; }); }
      }
    });
  };

  /* ------------------------------ Mock payment ------------------------------ */

  const METHODS = ['UPI', 'Card', 'Net banking'];

  PGC.views.pay = async function pay(ctx) {
    const id = ctx.params.id;
    ctx.title('Pay rent');
    ctx.render(html`<div class="narrow"><div class="skeleton skeleton--line" style="width:40%;height:32px"></div><div class="skeleton" style="height:140px;border-radius:20px;margin-top:16px"></div></div>`);

    let booking;
    try {
      booking = await PGC.query.get(['booking', id], () => PGC.api.getBooking(id), { force: true });
    } catch (e) {
      if (!ctx.alive()) return;
      ctx.render(emptyState({ icon: '💳', title: 'Booking not found', text: e.message, action: html`<a class="btn btn--soft" href="#/bookings">Back to bookings</a>` }));
      return;
    }
    if (!ctx.alive()) return;

    const success = (b, heading) => html`
      <div class="narrow pay-success">
        <div class="pay-success__icon" aria-hidden="true">✅</div>
        <h1 class="page-title">${heading}</h1>
        <p class="pay-success__line">${formatINR(b.price)} paid for ${b.pg_name}</p>
        <p class="pay-success__ref">Ref: ${b.payment_ref}</p>
        <p class="muted">This is a mock payment. No real money moved.</p>
        <a class="btn btn--primary btn--lg btn--block" href="#/bookings" data-testid="pay-done">Back to bookings</a>
      </div>`;

    if (booking.paid) { ctx.render(success(booking, 'Rent already paid')); return; }
    if (booking.status !== 'accepted') {
      ctx.render(emptyState({ icon: '⏳', title: 'Not ready to pay yet', text: 'Owner has not accepted this booking yet', action: html`<a class="btn btn--soft" href="#/bookings">Back to bookings</a>` }));
      return;
    }

    ctx.render(html`
      <div class="narrow">
        <button type="button" class="back-link" data-action="back" data-fallback="/bookings">← Back</button>
        <h1 class="page-title">Pay rent</h1>
        <div class="card card--pad pay-summary">
          <h2 class="pay-summary__name">${booking.pg_name}</h2>
          <p class="muted">${capitalize(booking.room_type)} room · move-in ${booking.move_in_date}</p>
          <p class="pay-summary__amount">${formatINR(booking.price)}</p>
        </div>
        <form data-form="pay" novalidate>
          <fieldset class="field fieldset">
            <legend class="field__label field__label--strong">Payment method</legend>
            <div class="chip-row chip-row--wrap">
              ${METHODS.map((m, i) => html`
                <label class="chip-radio">
                  <input type="radio" name="method" value="${m}" ${i === 0 ? 'checked' : ''} data-testid="method-${m}">
                  <span class="chip">${m}</span>
                </label>`)}
            </div>
          </fieldset>
          ${formError()}
          <button type="submit" class="btn btn--primary btn--lg btn--block" data-testid="pay-now">Pay ${formatINR(booking.price)}</button>
        </form>
        <p class="fineprint fineprint--center">Mock payment for the MVP. Connect Razorpay later for real payments.</p>
      </div>`);

    ctx.on('submit', '[data-form="pay"]', async (e, form) => {
      e.preventDefault();
      const btn = form.querySelector('[type="submit"]');
      showError(form, '');
      setLoading(btn, true);
      try {
        await new Promise((r) => setTimeout(r, 900)); // fake gateway round trip
        const paid = await PGC.api.pay(id, form.method.value);
        PGC.query.invalidate(['bookings'], ['booking', id], ['owner-stats']);
        PGC.ui.toast('Payment successful', { type: 'success' });
        if (ctx.alive()) ctx.render(success(paid, 'Payment successful'));
      } catch (err) {
        if (ctx.alive()) { setLoading(btn, false); showError(form, err.message); }
      }
    });
  };
})(window.PGC);
