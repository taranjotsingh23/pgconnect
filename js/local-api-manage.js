/**
 * Owner PG manager (F3): tenancies, rent register, complaints, KYC (owner-attested) and agreements.
 * Everything is the OWNER'S OWN RECORD. It never moves money and it does not touch bookings or the dashboard stats.
 * All routes are owner-only and scoped to the caller: someone else's data answers 404 ("Listing not found" /
 * "Tenant not found") so existence is not leaked. Rent status is never stored; it is derived with PGC.lib.rentStatus
 * using today's date in Asia/Kolkata. No ID numbers or documents are accepted or stored anywhere.
 */
(function (PGC) {
  'use strict';

  const ROOM_TYPES = ['single', 'double', 'triple'];
  const MODES = ['Cash', 'UPI', 'Bank transfer', 'Other'];
  const CATEGORIES = ['Water', 'Electricity', 'Cleaning', 'Wi-Fi', 'Food', 'Noise', 'Safety', 'Other'];
  const STATUSES = ['open', 'in_progress', 'resolved'];
  const ID_TYPES = ['Aadhaar', 'Passport', 'Driving licence', 'Voter ID', 'College or work ID'];
  const KYC_STATUSES = ['pending', 'verified', 'rejected'];
  const MONEY_MAX = 100000;

  PGC.localApi.extend(({ route, err, requireRole, str }) => {
    const lib = PGC.lib;
    const randomId = PGC.utils.randomId;
    const isDate = PGC.utils.isValidISODate;

    /* ---------- guards: the PG / tenancy must belong to the caller ---------- */
    const ownPg = (ctx, pgId) => {
      const user = requireRole(ctx, 'owner');
      const pg = ctx.db.pgs.find((p) => p.pg_id === pgId && p.owner_id === user.user_id);
      if (!pg) throw err('Listing not found', 404);
      return { user, pg };
    };
    const ownTenancy = (ctx, id) => {
      const user = requireRole(ctx, 'owner');
      const t = ctx.db.tenancies.find((x) => x.tenancy_id === id && x.owner_id === user.user_id);
      if (!t) throw err('Tenant not found', 404);
      return { user, t, pg: ctx.db.pgs.find((p) => p.pg_id === t.pg_id) };
    };
    const ownRent = (ctx, id) => {
      const user = requireRole(ctx, 'owner');
      const r = ctx.db.rent_records.find((x) => x.rent_id === id && x.owner_id === user.user_id);
      if (!r) throw err('Tenant not found', 404);
      return r;
    };

    /* ---------- validation helpers ---------- */
    const whole = (v, label, min, max) => {
      const n = Number(v);
      if (v === '' || v === null || v === undefined || !Number.isInteger(n) || n < min || n > max) throw err(`${label} must be a whole number from ${min.toLocaleString('en-IN')} to ${max.toLocaleString('en-IN')}`, 422);
      return n;
    };
    const monthOf = (q) => (/^\d{4}-(0[1-9]|1[0-2])$/.test(q || '') ? q : lib.todayIST().slice(0, 7));
    const maskPhone = (ph) => (ph ? `XXXXXX${ph.slice(-4)}` : '');
    const norm = (n) => String(n || '').toLowerCase().replace(/\s+/g, ' ').trim();

    const rentView = (r, t, today) => ({
      rent_id: r.rent_id, tenancy_id: r.tenancy_id, tenant_name: t ? t.tenant_name : '', room_label: t ? t.room_label : '', amount: r.amount, due_date: r.due_date,
      paid_at: r.paid_at || null, mode: r.mode || null, note: r.note || null, waived: !!r.waived,
      status: lib.rentStatus({ due_date: r.due_date, paid_at: r.paid_at, waived: r.waived }, today),
    });
    const tenancyView = (db, t, today) => {
      const month = today.slice(0, 7);
      const row = db.rent_records.find((r) => r.tenancy_id === t.tenancy_id && r.due_date.startsWith(month));
      const kyc = db.kyc_records.find((k) => k.tenancy_id === t.tenancy_id);
      const agr = db.agreements.filter((a) => a.tenancy_id === t.tenancy_id).sort((a, b) => b.version - a.version)[0];
      const { phone, ...rest } = t; // the raw phone number is never returned
      return {
        ...rest, phone_masked: maskPhone(phone),
        rent_status: row ? lib.rentStatus({ due_date: row.due_date, paid_at: row.paid_at, waived: row.waived }, today) : null, rent_id: row ? row.rent_id : null,
        kyc: kyc ? { id_type: kyc.id_type, original_seen: kyc.original_seen, status: kyc.status, checked_at: kyc.checked_at } : null,
        kyc_status: kyc ? kyc.status : 'none', agreement_status: agr ? agr.status : 'none',
      };
    };
    const roomOf = (pg, type) => pg.room_types.find((r) => r.type === type);

    /* ---------- overview (header cards) ---------- */
    route('GET', '/manage/:pg_id/overview', async (ctx) => {
      const { pg } = ownPg(ctx, ctx.params.pg_id);
      const { db } = ctx;
      const today = lib.todayIST();
      const month = monthOf(ctx.query.month);
      const rows = db.rent_records.filter((r) => r.pg_id === pg.pg_id && r.due_date.startsWith(month) && !r.waived);
      const occupied = db.tenancies.filter((t) => t.pg_id === pg.pg_id && t.status === 'active').length;
      const total = pg.room_types.reduce((n, r) => n + r.total, 0);
      const sum = (list) => list.reduce((n, r) => n + r.amount, 0);
      const unpaid = rows.filter((r) => !r.paid_at);
      return {
        month, occupied, total_beds: total, occupancy_pct: total ? Math.round((occupied / total) * 100) : 0,
        rent_roll: sum(rows), collected: sum(rows.filter((r) => r.paid_at)), due: sum(unpaid), due_count: unpaid.length,
        overdue_count: unpaid.filter((r) => lib.rentStatus({ due_date: r.due_date }, today) === 'overdue').length,
        open_complaints: db.complaints.filter((c) => c.pg_id === pg.pg_id && c.status !== 'resolved').length,
      };
    });

    /* ---------- tenancies ---------- */
    route('GET', '/manage/:pg_id/tenancies', async (ctx) => {
      const { pg } = ownPg(ctx, ctx.params.pg_id);
      const today = lib.todayIST();
      const all = ctx.query.include_ended === '1';
      return ctx.db.tenancies.filter((t) => t.pg_id === pg.pg_id && (all || t.status === 'active'))
        .sort((a, b) => a.room_label.localeCompare(b.room_label)).map((t) => tenancyView(ctx.db, t, today));
    });

    const readTenant = (body) => {
      const name = str(body.tenant_name);
      if (!name || name.length > 60) throw err('Enter the tenant name (up to 60 characters)', 422);
      const phone = str(body.phone);
      if (phone && !/^\d{10}$/.test(phone)) throw err('Phone must be 10 digits', 422);
      const room = str(body.room_label);
      if (!room || room.length > 12) throw err('Enter a room label (up to 12 characters)', 422);
      return { name, phone, room };
    };

    route('POST', '/manage/:pg_id/tenancies', async (ctx) => {
      const { user, pg } = ownPg(ctx, ctx.params.pg_id);
      const { db, body } = ctx;
      const { name, phone, room } = readTenant(body);
      const type = body.room_type;
      if (!ROOM_TYPES.includes(type)) throw err('Choose single, double or triple', 422);
      const rent = whole(body.monthly_rent, 'Monthly rent', 1, MONEY_MAX);
      const deposit = body.deposit_paid === undefined || body.deposit_paid === '' ? 0 : whole(body.deposit_paid, 'Deposit', 0, MONEY_MAX);
      const moveIn = str(body.move_in);
      if (!isDate(moveIn)) throw err('Enter move-in date as YYYY-MM-DD', 422);
      const months = body.stay_months === undefined || body.stay_months === '' ? 11 : whole(body.stay_months, 'Stay length', 1, 24);
      const rt = roomOf(pg, type);
      if (!rt) throw err(`This PG has no ${type} rooms listed.`, 400);

      // availability changes only when asked, only while a bed is free (never below 0), in the same step as the save
      const wantAdjust = body.adjust_availability === true;
      let adjusted = false;
      if (wantAdjust && rt.available > 0) { rt.available -= 1; adjusted = true; }

      const t = {
        tenancy_id: randomId(12), pg_id: pg.pg_id, owner_id: user.user_id, tenant_name: name, phone, room_label: room, room_type: type, monthly_rent: rent,
        deposit_paid: deposit, move_in: moveIn, stay_months: months, status: 'active', adjust_availability: wantAdjust, availability_adjusted: adjusted,
        created_at: new Date().toISOString(),
      };
      db.tenancies.push(t);
      lib.scheduleDates(moveIn, months).forEach((due) => {
        db.rent_records.push({ rent_id: randomId(12), tenancy_id: t.tenancy_id, pg_id: pg.pg_id, owner_id: user.user_id, due_date: due, amount: rent, paid_at: null, mode: null, note: null, waived: false });
      });
      return tenancyView(db, t, lib.todayIST());
    });

    route('PATCH', '/manage/tenancies/:id', async (ctx) => {
      const { t } = ownTenancy(ctx, ctx.params.id);
      const { db, body } = ctx;
      const merged = readTenant({ tenant_name: body.tenant_name ?? t.tenant_name, phone: body.phone ?? t.phone, room_label: body.room_label ?? t.room_label });
      const today = lib.todayIST();
      if (body.monthly_rent !== undefined) {
        const rent = whole(body.monthly_rent, 'Monthly rent', 1, MONEY_MAX);
        if (rent !== t.monthly_rent) { // only future unpaid rows change; paid and past rows keep their amount
          db.rent_records.filter((r) => r.tenancy_id === t.tenancy_id && !r.paid_at && !r.waived && r.due_date > today).forEach((r) => { r.amount = rent; });
          t.monthly_rent = rent;
        }
      }
      Object.assign(t, { tenant_name: merged.name, phone: merged.phone, room_label: merged.room });
      return tenancyView(db, t, today);
    });

    route('POST', '/manage/tenancies/:id/end', async (ctx) => {
      const { t, pg } = ownTenancy(ctx, ctx.params.id);
      const { db } = ctx;
      if (t.status === 'ended') return tenancyView(db, t, lib.todayIST());
      const today = lib.todayIST();
      t.status = 'ended'; t.ended_at = new Date().toISOString();
      if (t.availability_adjusted && pg) { const rt = roomOf(pg, t.room_type); if (rt) rt.available = Math.min(rt.total, rt.available + 1); t.availability_adjusted = false; }
      // history stays; only future unpaid rows disappear
      db.rent_records = db.rent_records.filter((r) => !(r.tenancy_id === t.tenancy_id && !r.paid_at && r.due_date > today));
      return tenancyView(db, t, today);
    });

    /* ---------- rent register ---------- */
    route('GET', '/manage/:pg_id/rent', async (ctx) => {
      const { pg } = ownPg(ctx, ctx.params.pg_id);
      const today = lib.todayIST();
      const month = monthOf(ctx.query.month);
      return ctx.db.rent_records.filter((r) => r.pg_id === pg.pg_id && r.due_date.startsWith(month))
        .map((r) => rentView(r, ctx.db.tenancies.find((t) => t.tenancy_id === r.tenancy_id), today))
        .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.tenant_name.localeCompare(b.tenant_name));
    });

    route('POST', '/manage/rent/:id/paid', async (ctx) => {
      const r = ownRent(ctx, ctx.params.id);
      const mode = str(ctx.body.mode);
      if (!MODES.includes(mode)) throw err('Choose how it was paid', 422);
      const today = lib.todayIST();
      const paidAt = str(ctx.body.paid_at) || today;
      if (!isDate(paidAt)) throw err('Enter the payment date as YYYY-MM-DD', 422);
      if (paidAt > today) throw err('The payment date cannot be in the future', 422);
      if (r.paid_at) throw err('Already paid', 400);
      Object.assign(r, { paid_at: paidAt, mode, waived: false });
      return rentView(r, ctx.db.tenancies.find((t) => t.tenancy_id === r.tenancy_id), today);
    });

    route('POST', '/manage/rent/:id/undo', async (ctx) => {
      const r = ownRent(ctx, ctx.params.id);
      Object.assign(r, { paid_at: null, mode: null, waived: false, note: null });
      return rentView(r, ctx.db.tenancies.find((t) => t.tenancy_id === r.tenancy_id), lib.todayIST());
    });

    route('POST', '/manage/rent/:id/waive', async (ctx) => {
      const r = ownRent(ctx, ctx.params.id);
      if (r.paid_at) throw err('Already paid', 400);
      Object.assign(r, { waived: true, note: str(ctx.body.note).slice(0, 200) || null });
      return rentView(r, ctx.db.tenancies.find((t) => t.tenancy_id === r.tenancy_id), lib.todayIST());
    });

    /* ---------- complaints ---------- */
    const isPinned = (c) => c.category === 'Safety' && c.priority === 'High' && c.status !== 'resolved';
    const complaintView = (db, c) => {
      const t = c.tenancy_id ? db.tenancies.find((x) => x.tenancy_id === c.tenancy_id) : null;
      return { ...c, tenant_name: t ? t.tenant_name : null, pinned: isPinned(c) };
    };

    route('GET', '/manage/:pg_id/complaints', async (ctx) => {
      const { pg } = ownPg(ctx, ctx.params.pg_id);
      const status = ctx.query.status;
      return ctx.db.complaints.filter((c) => c.pg_id === pg.pg_id && (!STATUSES.includes(status) || c.status === status))
        .map((c) => complaintView(ctx.db, c))
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || Date.parse(b.created_at) - Date.parse(a.created_at));
    });

    route('POST', '/manage/:pg_id/complaints', async (ctx) => {
      const { user, pg } = ownPg(ctx, ctx.params.pg_id);
      const { db, body } = ctx;
      if (!CATEGORIES.includes(body.category)) throw err('Choose a category', 422);
      const title = str(body.title);
      if (!title || title.length > 80) throw err('Enter a title (up to 80 characters)', 422);
      const details = str(body.details);
      if (details.length > 500) throw err('Details can be up to 500 characters', 422);
      const priority = body.priority === 'High' ? 'High' : 'Normal';
      let tenancyId = null;
      if (body.tenancy_id) {
        const t = db.tenancies.find((x) => x.tenancy_id === body.tenancy_id && x.pg_id === pg.pg_id && x.owner_id === user.user_id);
        if (!t) throw err('Tenant not found', 404);
        tenancyId = t.tenancy_id;
      }
      const now = new Date().toISOString();
      const c = { complaint_id: randomId(12), pg_id: pg.pg_id, owner_id: user.user_id, tenancy_id: tenancyId, category: body.category, title, details, priority, status: 'open', owner_note: null, created_at: now, updated_at: now, resolved_at: null };
      db.complaints.push(c);
      return complaintView(db, c);
    });

    route('PATCH', '/manage/complaints/:id', async (ctx) => {
      const user = requireRole(ctx, 'owner');
      const c = ctx.db.complaints.find((x) => x.complaint_id === ctx.params.id && x.owner_id === user.user_id);
      if (!c) throw err('Listing not found', 404);
      const { body } = ctx;
      if (body.status !== undefined) {
        if (!STATUSES.includes(body.status)) throw err('Status must be open, in progress or resolved', 422);
        if (body.status === 'resolved' && c.status !== 'resolved') c.resolved_at = new Date().toISOString();
        if (body.status !== 'resolved') c.resolved_at = null;
        c.status = body.status;
      }
      if (body.owner_note !== undefined) {
        const note = str(body.owner_note);
        if (note.length > 300) throw err('The note can be up to 300 characters', 422);
        c.owner_note = note || null;
      }
      c.updated_at = new Date().toISOString();
      return complaintView(ctx.db, c);
    });

    /* ---------- KYC: owner-attested type of ID seen, never numbers or documents ---------- */
    route('PUT', '/manage/tenancies/:id/kyc', async (ctx) => {
      const { user, t } = ownTenancy(ctx, ctx.params.id);
      const { db, body } = ctx;
      const extra = Object.keys(body).filter((k) => !['id_type', 'original_seen', 'status'].includes(k));
      if (extra.length) throw err('PGConnect stores only the type of ID you saw and the date. Do not enter ID numbers here.', 422);
      if (!ID_TYPES.includes(body.id_type)) throw err('Choose the type of ID you saw', 422);
      if (!KYC_STATUSES.includes(body.status)) throw err('Status must be pending, verified or rejected', 422);
      const seen = body.original_seen === true;
      if (body.status === 'verified' && !seen) throw err('Tick "I have seen the original ID" first', 400);
      let k = db.kyc_records.find((x) => x.tenancy_id === t.tenancy_id);
      if (!k) { k = { kyc_id: randomId(12), tenancy_id: t.tenancy_id, owner_id: user.user_id }; db.kyc_records.push(k); }
      Object.assign(k, { id_type: body.id_type, original_seen: seen, status: body.status, checked_at: body.status === 'pending' ? null : lib.todayIST() });
      return { id_type: k.id_type, original_seen: k.original_seen, status: k.status, checked_at: k.checked_at };
    });

    /* ---------- agreements: Draft, Shared, Signed; edits after Signed create a new version ---------- */
    const agreementView = (a, t) => ({
      agreement_id: a.agreement_id, tenancy_id: a.tenancy_id, version: a.version, status: a.status, terms: a.terms, tenant_name: t.tenant_name,
      signed_name: a.signed_name || null, signed_at: a.signed_at || null, created_at: a.created_at,
    });
    function currentAgreement(ctx, t, pg, user) {
      const { db } = ctx;
      const owner = db.users.find((u) => u.user_id === user.user_id);
      const fresh = lib.agreementTerms({ owner, pg, tenancy: t });
      let cur = db.agreements.filter((a) => a.tenancy_id === t.tenancy_id).sort((a, b) => b.version - a.version)[0];
      if (!cur) {
        cur = { agreement_id: randomId(12), tenancy_id: t.tenancy_id, owner_id: user.user_id, version: 1, terms: fresh, status: 'draft', signed_name: null, signed_at: null, created_at: new Date().toISOString() };
        db.agreements.push(cur); ctx.dirty = true;
      } else if (JSON.stringify(cur.terms) !== JSON.stringify(fresh)) {
        if (cur.status === 'signed') { // the terms changed after signing: a new version, back to Draft
          cur = { agreement_id: randomId(12), tenancy_id: t.tenancy_id, owner_id: user.user_id, version: cur.version + 1, terms: fresh, status: 'draft', signed_name: null, signed_at: null, created_at: new Date().toISOString() };
          db.agreements.push(cur);
        } else cur.terms = fresh;
        ctx.dirty = true;
      }
      return cur;
    }

    route('GET', '/manage/tenancies/:id/agreement', async (ctx) => {
      const { user, t, pg } = ownTenancy(ctx, ctx.params.id);
      return { agreement: agreementView(currentAgreement(ctx, t, pg, user), t) };
    });
    route('POST', '/manage/tenancies/:id/agreement/share', async (ctx) => {
      const { user, t, pg } = ownTenancy(ctx, ctx.params.id);
      const a = currentAgreement(ctx, t, pg, user);
      if (a.status === 'signed') throw err('Already signed', 400);
      a.status = 'shared';
      return { agreement: agreementView(a, t) };
    });
    route('POST', '/manage/tenancies/:id/agreement/sign', async (ctx) => {
      const { user, t, pg } = ownTenancy(ctx, ctx.params.id);
      const a = currentAgreement(ctx, t, pg, user);
      if (norm(ctx.body.signed_name) !== norm(t.tenant_name)) throw err("Type the tenant's full name exactly", 400);
      if (a.status !== 'signed') Object.assign(a, { status: 'signed', signed_name: str(ctx.body.signed_name), signed_at: new Date().toISOString(), terms_version: a.version });
      return { agreement: agreementView(a, t) };
    });
  });
})(window.PGC);
