// Reference tests from the upgrade brief (Appendix A8), converted to plain Node. Run: node js/lib-reference.test.js
// Every assertion and number is the brief's own; they lock in the maths of js/lib-core.js.
const assert = require('assert');
const lib = require('./lib-core.js');
const { roommateScore, band, rentStatus, scheduleDates, haversineKm, computePassport, applyFilters, DEFAULT_FILTERS, activeFilterCount, validAnswers, AREAS } = lib;

const mine = [0, 1, 0, 1, 0, 1];
const profiles = [[0,0,1,1,1,1],[1,1,1,0,0,1],[2,2,2,2,2,2],[0,1,1,1,1,0],[2,1,2,2,1,2],[1,1,0,1,0,1]];
assert.deepStrictEqual(profiles.map((p) => roommateScore(mine, p)), [75, 73, 25, 83, 43, 88]);
assert.strictEqual(band(88), 'Great match'); assert.strictEqual(band(39), 'Very different routines');
assert.strictEqual(rentStatus({ due_date: '2026-11-01' }, '2026-10-29'), 'upcoming');
assert.strictEqual(rentStatus({ due_date: '2026-11-01' }, '2026-11-01'), 'due');
assert.strictEqual(rentStatus({ due_date: '2026-11-01' }, '2026-11-06'), 'due');
assert.strictEqual(rentStatus({ due_date: '2026-11-01' }, '2026-11-07'), 'overdue');
assert.strictEqual(rentStatus({ due_date: '2026-11-01', paid_at: '2026-11-03' }, '2026-12-30'), 'paid');
assert.deepStrictEqual(scheduleDates('2026-12-12', 3), ['2026-12-12', '2027-01-01', '2027-02-01']);
assert.deepStrictEqual(scheduleDates('2026-11-20', 3).slice(1), ['2026-12-01', '2027-01-01']);
const d = haversineKm({ lat: 12.9352, lng: 77.6245 }, { lat: 12.9116, lng: 77.6474 }); assert.ok(d > 3 && d < 4.5, String(d));
const base = { pg_id: 'pg_a', name: 'Sunshine Girls PG', city: 'Bengaluru', locality: 'Koramangala', gender: 'female', price_from: 9500, images: [], verified: true, rating: 4.6, review_count: 1, food_included: true,
  room_types: [{ type: 'single', price: 13500, available: 3, total: 8 }, { type: 'double', price: 9500, available: 3, total: 8 }], amenities: ['WiFi', 'AC', 'CCTV'],
  charges: { electricity: { mode: 'metered', est_monthly: 900 }, maintenance_monthly: 500, food: { mode: 'included' }, deposit_months: 2, notice_days: 30, lock_in_months: 0, exit_fee: 1000 },
  safety: { cctv: true, night_guard: true }, lat: 12.93, lng: 77.62, grade: 'verified_plus' };
const p = computePassport(base, 'double');
assert.deepStrictEqual([p.rent, p.trueMonthly, p.extraOverRent, p.depositAmount, p.moveInCash, p.complete], [9500, 10900, 1400, 19000, 28500, true]);
const other = { ...base, pg_id: 'pg_b', name: 'Other', gender: 'male', verified: true, grade: 'verified', amenities: ['WiFi'], safety: {}, room_types: [{ type: 'triple', price: 6000, available: 0, total: 8 }], price_from: 6000, charges: null, lat: 12.99, lng: 77.75 };
const all = [base, other];
const f = (x) => ({ ...DEFAULT_FILTERS, ...x });
const ids = (list) => list.map((x) => x.pg_id);
assert.deepStrictEqual(ids(applyFilters(all, f({ safety: ['wov', 'cctv'] }))), ['pg_a']);
assert.deepStrictEqual(ids(applyFilters(all, f({ ac: true }))), ['pg_a']);
assert.deepStrictEqual(ids(applyFilters(all, f({ availableNow: true }))), ['pg_a']);
assert.deepStrictEqual(ids(applyFilters(all, f({ minGrade: 'verified_plus' }))), ['pg_a']);
assert.deepStrictEqual(ids(applyFilters(all, f({ share: ['triple'] }))), ['pg_b']);
assert.deepStrictEqual(ids(applyFilters(all, f({ max: 7000 }))), ['pg_b']);
assert.deepStrictEqual(ids(applyFilters(all, f({ sort: 'price_asc' }))), ['pg_b', 'pg_a']);
assert.deepStrictEqual(ids(applyFilters(all, f({ distKm: 2, ref: { lat: 12.9352, lng: 77.6245 } }))), ['pg_a']);
assert.strictEqual(activeFilterCount(f({ ac: true, safety: ['cctv', 'wov'], max: 20000 })), 3);
assert.strictEqual(computePassport(other, null).complete, false);
assert.deepStrictEqual(ids(applyFilters([{ ...base, locality: 'Koramangala 5th Block', area: 'Koramangala' }, { ...other, locality: 'HSR Layout' }], f({ area: 'Koramangala' }))), ['pg_a']);
assert.deepStrictEqual(ids(applyFilters([{ ...base, locality: 'Koramangala 5th Block' }], f({ area: 'Koramangala' }))), []);
assert.strictEqual(roommateScore([0,0,0,0,0,0], [0,0,1,0,0,0]), 93);
assert.strictEqual(roommateScore([0,0,0,0,0,0], [1,0,0,0,0,0]), 88);
// from A9 (Python tests), ported: validity rules and the empty/full extremes
assert.strictEqual(roommateScore([0,0,0,0,0,0], [0,0,0,0,0,0]), 100); assert.strictEqual(roommateScore([0,0,0,0,0,0], [2,2,2,2,2,2]), 0);
assert.ok(validAnswers([0,1,2,0,1,2]) && !validAnswers([0,1,2]) && !validAnswers([0,1,2,0,1,3]));
assert.strictEqual(AREAS.length, 16);
assert.strictEqual(scheduleDates('2026-01-05', 14).length, 14); assert.strictEqual(scheduleDates('2026-01-05', 14).pop(), '2027-02-01');
console.log('all reference tests passed');
