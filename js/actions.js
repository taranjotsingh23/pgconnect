/**
 * Cross-view actions that more than one screen needs.
 */
(function (PGC) {
  'use strict';

  /**
   * Sends a signed-out visitor to the login page and brings them back to the current screen afterwards.
   * @returns {boolean} true if the visitor is signed in and may continue
   */
  function requireLogin(message) {
    if (PGC.auth.isSignedIn) return true;
    if (message) PGC.ui.toast(message);
    PGC.router.go('/login?next=' + encodeURIComponent(PGC.router.currentHash()));
    return false;
  }

  /** Visible state of the save heart for a PG, for rendering cards. */
  async function savedIds() {
    if (!PGC.auth.isTenant) return new Set();
    try {
      const list = await PGC.query.get(['shortlist'], () => PGC.api.shortlist());
      return new Set(list.map((p) => p.pg_id));
    } catch (_) {
      return new Set();
    }
  }

  /**
   * Toggles the shortlist state of one PG. The caller supplies the current state (taken from the UI)
   * and gets the new state back, or `null` when nothing was changed (redirected to login / not a tenant).
   */
  async function toggleSave(pgId, currentlySaved) {
    if (!requireLogin('Log in to save PGs')) return null;
    if (!PGC.auth.isTenant) return null;
    const op = (async () => {
      if (currentlySaved) await PGC.api.unsave(pgId); else await PGC.api.save(pgId);
      PGC.query.invalidate(['shortlist']);
    })();
    PGC.query.track(op); // reads of the shortlist wait for this to finish, even if the user navigates away
    await op;
    PGC.ui.toast(currentlySaved ? 'Removed from saved' : 'Saved to your shortlist', { type: 'success' });
    return !currentlySaved;
  }

  /** Updates a heart button's markup in place (works for card hearts and the detail-page heart). */
  function paintHeart(btn, saved) {
    btn.setAttribute('aria-pressed', saved ? 'true' : 'false');
    const label = btn.getAttribute('aria-label') || '';
    btn.setAttribute('aria-label', label.replace(/^(Save|Remove|Saved)/, saved ? 'Remove' : 'Save'));
    const icon = btn.querySelector('[aria-hidden]');
    if (icon) icon.textContent = saved ? '❤️' : '🤍';
  }

  PGC.actions = { requireLogin, savedIds, toggleSave, paintHeart };
})(window.PGC);
