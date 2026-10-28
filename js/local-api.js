/**
 * Local demo backend.
 *
 * Implements the same REST contract as the documented FastAPI service (same paths, bodies, status codes and
 * error messages) on top of localStorage, so the UI code is identical in both modes.
 *
 * IMPORTANT: this is a demonstration backend. Data lives only in this browser, there is no real
 * authentication (the "token" is a plain `local.<user_id>` string), and nothing is shared between users
 * on different devices. Passwords are salted+hashed before storage, but that does not make this secure.
 */
(function (PGC) {
  'use strict';

  const { randomId, isEmail, isValidISODate } = PGC.utils;
  const STORAGE_KEY = 'pgc_local_db_v1';
  const err = (message, status = 400) => new PGC.ApiError(message, status);

  /* ---------- persistence (with an in-memory fallback if storage is blocked) ---------- */

  let memoryDb = null;
  let storageOk = true;

  const readRaw = () => {
    try { return window.localStorage.getItem(STORAGE_KEY); } catch (_) { storageOk = false; return null; }
  };
  const writeRaw = (value) => {
    try { window.localStorage.setItem(STORAGE_KEY, value); } catch (_) { storageOk = false; }
  };

  /* ---------- password hashing ---------- */

  const toHex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

  async function hashWith(algo, password, salt) {
    const text = `${salt}:${password}`;
    if (algo === 'sha256' && window.crypto && window.crypto.subtle) {
      const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return `sha256:${toHex(digest)}`;
    }
    if (algo === 'fnv') { // only used when SubtleCrypto is unavailable (very old / insecure contexts)
      let h = 0x811c9dc5;
      for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
      return `fnv:${h.toString(16)}`;
    }
    return null;
  }

  async function hashPassword(password) {
    const salt = randomId(16);
    const algo = window.crypto && window.crypto.subtle ? 'sha256' : 'fnv';
    return { salt, hash: await hashWith(algo, password, salt) };
  }

  async function verifyPassword(user, password) {
    if (!user.pw_hash) return false;
    const algo = user.pw_hash.split(':')[0];
    return (await hashWith(algo, password, user.pw_salt)) === user.pw_hash;
  }

  /* ---------- database lifecycle ---------- */

  async function createSeededDb() {
    const db = PGC.seed.buildSeed();
    db.version = 1;
    for (const user of db.users) {
      const { salt, hash } = await hashPassword(user._plain);
      user.pw_salt = salt;
      user.pw_hash = hash;
      delete user._plain;
    }
    return db;
  }

  async function load() {
    let db = null;
    const raw = readRaw();
    if (raw) {
      try { db = JSON.parse(raw); } catch (_) { db = null; }
    }
    if (!db && !storageOk && memoryDb) db = memoryDb;
    if (!db || (db.version !== 1 && db.version !== 2)) {
      db = await createSeededDb();
      writeRaw(JSON.stringify(db));
    }
    // Seed v2 is a migration of the stored database: it only adds (sample data, optional fields) and never
    // wipes or overwrites. It runs again only when the database is old or the sample-data switch changed.
    const wantSample = !(window.PGC_CONFIG && window.PGC_CONFIG.SEED_SAMPLE_PGS === false);
    if (PGC.seedV2 && (db.version === 1 || db.seedV2Sample !== wantSample)) {
      const stats = PGC.seedV2.apply(db, { sample: wantSample });
      db.version = 2;
      db.seedV2Sample = wantSample;
      writeRaw(JSON.stringify(db));
      if (window.console && console.info) console.info(`[seed v2] inserted ${stats.inserted}, already present ${stats.present}, backfilled ${stats.backfilled} fields`);
    }
    // One-time swap of the three room photos (see js/image-swap.js): only image paths are remapped.
    if (PGC.imageSwap && db.images_rev !== PGC.imageSwap.REV) {
      PGC.imageSwap.apply(db);
      writeRaw(JSON.stringify(db));
    }
    memoryDb = db;
    return db;
  }

  function save(db) {
    memoryDb = db;
    writeRaw(JSON.stringify(db));
  }

  /* ---------- projections ---------- */

  const publicUser = (u) => ({ user_id: u.user_id, name: u.name, email: u.email, role: u.role, phone: u.phone || '' });

  const pgSummary = (pg) => ({
    pg_id: pg.pg_id, name: pg.name, city: pg.city, locality: pg.locality, gender: pg.gender,
    price_from: pg.price_from, images: pg.images, verified: pg.verified, rating: pg.rating,
    review_count: pg.review_count, food_included: pg.food_included,
    // optional fields added by the upgrade (absent on older documents; they simply do not appear)
    area: pg.area, lat: pg.lat, lng: pg.lng, grade: pg.grade, room_types: pg.room_types, amenities: pg.amenities,
    charges: pg.charges, safety: pg.safety, short_stay_ok: pg.short_stay_ok, min_stay_months: pg.min_stay_months,
    is_sample: pg.is_sample, created_at: pg.created_at,
  });

  const newestFirst = (a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0);
  const str = (v) => (typeof v === 'string' ? v.trim() : '');

  /* ---------- guards ---------- */

  const requireUser = (ctx) => {
    if (!ctx.user) throw err('Not signed in', 401);
    return ctx.user;
  };
  const requireRole = (ctx, role) => {
    const user = requireUser(ctx);
    if (user.role !== role) throw err(role === 'tenant' ? 'Only tenants can do this' : 'Only owners can do this', 403);
    return user;
  };
  const findPg = (db, id) => db.pgs.find((p) => p.pg_id === id);

  /* ---------- route table ---------- */

  const routes = [];
  const route = (method, pattern, handler) => {
    const re = new RegExp('^' + pattern.replace(/:([a-z_]+)/g, '(?<$1>[^/]+)') + '$');
    routes.push({ method, re, handler });
  };

  route('GET', '/health', async () => ({ status: 'ok' }));
  route('POST', '/seed', async () => ({ ok: true }));

  /* auth */
  route('POST', '/auth/register', async ({ db, body }) => {
    const name = str(body.name);
    const email = str(body.email).toLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';
    const role = body.role;
    if (!name || !email || !password) throw err('Please fill all required fields', 422);
    if (!isEmail(email)) throw err('Enter a valid email address', 422);
    if (password.length < 6) throw err('Password must be at least 6 characters', 422);
    if (role !== 'tenant' && role !== 'owner') throw err('Role must be tenant or owner', 422);
    if (db.users.some((u) => u.email === email)) throw err('Email already registered', 400);
    const { salt, hash } = await hashPassword(password);
    const user = {
      user_id: randomId(12), name, email, role, phone: str(body.phone),
      pw_salt: salt, pw_hash: hash, created_at: new Date().toISOString(),
    };
    db.users.push(user);
    return { token: `local.${user.user_id}`, user: publicUser(user) };
  });

  route('POST', '/auth/login', async ({ db, body }) => {
    const email = str(body.email).toLowerCase();
    const user = db.users.find((u) => u.email === email);
    if (!user || !(await verifyPassword(user, String(body.password || '')))) throw err('Wrong email or password', 401);
    return { token: `local.${user.user_id}`, user: publicUser(user) };
  });

  route('GET', '/auth/me', async (ctx) => publicUser(requireUser(ctx)));

  /* PGs */
  route('GET', '/pgs', async ({ db, query }) => {
    const q = str(query.q).toLowerCase();
    const city = str(query.city).toLowerCase();
    const gender = str(query.gender);
    const food = query.food === 'true' || query.food === '1';
    return db.pgs
      .filter((p) => !q || [p.name, p.city, p.locality].some((f) => f.toLowerCase().includes(q)))
      .filter((p) => !city || p.city.toLowerCase() === city)
      .filter((p) => !gender || p.gender === gender)
      .filter((p) => !food || p.food_included)
      .sort(newestFirst)
      .map(pgSummary);
  });

  route('GET', '/pgs/:id', async ({ db, params }) => {
    const pg = findPg(db, params.id);
    if (!pg) throw err('PG not found', 404);
    const owner = db.users.find((u) => u.user_id === pg.owner_id);
    return { ...pg, owner: { user_id: pg.owner_id, name: owner ? owner.name : 'Owner' } };
  });

  route('POST', '/pgs', async (ctx) => {
    const user = requireRole(ctx, 'owner');
    const { db, body } = ctx;
    const name = str(body.name), city = str(body.city), locality = str(body.locality);
    const rooms = Array.isArray(body.room_types) ? body.room_types : [];
    if (!name || !city || !locality || !rooms.length) throw err('Name, city, locality and at least one room type are required', 422);
    const room_types = rooms.map((r) => ({
      type: str(r.type) || 'double', price: Number(r.price), available: Number(r.available) || 0, total: Number(r.total) || 0,
    }));
    if (room_types.some((r) => !(r.price > 0))) throw err('Room prices must be greater than 0', 422);
    const gender = ['female', 'male', 'unisex'].includes(body.gender) ? body.gender : 'unisex';
    const pg = {
      pg_id: randomId(12), owner_id: user.user_id, name, city, locality,
      address: str(body.address) || `${locality}, ${city}`,
      gender,
      description: str(body.description).slice(0, 1000),
      price_from: Number(body.price_from) > 0 ? Number(body.price_from) : Math.min(...room_types.map((r) => r.price)),
      amenities: Array.isArray(body.amenities) ? body.amenities.map(str).filter(Boolean) : [],
      rules: Array.isArray(body.rules) ? body.rules.map(str).filter(Boolean) : [],
      food_included: !!body.food_included,
      images: Array.isArray(body.images) && body.images.length ? body.images : PGC.seed.BASE_IMAGES.slice(),
      verified: true, // MVP behaviour: every created PG is auto-verified
      rating: 0, review_count: 0, room_types,
      created_at: new Date().toISOString(),
    };
    // Optional upgrade fields (safety, charges, short stay). Old payloads without them behave exactly as before.
    if (PGC.localApi && PGC.localApi.cleanPgExtras) Object.assign(pg, PGC.localApi.cleanPgExtras(body));
    db.pgs.push(pg);
    return pgSummary(pg);
  });

  route('DELETE', '/pgs/:id', async (ctx) => {
    const user = requireRole(ctx, 'owner');
    const { db, params } = ctx;
    const pg = db.pgs.find((p) => p.pg_id === params.id && p.owner_id === user.user_id);
    if (!pg) throw err('Listing not found', 404);
    // Cascade so nothing is left pointing at a deleted listing.
    db.pgs = db.pgs.filter((p) => p !== pg);
    db.reviews = db.reviews.filter((r) => r.pg_id !== pg.pg_id);
    db.shortlist = db.shortlist.filter((s) => s.pg_id !== pg.pg_id);
    db.bookings = db.bookings.filter((b) => b.pg_id !== pg.pg_id);
    db.messages = db.messages.filter((m) => m.pg_id !== pg.pg_id);
    return { ok: true };
  });

  route('GET', '/owner/pgs', async (ctx) => {
    const user = requireRole(ctx, 'owner');
    return ctx.db.pgs.filter((p) => p.owner_id === user.user_id).sort(newestFirst).map(pgSummary);
  });

  /* reviews */
  route('GET', '/pgs/:id/reviews', async ({ db, params }) => {
    if (!findPg(db, params.id)) throw err('PG not found', 404);
    return db.reviews.filter((r) => r.pg_id === params.id).sort(newestFirst);
  });

  route('POST', '/pgs/:id/reviews', async (ctx) => {
    const user = requireRole(ctx, 'tenant');
    const { db, params, body } = ctx;
    const pg = findPg(db, params.id);
    if (!pg) throw err('PG not found', 404);
    const rating = Number(body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw err('Rating must be between 1 and 5', 422);
    const review = {
      review_id: randomId(12), pg_id: pg.pg_id, tenant_id: user.user_id, tenant_name: user.name, rating,
      comment: str(body.comment).slice(0, 500), created_at: new Date().toISOString(),
    };
    db.reviews.push(review);
    const all = db.reviews.filter((r) => r.pg_id === pg.pg_id);
    pg.review_count = all.length;
    pg.rating = Math.round((all.reduce((sum, r) => sum + r.rating, 0) / all.length) * 10) / 10;
    return review;
  });

  /* shortlist */
  route('GET', '/shortlist', async (ctx) => {
    const user = requireUser(ctx);
    const { db } = ctx;
    return db.shortlist
      .filter((s) => s.user_id === user.user_id)
      .sort(newestFirst)
      .map((s) => findPg(db, s.pg_id))
      .filter(Boolean)
      .map(pgSummary);
  });

  route('POST', '/shortlist/:pg_id', async (ctx) => {
    const user = requireRole(ctx, 'tenant');
    const { db, params } = ctx;
    if (!findPg(db, params.pg_id)) throw err('PG not found', 404);
    if (!db.shortlist.some((s) => s.user_id === user.user_id && s.pg_id === params.pg_id)) {
      db.shortlist.push({ user_id: user.user_id, pg_id: params.pg_id, created_at: new Date().toISOString() });
    }
    return { ok: true };
  });

  route('DELETE', '/shortlist/:pg_id', async (ctx) => {
    const user = requireRole(ctx, 'tenant');
    ctx.db.shortlist = ctx.db.shortlist.filter((s) => !(s.user_id === user.user_id && s.pg_id === ctx.params.pg_id));
    return { ok: true };
  });

  /* bookings */
  route('POST', '/bookings', async (ctx) => {
    const user = requireRole(ctx, 'tenant');
    const { db, body } = ctx;
    const pg = findPg(db, body.pg_id);
    if (!pg) throw err('PG not found', 404);
    if (!isValidISODate(str(body.move_in_date))) throw err('Enter move-in date as YYYY-MM-DD', 422);
    const months = Number(body.duration_months);
    if (!Number.isInteger(months) || months < 1 || months > 36) throw err('Duration must be between 1 and 36 months', 422);
    const room = pg.room_types.find((r) => r.type === body.room_type);
    if (!room && body.room_type) throw err('That room type is not offered by this PG', 422);
    const booking = {
      booking_id: randomId(12), pg_id: pg.pg_id, pg_name: pg.name, pg_image: pg.images[0] || '',
      owner_id: pg.owner_id, tenant_id: user.user_id, tenant_name: user.name,
      room_type: room ? room.type : 'double', price: room ? room.price : pg.price_from,
      move_in_date: str(body.move_in_date), duration_months: months, message: str(body.message).slice(0, 500),
      status: 'pending', paid: false, created_at: new Date().toISOString(),
    };
    db.bookings.push(booking);
    return booking;
  });

  route('GET', '/bookings', async (ctx) => {
    const user = requireRole(ctx, 'tenant');
    return ctx.db.bookings.filter((b) => b.tenant_id === user.user_id).sort(newestFirst);
  });

  route('GET', '/owner/bookings', async (ctx) => {
    const user = requireRole(ctx, 'owner');
    return ctx.db.bookings.filter((b) => b.owner_id === user.user_id).sort(newestFirst);
  });

  route('GET', '/bookings/:id', async (ctx) => {
    const user = requireUser(ctx);
    const booking = ctx.db.bookings.find((b) => b.booking_id === ctx.params.id && (b.tenant_id === user.user_id || b.owner_id === user.user_id));
    if (!booking) throw err('Booking not found', 404);
    return booking;
  });

  route('PATCH', '/bookings/:id/status', async (ctx) => {
    const user = requireRole(ctx, 'owner');
    const booking = ctx.db.bookings.find((b) => b.booking_id === ctx.params.id && b.owner_id === user.user_id);
    if (!booking) throw err('Booking not found', 404);
    const status = ctx.body.status;
    if (status !== 'accepted' && status !== 'declined') throw err('Status must be accepted or declined', 422);
    if (booking.status !== 'pending') throw err(`This request was already ${booking.status}`, 400);
    booking.status = status;
    return booking;
  });

  route('POST', '/bookings/:id/pay', async (ctx) => {
    const user = requireRole(ctx, 'tenant');
    const booking = ctx.db.bookings.find((b) => b.booking_id === ctx.params.id && b.tenant_id === user.user_id);
    if (!booking) throw err('Booking not found', 404);
    if (booking.paid) throw err('Already paid', 400);
    if (booking.status !== 'accepted') throw err('Owner has not accepted this booking yet', 400);
    booking.paid = true;
    booking.paid_at = new Date().toISOString();
    booking.payment_method = str(ctx.body.method) || 'UPI';
    booking.payment_ref = 'MOCK-' + randomId(12).toUpperCase();
    return booking;
  });

  route('GET', '/owner/stats', async (ctx) => {
    const user = requireRole(ctx, 'owner');
    const { db } = ctx;
    const mine = db.bookings.filter((b) => b.owner_id === user.user_id);
    return {
      total_listings: db.pgs.filter((p) => p.owner_id === user.user_id).length,
      active_tenants: mine.filter((b) => b.status === 'accepted').length,
      pending_inquiries: mine.filter((b) => b.status === 'pending').length,
      rent_collected: mine.filter((b) => b.paid).reduce((sum, b) => sum + b.price, 0),
    };
  });

  /* chat: only the thread's tenant and the PG's owner may read or write */
  const chatAccess = (ctx) => {
    const user = requireUser(ctx);
    const pg = findPg(ctx.db, ctx.params.pg_id);
    if (!pg) throw err('PG not found', 404);
    const allowed = user.user_id === ctx.params.tenant_id || user.user_id === pg.owner_id;
    if (!allowed) throw err('Not your conversation', 403);
    return user;
  };

  route('GET', '/chat/:pg_id/:tenant_id', async (ctx) => {
    chatAccess(ctx);
    return ctx.db.messages
      .filter((m) => m.pg_id === ctx.params.pg_id && m.tenant_id === ctx.params.tenant_id)
      .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
  });

  route('POST', '/chat/:pg_id/:tenant_id', async (ctx) => {
    const user = chatAccess(ctx);
    const text = str(ctx.body.text).slice(0, 1000);
    if (!text) throw err('Message cannot be empty', 422);
    const message = {
      message_id: randomId(12), pg_id: ctx.params.pg_id, tenant_id: ctx.params.tenant_id,
      sender_id: user.user_id, sender_name: user.name, text, created_at: new Date().toISOString(),
    };
    ctx.db.messages.push(message);
    return message;
  });

  /* ---------- request entry point ---------- */

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clone = (value) => JSON.parse(JSON.stringify(value));

  async function run(method, path, { query = {}, body, token } = {}) {
    await sleep((window.PGC_CONFIG && window.PGC_CONFIG.LOCAL_LATENCY_MS) ?? 70);
    const db = await load();
    const userId = typeof token === 'string' && token.startsWith('local.') ? token.slice(6) : null;
    const user = userId ? db.users.find((u) => u.user_id === userId) || null : null;

    for (const r of routes) {
      if (r.method !== method) continue;
      const match = r.re.exec(path);
      if (!match) continue;
      const ctx = { db, params: match.groups || {}, query, body: body || {}, user };
      const result = await r.handler(ctx);
      if (method !== 'GET' || ctx.dirty) save(db); // a GET may ask to persist (ctx.dirty), e.g. an agreement built on first read
      return clone(result);
    }
    throw err('Not found', 404);
  }

  // Requests run one at a time so read-modify-write cycles can never interleave.
  let chain = Promise.resolve();
  function request(method, path, options) {
    const result = chain.then(() => run(method, path, options));
    chain = result.catch(() => {});
    return result;
  }

  /** Lets extension files (roommates, PG manager) add routes with the same guards and error type. */
  function extend(register) {
    register({ route, err, requireUser, requireRole, findPg, str, publicUser, newestFirst });
  }

  PGC.localApi = {
    request, extend,
    reset() { try { window.localStorage.removeItem(STORAGE_KEY); } catch (_) { /* ignore */ } memoryDb = null; },
  };
})(window.PGC);
