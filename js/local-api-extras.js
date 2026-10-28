/**
 * Validation of the OPTIONAL listing fields added by the upgrade (safety, charges, short stay, area, position).
 * Called by POST /pgs in js/local-api.js. A payload without these keys returns {} and behaves exactly as before.
 * `grade` and `is_sample` are never read from a payload: only seed data or the PGConnect team can set them.
 */
(function (PGC) {
  'use strict';

  const fail = (msg) => new PGC.ApiError(msg, 422);
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const MAX_MONEY = 100000;

  function whole(value, label, max) {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0 || n > max) throw fail(`${label} must be a whole number from 0 to ${max.toLocaleString('en-IN')}`);
    return n;
  }

  function cleanSafety(s) {
    if (!isObj(s)) return undefined;
    const out = {};
    ['cctv', 'night_guard', 'fire_exit_clear', 'curfew_flexible', 'women_only_floor'].forEach((k) => {
      if (typeof s[k] === 'boolean') out[k] = s[k];
    });
    if (typeof s.curfew_time === 'string' && /^\d{1,2}:\d{2}\s?(AM|PM)$/i.test(s.curfew_time.trim())) out.curfew_time = s.curfew_time.trim().toUpperCase();
    return Object.keys(out).length ? out : undefined;
  }

  function cleanCharges(c) {
    if (!isObj(c)) return undefined;
    const out = {};
    if (isObj(c.electricity)) {
      const mode = ['metered', 'included', 'fixed'].includes(c.electricity.mode) ? c.electricity.mode : null;
      if (mode) out.electricity = { mode, est_monthly: mode === 'included' ? 0 : whole(c.electricity.est_monthly ?? 0, 'Electricity estimate', MAX_MONEY) };
    }
    if (c.maintenance_monthly != null) out.maintenance_monthly = whole(c.maintenance_monthly, 'Maintenance', MAX_MONEY);
    if (isObj(c.food) && ['included', 'optional', 'none'].includes(c.food.mode)) {
      out.food = { mode: c.food.mode };
      if (c.food.mode === 'optional') out.food.optional_price = whole(c.food.optional_price ?? 0, 'Food price', MAX_MONEY);
    }
    if (c.deposit_months != null) out.deposit_months = whole(c.deposit_months, 'Deposit months', 6);
    if (c.deposit_refund_days != null) out.deposit_refund_days = whole(c.deposit_refund_days, 'Deposit refund days', 90);
    if (c.notice_days != null) out.notice_days = whole(c.notice_days, 'Notice days', 180);
    if (c.lock_in_months != null) out.lock_in_months = whole(c.lock_in_months, 'Lock-in months', 24);
    if (c.exit_fee != null) out.exit_fee = whole(c.exit_fee, 'Exit fee', MAX_MONEY);
    return Object.keys(out).length ? out : undefined;
  }

  /** @returns {object} only the optional fields that were supplied and valid */
  function cleanPgExtras(body) {
    const out = {};
    const safety = cleanSafety(body.safety);
    if (safety) out.safety = safety;
    const charges = cleanCharges(body.charges);
    if (charges) out.charges = charges;
    if (typeof body.short_stay_ok === 'boolean') out.short_stay_ok = body.short_stay_ok;
    if (body.min_stay_months != null) { const n = Number(body.min_stay_months); if (Number.isInteger(n) && n >= 1 && n <= 24) out.min_stay_months = n; }
    if (typeof body.area === 'string' && body.area.trim()) out.area = body.area.trim().slice(0, 60);
    const lat = Number(body.lat), lng = Number(body.lng);
    if (body.lat != null && body.lng != null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) { out.lat = lat; out.lng = lng; }
    return out;
  }

  PGC.localApi.cleanPgExtras = cleanPgExtras;
})(window.PGC);
