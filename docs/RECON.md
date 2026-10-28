# RECON: PGConnect upgrade (Phase 0)

Date: 2026-10-29. Scope: inspection and baseline only. **No application code was changed.** The only file created is this one.

## 0. Verdict: brief section 9 stop condition is triggered

The brief says (9.1): *"If the repo is not FastAPI + MongoDB, or the frontend is not React: stop after RECON.md and ask."*
Both are true here, so work stops after this file until TJ chooses a path (questions in section 6).

| Brief assumes | Repo has |
|---|---|
| Next.js or Vite + React + TypeScript + Tailwind | Plain HTML + CSS + vanilla JS (classic `<script>` tags, hash router). No `package.json`, no build, no TypeScript, no Tailwind |
| React Query (keys, `useQueries`, `useSearchParams`) | A small hand-written cache, `js/query.js`, with the same key shapes as arrays |
| FastAPI + Motor + MongoDB, Pydantic models, `backend/seed.py`, startup hook, indexes, pytest | **No backend in the workspace.** `js/local-api.js` is a browser-only demo backend that mimics the documented REST contract on `localStorage`. The FastAPI service exists only as a spec |
| `git`, branch `feat/pg-upgrade`, one commit per step | **Not a git repository** (`fatal: not a git repository`) |
| lint, type check, backend tests, frontend tests, build | None of these exist. The 17 acceptance tests exist only as Playwright scripts kept **outside the repo** (session scratchpad) |
| Tokens: Plus Jakarta Sans, surface `#FAFAFA`, chip `#F2F4F7` | Roboto, surface `#F4F8F3`, chip/input tint `#F5F2F8` (taken from the Android screenshots, on purpose) |

## 1. Inspection answers (brief 2.1)

| Question | Finding |
|---|---|
| Frontend framework | None. Vanilla JS SPA. `index.html` loads 21 classic scripts in order; `js/router.js` is a hash router (`#/path?query`) with access levels `public / guest / auth / tenant / owner` |
| React / React Query / Tailwind versions | Not applicable. Design tokens are CSS variables in `css/styles.css` (`--brand #FF6B4A`, `--brand-ink #D33F22`, `--tint`, `--border`, radius 12/20/pill) |
| Existing UI pieces to reuse | Chip (`PGC.c.chip`, `.chip`, `.chip-radio`), PG card (`PGC.c.pgCard`), skeletons (`skeletonGrid/Rows/Stats`), empty/error states, `PGC.ui.toast`, `PGC.ui.openModal` (variants `dialog`, `sheet`, `lightbox`, focus trap, Esc), `confirmDialog`. **Missing:** Switch, dual-handle Slider, right-hand drawer |
| Explore already has | **Sort** (`sort`, values `newest, price-asc, price-desc, rating`), an inline **filter panel** (`budget-range` max slider, `minr` min-rating chips), URL state, "Show more" (page size 12), empty state with "Clear filters / retry" (`clear-filters`) |
| Existing URL params on Explore | `q, city, type, food, sort, maxp, minr`. Note: `maxp` (not `max`), and sort values are **hyphenated** (`price-asc`), unlike the brief's `price_asc` |
| Existing test ids that overlap the brief | `sort-select` (brief reuses it), `filters-toggle` (brief wants `filters-open`), `budget-range`, `minr-chip-*`, `clear-filters`, `load-more` |
| Fetch wrapper, auth, 401 | `js/api.js` (`request`, one function per endpoint, token in `pgc_token`, `{detail}` errors, 401 emits `unauthorized`), `js/auth.js`, role guards in `js/router.js` |
| Backend layout / `GET /pgs` limit / response_model | No backend. In `js/local-api.js` there is **no limit or pagination**. `pgSummary()` returns only `pg_id, name, city, locality, gender, price_from, images, verified, rating, review_count, food_included`. **It omits `room_types` and `amenities`**, which the new client-side filters need. The summary must gain optional fields (allowed by 2.4) |
| Seed behaviour | Seeded **once**, when the stored DB is missing or `db.version !== 1`, then persisted. Never re-seeded per request. So seed v2 must be a **migration of the stored DB** (bump to version 2 in place, upsert by `seed_key`, backfill only missing fields on the five originals matched by `name + city`) and must not wipe user data |
| Stored values | gender `female / male / unisex`; room type `single / double / triple` (Add listing creates only single and double); amenities exactly `WiFi, AC, Laundry, Housekeeping, CCTV, Parking, Gym, Hot Water, Power Backup` (matches the brief) |
| Does accepting a booking change `available`? | **No.** Left as is, per the brief |
| Test tooling | None in the repo. Scripts (`smoke`, `e2e` 28 checks, `extra` 8, `overflow`) run Playwright against installed Edge from the scratchpad |
| CSP / image hosts | No CSP anywhere. All photos are local files under `assets/images/`; no external image host is used |
| Money formatter | `PGC.utils.formatINR` (Indian grouping). Reuse it |
| IDs | `PGC.utils.randomId(12)` (lowercase base36, 12 chars) |
| Time zone | `local-api.js` uses the browser clock. Date logic for F3 needs an explicit `Asia/Kolkata` helper |

## 2. Baseline (brief 2.2), on the untouched code

Served over HTTP on `127.0.0.1:5500`, Edge headless:

| Check | Result |
|---|---|
| Install / lint / type check / backend tests / build | **Not applicable** (none exist) |
| Smoke (4 pages, console, requests) | Pass, no problems |
| End-to-end, 28 checks, includes the 17 acceptance scenarios (1 to 17) and the 3b/4b/5b/7b/13a-c extras | **28 / 28 pass**, no console problems |
| Extra checks (file://, URL filters, pagination, owner view, XSS, keyboard, reset, a11y) | **8 / 8 pass** |
| Horizontal overflow, tenant and owner pages at 320, 360, 768, 1024, 1440 | None |
| Fresh data | A fresh browser profile seeds 5 PGs and the 2 demo accounts automatically |

The baseline is green.

## 3. Findings that affect the plan

1. **The brief's "three intended test changes" is not the whole list for this repo.** Besides official tests 1 to 3, these checks of mine hard-code "exactly 5 PGs" and will break when about 75 sample PGs arrive: 3b (price order and budget count), `Show more pagination` (5 total), and test 15's public-list count of 6. They encode the same "5 PGs" assumption. They are my own additions, not part of the official 17. Proposed handling: reword them the same way as 1 to 3 and report it.
2. **Explore already has a sort and a filter panel.** Brief 2.4 and 4.5 say extend, never duplicate, and keep existing param names. So: keep `maxp`, `minr`, hyphenated sort values and the existing test ids; add new params; accept the brief's names (`max`, `price_asc`) as read-only aliases.
3. **The PG list summary is too thin** for client-side filtering (no `room_types`, `amenities`, `safety`, `charges`, `area`, coordinates). It needs optional extra fields. Existing fields and ordering stay identical.
4. **Map tiles:** OpenStreetMap tile servers expect a valid Referer. Opened by double-click from `file://` no Referer is sent and tiles may be refused. Over Live Server (http) it should work. The brief's fallback ("Map tiles could not load...") covers it. Leaflet would be vendored locally (no npm, no CDN) and loaded only when the Map view is opened.
5. **Bottom tab bar:** adding Roommates (tenant) and PG manager (owner) makes 5 tabs on phones. Fits at 360 px but must be checked.
6. **Safe by construction already:** user text goes through the escaping `html` tag; roles are enforced in the router and in `local-api.js` with the existing messages.

## 4. Decisions (made; reversible; tell me if you disagree)

These apply to whichever path TJ picks, because they follow the brief's own rules:

- **Keep the repo's look.** Roboto and the existing CSS variables, not Plus Jakarta Sans or the brief's raw hex. Pin CSS uses `var(--brand)`, `var(--brand-ink)`, `var(--border)`.
- **Keep every existing name.** `maxp` stays; `sort` keeps hyphenated values and gains `distance` and `beds`; `filters-toggle` and `sort-select` stay. Brief ids that do not collide are added as written.
- **Extend the existing filter panel in place** (same toggle, same ids, same chips), adding the new groups and a footer with "Show {n} PGs" and "Reset all". On phones it opens in the existing `sheet` modal variant. "Clear filters / retry" also resets every new filter.
- **Appendix maths is copied, not re-derived.** Types are removed and nothing else changes. The TypeScript reference tests (A8) are converted to a Node script that keeps every assertion and number.
- **Feature flags** live in `js/config.js` (`FEATURES: { ROOMMATES, SAFETY_FILTERS, PG_MANAGER, TRUE_COST, COMPARE, ADV_FILTERS, MAP }`, all on) because a static site has no env vars. Flags are documented in the README in place of `.env.example`.
- **Seed v2** is a stored-DB migration (version 1 to 2) with `seed_key` upserts, backfill of missing fields only, `SEED_SAMPLE_PGS` (default on), sample owners that cannot log in, deterministic generation. Expected result: 80 PGs in 16 areas (the five originals fill part of five areas).
- **IST:** one `todayIST()` helper used for all F3 date logic.
- **Owners and Compare:** `/compare` is public but owners are redirected to the dashboard, like Explore.
- **Never any of:** ID numbers or documents (F3 KYC), contact details of other users (F1), fabricated ratings or reviews (sample PGs have rating 0), banned safety phrases, em or en dashes in on-screen text.

## 5. What each path would deliver

**Path A (recommended): adapt to the existing vanilla site.**
All seven features, built in the brief's order with the brief's behaviour and test ids. Backend pieces are added to `js/local-api.js` (browser demo backend) with the same endpoints and error messages as the brief, so a future FastAPI service has an exact contract to copy. Python files from the Appendix (`roommate.py`, `rent.py`, A9 tests) would be saved as reference modules, not executed in the app. Frontend maths becomes plain JS under `js/lib/`.

**Path B: bring the real stack.** If the FastAPI + MongoDB + React/Next repo exists elsewhere, point me at it and I follow the brief literally.

**Path C: rewrite this site in React/TypeScript/FastAPI.** Not recommended. It would replace working code and cannot satisfy "additive only".

## 6. Questions for TJ (blocking)

1. Which path: A, B or C?
2. Tooling: this folder has no git history, no lint, no tests. OK to (a) `git init` and commit the current state as the baseline, then branch `feat/pg-upgrade`, and (b) copy my Playwright acceptance scripts into a dev-only `tests/` folder with its own `package.json` (devDependency `playwright-core`, uses installed Edge) so they live in the repo?

Nothing else is blocking. Everything else is decided in section 4.

---

# Outcome (after TJ's answers)

TJ chose **Path A** (adapt to this vanilla site) and **no git, no new folders**. So: new files went into the existing
`js/`, `css/`, `assets/` and `docs/` folders; there are no commits or branch; and a copy of every pre-upgrade file was
kept outside the repo to diff against. After every step the existing and new test scripts were run (they live outside the
repo), so each step has a green gate instead of a commit.

## Decisions (made without asking, per section 9)

- Kept the repo's look: Roboto and the existing CSS variables, not the brief's font or raw hex.
- Kept every existing name. The Explore panel is **extended in place** (same toggle `filters-toggle`, same ids, chips and URL
  names `maxp`, `minr`, hyphenated sort values) and the brief's names (`max`, `min`, `price_asc`, `relevance`) are accepted
  when reading a URL. New params: `minp, incl, share, ac, short, avail, grade, safety, dist, ref, area, view`.
- The existing sort label **"Top rated"** was kept (the brief's table says "Rating"; a copy string may not change).
- No new Sheet component: the existing inline panel got the new groups, a sticky footer ("Reset filters", "Reset all",
  "Show {n} PGs"), Esc to close and 44px targets. A right-hand **drawer** variant (bottom sheet on phones) was added to the
  existing modal for the batch-group members list.
- Dual-handle budget = two range inputs plus two number fields (`filter-min`, `filter-max`); the existing `budget-range`
  is the max slider.
- "Checked by PGConnect" is never shown (the brief allows it only when other copy defines it, and none does). The Safety
  section shows the five declared lines, plus "Women-only (verified)" only when it is true.
- Roommate quiz questions are stacked with a live "n of 6 answered" counter rather than one at a time.
- "Switch off matching" also removes the person from their groups (joining needs visibility on).
- The compare tray's "Compare now" carries the Explore `ref` into the URL so the distance row can show.
- A PG without a map position cannot get a pin; the Map view says how many such PGs have a bed free and points to the list.
- Small fixes to pre-existing accessibility problems found by axe: the logo link's `aria-label` hid its visible text, and
  links inside grey text had no underline.

## Deviations from the brief (and why)

| Brief | What was done |
|---|---|
| FastAPI, Pydantic, Mongo indexes, pytest, `backend/seed_v2.py` | No backend exists here. The same contract is implemented in the browser demo backend. Python reference modules and the A9 tests are in `docs/` and pass |
| React, TypeScript, Tailwind, `lib/*.ts`, Leaflet via npm, `react-leaflet`-free component | Plain JS. `js/lib-core.js` is the Appendix code with types removed. Leaflet is vendored in `assets/` |
| `lib/features.ts` reading env vars, `.env.example` | `js/features.js` reading `FEATURES` in `js/config.js` (a static site has no env vars) |
| Branch `feat/pg-upgrade`, one commit per step | Not possible (no git, by TJ's choice). Per-step test gates instead |
| Frontend tests and the 17 acceptance tests in the repo | They run from outside the repo. `node js/lib-reference.test.js` is the only test file inside |
| `filters-open` test id | The existing `filters-toggle` is kept (renaming an existing id is forbidden) |
| A Sheet for the filters | Extended the inline panel (see Decisions) |
| "Three intended test changes" (7.2) | Also reworded, for the same reason (sample PGs / the required new tab): my own extra checks 3b (sort and budget), pagination (5 total), test 15's public-list count, the tab-bar assertion (now includes Roommates, or the original four when switches are off) and the data-reset check (that control was later removed from the site) |

## Results

Before the upgrade: smoke clean, end-to-end 28/28 (includes the 17 acceptance scenarios), extras 8/8, no overflow at
320 to 1440 px. After: end-to-end 28/28 (tests 1 to 3 reworded as 7.2 asks), extras 8/8, plus 78 new checks for the seven
features (F6/F2 filters 13, F2 detail and owner 6, F4 6, F7 7, F5 12, F1 12, F3 15, seed 7), the brief's JavaScript and
Python reference tests, old-versus-new API comparison (no old field removed or changed, errors identical), the same
suites with all seven switches off (28/28 and 8/8), no horizontal overflow on any tenant or owner page at 320 to 1440 px,
keyboard pass (every tab stop has a visible focus ring, Esc closes the panel), and axe-core with no non-contrast
violations. Remaining axe contrast findings are all pre-existing patterns that use the original tokens (white text on the
coral brand colour, the muted grey on the mint background, toasts, footer text), which the brief says not to change.
New components use compliant colours (darker secondary text, darker brand shade behind white text, outlined status marks).

## Step log

1 data and foundations (optional fields, seed v2, lib, flags) · 2 filters, sort and safety group (F6, F2) · 3 safety
section and owner fields (F2) · 4 true monthly cost (F4) · 5 area picker and map (F7) · 6 compare (F5) · 7 roommates (F1)
· 8 PG manager (F3) · 9 hardening, documentation.

## Rollback

Each feature: set its switch to `false` in `js/config.js`. Sample data: set `SEED_SAMPLE_PGS: false` before the first
load. To clear the data, clear this site's data in the browser.
