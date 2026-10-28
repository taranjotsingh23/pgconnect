/**
 * Seed v2 (brief 4.4): sample data for the upgrade. Pure function on the browser database object.
 *
 *  - upserts by `seed_key` (insert only, never overwrites something that already exists, so owner edits survive)
 *  - backfills ONLY the missing new fields on the five original PGs (matched by name + city)
 *  - never deletes anything; running it twice changes nothing
 *  - deterministic: the same output every run (seeded generator, no Math.random)
 * Everything it creates is flagged `is_sample: true` and says so in its description.
 */
(function (PGC) {
  'use strict';

  /* ---------- deterministic generator ---------- */
  function hashStr(s) {
    let h = 1779033703 ^ s.length;
    for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    return h >>> 0;
  }
  function rng(seed) {
    let a = hashStr(seed);
    const next = () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
      next,
      int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
      pick: (arr) => arr[Math.floor(next() * arr.length)],
      chance: (p) => next() < p,
    };
  }
  /** Stable 12-character id (same shape as the app's ids) derived from a seed key. */
  function idFor(key, prefix) {
    const r = rng('id:' + key);
    let s = '';
    for (let i = 0; i < 9; i++) s += Math.floor(r.next() * 36).toString(36);
    return prefix + s;
  }
  const round500 = (n) => Math.round(n / 500) * 500;
  const rotate = (list, by) => list.map((_, i) => list[(i + by) % list.length]);

  /* ---------- date helpers (YYYY-MM-DD strings) ---------- */
  const toDate = (iso) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)));
  const fmt = (d) => d.toISOString().slice(0, 10);
  const addDays = (iso, n) => fmt(new Date(toDate(iso).getTime() + n * 86400000));
  const addMonths = (iso, n) => { // keeps the day, capped at 28 so every month has it
    const d = toDate(iso);
    return fmt(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, Math.min(d.getUTCDate(), 28))));
  };

  /* ---------- the five original PGs: optional fields to backfill (demo values) ---------- */
  const S = (cctv, guard, fire, flex, wfloor, curfew) => ({ cctv, night_guard: guard, fire_exit_clear: fire, curfew_flexible: flex, women_only_floor: wfloor, curfew_time: curfew });
  const C = (elec, maint, food, dep, refund, notice, lock, exit) => ({
    electricity: elec === 0 ? { mode: 'included', est_monthly: 0 } : { mode: 'metered', est_monthly: elec },
    maintenance_monthly: maint, food, deposit_months: dep, deposit_refund_days: refund, notice_days: notice, lock_in_months: lock, exit_fee: exit,
  });
  const ORIGINAL_EXTRAS = {
    'Sunshine Girls PG|Bengaluru': { area: 'Koramangala', grade: 'verified_plus', short_stay_ok: false, safety: S(true, true, true, false, false, '11:00 PM'),
      charges: C(900, 500, { mode: 'included' }, 2, 15, 30, 0, 1000) },
    'Urban Nest Co-living|Bengaluru': { area: 'HSR Layout', grade: 'assured', short_stay_ok: true, safety: S(true, true, true, true, true, null),
      charges: C(0, 800, { mode: 'optional', optional_price: 3500 }, 2, 10, 30, 3, 2000) },
    'Delhi Scholars Boys PG|Delhi': { area: 'Mukherjee Nagar', grade: 'verified', short_stay_ok: false, safety: S(true, false, true, false, false, '10:30 PM'),
      charges: C(700, 0, { mode: 'included' }, 1, 15, 30, 0, 0) },
    'Green Leaf Girls PG|Pune': { area: 'Kothrud', grade: 'verified_plus', short_stay_ok: true, safety: S(true, true, true, true, false, '11:00 PM'),
      charges: C(800, 400, { mode: 'included' }, 2, 7, 30, 0, 1000) },
    'HiTech Co-living|Hyderabad': { area: 'Madhapur', grade: 'verified', short_stay_ok: false, safety: S(true, false, true, true, false, null),
      charges: C(1000, 600, { mode: 'optional', optional_price: 3000 }, 2, 15, 30, 3, 1500) },
  };

  /* ---------- sample PG generator ---------- */
  const WORDS = ['Neem', 'Banyan', 'Jasmine', 'Maple', 'Cedar', 'Lotus', 'Tulsi', 'Peepal', 'Mango', 'Palm', 'Willow', 'Saffron', 'Orchid', 'Bamboo'];
  const KINDS = ['Court', 'Residency', 'Nest', 'House', 'Villa', 'Stay'];
  const OPTIONAL_AMENITIES = ['AC', 'Laundry', 'Housekeeping', 'CCTV', 'Parking', 'Gym', 'Hot Water', 'Power Backup']; // exact add-listing strings
  const COMMON_RULES = ['No smoking', 'Entry till 11 PM', 'Guests only in common area'];
  const CURFEWS = ['10:30 PM', '11:00 PM', '11:30 PM'];

  function samplePg(a, i, ctx) {
    const key = `sample:${a.city}:${a.area}:${i}`;
    const r = rng(`${a.city}-${a.area}-${i}`);
    const gender = ['female', 'female', 'male', 'unisex'][i] || r.pick(['female', 'male', 'unisex']);

    let name; let guard = 0;
    do { name = `${r.pick(WORDS)} ${r.pick(KINDS)}`; guard++; } while (ctx.names.has(`${a.city}|${a.area}|${name}`) && guard < 60);
    ctx.names.add(`${a.city}|${a.area}|${name}`);

    const dbl = round500(a.doubleBase * (0.8 + 0.4 * r.next()));
    const rooms = [{ type: 'double', price: dbl }];
    if (r.chance(0.7)) rooms.push({ type: 'single', price: round500(dbl * 1.4) });
    if (r.chance(0.4)) rooms.push({ type: 'triple', price: round500(dbl * 0.78) });
    const full = r.chance(0.2);
    const room_types = rooms.map((x) => {
      const total = r.int(6, 12);
      return { type: x.type, price: x.price, available: full ? 0 : r.int(0, 3), total };
    });

    const amenities = ['WiFi'];
    OPTIONAL_AMENITIES.forEach((am) => { if (r.chance(0.5 + 0.1 * r.next())) amenities.push(am); });

    const safety = {
      cctv: r.chance(0.7), night_guard: r.chance(0.55), fire_exit_clear: r.chance(0.8), curfew_flexible: r.chance(0.4),
      women_only_floor: gender === 'unisex' ? r.chance(0.3) : false, curfew_time: r.pick(CURFEWS),
    };

    const foodRoll = r.next();
    const foodMode = foodRoll < 0.35 ? 'included' : foodRoll < 0.7 ? 'optional' : 'none';
    const elecMetered = r.chance(0.6);
    const charges = {
      electricity: elecMetered ? { mode: 'metered', est_monthly: r.int(600, 1200) } : { mode: 'included', est_monthly: 0 },
      maintenance_monthly: r.chance(0.4) ? 0 : r.int(2, 16) * 50,
      food: foodMode === 'optional' ? { mode: 'optional', optional_price: round500(r.int(2500, 4500)) } : { mode: foodMode },
      deposit_months: r.int(1, 2), deposit_refund_days: r.int(7, 15), notice_days: r.int(15, 30), lock_in_months: r.int(0, 3),
      exit_fee: r.chance(0.5) ? 0 : round500(r.int(1000, 2000)),
    };
    const gRoll = r.next();
    const grade = gRoll < 0.5 ? 'verified' : gRoll < 0.85 ? 'verified_plus' : 'assured';
    const shortStay = r.chance(0.3);
    const images = rotate(PGC.seed.BASE_IMAGES, (ctx.areaIndex + i) % PGC.seed.BASE_IMAGES.length);

    ctx.counter += 1;
    return {
      pg_id: idFor(key, 'smp'), seed_key: key, owner_id: ctx.ownerId(a.city), name, city: a.city, locality: a.area, address: `${a.area}, ${a.city}`,
      gender, description: `Sample listing in ${a.area}, ${a.city}. Prices and details are demo data.`,
      price_from: Math.min(...room_types.map((x) => x.price)), amenities, rules: COMMON_RULES.slice(), food_included: foodMode === 'included',
      images, verified: true, rating: 0, review_count: 0, room_types,
      created_at: new Date(ctx.baseMs - ctx.counter * 60000).toISOString(),
      area: a.area, lat: +(a.center.lat + (r.next() * 2 - 1) * 0.011).toFixed(5), lng: +(a.center.lng + (r.next() * 2 - 1) * 0.011).toFixed(5),
      grade, charges, safety, short_stay_ok: shortStay, min_stay_months: shortStay ? 1 : 3, is_sample: true,
    };
  }

  /* ---------- roommate samples (F1) ---------- */
  const SAMPLE_ANSWERS = [[0,0,1,1,1,1], [1,1,1,0,0,1], [2,2,2,2,2,2], [0,1,1,1,1,0], [2,1,2,2,1,2], [1,1,0,1,0,1]];
  const FIRST_NAMES = {
    Bengaluru: ['Aarav', 'Ishita', 'Kabir', 'Meera', 'Rohan', 'Tanvi'],
    Delhi: ['Vihaan', 'Diya', 'Arjun', 'Naina', 'Kiara', 'Reyansh'],
    Pune: ['Aditi', 'Samar', 'Anaya', 'Dev', 'Riya', 'Nikhil'],
    Hyderabad: ['Sanya', 'Karan', 'Myra', 'Yash', 'Pooja', 'Harsh'],
  };
  const INTAKES = ['Summer intern', 'New job', 'College starter', 'Exam aspirant', 'Other', 'New job'];
  const GROUPS = [
    { name: 'Summer interns', for_whom: 'Summer interns', window_label: 'May to July intake' },
    { name: 'New job, new city', for_whom: 'People starting a new job', window_label: 'Next 3 months' },
    { name: 'College starters', for_whom: 'First-year students', window_label: 'August intake' },
    { name: 'Exam aspirants', for_whom: 'Exam preparation', window_label: 'All year' },
    { name: 'Early risers and quiet study', for_whom: 'Early risers who study at the PG', window_label: 'All year' },
  ];

  /* ---------- PG manager demo data (F3), attached to the demo owner's Sunshine Girls PG ---------- */
  const TENANTS = [ // first name, initial, room, type, when, current month
    ['Aarav', 'K', 'R101-A', 'single', { m: 6 }, 'paid'], ['Ishita', 'S', 'R102-B', 'double', { m: 8 }, 'paid'],
    ['Meera', 'P', 'R103-A', 'double', { m: 5 }, 'paid'], ['Tanvi', 'R', 'R104-B', 'double', { m: 4 }, 'unpaid'],
    ['Diya', 'M', 'R201-A', 'single', { m: 3 }, 'paid'], ['Naina', 'T', 'R202-B', 'double', { m: 2 }, 'paid'],
    ['Riya', 'J', 'R203-A', 'double', { d: 3 }, 'unpaid'], ['Anaya', 'V', 'R204-A', 'single', { d: 2 }, 'unpaid'],
    ['Myra', 'D', 'R205-B', 'double', { d: 10 }, 'unpaid'],
  ];
  const ID_TYPES = ['Aadhaar', 'Driving licence', 'College or work ID', 'Voter ID', 'Passport'];
  const PAY_MODES = ['Cash', 'UPI', 'Bank transfer'];

  /* ---------- apply ---------- */
  function apply(db, { sample = true, today } = {}) {
    const lib = PGC.lib;
    today = today || lib.todayIST();
    const stats = { inserted: 0, present: 0, backfilled: 0 };
    ['roommate_profiles', 'batch_groups', 'batch_members', 'tenancies', 'rent_records', 'complaints', 'kyc_records', 'agreements']
      .forEach((k) => { db[k] = db[k] || []; });

    /* 1. backfill the original five: only fields that are missing, never the old ones */
    const centers = Object.fromEntries(lib.AREAS.map((a) => [a.city + '|' + a.area, a.center]));
    db.pgs.forEach((pg) => {
      const extra = ORIGINAL_EXTRAS[`${pg.name}|${pg.city}`];
      if (!extra || pg.is_sample) return;
      const fill = { ...extra, ...(centers[pg.city + '|' + extra.area] || {}) };
      Object.keys(fill).forEach((k) => { if (pg[k] === undefined) { pg[k] = fill[k]; stats.backfilled += 1; } });
    });
    if (!sample) return stats;

    /* 2. one sample owner per city (cannot log in: random salt and hash nobody knows) */
    const cityOwners = {};
    ['Bengaluru', 'Delhi', 'Pune', 'Hyderabad'].forEach((city) => {
      const email = `sample.owner.${city.toLowerCase()}@pgconnect.in`;
      let u = db.users.find((x) => x.email === email);
      if (u) stats.present += 1; else {
        u = { user_id: idFor('owner:' + city, 'smo'), name: `Sample Owner ${city}`, email, role: 'owner', phone: '', is_sample: true,
          pw_salt: idFor('salt:' + city, 'x'), pw_hash: 'sha256:' + idFor('hash:' + city, 'unguessable') + idFor('hash2:' + city, ''), created_at: new Date().toISOString() };
        db.users.push(u); stats.inserted += 1;
      }
      cityOwners[city] = u.user_id;
    });

    /* 3. sample PGs: every area gets at least 5 PGs in total (the originals count) */
    const originals = db.pgs.filter((p) => !p.is_sample);
    const baseMs = originals.length ? Math.min(...originals.map((p) => Date.parse(p.created_at))) : Date.now();
    const ctx = { ownerId: (c) => cityOwners[c], counter: 0, baseMs, names: new Set(db.pgs.map((p) => `${p.city}|${PGC.lib.areaOf(p)}|${p.name}`)), areaIndex: 0 };
    lib.AREAS.forEach((a, areaIndex) => {
      const have = originals.filter((p) => p.city === a.city && p.area === a.area).length;
      ctx.areaIndex = areaIndex;
      for (let i = 0; i < Math.max(0, 5 - have); i++) {
        const key = `sample:${a.city}:${a.area}:${i}`;
        const doc = samplePg(a, i, ctx); // always generated so `counter` (created_at order) stays identical
        if (db.pgs.some((p) => p.seed_key === key)) { stats.present += 1; continue; }
        db.pgs.push(doc); stats.inserted += 1;
      }
    });

    /* 4. roommate profiles and batch groups */
    Object.keys(FIRST_NAMES).forEach((city) => {
      const r = rng('rm:' + city);
      FIRST_NAMES[city].forEach((first, i) => {
        const key = `sample:rm:${city}:${i}`;
        if (db.roommate_profiles.some((p) => p.seed_key === key)) { stats.present += 1; return; }
        db.roommate_profiles.push({
          profile_id: idFor(key, 'smr'), user_id: null, seed_key: key, first_name: first, last_initial: String.fromCharCode(65 + r.int(0, 25)),
          city, intake: INTAKES[i], answers: SAMPLE_ANSWERS[i].slice(), opt_in: true, is_sample: true, created_at: new Date(baseMs).toISOString(), updated_at: new Date(baseMs).toISOString(),
        });
        stats.inserted += 1;
      });
      GROUPS.forEach((g, gi) => {
        const key = `sample:group:${city}:${gi}`;
        let group = db.batch_groups.find((x) => x.seed_key === key);
        if (group) stats.present += 1; else {
          group = { group_id: idFor(key, 'smg'), seed_key: key, city, ...g, cap: 12, is_sample: true, created_at: new Date(baseMs).toISOString() };
          db.batch_groups.push(group); stats.inserted += 1;
        }
        const members = 2 + (gi % 3); // 2 to 4 sample members per group, counted from batch_members (never faked)
        for (let j = 0; j < members; j++) {
          const p = db.roommate_profiles.find((x) => x.seed_key === `sample:rm:${city}:${(gi + j) % 6}`);
          if (p && !db.batch_members.some((m) => m.group_id === group.group_id && m.profile_id === p.profile_id)) {
            db.batch_members.push({ group_id: group.group_id, profile_id: p.profile_id, joined_at: new Date(baseMs).toISOString() });
          }
        }
      });
    });

    /* 5. PG manager demo: tenants, rent, KYC, agreements, complaints on Sunshine Girls PG */
    const pg = db.pgs.find((p) => p.name === 'Sunshine Girls PG' && p.city === 'Bengaluru' && !p.is_sample);
    if (pg) seedManager(db, pg, today, stats);
    return stats;
  }

  function seedManager(db, pg, today, stats) {
    const lib = PGC.lib;
    const monthStart = today.slice(0, 7) + '-01';
    const owner = db.users.find((u) => u.user_id === pg.owner_id);
    const r = rng('manage:' + pg.pg_id);
    TENANTS.forEach(([first, initial, room, type, when, scenario], n) => {
      const key = `sample:tenancy:${n}`;
      if (db.tenancies.some((t) => t.seed_key === key)) { stats.present += 1; return; }
      const rt = pg.room_types.find((x) => x.type === type);
      const rent = rt ? rt.price : pg.price_from;
      const moveIn = when.m ? addMonths(today, -when.m) : addDays(today, -when.d);
      const tenancy = {
        tenancy_id: idFor(key, 'smt'), seed_key: key, pg_id: pg.pg_id, owner_id: pg.owner_id, tenant_name: `${first} ${initial}`, phone: '',
        room_label: room, room_type: type, monthly_rent: rent, deposit_paid: rent * 2, move_in: moveIn, stay_months: 11, status: 'active',
        adjust_availability: false, availability_adjusted: false, is_sample: true, created_at: new Date().toISOString(),
      };
      db.tenancies.push(tenancy); stats.inserted += 1;

      lib.scheduleDates(moveIn, 11).forEach((due, i) => {
        const past = due < monthStart;
        const paid = past || (due <= today && scenario === 'paid');
        db.rent_records.push({
          rent_id: idFor(`${key}:rent:${i}`, 'smx'), tenancy_id: tenancy.tenancy_id, pg_id: pg.pg_id, owner_id: pg.owner_id, due_date: due, amount: rent,
          paid_at: paid ? due : null, mode: paid ? PAY_MODES[(n + i) % 3] : null, note: null, waived: false, is_sample: true,
        });
      });
      const pending = n === 6 || n === 8;
      db.kyc_records.push({
        kyc_id: idFor(`${key}:kyc`, 'smk'), tenancy_id: tenancy.tenancy_id, owner_id: pg.owner_id, id_type: ID_TYPES[(n + r.int(0, 4)) % 5],
        original_seen: !pending, status: pending ? 'pending' : 'verified', checked_at: pending ? null : moveIn,
      });
      const terms = lib.agreementTerms({ owner, pg, tenancy });
      const state = n === 6 ? 'draft' : n === 8 ? 'shared' : 'signed';
      db.agreements.push({
        agreement_id: idFor(`${key}:agr`, 'sma'), tenancy_id: tenancy.tenancy_id, owner_id: pg.owner_id, version: 1, terms, status: state,
        signed_name: state === 'signed' ? tenancy.tenant_name : null, signed_at: state === 'signed' ? `${moveIn}T10:00:00+05:30` : null,
        created_at: new Date().toISOString(),
      });
    });

    const complaints = [
      ['Safety', 'High', 'open', 'Main gate latch is loose', 'The latch does not lock fully at night. Needs repair.', null, 1],
      ['Water', 'Normal', 'resolved', 'Low water pressure on the 2nd floor', 'Pressure drops in the morning.', 'Pump serviced.', 9],
      ['Wi-Fi', 'Normal', 'in_progress', 'Wi-Fi drops in the evening', 'Connection is slow after 8 pm.', 'Router vendor called.', 4],
      ['Cleaning', 'Normal', 'open', 'Common area cleaning missed twice', 'Hall and stairs were not cleaned this week.', null, 3],
    ];
    complaints.forEach(([category, priority, status, title, details, note, daysAgo], i) => {
      const key = `sample:complaint:${i}`;
      if (db.complaints.some((c) => c.seed_key === key)) { stats.present += 1; return; }
      const created = addDays(today, -daysAgo) + 'T09:00:00+05:30';
      db.complaints.push({
        complaint_id: idFor(key, 'smc'), seed_key: key, pg_id: pg.pg_id, owner_id: pg.owner_id, tenancy_id: i === 2 ? (db.tenancies.find((t) => t.seed_key === 'sample:tenancy:3') || {}).tenancy_id || null : null,
        category, title, details, priority, status, owner_note: note, created_at: created, updated_at: created,
        resolved_at: status === 'resolved' ? addDays(today, -daysAgo + 2) + 'T09:00:00+05:30' : null, is_sample: true,
      });
      stats.inserted += 1;
    });
  }

  PGC.seedV2 = { apply, ORIGINAL_EXTRAS, rng, idFor, addDays, addMonths, GROUPS, FIRST_NAMES };
})(window.PGC);
