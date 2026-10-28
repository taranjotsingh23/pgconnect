/**
 * Minimal query cache (a small subset of what React Query does for the mobile app):
 * - results are reused for `staleTime` (20 s by default)
 * - identical in-flight requests are shared
 * - `invalidate(prefix)` marks matching keys stale so the next read refetches
 *
 * Keys are arrays, e.g. ['pgs', q, gender, city, food]. Invalidating ['pgs'] hits all of them.
 */
(function (PGC) {
  'use strict';

  const STALE_MS = 20000;
  const cache = new Map(); // key string -> { data, at, promise, stale }

  const keyOf = (key) => (Array.isArray(key) ? key.map((k) => (k ?? '')).join('|') : String(key));

  // Optimistic actions (e.g. the save heart) let the user navigate before the request finishes. Reads wait for
  // those tracked mutations so a screen never renders data older than the user's own last action.
  const pending = new Set();
  function track(promise) {
    pending.add(promise);
    const done = () => pending.delete(promise);
    promise.then(done, done);
    return promise;
  }

  /** Returns cached data when fresh, otherwise runs `fetcher` (deduplicated). */
  function get(key, fetcher, opts = {}) {
    if (pending.size) return Promise.allSettled([...pending]).then(() => get(key, fetcher, opts));
    const { force = false } = opts;
    const k = keyOf(key);
    const hit = cache.get(k);
    if (hit && !force && !hit.stale && hit.data !== undefined && Date.now() - hit.at < STALE_MS) {
      return Promise.resolve(hit.data);
    }
    if (hit && hit.promise) return hit.promise;

    const entry = hit || {};
    entry.promise = fetcher()
      .then((data) => {
        entry.data = data;
        entry.at = Date.now();
        entry.stale = false;
        entry.promise = null;
        return data;
      })
      .catch((e) => {
        entry.promise = null;
        throw e;
      });
    cache.set(k, entry);
    return entry.promise;
  }

  /** Marks every key equal to, or nested under, any given prefix as stale. */
  function invalidate(...prefixes) {
    prefixes.forEach((prefix) => {
      const p = keyOf(prefix);
      cache.forEach((entry, k) => {
        if (k === p || k.startsWith(p + '|')) {
          entry.stale = true;
          entry.promise = null; // do not let a pre-mutation request satisfy the next read
        }
      });
    });
  }

  /** Forget everything (used on sign-in / sign-out so one user never sees another's cached data). */
  const clear = () => cache.clear();

  PGC.query = { get, invalidate, clear, track };
})(window.PGC);
