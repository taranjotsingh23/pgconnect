/**
 * PG detail screen: gallery, rooms, amenities, rules, host, reviews, and the booking flow.
 *  - Desktop (>= 1024px): two columns, sticky booking card on the right.
 *  - Phones / tablets: single column, sticky bottom bar, booking form opens in a bottom sheet.
 */
(function (PGC) {
  'use strict';

  const { html, raw, formatINR, genderLabel, capitalize, initial, formatRating, todayISO, isValidISODate } = PGC.utils;
  const { stars, emptyState, setLoading, showError, formError } = PGC.c;
  PGC.views = PGC.views || {};

  const DURATIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 18, 24];

  /* ------------------------------ SEO (client-side) ------------------------------ */

  const setMeta = (selector, value) => { const el = document.querySelector(selector); if (el) el.setAttribute('content', value); };
  const DEFAULT_DESCRIPTION = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';

  function applySeo(pg) {
    const title = `${pg.name}, ${pg.locality}, ${pg.city} | PGConnect`;
    document.title = title;
    setMeta('meta[name="description"]', pg.description || DEFAULT_DESCRIPTION);
    setMeta('meta[property="og:title"]', title);
    setMeta('meta[property="og:description"]', pg.description || DEFAULT_DESCRIPTION);
    if (pg.images && pg.images[0]) setMeta('meta[property="og:image"]', new URL(pg.images[0], document.baseURI).href);

    const ld = {
      '@context': 'https://schema.org',
      '@type': 'LodgingBusiness',
      name: pg.name,
      description: pg.description,
      image: (pg.images || []).map((src) => new URL(src, document.baseURI).href),
      address: { '@type': 'PostalAddress', streetAddress: pg.address, addressLocality: pg.city, addressCountry: 'IN' },
      priceRange: `INR ${pg.price_from}`,
    };
    if (pg.review_count > 0) ld.aggregateRating = { '@type': 'AggregateRating', ratingValue: pg.rating, reviewCount: pg.review_count };
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'pg-jsonld';
    script.textContent = JSON.stringify(ld);
    document.head.appendChild(script);
  }

  function resetSeo() {
    const script = document.getElementById('pg-jsonld');
    if (script) script.remove();
    setMeta('meta[name="description"]', DEFAULT_DESCRIPTION);
    setMeta('meta[property="og:title"]', 'PGConnect');
    setMeta('meta[property="og:description"]', DEFAULT_DESCRIPTION);
    setMeta('meta[property="og:image"]', '');
  }

  /* ------------------------------ markup pieces ------------------------------ */

  const detailSkeleton = () => html`
    <div class="detail detail--loading" role="status" aria-label="Loading PG">
      <div class="detail__main">
        <div class="skeleton gallery__stage"></div>
        <div class="skeleton skeleton--line" style="width:55%;height:30px;margin-top:20px"></div>
        <div class="skeleton skeleton--line skeleton--sm" style="width:35%"></div>
        <div class="skeleton skeleton--line" style="width:90%;margin-top:24px"></div>
        <div class="skeleton skeleton--line" style="width:80%"></div>
        <div class="skeleton skeleton--line" style="width:100%;height:64px;margin-top:24px"></div>
        <div class="skeleton skeleton--line" style="width:100%;height:64px"></div>
      </div>
      <div class="detail__aside"><div class="skeleton" style="height:340px;border-radius:20px"></div></div>
    </div>`;

  const ratingRow = (pg) => html`
    ${pg.rating > 0 && html`<span class="rating-inline"><span aria-hidden="true">⭐</span> <strong>${formatRating(pg.rating)}</strong> <span class="rating-inline__count">(${pg.review_count})</span></span>`}
    <span class="soft-pill">${genderLabel(pg.gender)}</span>
    ${pg.food_included && html`<span class="soft-pill">🍱 Food</span>`}`;

  const reviewsBlock = (reviews) => html`
    <h2 class="section__title">Reviews (${reviews.length})</h2>
    ${reviews.length
      ? html`<ul class="reviews">${reviews.map((r) => html`
          <li class="review card">
            <div class="review__head"><strong>${r.tenant_name}</strong><span class="review__stars" role="img" aria-label="${r.rating} out of 5 stars">${stars(r.rating)}</span></div>
            ${r.comment && html`<p class="review__text">${r.comment}</p>`}
          </li>`)}</ul>`
      : html`<p class="muted">No reviews yet. Be the first!</p>`}`;

  const starButtons = (rating) => [1, 2, 3, 4, 5].map((n) => html`
    <button type="button" class="star-btn" data-star="${n}" aria-pressed="${n === rating ? 'true' : 'false'}" aria-label="${n} star${n > 1 ? 's' : ''}" data-testid="star-${n}">${n <= rating ? '⭐' : '☆'}</button>`);

  function reviewForm() {
    if (PGC.auth.isOwner) return '';
    if (!PGC.auth.isSignedIn) {
      return html`<div class="card card--pad review-form"><p class="muted">Staying or stayed here? <a href="#/login?next=${encodeURIComponent(PGC.router.currentHash())}">Log in</a> as a tenant to add a review.</p></div>`;
    }
    return html`
      <form class="card card--pad review-form form" data-form="review" novalidate>
        <p class="field__label" id="review-label">Add your review</p>
        <div class="stars" role="group" aria-labelledby="review-label" data-stars>${starButtons(5)}</div>
        <label class="field">
          <span class="sr-only">Your review</span>
          <textarea class="input input--area" name="comment" rows="3" maxlength="500" placeholder="How was your stay?" data-testid="review-input"></textarea>
        </label>
        ${formError()}
        <button type="submit" class="btn btn--soft btn--block" data-testid="submit-review">Post review</button>
      </form>`;
  }

  function bookingForm(pg) {
    return html`
      <form class="form booking-form" data-form="booking" novalidate>
        <fieldset class="field fieldset">
          <legend class="field__label">Room type</legend>
          <div class="chip-row chip-row--wrap">
            ${pg.room_types.map((r, i) => html`
              <label class="chip-radio">
                <input type="radio" name="room_type" value="${r.type}" ${i === 0 ? 'checked' : ''} data-testid="bm-room-${r.type}">
                <span class="chip">${r.type} · ${formatINR(r.price)}</span>
              </label>`)}
          </div>
        </fieldset>
        <label class="field">
          <span class="field__label">Move-in date</span>
          <input class="input" type="date" name="move_in_date" min="${todayISO()}" placeholder="2026-12-01" data-testid="bm-date">
        </label>
        <label class="field">
          <span class="field__label">Duration (months)</span>
          <select class="input" name="months" data-testid="bm-months">
            ${DURATIONS.map((m) => html`<option value="${m}" ${m === 6 ? 'selected' : ''}>${m} ${m === 1 ? 'month' : 'months'}</option>`)}
          </select>
        </label>
        <label class="field">
          <span class="field__label">Message to owner (optional)</span>
          <textarea class="input input--area" name="message" rows="3" maxlength="500" placeholder="Hi! I'd love to visit…" data-testid="bm-msg"></textarea>
        </label>
        <p class="fineprint">By sending, you agree to the sample digital rental agreement: monthly rent is due on the 1st and either side may end the stay with 30 days' notice.</p>
        ${formError()}
        <button type="submit" class="btn btn--primary btn--lg btn--block" data-testid="bm-submit">Agree &amp; send request</button>
      </form>`;
  }

  const roomRows = (pg) => pg.room_types.map((r) => html`
    <li class="room card" data-testid="room-${r.type}">
      <div>
        <p class="room__name">${capitalize(r.type)} occupancy</p>
        <p class="room__avail">${r.available} of ${r.total} available</p>
      </div>
      <p class="room__price">${formatINR(r.price)}<span>/mo</span></p>
    </li>`);

  function gallery(pg, { heartMode, saved }) {
    const imgs = pg.images && pg.images.length ? pg.images : [PGC.c.FALLBACK_IMAGE];
    const many = imgs.length > 1;
    return html`
      <div class="gallery" data-gallery>
        <div class="gallery__stage">
          <div class="gallery__track" data-track tabindex="0" role="group" aria-roledescription="carousel" aria-label="${pg.name} photos">
            ${imgs.map((src, i) => html`
              <button type="button" class="gallery__slide" data-action="open-lightbox" data-index="${i}" aria-label="Open photo ${i + 1} of ${imgs.length}">
                <img src="${src}" alt="${pg.name}, photo ${i + 1} of ${imgs.length}" ${i === 0 ? raw('fetchpriority="high"') : raw('loading="lazy"')} decoding="async" width="1200" height="900">
              </button>`)}
          </div>
          <div class="gallery__scrim gallery__scrim--top"></div>
          <div class="gallery__scrim gallery__scrim--bottom"></div>
          <button type="button" class="circle-btn gallery__back" data-action="back" data-fallback="/" aria-label="Go back" data-testid="pg-back">←</button>
          ${heartMode && html`<button type="button" class="circle-btn gallery__heart" data-action="toggle-save" data-pg-id="${pg.pg_id}" aria-pressed="${saved ? 'true' : 'false'}" aria-label="${saved ? 'Remove' : 'Save'} ${pg.name}" data-testid="pg-save"><span aria-hidden="true">${saved ? '❤️' : '🤍'}</span></button>`}
          ${pg.verified && html`<span class="verified-pill verified-pill--lg">✓ Verified by PGConnect</span>`}
          ${many && html`
            <button type="button" class="gallery__nav gallery__nav--prev" data-gallery-step="-1" aria-label="Previous photo">‹</button>
            <button type="button" class="gallery__nav gallery__nav--next" data-gallery-step="1" aria-label="Next photo">›</button>
            <span class="gallery__counter" data-counter aria-hidden="true">1 / ${imgs.length}</span>`}
        </div>
        ${many && html`
          <div class="gallery__thumbs" role="group" aria-label="Photo thumbnails">
            ${imgs.map((src, i) => html`<button type="button" class="gallery__thumb" data-thumb="${i}" aria-current="${i === 0 ? 'true' : 'false'}" aria-label="Show photo ${i + 1}"><img src="${src}" alt="" loading="lazy" width="120" height="90"></button>`)}
          </div>`}
      </div>`;
  }

  /* ------------------------------ view ------------------------------ */

  PGC.views.pgDetail = async function pgDetail(ctx) {
    const id = ctx.params.id;
    ctx.title('PG details');
    ctx.render(detailSkeleton());

    let pg; let reviews; let savedSet;
    try {
      [pg, reviews, savedSet] = await Promise.all([
        PGC.query.get(['pg', id], () => PGC.api.getPg(id)),
        PGC.query.get(['reviews', id], () => PGC.api.reviews(id)),
        PGC.actions.savedIds(),
      ]);
    } catch (e) {
      if (!ctx.alive()) return;
      ctx.title('PG not found');
      ctx.render(e.status === 404
        ? emptyState({ icon: '🏠', title: 'PG not found', text: 'This listing may have been removed.', action: html`<a class="btn btn--soft" href="#/">Browse PGs</a>` })
        : PGC.c.errorState(e.message));
      const retry = ctx.app.querySelector('[data-action="retry"]');
      if (retry) retry.addEventListener('click', () => PGC.router.resolve());
      return;
    }
    if (!ctx.alive()) return;

    applySeo(pg);
    ctx.onDestroy(resetSeo);

    const isTenant = PGC.auth.isTenant;
    const isOwner = PGC.auth.isOwner;
    const heartMode = isOwner ? null : 'on';
    let saved = savedSet.has(id);
    let ratingChoice = 5;
    const canBook = !isOwner;
    const images = pg.images && pg.images.length ? pg.images : [PGC.c.FALLBACK_IMAGE];

    const bookingCard = canBook && html`
      <aside class="detail__aside" aria-label="Booking">
        <div class="booking-card card card--pad">
          <p class="booking-card__from">Starts at</p>
          <p class="booking-card__price">${formatINR(pg.price_from)}<span>/mo</span></p>
          ${isTenant
            ? html`<h2 class="booking-card__title">Request to book</h2>${bookingForm(pg)}`
            : html`<p class="muted booking-card__note">Log in as a tenant to send a booking request to the owner.</p>
                   <button type="button" class="btn btn--primary btn--lg btn--block" data-action="open-booking" data-testid="book-request-cta">Request to book</button>`}
          <button type="button" class="btn btn--ghost btn--block" data-action="chat-owner" data-testid="chat-owner">💬 Chat with owner</button>
        </div>
      </aside>`;

    ctx.render(html`
      <div class="detail${canBook ? '' : ' detail--solo'}">
        <div class="detail__main">
          ${gallery(pg, { heartMode, saved })}

          <header class="detail__head">
            <div class="detail__titlerow">
              <h1 class="detail__name">${pg.name}</h1>
              ${PGC.sections.compareButton ? PGC.sections.compareButton(pg) : ''}
            </div>
            <p class="detail__loc"><span aria-hidden="true">📍</span> ${pg.locality}, ${pg.city}</p>
            <div class="detail__tags" data-rating-row>${ratingRow(pg)}</div>
          </header>

          ${pg.description && html`<section class="section"><h2 class="section__title">About this PG</h2><p class="section__text">${pg.description}</p></section>`}

          <section class="section"><h2 class="section__title">Rooms available</h2><ul class="rooms">${roomRows(pg)}</ul></section>

          ${PGC.sections.passport ? PGC.sections.passport(pg) : ''}

          ${pg.amenities.length > 0 && html`<section class="section"><h2 class="section__title">Amenities</h2>
            <ul class="amenities">${pg.amenities.map((a) => html`<li class="chip chip--static">${a}</li>`)}</ul></section>`}

          ${PGC.sections.safety(pg)}

          ${pg.rules.length > 0 && html`<section class="section"><h2 class="section__title">House rules</h2>
            <ul class="rules">${pg.rules.map((r) => html`<li>${r}</li>`)}</ul></section>`}

          <section class="section"><h2 class="section__title">Hosted by</h2>
            <div class="host card">
              <span class="avatar avatar--md" aria-hidden="true">${initial(pg.owner.name)}</span>
              <div><p class="host__name">${pg.owner.name}</p><p class="host__sub">Verified owner</p></div>
            </div>
          </section>

          ${PGC.sections.roommateCard ? PGC.sections.roommateCard(pg) : ''}

          <section class="section" aria-label="Reviews">
            <div data-reviews>${reviewsBlock(reviews)}</div>
            ${reviewForm()}
          </section>
        </div>
        ${bookingCard || ''}
      </div>

      ${canBook && html`
        <div class="bottombar">
          <div class="bottombar__price"><span>Starts at</span><strong>${formatINR(pg.price_from)}<small>/mo</small></strong></div>
          <button type="button" class="icon-btn" data-action="chat-owner" aria-label="Chat with owner" data-testid="chat-owner">💬</button>
          <button type="button" class="btn btn--primary btn--lg" data-action="open-booking" data-testid="book-request-cta">Request to book</button>
        </div>`}`);

    if (PGC.sections.bind) PGC.sections.bind(ctx, pg);

    /* ----- gallery behaviour ----- */
    const track = ctx.app.querySelector('[data-track]');
    const counter = ctx.app.querySelector('[data-counter]');
    const thumbs = Array.from(ctx.app.querySelectorAll('[data-thumb]'));
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let index = 0;

    const setIndex = (i) => {
      index = i;
      if (counter) counter.textContent = `${i + 1} / ${images.length}`;
      thumbs.forEach((t, k) => t.setAttribute('aria-current', k === i ? 'true' : 'false'));
    };
    const scrollToIndex = (i) => {
      const n = (i + images.length) % images.length;
      track.scrollTo({ left: n * track.clientWidth, behavior: reduceMotion ? 'auto' : 'smooth' });
      setIndex(n);
    };
    let ticking = false;
    track.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const i = Math.round(track.scrollLeft / Math.max(track.clientWidth, 1));
        if (i !== index && i >= 0 && i < images.length) setIndex(i);
      });
    }, { passive: true, signal: ctx.signal });
    track.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); scrollToIndex(index - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); scrollToIndex(index + 1); }
    }, { signal: ctx.signal });

    ctx.on('click', '[data-gallery-step]', (e, el) => scrollToIndex(index + Number(el.dataset.galleryStep)));
    ctx.on('click', '[data-thumb]', (e, el) => scrollToIndex(Number(el.dataset.thumb)));
    ctx.on('click', '[data-action="open-lightbox"]', (e, el) => PGC.ui.openLightbox(images, Number(el.dataset.index), pg.name));

    /* ----- save ----- */
    ctx.on('click', '[data-action="toggle-save"]', async (e, btn) => {
      if (!isTenant) { PGC.actions.requireLogin('Log in to save PGs'); return; }
      PGC.actions.paintHeart(btn, !saved);
      try {
        const next = await PGC.actions.toggleSave(id, saved);
        if (next !== null) saved = next;
      } catch (err) {
        PGC.actions.paintHeart(btn, saved);
        PGC.ui.toast(err.message, { type: 'error' });
      }
    });

    /* ----- chat ----- */
    ctx.on('click', '[data-action="chat-owner"]', () => {
      if (!PGC.actions.requireLogin('Log in to chat with the owner')) return;
      if (isTenant) ctx.go(`/chat/${encodeURIComponent(id)}?tenant_id=${encodeURIComponent(PGC.auth.user.user_id)}`);
    });

    /* ----- booking ----- */
    const bookingHandler = (closeSheet) => async (e, form) => {
      e.preventDefault();
      const roomType = form.room_type.value;
      const date = form.move_in_date.value;
      const months = Number(form.months.value) || 1;
      if (!isValidISODate(date)) { showError(form, 'Enter move-in date as YYYY-MM-DD'); return; }
      if (date < todayISO()) { showError(form, 'Move-in date cannot be in the past'); return; }

      const btn = form.querySelector('[type="submit"]');
      showError(form, '');
      setLoading(btn, true);
      try {
        await PGC.api.createBooking({
          pg_id: id, room_type: roomType, move_in_date: date, duration_months: months, message: form.message.value.trim(),
        });
        PGC.query.invalidate(['bookings'], ['owner-stats']);
        PGC.ui.toast('Booking request sent to the owner', { type: 'success' });
        if (closeSheet) closeSheet();
        ctx.go('/bookings');
      } catch (err) {
        setLoading(btn, false);
        showError(form, err.message);
      }
    };

    ctx.on('submit', '[data-form="booking"]', bookingHandler(null));

    ctx.on('click', '[data-action="open-booking"]', (e, trigger) => {
      if (!PGC.actions.requireLogin('Log in to request a booking')) return;
      if (!isTenant) return;
      const sheet = PGC.ui.openModal({
        variant: 'sheet',
        label: 'Request to book',
        content: html`
          <div class="sheet">
            <span class="sheet__handle" aria-hidden="true"></span>
            <button type="button" class="sheet__close" data-modal-close aria-label="Close">✕</button>
            <h2 class="sheet__title">Request to book</h2>
            <p class="sheet__sub">${pg.name}</p>
            ${bookingForm(pg)}
          </div>`,
      });
      const handler = bookingHandler(() => sheet.close());
      sheet.el.addEventListener('submit', (ev) => { if (ev.target.matches('[data-form="booking"]')) handler(ev, ev.target); });
      ctx.onDestroy(() => sheet.close());
    });

    /* ----- reviews ----- */
    ctx.on('click', '[data-star]', (e, btn) => {
      ratingChoice = Number(btn.dataset.star);
      ctx.app.querySelector('[data-stars]').innerHTML = starButtons(ratingChoice).map(String).join('');
      ctx.app.querySelector(`[data-star="${ratingChoice}"]`).focus();
    });

    ctx.on('submit', '[data-form="review"]', async (e, form) => {
      e.preventDefault();
      const comment = form.comment.value.trim();
      if (!comment) { showError(form, 'Write a few words about your stay first.'); return; }
      const btn = form.querySelector('[type="submit"]');
      showError(form, '');
      setLoading(btn, true);
      try {
        await PGC.api.addReview(id, ratingChoice, comment);
        PGC.query.invalidate(['reviews', id], ['pg', id], ['pgs']);
        const [fresh, list] = await Promise.all([
          PGC.query.get(['pg', id], () => PGC.api.getPg(id)),
          PGC.query.get(['reviews', id], () => PGC.api.reviews(id)),
        ]);
        if (!ctx.alive()) return;
        pg = fresh;
        ctx.app.querySelector('[data-reviews]').innerHTML = reviewsBlock(list).toString();
        ctx.app.querySelector('[data-rating-row]').innerHTML = ratingRow(fresh).toString();
        form.reset();
        ratingChoice = 5;
        ctx.app.querySelector('[data-stars]').innerHTML = starButtons(5).map(String).join('');
        PGC.ui.toast('Thanks! Your review was posted', { type: 'success' });
      } catch (err) {
        showError(form, err.message);
      } finally {
        if (ctx.alive()) setLoading(btn, false);
      }
    });
  };
})(window.PGC);
