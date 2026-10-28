/**
 * Profile screen, shared by tenants and owners.
 */
(function (PGC) {
  'use strict';

  const { html, initial } = PGC.utils;
  PGC.views = PGC.views || {};

  PGC.views.profile = async function profile(ctx) {
    const u = PGC.auth.user;
    ctx.title('Profile');
    ctx.render(html`
      <section class="narrow profile">
        <div class="avatar avatar--xl" aria-hidden="true">${initial(u.name)}</div>
        <h1 class="profile__name">${u.name}</h1>
        <p class="profile__email">${u.email}</p>
        <span class="role-pill">${u.role === 'owner' ? 'Owner' : 'Tenant'}</span>

        <div class="card card--pad profile__card">
          <h2 class="eyebrow">Account</h2>
          <dl class="kv">
            <div class="kv__row"><dt>Phone</dt><dd>${u.phone || 'Not added'}</dd></div>
            <div class="kv__row"><dt>User ID</dt><dd>${u.user_id}</dd></div>
            <div class="kv__row"><dt>KYC status</dt><dd>Verified ✓</dd></div>
          </dl>
        </div>

        <div class="card card--pad profile__card">
          <h2 class="eyebrow">Why PGConnect?</h2>
          <p class="profile__why">Verified PGs, real photos, upfront pricing and genuine reviews, so you never book blind again.</p>
        </div>

        <button type="button" class="btn btn--ghost btn--lg btn--block btn--danger-text" data-action="sign-out" data-testid="signout-button">Sign out</button>
      </section>`);
  };
})(window.PGC);
