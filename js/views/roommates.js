/**
 * Roommates page (F1): a 6-question routine quiz, compatibility matches, and batch groups. Tenants only.
 * The quiz copy and weights live in PGC.lib.QUIZ (single source). The score comes from the server (roommateScore).
 * No free-text profile fields exist, so there is nothing to moderate.
 */
(function (PGC) {
  'use strict';

  const { html } = PGC.utils;
  const { setLoading, showError, formError, errorState, emptyState, skeletonRows } = PGC.c;
  const lib = PGC.lib;
  PGC.views = PGC.views || {};

  const CITIES = ['Bengaluru', 'Delhi', 'Pune', 'Hyderabad'];
  const INTAKES = ['Summer intern', 'New job', 'College starter', 'Exam aspirant', 'Other'];
  const WHY = { sleep: 'Similar sleep time', tidy: 'Similar tidiness', noise: 'Same noise comfort', study: 'Same study habits', visitors: 'Similar visitors', food: 'Same food habits' };
  const PRIVACY = 'Only your first name, initial and quiz answers are shown to others. Your phone, email and exact location are never shared. You can turn this off or delete your profile at any time.';
  const JOIN_NEEDS_OPTIN = "Turn on 'Show me to others' to join a group.";

  const who = (p) => `${p.first_name}${p.last_initial ? ` ${p.last_initial}.` : ''}`;
  const sampleTag = (is) => (is ? html`<span class="tag tag--sample">Sample profile</span>` : '');

  PGC.views.roommates = async function roommates(ctx) {
    let profile = null;
    let editing = false;
    let notice = '';
    let viewCity = null;
    const cityFromUrl = CITIES.includes(ctx.query.city) ? ctx.query.city : null;

    ctx.title('Find a roommate');
    ctx.render(html`
      <div class="page-head">
        <h1 class="page-title">Find a roommate</h1>
        <p class="page-sub page-sub--aa">Answer 6 quick questions. See how your routines match.</p>
      </div>
      <div data-region="main">${skeletonRows(3)}</div>
      <aside class="privacy-block" data-testid="rm-privacy" aria-label="Privacy"><strong>Your privacy.</strong> ${PRIVACY}</aside>`);
    const main = ctx.app.querySelector('[data-region="main"]');

    try {
      profile = (await PGC.query.get(['roommate', 'profile'], () => PGC.api.roommateProfile())).profile;
    } catch (e) {
      if (ctx.alive()) main.innerHTML = errorState(e.message).toString();
      return;
    }
    if (!ctx.alive()) return;
    viewCity = (profile && profile.city) || cityFromUrl || 'Bengaluru';

    /* ---------------- step 1: the quiz ---------------- */
    function quizHtml() {
      const a = profile ? profile.answers : [];
      return html`
        <form class="rm-quiz" data-form="rm-quiz" novalidate>
          <h2 class="section__title">Step 1. Your routine</h2>
          ${notice && html`<p class="map-note" role="status" data-testid="rm-notice">${notice}</p>`}
          <p class="rm-progress" data-progress aria-live="polite"></p>
          ${lib.QUIZ.map((q, i) => html`
            <fieldset class="rm-q">
              <legend class="rm-q__title">${i + 1}. ${q.q}</legend>
              <div class="rm-q__options">
                ${q.options.map((opt, o) => html`
                  <label class="rm-option">
                    <input type="radio" name="q${i}" value="${o}" ${a[i] === o ? 'checked' : ''} data-testid="rm-q-${i + 1}-opt-${o}">
                    <span class="rm-option__body">${opt}</span>
                  </label>`)}
              </div>
            </fieldset>`)}
          <div class="field-row">
            <label class="field"><span class="field__label">City</span>
              <select class="input" name="city" data-testid="rm-city">
                ${CITIES.map((c) => html`<option value="${c}" ${(profile ? profile.city : cityFromUrl || 'Bengaluru') === c ? 'selected' : ''}>${c}</option>`)}
              </select></label>
            <label class="field"><span class="field__label">I am looking for (optional)</span>
              <select class="input" name="intake" data-testid="rm-intake">
                <option value="">Not stated</option>
                ${INTAKES.map((i) => html`<option value="${i}" ${profile && profile.intake === i ? 'selected' : ''}>${i}</option>`)}
              </select></label>
          </div>
          <label class="switch"><input type="checkbox" role="switch" name="opt_in" ${profile && profile.opt_in ? 'checked' : ''} data-testid="rm-optin">
            <span class="switch__track" aria-hidden="true"></span><span class="switch__label">Show me to others</span></label>
          ${formError()}
          <button type="submit" class="btn btn--primary btn--lg btn--block" data-testid="rm-save">See my matches</button>
        </form>`;
    }

    function updateProgress() {
      const form = ctx.app.querySelector('[data-form="rm-quiz"]');
      if (!form) return;
      const n = lib.QUIZ.filter((_, i) => form.querySelector(`input[name="q${i}"]:checked`)).length;
      form.querySelector('[data-progress]').textContent = `${n} of 6 answered`;
    }

    /* ---------------- step 2: matches and groups ---------------- */
    const matchCard = (m) => html`
      <article class="rm-match card card--pad" data-testid="rm-match-${m.profile_id}">
        <div class="score-ring" style="--p:${m.score}" data-testid="rm-score-${m.profile_id}" role="img" aria-label="${m.score} out of 100"><span>${m.score}</span></div>
        <div class="rm-match__body">
          <h3 class="rm-match__name">${who(m)} ${sampleTag(m.is_sample)}</h3>
          <p class="rm-match__band" data-testid="rm-band-${m.profile_id}">${m.band}</p>
          ${m.intake && html`<p class="rm-match__intake">${m.intake}</p>`}
          ${m.why.length > 0 && html`<p class="rm-why">${m.why.map((k) => html`<span class="chip chip--static">${WHY[k] || k}</span>`)}</p>`}
        </div>
      </article>`;

    const groupCard = (g) => html`
      <article class="group card card--pad" data-testid="group-${g.group_id}">
        <div class="group__body">
          <h3 class="group__name"><button type="button" class="linklike" data-action="group-open" data-id="${g.group_id}">${g.name}</button> ${sampleTag(g.is_sample)}</h3>
          <p class="group__for">${g.for_whom} · ${g.window_label}</p>
          <p class="group__count" data-testid="group-count-${g.group_id}">${g.member_count} of ${g.cap} joined</p>
        </div>
        ${g.joined
          ? html`<button type="button" class="btn btn--ghost" data-action="group-leave" data-id="${g.group_id}" data-testid="group-leave-${g.group_id}">Leave</button>`
          : html`<button type="button" class="btn ${g.full ? 'btn--ghost' : 'btn--primary'}" data-action="group-join" data-id="${g.group_id}" ${g.full ? 'disabled' : ''} data-testid="group-join-${g.group_id}">${g.full ? 'Group is full' : 'Join'}</button>`}
      </article>`;

    async function paintResults() {
      const matchesEl = ctx.app.querySelector('[data-region="matches"]');
      const groupsEl = ctx.app.querySelector('[data-region="groups"]');
      try {
        const [matches, groups] = await Promise.all([
          PGC.query.get(['roommate', 'matches', viewCity], () => PGC.api.roommateMatches(viewCity)),
          PGC.query.get(['batches', viewCity], () => PGC.api.batches(viewCity)),
        ]);
        if (!ctx.alive() || !matchesEl) return;
        matchesEl.innerHTML = (matches.length
          ? html`<div class="rm-grid">${matches.map(matchCard)}</div>`
          : emptyState({ icon: '🤝', title: 'No matches yet', text: 'More people will appear as they join your city.' })).toString();
        groupsEl.innerHTML = (groups.length ? html`<div class="rm-grid">${groups.map(groupCard)}</div>` : emptyState({ icon: '👥', title: 'No groups yet' })).toString();
      } catch (e) {
        if (ctx.alive() && matchesEl) { matchesEl.innerHTML = errorState(e.message).toString(); groupsEl.innerHTML = ''; }
      }
    }

    function resultsHtml() {
      return html`
        <section aria-labelledby="rm-matches-title">
          <div class="page-head page-head--row">
            <h2 class="section__title" id="rm-matches-title">Your matches in ${viewCity}</h2>
            <label class="sort"><span class="sr-only">City</span>
              <select class="input select--sm" data-testid="rm-view-city" data-action="view-city">
                ${CITIES.map((c) => html`<option value="${c}" ${c === viewCity ? 'selected' : ''}>${c}</option>`)}
              </select></label>
          </div>
          ${!profile.opt_in && html`<p class="map-note" role="status" data-testid="rm-hidden-note">Others cannot see you yet. Turn on 'Show me to others' to appear in their list.</p>`}
          <div data-region="matches">${skeletonRows(2)}</div>
        </section>
        <section aria-labelledby="rm-groups-title">
          <h2 class="section__title" id="rm-groups-title">Batch groups in ${viewCity}</h2>
          <div data-region="groups">${skeletonRows(2)}</div>
        </section>
        <div class="rm-actions">
          <button type="button" class="btn btn--outline" data-action="retake" data-testid="rm-retake">Retake the quiz</button>
          ${profile.opt_in
            ? html`<button type="button" class="btn btn--ghost" data-action="switch-off" data-testid="rm-switch-off">Switch off matching</button>`
            : html`<button type="button" class="btn btn--soft" data-action="switch-on" data-testid="rm-switch-on">Turn on matching</button>`}
          <button type="button" class="btn btn--ghost btn--danger-text" data-action="delete-profile" data-testid="rm-delete">Delete my roommate profile</button>
        </div>`;
    }

    function paint() {
      if (!profile || editing) { main.innerHTML = quizHtml().toString(); updateProgress(); return; }
      main.innerHTML = resultsHtml().toString();
      paintResults();
    }
    const invalidate = () => PGC.query.invalidate(['roommate'], ['batches']);
    const profilePayload = (over = {}) => ({ answers: profile.answers, city: profile.city, intake: profile.intake, opt_in: profile.opt_in, ...over });

    /* ---------------- events ---------------- */
    ctx.on('change', '[data-form="rm-quiz"] input[type="radio"]', updateProgress);

    ctx.on('submit', '[data-form="rm-quiz"]', async (e, form) => {
      e.preventDefault();
      const answers = lib.QUIZ.map((_, i) => { const el = form.querySelector(`input[name="q${i}"]:checked`); return el ? Number(el.value) : null; });
      if (!lib.validAnswers(answers)) { showError(form, 'Answer all 6 questions'); return; }
      const btn = form.querySelector('[type="submit"]');
      showError(form, '');
      setLoading(btn, true);
      try {
        const saved = await PGC.api.saveRoommate({ answers, city: form.city.value, intake: form.intake.value, opt_in: form.opt_in.checked });
        invalidate();
        profile = saved; viewCity = saved.city; editing = false; notice = '';
        PGC.ui.toast(saved.opt_in ? 'Saved. Others in your city can now see you.' : 'Saved. You are hidden from others.', { type: 'success' });
        paint();
      } catch (err) {
        if (ctx.alive()) { setLoading(btn, false); showError(form, err.message); }
      }
    });

    ctx.on('change', '[data-action="view-city"]', (e, sel) => { viewCity = sel.value; paint(); });
    ctx.on('click', '[data-action="retake"]', () => { editing = true; notice = ''; paint(); window.scrollTo(0, 0); });

    const setOptIn = async (on) => {
      try {
        profile = await PGC.api.saveRoommate(profilePayload({ opt_in: on }));
        invalidate();
        PGC.ui.toast(on ? 'Matching is on' : 'Matching is off. You are hidden from others.', { type: 'success' });
        paint();
      } catch (err) { PGC.ui.toast(err.message, { type: 'error' }); }
    };
    ctx.on('click', '[data-action="switch-off"]', () => setOptIn(false));
    ctx.on('click', '[data-action="switch-on"]', () => setOptIn(true));

    ctx.on('click', '[data-action="delete-profile"]', async () => {
      const ok = await PGC.ui.confirmDialog({
        title: 'Delete your roommate profile?', message: 'This removes your answers, takes you out of every group and hides you from matches. You can take the quiz again any time.',
        confirmLabel: 'Delete profile', danger: true,
      });
      if (!ok) return;
      try {
        await PGC.api.deleteRoommate();
        invalidate();
        profile = null; editing = false; notice = '';
        PGC.ui.toast('Roommate profile deleted', { type: 'success' });
        paint();
      } catch (err) { PGC.ui.toast(err.message, { type: 'error' }); }
    });

    ctx.on('click', '[data-action="group-join"]', async (e, btn) => {
      if (!profile || !profile.opt_in) { editing = true; notice = JOIN_NEEDS_OPTIN; paint(); window.scrollTo(0, 0); return; }
      btn.disabled = true;
      try {
        await PGC.api.joinBatch(btn.dataset.id);
        invalidate();
        PGC.ui.toast('You joined the group', { type: 'success' });
      } catch (err) { PGC.ui.toast(err.message, { type: 'error' }); invalidate(); }
      paintResults();
    });
    ctx.on('click', '[data-action="group-leave"]', async (e, btn) => {
      btn.disabled = true;
      try { await PGC.api.leaveBatch(btn.dataset.id); invalidate(); PGC.ui.toast('You left the group'); } catch (err) { PGC.ui.toast(err.message, { type: 'error' }); }
      paintResults();
    });

    ctx.on('click', '[data-action="group-open"]', async (e, btn) => {
      try {
        const g = await PGC.api.batch(btn.dataset.id);
        const modal = PGC.ui.openModal({
          variant: 'drawer', label: `${g.name} members`,
          content: html`
            <div class="drawer" data-testid="group-drawer">
              <button type="button" class="sheet__close" data-modal-close aria-label="Close">✕</button>
              <h2 class="dialog__title">${g.name}</h2>
              <p class="muted">${g.for_whom} · ${g.window_label}</p>
              <p class="group__count">${g.member_count} of ${g.cap} joined</p>
              <ul class="drawer__list">
                ${g.members.map((m) => html`<li><span>${who(m)} ${sampleTag(m.is_sample)}${m.is_me && html` <span class="tag">You</span>`}</span>${m.score != null && html`<strong>${m.score}% match</strong>`}</li>`)}
                ${g.members.length === 0 && html`<li class="muted">No members yet</li>`}
              </ul>
            </div>`,
        });
        ctx.onDestroy(() => modal.close());
      } catch (err) { PGC.ui.toast(err.message, { type: 'error' }); }
    });

    paint();
  };
})(window.PGC);
