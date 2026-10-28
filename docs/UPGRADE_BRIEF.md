# PGConnect Website Upgrade Brief (for Claude Code)

**Version 1 · Adds seven features to the existing PGConnect website without changing what already works.**

## The brief

### 1. Mission and non-negotiables

**Mission.** Add these seven features to the live PGConnect website. Everything that exists today keeps working exactly as it does now.

| # | Feature | Who sees it | Where it appears |
|---|---|---|---|
| F1 | **Roommate matching and batch groups**: a 6-question compatibility score and cohort groups | Tenants | New page `/roommates`, a card on PG detail |
| F2 | **Safety-first search**: filters for women-only (verified), CCTV, night guard, fire exit, flexible curfew, women-only floor | Tenants (filters), Owners (fields) | Filters sheet on Explore, a Safety section on PG detail, optional fields on Add listing |
| F3 | **Owner PG manager**: rent tracking, complaints, tenant KYC and agreements | Owners | New page `/owner/manage` |
| F4 | **True monthly cost**: rent, electricity, maintenance, food, deposit, notice, lock-in, exit fee | Tenants | New section on PG detail, optional fields on Add listing |
| F5 | **Compare 2 or 3 PGs** side by side | Tenants and visitors | Compare button on PG cards and detail, tray, page `/compare` |
| F6 | **Advanced filters and sort**: budget slider, sharing type, AC, distance, short stay, verified level, availability | Tenants and visitors | Filters sheet and Sort on Explore |
| F7 | **More PGs in every area of every city, and a Map view** of PGs that have a bed free in the selected area | Tenants and visitors | List/Map toggle on Explore, sample data seed |

**Non-negotiables (the "do not break" contract):**

1. **No renames or removals.** Existing routes, endpoints, response fields, DB fields, React Query keys, `data-testid`s, copy strings, tokens and validation messages stay byte-for-byte the same.
2. **Backward-compatible data.** New DB fields are optional with safe defaults. Old documents (without the new fields) must render and behave exactly as before. Old API calls must return what they returned before, plus extra optional fields.
3. **Idempotent seeding.** Running the seed twice, or restarting the server, never duplicates data and never deletes or overwrites anything a user created.
4. **Roles stay fixed at signup.** Tenants see tenant features, owners see owner features. Wrong role gets the existing messages: "Only tenants can do this" / "Only owners can do this".
5. **No new payment behaviour.** The mock payment flow is untouched. New screens never take money.
6. **Honest content.** Anything seeded is sample data and says so. No fabricated reviews, ratings, user counts or safety guarantees.
7. **Existing tests stay green**, with three intended exceptions listed in section 7.2 (the sample data makes the Explore counts change).

### 2. Phase 0: inspect and baseline (do this first, change nothing)

Create `docs/RECON.md` with the answers below. If something differs from section 3, **the repo wins**. Adapt and note it.

**2.1 Inspect.** Use search, not guessing.

| Question | How to find out | Why it matters |
|---|---|---|
| Frontend framework: Next.js App Router, Pages Router, or Vite? | `package.json`, folder names | Decides how the map is loaded without SSR, and how routes are added |
| React version, React Query version, Tailwind config | `package.json`, `tailwind.config.*` | Leaflet is used without `react-leaflet` to avoid peer-version conflicts |
| Where are design tokens, fonts, Chip, Card, Modal, Toast, Skeleton? | `components/`, `styles/`, tailwind theme | New UI must reuse these |
| Does Explore already have a sort control, a filter panel, URL filters, "Load more"? | Explore page and its hooks | Section 11 of the old spec suggested them. Extend, never duplicate |
| URL parameter names used by Explore (`city`, `type`, `food`, `q`, maybe `sort`) | Explore page | New params must not collide |
| The fetch wrapper, auth context, role guards, 401 handling | `lib/api.*`, `lib/auth.*` | All new calls go through it |
| Backend layout: routers, models (Pydantic), DB helper, id generator, auth dependencies, seed function, startup hook | `backend/` | New code follows the same pattern |
| Is `GET /pgs` limited or paginated? Does it use a `response_model` that drops unknown fields? | the route | New optional fields must be added to the model, and a hidden `limit` must not hide sample PGs |
| Does `POST /seed` or the startup seed wipe collections, or insert only when empty? | the seed function | Decides how seed v2 is chained (section 4.4) |
| Exact stored values: gender (`female/male/unisex`), room type (`single/double/triple`), amenity strings (is it exactly `"AC"`, `"CCTV"`?) | seed + add-listing form | The filters compare against these strings |
| Does accepting a booking change `room_types[].available`? | the status route | If not, leave it (the old spec lists this as a known gap) |
| Test tooling: pytest? vitest/jest? Playwright/Cypress? How are the 17 acceptance tests run? | repo root, `package.json` scripts, CI | You must run them before and after every step |
| Content-Security-Policy or `next.config` image domains | `next.config.*`, headers | The map needs `tile.openstreetmap.org` for images |

**2.2 Baseline.** On a clean checkout, record in RECON.md: install, lint, type check, backend tests, frontend tests, build, and the result of each of the 17 acceptance tests (section 7.1). Run the app locally with an empty database, call `POST /seed`, and click through Explore, PG detail, booking, owner inquiries. If the baseline is not green, report it to TJ and do not start.

**2.3 Branch.** `git switch -c feat/pg-upgrade`. One commit per step in section 6.

**2.4 Allowed touch points.** Existing files you may edit are only these. Everything else is new files.

| Existing file (find the real name) | Allowed change |
|---|---|
| Backend models for PG and the PG summary | Add optional fields (4.1) |
| Backend `GET /pgs` and `GET /pgs/{id}` serialisers | Return the new optional fields |
| Backend `POST /pgs` | Accept the new optional fields. Same validation and error message for old payloads |
| Backend app entry (router registration, startup) | Register new routers, create indexes, call seed v2 |
| Backend seed function | Call seed v2 at the end only |
| Explore page and its reset handler | Add Filters button, Sort, List/Map toggle, new client-side filters. The existing "Clear filters / retry" must also reset the new filters |
| PG card component | Add a Compare button (bottom-left of the image) |
| PG detail page | Add sections: True monthly cost, Safety, Find a roommate, and a Compare button |
| Navbar and mobile tab bar | Tenant: add "Roommates". Owner: add "PG manager" |
| Add listing page | Add two optional, collapsed sections: "Safety details" and "Charges and terms". Required fields and the error message stay the same |
| Query client or app providers | Mount the compare provider |

### 3. What exists today (verify against the repo)

Taken from `PGConnect_Website_Build_Spec_DETAILED.md`. Treat it as a map, not as proof.

- **Stack.** FastAPI, Motor (MongoDB), JWT (HS256, 30 days), bcrypt. Frontend: Next.js or Vite + React, TypeScript, Tailwind, React Query (retry 1, staleTime 20 s, no refetch on focus). API base is `{API_URL}/api` from an env var.
- **Roles.** `tenant` and `owner`, chosen at signup, never switched.
- **Routes.** `/`, `/pg/[id]`, `/login`, `/signup`, `/saved`, `/bookings`, `/pay/[id]`, `/chat/[pgId]`, `/profile`, `/owner/dashboard`, `/owner/listings`, `/owner/listings/new`, `/owner/inquiries`.
- **Endpoints.** `POST /auth/register|login`, `GET /auth/me`; `GET /pgs` (`q`, `gender`, `city`, `food`), `GET /pgs/{id}`, `POST /pgs`, `DELETE /pgs/{id}`, `GET /owner/pgs`; reviews; shortlist; bookings (`POST /bookings`, `GET /bookings`, `GET /owner/bookings`, `GET /bookings/{id}`, `PATCH /bookings/{id}/status`, `POST /bookings/{id}/pay`); `GET /owner/stats`; chat; `POST /seed`; `GET /health`.
- **Models.** PG: `pg_id, owner_id, name, city, locality, address, gender, description, price_from, amenities[], rules[], food_included, images[], verified, rating, review_count, room_types[{type,price,available,total}], created_at`. Booking, Review, Shortlist, Message, User as in the old spec.
- **React Query keys (do not change):** `["pgs", q, gender, city, food]`, `["pg", id]`, `["reviews", id]`, `["shortlist"]`, `["bookings", isOwner]`, `["booking", id]`, `["owner-listings"]`, `["owner-stats"]`, `["chat", pgId, tenantId]`.
- **Design tokens.** Brand `#FF6B4A`, soft brand `#FFEDEA`, small brand text `#D33F22`, surface `#FAFAFA`, cards `#FFFFFF`, chip fill `#F2F4F7`, border `#E5E7EB`, success `#2D8A56`, warning `#D97B06`, error `#D33535`, muted `#717982`. Font Plus Jakarta Sans (400, 600, 700, 800). Radius 12 (inputs, buttons), 20 (cards), pill 999. No shadows by default. Chips: 36px high, 14px side padding, pill, 1px border, active = brand fill. Money: `₹` with Indian grouping, `/mo` suffix.
- **Demo data.** Five PGs owned by `owner@pgconnect.in`: Sunshine Girls PG (Bengaluru, Koramangala 5th Block), Urban Nest Co-living (Bengaluru, HSR Layout), Delhi Scholars Boys PG (Delhi, Mukherjee Nagar), Green Leaf Girls PG (Pune, Kothrud), HiTech Co-living (Hyderabad, Madhapur). Demo logins: `tenant@pgconnect.in / tenant123`, `owner@pgconnect.in / owner1234`.
- **Rules that matter here.** Every PG created through the app is `verified: true` (MVP). Rating 0 hides the rating UI. "Active tenants" on the owner dashboard counts accepted bookings, "Rent collected" counts mock payments.

**Alignment notes (do not "fix" these in this task):**
- The auto-verified rule stays. The new **verified level** (`grade`) is separate, optional, and set only by seed data or by the PGConnect team. No new code path may set a grade automatically.
- The owner dashboard's four stats keep their meaning. PG manager numbers (F3) are separate and labelled differently, so the two never contradict each other.
- The mock payment stays mock. F3 rent tracking is the owner's own record of rent paid to them in person or by their own methods.

### 4. Shared foundations (build these first)

#### 4.1 Data model additions (all optional)

Add to the PG document and to the PG summary and detail responses. Field names are in snake_case in the API and database. A PG without these fields must behave exactly as today.

```text
area             string   clean area name, e.g. "Koramangala" (locality can read "Koramangala 5th Block")
lat, lng         float    approximate position, used by distance and map
grade            string   "verified" | "verified_plus" | "assured"  (absent = falls back to verified flag)
charges          object   electricity{mode,rate_per_unit,est_monthly}, maintenance_monthly,
                          food{mode,optional_price}, deposit_months, deposit_refund_days,
                          notice_days, lock_in_months, exit_fee
safety           object   cctv, night_guard, fire_exit_clear, curfew_flexible, women_only_floor, curfew_time
short_stay_ok    bool     takes stays under 3 months
min_stay_months  int
is_sample        bool     true for every seeded sample PG
seed_key         string   stable key used only by seed v2 for upserts, never shown
```

The TypeScript shape is in Appendix A1. In Pydantic, declare each as `Optional[...] = None`, with nested models also optional. If the existing `response_model` strips unknown fields, add these fields to it.

**Indexes** (created idempotently at startup with explicit names): `pgs(city, area)`, `pgs(seed_key)` unique sparse, plus the indexes in each feature section. Never drop or alter an existing index.

**New collections** (names are suggestions, follow the repo's naming): `roommate_profiles`, `batch_groups`, `batch_members`, `tenancies`, `rent_records`, `complaints`, `kyc_records`, `agreements`.

#### 4.2 Additive API rules

- New endpoints only, or **optional** query parameters on existing ones. Old calls return the same results in the same order (newest first).
- IDs use the repo's existing generator and shape. Never expose Mongo `_id`.
- Errors use the existing shape `{"detail": "message"}` and the existing role messages.
- A resource that belongs to someone else returns 404 with the repo's wording (for listings: "Listing not found"), so existence is not leaked.
- Validate on the server: integers are whole numbers within the stated range, strings are trimmed and length-capped, dates are `YYYY-MM-DD`.
- Time zone for anything date-based is `Asia/Kolkata`.

#### 4.3 Feature switches

Create one file `lib/features.ts` (frontend) that reads `NEXT_PUBLIC_FEATURE_*` (or `VITE_FEATURE_*`) and defaults every flag to **on**: `ROOMMATES`, `SAFETY_FILTERS`, `PG_MANAGER`, `TRUE_COST`, `COMPARE`, `ADV_FILTERS`, `MAP`. When a flag is off, its nav links, buttons and sections are not rendered and its routes redirect home. This gives TJ a one-line rollback per feature. Document the flags in `.env.example`.

#### 4.4 Seed v2 (sample data, idempotent)

Write `backend/seed_v2.py` with one function `seed_v2(db)`. It is called at the end of the startup seed and at the end of `POST /seed`. Rules:

1. **Upsert by `seed_key`.** `update_one({"seed_key": key}, {"$setOnInsert": {...full doc...}}, upsert=True)`. Existing documents are never overwritten, so owner edits survive.
2. **Backfill the five original PGs** with `area`, `lat`, `lng`, `grade`, `charges`, `safety`, `short_stay_ok` using `$set` on **only the missing new fields** (`{"field": {"$exists": False}}` filter per field). Do not touch `verified`, `rating`, `review_count`, `price_from`, `room_types` or `images`. Match them by `name` + `city`.
3. **Never wipe.** If the existing seed deletes and re-inserts the five PGs, change nothing there, but make seed v2 run after it and re-apply the backfill. Check this in Phase 0.
4. **Sample owners.** Create one sample owner per city (`sample.owner.<city>@pgconnect.in`, name "Sample Owner <City>", `is_sample: true`) with a random password hash nobody knows, so they cannot log in. Sample PGs belong to them. The demo owner's dashboard keeps showing 5 listings.
5. **Sample PGs per area.** For each of the 16 areas in Appendix A5, make sure there are **at least 5 PGs** in total (the originals count). Rules for the generator, using `random.Random(f"{city}-{area}-{i}")` so the output is the same every run:
   - Name: `"<Tree or plant word> <Court|Residency|Nest|House|Villa|Stay>"`, for example "Neem Court". Use words such as Neem, Banyan, Jasmine, Maple, Cedar, Lotus, Tulsi, Peepal, Mango, Palm, Willow, Saffron, Orchid, Bamboo. Never use a real PG or co-living brand name. Before finishing, search the result for common brand names and remove any clash.
   - Gender mix per area: at least 2 `female`, 1 `male`, 1 `unisex`. The rest are random.
   - Double-room rent: area `doubleBase` ±20%, rounded to ₹500. Single = double × 1.4 rounded to ₹500 (about 70% of PGs offer it). Triple = double × 0.78 rounded to ₹500 (about 40% of PGs offer it). `price_from` = the lowest room price.
   - Beds: `total` 6 to 12 per room type. `available` 0 to 3. About 20% of PGs must be completely full, so the map shows only PGs with a free bed.
   - Position: area centre plus a random offset within about 1.2 km (±0.011° latitude and longitude).
   - Amenities: always WiFi, then each of AC, Laundry, Housekeeping, CCTV, Parking, Gym, Hot Water, Power Backup at 50% to 60%. Use the exact strings of the existing add-listing form.
   - Safety flags: independent random booleans (CCTV 70%, night guard 55%, clear fire exit 80%, flexible curfew 40%). `women_only_floor` is true only for about 30% of `unisex` PGs.
   - Charges: electricity `metered` (est_monthly 600 to 1,200) or `included` (0); maintenance 0 to 800; food mode `included`, `optional` (price ₹2,500 to ₹4,500) or `none`, consistent with `food_included`; deposit 1 to 2 months; refund days 7 to 15; notice 15 to 30 days; lock-in 0 to 3 months; exit fee 0 or ₹1,000 to ₹2,000.
   - Grade: 50% `verified`, 35% `verified_plus`, 15% `assured`. These are demo grades.
   - `verified: true`, `rating: 0`, `review_count: 0`, `is_sample: true`. **Do not invent reviews or ratings.**
   - Images: rotate the same three Unsplash photos the original seed uses. Add no new external image hosts.
   - Description: "Sample listing in {area}, {city}. Prices and details are demo data." Address: "{area}, {city}".
   - Fixed IDs: `seed_key = f"sample:{city}:{area}:{i}"`.
6. **Roommate and group samples** (F1) and **PG manager demo data** (F3) are seeded here too, using the same upsert rule. Details are in those sections.
7. Set the env variable `SEED_SAMPLE_PGS` (default `1`). When it is `0`, skip creating sample PGs, sample owners, sample roommate profiles and groups. The backfill of the original five still runs.
8. Log one line: how many documents were inserted vs already present.

Expected result: 80 or more PGs across 4 cities and 16 areas, the original five untouched.

#### 4.5 Frontend foundations

- Copy Appendix code into `lib/types.ts` (extend the existing PG type, do not replace it), `lib/geo.ts`, `lib/passport.ts`, `lib/filters.ts`, `lib/roommate.ts`, `lib/rent.ts`, `lib/areas.ts`.
- Add small shared components if the repo lacks them: `Sheet` (bottom sheet on mobile, right drawer on desktop, focus trap, Esc closes), `Switch`, `Slider` (dual handle). Check what exists first.
- Format money with the repo's existing `format.ts`. Do not write a second rupee formatter.
- **Accessibility.** Every control is keyboard reachable, has a visible 2px brand focus ring, and a 44px minimum touch target. Chips and toggles use `aria-pressed`. Small brand-coloured text uses `#D33F22`, not `#FF6B4A`. Respect `prefers-reduced-motion`. If the site has a dark theme, new components use the theme variables and no raw hex.
- **Loading and empty states** use the repo's skeletons and empty-state pattern (emoji, title 18/700, hint in muted).
- **URL state.** New Explore filters are mirrored into the URL with these new names, written with `replace` (no history spam), and read on load. Existing names (`city`, `type`, `food`, `q`) are untouched.

  | Param | Meaning | Example |
  |---|---|---|
  | `area` | area name | `area=Kothrud` |
  | `min`, `max` | budget | `min=6000&max=12000` |
  | `incl` | budget includes electricity and maintenance | `incl=1` |
  | `share` | comma list | `share=single,double` |
  | `ac`, `short`, `avail` | `1` when on | `ac=1` |
  | `grade` | `verified`, `verified_plus`, `assured` | `grade=verified_plus` |
  | `safety` | comma list of `wov,cctv,guard,fire,curfew,wfloor` | `safety=cctv,guard` |
  | `dist`, `ref` | km and reference (`near` or an area name) | `dist=2&ref=Kothrud` |
  | `sort` | key from Appendix A4 (if Explore already has `sort`, reuse its name and values and add only the new keys) | `sort=price_asc` |
  | `view` | `list` or `map` | `view=map` |

  In Next.js App Router, wrap `useSearchParams` consumers in `<Suspense>` so the build does not fail.

#### 4.6 Copy and guardrails

- Use the exact strings given in each feature section.
- **Never write:** "100% safe", "completely safe", "no risk", "guaranteed", "best price", "lowest price guaranteed", "fully verified" (for safety fields), or medical, legal or financial promises.
- Safety information is always labelled **"Declared by the owner"** unless a grade backs it, and it is paired with: "Visit the PG in person before you pay."
- No long dashes (em or en) in on-screen text.
- No fundraising language anywhere in the product.
- No made-up user numbers, testimonials or ratings. Sample data says "Sample" or "demo".

#### 4.7 Testing approach

Use the repo's tools. If it has none for a layer, add the lightest standard one (pytest for the backend, vitest for `lib/*`), nothing heavy.

- Copy the reference tests from Appendix A8 (TypeScript) and A9 (Python) into the repo so the maths is locked in.
- Backend: one test file per new router, covering success, validation errors, wrong role (403 with the existing wording), someone else's resource (404), and **old payloads still working**.
- Frontend: unit tests for `lib/*`, and acceptance tests (Given/When/Then in each feature section) in the repo's end-to-end tool.
- After every step run: lint, type check, backend tests, frontend tests, build, and the 17 existing acceptance tests.

### 5. The seven features

Each feature lists: what the tenant or owner sees, data and API, UI and `data-testid`s, acceptance tests (Given/When/Then), edge cases, and how to roll it back. Build in the order of section 6, not the order of numbering.

---

#### F6. Advanced filters and sort (Explore)

**What the user sees.** Under the existing chip rows, a **Filters** button (shows a count badge, for example "Filters · 3") and a **Sort** dropdown. The existing city and type chips and the Food chip stay exactly as they are. The Filters button opens the Sheet.

**Filters in the Sheet** (title "Filters"):

| Group | Control | Rule |
|---|---|---|
| Budget (per month) | Dual-handle slider ₹3,000 to ₹30,000, step ₹500, with two number readouts, plus a switch "Include electricity and maintenance" | Compares the cheapest room among the chosen sharing types (or all rooms). With the switch on, it compares the true monthly cost (F4) instead of rent |
| Sharing | Chips Single, Double, Triple (multi-select) | PG must have a room of any chosen type |
| Room | Switch "AC available" | `amenities` contains `AC` (case-insensitive) |
| Stay | Switch "Short stay OK (under 3 months)" | `short_stay_ok` is true. PGs without the field do not match |
| Verified level | Radio: Any, Verified, Verified Plus, Assured | PG grade is at least the chosen level. A PG with no `grade` and `verified: true` counts as Verified |
| Availability | Switch "Beds free now" | Total `available` across room types is above 0. With a sharing type chosen, that type must have a free bed |
| Distance | Select "From": Near me, or any area centre of the chosen city. Chips 1 km, 2 km, 5 km, 10 km | Straight-line distance. PGs without coordinates are excluded when a distance is set. "Near me" asks the browser for location only when the user taps it and falls back to the area picker if denied |
| Safety (F2) | Six switches, see F2 | All chosen switches must match |

Footer buttons: **"Show {n} PGs"** (applies and closes) and **"Reset all"**. Live count while the Sheet is open.

**Sort options:** "Newest" (default, same as today), "Price: low to high", "Price: high to low", "Rating", "Nearest" (enabled only when a distance reference is set), "Most beds free". Ties are broken by `pg_id` so the order is stable.

**How it is built (important for "nothing breaks").**
- The server call stays `GET /pgs?q=&gender=&city=&food=` with the existing query key `["pgs", q, gender, city, food]`. **All new filters run on the client** with `applyFilters` from Appendix A4, on the list the server returns. No API change, no new query key, no cache change.
- The result counter keeps its wording ("{n} verified PG(s)") and shows the count **after** the new filters.
- The existing empty state "No PGs match your filters" with the "Clear filters / retry" button stays. **That button must reset the new filters too** (budget, sharing, switches, area, distance, sort, view).
- If Explore already has a sort control or a filter panel (old spec section 11), extend it. Do not create a second one. Keep its param names.
- Budget slider bounds come from the constants in `filters.ts`. If an existing PG costs outside the range, the default (no filter) still shows it, because the default range equals the bounds and is treated as "no filter".

**Test IDs:** `filters-open`, `filters-count`, `filters-sheet`, `filter-min`, `filter-max`, `filter-incl-extras`, `filter-share-{single|double|triple}`, `filter-ac`, `filter-short-stay`, `filter-grade-{any|verified|verified_plus|assured}`, `filter-available`, `filter-dist-from`, `filter-dist-{1|2|5|10}`, `filter-apply`, `filter-reset`, `sort-select`.

**Acceptance tests**
- **F6-1.** Given Explore with sample data, when the user sets max budget to ₹7,000, then every visible card has a room at or under ₹7,000 and the counter equals the number of cards.
- **F6-2.** When the user turns on "AC available", then every visible PG has the AC amenity on its detail page.
- **F6-3.** When "Beds free now" is on, then no visible PG has zero free beds.
- **F6-4.** Given city Pune, area picker "Kothrud" as reference and 2 km, then every result is within 2 km (verify with `haversineKm` in a test) and sorting by "Nearest" is non-decreasing in distance.
- **F6-5.** When three filters are active, the badge reads "Filters · 3". Setting a group back to default lowers it. Reset all returns to the same list as a fresh load.
- **F6-6.** Reload the page with `?safety=cctv&ac=1&max=12000&sort=price_asc`: the same state is restored.
- **F6-7.** The existing "Clear filters / retry" button restores the full list after combining old and new filters.

**Rollback.** Flag `ADV_FILTERS=off` hides the button and Sort and ignores the new URL params.

---

#### F2. Safety-first search

**What the tenant sees.**
- In the Filters Sheet, a **Safety** group with six switches (labels exact):
  1. "Women-only (verified)": `gender === female` and `verified === true`
  2. "CCTV on entrances and common areas": `safety.cctv`
  3. "Night guard or warden": `safety.night_guard`
  4. "Clear fire exit": `safety.fire_exit_clear`
  5. "Flexible curfew": `safety.curfew_flexible`
  6. "Women-only floor": `safety.women_only_floor`
- Under the group: "Safety details are declared by the owner. Visit the PG in person before you pay."
- The main chip rows (city, type, food) stay unchanged. "Women-only (verified)" lives only in the Sheet.
- On **PG detail**, a new **Safety** section placed after Amenities. It shows the six items as a checklist: a tick for "yes", a dash for "No", and "Not stated by owner" when the field is missing. It also shows the curfew time if set ("Curfew: 11:00 PM"). Header line: "Declared by the owner" (or "Checked by PGConnect" only if `grade` is `verified_plus` or `assured`, and only when the copy elsewhere defines that). Footer: "Visit the PG in person before you pay."
- **Missing is not "unsafe".** Never show a red mark for a missing field.

**Owner side.** On Add listing, a new collapsed section **"Safety details (optional)"** with five checkboxes (CCTV, Night guard or warden, Clear fire exit, Flexible curfew, Women-only floor) and an optional curfew time. Collapsed by default. The existing required-field validation and its message are unchanged. The `POST /pgs` payload adds a `safety` object only when the owner opened the section.

**Data and API.** `safety` object on the PG (4.1). `POST /pgs` accepts it. No new endpoint. Filtering uses `applyFilters`.

**Test IDs:** `filter-safety-{wov|cctv|guard|fire|curfew|wfloor}`, `pg-safety-section`, `pg-safety-{cctv|guard|fire|curfew|wfloor}`, `al-safety-toggle`, `al-safety-{cctv|guard|fire|curfew|wfloor}`, `al-curfew-time`.

**Acceptance tests**
- **F2-1.** With "Women-only (verified)" on, every result shows the Girls tag and the Verified pill. No Boys or Co-living PG appears.
- **F2-2.** With CCTV and Night guard on, every result's detail page shows both as ticked.
- **F2-3.** A PG without `safety` data is hidden by any safety switch but shows "Not stated by owner" on its detail page, with no red marks.
- **F2-4.** Owner publishes a PG using the old minimal form (name, city, locality, double price). It succeeds with the old behaviour, and its detail page shows the Safety section with every line "Not stated by owner".
- **F2-5.** Owner opens "Safety details", ticks CCTV, publishes. The detail page shows CCTV ticked and the others "Not stated by owner".

**Rollback.** Flag `SAFETY_FILTERS=off` hides the Safety group and the detail section. Data stays.

---

#### F4. True monthly cost ("Price Passport")

**What the tenant sees.** On PG detail, a new section **"True monthly cost"** after "Rooms available". Sub line: "What you pay each month, beyond the rent on the card."

1. A room selector (the same chip style as the booking sheet): Single, Double, Triple, only the types the PG has. Default is the cheapest room.
2. A table for the chosen room:

| Row | Source |
|---|---|
| Rent | the room price |
| Electricity (estimate) | `charges.electricity.est_monthly`, or "Included" when mode is `included`, or "Not stated by owner" |
| Maintenance | `charges.maintenance_monthly`, "None" when 0, or "Not stated by owner" |
| **Total per month** | rent + electricity + maintenance, using the stated parts only |

3. A line under the total: "+₹{extra} a month over the rent shown on the card" (only when extra is above 0).
4. **Food** shown separately and never added to the total: "Food: Included in rent", or "Food: Optional, ₹{price} a month" with a second line "Total with food: ₹{x}", or "Food: Not offered".
5. **Terms**: "Refundable deposit: {n} months (₹{amount})", "Deposit returned within {n} days", "Notice period: {n} days", "Lock-in: {n} months" (or "None"), "Exit fee: ₹{amount}" (or "None"), and **"Cash needed to move in: ₹{x}"** with the hint "Deposit plus first month's rent".
6. Footnote: "Estimates from the owner. Electricity depends on how much you use." If any part is missing, add "Some details were not stated by the owner. Ask them before you book."

All maths is `computePassport` (Appendix A3). Do not recompute anywhere else, and the budget filter reuses the same function.

**Owner side.** On Add listing, a collapsed section **"Charges and terms (optional)"** with: electricity (Metered, Included, Fixed) and an estimate in ₹ per month, maintenance ₹ per month, food (Included, Optional with price, None), deposit months (0 to 6), deposit refund days, notice days, lock-in months, exit fee ₹. Numbers are whole, 0 or more, with sensible caps (rent-related values up to ₹1,00,000). Collapsed by default. `POST /pgs` adds `charges` only when the section was used.

**PG card.** Unchanged. Do not alter the price pill.

**Test IDs:** `pg-passport`, `passport-room-{type}`, `passport-rent`, `passport-electricity`, `passport-maintenance`, `passport-total`, `passport-extra`, `passport-food`, `passport-deposit`, `passport-notice`, `passport-lockin`, `passport-exit`, `passport-movein`, `al-charges-toggle`, `al-ch-electricity-mode`, `al-ch-electricity`, `al-ch-maintenance`, `al-ch-food-mode`, `al-ch-food-price`, `al-ch-deposit-months`, `al-ch-refund-days`, `al-ch-notice`, `al-ch-lockin`, `al-ch-exit`.

**Acceptance tests**
- **F4-1.** Sunshine Girls PG, Double: rent ₹9,500 and, with the backfilled charges (electricity ₹900, maintenance ₹500), total ₹10,900, extra ₹1,400, deposit 2 months (₹19,000), move-in cash ₹28,500. Choosing Single recalculates from ₹13,500.
- **F4-2.** A PG with no `charges` shows only Rent and the total equal to rent, the other rows say "Not stated by owner", the footnote adds the "ask the owner" line, and nothing shows NaN, "undefined" or ₹0 for missing values.
- **F4-3.** Food optional at ₹3,000 shows "Total with food" as total plus ₹3,000, and the main total does not include food.
- **F4-4.** The budget switch "Include electricity and maintenance" changes which PGs pass a ₹10,000 cap, and agrees with the Total on each detail page.
- **F4-5.** The old booking flow (room chips, date, months, message, send) is unchanged and still creates a booking with the room price as before.

**Rollback.** Flag `TRUE_COST=off` hides the section and the budget switch.

---

#### F7. More PGs in every area, and the Map view

**Data.** Seed v2 (4.4) gives every area at least 5 sample PGs with coordinates. This feature adds the UI.

**What the tenant sees.**
- A **List | Map** toggle on Explore next to Filters and Sort (list is the default). `view=map` in the URL.
- **Area picker** above the results: chips for the areas of the selected city (derived from the list, in alphabetical order) plus "All areas". When no city is selected, the Map view shows: "Pick a city and an area to see PGs with a bed free." with the city chips highlighted. The list view still works without a city.
- **Map view** (city and area selected, or just a city): a map centred on the area showing **only PGs with at least one free bed right now** (`room_types[].available` total above 0) that also match the current filters. Each PG is a price pill pin ("₹9.5k"). The selected pin is highlighted (brand fill, white text). Tapping a pin opens a small card (a bottom card on mobile, a side card on desktop) with the first photo, name, "{area}, {city}", "from ₹{price}/mo", "{n} beds free", a **View** button to `/pg/{id}`, and a **Compare** button (F5).
- A header line: "{n} PGs with a bed free in {area}". When none: empty state "No PGs with a free bed here right now" with the hint "Try another area or relax a filter." and a "Show list" button.
- The result list below (or beside, on desktop) shows the same PGs as the pins, so the page also works without a map. Hovering a card highlights its pin and the reverse.
- Attribution "© OpenStreetMap contributors" is always visible. If tiles fail to load, the pins still show on the blank map and a one-line note appears: "Map tiles could not load. The list below has the same PGs."
- Use "Beds free" wording, not "Available", because availability is whatever the owner last set.

**How it is built.**
- Library: **Leaflet 1.9.x used directly** (no `react-leaflet`, to avoid React version conflicts), with OpenStreetMap tiles. Pins are `L.divIcon` price pills, which also avoids Leaflet's default marker image problem with bundlers. A reference component is in Appendix A7. It is a sketch: type-check it, test it in the browser, and adapt it.
- Load it lazily with no server rendering: `dynamic(() => import(...), { ssr: false })` in Next.js, or `React.lazy` in Vite. The Explore list must render without it.
- Import `leaflet/dist/leaflet.css` inside the map component only.
- Add the CSS for `.pg-map` (height 420px mobile, 560px desktop, radius 20, 1px border), `.pg-pin` (pill, brand fill when selected, white fill with brand text and 1px border otherwise, 12px/700), `.pg-pin-wrap` (no background).
- If the site sets a Content-Security-Policy, allow `img-src https://tile.openstreetmap.org` (and `https://*.tile.openstreetmap.org` if needed).
- Data: the same list the Explore page already has (key `["pgs", q, gender, city, food]`), filtered by `applyFilters` with the selected area. No new endpoint. The area chips come from the same list, filtered by the chosen city only, so they do not disappear when other filters are on.
- The map component receives plain props (PGs, centre, selected id, callbacks) and holds no data fetching.
- Keyboard: pins are focusable (`keyboard: true`) with a title. The list is the accessible alternative.
- Do not use `window` at module top level. Destroy the map on unmount (the reference does).
- Be gentle with OpenStreetMap's tile servers: no prefetching, no scraping, normal map use only. If traffic grows, TJ should switch to a hosted tile provider.

**Test IDs:** `view-list`, `view-map`, `area-chip-{Area}`, `area-chip-all`, `map-canvas`, `map-pin-{pg_id}`, `map-card`, `map-card-view`, `map-card-compare`, `map-count`, `map-empty`.

**Acceptance tests**
- **F7-1.** After seeding, every one of the 16 areas has at least 5 PGs (backend test counts them by `city` and `area`). The original five are unchanged (name, price, rating, images).
- **F7-2.** Running the seed twice, or restarting the server, leaves the PG count unchanged and does not change a PG that an owner edited.
- **F7-3.** City Pune, area Kothrud, Map view: the number of pins equals the number of Kothrud PGs with a free bed, and equals the number in the list. A fully booked Kothrud PG has no pin but still shows in List view.
- **F7-4.** Tapping a pin opens the card, View opens that PG's detail page, and Back returns to the map with the same state (from the URL).
- **F7-5.** With tiles blocked (offline), pins and the list still render and the one-line note appears. No console errors from the app code.
- **F7-6.** Switching to List and back keeps filters and the area.
- **F7-7.** Explore without the map flag (`MAP=off`) behaves like before.

**Rollback.** Flag `MAP=off` hides the toggle. The sample PGs remain, set `SEED_SAMPLE_PGS=0` to skip creating them on a new database (default is on).

---

#### F5. Compare 2 or 3 PGs

**What the user sees.**
- A **Compare** button on every PG card, at the **bottom-left of the image** (the heart is top-right, the Verified pill top-left, the price pill bottom-right, so this corner is free). It reads "+ Compare" and turns into "✓ Added" when selected. It has a 44px tap area and `stopPropagation` so tapping it never opens the card.
- A **Compare** button in the PG detail title row (same behaviour), and in the map card.
- A **tray** fixed at the bottom of the page, visible when 1 or more PGs are chosen: thumbnails with name and a remove (x), the text "Compare ({n}/3)", a **Compare now** button (disabled until 2 are chosen) and **Clear**. On mobile it sits above the tab bar. It does not cover the sticky booking bar on PG detail (hide the tray on `/pg/*`, show only the detail-page button).
- Trying to add a fourth: the tray does a short shake (skip the animation with reduced motion) and a toast says "You can compare up to 3 PGs. Remove one to add another."
- **Compare page** `/compare?ids=a,b,c`: columns are PGs (2 or 3), rows are attributes. On mobile the table scrolls horizontally with the first column (row labels) sticky. Sections and rows:
  - Header cells: photo, name, "{area}, {city}", Verified pill, rating (if above 0), "Remove", "View PG".
  - **Cost:** Rent (cheapest room, with the room name), Total per month (F4), Extra over rent, Food, Deposit, Notice, Lock-in, Exit fee, Cash needed to move in.
  - **Rooms:** Sharing types and prices, Beds free now.
  - **Safety:** six rows with tick, "No" or "Not stated".
  - **Basics:** Gender, AC, Short stay OK, Verified level, Distance from the chosen reference (only if one is set; carry `ref` from Explore in the URL).
  - **Best value markers:** a small text label "Lowest" under the cheapest total per month and the cheapest move-in cash (text, not colour alone). Only mark when at least two PGs have a known value, and if they tie, mark both.
- The comparison reads data from the existing detail endpoint through the existing key `["pg", id]`, one `useQueries` call. **No new endpoint.**

**State.**
- A `CompareProvider` (React context) holds up to 3 `pg_id`s. It persists in `localStorage` under `pgc.compare` inside `try/catch` (private windows can throw) and the page works without it. IDs are validated when loaded.
- The URL is the source of truth on `/compare`. If the URL has more than 3 IDs, use the first 3. If an ID returns 404, show a column "This PG is no longer available" with a Remove button. If fewer than 2 valid PGs remain, show: "Add one more PG to compare." with a link to Explore.
- Available to visitors and tenants. Hidden for the owner role (owners have no Explore shopping context). Follow whatever the repo does for owners on Explore.

**Test IDs:** `compare-btn-{pg_id}`, `compare-tray`, `compare-count`, `compare-go`, `compare-clear`, `compare-remove-{pg_id}`, `compare-page`, `compare-col-{pg_id}`, `compare-row-{key}`, `compare-lowest-{pg_id}`.

**Acceptance tests**
- **F5-1.** Tap Compare on two cards: the tray shows "Compare (2/3)", Compare now opens `/compare?ids=...` with two columns.
- **F5-2.** Tapping Compare on a card does not navigate to the PG page. Tapping the card elsewhere still does.
- **F5-3.** Adding a fourth PG is refused with the toast, the count stays 3.
- **F5-4.** Reload `/compare?ids=a,b`: same view. Remove one: URL and tray update, page asks to add one more.
- **F5-5.** For two PGs with known charges, the lower total per month carries the "Lowest" label.
- **F5-6.** At 360 px there is no page-level horizontal scroll (only the table scrolls), and the first column stays visible.
- **F5-7.** An unknown ID shows "This PG is no longer available" and no crash.

**Rollback.** Flag `COMPARE=off` hides the buttons, the tray and the route.

---

#### F1. Roommate matching and batch groups

**Purpose.** Help a tenant find people with compatible routines, and join a cohort of people moving at the same time. No chat is built here. Matches and groups are for discovery, so the privacy risk stays small.

**Who and where.** Tenants only. New page `/roommates`, a **Roommates** link in the tenant navbar and tab bar, and a card on PG detail: "Find a roommate in {city}" linking to `/roommates?city={city}`. Owners and visitors are redirected as the old role rules do (visitors to `/login?next=/roommates`).

**The quiz** (6 questions, one answer each, options map to 0, 1, 2). The questions, options and weights are in `lib/roommate.ts` (Appendix A2) and are the single source of copy.

**The score.** `100 − Σ weight × |a − b| ÷ 2`, rounded half up. Bands: 80 to 100 "Great match", 60 to 79 "Good match", 40 to 59 "Some differences", below 40 "Very different routines". Show up to three "why you match" chips (the questions where both answers are the same). The score is computed on the **server** (Appendix A2 Python port) for the matches list, and the TypeScript version is used for display and tests. Both must give identical numbers (the test vectors in A8 and A9).

**Page layout.**
1. **Step 1, "Your routine".** Six questions as large option cards (one per question, progress "2 of 6"), a city select (default: the city of the PG the user came from, else Bengaluru), an optional "I am looking for" select (Summer intern, New job, College starter, Exam aspirant, Other), and a switch **"Show me to others"** (default off). Save button "See my matches".
2. **Step 2, "Your matches in {city}".** Cards sorted by score (highest first, ties by id): first name and initial ("Ishita K."), the score as a ring or bar with the band label, the "why you match" chips, the intake label, and a "Sample profile" tag when it is a sample. If the user has not switched visibility on, the matches are still shown, but a note says "Others cannot see you yet. Turn on 'Show me to others' to appear in their list."
3. **Batch groups.** Under the matches: the list of groups for the city (name, who it is for, start window, "{n} of 12 joined"). Buttons **Join** and **Leave**. A full group shows "Group is full" and a disabled button. A group card opens a drawer with its members (first name and initial, and your score with each if you have a profile).
4. **Privacy block** always visible: "Only your first name, initial and quiz answers are shown to others. Your phone, email and exact location are never shared. You can turn this off or delete your profile at any time."
5. Buttons: **Retake the quiz**, **Switch off matching** (sets `opt_in` false and removes you from lists), **Delete my roommate profile** (with confirm; also removes group memberships).

**Rules.**
- Joining a group requires a saved profile with visibility on. If the user taps Join without it, open step 1 with the message "Turn on 'Show me to others' to join a group."
- Group cap 12. Joining is idempotent. Leaving is idempotent.
- A user sees only opted-in profiles in the same city. Their own profile never appears in their own matches.
- No free-text profile fields (no bio), so there is nothing to moderate. Names come from the account (first name and first letter of the last name only).

**Data.**

```text
roommate_profiles  profile_id, user_id (null for samples), first_name, last_initial, city, intake,
                   answers [6 ints 0..2], opt_in, is_sample, seed_key?, created_at, updated_at
                   indexes: (user_id) unique sparse, (city, opt_in)
batch_groups       group_id, city, name, for_whom, window_label, cap (12), is_sample, seed_key, created_at
batch_members      group_id, profile_id, joined_at     index: (group_id, profile_id) unique
```

**API** (all tenant-only, Bearer token, existing role message otherwise):

| Endpoint | Behaviour |
|---|---|
| `GET /roommate/profile` | `{"profile": {...}}` or `{"profile": null}` (200, never an error) |
| `PUT /roommate/profile` | body `{answers:[6 ints 0..2], city, intake?, opt_in}`. Validates (`valid_answers`), upserts for the user, returns the profile. Error: "Answer all 6 questions" |
| `DELETE /roommate/profile` | removes the profile and memberships, returns `{"ok": true}` |
| `GET /roommate/matches?city=` | opted-in profiles in that city, excluding the caller, each `{profile_id, first_name, last_initial, intake, score, band, why, is_sample}`, sorted by score desc then profile_id. Max 30. Needs a saved profile, else 400 "Answer the quiz first" |
| `GET /batches?city=` | groups with `member_count` (computed), `joined` (for the caller), `full` |
| `GET /batches/{group_id}` | group plus members (`first_name`, `last_initial`, `score` against the caller if they have a profile) |
| `POST /batches/{group_id}/join` | needs a profile with opt_in. 400 "Turn on 'Show me to others' to join a group." or "Group is full" |
| `DELETE /batches/{group_id}/join` | leaves, always `{"ok": true}` |

**Seed (sample data, idempotent).**
- **Six sample profiles per city** (24 total) using the six answer sets from Appendix A8 (`[0,0,1,1,1,1]`, `[1,1,1,0,0,1]`, `[2,2,2,2,2,2]`, `[0,1,1,1,1,0]`, `[2,1,2,2,1,2]`, `[1,1,0,1,0,1]`) with different fictional first names per city (for example Aarav, Ishita, Kabir, Meera, Rohan, Tanvi, Vihaan, Diya, Arjun, Naina) and a last initial. `opt_in: true`, `is_sample: true`, `user_id: null`.
- **Five groups per city:** "Summer interns" (May to July intake), "New job, new city" (next 3 months), "College starters" (August intake), "Exam aspirants" (all year), "Early risers and quiet study" (all year). `cap: 12`, `is_sample: true`.
- Put 2 to 4 sample profiles in each group so counts are real (they are counted from `batch_members`, never faked).
- Sample profiles and groups carry a visible "Sample" tag in the UI.

**Test IDs:** `rm-q-{1..6}-opt-{0|1|2}`, `rm-city`, `rm-intake`, `rm-optin`, `rm-save`, `rm-match-{profile_id}`, `rm-score-{profile_id}`, `rm-band-{profile_id}`, `rm-retake`, `rm-switch-off`, `rm-delete`, `group-{group_id}`, `group-join-{group_id}`, `group-leave-{group_id}`, `nav-roommates`, `pg-roommate-card`.

**Acceptance tests**
- **F1-1.** Backend: for `mine = [0,1,0,1,0,1]` the six sample answer sets score `75, 73, 25, 83, 43, 88`, and `roommate_score([0]*6, [0,0,1,0,0,0]) == 93`. The TypeScript function returns the same numbers.
- **F1-2.** A tenant answers 6 questions, saves with visibility on, and sees matches in their city sorted high to low, never including themselves.
- **F1-3.** A tenant with visibility off still sees matches but is not in anyone else's list (verify with a second tenant account).
- **F1-4.** Joining a group works once (a second tap does nothing), the count goes up by 1, Leave brings it back. At 12 members Join is refused with "Group is full".
- **F1-5.** An owner opening `/roommates` is redirected as other tenant-only pages are. API calls from an owner return "Only tenants can do this". A visitor goes to login and returns.
- **F1-6.** Deleting the profile removes it from lists and groups. The matches call then says "Answer the quiz first".
- **F1-7.** No response contains an email, phone number or user id of another user.

**Rollback.** Flag `ROOMMATES=off` hides nav, card and route. The collections stay and the endpoints can stay mounted.

---

#### F3. Owner PG manager (rent tracking, complaints, tenant KYC, agreements)

**Purpose.** Give an owner a simple register for each PG: who lives where, whether rent is paid, what problems are open, whether ID and agreement are done. It is the owner's own record. It does not move money.

**Where.** New page `/owner/manage` (Owner navbar and sidebar: **PG manager**). Owner only. A PG selector on top (the owner's PGs from `["owner-listings"]`). An optional extra link card on the owner dashboard, "Open PG manager", without changing the four stats.

**Tabs** (labels exact): **Tenants**, **Rent**, **Complaints**, **KYC & agreements**.

**Header cards** (above the tabs, for the selected PG): "Occupancy" (occupied beds of total beds, with a percentage), "Rent due this month" (₹ and number of tenants), "Collected this month" (₹ and percentage of the rent roll), "Open complaints". These are different from the dashboard stats, and a small note under the cards says: "These figures come from your PG manager records. The dashboard's 'Rent collected' counts in-app mock payments."

**Tenants tab.**
- A card per tenant: name, room label, sharing type, rent, move-in date, status chips: rent status (this month), KYC (done/pending), agreement (signed/pending).
- Vacant beds are shown as dashed empty cards ("Vacant bed") up to the PG's total beds (`sum(room_types[].total)`), and the **Add tenant** button.
- **Add tenant** form: name (required, max 60), phone (optional, 10 digits, shown masked after saving), room label (required, max 12, for example "R204-A"), sharing type (single, double, triple), monthly rent (required, ₹1 to ₹1,00,000), deposit paid (₹, optional), move-in date (required, `YYYY-MM-DD`), stay length in months (1 to 24, default 11), and a checkbox "Update available beds" (default on). Saving creates the tenancy and its rent schedule (A6) and, if the box is ticked, lowers `available` for that room type by 1 when it is above 0 (single atomic update with a condition on `available > 0`). If the PG has no room of that type, show "This PG has no {type} rooms listed." and save nothing.
- **End tenancy** (confirm): sets status ended, raises `available` back by 1 up to `total` (when the box was ticked at creation), keeps the history, stops showing future rent rows.
- Do not change how accepted bookings count as "Active tenants" on the dashboard. Do not link bookings and tenancies in this task.

**Rent tab.**
- Month selector (default: current month, IST). A table or card list: tenant, amount, due date, status chip, action.
- Status is derived (A6): **Upcoming**, **Due** (up to 5 days after the due date), **Overdue**, **Paid**, **Waived**. Never store the status, and compute it with `rent_status` on the server for list responses.
- Actions: **Mark paid** (date defaults to today, mode: Cash, UPI, Bank transfer, Other), **Undo**, **Waive** (with a short note), and **Copy reminder** which copies a polite text to the clipboard: "Hi {first name}, a gentle reminder that rent of ₹{amount} for {Month Year} at {PG name} was due on {date}. Please let me know once it is paid. Thank you." No message is sent by the app.
- Totals row: collected, due, overdue for the month.

**Complaints tab.**
- List with status chips **Open**, **In progress**, **Resolved**. Filter by status. **Add complaint** (owner enters on behalf of a tenant or for the PG): category (Water, Electricity, Cleaning, Wi-Fi, Food, Noise, Safety, Other), title (max 80), details (max 500), optional tenant, priority (Normal, High). Change status with a selector, add an owner note (max 300). Resolved complaints show the resolved date. Newest first.
- A **Safety** category complaint set to High is pinned at the top and shows a small note "Act on this first." (No promises about response times.)
- Tenant-raised complaints are an optional later extension (section 8). Not in this task.

**KYC & agreements tab.** Per tenant row:
- **KYC (owner-attested).** Select ID type (Aadhaar, Passport, Driving licence, Voter ID, College or work ID), a checkbox "I have seen the original ID", status **Pending**, **Verified**, **Rejected**, and the date. **Do not collect or store ID numbers, ID images or documents.** Aadhaar numbers in particular must never be stored. The page says: "PGConnect stores only the type of ID you saw and the date. Do not enter ID numbers here."
- **Agreement.** A generated rental agreement built from the tenancy: parties (owner name, tenant name), PG name and address, room, rent, due day, deposit, notice days, lock-in months, exit fee, move-in and end dates, and the PG's house rules. A **Preview** shows it as a printable page (print stylesheet, "Print or save as PDF"). Status **Draft** → **Shared** → **Signed**. "Mark as signed" asks the owner to type the tenant's full name (and records the date and time and the version of the terms). Edits after Signed create a new version and reset to Draft.
- Footer on the agreement and the tab: "This is a simple record of the terms you both agreed. It is not a stamped or registered agreement and is not legal advice. Check your state's rules on stamp duty and registration."

**Data.**

```text
tenancies     tenancy_id, pg_id, owner_id, tenant_name, phone (optional), room_label, room_type, monthly_rent,
              deposit_paid, move_in (YYYY-MM-DD), stay_months, status (active|ended), adjust_availability (bool),
              is_sample, seed_key?, created_at, ended_at?
              indexes: (owner_id, pg_id, status), (seed_key) unique sparse
rent_records  rent_id, tenancy_id, pg_id, owner_id, due_date, amount, paid_at?, mode?, note?, waived (bool)
              indexes: (pg_id, due_date), (tenancy_id, due_date) unique
complaints    complaint_id, pg_id, owner_id, tenancy_id?, category, title, details, priority, status,
              owner_note?, created_at, updated_at, resolved_at?
kyc_records   kyc_id, tenancy_id, owner_id, id_type, original_seen (bool), status, checked_at?    (one per tenancy)
agreements    agreement_id, tenancy_id, owner_id, version, terms (snapshot object), status, signed_name?, signed_at?, created_at
```

**API** (owner-only, and the PG or tenancy must belong to the caller, else 404 "Listing not found" / "Tenant not found"):

| Endpoint | Behaviour |
|---|---|
| `GET /manage/{pg_id}/overview?month=YYYY-MM` | header cards: `occupied, total_beds, occupancy_pct, rent_roll, collected, due, overdue_count, open_complaints` |
| `GET /manage/{pg_id}/tenancies` | tenancies with this month's rent status, KYC status and agreement status |
| `POST /manage/{pg_id}/tenancies` | creates a tenancy and its rent rows (A6). Atomically adjusts availability when asked |
| `PATCH /manage/tenancies/{id}` | edit name, phone, room label, rent (affects future unpaid rows only) |
| `POST /manage/tenancies/{id}/end` | ends the tenancy |
| `GET /manage/{pg_id}/rent?month=` | rows with derived `status` |
| `POST /manage/rent/{rent_id}/paid` | `{paid_at?, mode}`, idempotent. Error "Already paid" |
| `POST /manage/rent/{rent_id}/undo` | clears payment |
| `POST /manage/rent/{rent_id}/waive` | `{note?}` |
| `GET /manage/{pg_id}/complaints?status=` | newest first |
| `POST /manage/{pg_id}/complaints` | creates |
| `PATCH /manage/complaints/{id}` | `{status?, owner_note?}`, sets `resolved_at` when resolved |
| `PUT /manage/tenancies/{id}/kyc` | `{id_type, original_seen, status}` |
| `GET /manage/tenancies/{id}/agreement` | current agreement (built on first read as Draft) |
| `POST /manage/tenancies/{id}/agreement/share` | Draft → Shared |
| `POST /manage/tenancies/{id}/agreement/sign` | `{signed_name}` must match the tenant name ignoring case and extra spaces, else 400 "Type the tenant's full name exactly" |

The mount point `/manage` keeps these separate from the existing `/owner/*` routes. Add React Query keys with the new prefix `["manage", pgId, ...]`, so no existing key is touched.

**Seed (sample data).** Attach demo data to the demo owner's **Sunshine Girls PG**, using `seed_key`s and the upsert rule: 9 tenancies (fictional first names plus a last initial, no phone) spread over single and double rooms with a mix of states: most rent paid for past months, this month a few paid, a few due, 2 overdue; KYC mostly verified, 2 pending; agreements mostly signed, 2 pending; 4 complaints (one safety, one resolved). Dates are relative to the seed date so statuses look natural. Sample tenancies set `adjust_availability: false`, so the original room availability numbers do not move.

**Test IDs:** `mg-pg-select`, `mg-tab-{tenants|rent|complaints|kyc}`, `mg-card-{occupancy|due|collected|complaints}`, `mg-add-tenant`, `mg-t-{name|phone|room|type|rent|deposit|movein|months|adjust}`, `mg-t-save`, `mg-tenant-{tenancy_id}`, `mg-vacant-{n}`, `mg-end-{tenancy_id}`, `mg-month`, `mg-rent-{rent_id}`, `mg-paid-{rent_id}`, `mg-undo-{rent_id}`, `mg-waive-{rent_id}`, `mg-remind-{rent_id}`, `mg-c-add`, `mg-c-{category|title|details|priority}`, `mg-c-save`, `mg-complaint-{id}`, `mg-c-status-{id}`, `mg-kyc-{tenancy_id}`, `mg-kyc-save-{tenancy_id}`, `mg-agr-preview-{tenancy_id}`, `mg-agr-share-{tenancy_id}`, `mg-agr-sign-{tenancy_id}`, `owner-nav-manage`.

**Acceptance tests**
- **F3-1.** Backend: `rent_status` for due `2026-11-01`: on 2026-10-29 "upcoming", on 11-01 and 11-06 "due", on 11-07 "overdue", with `paid_at` "paid". `schedule_dates(2026-12-12, 3)` = `2026-12-12, 2027-01-01, 2027-02-01`.
- **F3-2.** Owner adds a tenant (rent ₹9,500, move-in today, 11 months): 11 rent rows are created, the first due on the move-in date; occupancy goes up by one bed; with "Update available beds" ticked, the PG's `available` for that type drops by 1 (and never below 0).
- **F3-3.** Mark paid turns a Due row to Paid, the "Collected" card rises by that amount, and Undo reverses both. Paying twice is blocked with "Already paid".
- **F3-4.** Copy reminder puts the exact reminder text on the clipboard.
- **F3-5.** Owner B cannot read or change Owner A's tenants, rent, complaints or agreements (404). A tenant account gets "Only owners can do this".
- **F3-6.** Complaint flow: add (Open), set In progress, set Resolved (date appears).
- **F3-7.** KYC save stores only the ID type, the checkbox and the status. No endpoint accepts or returns an ID number. Sign with the wrong name is refused. A correct name sets Signed with a timestamp and the printable preview shows it.
- **F3-8.** The existing owner dashboard numbers and acceptance tests 10 and 15 behave exactly as before. "Active tenants" does not change when a PG manager tenancy is added.
- **F3-9.** Ending a tenancy restores availability (when it was adjusted) and keeps the history.

**Rollback.** Flag `PG_MANAGER=off` hides nav and route. Data stays.

---

### 6. Implementation order (one commit each)

Run the full check (lint, types, backend tests, frontend tests, build, the 17 acceptance tests) after every step. Do not start the next step if anything is red.

| Step | Commit | Contents |
|---|---|---|
| 0 | `chore: recon and baseline` | `docs/RECON.md`, branch. No code changes |
| 1 | `feat(data): optional fields, indexes, seed v2` | 4.1, 4.4 (PG fields, sample owners, sample PGs, backfill), `lib/features.ts`, copy of `lib/*` and tests from the Appendix |
| 2 | `feat(explore): advanced filters and sort (F6) with safety group (F2)` | Filters Sheet, Sort, URL state, reset handler update |
| 3 | `feat(safety): detail section and owner fields (F2)` | Safety section, Add listing "Safety details" |
| 4 | `feat(cost): true monthly cost (F4)` | Passport section, Add listing "Charges and terms", budget switch |
| 5 | `feat(map): area picker and map view (F7)` | Leaflet component, toggle, area chips, CSS, CSP if needed |
| 6 | `feat(compare): compare tray and page (F5)` | Provider, tray, page |
| 7 | `feat(roommates): quiz, matches, batch groups (F1)` | backend router, seed samples, page, nav, PG detail card |
| 8 | `feat(manage): owner PG manager (F3)` | backend routers, seed demo, page, nav |
| 9 | `chore: hardening and docs` | section 7.3 checks, README and `.env.example` updates, final report |

---

### 7. Regression and acceptance checklist

#### 7.1 The 17 existing acceptance tests (must stay green)

| # | Test | Note for this upgrade |
|---|---|---|
| 1 | Browse without login: Explore shows the demo PGs with Verified pill, price pill, rating, tags | **Changes**, see 7.2 |
| 2 | Filter: city Pune, "Girls" + "Food included" | **Changes**, see 7.2 |
| 3 | Search: "hsr", nonsense, "Clear filters / retry" restores the list | **Changes**, see 7.2 |
| 4 | Protected action sends logged-out users to login and back | Also true for `/roommates` and `/owner/manage` |
| 5 | Signup as owner lands on dashboard, duplicate email message | Unchanged |
| 6 | Role routing: tenant on `/owner/dashboard`, owner on `/saved` | Add: tenant on `/owner/manage` goes to Explore, owner on `/roommates` goes to the dashboard |
| 7 | Save: heart adds and removes from Saved | The Compare button must not break the heart |
| 8 | Booking request: Sunshine, double, `2026-12-01`, 6 months, status pending, ₹9,500/mo | Unchanged |
| 9 | Invalid date message | Unchanged |
| 10 | Owner decision: accept, "Active tenants" 1, "Pending inquiries" down | Unchanged. PG manager must not alter these |
| 11 | Payment gating, mock payment, "Rent paid", "Rent collected" ₹9,500, no double pay | Unchanged |
| 12 | Decline shows red pill, no Pay | Unchanged |
| 13 | Chat, polling every 4 s, 403 for other tenants | Unchanged |
| 14 | Review: stars, comment, rating and count update | Unchanged. Sample PGs have no reviews |
| 15 | Add listing with name, city, locality, double price only; "Total listings" +1; delete with confirm | Must still pass with the old minimal payload |
| 16 | Responsive at 360, 768, 1440 with no horizontal scroll | Re-run with the new controls, tray and map |
| 17 | Sign out clears session and cache | Roommate and manager data are cleared with the rest of the cache. The compare tray holds only public PG ids, so it may stay |

#### 7.2 Three intended changes caused by the sample data

The new sample PGs make "5 PGs" and "only one in Pune" untrue. Update the **expectation text and assertions** of tests 1 to 3 exactly like this, and nothing else:

- **Test 1:** "Explore shows at least the original five demo PGs (by name), each with Verified pill, price pill, tags; the rating chip shows on those with a rating above 0."
- **Test 2:** "With city Pune, Green Leaf Girls PG is shown and every card says Pune; the counter equals the number of cards. With 'Girls' and 'Food included' (city All), Sunshine Girls PG and Green Leaf Girls PG are shown and every card has the Girls tag and the Food tag."
- **Test 3:** "Searching 'hsr' shows Urban Nest Co-living, and every card is in HSR Layout. Nonsense text shows the empty state, and 'Clear filters / retry' restores the list."

Tell TJ in the final report that these three were reworded, and why.

#### 7.3 Final checks (Step 9)

- [ ] All 17 acceptance tests pass (with the three reworded).
- [ ] All new acceptance tests (F1-1 to F7-7) pass.
- [ ] Lint, type check, build, backend tests, frontend tests are green. No new console errors or warnings on Explore, PG detail, Compare, Roommates, Manage, Add listing.
- [ ] A **fresh database** works: start the server, seed runs once, 80+ PGs, 16 areas with 5+ each, original five unchanged.
- [ ] An **old database** works: restore a copy of the pre-upgrade data (PGs without the new fields), start the server, nothing crashes, old PGs render, seed v2 backfills only missing fields.
- [ ] **Old API clients work.** Call each existing endpoint with its old request and confirm the old fields are all still present with the same values and order.
- [ ] No existing `data-testid`, route, query key or copy string was changed. (Run a diff on the existing files and read it. The only edits are the ones in 2.4.)
- [ ] With every flag off, the site looks and behaves like the pre-upgrade site, and the 17 tests pass (tests 1 to 3 in their reworded form, because the sample PGs are still in the database).
- [ ] Accessibility: keyboard-only pass through the Sheet, tray, compare table, map toggle, quiz; focus visible; Esc closes the Sheet; contrast meets AA for new text.
- [ ] Mobile pass at 360 px for Explore with the Sheet, the map card, the compare table, the quiz and the manager tabs.
- [ ] Privacy review: no ID numbers stored, no other user's email, phone or id returned by the roommate endpoints, no phone shown unmasked.
- [ ] Banned phrase search over the whole diff: "100% safe", "completely safe", "no risk", "guaranteed", "best price", "fully verified". Zero hits. Also zero long dashes in on-screen text.
- [ ] `.env.example`, README and `docs/RECON.md` updated: flags, seed behaviour, map attribution, how to roll back each feature.

---

### 8. Optional later extensions (do **not** build now)

- Tenant-raised complaints from an accepted booking, and tenant-side agreement signing, once tenancies are linked to bookings.
- Room availability that drops when a booking is accepted (the old spec lists this as a known gap). It changes existing behaviour, so it needs TJ's explicit go-ahead.
- Server-side filtering and pagination for `GET /pgs` when the list grows past a few hundred PGs.
- A real verification workflow that sets `grade` from documents and a site visit.
- Group chat for batch groups, with reporting and moderation.
- Real map tiles from a hosted provider, and road-distance instead of straight-line distance.

### 9. Open questions Claude Code must raise with TJ (stop and ask)

1. If the repo is not FastAPI + MongoDB, or the frontend is not React: stop after RECON.md and ask, because the brief's API and component guidance would need a rewrite.
2. If the existing seed deletes and re-creates data in a way seed v2 cannot sit beside safely.
3. If any new feature would need an existing field renamed, an existing test deleted, or an existing endpoint's meaning changed.
4. If the baseline is not green.

If none of these apply, make the sensible call, record it in RECON.md under "Decisions", and continue.

---

## Appendix (reference code, tested)

These files were compiled with `tsc --strict` and run against the tests in A8 and A9. Copy them into the repo at the paths shown. Adjust only import paths and, if the repo's stored values differ (see Phase 0), the string constants. If you change a constant, change the matching test.

The rounding rule matters: **the roommate score rounds half up.** JavaScript's `Math.round` does this. Python's `round()` does not, so the Python version uses `floor(x + 0.5)`.

### A1. `lib/types.ts` (extend the existing PG type with these optional fields)

```ts
// lib/types.ts : ADD these types. Keep every existing field exactly as it is; all new fields are optional.
export type Gender = 'female' | 'male' | 'unisex';
export type Grade = 'verified' | 'verified_plus' | 'assured';
export type RoomKind = 'single' | 'double' | 'triple';

export interface RoomType { type: RoomKind; price: number; available: number; total: number }

export interface Charges {
  electricity?: { mode: 'metered' | 'included' | 'fixed'; rate_per_unit?: number; est_monthly: number };
  maintenance_monthly?: number;                       // 0 when none
  food?: { mode: 'included' | 'optional' | 'none'; optional_price?: number };
  deposit_months?: number;                            // refundable deposit, in months of rent
  deposit_refund_days?: number;
  notice_days?: number;
  lock_in_months?: number;                            // 0 = none
  exit_fee?: number;                                  // 0 = none
}

export interface Safety {
  cctv?: boolean;                // cameras on entrances and common areas
  night_guard?: boolean;         // night guard or live-in warden
  fire_exit_clear?: boolean;     // clear, unlocked fire exit seen on the last visit
  curfew_flexible?: boolean;     // curfew can be extended on request
  women_only_floor?: boolean;    // a separate floor for women (co-living only)
  curfew_time?: string | null;   // e.g. "11:00 PM"
}

export interface PGSummary {
  // existing fields (unchanged)
  pg_id: string; name: string; city: string; locality: string; gender: Gender;
  price_from: number; images: string[]; verified: boolean; rating: number; review_count: number; food_included: boolean;
  // new, optional (older documents and older app versions simply lack them)
  area?: string | null;          // clean area name, e.g. "Koramangala" (locality may read "Koramangala 5th Block")
  lat?: number | null; lng?: number | null;
  grade?: Grade | null;
  room_types?: RoomType[];
  amenities?: string[];
  charges?: Charges | null;
  safety?: Safety | null;
  short_stay_ok?: boolean;
  min_stay_months?: number | null;
  is_sample?: boolean;
  created_at?: string;
}
```

### A2. Roommate score

`lib/roommate.ts`:

```ts
// lib/roommate.ts
export const QUIZ = [
  { key: 'sleep', q: 'When do you usually sleep?', weight: 25, options: ['Early bird (asleep by 10:30 pm)', 'Flexible', 'Night owl (after 1 am)'] },
  { key: 'tidy', q: 'How tidy is your space?', weight: 25, options: ['Everything in its place', 'Tidy enough', 'Relaxed'] },
  { key: 'noise', q: 'How much noise suits you?', weight: 15, options: ['Silence, please', 'Soft music is fine', 'A lively room'] },
  { key: 'study', q: 'Where do you study?', weight: 15, options: ['Mostly at the PG', 'A mix', 'Mostly outside or in the library'] },
  { key: 'visitors', q: 'How often do friends visit?', weight: 10, options: ['Rarely', 'Sometimes', 'Often'] },
  { key: 'food', q: 'Food habits', weight: 10, options: ['Strict vegetarian', 'Vegetarian, flexible', 'Non-veg is fine'] },
] as const;

/** 100 - sum(weight * |a - b|) / 2, rounded half up. Answers are 0, 1 or 2. */
export function roommateScore(a: number[], b: number[]): number {
  let loss = 0;
  QUIZ.forEach((q, i) => { loss += (q.weight * Math.abs((a[i] ?? 0) - (b[i] ?? 0))) / 2; });
  return Math.round(100 - loss);
}
export type Band = 'Great match' | 'Good match' | 'Some differences' | 'Very different routines';
export const band = (s: number): Band => (s >= 80 ? 'Great match' : s >= 60 ? 'Good match' : s >= 40 ? 'Some differences' : 'Very different routines');
/** Up to three "why you match" chips: the questions where both answers are identical. */
export const whyMatch = (a: number[], b: number[]): string[] => QUIZ.filter((_, i) => a[i] === b[i]).slice(0, 3).map((q) => q.key);
```

`backend/roommate.py` (same numbers, same rounding):

```python
# backend/roommate.py : MUST give the same numbers as lib/roommate.ts
import math

QUIZ_WEIGHTS = [25, 25, 15, 15, 10, 10]  # sleep, tidy, noise, study, visitors, food


def roommate_score(a: list[int], b: list[int]) -> int:
    """100 - sum(weight * |a - b|) / 2, rounded HALF UP. Do not use round(): Python rounds halves to even."""
    loss = sum(w * abs(a[i] - b[i]) / 2 for i, w in enumerate(QUIZ_WEIGHTS))
    return int(math.floor(100 - loss + 0.5))


def valid_answers(x: object) -> bool:
    return isinstance(x, list) and len(x) == 6 and all(isinstance(v, int) and not isinstance(v, bool) and 0 <= v <= 2 for v in x)
```

### A3. True monthly cost: `lib/passport.ts`

```ts
// lib/passport.ts : the "True monthly cost" maths. Pure, no React.
import type { PGSummary, RoomKind } from './types';

export interface Passport {
  rent: number;
  electricity: number | null;      // null = owner has not said
  maintenance: number | null;
  trueMonthly: number;             // rent + electricity + maintenance (known parts only)
  extraOverRent: number;           // trueMonthly - rent
  complete: boolean;               // false when electricity or maintenance is missing
  food: { mode: 'included' | 'optional' | 'none' | 'unknown'; optionalPrice: number | null };
  trueMonthlyWithFood: number | null;  // only when food is optional and priced
  depositMonths: number | null; depositAmount: number | null; depositRefundDays: number | null;
  noticeDays: number | null; lockInMonths: number | null; exitFee: number | null;
  moveInCash: number | null;       // deposit + first month's rent (no platform fee on this site)
}

export function cheapestRoom(pg: PGSummary): { type: RoomKind; price: number } | null {
  const rooms = (pg.room_types ?? []).filter((r) => r.price > 0);
  if (!rooms.length) return pg.price_from ? { type: 'double', price: pg.price_from } : null;
  return rooms.reduce((a, b) => (b.price < a.price ? b : a));
}

export function computePassport(pg: PGSummary, room: RoomKind | null): Passport | null {
  const picked = (room && (pg.room_types ?? []).find((r) => r.type === room)) || cheapestRoom(pg);
  if (!picked) return null;
  const c = pg.charges ?? {};
  const rent = picked.price;
  const electricity = c.electricity ? c.electricity.est_monthly : null;
  const maintenance = c.maintenance_monthly ?? null;
  const trueMonthly = rent + (electricity ?? 0) + (maintenance ?? 0);
  const foodMode = c.food?.mode ?? (pg.food_included ? 'included' : 'unknown');
  const optionalPrice = c.food?.mode === 'optional' ? c.food.optional_price ?? null : null;
  const depositAmount = c.deposit_months != null ? c.deposit_months * rent : null;
  return {
    rent, electricity, maintenance, trueMonthly, extraOverRent: trueMonthly - rent,
    complete: electricity != null && maintenance != null,
    food: { mode: foodMode, optionalPrice },
    trueMonthlyWithFood: optionalPrice != null ? trueMonthly + optionalPrice : null,
    depositMonths: c.deposit_months ?? null, depositAmount, depositRefundDays: c.deposit_refund_days ?? null,
    noticeDays: c.notice_days ?? null, lockInMonths: c.lock_in_months ?? null, exitFee: c.exit_fee ?? null,
    moveInCash: depositAmount != null ? depositAmount + rent : null,
  };
}
```

### A4. Filters, sort, distance

`lib/geo.ts`:

```ts
// lib/geo.ts
export interface LatLng { lat: number; lng: number }
const R = 6371; // km
const rad = (d: number): number => (d * Math.PI) / 180;

/** Straight-line (great-circle) distance in km. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
export const roundKm = (km: number): number => Math.round(km * 10) / 10;
```

`lib/filters.ts` (one module used by the list, the map and the compare page):

```ts
// lib/filters.ts : ONE pure module used by the list, the map and the compare tray.
import type { Gender, Grade, PGSummary, RoomKind } from './types';
import { haversineKm, type LatLng } from './geo';
import { computePassport } from './passport';

export type SortKey = 'relevance' | 'newest' | 'price_asc' | 'price_desc' | 'rating' | 'distance' | 'beds';
export type SafetyKey = 'wov' | 'cctv' | 'guard' | 'fire' | 'curfew' | 'wfloor';
export type MinGrade = 'any' | 'verified' | 'verified_plus' | 'assured';

export interface FilterState {
  q: string; city: string | null; gender: Gender | null; food: boolean;            // the four ORIGINAL filters
  area: string | null;                                                              // locality
  min: number; max: number; budgetIncludesExtras: boolean;                          // budget slider
  share: RoomKind[]; ac: boolean; shortStay: boolean; minGrade: MinGrade; availableNow: boolean;
  safety: SafetyKey[];
  distKm: 1 | 2 | 5 | 10 | null; ref: LatLng | null;                                // reference point for distance
  sort: SortKey;
}
export const BUDGET_MIN = 3000, BUDGET_MAX = 30000, BUDGET_STEP = 500;
export const DEFAULT_FILTERS: FilterState = {
  q: '', city: null, gender: null, food: false, area: null, min: BUDGET_MIN, max: BUDGET_MAX, budgetIncludesExtras: false,
  share: [], ac: false, shortStay: false, minGrade: 'any', availableNow: false, safety: [], distKm: null, ref: null, sort: 'relevance',
};

const RANK: Record<Grade, number> = { verified: 1, verified_plus: 2, assured: 3 };
const MIN_RANK: Record<MinGrade, number> = { any: 0, verified: 1, verified_plus: 2, assured: 3 };
export const gradeOf = (pg: PGSummary): Grade | null => pg.grade ?? (pg.verified ? 'verified' : null);
export const bedsLeft = (pg: PGSummary): number => (pg.room_types ?? []).reduce((n, r) => n + Math.max(0, r.available), 0);
export const hasAc = (pg: PGSummary): boolean => (pg.amenities ?? []).some((a) => a.toLowerCase() === 'ac');
export const areaOf = (pg: PGSummary): string => (pg.area ?? pg.locality ?? '').trim();
export const coordsOf = (pg: PGSummary): LatLng | null => (pg.lat != null && pg.lng != null ? { lat: pg.lat, lng: pg.lng } : null);

/** The price the budget slider compares: the cheapest room among the chosen sharing types (or all rooms). */
export function budgetPrice(pg: PGSummary, f: FilterState): number {
  const rooms = (pg.room_types ?? []).filter((r) => !f.share.length || f.share.includes(r.type));
  const base = rooms.length ? Math.min(...rooms.map((r) => r.price)) : pg.price_from;
  if (!f.budgetIncludesExtras) return base;
  const room = rooms.length ? rooms.reduce((a, b) => (b.price < a.price ? b : a)).type : null;
  return computePassport(pg, room)?.trueMonthly ?? base;
}

export function activeFilterCount(f: FilterState): number {
  let n = 0;
  if (f.q.trim()) n++; if (f.city) n++; if (f.gender) n++; if (f.food) n++; if (f.area) n++;
  if (f.min !== BUDGET_MIN || f.max !== BUDGET_MAX) n++;
  if (f.share.length) n++; if (f.ac) n++; if (f.shortStay) n++; if (f.minGrade !== 'any') n++;
  if (f.availableNow) n++; if (f.safety.length) n++; if (f.distKm && f.ref) n++;
  return n;
}

export function matches(pg: PGSummary, f: FilterState): boolean {
  const q = f.q.trim().toLowerCase();
  if (q && !`${pg.name} ${pg.city} ${pg.locality}`.toLowerCase().includes(q)) return false;
  if (f.city && pg.city.toLowerCase() !== f.city.toLowerCase()) return false;
  if (f.area && areaOf(pg).toLowerCase() !== f.area.toLowerCase()) return false;
  if (f.gender && pg.gender !== f.gender) return false;
  if (f.food && !(pg.food_included || pg.charges?.food?.mode === 'included')) return false;
  const price = budgetPrice(pg, f);
  if (price < f.min || price > f.max) return false;
  if (f.share.length && !(pg.room_types ?? []).some((r) => f.share.includes(r.type) && (!f.availableNow || r.available > 0))) return false;
  if (f.ac && !hasAc(pg)) return false;
  if (f.shortStay && !pg.short_stay_ok) return false;
  if (MIN_RANK[f.minGrade] > 0) { const g = gradeOf(pg); if (!g || RANK[g] < MIN_RANK[f.minGrade]) return false; }
  if (f.availableNow && bedsLeft(pg) <= 0) return false;
  const s = pg.safety ?? {};
  for (const k of f.safety) {
    if (k === 'wov' && !(pg.gender === 'female' && pg.verified)) return false;
    if (k === 'cctv' && !s.cctv) return false;
    if (k === 'guard' && !s.night_guard) return false;
    if (k === 'fire' && !s.fire_exit_clear) return false;
    if (k === 'curfew' && !s.curfew_flexible) return false;
    if (k === 'wfloor' && !s.women_only_floor) return false;
  }
  if (f.distKm && f.ref) { const c = coordsOf(pg); if (!c || haversineKm(f.ref, c) > f.distKm) return false; }
  return true;
}

export function sortPgs(list: PGSummary[], f: FilterState): PGSummary[] {
  const out = [...list];
  const tie = (a: PGSummary, b: PGSummary): number => a.pg_id.localeCompare(b.pg_id);
  const created = (p: PGSummary): string => p.created_at ?? '';
  switch (f.sort) {
    case 'price_asc': return out.sort((a, b) => budgetPrice(a, f) - budgetPrice(b, f) || tie(a, b));
    case 'price_desc': return out.sort((a, b) => budgetPrice(b, f) - budgetPrice(a, f) || tie(a, b));
    case 'rating': return out.sort((a, b) => b.rating - a.rating || b.review_count - a.review_count || tie(a, b));
    case 'beds': return out.sort((a, b) => bedsLeft(b) - bedsLeft(a) || tie(a, b));
    case 'distance': {
      if (!f.ref) return out.sort((a, b) => created(b).localeCompare(created(a)) || tie(a, b));
      const d = (p: PGSummary): number => { const c = coordsOf(p); return c ? haversineKm(f.ref as LatLng, c) : Infinity; };
      return out.sort((a, b) => d(a) - d(b) || tie(a, b));
    }
    default: return out.sort((a, b) => created(b).localeCompare(created(a)) || tie(a, b)); // relevance = newest first, like today
  }
}

export const applyFilters = (all: PGSummary[], f: FilterState): PGSummary[] => sortPgs(all.filter((p) => matches(p, f)), f);
```

Sort keys: `relevance` (shown as "Newest"), `newest`, `price_asc`, `price_desc`, `rating`, `distance`, `beds`.

### A5. Areas: `lib/areas.ts` (used for seeding and for the "distance from" picker)

Coordinates are approximate area centres, not addresses. Keep the Python seed's copy in sync (same names, centres and `doubleBase`).

```ts
// lib/areas.ts : approximate area centres used for (a) seeding sample PGs and (b) the "distance from" picker.
import type { LatLng } from './geo';
export interface AreaInfo { city: 'Bengaluru' | 'Delhi' | 'Pune' | 'Hyderabad'; area: string; center: LatLng; doubleBase: number }
export const AREAS: AreaInfo[] = [
  { city: 'Bengaluru', area: 'Koramangala', center: { lat: 12.9352, lng: 77.6245 }, doubleBase: 9500 },
  { city: 'Bengaluru', area: 'HSR Layout', center: { lat: 12.9116, lng: 77.6474 }, doubleBase: 9000 },
  { city: 'Bengaluru', area: 'Indiranagar', center: { lat: 12.9784, lng: 77.6408 }, doubleBase: 10500 },
  { city: 'Bengaluru', area: 'Whitefield', center: { lat: 12.9698, lng: 77.75 }, doubleBase: 8000 },
  { city: 'Delhi', area: 'Mukherjee Nagar', center: { lat: 28.705, lng: 77.209 }, doubleBase: 7000 },
  { city: 'Delhi', area: 'Laxmi Nagar', center: { lat: 28.6304, lng: 77.2773 }, doubleBase: 6500 },
  { city: 'Delhi', area: 'Karol Bagh', center: { lat: 28.6519, lng: 77.1909 }, doubleBase: 8500 },
  { city: 'Delhi', area: 'Saket', center: { lat: 28.5245, lng: 77.2066 }, doubleBase: 10500 },
  { city: 'Pune', area: 'Kothrud', center: { lat: 18.5074, lng: 73.8077 }, doubleBase: 8200 },
  { city: 'Pune', area: 'Viman Nagar', center: { lat: 18.5679, lng: 73.9143 }, doubleBase: 9000 },
  { city: 'Pune', area: 'Hinjawadi', center: { lat: 18.5912, lng: 73.7389 }, doubleBase: 7500 },
  { city: 'Pune', area: 'Kharadi', center: { lat: 18.5515, lng: 73.9404 }, doubleBase: 8800 },
  { city: 'Hyderabad', area: 'Madhapur', center: { lat: 17.4486, lng: 78.3908 }, doubleBase: 10000 },
  { city: 'Hyderabad', area: 'Gachibowli', center: { lat: 17.4401, lng: 78.3489 }, doubleBase: 9500 },
  { city: 'Hyderabad', area: 'Kondapur', center: { lat: 17.46, lng: 78.366 }, doubleBase: 8500 },
  { city: 'Hyderabad', area: 'Ameerpet', center: { lat: 17.4375, lng: 78.4483 }, doubleBase: 6500 },
];
export const areasOf = (city: string | null): AreaInfo[] => AREAS.filter((a) => !city || a.city.toLowerCase() === city.toLowerCase());
```

### A6. Rent status and schedule

`lib/rent.ts`:

```ts
// lib/rent.ts : derive the status of a rent row. Dates are 'YYYY-MM-DD' in Asia/Kolkata. Never store the derived status.
export type RentStatus = 'upcoming' | 'due' | 'overdue' | 'paid' | 'waived';
export interface RentRow { due_date: string; paid_at?: string | null; waived?: boolean }
export const GRACE_DAYS = 5;

const day = (iso: string): number => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;

export function rentStatus(r: RentRow, today: string, grace: number = GRACE_DAYS): RentStatus {
  if (r.paid_at) return 'paid';
  if (r.waived) return 'waived';
  const late = day(today) - day(r.due_date);
  if (late < 0) return 'upcoming';
  return late <= grace ? 'due' : 'overdue';
}
/** One row per month of the stay, starting at the move-in month. The first row is due on the move-in date, later rows on the 1st. */
export function scheduleDates(moveIn: string, months: number): string[] {
  const y = +moveIn.slice(0, 4), m = +moveIn.slice(5, 7) - 1;
  return Array.from({ length: Math.max(1, months) }, (_, i) => {
    if (i === 0) return moveIn;
    const d = new Date(Date.UTC(y, m + i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
  });
}
```

`backend/rent.py`:

```python
# backend/rent.py : MUST give the same answers as lib/rent.ts. Status is derived on read and never stored.
from datetime import date, datetime
from zoneinfo import ZoneInfo

GRACE_DAYS = 5
IST = ZoneInfo("Asia/Kolkata")


def today_ist() -> date:
    return datetime.now(IST).date()


def rent_status(due: date, paid_at: str | None, waived: bool, today: date, grace: int = GRACE_DAYS) -> str:
    if paid_at:
        return "paid"
    if waived:
        return "waived"
    late = (today - due).days
    if late < 0:
        return "upcoming"
    return "due" if late <= grace else "overdue"


def schedule_dates(move_in: date, months: int) -> list[date]:
    """First row due on the move-in date; later rows due on the 1st of each following month."""
    out = [move_in]
    y, m = move_in.year, move_in.month
    for i in range(1, max(1, months)):
        mm = m - 1 + i
        out.append(date(y + mm // 12, mm % 12 + 1, 1))
    return out
```

The status is **never stored**. Compute it on read with today's date in `Asia/Kolkata`. Create one `rent_records` row per `schedule_dates` entry when a tenancy is added.

### A7. Map component sketch: `components/map/PgMap.tsx`

A sketch of the Leaflet wrapper described in F7. It was written against Leaflet 1.9 types but **not compiled in the sandbox where this brief was written** (no package access), so type-check and try it in the browser. It uses `divIcon` pins, so no marker image files are needed.

```tsx
'use client'; // Next.js only; delete this line in Vite
// components/map/PgMap.tsx : load it with dynamic(() => import('./PgMap'), { ssr: false }) (Next) or React.lazy (Vite).
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useRef } from 'react';
import type { PGSummary } from '@/lib/types';
import { bedsLeft, coordsOf } from '@/lib/filters';
import type { LatLng } from '@/lib/geo';

interface Props { pgs: PGSummary[]; center: LatLng; selectedId: string | null; onSelect: (id: string) => void; anchor?: LatLng | null }

const priceLabel = (n: number): string => (n >= 1000 ? `₹${(n / 1000).toFixed(n % 1000 ? 1 : 0)}k` : `₹${n}`);

export default function PgMap({ pgs, center, selectedId, onSelect, anchor }: Props): JSX.Element {
  const host = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

  useEffect(() => {                                   // create once
    if (!host.current || map.current) return;
    const m = L.map(host.current, { center: [center.lat, center.lng], zoom: 14, zoomControl: true, scrollWheelZoom: false });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => { m.remove(); map.current = null; layer.current = null; };
  }, []);                                             // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {                                   // redraw pins when data or selection changes
    const m = map.current, g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const pts: L.LatLngExpression[] = [];
    pgs.forEach((pg) => {
      const c = coordsOf(pg);
      if (!c || bedsLeft(pg) <= 0) return;            // only PGs with a bed free right now
      const sel = pg.pg_id === selectedId;
      const icon = L.divIcon({
        className: 'pg-pin-wrap',
        html: `<span class="pg-pin${sel ? ' pg-pin--sel' : ''}" data-testid="map-pin-${pg.pg_id}">${priceLabel(pg.price_from)}</span>`,
        iconSize: [64, 28], iconAnchor: [32, 14],
      });
      const mk = L.marker([c.lat, c.lng], { icon, keyboard: true, title: `${pg.name}, from ${priceLabel(pg.price_from)} a month`, zIndexOffset: sel ? 1000 : 0 });
      mk.on('click', () => onSelect(pg.pg_id));
      mk.addTo(g);
      pts.push([c.lat, c.lng]);
    });
    if (anchor) { L.circleMarker([anchor.lat, anchor.lng], { radius: 6, color: '#1A1C1E', weight: 2, fillColor: '#fff', fillOpacity: 1 }).addTo(g); pts.push([anchor.lat, anchor.lng]); }
    if (pts.length > 1) m.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 16 });
    else m.setView(pts[0] ?? [center.lat, center.lng], 15);
  }, [pgs, selectedId, anchor, center, onSelect]);

  return <div ref={host} className="pg-map" role="region" aria-label="Map of available PGs" data-testid="map-canvas" />;
}
```

Install: `npm i leaflet@1.9.4` and `npm i -D @types/leaflet`. Suggested CSS (adapt to the repo's token variables):

```css
.pg-map { height: 420px; border-radius: 20px; border: 1px solid #E5E7EB; overflow: hidden; }
@media (min-width: 1024px) { .pg-map { height: 560px; } }
.pg-pin-wrap { background: transparent; border: 0; }
.pg-pin { display: inline-block; padding: 5px 10px; border-radius: 999px; background: #fff; color: #D33F22;
  border: 1px solid #FF6B4A; font: 700 12px/1 'Plus Jakarta Sans', system-ui, sans-serif; white-space: nowrap; }
.pg-pin--sel { background: #FF6B4A; color: #fff; }
```

### A8. TypeScript reference tests (`lib/__tests__/reference.test.ts` or the repo's equivalent)

They use Node's `assert` so they run anywhere. Convert to the repo's test runner syntax (`it`/`expect`) if it has one, keeping every assertion and number.

```ts
import { roommateScore, band } from './src/roommate';
import { rentStatus, scheduleDates } from './src/rent';
import { haversineKm } from './src/geo';
import { computePassport } from './src/passport';
import { applyFilters, DEFAULT_FILTERS, activeFilterCount } from './src/filters';
import type { PGSummary } from './src/types';
declare const require: any; declare const console: any; const assert = require('assert');
const mine = [0, 1, 0, 1, 0, 1];
const profiles = [[0,0,1,1,1,1],[1,1,1,0,0,1],[2,2,2,2,2,2],[0,1,1,1,1,0],[2,1,2,2,1,2],[1,1,0,1,0,1]];
assert.deepStrictEqual(profiles.map((p) => roommateScore(mine, p)), [75, 73, 25, 83, 43, 88]);
assert.strictEqual(band(88), 'Great match'); assert.strictEqual(band(39), 'Very different routines');
assert.strictEqual(rentStatus({ due_date: '2026-11-01' }, '2026-10-29'), 'upcoming');
assert.strictEqual(rentStatus({ due_date: '2026-11-01' }, '2026-11-01'), 'due');
assert.strictEqual(rentStatus({ due_date: '2026-11-01' }, '2026-11-06'), 'due');
assert.strictEqual(rentStatus({ due_date: '2026-11-01' }, '2026-11-07'), 'overdue');
assert.strictEqual(rentStatus({ due_date: '2026-11-01', paid_at: '2026-11-03' }, '2026-12-30'), 'paid');
assert.deepStrictEqual(scheduleDates('2026-12-12', 3), ['2026-12-12', '2027-01-01', '2027-02-01']);
assert.deepStrictEqual(scheduleDates('2026-11-20', 3).slice(1), ['2026-12-01', '2027-01-01']);
// Koramangala -> HSR approx 3.5 km
const d = haversineKm({ lat: 12.9352, lng: 77.6245 }, { lat: 12.9116, lng: 77.6474 }); assert.ok(d > 3 && d < 4.5, String(d));
const base: PGSummary = { pg_id: 'pg_a', name: 'Sunshine Girls PG', city: 'Bengaluru', locality: 'Koramangala', gender: 'female', price_from: 9500, images: [], verified: true, rating: 4.6, review_count: 1, food_included: true,
  room_types: [{ type: 'single', price: 13500, available: 3, total: 8 }, { type: 'double', price: 9500, available: 3, total: 8 }], amenities: ['WiFi', 'AC', 'CCTV'],
  charges: { electricity: { mode: 'metered', est_monthly: 900 }, maintenance_monthly: 500, food: { mode: 'included' }, deposit_months: 2, notice_days: 30, lock_in_months: 0, exit_fee: 1000 },
  safety: { cctv: true, night_guard: true }, lat: 12.93, lng: 77.62, grade: 'verified_plus' };
const p = computePassport(base, 'double')!;
assert.deepStrictEqual([p.rent, p.trueMonthly, p.extraOverRent, p.depositAmount, p.moveInCash, p.complete], [9500, 10900, 1400, 19000, 28500, true]);
const other: PGSummary = { ...base, pg_id: 'pg_b', name: 'Other', gender: 'male', verified: true, grade: 'verified', amenities: ['WiFi'], safety: {}, room_types: [{ type: 'triple', price: 6000, available: 0, total: 8 }], price_from: 6000, charges: null, lat: 12.99, lng: 77.75 };
const all = [base, other];
const f = (x: Partial<typeof DEFAULT_FILTERS>) => ({ ...DEFAULT_FILTERS, ...x });
assert.deepStrictEqual(applyFilters(all, f({ safety: ['wov', 'cctv'] })).map((x) => x.pg_id), ['pg_a']);
assert.deepStrictEqual(applyFilters(all, f({ ac: true })).map((x) => x.pg_id), ['pg_a']);
assert.deepStrictEqual(applyFilters(all, f({ availableNow: true })).map((x) => x.pg_id), ['pg_a']);
assert.deepStrictEqual(applyFilters(all, f({ minGrade: 'verified_plus' })).map((x) => x.pg_id), ['pg_a']);
assert.deepStrictEqual(applyFilters(all, f({ share: ['triple'] })).map((x) => x.pg_id), ['pg_b']);
assert.deepStrictEqual(applyFilters(all, f({ max: 7000 })).map((x) => x.pg_id), ['pg_b']);
assert.deepStrictEqual(applyFilters(all, f({ sort: 'price_asc' })).map((x) => x.pg_id), ['pg_b', 'pg_a']);
assert.deepStrictEqual(applyFilters(all, f({ distKm: 2, ref: { lat: 12.9352, lng: 77.6245 } })).map((x) => x.pg_id), ['pg_a']);
assert.strictEqual(activeFilterCount(f({ ac: true, safety: ['cctv', 'wov'], max: 20000 })), 3);
assert.strictEqual(computePassport(other, null)!.complete, false);
assert.deepStrictEqual(applyFilters([{ ...base, locality: 'Koramangala 5th Block', area: 'Koramangala' }, { ...other, locality: 'HSR Layout' }], f({ area: 'Koramangala' })).map((x) => x.pg_id), ['pg_a']);
assert.deepStrictEqual(applyFilters([{ ...base, locality: 'Koramangala 5th Block' }], f({ area: 'Koramangala' })).map((x) => x.pg_id), []);

assert.strictEqual(roommateScore([0,0,0,0,0,0], [0,0,1,0,0,0]), 93);
assert.strictEqual(roommateScore([0,0,0,0,0,0], [1,0,0,0,0,0]), 88);
console.log('all reference tests passed');
```

### A9. Python reference tests (`backend/tests/test_roommate.py` and `test_rent.py`)

```python
from roommate import roommate_score, valid_answers
mine = [0, 1, 0, 1, 0, 1]
profiles = [[0,0,1,1,1,1],[1,1,1,0,0,1],[2,2,2,2,2,2],[0,1,1,1,1,0],[2,1,2,2,1,2],[1,1,0,1,0,1]]
assert [roommate_score(mine, p) for p in profiles] == [75, 73, 25, 83, 43, 88]
assert roommate_score([0]*6, [0]*6) == 100 and roommate_score([0]*6, [2]*6) == 0
# a half case: loss = 25*1/2 = 12.5 -> 87.5 -> 88 (banker's rounding would give 88 too; check .5 going up from odd):
assert roommate_score([0,0,0,0,0,0], [1,0,0,0,0,0]) == 88   # 87.5 -> 88
assert roommate_score([0,0,0,0,0,0], [0,0,1,0,0,0]) == 93   # 92.5 -> 93 (round() would give 92)
assert valid_answers([0,1,2,0,1,2]) and not valid_answers([0,1,2]) and not valid_answers([0,1,2,0,1,3]) and not valid_answers([True]*6)
print("python ok")
```

```python
from datetime import date
from rent import rent_status, schedule_dates
d = date
assert rent_status(d(2026,11,1), None, False, d(2026,10,29)) == "upcoming"
assert rent_status(d(2026,11,1), None, False, d(2026,11,1)) == "due"
assert rent_status(d(2026,11,1), None, False, d(2026,11,6)) == "due"
assert rent_status(d(2026,11,1), None, False, d(2026,11,7)) == "overdue"
assert rent_status(d(2026,11,1), "2026-11-03", False, d(2026,12,30)) == "paid"
assert rent_status(d(2026,11,1), None, True, d(2026,12,30)) == "waived"
assert schedule_dates(d(2026,12,12), 3) == [d(2026,12,12), d(2027,1,1), d(2027,2,1)]
assert schedule_dates(d(2026,11,20), 3)[1:] == [d(2026,12,1), d(2027,1,1)]
assert len(schedule_dates(d(2026,1,5), 14)) == 14 and schedule_dates(d(2026,1,5), 14)[-1] == d(2027,2,1)
print("rent ok")
```

### A10. Exact copy for new screens

| Where | Text |
|---|---|
| Filters button | "Filters" and "Filters · {n}" |
| Filters Sheet | "Filters", "Budget (per month)", "Include electricity and maintenance", "Sharing", "AC available", "Short stay OK (under 3 months)", "Verified level", "Beds free now", "Distance", "Safety", "Show {n} PGs", "Reset all" |
| Safety help | "Safety details are declared by the owner. Visit the PG in person before you pay." |
| Sort | "Newest", "Price: low to high", "Price: high to low", "Rating", "Nearest", "Most beds free" |
| Verified level note | "Levels are set by the PGConnect team in this demo." |
| Map empty (no city) | "Pick a city and an area to see PGs with a bed free." |
| Map empty (none) | "No PGs with a free bed here right now" / "Try another area or relax a filter." / "Show list" |
| Map count | "{n} PGs with a bed free in {area}" ("1 PG" when n is 1) |
| Map tiles failed | "Map tiles could not load. The list below has the same PGs." |
| Demo data note (Explore footer) | "PGs in the new areas are sample listings. Names, prices and photos are demo data." |
| Passport | "True monthly cost", "What you pay each month, beyond the rent on the card.", "Total per month", "Cash needed to move in", "Deposit plus first month's rent", "Not stated by owner", "Estimates from the owner. Electricity depends on how much you use.", "Some details were not stated by the owner. Ask them before you book." |
| Compare | "Compare ({n}/3)", "Compare now", "Clear", "+ Compare", "✓ Added", "You can compare up to 3 PGs. Remove one to add another.", "Add one more PG to compare.", "This PG is no longer available", "Lowest" |
| Roommates | "Find a roommate", "Answer 6 quick questions. See how your routines match.", "Show me to others", "See my matches", "Your matches in {city}", "Great match", "Good match", "Some differences", "Very different routines", "Sample profile", "Answer all 6 questions", "Answer the quiz first", "Turn on 'Show me to others' to join a group.", "Group is full", "Retake the quiz", "Switch off matching", "Delete my roommate profile" |
| Roommates privacy | "Only your first name, initial and quiz answers are shown to others. Your phone, email and exact location are never shared. You can turn this off or delete your profile at any time." |
| PG manager | "PG manager", "Tenants", "Rent", "Complaints", "KYC & agreements", "Occupancy", "Rent due this month", "Collected this month", "Open complaints", "Vacant bed", "Add tenant", "Mark paid", "Copy reminder", "Open", "In progress", "Resolved" |
| PG manager notes | "These figures come from your PG manager records. The dashboard's 'Rent collected' counts in-app mock payments." / "PGConnect stores only the type of ID you saw and the date. Do not enter ID numbers here." / "This is a simple record of the terms you both agreed. It is not a stamped or registered agreement and is not legal advice. Check your state's rules on stamp duty and registration." |
| PG manager errors | "This PG has no {type} rooms listed.", "Already paid", "Type the tenant's full name exactly" |
| Empty states | Tenants: "No tenants added yet" / "Add your first tenant to start tracking rent." · Complaints: "No complaints" / "Problems you log will show up here." · Matches: "No matches yet" / "More people will appear as they join your city." · Compare tray: none |
