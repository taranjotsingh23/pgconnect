/**
 * Hash router (#/path?query). Hash routing works with any static server, including VS Code Live Server,
 * and needs no server-side rewrite rules.
 *
 * Each route: { path, view, access, nav, layout, title }
 *   access  'public' | 'guest' (logged-out only) | 'auth' | 'tenant' | 'owner'
 *   nav     path of the navigation item to highlight
 *   layout  'default' | 'auth' | 'detail' | 'chat'  (controls footer / tab bar visibility via body[data-layout])
 */
(function (PGC) {
  'use strict';

  const { $, parseQuery, buildQuery } = PGC.utils;
  const routes = [];
  let active = null;      // { ctx, abort }
  let navToken = 0;       // guards against overlapping async navigations
  let suppressNext = false;
  let navCount = 0;       // in-app navigations so far; tells us whether history.back() stays inside the app

  function add(def) {
    const names = [];
    const re = new RegExp('^' + def.path.replace(/:([a-zA-Z_]+)/g, (_, n) => { names.push(n); return '([^/]+)'; }) + '$');
    routes.push({ ...def, re, names });
  }

  const currentHash = () => location.hash.replace(/^#/, '') || '/';

  function parse(hash) {
    const i = hash.indexOf('?');
    let path = i >= 0 ? hash.slice(0, i) : hash;
    const query = parseQuery(i >= 0 ? hash.slice(i + 1) : '');
    if (path.length > 1) path = path.replace(/\/+$/, '');
    return { path: path || '/', query };
  }

  function match(path) {
    for (const r of routes) {
      const m = r.re.exec(path);
      if (m) {
        const params = {};
        r.names.forEach((n, i) => { params[n] = decodeURIComponent(m[i + 1]); });
        return { route: r, params };
      }
    }
    return null;
  }

  /** Navigate to an in-app route. */
  function go(path, { replace = false } = {}) {
    const target = '#' + path;
    if (location.hash === target) { resolve(); return; }
    if (replace) location.replace(target); else location.hash = target;
  }

  /** Goes back one step if the app has been navigated in this tab, otherwise to a fallback route. */
  function back(fallback = '/') {
    if (navCount > 1) history.back(); else go(fallback);
  }

  /** Updates the URL without re-rendering (used for filter state). */
  function setQuery(obj) {
    const { path } = parse(currentHash());
    const qs = buildQuery(obj);
    suppressNext = true;
    history.replaceState(null, '', '#' + path + (qs ? '?' + qs : ''));
    // replaceState never fires hashchange, but reset in case a browser does.
    setTimeout(() => { suppressNext = false; }, 0);
  }

  /** Returns a redirect path if the current user may not see this route, otherwise null. */
  function guard(route, fullPath) {
    const auth = PGC.auth;
    if (route.access === 'guest' && auth.isSignedIn) return auth.homePath();
    if (['auth', 'tenant', 'owner'].includes(route.access) && !auth.isSignedIn) return '/login?next=' + encodeURIComponent(fullPath);
    if (route.access === 'tenant' && auth.isOwner) return '/owner/dashboard';
    if (route.access === 'owner' && auth.isTenant) return '/';
    if (route.ownerRedirect && auth.isOwner) return '/owner/dashboard';
    return null;
  }

  function makeContext(found, path, query) {
    const controller = new AbortController();
    const app = $('#app');
    const { signal } = controller;
    const ctx = {
      path, query, params: found.params, route: found.route, signal, app,
      alive: () => !signal.aborted,
      render(markup) { app.innerHTML = String(markup); },
      title(t) { document.title = t ? `${t} | PGConnect` : 'PGConnect'; },
      /** Delegated listener on #app, removed automatically when the view is left. */
      on(type, selector, handler) {
        app.addEventListener(type, (e) => {
          const el = e.target.closest(selector);
          if (el && app.contains(el)) handler(e, el);
        }, { signal });
      },
      interval(fn, ms) {
        const id = setInterval(fn, ms);
        signal.addEventListener('abort', () => clearInterval(id));
      },
      onDestroy(fn) { signal.addEventListener('abort', fn); },
      go, setQuery,
    };
    return { ctx, abort: () => controller.abort() };
  }

  async function resolve() {
    if (suppressNext) return;
    const token = ++navToken;
    const hash = currentHash();
    const { path, query } = parse(hash);
    const found = match(path) || match('/404');

    const redirect = guard(found.route, hash);
    if (redirect) { location.replace('#' + redirect); return; }

    navCount += 1;
    if (active) active.abort();
    const { ctx, abort } = makeContext(found, path, query);
    active = { ctx, abort };

    document.body.dataset.layout = found.route.layout || 'default';
    const navPath = typeof found.route.nav === 'function' ? found.route.nav() : found.route.nav;
    PGC.shell.renderNav(navPath || path);
    window.scrollTo(0, 0);

    try {
      await found.route.view(ctx);
      if (token === navToken) {
        const app = $('#app');
        app.setAttribute('tabindex', '-1');
        app.focus({ preventScroll: true });
      }
    } catch (e) {
      console.error(e);
      if (ctx.alive()) {
        ctx.render(PGC.c.errorState(e.message || 'Unexpected error'));
        const retry = ctx.app.querySelector('[data-action="retry"]');
        if (retry) retry.addEventListener('click', () => resolve());
      }
    }
  }

  function start() {
    window.addEventListener('hashchange', resolve);
    return resolve();
  }

  PGC.router = { add, go, back, start, resolve, setQuery, parse, currentHash };
})(window.PGC);
