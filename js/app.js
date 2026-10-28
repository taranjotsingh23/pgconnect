/**
 * Boot: register routes, restore the session, wire global handlers, start the router.
 */
(function (PGC) {
  'use strict';

  const V = PGC.views;
  const add = PGC.router.add;

  /* ----- routes ----- */
  // A feature switch that is off redirects its route home.
  const gated = (flag, view) => (ctx) => (PGC.features.on(flag) ? view(ctx) : ctx.go(PGC.auth.homePath(), { replace: true }));
  add({ path: '/', view: V.explore, access: 'public', ownerRedirect: true, nav: '/' });
  add({ path: '/pg/:id', view: V.pgDetail, access: 'public', layout: 'detail', nav: () => (PGC.auth.isOwner ? '/owner/listings' : '/') });

  add({ path: '/login', view: V.login, access: 'guest', layout: 'auth' });
  add({ path: '/signup', view: V.signup, access: 'guest', layout: 'auth' });

  add({ path: '/saved', view: V.saved, access: 'tenant', nav: '/saved' });
  add({ path: '/bookings', view: V.bookings, access: 'tenant', nav: '/bookings' });
  add({ path: '/pay/:id', view: V.pay, access: 'tenant', nav: '/bookings' });
  add({ path: '/chat/:pgId', view: V.chat, access: 'auth', layout: 'chat', nav: () => (PGC.auth.isOwner ? '/owner/inquiries' : '/bookings') });
  add({ path: '/profile', view: V.profile, access: 'auth', nav: '/profile' });

  add({ path: '/owner/dashboard', view: V.dashboard, access: 'owner', nav: '/owner/dashboard' });
  add({ path: '/owner/listings', view: V.listings, access: 'owner', nav: '/owner/listings' });
  add({ path: '/owner/listings/new', view: V.addListing, access: 'owner', nav: '/owner/listings' });
  add({ path: '/owner/inquiries', view: V.bookings, access: 'owner', nav: '/owner/inquiries' });
  add({ path: '/owner/manage', view: gated('PG_MANAGER', V.manage), access: 'owner', nav: '/owner/manage' });

  // Upgrade routes. A feature switch that is off redirects its route home.
  add({ path: '/roommates', view: gated('ROOMMATES', V.roommates), access: 'tenant', nav: '/roommates' });
  add({ path: '/compare', view: gated('COMPARE', V.compare), access: 'public', ownerRedirect: true, nav: '/' });

  add({ path: '/about', view: V.about, access: 'public', nav: '/about' });
  add({ path: '/for-owners', view: V.forOwners, access: 'public', nav: '/for-owners' });
  add({ path: '/faq', view: V.faq, access: 'public' });
  add({ path: '/terms', view: V.terms, access: 'public' });
  add({ path: '/privacy', view: V.privacy, access: 'public' });
  add({ path: '/404', view: V.notFound, access: 'public' });

  /* ----- global handlers ----- */

  // "← Back" buttons: step back inside the app, or go to the fallback route when there is no history.
  document.addEventListener('click', (e) => {
    const back = e.target.closest('[data-action="back"]');
    if (back) { e.preventDefault(); PGC.router.back(back.dataset.fallback || '/'); }
    if (e.target.closest('[data-action="skip"]')) { const app = document.getElementById('app'); app.setAttribute('tabindex', '-1'); app.focus(); }
  });

  // A rejected token anywhere in the app ends the session politely.
  PGC.events.on('unauthorized', () => {
    if (!PGC.auth.isSignedIn) return;
    const here = PGC.router.currentHash();
    PGC.auth.logout();
    PGC.ui.toast('Session expired, please sign in again', { type: 'error' });
    PGC.router.go('/login?next=' + encodeURIComponent(here), { replace: true });
  });

  PGC.events.on('auth', () => PGC.shell.renderNav(PGC.router.parse(PGC.router.currentHash()).path));

  /* ----- start ----- */
  async function boot() {
    PGC.shell.bindGlobalHandlers();
    const year = document.getElementById('footer-year');
    if (year) year.textContent = new Date().getFullYear();

    await PGC.auth.init();
    if (PGC.compare) PGC.compare.init();
    PGC.router.start();
  }

  boot();
})(window.PGC);
