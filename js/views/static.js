/**
 * Static pages: About, For owners, FAQ, Terms, Privacy, 404.
 * Copy sticks to what the product does (and what the project brief states), with no invented claims.
 */
(function (PGC) {
  'use strict';

  const { html } = PGC.utils;
  PGC.views = PGC.views || {};

  const page = (ctx, title, body) => {
    ctx.title(title);
    ctx.render(html`<article class="prose"><h1 class="page-title">${title}</h1>${body}</article>`);
  };

  const CITIES = ['Bengaluru', 'Delhi', 'Pune', 'Hyderabad'];

  PGC.views.about = async function about(ctx) {
    page(ctx, 'About PGConnect', html`
      <p class="lead">Your bridge to a verified PG, without the guesswork.</p>
      <p>PGConnect is a two-sided marketplace for paying-guest (PG) accommodation in India. Students, interns and young professionals who move to a new city get an honest place to look for a room. PG owners and small co-living operators get filled rooms, qualified inquiries and simple rent tracking.</p>

      <h2>Why it matters</h2>
      <ul class="facts">
        <li><strong>About 12 million</strong> student beds are needed in India.</li>
        <li><strong>About 8 million</strong> students live in informal PGs.</li>
        <li>Organised co-living is expected to grow from about <strong>₹40 billion</strong> (2025) to about <strong>₹200 billion</strong> (2030), roughly 38% a year.</li>
      </ul>

      <h2>What we promise</h2>
      <ul class="facts">
        <li><strong>Verified listings.</strong> Every PG shows its verification badge.</li>
        <li><strong>Real photos.</strong> Each listing has its own photo gallery.</li>
        <li><strong>Upfront pricing.</strong> Monthly room prices are shown before you ask.</li>
        <li><strong>Genuine reviews.</strong> Tenants can rate and review a PG.</li>
      </ul>

      <h2>Where we are starting</h2>
      <p>We are starting city by city:</p>
      <p class="chip-row chip-row--wrap">${CITIES.map((c) => html`<a class="chip" href="#/?city=${c}">${c}</a>`)}</p>
      <p><a class="btn btn--primary" href="#/">Find a PG</a> <a class="btn btn--outline" href="#/for-owners">List your PG</a></p>`);
  };

  PGC.views.forOwners = async function forOwners(ctx) {
    const steps = [
      ['Create an owner account', 'Sign up as “I’m an owner” with your name and email.'],
      ['Add your PG', 'Enter the name, location, room prices, amenities and whether food is included.'],
      ['Review inquiries', 'Booking requests from tenants arrive in your Inquiries list with the move-in date and any message.'],
      ['Accept and chat', 'Accept or decline each request and talk to the tenant in the built-in chat.'],
      ['Track your numbers', 'Your dashboard shows total listings, active tenants, pending inquiries and rent collected.'],
    ];
    page(ctx, 'List your PG in minutes', html`
      <p class="lead">Reach tenants looking for a verified PG, and manage requests in one place.</p>
      <ol class="steps">${steps.map(([t, d], i) => html`<li><span class="steps__n" aria-hidden="true">${i + 1}</span><div><h2>${t}</h2><p>${d}</p></div></li>`)}</ol>
      <p><a class="btn btn--primary btn--lg" href="#/signup?role=owner" data-testid="owners-cta">Create an owner account</a></p>`);
  };

  PGC.views.faq = async function faq(ctx) {
    const items = [
      ['How do I book a PG?', 'Open a PG, choose a room type, pick a move-in date and send a booking request. The owner can accept or decline. Once accepted, a Pay button appears on your booking.'],
      ['Is the payment real?', 'No. Payment in this version is a mock flow so you can see how rent payment will work. No real money moves, and a gateway such as Razorpay is planned.'],
      ['What does “Verified” mean?', 'Listings carry a Verified badge. In this early version the badge is applied automatically when a PG is listed; a document-based review by the PGConnect team is on the roadmap.'],
      ['Can I talk to the owner first?', 'Yes. Use the chat button on any PG page, or the Chat button on a booking. Only you and that PG’s owner can see the conversation.'],
      ['How do I save a PG for later?', 'Tap the heart on a PG. Saved PGs appear under Saved. You need a tenant account for this.'],
      ['Can I cancel or end a stay?', 'The sample rental agreement shown when you send a request says monthly rent is due on the 1st and either side may end the stay with 30 days’ notice.'],
      ['Which cities are covered?', 'Bengaluru, Delhi, Pune and Hyderabad to start with.'],
    ];
    page(ctx, 'Frequently asked questions', html`
      <div class="faq">${items.map(([q, a]) => html`<details class="faq__item"><summary>${q}</summary><p>${a}</p></details>`)}</div>`);
  };

  PGC.views.terms = async function terms(ctx) {
    page(ctx, 'Terms of use', html`
      <p class="notice">These are sample terms written for the PGConnect demo. They are not legal advice. Have them reviewed before launching a real service.</p>
      <h2>Accounts</h2>
      <p>You choose a role when you sign up, either tenant or owner. Keep your sign-in details to yourself. Provide accurate information.</p>
      <h2>Listings and bookings</h2>
      <p>A booking is a request until the owner accepts it. Owners are responsible for the accuracy of their listings, prices and availability. The sample digital rental agreement shown with each request states that monthly rent is due on the 1st and either side may end the stay with 30 days’ notice.</p>
      <h2>Payments</h2>
      <p>Payments in this version are a mock. No real money is moved and no payment details are collected.</p>
      <h2>Reviews and messages</h2>
      <p>Write honestly and respectfully. Do not post other people’s personal information.</p>
    `);
  };

  PGC.views.privacy = async function privacy(ctx) {
    const local = PGC.api.mode() === 'local';
    page(ctx, 'Privacy', html`
      <p class="notice">This describes how this build of PGConnect handles data. It is not a complete legal privacy policy.</p>
      <h2>What we collect</h2>
      <p>Your name, email, optional phone number and role when you sign up, plus the bookings, saved PGs, reviews and chat messages you create.</p>
      <h2>Where it is stored</h2>
      ${local
        ? html`<p>Everything above is kept in your own browser’s storage on this device. It is not sent to any server and is not visible to other people. Your password is stored only as a salted hash. Clearing site data for this page deletes it all.</p>`
        : html`<p>Your data is sent to the PGConnect backend configured for this site and stored there.</p>`}
      <h2>Cookies and storage</h2>
      <p>PGConnect does not use tracking cookies. It uses browser storage to keep you signed in and to hold your saved data on this device.</p>
    `);
  };

  PGC.views.notFound = async function notFound(ctx) {
    ctx.title('Page not found');
    ctx.render(PGC.c.emptyState({
      icon: '🧭', title: 'Page not found', text: 'That page does not exist or has moved.',
      action: html`<a class="btn btn--soft" href="#/">Back to Explore</a>`,
    }));
  };
})(window.PGC);
