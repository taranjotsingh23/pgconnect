/**
 * Pure helpers from the upgrade brief, Appendix A2 to A6 (geo, areas, passport, filters, roommate, rent).
 * Copied from the brief with the TypeScript types removed; the maths is unchanged.
 * Works as a classic <script> (attaches to PGC.lib) and under Node (module.exports) so
 * js/lib-reference.test.js can run the brief's reference tests.
 */
(function (root) {
  'use strict';
  root.PGC = root.PGC || {};
  const lib = (root.PGC.lib = root.PGC.lib || {});

  /* ---------------- A4: geo ---------------- */
  const R = 6371; // km
  const rad = (d) => (d * Math.PI) / 180;
  /** Straight-line (great-circle) distance in km. */
  function haversineKm(a, b) {
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  const roundKm = (km) => Math.round(km * 10) / 10;

  /* ---------------- A5: areas ---------------- */
  const AREAS = [
    { city: 'Bengaluru', area: 'Koramangala', center: { lat: 12.9352, lng: 77.6245 }, doubleBase: 9500 },
    { city: 'Bengaluru', area: 'HSR Layout', center: { lat: 12.9116, lng: 77.6474 }, doubleBase: 9000 },
    { city: 'Bengaluru', area: 'Indiranagar', center: { lat: 12.9784, lng: 77.6408 }, doubleBase: 10500 },
    { city: 'Bengaluru', area: 'Whitefield', center: { lat: 12.9698, lng: 77.75 }, doubleBase: 8000 },
    { city: 'Delhi', area: 'Mukherjee Nagar', center: { lat: 28.705, lng: 77.209 }, doubleBase: 7000 },
    { city: 'Delhi', area: 'Laxmi Nagar', center: { lat: 28.6304, lng: 77.2773 }, doubleBase: 6500 },
    { city: 'Delhi', area: 'Karol Bagh', center: { lat: 28.6519, lng: 77.1909 }, doubleBase: 8500 },
    { city: 'Delhi', area: 'Saket', center: { lat: 28.5245, lng: 77.2066 }, doubleBase: 10500 },
    { city: 'Pune', area: 'Kothrud', center: { lat: 18.5074, lng: 73.8077 }, doubleBase: 8200 },
    { city: 'Pune', area: 'Viman Nagar', center: { lat: 18.5679, lng: 73.9143 }, doubleBase: 9000 },
    { city: 'Pune', area: 'Hinjawadi', center: { lat: 18.5912, lng: 73.7389 }, doubleBase: 7500 },
    { city: 'Pune', area: 'Kharadi', center: { lat: 18.5515, lng: 73.9404 }, doubleBase: 8800 },
    { city: 'Hyderabad', area: 'Madhapur', center: { lat: 17.4486, lng: 78.3908 }, doubleBase: 10000 },
    { city: 'Hyderabad', area: 'Gachibowli', center: { lat: 17.4401, lng: 78.3489 }, doubleBase: 9500 },
    { city: 'Hyderabad', area: 'Kondapur', center: { lat: 17.46, lng: 78.366 }, doubleBase: 8500 },
    { city: 'Hyderabad', area: 'Ameerpet', center: { lat: 17.4375, lng: 78.4483 }, doubleBase: 6500 },
  ];
  const areasOf = (city) => AREAS.filter((a) => !city || a.city.toLowerCase() === city.toLowerCase());

  /* ---------------- A3: true monthly cost ---------------- */
  function cheapestRoom(pg) {
    const rooms = (pg.room_types ?? []).filter((r) => r.price > 0);
    if (!rooms.length) return pg.price_from ? { type: 'double', price: pg.price_from } : null;
    return rooms.reduce((a, b) => (b.price < a.price ? b : a));
  }
  function computePassport(pg, room) {
    const picked = (room && (pg.room_types ?? []).find((r) => r.type === room)) || cheapestRoom(pg);
    if (!picked) return null;
    const c = pg.charges ?? {};
    const rent = picked.price;
    const electricity = c.electricity ? c.electricity.est_monthly : null;
    const maintenance = c.maintenance_monthly ?? null;
    const trueMonthly = rent + (electricity ?? 0) + (maintenance ?? 0);
    const foodMode = c.food?.mode ?? (pg.food_included ? 'included' : 'unknown');
    const optionalPrice = c.food?.mode === 'optional' ? c.food.optional_price ?? null : null;
    const depositAmount = c.deposit_months != null ? c.deposit_months * rent : null;
    return {
      rent, electricity, maintenance, trueMonthly, extraOverRent: trueMonthly - rent,
      complete: electricity != null && maintenance != null,
      food: { mode: foodMode, optionalPrice },
      trueMonthlyWithFood: optionalPrice != null ? trueMonthly + optionalPrice : null,
      depositMonths: c.deposit_months ?? null, depositAmount, depositRefundDays: c.deposit_refund_days ?? null,
      noticeDays: c.notice_days ?? null, lockInMonths: c.lock_in_months ?? null, exitFee: c.exit_fee ?? null,
      moveInCash: depositAmount != null ? depositAmount + rent : null,
    };
  }

  /* ---------------- A4: filters and sort ---------------- */
  const BUDGET_MIN = 3000, BUDGET_MAX = 30000, BUDGET_STEP = 500;
  const DEFAULT_FILTERS = {
    q: '', city: null, gender: null, food: false, area: null, min: BUDGET_MIN, max: BUDGET_MAX, budgetIncludesExtras: false,
    share: [], ac: false, shortStay: false, minGrade: 'any', availableNow: false, safety: [], distKm: null, ref: null, sort: 'relevance',
  };
  const RANK = { verified: 1, verified_plus: 2, assured: 3 };
  const MIN_RANK = { any: 0, verified: 1, verified_plus: 2, assured: 3 };
  const gradeOf = (pg) => pg.grade ?? (pg.verified ? 'verified' : null);
  const bedsLeft = (pg) => (pg.room_types ?? []).reduce((n, r) => n + Math.max(0, r.available), 0);
  const hasAc = (pg) => (pg.amenities ?? []).some((a) => a.toLowerCase() === 'ac');
  const areaOf = (pg) => (pg.area ?? pg.locality ?? '').trim();
  const coordsOf = (pg) => (pg.lat != null && pg.lng != null ? { lat: pg.lat, lng: pg.lng } : null);

  /** The price the budget slider compares: the cheapest room among the chosen sharing types (or all rooms). */
  function budgetPrice(pg, f) {
    const rooms = (pg.room_types ?? []).filter((r) => !f.share.length || f.share.includes(r.type));
    const base = rooms.length ? Math.min(...rooms.map((r) => r.price)) : pg.price_from;
    if (!f.budgetIncludesExtras) return base;
    const room = rooms.length ? rooms.reduce((a, b) => (b.price < a.price ? b : a)).type : null;
    return computePassport(pg, room)?.trueMonthly ?? base;
  }
  function activeFilterCount(f) {
    let n = 0;
    if (f.q.trim()) n++; if (f.city) n++; if (f.gender) n++; if (f.food) n++; if (f.area) n++;
    if (f.min !== BUDGET_MIN || f.max !== BUDGET_MAX) n++;
    if (f.share.length) n++; if (f.ac) n++; if (f.shortStay) n++; if (f.minGrade !== 'any') n++;
    if (f.availableNow) n++; if (f.safety.length) n++; if (f.distKm && f.ref) n++;
    return n;
  }
  function matches(pg, f) {
    const q = f.q.trim().toLowerCase();
    if (q && !`${pg.name} ${pg.city} ${pg.locality}`.toLowerCase().includes(q)) return false;
    if (f.city && pg.city.toLowerCase() !== f.city.toLowerCase()) return false;
    if (f.area && areaOf(pg).toLowerCase() !== f.area.toLowerCase()) return false;
    if (f.gender && pg.gender !== f.gender) return false;
    if (f.food && !(pg.food_included || pg.charges?.food?.mode === 'included')) return false;
    const price = budgetPrice(pg, f);
    if (price < f.min || price > f.max) return false;
    if (f.share.length && !(pg.room_types ?? []).some((r) => f.share.includes(r.type) && (!f.availableNow || r.available > 0))) return false;
    if (f.ac && !hasAc(pg)) return false;
    if (f.shortStay && !pg.short_stay_ok) return false;
    if (MIN_RANK[f.minGrade] > 0) { const g = gradeOf(pg); if (!g || RANK[g] < MIN_RANK[f.minGrade]) return false; }
    if (f.availableNow && bedsLeft(pg) <= 0) return false;
    const s = pg.safety ?? {};
    for (const k of f.safety) {
      if (k === 'wov' && !(pg.gender === 'female' && pg.verified)) return false;
      if (k === 'cctv' && !s.cctv) return false;
      if (k === 'guard' && !s.night_guard) return false;
      if (k === 'fire' && !s.fire_exit_clear) return false;
      if (k === 'curfew' && !s.curfew_flexible) return false;
      if (k === 'wfloor' && !s.women_only_floor) return false;
    }
    if (f.distKm && f.ref) { const c = coordsOf(pg); if (!c || haversineKm(f.ref, c) > f.distKm) return false; }
    return true;
  }
  function sortPgs(list, f) {
    const out = [...list];
    const tie = (a, b) => a.pg_id.localeCompare(b.pg_id);
    const created = (p) => p.created_at ?? '';
    switch (f.sort) {
      case 'price_asc': return out.sort((a, b) => budgetPrice(a, f) - budgetPrice(b, f) || tie(a, b));
      case 'price_desc': return out.sort((a, b) => budgetPrice(b, f) - budgetPrice(a, f) || tie(a, b));
      case 'rating': return out.sort((a, b) => b.rating - a.rating || b.review_count - a.review_count || tie(a, b));
      case 'beds': return out.sort((a, b) => bedsLeft(b) - bedsLeft(a) || tie(a, b));
      case 'distance': {
        if (!f.ref) return out.sort((a, b) => created(b).localeCompare(created(a)) || tie(a, b));
        const d = (p) => { const c = coordsOf(p); return c ? haversineKm(f.ref, c) : Infinity; };
        return out.sort((a, b) => d(a) - d(b) || tie(a, b));
      }
      default: return out.sort((a, b) => created(b).localeCompare(created(a)) || tie(a, b)); // relevance = newest first, like today
    }
  }
  const applyFilters = (all, f) => sortPgs(all.filter((p) => matches(p, f)), f);

  /* ---------------- A2: roommate score ---------------- */
  const QUIZ = [
    { key: 'sleep', q: 'When do you usually sleep?', weight: 25, options: ['Early bird (asleep by 10:30 pm)', 'Flexible', 'Night owl (after 1 am)'] },
    { key: 'tidy', q: 'How tidy is your space?', weight: 25, options: ['Everything in its place', 'Tidy enough', 'Relaxed'] },
    { key: 'noise', q: 'How much noise suits you?', weight: 15, options: ['Silence, please', 'Soft music is fine', 'A lively room'] },
    { key: 'study', q: 'Where do you study?', weight: 15, options: ['Mostly at the PG', 'A mix', 'Mostly outside or in the library'] },
    { key: 'visitors', q: 'How often do friends visit?', weight: 10, options: ['Rarely', 'Sometimes', 'Often'] },
    { key: 'food', q: 'Food habits', weight: 10, options: ['Strict vegetarian', 'Vegetarian, flexible', 'Non-veg is fine'] },
  ];
  /** 100 - sum(weight * |a - b|) / 2, rounded half up. Answers are 0, 1 or 2. */
  function roommateScore(a, b) {
    let loss = 0;
    QUIZ.forEach((q, i) => { loss += (q.weight * Math.abs((a[i] ?? 0) - (b[i] ?? 0))) / 2; });
    return Math.round(100 - loss);
  }
  const band = (s) => (s >= 80 ? 'Great match' : s >= 60 ? 'Good match' : s >= 40 ? 'Some differences' : 'Very different routines');
  /** Up to three "why you match" chips: the questions where both answers are identical. */
  const whyMatch = (a, b) => QUIZ.filter((_, i) => a[i] === b[i]).slice(0, 3).map((q) => q.key);
  const validAnswers = (x) => Array.isArray(x) && x.length === 6 && x.every((v) => Number.isInteger(v) && v >= 0 && v <= 2);

  /* ---------------- A6: rent status and schedule ---------------- */
  const GRACE_DAYS = 5;
  const day = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;
  function rentStatus(r, today, grace = GRACE_DAYS) {
    if (r.paid_at) return 'paid';
    if (r.waived) return 'waived';
    const late = day(today) - day(r.due_date);
    if (late < 0) return 'upcoming';
    return late <= grace ? 'due' : 'overdue';
  }
  /** One row per month of the stay, starting at the move-in month. The first row is due on the move-in date, later rows on the 1st. */
  function scheduleDates(moveIn, months) {
    const y = +moveIn.slice(0, 4), m = +moveIn.slice(5, 7) - 1;
    return Array.from({ length: Math.max(1, months) }, (_, i) => {
      if (i === 0) return moveIn;
      const d = new Date(Date.UTC(y, m + i, 1));
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
    });
  }
  /** Today's date in India as YYYY-MM-DD (all date logic in the PG manager uses this). */
  const todayIST = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

  /** Snapshot of the terms printed on a tenancy agreement (PG manager, F3). Pure: built from the owner, PG and tenancy. */
  function agreementTerms({ owner, pg, tenancy }) {
    const c = pg.charges || {};
    const d = new Date(Date.UTC(+tenancy.move_in.slice(0, 4), +tenancy.move_in.slice(5, 7) - 1 + tenancy.stay_months, Math.min(+tenancy.move_in.slice(8, 10), 28)));
    return {
      owner_name: owner ? owner.name : 'Owner', tenant_name: tenancy.tenant_name, pg_name: pg.name,
      pg_address: pg.address || `${pg.locality}, ${pg.city}`, room_label: tenancy.room_label, room_type: tenancy.room_type,
      monthly_rent: tenancy.monthly_rent, rent_due: 'The first month is due on the move-in date, later months on the 1st.',
      deposit_paid: tenancy.deposit_paid || 0, notice_days: c.notice_days ?? null, lock_in_months: c.lock_in_months ?? null, exit_fee: c.exit_fee ?? null,
      move_in: tenancy.move_in, end_date: d.toISOString().slice(0, 10), stay_months: tenancy.stay_months, house_rules: (pg.rules || []).slice(),
    };
  }

  Object.assign(lib, {
    agreementTerms, haversineKm, roundKm, AREAS, areasOf, cheapestRoom, computePassport,
    BUDGET_MIN, BUDGET_MAX, BUDGET_STEP, DEFAULT_FILTERS, gradeOf, bedsLeft, hasAc, areaOf, coordsOf, budgetPrice,
    activeFilterCount, matches, sortPgs, applyFilters,
    QUIZ, roommateScore, band, whyMatch, validAnswers,
    GRACE_DAYS, rentStatus, scheduleDates, todayIST,
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = lib;
})(typeof window !== 'undefined' ? window : globalThis);
