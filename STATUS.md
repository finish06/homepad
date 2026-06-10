# homepad (web) — STATUS

_Newest on top. `NEEDS JOE:` marks a blocker or decision for Joe._

## 2026-06-10 — v3–v6 specs: theme mode, categories, collapsible sections, admin settings (SPEC ONLY)

Wrote **four** ADD-methodology spec docs (same style as `v1-launcher.md` /
`v2-app-icons.md`). **No app code, tests, or implementation** this run —
spec docs only. Branched off latest `main`.

**New docs**
- **`specs/v3-theme-mode.md`** — user-facing **System / Light / Dark** theme
  setting (default System). Persists **per-user in Postgres** (`users.theme_pref`,
  migration `0003`) — recommended over localStorage to match favorites/layout;
  localStorage used only as a first-paint anti-flash cache. New `PATCH /api/me`
  (session-gated) + `themePref` on the `userView`. Defines the **"active theme"**
  that v2's light/dark **icon variant** selection depends on (v2 A7/A8 become
  testable end-to-end). Live OS-following under System. ACs A1–A12.
- **`specs/v4-app-categories.md`** — first-class **category** model
  (`categories` table + nullable `services.category_id`, FK `ON DELETE SET NULL`,
  migration `0004`). Admin-gated CRUD/reorder/assign; catalog renders
  **grouped-by-category** with Favorites first + Uncategorized last; flat-v1
  render when no categories exist. ACs A1–A12. **NEEDS JOE (real product
  call):** seed categories from the existing Gatus groups (kube/media/external)
  vs. start fresh — Stitch recommends **start fresh** in the model; the 39-app
  seed lives in **Joe's deploy**, so any group→category seed is a separate
  one-time data step Joe owns, not a homepad-api migration.
- **`specs/v5-collapsible-categories.md`** — per-category **collapse/expand**,
  persisted **per-user** (`user_collapsed_categories`, migration `0005`,
  must run after `0004`). Default **expanded**; stores the *collapsed* set so new
  categories auto-expand. `GET/PUT /api/me/collapsed-categories` (session-gated).
  Accessible disclosure; FK cascade kills orphan state on category delete. ACs
  A1–A12.
- **`specs/v6-admin-settings.md`** — consolidates existing admin app-management
  (v1 already ships admin-gated `POST/PATCH/DELETE /api/services`; v2 folds
  controls into edit mode) into a dedicated **admin Settings page**. Names the
  real gaps (settings page, clean URL-update UX, optional bulk ops) rather than
  re-specifying existing endpoints. States the **server-side admin
  authorization invariant** explicitly and makes it a `requireAdmin` middleware
  refactor + a **cross-cutting** 401/403 test over every mutating route. ACs
  A1–A11 (+ conditional A12/A13).

**NEEDS JOE (open product calls across the four)**
- v3: control placement (header user-menu vs user-settings page); `PATCH /api/me`
  vs `PUT /api/preferences`.
- v4: **seed from Gatus groups vs start fresh** (real call); per-category
  icon/color; favorites-in-both-sections; one-category vs tags.
- v5: dedicated collapse endpoint vs fold into `/api/me`; are Favorites/
  Uncategorized collapsible too (lean: not for v5).
- v6: keep both edit-mode + Settings (lean: yes); include admin role-assignment?
  include bulk ops?

**Build/test state:** unchanged — no source touched. Specs reference
`homepad-api` for all backend work (migrations `0003`–`0005`, new handlers, the
`requireAdmin` refactor).

## 2026-06-10 — v2 spec: custom app icons via edit mode (SPEC ONLY)

Wrote **`specs/v2-app-icons.md`** — an ADD-methodology spec (same style as
`specs/v1-launcher.md`) for the next feature. **No app code, tests, or
implementation** this run; spec doc only.

**What the feature is:** an admin-gated **edit mode** where, per service tile,
the admin uploads **two PNGs** — a light-mode and a dark-mode icon — stored
server-side; the catalog renders the variant matching the active theme. It
augments (doesn't remove) the existing `services.icon` text field, which stays
as a fallback.

**Decisions captured in the spec**
- **Edit mode:** admin-only toggle in the catalog header (client-ephemeral),
  with every mutating endpoint independently 403-gated server-side (same
  pattern as v1 catalog CRUD). Recommends folding v1's add/edit/delete-service
  controls into the same toggle (Q1, NEEDS JOE).
- **Icon model:** light + dark PNG per service; **PNG-only** via magic-byte
  sniff, ≤ 512×512, ≤ 256 KB, square recommended-not-required. Deterministic
  precedence: variant-T upload → other-variant upload → legacy `icon` text →
  **bundled local default**. The local default + an `<img> onError` handler
  **fixes today's broken-image fallback** (the remote `cog.svg`).
- **Storage:** laid out bytea vs PVC vs object-store; **recommends Postgres
  `bytea`** — kilobyte-scale data (< 20 MB worst case), rides existing
  backups, keeps the backend **stateless** (preserves v1's "no persistent
  storage" deploy contract). New additive table `service_icons` (migration
  `0002`).
- **Serving:** `GET /api/services/{id}/icon/{light|dark}` → `image/png` +
  ETag/304, session-gated; `GET /api/services` gains `iconLight`/`iconDark`
  booleans (never the blob bytes).
- **API:** `PUT`/`DELETE` icon endpoints, admin-only; **raw PNG body** on PUT
  (not multipart/base64) so upload == replace == idempotent upsert. Create/edit
  service unchanged; delete cascades to icons.
- **Frontend:** per-tile light+dark upload slots in edit mode (client pre-check
  + preview + remove); theme-aware rendering that re-points `src` on
  light↔dark switch with no reload.
- **Acceptance criteria:** A1–A14, testable (API integration + component).
- **Back-compat:** additive-only; the 39 seeded apps render unchanged; the only
  visible delta with no uploads is the improved local fallback.

**NEEDS JOE (open product calls):** Q1 fold-in vs separate Settings surface ·
Q2 validation caps · Q3 reject vs auto-downscale oversized · Q4 PNG-only vs
also SVG/WebP. (References `homepad-api` for all backend work — migration `0002`,
`service_icons` store, 4 handlers, list-endpoint flags.)

**Build/test state:** unchanged — no source touched.

## 2026-06-10 — README glow-up: banner, diagrams, badges, screenshot slots

Docs-only run (no app code touched). Made the README something you can actually
show off and that matches what's built.

**Done this run (`Code/homepad`, README + new assets only)**
- **`docs/banner.svg`** — clean hand-authored SVG logo/banner (2×2 launcher mark
  + live status dot, wordmark, tagline, UP/DEGRADED/DOWN/UNKNOWN legend),
  embedded at the very top of the README.
- **Shields.io badges** — Go 1.25, React+Vite, Tailwind, tests
  (70 passing · 26 Go + 44 Vitest), license.
- **Mermaid ARCHITECTURE diagram** — browser → web (nginx/SPA) → `/api` →
  homepad-api (Go) → Postgres; poller → Gatus (server-side only); PocketID OIDC.
  Renders as an image in Gitea markdown.
- **Mermaid AUTH-FLOW sequence** — both paths: local email/password, and the
  PocketID OIDC Authorization-Code + PKCE round trip (login → PocketID →
  callback → `homepad_session` cookie).
- **`## Screenshots`** — embeds `docs/screenshots/{login,catalog,mobile}.png`.
  Committed tiny wireframe placeholders (pure-stdlib PNG, 3–5 KB each) so the
  layout renders now. **NEEDS JOE:** swap these for real captures from the live
  deploy (same paths/filenames — no README edit needed).
- **Prose corrected to reality** — dropped the stale "scaffold / RED only" status;
  now documents local + PocketID login, shared catalog with live Gatus badges,
  per-user favorites, personal reorder (up/down, persisted), admin catalog CRUD,
  A1–A11.
- Also tidied the **`Code/homepad-api`** README the same way (badges, accurate
  alpha-complete status, endpoint list, layout incl. `internal/oidc`).

**Build/test state:** unchanged — no source touched. `vitest run` still 44/44.

## 2026-06-10 — PocketID web button shipped (test-first, additive)

The web half of the OIDC slice scoped below. Local email/password login is
untouched; the PocketID button sits beneath it, gated on the API config.

**Done this run**
- **api.ts — `authConfig()`.** `GET /api/auth/config` → `{oidcEnabled:bool}`.
  A non-200 or a thrown `fetch` both map to `{oidcEnabled:false}` so the button
  fails *closed* (hidden). 4 new mocked-`fetch` tests; URL assertion stays under
  `/api` (A11 unit half).
- **App.tsx — PocketID button.** `AuthForm` fetches `authConfig()` on mount and
  renders "Log in with PocketID" only when `oidcEnabled`. Activating it is a full
  navigation — `window.location.assign('/api/auth/oidc/login')`, **not** `fetch`
  — so the 302 to PocketID happens in the browser. After the callback the API
  sets `homepad_session` and 302s to `/`; the existing `me()` gate lands the user
  on the catalog, no extra web code.
- **3 new App tests:** button visible when `oidcEnabled:true` (local Sign in
  still present), hidden when `false`, and that activating it navigates to
  `/api/auth/oidc/login`.
- **A11 web half still PASS.** `npm run build` clean; `grep -ri gatus dist/`
  empty.

**Build/test state:** `npm run build` clean (tsc + vite) · `vitest run` 44/44
green · bundle 151 kB (49 kB gzip).

## 2026-06-10 — PocketID / OIDC: backend ready, web button is the next slice

New requirement: a "Log in with PocketID" option on the login screen, **additive**
to local login. This run I built the **backend** end of it in `homepad-api`
(OIDC login + callback + account-link, tests green on the test DB — see that
repo's STATUS). No web code changed yet; capturing the contract so the next web
run is a quick, test-first slice:

- **Gate the button:** `GET /api/auth/config` → `{"oidcEnabled":bool}`. Show
  "Log in with PocketID" only when `true`. (Endpoint already live.)
- **Start login:** the button navigates the browser to `/api/auth/oidc/login`
  (a full navigation, not `fetch` — it 302s to PocketID).
- **After callback:** homepad-api sets the same `homepad_session` cookie and
  302s to `/`, so the app lands logged-in on the catalog with no extra web work
  beyond the existing session handling.
- **Component tests to add:** button visible when `oidcEnabled:true`, hidden when
  `false`, and that it points at `/api/auth/oidc/login` — against a mocked api,
  same harness as the existing api.ts/Catalog tests.

No `NEEDS JOE` on the web side. (Backend has one: the real `OIDC_ADMIN_GROUP`
name — env-driven, set at deploy.)

## 2026-06-09 — A5 layout reorder wired in the web app (test-first)

The last foundational web slice. Personal tile order is now reorderable and
persists; mirrors the favorites optimistic+rollback pattern.

**Done this run**
- **api.ts — `setLayout(order)`.** `PUT /api/layout` with `{"order":[ids]}` →
  true on 204, false otherwise (incl. 404 unknown id). 2 new mocked-`fetch`
  tests; URL assertion stays under `/api` (A11 unit half).
- **Catalog.tsx — reorder UI.** Per-tile ↑/↓ buttons (`move-up`/`move-down`),
  disabled at the boundaries. `moveItem` swaps the tile one slot, sets state
  optimistically, persists the full id order via `setLayout`, and rolls back to
  the pre-move snapshot if the API rejects — snapshot captured up front so the
  rollback can't race a later render (same fix shape as the favorites bug).
- **Load order.** No client-side sort — tiles render in the exact order
  `services()` returns, so the order-aware `GET /api/services` drives it.
- **5 new Catalog tests:** load-order, move-down+persist, move-up+persist,
  rollback-on-reject, boundary-disable.
- **A11 (web half) still PASS.** `npm run build` clean; `grep -ri gatus dist/`
  empty.

**Build/test state:** `npm run build` clean (tsc + vite) · `vitest run` 37/37
green · bundle 150 kB (48 kB gzip).

## 2026-06-09 — Component-test harness + A2/A3 verified against a mocked API

Pivoted from the (alpha-complete) API to the web app. The browser talks only
to the same-domain `/api` proxy — never to Gatus.

**Done this run**
- Added a Vitest + React Testing Library + jsdom harness (no running API
  needed). `npm test` → `vitest run`; e2e (`tests/e2e`, Playwright) stays
  separate and is Joe's job to run live.
  - `src/test/setup.ts` (jest-dom matchers + auto-cleanup), `test` block in
    `vite.config.ts`, tsconfig `types` extended so `npm run build` stays clean.
- **api.ts (client) — 14 tests, mocked `fetch`.** me / login / register /
  logout / services / setFavorite: response mapping + that every call stays
  under `/api/*`. The URL assertions are the unit-level half of A11.
- **A2 — catalog tiles (Catalog.tsx) — mocked `./api`.** name, description,
  link-out URL (`rel=noopener`), icon URL incl. `cog` fallback, empty-state.
- **A3 — status badges.** UP→emerald / DOWN→red / DEGRADED→amber /
  UNKNOWN→neutral, driven by the API `status` field; `data-status` + aria-label.
- **Auth gate (App.tsx) — 7 tests, mocked `./api`.** unauth→login form;
  existing session→catalog; login success/failure; register→login;
  register-fail short-circuits; logout→back to login.
- **Favorites toggle** optimistic flip + rollback-on-reject, both tested.
- **Bug caught + fixed (Catalog.tsx `toggleFavorite`):** it read the toggled
  value out of the `setItems` updater closure, which runs on a *later* render —
  so the persist call `setFavorite(id, next)` raced and sent the *stale*
  pre-toggle value to the API while the UI showed the new one. Now `next` is
  derived from current state up front. (Latent since the favorites commit; no
  test had covered the persisted value.)
- **A11 (web half): PASS.** `npm run build` clean; `grep -ri gatus dist/`
  returns nothing — no Gatus URL (or even the substring) in the bundle.

**Build/test state:** `npm run build` clean · `vitest run` 30/30 green ·
bundle 149 kB (48 kB gzip).

**Remaining web checklist for alpha**
- [x] Layout reorder → `PUT /api/layout` with the new order (up/down buttons,
      optimistic + rollback). Wired in `api.ts` + `Catalog.tsx`, component-tested.
- [ ] A7 responsive — 390 / 1440, no horizontal scroll (Playwright e2e exists;
      needs a live run — Joe).
- [ ] A8 perf budgets — Lighthouse CI wired (`lighthouserc.cjs`); needs a CI/live
      run (Joe).
- [ ] Full e2e (catalog / status-badge / responsive / no-gatus-leak) against the
      deployed API+web — Joe runs the browser end-to-end verify.
- [x] A2 / A3 component-verified (mocked API).
- [x] Auth login/register/logout + session gate (component-verified).
- [x] Favorites toggle (component-verified, bug fixed).
- [x] A11 web half — no Gatus URL in `dist`.

_No blockers._

## Merge record — 2026-06-10

- PR #1 `feat/catalog-vertical-slice` → `main` **merged** via real merge commit `4ea0c71` (parents `59523bc18d` + `b1950a40d0`). CI (Web build/unit tests, pull_request) concluded **success** after Joe's ci.yml conflict fix; mergeable was true. Source branch deleted. — Stitch
