/**
 * API layer: one `request()` function that talks either to the FastAPI backend (online mode) or to the
 * local demo backend (js/local-api.js), plus a thin typed wrapper per endpoint.
 */
(function (PGC) {
  'use strict';

  /* ---------- tiny event bus ---------- */
  const listeners = {};
  PGC.events = {
    on(name, fn) {
      (listeners[name] = listeners[name] || new Set()).add(fn);
      return () => listeners[name].delete(fn);
    },
    emit(name, detail) {
      (listeners[name] || []).forEach((fn) => { try { fn(detail); } catch (e) { console.error(e); } });
    },
  };

  /* ---------- errors ---------- */
  class ApiError extends Error {
    constructor(message, status = 0) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
    }
  }
  PGC.ApiError = ApiError;

  /* ---------- token storage (localStorage, in-memory fallback) ---------- */
  const TOKEN_KEY = 'pgc_token';
  let memoryToken = null;
  const token = {
    get() {
      try { return window.localStorage.getItem(TOKEN_KEY) || memoryToken; } catch (_) { return memoryToken; }
    },
    set(value) {
      memoryToken = value;
      try { window.localStorage.setItem(TOKEN_KEY, value); } catch (_) { /* storage blocked: memory only */ }
    },
    clear() {
      memoryToken = null;
      try { window.localStorage.removeItem(TOKEN_KEY); } catch (_) { /* ignore */ }
    },
  };

  const apiBase = () => (window.PGC_CONFIG.API_URL || '').replace(/\/+$/, '');
  const isRemote = () => !!apiBase();

  const detailToMessage = (payload, status) => {
    const detail = payload && payload.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
      const msgs = detail.map((d) => d && d.msg).filter(Boolean);
      if (msgs.length) return msgs.join('. ');
    }
    return `Request failed (${status})`;
  };

  async function remoteRequest(method, path, { query, body, authToken }) {
    const qs = PGC.utils.buildQuery(query);
    const url = `${apiBase()}/api${path}${qs ? `?${qs}` : ''}`;
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (authToken) headers.Authorization = `Bearer ${authToken}`;

    let res;
    try {
      res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    } catch (_) {
      throw new ApiError('Cannot reach the server. Is the backend running?', 0);
    }
    let payload = null;
    try { payload = await res.json(); } catch (_) { /* empty body */ }
    if (!res.ok) throw new ApiError(detailToMessage(payload, res.status), res.status);
    return payload;
  }

  /**
   * @param {string} method
   * @param {string} path  e.g. "/pgs"
   * @param {{query?:object, body?:object, auth?:boolean}} [opts]  auth=false for login/register (no token sent)
   */
  async function request(method, path, { query, body, auth = true } = {}) {
    const authToken = auth ? token.get() : null;
    try {
      return isRemote()
        ? await remoteRequest(method, path, { query, body, authToken })
        : await PGC.localApi.request(method, path, { query, body, token: authToken });
    } catch (e) {
      // A 401 while we were sending a token means the session is gone (expired / revoked).
      if (e instanceof ApiError && e.status === 401 && authToken) PGC.events.emit('unauthorized');
      throw e;
    }
  }

  const get = (path, query) => request('GET', path, { query });
  const post = (path, body, opts) => request('POST', path, { body, ...opts });

  PGC.api = {
    token,
    mode: () => (isRemote() ? 'online' : 'local'),
    request,

    // auth
    login: (email, password) => post('/auth/login', { email, password }, { auth: false }),
    register: (payload) => post('/auth/register', payload, { auth: false }),
    me: () => get('/auth/me'),

    // PGs
    listPgs: ({ q, gender, city, food } = {}) =>
      get('/pgs', { q: q || undefined, gender: gender || undefined, city: city || undefined, food: food ? 'true' : undefined }),
    getPg: (id) => get(`/pgs/${encodeURIComponent(id)}`),
    createPg: (payload) => post('/pgs', payload),
    deletePg: (id) => request('DELETE', `/pgs/${encodeURIComponent(id)}`),
    ownerPgs: () => get('/owner/pgs'),

    // reviews
    reviews: (id) => get(`/pgs/${encodeURIComponent(id)}/reviews`),
    addReview: (id, rating, comment) => post(`/pgs/${encodeURIComponent(id)}/reviews`, { rating, comment }),

    // shortlist
    shortlist: () => get('/shortlist'),
    save: (id) => post(`/shortlist/${encodeURIComponent(id)}`),
    unsave: (id) => request('DELETE', `/shortlist/${encodeURIComponent(id)}`),

    // bookings
    createBooking: (payload) => post('/bookings', payload),
    myBookings: () => get('/bookings'),
    ownerBookings: () => get('/owner/bookings'),
    getBooking: (id) => get(`/bookings/${encodeURIComponent(id)}`),
    setBookingStatus: (id, status) => request('PATCH', `/bookings/${encodeURIComponent(id)}/status`, { body: { status } }),
    pay: (id, method) => post(`/bookings/${encodeURIComponent(id)}/pay`, { method }),
    ownerStats: () => get('/owner/stats'),

    // chat
    chat: (pgId, tenantId) => get(`/chat/${encodeURIComponent(pgId)}/${encodeURIComponent(tenantId)}`),
    sendChat: (pgId, tenantId, text) => post(`/chat/${encodeURIComponent(pgId)}/${encodeURIComponent(tenantId)}`, { text }),

    // roommates and batch groups (tenants only)
    roommateProfile: () => get('/roommate/profile'),
    saveRoommate: (payload) => request('PUT', '/roommate/profile', { body: payload }),
    deleteRoommate: () => request('DELETE', '/roommate/profile'),
    roommateMatches: (city) => get('/roommate/matches', { city: city || undefined }),
    batches: (city) => get('/batches', { city: city || undefined }),
    batch: (id) => get(`/batches/${encodeURIComponent(id)}`),
    joinBatch: (id) => post(`/batches/${encodeURIComponent(id)}/join`),
    leaveBatch: (id) => request('DELETE', `/batches/${encodeURIComponent(id)}/join`),

    // PG manager (owners only)
    manage: (path, { method = 'GET', body, query } = {}) => request(method, `/manage${path}`, { body, query }),
  };

  /** Sample photos attached to new listings until real image upload exists. */
  PGC.sampleImages = () => PGC.seed.BASE_IMAGES.slice();
})(window.PGC);
