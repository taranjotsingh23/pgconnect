/**
 * Login and Signup screens.
 */
(function (PGC) {
  'use strict';

  const { html, safeNext, isEmail, firstName } = PGC.utils;
  const { formError, showError, setLoading } = PGC.c;
  PGC.views = PGC.views || {};

  /** Where to go after signing in: the page they came from (if allowed) or their role home. */
  function afterAuth(ctx, user, welcome) {
    const next = safeNext(ctx.query.next);
    PGC.ui.toast(welcome(user), { type: 'success' });
    ctx.go(next || PGC.auth.homePath(), { replace: true });
  }

  /* ------------------------------ Login ------------------------------ */

  PGC.views.login = async function login(ctx) {
    const nextQs = ctx.query.next ? `?next=${encodeURIComponent(ctx.query.next)}` : '';
    const accounts = PGC.seed.DEMO_ACCOUNTS;
    ctx.title('Log in');
    ctx.render(html`
      <section class="auth">
        <div class="auth__inner">
          <span class="auth__logo" aria-hidden="true">PG</span>
          <h1 class="auth__title">Welcome back</h1>
          <p class="auth__sub">Find a verified PG without the guesswork.</p>

          <form class="card card--pad form" data-form="login" novalidate>
            <label class="field">
              <span class="field__label">Email</span>
              <input class="input" type="email" name="email" placeholder="you@email.com" autocomplete="email" autocapitalize="none" spellcheck="false" data-testid="login-email-input">
            </label>
            <label class="field">
              <span class="field__label">Password</span>
              <input class="input" type="password" name="password" placeholder="Your password" autocomplete="current-password" data-testid="login-password-input">
            </label>
            ${formError()}
            <button type="submit" class="btn btn--primary btn--lg btn--block" data-testid="login-submit-button">Sign In</button>
            <div class="divider"><span>or</span></div>
            <button type="button" class="btn btn--outline btn--lg btn--block" data-action="google" data-testid="google-button">Continue with Google</button>
          </form>

          <p class="auth__switch">New to PGConnect? <a href="#/signup${nextQs}" data-testid="login-to-signup-link">Create account</a></p>

          ${PGC_CONFIG.SHOW_DEMO_LOGINS && html`
            <div class="demo-box">
              <h2 class="demo-box__title">Demo accounts</h2>
              <div class="demo-box__actions">
                <button type="button" class="pill-btn" data-action="demo" data-role="tenant" data-testid="demo-tenant">Tenant demo</button>
                <button type="button" class="pill-btn" data-action="demo" data-role="owner" data-testid="demo-owner">Owner demo</button>
              </div>
              <p class="demo-box__hint">${accounts.tenant.email} / ${accounts.tenant.password} · ${accounts.owner.email} / ${accounts.owner.password}</p>
            </div>`}
        </div>
      </section>`);

    async function signIn(form, email, password) {
      const btn = form.querySelector('[type="submit"]');
      showError(form, '');
      setLoading(btn, true);
      try {
        await PGC.auth.login(email, password);
        afterAuth(ctx, PGC.auth.user, (u) => `Welcome back, ${firstName(u.name)}`);
      } catch (e) {
        if (ctx.alive()) { showError(form, e.message); setLoading(btn, false); }
      }
    }

    ctx.on('submit', '[data-form="login"]', (e, form) => {
      e.preventDefault();
      const email = form.email.value.trim();
      const password = form.password.value;
      if (!email || !password) { showError(form, 'Enter email and password'); return; }
      signIn(form, email, password);
    });

    ctx.on('click', '[data-action="demo"]', (e, btn) => {
      const acc = accounts[btn.dataset.role];
      signIn(ctx.app.querySelector('[data-form="login"]'), acc.email, acc.password);
    });

    ctx.on('click', '[data-action="google"]', () => {
      PGC.ui.toast('Google Sign-In is coming soon. It needs a Google OAuth client ID, so use email for now.');
    });
  };

  /* ------------------------------ Signup ------------------------------ */

  PGC.views.signup = async function signup(ctx) {
    const role = ctx.query.role === 'owner' ? 'owner' : 'tenant';
    const nextQs = ctx.query.next ? `?next=${encodeURIComponent(ctx.query.next)}` : '';
    const roleCard = (value, emoji, title, sub) => html`
      <label class="role-card">
        <input type="radio" name="role" value="${value}" ${role === value ? 'checked' : ''} data-testid="signup-role-${value}">
        <span class="role-card__body">
          <span class="role-card__emoji" aria-hidden="true">${emoji}</span>
          <span class="role-card__title">${title}</span>
          <span class="role-card__sub">${sub}</span>
        </span>
      </label>`;

    ctx.title('Create account');
    ctx.render(html`
      <section class="auth">
        <div class="auth__inner">
          <button type="button" class="back-link" data-action="back" data-fallback="/login" data-testid="signup-back">← Back</button>
          <h1 class="auth__title auth__title--sm">Create account</h1>
          <p class="auth__sub">Get verified PG options in minutes.</p>

          <form data-form="signup" novalidate>
            <fieldset class="role-grid">
              <legend class="sr-only">I am a</legend>
              ${roleCard('tenant', '🎒', "I'm looking", 'Find a verified PG')}
              ${roleCard('owner', '🏠', "I'm an owner", 'List & manage PGs')}
            </fieldset>

            <div class="card card--pad form">
              <label class="field">
                <span class="field__label">Full name</span>
                <input class="input" type="text" name="name" placeholder="Ananya Verma" autocomplete="name" data-testid="signup-name-input">
              </label>
              <label class="field">
                <span class="field__label">Email</span>
                <input class="input" type="email" name="email" placeholder="you@email.com" autocomplete="email" autocapitalize="none" spellcheck="false" data-testid="signup-email-input">
              </label>
              <label class="field">
                <span class="field__label">Phone (optional)</span>
                <input class="input" type="tel" name="phone" placeholder="+91 98765 43210" autocomplete="tel" data-testid="signup-phone-input">
              </label>
              <label class="field">
                <span class="field__label">Password</span>
                <input class="input" type="password" name="password" placeholder="At least 6 chars" autocomplete="new-password" data-testid="signup-password-input">
              </label>
              ${formError()}
              <button type="submit" class="btn btn--primary btn--lg btn--block" data-testid="signup-submit-button">Create account</button>
            </div>
          </form>

          <p class="auth__switch">Already have an account? <a href="#/login${nextQs}" data-testid="signup-to-login-link">Sign in</a></p>
        </div>
      </section>`);

    ctx.on('submit', '[data-form="signup"]', async (e, form) => {
      e.preventDefault();
      const name = form.elements.namedItem('name').value.trim(); // `form.name` would be ambiguous with the form's own name
      const email = form.email.value.trim();
      const phone = form.phone.value.trim();
      const password = form.password.value;
      const chosen = form.role.value;
      if (!name || !email || !password) { showError(form, 'Please fill all required fields'); return; }
      if (!isEmail(email)) { showError(form, 'Enter a valid email address'); return; }
      if (password.length < 6) { showError(form, 'Password must be at least 6 characters'); return; }

      const btn = form.querySelector('[type="submit"]');
      showError(form, '');
      setLoading(btn, true);
      try {
        await PGC.auth.register({ name, email, password, role: chosen, phone: phone || undefined });
        afterAuth(ctx, PGC.auth.user, (u) => `Account created. Welcome, ${firstName(u.name)}`);
      } catch (err) {
        if (ctx.alive()) { showError(form, err.message); setLoading(btn, false); }
      }
    });
  };
})(window.PGC);
