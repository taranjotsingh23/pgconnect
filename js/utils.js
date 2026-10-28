/**
 * Small, dependency-free helpers shared by every module.
 * Everything is attached to the single global namespace `PGC`.
 */
window.PGC = window.PGC || {};

(function (PGC) {
  'use strict';

  /* ---------- HTML escaping + safe template tag ---------- */

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

  /** Marks a string as already-safe markup so `html` will not escape it again. */
  class SafeHtml {
    constructor(value) { this.value = value; }
    toString() { return this.value; }
  }
  const raw = (value) => new SafeHtml(String(value ?? ''));

  const toMarkup = (value) => {
    if (value instanceof SafeHtml) return value.value;
    if (Array.isArray(value)) return value.map(toMarkup).join('');
    if (value === null || value === undefined || value === false || value === true) return '';
    return esc(value);
  };

  /**
   * Tagged template: interpolated values are HTML-escaped unless they came from `html`/`raw`.
   * This is the only way views build markup, so user-generated text (reviews, chat, PG names)
   * can never inject HTML.
   */
  const html = (strings, ...values) => {
    let out = '';
    strings.forEach((s, i) => {
      out += s;
      if (i < values.length) out += toMarkup(values[i]);
    });
    return new SafeHtml(out);
  };

  /* ---------- formatting ---------- */

  /** ₹ with Indian digit grouping, e.g. ₹1,20,000 */
  const formatINR = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

  const GENDER_LABELS = { female: 'Girls', male: 'Boys', unisex: 'Co-living' };
  const genderLabel = (g) => GENDER_LABELS[g] || 'Co-living';

  const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
  const initial = (name) => (name ? name.trim().charAt(0).toUpperCase() : '?');
  const firstName = (name) => (name ? name.trim().split(/\s+/)[0] : '');
  const formatRating = (r) => Number(r || 0).toFixed(1);
  const pluralPG = (n) => (n === 1 ? 'PG' : 'PGs');

  const todayISO = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
  const isValidISODate = (s) => {
    if (!ISO_DATE.test(s)) return false;
    // Parse as UTC so the round-trip comparison is timezone independent (local parsing breaks east of UTC).
    const d = new Date(s + 'T00:00:00Z');
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  };

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isEmail = (s) => EMAIL_RE.test(s);

  /* ---------- misc ---------- */

  const debounce = (fn, ms) => {
    let t;
    const wrapped = (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
    wrapped.cancel = () => clearTimeout(t);
    return wrapped;
  };

  const randomId = (len = 12) => {
    const bytes = new Uint8Array(len);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    return Array.from(bytes, (b) => (b % 36).toString(36)).join('');
  };

  /** Parses "a=1&b=two" into an object (decoded). */
  const parseQuery = (qs) => {
    const out = {};
    new URLSearchParams(qs || '').forEach((v, k) => { out[k] = v; });
    return out;
  };

  /** Builds "a=1&b=two", skipping empty values. */
  const buildQuery = (obj) => {
    const sp = new URLSearchParams();
    Object.entries(obj || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '' && v !== false) sp.set(k, v === true ? '1' : v);
    });
    return sp.toString();
  };

  /** Only same-app routes are allowed as post-login destinations (no open redirects). */
  const safeNext = (next) => (typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '');

  const $ = (sel, root = document) => root.querySelector(sel);

  PGC.utils = {
    esc, raw, html, SafeHtml, formatINR, genderLabel, capitalize, initial, firstName, formatRating, pluralPG,
    todayISO, isValidISODate, isEmail, debounce, randomId, parseQuery, buildQuery, safeNext, $,
  };
})(window.PGC);
