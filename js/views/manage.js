/**
 * Owner PG manager (F3): /owner/manage. The owner's own register for one PG: tenants, rent, complaints, KYC and agreements.
 * It does not move money, and its numbers are separate from (and labelled differently to) the dashboard stats.
 * React-Query-style keys all start with ["manage", pgId, ...], so no existing key is touched.
 */
(function (PGC) {
  'use strict';

  const { html, formatINR, capitalize } = PGC.utils;
  const { setLoading, showError, formError, errorState, emptyState, skeletonRows, skeletonStats } = PGC.c;
  const lib = PGC.lib;
  PGC.views = PGC.views || {};

  const TABS = [['tenants', 'Tenants'], ['rent', 'Rent'], ['complaints', 'Complaints'], ['kyc', 'KYC & agreements']];
  const MODES = ['Cash', 'UPI', 'Bank transfer', 'Other'];
  const CATEGORIES = ['Water', 'Electricity', 'Cleaning', 'Wi-Fi', 'Food', 'Noise', 'Safety', 'Other'];
  const STATUS_LABEL = { open: 'Open', in_progress: 'In progress', resolved: 'Resolved' };
  const ID_TYPES = ['Aadhaar', 'Passport', 'Driving licence', 'Voter ID', 'College or work ID'];
  const KYC_NOTE = 'PGConnect stores only the type of ID you saw and the date. Do not enter ID numbers here.';
  const AGREEMENT_NOTE = "This is a simple record of the terms you both agreed. It is not a stamped or registered agreement and is not legal advice. Check your state's rules on stamp duty and registration.";
  const DASHBOARD_NOTE = "These figures come from your PG manager records. The dashboard's 'Rent collected' counts in-app mock payments.";

  const fmtDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const monthLabel = (iso) => new Date(`${iso.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const rentPill = (s) => html`<span class="rs rs--${s}">${capitalize(s)}</span>`;

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (__) { ok = false; }
      ta.remove(); return ok;
    }
  }

  /** The reminder text copied to the clipboard. Nothing is sent by the app. */
  const reminderText = (row, pgName) => `Hi ${row.tenant_name.split(/\s+/)[0]}, a gentle reminder that rent of ${formatINR(row.amount)} for ${monthLabel(row.due_date)} at ${pgName} was due on ${fmtDate(row.due_date)}. Please let me know once it is paid. Thank you.`;

  /** A small dialog with a form. `onSubmit(form)` returns a promise; the dialog closes when it resolves. */
  function formDialog({ title, body, submitLabel, onSubmit }) {
    const modal = PGC.ui.openModal({
      variant: 'dialog', label: title,
      content: html`
        <form class="dialog form" novalidate>
          <h2 class="dialog__title">${title}</h2>
          ${body}
          ${formError()}
          <div class="dialog__actions">
            <button type="button" class="btn btn--ghost" data-modal-close>Cancel</button>
            <button type="submit" class="btn btn--primary" data-testid="dialog-submit">${submitLabel}</button>
          </div>
        </form>`,
    });
    const form = modal.el.querySelector('form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('[type="submit"]');
      showError(form, '');
      setLoading(btn, true);
      try { await onSubmit(form); modal.close(); } catch (err) { setLoading(btn, false); showError(form, err.message); }
    });
    return modal;
  }

  PGC.views.manage = async function manage(ctx) {
    const state = { pgId: ctx.query.pg || '', tab: TABS.some(([k]) => k === ctx.query.tab) ? ctx.query.tab : 'tenants', month: /^\d{4}-\d{2}$/.test(ctx.query.month || '') ? ctx.query.month : lib.todayIST().slice(0, 7), cstatus: '' };
    let pgs = [];
    const api = PGC.api.manage;
    const key = (...p) => ['manage', state.pgId, ...p];
    const pgOf = () => pgs.find((p) => p.pg_id === state.pgId);
    const invalidate = () => PGC.query.invalidate(['manage', state.pgId]);
    const syncUrl = () => ctx.setQuery({ pg: state.pgId, tab: state.tab === 'tenants' ? '' : state.tab, month: state.month === lib.todayIST().slice(0, 7) ? '' : state.month });

    ctx.title('PG manager');
    ctx.render(html`
      <div class="page-head page-head--row">
        <div><h1 class="page-title">PG manager</h1><p class="page-sub page-sub--aa">Your own record of tenants, rent, complaints and paperwork.</p></div>
        <label class="sort"><span class="sr-only">Choose a PG</span><select class="input select--sm" data-action="pick-pg" data-testid="mg-pg-select"></select></label>
      </div>
      <div data-region="cards">${skeletonStats()}</div>
      <p class="fineprint mg-note">${DASHBOARD_NOTE}</p>
      <div class="mg-tabs" role="tablist" aria-label="PG manager sections">
        ${TABS.map(([k, label]) => html`<button type="button" role="tab" class="mg-tab" data-tab="${k}" data-testid="mg-tab-${k}" aria-selected="false">${label}</button>`)}
      </div>
      <div data-region="tab" role="tabpanel">${skeletonRows(3)}</div>`);
    const $cards = ctx.app.querySelector('[data-region="cards"]');
    const $tab = ctx.app.querySelector('[data-region="tab"]');
    const $select = ctx.app.querySelector('[data-testid="mg-pg-select"]');

    try {
      pgs = await PGC.query.get(['owner-listings'], () => PGC.api.ownerPgs());
    } catch (e) { ctx.render(errorState(e.message)); return; }
    if (!ctx.alive()) return;
    if (!pgs.length) {
      ctx.render(emptyState({ icon: '🏠', title: 'No listings yet', text: 'Add a PG first, then manage its tenants here.', action: html`<a class="btn btn--primary" href="#/owner/listings/new">+ Add a new PG</a>` }));
      return;
    }
    if (!pgOf()) state.pgId = pgs[0].pg_id;
    $select.innerHTML = pgs.map((p) => html`<option value="${p.pg_id}" ${p.pg_id === state.pgId ? 'selected' : ''}>${p.name}</option>`).map(String).join('');

    /* ---------------- header cards ---------------- */
    async function paintCards() {
      try {
        const o = await PGC.query.get(key('overview', state.month), () => api(`/${state.pgId}/overview`, { query: { month: state.month } }));
        if (!ctx.alive()) return;
        const card = (id, icon, label, value, sub) => html`<div class="card card--pad stat" data-testid="mg-card-${id}"><span class="stat__icon" aria-hidden="true">${icon}</span><p class="stat__value">${value}</p><p class="stat__label">${label}</p><p class="stat__sub">${sub}</p></div>`;
        const pct = o.rent_roll ? Math.round((o.collected / o.rent_roll) * 100) : 0;
        $cards.innerHTML = html`<div class="stat-grid">
          ${card('occupancy', '🛏️', 'Occupancy', `${o.occupied} of ${o.total_beds} beds`, `${o.occupancy_pct}% occupied`)}
          ${card('due', '🧾', 'Rent due this month', formatINR(o.due), `${o.due_count} ${o.due_count === 1 ? 'tenant' : 'tenants'}`)}
          ${card('collected', '💰', 'Collected this month', formatINR(o.collected), `${pct}% of the rent roll`)}
          ${card('complaints', '🛠️', 'Open complaints', String(o.open_complaints), o.open_complaints ? 'Needs attention' : 'All clear')}
        </div>`.toString();
      } catch (e) { $cards.innerHTML = errorState(e.message).toString(); }
    }

    /* ---------------- tenants tab ---------------- */
    const roomOptions = () => (pgOf().room_types || []).map((r) => r.type);
    function addTenantDialog() {
      const types = roomOptions();
      const priceOf = (t) => ((pgOf().room_types || []).find((r) => r.type === t) || {}).price || '';
      const modal = formDialog({
        title: 'Add tenant', submitLabel: 'Save tenant',
        body: html`
          <label class="field"><span class="field__label">Name</span><input class="input" name="tenant_name" maxlength="60" data-testid="mg-t-name" required></label>
          <label class="field"><span class="field__label">Phone (optional, 10 digits)</span><input class="input" name="phone" inputmode="numeric" maxlength="10" data-testid="mg-t-phone"></label>
          <div class="field-row">
            <label class="field"><span class="field__label">Room label</span><input class="input" name="room_label" maxlength="12" placeholder="R204-A" data-testid="mg-t-room"></label>
            <label class="field"><span class="field__label">Sharing type</span><select class="input" name="room_type" data-testid="mg-t-type">${['single', 'double', 'triple'].map((t) => html`<option value="${t}" ${t === types[0] ? 'selected' : ''}>${capitalize(t)}</option>`)}</select></label>
          </div>
          <div class="field-row">
            <label class="field"><span class="field__label">Monthly rent (₹)</span><input class="input" name="monthly_rent" type="number" min="1" max="100000" value="${priceOf(types[0])}" data-testid="mg-t-rent"></label>
            <label class="field"><span class="field__label">Deposit paid (₹, optional)</span><input class="input" name="deposit_paid" type="number" min="0" max="100000" data-testid="mg-t-deposit"></label>
          </div>
          <div class="field-row">
            <label class="field"><span class="field__label">Move-in date</span><input class="input" name="move_in" type="date" value="${lib.todayIST()}" data-testid="mg-t-movein"></label>
            <label class="field"><span class="field__label">Stay length (months)</span><input class="input" name="stay_months" type="number" min="1" max="24" value="11" data-testid="mg-t-months"></label>
          </div>
          <label class="switch"><input type="checkbox" role="switch" name="adjust" checked data-testid="mg-t-adjust"><span class="switch__track" aria-hidden="true"></span><span class="switch__label">Update available beds</span></label>`,
        onSubmit: async (form) => {
          await api(`/${state.pgId}/tenancies`, { method: 'POST', body: {
            tenant_name: form.tenant_name.value, phone: form.phone.value, room_label: form.room_label.value, room_type: form.room_type.value,
            monthly_rent: form.monthly_rent.value, deposit_paid: form.deposit_paid.value, move_in: form.move_in.value, stay_months: form.stay_months.value, adjust_availability: form.adjust.checked,
          } });
          invalidate(); PGC.query.invalidate(['owner-listings'], ['pg', state.pgId], ['pgs']);
          PGC.ui.toast('Tenant added', { type: 'success' });
          paintAll();
        },
      });
      modal.el.querySelector('[name="room_type"]').addEventListener('change', (e) => { modal.el.querySelector('[name="monthly_rent"]').value = priceOf(e.target.value); });
    }

    async function tenantsTab() {
      const [list, o] = await Promise.all([
        PGC.query.get(key('tenancies'), () => api(`/${state.pgId}/tenancies`)),
        PGC.query.get(key('overview', state.month), () => api(`/${state.pgId}/overview`, { query: { month: state.month } })),
      ]);
      const vacant = Math.max(0, o.total_beds - list.length);
      const kycPill = (s) => (s === 'verified' ? html`<span class="mg-chip mg-chip--ok">KYC done</span>` : html`<span class="mg-chip">KYC pending</span>`);
      const agrPill = (s) => (s === 'signed' ? html`<span class="mg-chip mg-chip--ok">Agreement signed</span>` : html`<span class="mg-chip">Agreement pending</span>`);
      return html`
        <div class="mg-bar"><h2 class="section__title">Tenants</h2><button type="button" class="btn btn--primary" data-action="add-tenant" data-testid="mg-add-tenant">+ Add tenant</button></div>
        ${!list.length && emptyState({ icon: '🛏️', title: 'No tenants added yet', text: 'Add your first tenant to start tracking rent.' })}
        <div class="rm-grid">
          ${list.map((t) => html`
            <article class="card card--pad mg-tenant" data-testid="mg-tenant-${t.tenancy_id}">
              <div class="mg-tenant__top"><div><h3 class="mg-tenant__name">${t.tenant_name} ${t.is_sample && html`<span class="tag tag--sample">Sample</span>`}</h3>
                <p class="muted">${t.room_label} · ${capitalize(t.room_type)} · ${formatINR(t.monthly_rent)}/mo</p>
                <p class="muted">Moved in ${fmtDate(t.move_in)}${t.phone_masked ? ` · ${t.phone_masked}` : ''}</p></div>
                ${t.rent_status && rentPill(t.rent_status)}</div>
              <p class="mg-chips">${kycPill(t.kyc_status)}${agrPill(t.agreement_status)}</p>
              <button type="button" class="btn btn--ghost btn--sm btn--danger-text" data-action="end-tenancy" data-id="${t.tenancy_id}" data-name="${t.tenant_name}" data-testid="mg-end-${t.tenancy_id}">End tenancy</button>
            </article>`)}
          ${Array.from({ length: Math.min(vacant, 12) }, (_, i) => html`<div class="mg-vacant" data-testid="mg-vacant-${i + 1}"><span>Vacant bed</span></div>`)}
        </div>
        ${vacant > 12 && html`<p class="muted">and ${vacant - 12} more vacant beds</p>`}`;
    }

    /* ---------------- rent tab ---------------- */
    async function rentTab() {
      const rows = await PGC.query.get(key('rent', state.month), () => api(`/${state.pgId}/rent`, { query: { month: state.month } }));
      const sum = (pred) => rows.filter(pred).reduce((n, r) => n + r.amount, 0);
      return html`
        <div class="mg-bar"><h2 class="section__title">Rent for ${monthLabel(state.month)}</h2>
          <label class="field mg-month"><span class="sr-only">Month</span><input class="input input--sm" type="month" value="${state.month}" data-action="pick-month" data-testid="mg-month"></label></div>
        ${!rows.length ? emptyState({ icon: '🧾', title: 'No rent due this month', text: 'Rent rows are created when you add a tenant.' }) : html`
          <div class="mg-totals" data-testid="mg-totals"><span>Collected <strong>${formatINR(sum((r) => r.status === 'paid'))}</strong></span><span>Due <strong>${formatINR(sum((r) => r.status === 'due' || r.status === 'upcoming'))}</strong></span><span>Overdue <strong>${formatINR(sum((r) => r.status === 'overdue'))}</strong></span></div>
          <div class="stack">
            ${rows.map((r) => html`
              <article class="card card--pad mg-rent" data-testid="mg-rent-${r.rent_id}">
                <div class="mg-rent__main"><strong>${r.tenant_name}</strong><span class="muted">${r.room_label} · due ${fmtDate(r.due_date)}${r.paid_at ? ` · paid ${fmtDate(r.paid_at)} (${r.mode})` : ''}${r.waived && r.note ? ` · ${r.note}` : ''}</span></div>
                <strong>${formatINR(r.amount)}</strong>${rentPill(r.status)}
                <div class="mg-rent__actions">
                  ${r.status !== 'paid' && r.status !== 'waived' && html`
                    <button type="button" class="btn btn--primary btn--sm" data-action="mark-paid" data-id="${r.rent_id}" data-testid="mg-paid-${r.rent_id}">Mark paid</button>
                    <button type="button" class="btn btn--ghost btn--sm" data-action="waive" data-id="${r.rent_id}" data-testid="mg-waive-${r.rent_id}">Waive</button>
                    <button type="button" class="btn btn--ghost btn--sm" data-action="remind" data-id="${r.rent_id}" data-testid="mg-remind-${r.rent_id}">Copy reminder</button>`}
                  ${(r.status === 'paid' || r.status === 'waived') && html`<button type="button" class="btn btn--ghost btn--sm" data-action="undo" data-id="${r.rent_id}" data-testid="mg-undo-${r.rent_id}">Undo</button>`}
                </div>
              </article>`)}
          </div>`}`;
    }

    /* ---------------- complaints tab ---------------- */
    async function complaintsTab() {
      const [list, tenants] = await Promise.all([
        PGC.query.get(key('complaints', state.cstatus), () => api(`/${state.pgId}/complaints`, { query: { status: state.cstatus || undefined } })),
        PGC.query.get(key('tenancies'), () => api(`/${state.pgId}/tenancies`)),
      ]);
      ctx.__tenants = tenants;
      return html`
        <div class="mg-bar"><h2 class="section__title">Complaints</h2><button type="button" class="btn btn--primary" data-action="add-complaint" data-testid="mg-c-add">+ Add complaint</button></div>
        <div class="chip-row chip-row--wrap" role="group" aria-label="Filter complaints">
          ${[['', 'All'], ['open', 'Open'], ['in_progress', 'In progress'], ['resolved', 'Resolved']].map(([v, label]) => PGC.c.chip(label, { active: state.cstatus === v, 'data-cstatus': v, 'data-testid': `mg-cfilter-${v || 'all'}` }))}
        </div>
        ${!list.length ? emptyState({ icon: '🛠️', title: 'No complaints', text: 'Problems you log will show up here.' }) : html`
          <div class="stack mg-list">
            ${list.map((c) => html`
              <article class="card card--pad mg-complaint${c.pinned ? ' is-pinned' : ''}" data-testid="mg-complaint-${c.complaint_id}">
                <div class="mg-rent__main"><strong>${c.title} ${c.is_sample && html`<span class="tag tag--sample">Sample</span>`}</strong>
                  <span class="muted">${c.category} · ${c.priority} priority${c.tenant_name ? ` · ${c.tenant_name}` : ''} · ${fmtDate(c.created_at.slice(0, 10))}</span></div>
                ${c.pinned && html`<p class="mg-urgent">Act on this first.</p>`}
                ${c.details && html`<p>${c.details}</p>`}
                ${c.status === 'resolved' && c.resolved_at && html`<p class="muted" data-testid="mg-resolved-${c.complaint_id}">Resolved on ${fmtDate(c.resolved_at.slice(0, 10))}</p>`}
                <div class="mg-complaint__edit">
                  <label class="field"><span class="field__label">Status</span>
                    <select class="input input--sm" data-action="c-status" data-id="${c.complaint_id}" data-testid="mg-c-status-${c.complaint_id}">
                      ${Object.entries(STATUS_LABEL).map(([v, label]) => html`<option value="${v}" ${c.status === v ? 'selected' : ''}>${label}</option>`)}</select></label>
                  <label class="field mg-note-field"><span class="field__label">Owner note</span>
                    <input class="input input--sm" maxlength="300" value="${c.owner_note || ''}" data-action="c-note" data-id="${c.complaint_id}" data-testid="mg-c-note-${c.complaint_id}" placeholder="Add a note and press Enter"></label>
                </div>
              </article>`)}
          </div>`}`;
    }

    function addComplaintDialog() {
      formDialog({
        title: 'Add complaint', submitLabel: 'Save complaint',
        body: html`
          <div class="field-row">
            <label class="field"><span class="field__label">Category</span><select class="input" name="category" data-testid="mg-c-category">${CATEGORIES.map((c) => html`<option value="${c}">${c}</option>`)}</select></label>
            <label class="field"><span class="field__label">Priority</span><select class="input" name="priority" data-testid="mg-c-priority"><option>Normal</option><option>High</option></select></label>
          </div>
          <label class="field"><span class="field__label">Title</span><input class="input" name="title" maxlength="80" data-testid="mg-c-title"></label>
          <label class="field"><span class="field__label">Details</span><textarea class="input input--area" name="details" maxlength="500" rows="3" data-testid="mg-c-details"></textarea></label>
          <label class="field"><span class="field__label">Tenant (optional)</span><select class="input" name="tenancy_id" data-testid="mg-c-tenant"><option value="">The PG in general</option>${(ctx.__tenants || []).map((t) => html`<option value="${t.tenancy_id}">${t.tenant_name} (${t.room_label})</option>`)}</select></label>`,
        onSubmit: async (form) => {
          await api(`/${state.pgId}/complaints`, { method: 'POST', body: { category: form.category.value, priority: form.priority.value, title: form.elements.namedItem('title').value, details: form.details.value, tenancy_id: form.tenancy_id.value || undefined } });
          invalidate(); PGC.ui.toast('Complaint added', { type: 'success' }); paintAll();
        },
      });
    }

    /* ---------------- KYC and agreements tab ---------------- */
    async function kycTab() {
      const list = await PGC.query.get(key('tenancies'), () => api(`/${state.pgId}/tenancies`));
      return html`
        <h2 class="section__title">KYC &amp; agreements</h2>
        <p class="map-note">${KYC_NOTE}</p>
        ${!list.length ? emptyState({ icon: '🪪', title: 'No tenants added yet', text: 'Add your first tenant to start tracking rent.' }) : html`
          <div class="stack">
            ${list.map((t) => html`
              <article class="card card--pad mg-kyc" data-testid="mg-kyc-${t.tenancy_id}">
                <div class="mg-tenant__top"><div><h3 class="mg-tenant__name">${t.tenant_name}</h3><p class="muted">${t.room_label} · Agreement: ${capitalize(t.agreement_status === 'none' ? 'not started' : t.agreement_status)}</p></div></div>
                <form class="mg-kycform" data-form="kyc" data-id="${t.tenancy_id}" novalidate>
                  <label class="field"><span class="field__label">ID type seen</span>
                    <select class="input input--sm" name="id_type">${ID_TYPES.map((i) => html`<option ${t.kyc && t.kyc.id_type === i ? 'selected' : ''}>${i}</option>`)}</select></label>
                  <label class="field"><span class="field__label">Status</span>
                    <select class="input input--sm" name="status">${['pending', 'verified', 'rejected'].map((s) => html`<option value="${s}" ${(t.kyc ? t.kyc.status : 'pending') === s ? 'selected' : ''}>${capitalize(s)}</option>`)}</select></label>
                  <label class="switch"><input type="checkbox" role="switch" name="original_seen" ${t.kyc && t.kyc.original_seen ? 'checked' : ''}><span class="switch__track" aria-hidden="true"></span><span class="switch__label">I have seen the original ID</span></label>
                  <button type="submit" class="btn btn--ghost btn--sm" data-testid="mg-kyc-save-${t.tenancy_id}">Save KYC</button>
                  ${t.kyc && t.kyc.checked_at && html`<span class="muted">Checked ${fmtDate(t.kyc.checked_at)}</span>`}
                  <p class="form-error" role="alert" data-error hidden></p>
                </form>
                <div class="mg-agr">
                  <button type="button" class="btn btn--outline btn--sm" data-action="agr-preview" data-id="${t.tenancy_id}" data-testid="mg-agr-preview-${t.tenancy_id}">Preview agreement</button>
                  <button type="button" class="btn btn--ghost btn--sm" data-action="agr-share" data-id="${t.tenancy_id}" data-testid="mg-agr-share-${t.tenancy_id}">Mark as shared</button>
                  <button type="button" class="btn btn--soft btn--sm" data-action="agr-sign" data-id="${t.tenancy_id}" data-name="${t.tenant_name}" data-testid="mg-agr-sign-${t.tenancy_id}">Mark as signed</button>
                </div>
              </article>`)}
          </div>
          <p class="fineprint">${AGREEMENT_NOTE}</p>`}`;
    }

    /** Printable agreement: shown in a dialog; Print copies it into #print-root so only the agreement is printed. */
    async function previewAgreement(id) {
      const { agreement: a } = await api(`/tenancies/${id}/agreement`);
      const t = a.terms;
      const money = (n) => (n == null ? 'Not stated' : formatINR(n));
      const doc = html`
        <article class="agreement" data-testid="agreement-doc">
          <h2>Rental agreement (version ${a.version})</h2>
          <p class="agreement__status">Status: <strong>${capitalize(a.status)}</strong></p>
          <dl class="agreement__grid">
            <div><dt>Owner</dt><dd>${t.owner_name}</dd></div><div><dt>Tenant</dt><dd>${t.tenant_name}</dd></div>
            <div><dt>PG</dt><dd>${t.pg_name}</dd></div><div><dt>Address</dt><dd>${t.pg_address}</dd></div>
            <div><dt>Room</dt><dd>${t.room_label} (${capitalize(t.room_type)})</dd></div><div><dt>Monthly rent</dt><dd>${money(t.monthly_rent)}</dd></div>
            <div><dt>Rent due</dt><dd>${t.rent_due}</dd></div><div><dt>Deposit paid</dt><dd>${money(t.deposit_paid)}</dd></div>
            <div><dt>Notice period</dt><dd>${t.notice_days == null ? 'Not stated' : `${t.notice_days} days`}</dd></div><div><dt>Lock-in</dt><dd>${t.lock_in_months == null ? 'Not stated' : t.lock_in_months === 0 ? 'None' : `${t.lock_in_months} months`}</dd></div>
            <div><dt>Exit fee</dt><dd>${t.exit_fee == null ? 'Not stated' : t.exit_fee === 0 ? 'None' : money(t.exit_fee)}</dd></div><div><dt>Stay</dt><dd>${fmtDate(t.move_in)} to ${fmtDate(t.end_date)}</dd></div>
          </dl>
          ${t.house_rules.length > 0 && html`<h3>House rules</h3><ul>${t.house_rules.map((r) => html`<li>${r}</li>`)}</ul>`}
          ${a.status === 'signed' && html`<p class="agreement__signed" data-testid="agreement-signed">Signed by ${a.signed_name} on ${new Date(a.signed_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })} (terms version ${a.version}).</p>`}
          <p class="fineprint">${AGREEMENT_NOTE}</p>
        </article>`;
      const modal = PGC.ui.openModal({
        variant: 'dialog', label: 'Rental agreement preview',
        content: html`<div class="dialog dialog--wide">${doc}<div class="dialog__actions no-print"><button type="button" class="btn btn--ghost" data-modal-close>Close</button><button type="button" class="btn btn--primary" data-print data-testid="agreement-print">Print or save as PDF</button></div></div>`,
      });
      modal.el.querySelector('[data-print]').addEventListener('click', () => {
        let root = document.getElementById('print-root');
        if (!root) { root = document.createElement('div'); root.id = 'print-root'; document.body.appendChild(root); }
        root.innerHTML = doc.toString();
        window.print();
      });
    }

    /* ---------------- paint ---------------- */
    const renderers = { tenants: tenantsTab, rent: rentTab, complaints: complaintsTab, kyc: kycTab };
    let paintId = 0;
    async function paintTab() {
      const id = ++paintId;
      ctx.app.querySelectorAll('.mg-tab').forEach((b) => { const on = b.dataset.tab === state.tab; b.setAttribute('aria-selected', String(on)); b.classList.toggle('is-active', on); });
      try {
        const markup = await renderers[state.tab]();
        if (ctx.alive() && id === paintId) $tab.innerHTML = markup.toString();
      } catch (e) { if (ctx.alive() && id === paintId) $tab.innerHTML = errorState(e.message).toString(); }
    }
    const paintAll = () => { paintCards(); paintTab(); };

    /* ---------------- events ---------------- */
    ctx.on('change', '[data-action="pick-pg"]', (e, el) => { state.pgId = el.value; syncUrl(); paintAll(); });
    ctx.on('click', '.mg-tab', (e, b) => { state.tab = b.dataset.tab; syncUrl(); paintTab(); });
    ctx.on('change', '[data-action="pick-month"]', (e, el) => { if (/^\d{4}-\d{2}$/.test(el.value)) { state.month = el.value; syncUrl(); paintAll(); } });
    ctx.on('click', '[data-cstatus]', (e, el) => { state.cstatus = el.dataset.cstatus; paintTab(); });
    ctx.on('click', '[data-action="add-tenant"]', addTenantDialog);
    ctx.on('click', '[data-action="add-complaint"]', addComplaintDialog);

    ctx.on('click', '[data-action="end-tenancy"]', async (e, btn) => {
      const ok = await PGC.ui.confirmDialog({ title: `End ${btn.dataset.name}'s tenancy?`, message: 'The history stays. Future unpaid rent rows are removed, and the bed is released if you counted it when adding the tenant.', confirmLabel: 'End tenancy', danger: true });
      if (!ok) return;
      try { await api(`/tenancies/${btn.dataset.id}/end`, { method: 'POST' }); invalidate(); PGC.query.invalidate(['owner-listings'], ['pg', state.pgId], ['pgs']); PGC.ui.toast('Tenancy ended', { type: 'success' }); paintAll(); }
      catch (err) { PGC.ui.toast(err.message, { type: 'error' }); }
    });

    const rentAction = (id, path, body) => api(`/rent/${id}/${path}`, { method: 'POST', body }).then(() => { invalidate(); paintAll(); });
    ctx.on('click', '[data-action="mark-paid"]', (e, btn) => {
      formDialog({
        title: 'Mark rent as paid', submitLabel: 'Mark paid',
        body: html`<label class="field"><span class="field__label">Paid on</span><input class="input" type="date" name="paid_at" max="${lib.todayIST()}" value="${lib.todayIST()}" data-testid="mg-paid-date"></label>
          <label class="field"><span class="field__label">How was it paid?</span><select class="input" name="mode" data-testid="mg-paid-mode">${MODES.map((m) => html`<option>${m}</option>`)}</select></label>`,
        onSubmit: (form) => rentAction(btn.dataset.id, 'paid', { paid_at: form.paid_at.value, mode: form.mode.value }),
      });
    });
    ctx.on('click', '[data-action="waive"]', (e, btn) => {
      formDialog({
        title: 'Waive this rent', submitLabel: 'Waive',
        body: html`<label class="field"><span class="field__label">Short note (optional)</span><input class="input" name="note" maxlength="200" data-testid="mg-waive-note"></label>`,
        onSubmit: (form) => rentAction(btn.dataset.id, 'waive', { note: form.note.value }),
      });
    });
    ctx.on('click', '[data-action="undo"]', async (e, btn) => { try { await rentAction(btn.dataset.id, 'undo', {}); } catch (err) { PGC.ui.toast(err.message, { type: 'error' }); } });
    ctx.on('click', '[data-action="remind"]', async (e, btn) => {
      try {
        const rows = await PGC.query.get(key('rent', state.month), () => api(`/${state.pgId}/rent`, { query: { month: state.month } }));
        const row = rows.find((r) => r.rent_id === btn.dataset.id);
        const ok = await copyText(reminderText(row, pgOf().name));
        PGC.ui.toast(ok ? 'Reminder copied. Paste it into your chat or message app.' : 'Could not copy. Select and copy the text manually.', { type: ok ? 'success' : 'error' });
      } catch (err) { PGC.ui.toast(err.message, { type: 'error' }); }
    });

    ctx.on('change', '[data-action="c-status"]', async (e, el) => {
      try { await api(`/complaints/${el.dataset.id}`, { method: 'PATCH', body: { status: el.value } }); invalidate(); paintAll(); }
      catch (err) { PGC.ui.toast(err.message, { type: 'error' }); }
    });
    ctx.on('keydown', '[data-action="c-note"]', async (e, el) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      try { await api(`/complaints/${el.dataset.id}`, { method: 'PATCH', body: { owner_note: el.value } }); invalidate(); PGC.ui.toast('Note saved', { type: 'success' }); }
      catch (err) { PGC.ui.toast(err.message, { type: 'error' }); }
    });

    ctx.on('submit', '[data-form="kyc"]', async (e, form) => {
      e.preventDefault();
      showError(form, '');
      try {
        await api(`/tenancies/${form.dataset.id}/kyc`, { method: 'PUT', body: { id_type: form.id_type.value, status: form.status.value, original_seen: form.original_seen.checked } });
        invalidate(); PGC.ui.toast('KYC saved', { type: 'success' }); paintAll();
      } catch (err) { showError(form, err.message); }
    });
    ctx.on('click', '[data-action="agr-preview"]', async (e, btn) => { try { await previewAgreement(btn.dataset.id); } catch (err) { PGC.ui.toast(err.message, { type: 'error' }); } });
    ctx.on('click', '[data-action="agr-share"]', async (e, btn) => {
      try { await api(`/tenancies/${btn.dataset.id}/agreement/share`, { method: 'POST' }); invalidate(); PGC.ui.toast('Agreement marked as shared', { type: 'success' }); paintAll(); }
      catch (err) { PGC.ui.toast(err.message, { type: 'error' }); }
    });
    ctx.on('click', '[data-action="agr-sign"]', (e, btn) => {
      formDialog({
        title: 'Mark as signed', submitLabel: 'Mark as signed',
        body: html`<p class="muted">Type the tenant's full name (${btn.dataset.name}) to record that both of you agreed. The date, time and version of the terms are saved.</p>
          <label class="field"><span class="field__label">Tenant's full name</span><input class="input" name="signed_name" data-testid="mg-sign-name"></label>`,
        onSubmit: async (form) => { await api(`/tenancies/${btn.dataset.id}/agreement/sign`, { method: 'POST', body: { signed_name: form.signed_name.value } }); invalidate(); PGC.ui.toast('Agreement marked as signed', { type: 'success' }); paintAll(); },
      });
    });

    paintAll();
  };
})(window.PGC);
