# homepad v1 + v2 — Coverage & AC Review

**Reviewer:** Stitch · **Date:** 2026-06-10
**Repos:** `Code/homepad` (web) + `Code/homepad-api` (Go backend)
**Specs reviewed:** `specs/v1-launcher.md` (A1–A11), `specs/test-plan-v1.md`,
`specs/v2-app-icons.md` (A1–A14)
**Method:** read every handler/component, mapped each AC to `file:func` +
test, then **actually ran** `go test ./... -cover` (against the live test
Postgres) and `vitest run --coverage` (v8). Numbers below are measured, not
estimated.

---

## VERDICT — not 100%, but close on the parts that are merged

**The features are implemented and well-tested in code, but the answer to
"is it 100% covered?" is _no_, for four honest reasons — one of which is a
merge-state surprise:**

- 🔴 **HIGH — `homepad-api` v2 (icons) is NOT merged to `main`.** `origin/main`
  on the backend is `fcef7fa` — **v1 only**. The entire v2 backend slice
  (migration `0002`, `service_icons` store, the four icon handlers, the
  `iconLight/iconDark` flags, **and the OIDC work**) lives unmerged on branch
  `feat/app-icons` (`382c892`). So "v2 is merged to main" is true for the web
  app but **false for the API**. Every v2 backend AC below passes _on the
  branch_; none of it is on `main` yet. This needs a PR merge before v2 is
  real in prod.
- 🟠 **MEDIUM — v1 A6 is only half-built on the web.** The backend has full
  admin CRUD (create/edit/delete, all tested). The **web UI only implements
  _delete_** (in edit mode). There is **no create-service and no
  edit-fields UI** — `api.ts` exposes `deleteService` but no `createService`
  / `updateService`. An admin currently cannot add or edit a catalog entry
  from the browser. A6 says "via the UI"; that half is missing.
- 🟡 **LOW–MED — A7 (responsive) and A8 (perf/Lighthouse) were not executed
  in this pass.** They are verified only by Playwright + Lighthouse CI, which
  need a browser + built app. The specs/specs files exist and are wired into
  CI, but they are **not** part of the 75 vitest tests and I did not run them
  here, so I can't _attest_ to them from this review.
- 🟡 **LOW — backend line coverage is 66.7%, not 100%.** The untested
  remainder is mostly the **OIDC** error/callback branches and config parsing
  (`ConfigFromEnv`, `Userinfo`, `truthy` = 0%), plus `cmd/main.go` wiring.
  OIDC is **not a v1 or v2 acceptance criterion** (v1 defers it; v2 is
  icons-only), so this doesn't sink any AC — but it's real untested code and I
  won't paper over it.

Everything that _is_ claimed by a v1/v2 AC and _is_ merged-or-on-branch has a
passing test, with two small gaps I closed during this review (see §4).

**Measured coverage, today:**

| Suite | Tests | Coverage |
|---|---|---|
| Backend `go test ./...` (`-coverpkg=./...`) | **36 pass** | **66.7% total stmts** |
| Web `vitest run --coverage` (v8) | **75 pass** | **98.3% stmts / 89.6% branch / 95.8% funcs / 98.3% lines** |

---

## 1. AC-by-AC matrix

### v1 — `specs/v1-launcher.md` / `specs/test-plan-v1.md` (A1–A11)

Backend is **merged to `main`** (`origin/main` = `fcef7fa`). Web is merged
(`origin/main` = `68f2d56`).

| AC | Implemented? (`file:func`) | Tested? (test name) | Gap / notes |
|---|---|---|---|
| **A1** auth register/login/logout | API `internal/api/auth.go:handleRegister/handleLogin/handleLogout/handleMe`; web `src/App.tsx` + `src/api.ts:{login,register,logout,me}` | API `auth_test.go`: `TestRegisterCreatesUser`, `TestLoginSetsSessionCookie`, `TestMeUnauthorized`, `TestMeAuthorized`, `TestLogoutClearsSession`; web `App.test.tsx` "auth gate" (7), `api.test.ts` me/login/register/logout | ✅ **Closed in this review:** `TestLogoutClearsSession` now does the full AC round-trip (login → `/me` 200 → logout → `/me` 401), exercising `session.Destroy` (was 0%, now 100%). |
| **A2** catalog renders name/icon/desc/url | API `services.go:handleListServices`; web `src/Catalog.tsx` | web `Catalog.test.tsx` "A2 — catalog tiles render" (3); Playwright `catalog.spec.ts` (**not run here**) | ✅ Strong component coverage. E2E spec exists but needs a browser. |
| **A3** status badge colors UP/DOWN/DEGRADED/UNKNOWN | API `services.go:statusFor`; web `Catalog.tsx` badge | web `Catalog.test.tsx` "A3 — status badge color per state" (`it.each` ×4); Playwright `status-badge.spec.ts` (**not run here**) | ✅ |
| **A4** staleness < 60s; `as_of` timestamp | API `internal/gatus/poller.go` | `poller_test.go`: `TestPollerTickerRunsUnder30s`, `TestSnapshotIncludesAsOfTimestamp` | ✅ |
| **A5** favorites + manual order persist | API `favorites.go:handleAddFavorite/handleRemoveFavorite/handleUpdateLayout` + `storage.go`; web `Catalog.tsx` reorder/star | API `favorites_test.go`: `TestMarkFavoritePersistsAcrossSessions`, `TestRemoveFavoritePersistsAcrossSessions` (**added**), `TestPersonalSortOrderPersistsAcrossSessions`; web `Catalog.test.tsx` favorites + "A5 reorder" (6), `api.test.ts` setFavorite/setLayout | ✅ **Closed in this review:** un-favorite (`DELETE /api/favorites/{id}`) was 0% — `handleRemoveFavorite` + `storage.RemoveFavorite` now covered. |
| **A6** admin CRUD via UI; non-admin 403 | API `services.go:handleCreateService/handleUpdateService/handleDeleteService` (admin-gated) — **full**. Web: `Catalog.tsx` delete-in-edit-mode + `api.ts:deleteService` — **delete only** | API `catalog_test.go` (6): `TestAdminCanCreateService_201`, `TestAdminCanEditService_200`, `TestAdminCanDeleteService_204`, `TestUserCannotCreate/Edit/Delete_403`; web `Catalog.test.tsx` "delete service (edit mode)" (2) | 🟠 **GAP: web has no create-service / edit-fields UI.** Backend + RBAC fully tested; the browser can only delete. Materially incomplete for "CRUD via the UI". |
| **A7** responsive 390 / 1440, no h-scroll/overlap | web `Catalog.tsx`/`App.tsx` Tailwind responsive grid | Playwright `responsive.spec.ts` (**not run here**) | 🟡 Not verified in this pass (no browser). Not covered by any vitest test. |
| **A8** perf TTI<1.5s / FCP<800ms / Lighthouse ≥90 | web Vite build | `lighthouserc.cjs` + `tests/e2e/perf.spec.ts` (Lighthouse CI, **not run here**) | 🟡 Not verified in this pass (needs built app + Lighthouse). |
| **A9** Gatus unreachable → UNKNOWN, no 5xx | API `poller.go` + `services.go:statusFor` | `services_test.go`: `TestServicesEndpoint_GatusBlackhole_NoFiveXX`, `...AllUnknown`; `poller_test.go:TestPollerSurvivesGatusUnreachable` | ✅ |
| **A10** Postgres + `DATABASE_URL` | API `storage.go:Open/Migrate` | `storage_test.go`: `TestStorageBootsWithDatabaseURL`, `TestMigrationsApplyCleanlyToFreshDB` | ✅ |
| **A11** Gatus never reaches browser | API serves all status; web never calls Gatus | API `security_test.go:TestNoGatusURLInAnyResponse`; Playwright `no-gatus-leak.spec.ts` post-build bundle-grep (**not run here**) | ✅ Go-side response check passes. Built-bundle grep not executed in this pass. |

### v2 — `specs/v2-app-icons.md` (A1–A14)

⚠️ **Backend (A3–A6, A10–A14 server side) is on `feat/app-icons`, NOT merged
to `main`.** Web (A1, A2, A7, A8, A9) is merged on `68f2d56`. All tests below
pass on their respective branches.

| AC | Implemented? (`file:func`) | Tested? (test name) | Gap / notes |
|---|---|---|---|
| **A1** admin sees Edit toggle, non-admin doesn't | web `App.tsx` (role gate) | `App.test.tsx` "A1 — admin edit-mode toggle" (3) | ✅ |
| **A2** edit mode: light+dark slot + remove per tile | web `Catalog.tsx` | `Catalog.test.tsx` "A2(v2) — edit-mode icon controls" (3) | ✅ incl. non-admin-forced-on negative case |
| **A3** PUT light+dark; GET returns `image/png` | API `icons.go:handlePutIcon/handleGetIcon`; web `api.ts:uploadIcon` | API `icons_test.go:TestAdminUploadAndServeIcons`; web `Catalog.test.tsx` "A3(v2) upload/replace/remove" (3), `api.test.ts` uploadIcon | ✅ |
| **A4** non-admin 403 on PUT/DELETE | API `icons.go` admin gate | `icons_test.go:TestNonAdminCannotMutateIcons` | ✅ |
| **A5** non-PNG → 415 even with spoofed Content-Type | API `icons.go` magic-byte sniff (`pngMagic`) | `icons_test.go:TestSpoofedContentTypeRejected415`; web `api.test.ts`/`icons.test.ts` `validateIconFile` magic-byte test | ✅ (test asserts 415; doesn't separately assert "no row written" — minor) |
| **A6** >512²→422, >256KB→413, valid→204 | API `icons.go` (`iconMaxBytes/iconMaxDim/iconMinDim`) | `icons_test.go:TestIconSizeAndDimensionLimits` (over/under-dim 422, over-bytes 413, valid 204, max-512-ok 204); `TestBadVariantRejected400` | ✅ Boundaries well covered. |
| **A7** theme-aware render; swap on theme toggle, no reload | web `icons.ts:iconSrc` + `Catalog.tsx` | `Catalog.test.tsx` "A7 — theme-aware rendering"; `icons.test.ts` "iconSrc precedence chain" | ✅ |
| **A8** precedence chain (4 states) | web `icons.ts:iconSrc` | `icons.test.ts` "iconSrc precedence chain" (5 cases) | ✅ |
| **A9** never a broken image; `onError`→bundled local default | web `Catalog.tsx` `<img onError>` | `Catalog.test.tsx` "A9 — never a broken image" + "falls back to the bundled local default" | ✅ asserts the fallback asset is local, not a CDN URL |
| **A10** ETag + `If-None-Match`→304 | API `icons.go:handleGetIcon` | `icons_test.go:TestIconETagConditional304` | ✅ |
| **A11** DELETE idempotent (204±bytes), reverts | API `icons.go:handleDeleteIcon` | `icons_test.go:TestDeleteIconIdempotent`; web `api.test.ts` deleteIcon | ✅ |
| **A12** delete service cascades `service_icons` | migration `0002_app_icons.up.sql` FK `ON DELETE CASCADE` | `icons_test.go:TestDeleteServiceCascadesIcons` | ✅ |
| **A13** list returns `iconLight/iconDark`, never bytes | API `services.go:handleListServices` + `storage.go:AllIconFlags` | `icons_test.go:TestListExposesIconFlagsNotBytes` | ✅ |
| **A14** all icon state in Postgres, no PVC | API `storage.go:PutIcon/GetIcon` (bytea) | Indirectly via the icon round-trip + migration tests | 🟡 No explicit "restart pod → icon still served" smoke test (it's a deploy-time property). Design + integration cover it; the literal smoke isn't automated. |

### Beyond the ACs — OIDC (built, partially tested, **not a v1/v2 AC**)

`feat/app-icons` also ships an entire OIDC/PocketID login path
(`internal/oidc/*`, `internal/api/oidc.go`, `oidc_test.go`, 5 tests incl.
**account-link-by-email** = `TestOIDCCallbackLinksExistingLocalUserByEmail`).
This is genuinely useful but is **out of scope of both specs** (v1 explicitly
defers OIDC; the v2 spec is icons-only). It is the single biggest source of
untested backend lines — see §3.

---

## 2. Real coverage numbers (measured)

### Backend — `go test ./... -cover`

Run with `DATABASE_URL=postgres://homepad:…@homepad-testdb.stitch.svc…/homepad`.
**All 36 tests pass.**

Per-package, self-coverage (each package's own `*_test.go`):

| Package | Coverage |
|---|---|
| `internal/api` | **65.7%** |
| `internal/gatus` | 58.1% |
| `internal/storage` | 11.9% \* |
| `internal/oidc` | 0.0% \* |
| `internal/session` | 0.0% \* |
| `internal/testsupport` | 0.0% (test harness) |
| `cmd/homepad-api` | 0.0% (`main` wiring) |

\* These self-numbers **understate reality**: `storage`, `session`, and the
`oidc` HTTP handlers are exercised through the `internal/api` integration tests
(tests live in package `api_test`), not by tests inside their own package. The
honest cross-package figure is:

**`-coverpkg=./...` total: 66.7% of statements.**

Notable per-func levels after this review (the ones that move ACs are green):

- `storage.go`: `ListServices` 81.8%, `CreateService` 81.8%, `UpdateService`
  58.8%, `DeleteService` 77.8%, `GetIcon/PutIcon/DeleteIcon/AllIconFlags` ~80%,
  `RemoveFavorite` **80%** (was 0%), `FavoriteIDs` 81.8%, `SetLayout` 71.4%.
- `session.go`: `Destroy` **100%** (was 0%).
- `icons.go`: `handleGetIcon` 73.9%, `handlePutIcon` 73.7%, `handleDeleteIcon`
  60% — remaining misses are internal-error branches (DB failure paths).

### Web — `vitest run --coverage` (v8 provider)

**All 75 tests pass.** (Installed `@vitest/coverage-v8@2.1.9` to measure.)

| File | % Stmts | % Branch | % Funcs | % Lines |
|---|---|---|---|---|
| **All files** | **98.32** | **89.63** | **95.83** | **98.32** |
| `App.tsx` | 100 | 93.47 | 100 | 100 |
| `Catalog.tsx` | 99.65 | 83.14 | 100 | 99.65 |
| `api.ts` | 100 | 100 | 100 | 100 |
| `icons.ts` | 100 | 96.66 | 83.33 | 100 |
| `main.tsx` | 0 | 0 | 0 | 0 |

`main.tsx` (the 10-line `ReactDOM.createRoot` bootstrap) is the only uncovered
web file — it's the entry point, not unit-testable in jsdom, and standard to
exclude. Excluding it, the app source is effectively fully covered on
statements/lines; the ~10% branch shortfall in `Catalog.tsx` is defensive
optimistic-rollback edge branches.

---

## 3. Honest gaps (what is NOT covered)

**Spec / implementation gaps (affect ACs):**

1. 🔴 **v2 backend not on `main`.** Migration `0002`, icon handlers, list
   flags, OIDC — all unmerged on `feat/app-icons`. Until a PR lands, v2 does
   not exist on the backend's `main`. *Material: HIGH (it's the deploy story).*
2. 🟠 **v1 A6 web create/edit UI missing.** Only delete is wired in the
   browser. `createService`/`updateService` don't exist in `api.ts`. *Material:
   MEDIUM — backend + RBAC are fully tested, but "CRUD via the UI" is
   half-done.*
3. 🟡 **A7 / A8 not executed here.** Responsive (`responsive.spec.ts`) and perf
   (`perf.spec.ts` + `lighthouserc.cjs`) are Playwright/Lighthouse-only and
   were not run in this review (no browser/built app). They are wired into CI;
   I just can't attest to a pass from here. *Material: LOW–MED.*
4. 🟡 **A11 bundle-grep not executed here.** The Go-side "no Gatus URL in any
   response" test passes; the post-build `no-gatus-leak.spec.ts` bundle grep
   wasn't run. *Material: LOW (Go boundary is the real guard).*
5. 🟡 **A14 has no automated pod-restart smoke.** Property holds by design
   (bytea in Postgres, stateless pod) and via the icon round-trip; the literal
   "restart, still served" check is manual. *Material: LOW.*

**Untested code paths (don't map to an AC, but real):**

- **OIDC error/edge branches:** `oidc.ConfigFromEnv` 0%, `oidc.Userinfo` 0%,
  `oidc.truthy` 0%, `api.handleOIDCCallback` 45% (state-mismatch / exchange-
  failure / verify-failure branches untested), `verify.audienceContains` 36%.
  OIDC happy-paths + account-link-by-email **are** tested; the failure modes
  are not. Not an AC, but it's auth code — worth hardening before relying on
  OIDC in prod.
- **`gatus.FetchAll` 23.8%** — the live HTTP-success parse path is thin
  (blackhole/error paths are what's tested for A9). Low risk.
- **`storage.UpdateService` 58.8%** — partial-update column branches not all
  exercised.
- **Service-layer internal-error (5xx) branches** in icon/catalog handlers —
  DB-failure arms are uncovered (hard to trigger without fault injection).
- **`cmd/homepad-api/main.go` 0%** and **web `main.tsx` 0%** — process
  bootstrap; conventional to leave uncovered.
- **`migrations/0002_app_icons.down.sql`** — the rollback SQL has no test
  (up-migration is tested via `TestMigrationsApplyCleanlyToFreshDB`; down is
  not exercised).

---

## 4. Changes made during this review (test-only, CI stays green)

Two small, clearly-worth-it backend gaps closed (both tied to a v1 AC, neither
inflates a number meaningfully — total moved 65.2% → 66.7%):

1. **`auth_test.go:TestLogoutClearsSession`** — rewritten from a bare 204 check
   into the full A1 round-trip (login → `/api/me` 200 → logout-with-cookie →
   `/api/me` 401). Now exercises `session.Destroy` (0% → 100%) and verifies the
   AC as literally written in the test plan.
2. **`favorites_test.go:TestRemoveFavoritePersistsAcrossSessions`** (new) —
   covers `DELETE /api/favorites/{id}`, which was entirely untested
   (`handleRemoveFavorite` + `storage.RemoveFavorite` were 0%).

I did **not** add tests to paper over the real gaps in §3 — the create/edit
UI, A7/A8 execution, OIDC failure modes, and the unmerged backend are reported
honestly rather than hidden.

---

## TL;DR

The **code quality and AC-mapped test coverage are strong** — 36 backend + 75
web tests, 98% web statement coverage, every merged v1/v2 AC backed by a
passing test. But "100% covered" is **not** an honest claim, because: the v2
backend isn't on `main` yet, v1 A6's create/edit UI was never built on the web,
and the responsive/perf ACs are CI-only and unverified in this pass. Fix those
three and you're genuinely there.
