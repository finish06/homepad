# homepad (web) — STATUS

_Newest on top. `NEEDS JOE:` marks a blocker or decision for Joe._

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
