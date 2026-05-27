# homepad v1 — Test Plan

**Companion to:** [`v1-launcher.md`](./v1-launcher.md)
**Methodology:** ADD, RED phase

Maps each acceptance criterion to concrete test files + function names. Every test below is **RED** at the start of the implementation phase — i.e. it fails because no implementation exists yet. The TDD cycle drives each one to GREEN one criterion at a time.

## Coverage matrix

| AC | Test type | Repo | File | Functions |
|---|---|---|---|---|
| A1 — auth: register/login/logout | Go integration (httptest) | homepad-api | `internal/api/auth_test.go` | `TestRegisterCreatesUser`, `TestLoginSetsSessionCookie`, `TestMeUnauthorized`, `TestMeAuthorized`, `TestLogoutClearsSession` |
| A2 — shared catalog renders | Playwright E2E | homepad | `tests/e2e/catalog.spec.ts` | `catalog renders all seeded services with name/icon/desc/url` |
| A3 — status badge colors | Playwright E2E w/ mock | homepad | `tests/e2e/status-badge.spec.ts` | `tile shows green when Gatus says UP`, `... red when DOWN`, `... yellow when DEGRADED`, `... gray when UNKNOWN` |
| A4 — status staleness < 60s | Go unit | homepad-api | `internal/gatus/poller_test.go` | `TestPollerTickerRunsUnder30s`, `TestStatusResponseIncludesAsOfTimestamp` |
| A5 — favorites + order persist | Go integration | homepad-api | `internal/api/favorites_test.go` | `TestMarkFavoritePersistsAcrossSessions`, `TestPersonalSortOrderPersistsAcrossSessions` |
| A6 — admin RBAC for catalog CRUD | Go integration | homepad-api | `internal/api/catalog_test.go` | `TestUserCannotCreateService_403`, `TestAdminCanCreateService_201`, `TestAdminCanEditService_200`, `TestAdminCanDeleteService_204` |
| A7 — responsive 390 + 1440 | Playwright E2E | homepad | `tests/e2e/responsive.spec.ts` | `no horizontal scroll at iPhone 13 (390x844)`, `no horizontal scroll at desktop (1440x900)`, `no element overlap at either viewport` |
| A8 — perf budgets | Lighthouse CI | homepad | `lighthouserc.cjs` + `tests/e2e/perf.spec.ts` | thresholds: TTI ≤ 1500ms (desktop), FCP ≤ 800ms (desktop), Performance score ≥ 90 desktop / ≥ 80 mobile |
| A9 — Gatus unreachable → UNKNOWN, no 5xx | Go integration | homepad-api | `internal/api/services_test.go` + `internal/gatus/poller_test.go` | `TestServicesEndpoint_GatusBlackhole_NoFiveXX`, `TestServicesEndpoint_GatusBlackhole_AllUnknown`, `TestPollerSurvivesGatusUnreachable` |
| A10 — Postgres + DATABASE_URL | Go integration | homepad-api | `internal/storage/storage_test.go` | `TestStorageBootsWithDatabaseURL` (skipped if `DATABASE_URL` unset), `TestMigrationsApplyCleanlyToFreshDB` |
| A11 — Gatus URL never reaches browser | Go unit + bundle-grep | both | `internal/api/security_test.go` (Go) + `tests/e2e/no-gatus-leak.spec.ts` (Playwright, post-build) | `TestNoGatusURLInAnyResponse`, `built bundle contains no occurrences of gatus base url` |

## Fixtures + harness

**homepad-api:**

- `internal/testsupport/server.go` — boots an in-process httptest server with a clean DB (testcontainers Postgres or a `DATABASE_URL`-driven Postgres in CI) and a fake Gatus stub.
- `internal/testsupport/gatus_stub.go` — `httptest.Server` that serves canned `/api/v1/endpoints/statuses` payloads (UP/DOWN/DEGRADED/UNKNOWN combos) per test.
- `internal/testsupport/gatus_blackhole.go` — a `Gatus` URL pointing at `127.0.0.1:1` (immediately fails to connect) for A9.

**homepad (web):**

- `tests/e2e/fixtures.ts` — Playwright fixture that seeds the API via `POST /api/register` + `POST /api/services` (admin), then logs in for the test user.
- `tests/e2e/gatus-mock.ts` — Playwright route-mocking against the homepad backend's `/api/services` (not Gatus directly — backend boundary).
- Lighthouse run is in CI only (not in regular dev loop).

## "RED for the right reason" criteria

Tests are valid RED when, at the start of implementation:

1. `go test ./...` in homepad-api **compiles** successfully but tests **fail** (assertions miss / endpoints return 404).
2. `npx playwright test --list` in homepad **lists** every spec but actual runs fail because the dev server returns a 404 / blank page.
3. No test fails because of import errors, missing fixtures, or typos — only because the implementation is missing.

The verification step (Task #6 below) runs both commands and inspects failures match these patterns.

## Out of scope for v1 RED

- Visual regression snapshots — too brittle pre-design-lock.
- Load / soak tests — capacity planning is v2.
- Security pen-test — separate engagement; spec's A11 is the one specific guard for v1.
- Accessibility audit — should happen before v1 ships, but tracked as a release-gate, not an AC.
