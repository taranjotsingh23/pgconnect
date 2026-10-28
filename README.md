# PGConnect (web)

A responsive website version of the **PGConnect Android app**: a two-sided marketplace where tenants find a
verified PG (paying-guest accommodation) in India and owners list and manage PGs. Built with plain
**HTML5, CSS3 and vanilla JavaScript**: no framework, no build step, no dependencies.

> The reference material was the app's Markdown spec and the 31-page screenshot PDF. Screens, copy, colours,
> sample data and flows follow those; where the web needs something different (top navigation, two-column
> detail page, etc.) the adaptations from the spec's "Web adaptations" section were applied.

## Run it

**VS Code Live Server (recommended)**

1. Install the *Live Server* extension (Ritwick Dey) if you do not have it.
2. Open this folder in VS Code.
3. Right-click `index.html` → **Open with Live Server** (or click **Go Live** in the status bar).
4. The site opens at `http://127.0.0.1:5500/`. On the login screen tap **Tenant demo** or **Owner demo**.

**Without Live Server**

- Double-click `index.html`. It also works from `file://` (routing uses the URL hash, scripts are classic
  `<script>` tags, so no server is required), or
- from this folder run `python -m http.server 5500` and open `http://127.0.0.1:5500/`.

**Demo accounts**

| Role | Email | Password |
|---|---|---|
| Tenant | `tenant@pgconnect.in` | `tenant123` |
| Owner | `owner@pgconnect.in` | `owner1234` |

Or create your own account on **Create account** (choose *I'm looking* or *I'm an owner*).

## Two modes: local (default) and online

`js/config.js` controls where data comes from:

```js
window.PGC_CONFIG = {
  API_URL: '',               // '' = local (browser-only) backend; 'https://your-host' = use the FastAPI backend at <API_URL>/api
  SHOW_DEMO_LOGINS: true,    // hide the demo buttons in production
  CHAT_POLL_MS: 4000,
  PAGE_SIZE: 12,
};
```

- **Local mode (`API_URL: ''`)**: no backend was supplied with the reference files, so
  `js/local-api.js` implements the *same REST contract* (paths, request bodies, status codes, error messages)
  in the browser using `localStorage`, seeded with the five documented PGs and two demo accounts. Every
  screen works end to end (sign up, search, save, booking, accept/decline, mock payment, chat, reviews, add
  and delete listings). To start over, clear this site's data in the browser (or run `PGC.localApi.reset()` in the console).
- **Online mode**: set `API_URL` to the FastAPI service from the spec. The UI code is unchanged; only
  `js/api.js` talks to the network (Bearer token in `localStorage` key `pgc_token`, `{detail}` errors mapped to
  messages, network failure shown as "Cannot reach the server. Is the backend running?", 401 ends the session).
  The backend must allow CORS from the site's origin. This path was only tested for the unreachable-server case
  (there is no backend in this workspace).

**What the local backend is *not*:** real authentication or a shared database. Data exists only in one browser on one
device, the session "token" is just `local.<user id>`, and two people on different devices cannot interact.
Passwords are stored salted and hashed (SHA-256) rather than in plain text, but this is a demonstration, not a
secure design. Do not use real passwords.

## Project structure

```
index.html                 App shell (header, #app, footer, tab bar, toast + modal roots)
css/styles.css             Design tokens + all components (mobile-first)
css/responsive.css         Breakpoints: phones <768, tablets 768-1023, desktops >=1024
js/config.js               Runtime settings (see above)
js/utils.js                Escaping `html` template tag, formatting (₹, dates), query-string helpers
js/seed-data.js            Documented demo users, PGs, reviews
js/api.js                  request() for online/local mode + one function per endpoint
js/local-api.js            Browser-side implementation of the documented REST API
js/query.js                Small cache (20 s stale time, invalidation, in-flight de-duplication)
js/auth.js                 Session state, login / register / logout
js/ui.js                   Toasts, accessible modals/sheets (focus trap, Esc), confirm dialog, lightbox
js/components.js           PG card, chips, status pill, skeletons, empty / error states
js/actions.js              Save-heart toggle, "log in first then come back" helper
js/shell.js                Top navigation, user menu, phone tab bar
js/router.js               Hash router with role guards and per-view cleanup
js/views/*.js              auth, explore, pg-detail, bookings (saved/bookings/pay), chat, profile, owner, static
js/app.js                  Route table + boot
js/features.js, js/lib-core.js            Feature switches; the brief's pure maths (filters, cost, roommate score, rent status)
js/seed-v2.js, js/local-api-*.js          Seed v2, validation of optional listing fields, roommates router, PG-manager router
js/compare.js                              Compare state and tray
js/views/{explore-map,compare,roommates,manage,pg-sections}.js   New screens and detail sections
css/features.css                           Styles for the new features
js/lib-reference.test.js                   The brief's reference tests: `node js/lib-reference.test.js`
assets/images/             The three room photos used by the app's sample data
assets/fonts/              Roboto (latin + latin-ext, so ₹ renders)
assets/leaflet-1.9.4.min.{js,css}   Leaflet (BSD-2), used only by the Map view
assets/icons/favicon.svg
```

## Screens and routes

| Route | Screen | Who |
|---|---|---|
| `#/` | Explore: search, city + type chips, food toggle, sort, budget/rating filters, PG grid, show-more | everyone (owners are sent to their dashboard) |
| `#/pg/:id` | PG detail: gallery + lightbox, rooms, amenities, rules, host, reviews, review form, booking | everyone (booking/save/chat/review need a tenant login) |
| `#/login`, `#/signup` | Login (demo accounts, Google placeholder), signup with role cards | signed-out |
| `#/saved` | Saved PGs | tenant |
| `#/bookings` | My bookings (Pay / Chat) | tenant |
| `#/pay/:id` | Mock payment (UPI / Card / Net banking) and success receipt | tenant |
| `#/chat/:pgId?tenant_id=` | Chat thread, polled every 4 s | tenant + that PG's owner |
| `#/profile` | Profile + sign out | both |
| `#/owner/dashboard` | Stats, add PG, review inquiries | owner |
| `#/owner/listings`, `#/owner/listings/new` | My PGs with delete (confirmation), add-listing form | owner |
| `#/owner/inquiries` | Inquiries with Accept / Decline / Chat | owner |
| `#/about`, `#/for-owners`, `#/faq`, `#/terms`, `#/privacy` | Static pages | everyone |

All 31 reference screenshots map to these screens (login, signup, Explore at each scroll position, five PG
detail pages with their scroll positions, the booking sheet, bookings, saved, tenant profile, owner dashboard,
inquiries, listings, owner profile, add-listing).

Filter state lives in the URL, e.g. `#/?q=kora&city=Pune&type=female&food=1&sort=price-asc&maxp=9000&minr=4`.

## Responsive behaviour

- **Phones (<768px)**: matches the app. Bottom tab bar for signed-in users; login, signup, PG detail and chat
  are full-screen "stack" screens with no top bar; sticky "Request to book" bar; booking form in a bottom sheet.
- **Tablets (768-1023px)**: top navigation, 2-column grid, rounded gallery with thumbnails, booking sheet as a dialog.
- **Desktop (>=1024px)**: 3-column grid, PG detail in two columns with a **sticky booking card**, 4-up stats.

## Upgrade: seven new features

Added on top of the original site without renaming or removing anything that existed (routes, endpoints, response
fields, test ids, copy and design tokens are unchanged; every new data field is optional). Full detail and decisions
are in `docs/RECON.md`; the specification is `docs/UPGRADE_BRIEF.md`.

| # | Feature | Where | Switch |
|---|---|---|---|
| F6 | Advanced filters and sort: budget range, sharing, AC, short stay, verified level, beds free, distance, Nearest and Most beds free sorts | Explore: the existing Filters panel and Sort | `ADV_FILTERS` |
| F2 | Safety-first search: six safety filters, a Safety section on every PG, optional safety fields for owners | Filters panel, PG detail, Add listing | `SAFETY_FILTERS` |
| F4 | True monthly cost: rent plus electricity and maintenance, food, deposit, notice, lock-in, exit fee, cash to move in | PG detail, Add listing, "Include electricity and maintenance" budget switch | `TRUE_COST` |
| F7 | Area picker and Map view of PGs with a bed free (Leaflet, OpenStreetMap) | Explore: List / Map toggle and area chips | `MAP` |
| F5 | Compare 2 or 3 PGs | "+ Compare" on cards, PG detail and the map card; tray; `#/compare` | `COMPARE` |
| F1 | Roommate matching (6-question quiz, compatibility score) and batch groups | Tenants: `#/roommates`, "Roommates" in the nav, card on PG detail | `ROOMMATES` |
| F3 | Owner PG manager: tenants, rent register, complaints, KYC (type of ID only), agreements | Owners: `#/owner/manage`, "PG manager" in the nav | `PG_MANAGER` |

### Feature switches (one-line rollback)

`js/config.js` has a `FEATURES` object. Every switch defaults to `true`. Set one to `false` and that feature's nav
links, buttons and sections disappear and its route redirects home; data already saved stays. With all seven off the
site behaves like the pre-upgrade site (the sample PGs are still in the data unless `SEED_SAMPLE_PGS` is `false`).
A static site has no environment variables, so the switches live in this file instead of a `.env.example`.

```js
FEATURES: { ROOMMATES: true, SAFETY_FILTERS: true, PG_MANAGER: true, TRUE_COST: true, COMPARE: true, ADV_FILTERS: true, MAP: true },
SEED_SAMPLE_PGS: true,   // false = do not create sample PGs, owners, roommate profiles and groups
```

### Sample data (seed v2)

- On first load (and when an older saved database is found) the demo database is **migrated in place**: it only adds
  data, never wipes or overwrites. Samples are keyed by a stable `seed_key`, so reloading or restarting changes nothing
  and an owner's edit to a sample PG survives. The five original PGs only receive the *missing* new optional fields.
- Result: **80 PGs in 16 areas of 4 cities** (at least 5 per area), 4 sample owners that cannot log in, 24 sample
  roommate profiles, 20 batch groups, and demo PG-manager data on Sunshine Girls PG (9 tenants, rent in several states,
  4 complaints). Sample PGs have rating 0 and no reviews, and their description says "Sample listing ... demo data".
  The generator is deterministic (same output every run).
- Clearing this site's data in the browser (or `PGC.localApi.reset()` in the console) wipes the database; the samples are re-created on the next load.

### Map

The map uses **Leaflet 1.9.4** (files in `assets/`, loaded only when the Map view is opened) with **OpenStreetMap**
tiles. The attribution "© OpenStreetMap contributors" is always visible. Please keep to normal use of the public tile
servers (no prefetching or scraping); if traffic grows, switch to a hosted tile provider (`tileLayer` in
`js/views/explore-map.js`). Tiles need a normal web origin: when `index.html` is opened straight from disk the browser
sends no Referer and OpenStreetMap may refuse tiles. The pins and the list still work, and the page shows "Map tiles
could not load". Use Live Server for the full map.

### Backend contract for online mode

The new endpoints exist only in the browser demo backend. To use them against the FastAPI service it needs the same
routes (names, bodies and messages are in `js/local-api-roommates.js` and `js/local-api-manage.js`, and in
`docs/UPGRADE_BRIEF.md` sections 4 to 5): `GET/PUT/DELETE /roommate/profile`, `GET /roommate/matches`, `GET /batches`,
`GET /batches/{id}`, `POST/DELETE /batches/{id}/join`, and everything under `/manage`. `POST /pgs` must accept the
optional `safety`, `charges`, `short_stay_ok`, `min_stay_months`, `area`, `lat`, `lng` fields, and the PG summary
should return them (plus `room_types`, `amenities`, `created_at`) because the filters run on the client.
`docs/reference_roommate.py`, `docs/reference_rent.py` and `docs/reference_tests.py` are the brief's Python reference
modules and tests for that backend (run `python reference_tests.py` inside `docs/`).

## Design decisions worth knowing

- **Font:** the screenshots render in Roboto (Android system font) although the spec names Plus Jakarta Sans;
  the screenshots win for appearance, so Roboto is bundled locally.
- **Colours:** the screenshots show a pale mint page background and lavender-tinted inputs/chips, slightly
  different from the spec's neutral greys, so those values were taken from the screenshots (estimated by eye).
  Small brand-coloured *text* uses `#D33F22` (as the spec advises) for contrast; buttons use `#FF6B4A`.
- **Icons:** the app uses emoji for tab icons, stats and empty states, so the site does too.
- **Price shown for Delhi Scholars Boys PG** is ₹7,000 (the documented "starts at" price), not its cheaper triple room.
- **Security:** all user text goes through an escaping template tag (`html`), toasts use `textContent`, the
  post-login `next` redirect only accepts in-app paths. No secrets exist in the code.

## Known limitations / not implemented

Backend-dependent or stubbed (as the spec itself says not to fake them):

- **Google Sign-In**: button shows a "coming soon" message (needs an OAuth client ID and `POST /auth/google`).
- **Real image upload**: new listings get the three sample photos.
- **Real payments**: the payment screen is a mock with a fake reference (`MOCK-…`).
- **Verification / KYC**: the "Verified" badges and "KYC status: Verified ✓" are placeholders from the app; listings are auto-verified.
- **Cross-device data, real auth, rate limiting, password reset, email verification**: need the backend.

Web-adaptation items from the spec that were skipped:

- No **Contact** page (no contact channel or endpoint is documented, and a form that goes nowhere would be a dead control).
- No amenity filter (the list endpoint does not return amenities); budget and minimum rating are client-side.
- No dark theme, no owner sidebar / inquiries table, no two-pane chat, no drag-and-drop photo upload.
- Pages are rendered in the browser, so link-preview/SEO metadata and the JSON-LD are set client-side only;
  real SEO would need server rendering (the spec suggests Next.js for that).
- Room availability does not decrease when a booking is accepted (roadmap item in the spec).

## Testing performed

Automated browser tests (Playwright driving Microsoft Edge, kept outside this folder) were run against the
site served over HTTP and, for one test, opened from `file://`:

- the 17 acceptance scenarios from the spec (browse, filter, search, protected actions, signup, role routing,
  save, booking, invalid date, accept/decline, payment gating, chat incl. 403, review, add/delete listing, responsive, sign out),
- URL-restored filters, pagination, owner view of a PG, hostile-text (XSS) rendering, keyboard/focus handling,
  alt-text and accessible-name checks, session-expiry handling, unreachable-backend message,
- no horizontal scroll on the public pages at 360, 768 and 1440 px, nor on every tenant and owner page at
  320, 360, 768, 1024 and 1440 px, and a clean browser console throughout.

For the upgrade, the same approach covered every acceptance scenario of the seven features, old-versus-new API replies
(34 calls compared with a snapshot taken before the upgrade), the whole suite with every feature switch off,
an axe-core accessibility scan and a keyboard pass of the new screens, a fresh and an old (version 1) database, and
the brief's Python and JavaScript reference tests. The browser test scripts are not part of this folder.

Not tested: real Android devices, Safari/Firefox, screen-reader behaviour, and the online mode against a live FastAPI server.
