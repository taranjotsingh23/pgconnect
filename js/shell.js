/**
 * App shell: top navigation bar (desktop / tablet), bottom tab bar (phones), user menu and footer.
 * Re-rendered whenever the user changes (`auth` event) or the route changes.
 */
(function (PGC) {
  'use strict';

  const { html, initial, firstName, $ } = PGC.utils;

  // `emoji` mirrors the Android tab bar; `label` is used in the top bar, `tab` in the phone tab bar.
  const NAV = {
    guest: [
      { path: '/', label: 'Explore' },
      { path: '/for-owners', label: 'List your PG' },
      { path: '/about', label: 'About' },
    ],
    tenant: [
      { path: '/', label: 'Explore', tab: 'Explore', emoji: '🏡' },
      { path: '/saved', label: 'Saved', tab: 'Saved', emoji: '❤️' },
      { path: '/bookings', label: 'Bookings', tab: 'Bookings', emoji: '📅' },
      { path: '/roommates', label: 'Roommates', tab: 'Roommates', emoji: '🤝', flag: 'ROOMMATES', testid: 'nav-roommates' },
      { path: '/profile', label: 'Profile', tab: 'Profile', emoji: '👤' },
    ],
    owner: [
      { path: '/owner/dashboard', label: 'Dashboard', tab: 'Home', emoji: '📊' },
      { path: '/owner/listings', label: 'My PGs', tab: 'Listings', emoji: '🏠' },
      { path: '/owner/inquiries', label: 'Inquiries', tab: 'Inquiries', emoji: '📥' },
      { path: '/owner/manage', label: 'PG manager', tab: 'Manager', emoji: '🧾', flag: 'PG_MANAGER', testid: 'owner-nav-manage' },
      { path: '/profile', label: 'Profile', tab: 'Profile', emoji: '👤' },
    ],
  };

  const roleOf = () => (PGC.auth.isOwner ? 'owner' : PGC.auth.isTenant ? 'tenant' : 'guest');

  function userMenu(user) {
    return html`
      <div class="user-menu" data-user-menu>
        <button type="button" class="avatar-btn" aria-haspopup="menu" aria-expanded="false" aria-controls="user-menu-panel" data-testid="user-menu-button">
          <span class="avatar avatar--sm" aria-hidden="true">${initial(user.name)}</span>
          <span class="avatar-btn__name">${firstName(user.name)}</span>
          <span class="avatar-btn__caret" aria-hidden="true">▾</span>
          <span class="sr-only">Account menu</span>
        </button>
        <div class="menu" id="user-menu-panel" role="menu" hidden>
          <div class="menu__head"><strong>${user.name}</strong><span>${user.email}</span></div>
          <a role="menuitem" class="menu__item" href="#/profile">Profile</a>
          <button type="button" role="menuitem" class="menu__item menu__item--danger" data-action="sign-out" data-testid="menu-signout">Sign out</button>
        </div>
      </div>`;
  }

  function renderNav(activePath) {
    const role = roleOf();
    const items = NAV[role].filter((it) => !it.flag || PGC.features.on(it.flag)); // a switched-off feature shows no link
    const user = PGC.auth.user;
    const brandHref = role === 'owner' ? '#/owner/dashboard' : '#/';

    const isActive = (item) => item.path === activePath;

    $('#topbar').innerHTML = html`
      <div class="topbar__inner">
        <a class="brand" href="${brandHref}">
          <span class="brand__logo" aria-hidden="true">PG</span>
          <span class="brand__name">PGConnect</span>
        </a>
        <nav class="topnav" aria-label="Primary">
          ${items.map((it) => html`<a class="topnav__link${isActive(it) ? ' is-active' : ''}" href="#${it.path}" ${isActive(it) ? html`aria-current="page"` : ''} ${it.testid ? html`data-testid="${it.testid}"` : ''}>${it.label}</a>`)}
        </nav>
        <div class="topbar__right">
          ${user
            ? userMenu(user)
            : html`<a class="btn btn--ghost btn--sm" href="#/login" data-testid="nav-login">Log in</a>
                   <a class="btn btn--primary btn--sm" href="#/signup" data-testid="nav-signup">Sign up</a>`}
        </div>
      </div>`.toString();

    // The phone tab bar mirrors the Android app, so it only exists for signed-in users.
    const tabbar = $('#tabbar');
    if (user) {
      tabbar.hidden = false;
      tabbar.innerHTML = items.map((it) => html`
        <a class="tabbar__item${isActive(it) ? ' is-active' : ''}" href="#${it.path}" ${isActive(it) ? html`aria-current="page"` : ''} ${it.testid ? html`data-testid="${it.testid}"` : ''}>
          <span class="tabbar__icon" aria-hidden="true">${it.emoji}</span>
          <span class="tabbar__label">${it.tab}</span>
        </a>`).join('');
    } else {
      tabbar.hidden = true;
      tabbar.innerHTML = '';
    }
    document.body.classList.toggle('has-tabbar', !!user);
  }

  function closeMenu() {
    const menu = $('[data-user-menu]');
    if (!menu) return;
    $('.menu', menu).hidden = true;
    $('.avatar-btn', menu).setAttribute('aria-expanded', 'false');
  }

  function bindGlobalHandlers() {
    document.addEventListener('click', (e) => {
      const toggle = e.target.closest('.avatar-btn');
      if (toggle) {
        const menu = $('.menu', toggle.parentElement);
        const open = menu.hidden;
        menu.hidden = !open;
        toggle.setAttribute('aria-expanded', String(open));
        if (open) { const first = $('.menu__item', menu); if (first) first.focus(); }
        return;
      }
      if (e.target.closest('[data-action="sign-out"]')) {
        closeMenu();
        signOut();
        return;
      }
      if (!e.target.closest('[data-user-menu]')) closeMenu();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const open = $('[data-user-menu] .menu:not([hidden])');
        if (open) { closeMenu(); const btn = $('[data-user-menu] .avatar-btn'); if (btn) btn.focus(); }
      }
    });
    // Footer + profile both expose a sign-out action through data-action.
  }

  function signOut() {
    PGC.auth.logout();
    PGC.ui.toast('Signed out');
    PGC.router.go('/login', { replace: true });
  }

  PGC.shell = { renderNav, bindGlobalHandlers, signOut };
})(window.PGC);
