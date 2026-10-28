/**
 * Session state. Holds the current user and exposes login / register / logout.
 * Emits `auth` on PGC.events whenever the signed-in user changes so the shell can re-render.
 */
(function (PGC) {
  'use strict';

  const auth = {
    user: null,

    get isTenant() { return !!this.user && this.user.role === 'tenant'; },
    get isOwner() { return !!this.user && this.user.role === 'owner'; },
    get isSignedIn() { return !!this.user; },

    /** Role-specific landing route. */
    homePath() { return this.isOwner ? '/owner/dashboard' : '/'; },

    /** Restores the session from the stored token (called once at start-up). */
    async init() {
      if (!PGC.api.token.get()) return;
      try {
        this.user = await PGC.api.me();
      } catch (e) {
        // A rejected token is dropped; a network failure keeps it so a later reload can recover.
        if (e.status === 401 || e.status === 404) PGC.api.token.clear();
      }
    },

    _setSession({ token, user }) {
      PGC.api.token.set(token);
      this.user = user;
      PGC.query.clear();
      PGC.events.emit('auth', user);
    },

    async login(email, password) {
      this._setSession(await PGC.api.login(email, password));
      return this.user;
    },

    async register(payload) {
      this._setSession(await PGC.api.register(payload));
      return this.user;
    },

    logout() {
      PGC.api.token.clear();
      this.user = null;
      PGC.query.clear();
      PGC.events.emit('auth', null);
    },
  };

  PGC.auth = auth;
})(window.PGC);
