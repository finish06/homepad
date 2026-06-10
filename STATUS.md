# homepad (web) — STATUS

_Newest on top. `NEEDS JOE:` marks a blocker or decision for Joe._

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
