# Implementation Plan: Household Basics

**Spec:** [`specs/SPEC-household-basics.md`](../../specs/SPEC-household-basics.md) v0.1.0 (APPROVED 2026-11-07: Q1–Q12 = A)
**UX:** [`specs/ux/household-basics-ux.md`](../../specs/ux/household-basics-ux.md) (APPROVED 2026-11-07: H-1…H-4 as proposed)
**Created:** 2026-11-07
**Team:** Solo + agent team (one agent on homepad-api, one on the frontend; no shared files)
**Estimated effort:** ~30h of task time across two repos, about 4 working days
**Target:** 17.1.0 (minor: no account loses access; the new default only affects new self-registration)
**Maturity:** GA — all gates blocking, strict TDD, 90% coverage on `src`
**Also in this build:** homepad-api #89 (OIDC links by email without checking `email_verified`)

---

## Overview

Five scopes, from the spec, plus one security fix:

1. safe sign-up by default: `invite_only`, a race-safe first admin, and a sign-in screen that knows the mode;
2. "Add an adult" through a one-time invite link;
3. every admin edits the same catalog (#87);
4. an account cap for the demo, `HOMEPAD_MAX_ACCOUNTS` (#88);
5. a kid's allow-list change shows within 30 seconds (#548);
6. OIDC requires `email_verified` before it links or creates an account (#89).

The API lands first (one homepad-api PR). The web PR follows; it builds against mocks of the contract fixed below, so both can be worked at once.

## Findings from reading the code (2026-11-07)

- `handleRegister` (`internal/api/auth.go`) calls `CountUsers` and then `CreateUser` with no lock: the first-admin race is real. `Migrate` already uses a transaction-scoped advisory lock, so the same pattern (a second, fixed key) makes every account insert serialize: register, OIDC auto-create, kid create, invite create. That one lock also makes the account cap exact.
- `catalogOwner()` already exists in `icons.go` (#85). Every catalog write handler takes `u.ID` from `requireAdmin` and passes it to an owner-scoped store call. For the first admin `owner == u.ID`, so swapping in the owner changes nothing for single-admin installs (AC-027).
- `GET /api/library` passes `u.ID` to `ListLibrary`, so the `added` hint is wrong for everyone but the owner (AC-024).
- `seedSecondAdmin` already exists in `icons_shared_catalog_test.go`; the second-admin suite reuses it.
- `routes_test.go` holds an independent class table and probes every route with a kid session. A new class `catalog-write` (enforced like `admin-only`) lets the second-admin suite read its route list from the router.
- `main.go` falls back to `envOr("HOMEPAD_REGISTRATION", "open")`. `main` has no tests, so the default and the `HOMEPAD_MAX_ACCOUNTS` parse move into small `api` functions that do.
- The OIDC ID-token claim struct has no `email_verified`. PocketID sends it with the `email` scope. The mock IdP in `oidc_test.go` doesn't, so it gains the claim (default `true`) and the existing OIDC tests keep passing.
- The latest migration is 0018. **0019 is reserved for this build** (`0019_invites`); a sibling build takes 0020.
- Frontend: `AuthForm` lives in `App.tsx` (entry chunk). `AccountsSection` lives in the lazy `SettingsPanel` chunk. All CSS is in `src/index.css`, one entry stylesheet with a gzip budget (~19.4 of 20.5 kB). New admin styles go in a CSS file imported by the lazy admin chunk; the sign-in states reuse the existing `auth-*` classes.
- `POLL_MS = 60_000` is module-level in `src/services.tsx`. `ServicesProvider` already takes `syncMembership` for the kid shell, so a `pollMs` prop is a small change.

## API contract (fixed here; the web PR mocks it)

| Method | Path | Class | Body / result |
|---|---|---|---|
| GET | `/api/auth/config` | public | `{oidcEnabled, registration: "open" \| "invite_only", setupNeeded}` |
| POST | `/api/register` | public | unchanged; 409 `account limit reached (limit N)` in `open` mode at the cap |
| POST | `/api/admin/invites` | admin-only | `{name, role}` → 201 `{id, name, role, createdAt, expiresAt, token}`; 400; 409 `account limit reached (limit N)` |
| GET | `/api/admin/invites` | admin-only | `[{id, name, role, createdAt, expiresAt, createdBy: {id, name}}]`, pending only, newest first |
| DELETE | `/api/admin/invites/{id}` | admin-only | 204; 404 when not pending |
| POST | `/api/invites/lookup` | public, rate-limited | `{token}` → 200 `{name, role, inviterName, expiresAt}`; 404 `invite not found` for every dead token; 429 + `Retry-After` |
| POST | `/api/invites/accept` | public, rate-limited | `{token, email, password, name?}` → 201 `/api/me` body + session cookie; 400 (validation, unknown field); 404; 409 `email already registered`; 429 |
| POST | `/api/admin/kids` | admin-only | adds 409 `account limit reached (limit N)` |

The cap message carries the number so the web app can say "This Homepad has reached its limit of N accounts." without another request. A 409 whose text starts with `account limit reached` is the cap; any other 409 keeps its meaning (a taken kid name, a taken email).

---

## Phase 1 — homepad-api (one PR) · AC-001…AC-004, AC-008…AC-018, AC-023…AC-030, #89

| Task | Description | Repo | Effort | Depends on |
|---|---|---|---|---|
| TASK-101 | RED: registration default and bootstrap. `RegistrationFromEnv("")` is `invite_only`; `/api/auth/config` carries `registration` and `setupNeeded`; first account is admin in both modes; 10 concurrent registrations on an empty DB give exactly one admin (the rest 403 under `invite_only`); the bootstrap log line. | api | 2h | — |
| TASK-102 | RED: invites. Migration 0019 shape and idempotence; create (name 1–40, role admin/user only, `kid` is 400), token is 32 bytes base64url and only its SHA-256 is stored; list is pending-only; revoke; lookup; accept (role from the invite, strict decode, a `role` field is 400, adult session cookie, `/api/me` body); single use, including two concurrent accepts; expiry at 7 days; one identical 404 for unknown, malformed, expired, used and revoked tokens; failed accepts leave the invite usable; both registration modes; member and kid get 403; 429 + `Retry-After` over the limit; log lines with no token or hash. | api | 4h | — |
| TASK-103 | RED: second-admin catalog suite (#87). Walks the router's `catalog-write` routes; each must have a probe that writes as a second admin and checks the change in `GET /api/services` or `/api/categories`. `GET /api/library` `added` for every caller. Storage test for the non-owner-admin row count. | api | 2.5h | — |
| TASK-104 | RED: account cap (#88). `ParseMaxAccounts` (unset, empty, `0`, positive, junk, negative); at the cap: kid create, invite create, `open` register and OIDC auto-create are 409 and create nothing; accept and the first account always work; env-config allowlist. | api | 2h | — |
| TASK-105 | RED: #89. Mock IdP gains `email_verified`. Verified links and creates; unverified and missing are refused and create or link nothing; a userinfo fallback email brings its own `email_verified`. | api | 1h | — |
| TASK-106 | **Commit RED.** Push; CI (Postgres 17) shows the new tests failing for the right reason. | api | 0.25h | 101–105 |
| TASK-107 | GREEN: migration `0019_invites` (+ down); `storage/invites.go` (create, list, revoke, lookup, accept in one transaction, stale sweep) and `storage/accounts.go` (account lock, atomic register, capped kid/OIDC create, account count, non-owner-admin row count). | api | 4h | 106 |
| TASK-108 | GREEN: handlers. `invites.go` (admin + public routes), `ratelimit.go` (token bucket 30/min burst 10, shared by lookup and accept), auth config fields, register via the atomic store call, OIDC cap + `email_verified`, kid cap. | api | 4h | 107 |
| TASK-109 | GREEN: #87. `classCatalogWrite` in `server.go`; every catalog write resolves the shared owner after `requireAdmin` through one helper; `ListLibrary` takes the owner. | api | 1.5h | 106 |
| TASK-110 | GREEN: `main.go` — default `invite_only`, `HOMEPAD_MAX_ACCOUNTS` parse (stop on junk), hourly invite sweep, startup count of non-owner-admin rows. `.env.example`, README endpoint table. | api | 1h | 108 |
| TASK-111 | REFACTOR + verify: `gofmt`, `go vet`, full suite on CI, `-race` on `internal/api`. | api | 1h | 107–110 |

**Gate:** homepad-api PR; CI green; QA via Joe's dispatch. The web PR merges after this one reaches staging.

## Phase 2 — homepad web (one PR, includes this plan) · AC-005…AC-007, AC-019…AC-022, AC-031, AC-033…AC-035

| Task | Description | Repo | Effort | Depends on |
|---|---|---|---|---|
| TASK-201 | RED: `api.ts` — `authConfig()` returns `{oidcEnabled, registration, setupNeeded}` and falls back to closed and no setup; the invite calls (`createInvite`, `listInvites`, `revokeInvite`, `lookupInvite`, `acceptInvite`); `isAccountLimit()` / `accountLimitOf()` read the cap message. | web | 1.5h | contract above |
| TASK-202 | RED: sign-in card states (UX §2): Set up Homepad when `setupNeeded`; no "Create account" when closed or while loading; today's card when `open`; the 403 race message switches to Sign in. | web | 1.5h | 201 |
| TASK-203 | RED: Join screen (UX §4): `#invite=` read and removed with `history.replaceState`; live, loading, dead-link and already-signed-in states; Join errors (409 with Sign in, 429, validation); success lands on the dashboard. | web | 2h | 201 |
| TASK-204 | RED: Accounts (UX §3): **+ Add an adult**; open-sign-up warning (`role="note"`, kid line only with a kid); "member" pill; Pending invites with Revoke confirm; the old footnote gone. Add-an-adult dialog: name rule, radio group with `aria-describedby`, amber admin line, PocketID line when OIDC is on, cap error, generic error; link-once view with Copy / "Copied" (live region), Share when offered, and the selected read-only field with the right hint when the clipboard is unavailable. Kid editor shows the cap message on save. | web | 3h | 201 |
| TASK-205 | RED: kid shell polls every 20s, adults every 60s; a hidden kid tab doesn't poll; becoming visible polls at once. | web | 1h | — |
| TASK-206 | **Commit RED** (vitest red for the right reason). | web | 0.25h | 201–205 |
| TASK-207 | GREEN: `api.ts`; `AuthForm` split into `src/app/AuthForm.tsx` with the three states; `JoinScreen.tsx`; `App.tsx` reads the fragment before `/api/me` resolves. | web | 3h | 206 |
| TASK-208 | GREEN: `AccountsSection` changes, `AddAdultDialog.tsx`, `PendingInvites`; styles in `src/accounts/household.css` (lazy chunk); `HOMEPAD_MAX_ACCOUNTS` label in System. | web | 3h | 206 |
| TASK-209 | GREEN: `ServicesProvider` `pollMs` prop; the kid shell passes 20 000. | web | 0.5h | 206 |
| TASK-210 | Browser gate + e2e: mock API gains auth-config modes and the invite routes; a gate spec for Accounts → Add an adult → link → Pending → Revoke at 820, and an e2e for setup → sign out → no "Create account", and invite link → Join → dashboard. jest-axe on every new surface. | web | 2.5h | 207–209 |
| TASK-211 | Docs (AC-007): README quickstart, `compose.yaml` header and default, `compose.build.yaml`, `.env.example`, `docs/kid-accounts.md`, `docs/development.md`; `docs/household.md`-style section in README for registration and invites; CHANGELOG `[Unreleased]` entry with how to check the mode. No version bump (the release PR does that). | web | 1h | — |
| TASK-212 | Verify: `lint`, `typecheck`, `build`, `vitest --coverage` (≥90%), CSS budget, `test:gate`, `test:e2e`. | web | 1h | 207–211 |

## Phase 3 — Verify and release (after both PRs merge)

| Task | Description | Effort |
|---|---|---|
| TASK-301 | TC-001…TC-010 against staging (http, not https). Capture the UX §6 screenshots. | 1.5h |
| TASK-302 | QA dispatch via Joe for each PR. Read the review body, not just the approval. | — |
| TASK-303 | AC-032: merge `main` into `demo-seed`, set `HOMEPAD_MAX_ACCOUNTS=12` in the demo's deploy config (Joe and Gus), then check on the demo. | 0.5h |
| TASK-304 | Release 17.1.0: version bump, CHANGELOG date, README spec index notes that this spec supersedes SPEC-kid-accounts AC-002's 60s for kids. | 0.5h |

---

## AC → task → test map

| AC | Task | Repo | Test (planned) |
|---|---|---|---|
| AC-001 | 101, 110, 211 | api, web | `TestRegistrationFromEnv_DefaultIsInviteOnly`; `tests/infra/household-docs.test.ts` (compose, compose.build, .env.example defaults) |
| AC-002 | 101 | api | `TestRegister_FirstAccountIsAdminInEveryMode`, existing `TestRegistrationFailsClosed` |
| AC-003 | 101, 107 | api | `TestRegister_ConcurrentBootstrapMakesOneAdmin` |
| AC-004 | 101, 108 | api | `TestAuthConfig_RegistrationAndSetupNeeded` |
| AC-005 | 202, 207 | web | `AuthForm.test.tsx`; e2e `household.spec.ts` |
| AC-006 | 204, 208 | web | `AccountsSection.household.test.tsx` (warning, kid line) |
| AC-007 | 211 | web | `tests/infra/household-docs.test.ts` |
| AC-008 | 102, 108 | api | `TestInvites_CreateValidatesNameAndRole` |
| AC-009 | 102, 107 | api | `TestInvites_TokenIs32BytesAndOnlyHashStored` |
| AC-010 | 102, 107 | api | `TestInvites_SingleUse`, `TestInvites_ConcurrentAcceptCreatesOne`, `TestInvites_ExpireAfterSevenDays` |
| AC-011 | 102, 108 | api | `TestInvites_ListPendingOnly`, `TestInvites_Revoke` |
| AC-012 | 102, 108 | api | `TestInvites_LookupLiveAndEveryDeadTokenIdentical404` |
| AC-013 | 102, 108 | api | `TestInvites_AcceptCreatesAdultAndSignsIn`, `TestInvites_AcceptRefusesUnknownFields` |
| AC-014 | 102, 107 | api | `TestInvites_FailedAcceptLeavesInviteUsable` |
| AC-015 | 102 | api | `TestInvites_WorkInBothModes` |
| AC-016 | 102, 108 | api | `TestInvites_AdminOnly`, route table + kid probe in `routes_test.go` |
| AC-017 | 102, 108 | api | `TestInviteRateLimit_*` (unit, fake clock) + `TestInvites_PublicRoutesRateLimited` |
| AC-018 | 101, 102 | api | `TestInvites_LogLinesNeverCarryTokenOrHash`, bootstrap log in `TestRegister_FirstAccountLogs` |
| AC-019 | 204, 208, 210 | web | `AddAdultDialog.test.tsx`, `AccountsSection.household.test.tsx`, gate `accounts-invite.spec.ts` |
| AC-020 | 203, 207, 210 | web | `JoinScreen.test.tsx`, `App.invite.test.tsx`, e2e `household.spec.ts` |
| AC-021 | 204, 208 | web | `AccountsSection.household.test.tsx` ("member") |
| AC-022 | 105, 204 | api, web | existing OIDC tests unchanged; `AddAdultDialog.test.tsx` (PocketID line) |
| AC-023 | 103, 109 | api | `TestSecondAdmin_CatalogWrites/*` |
| AC-024 | 103, 109 | api | `TestSecondAdmin_LibraryAddedHintForEveryCaller` |
| AC-025 | 103, 109 | api | `TestSecondAdmin_EveryCatalogWriteRouteIsProbed` |
| AC-026 | 103, 110 | api | `TestStore_NonOwnerAdminCatalogRows` (storage) |
| AC-027 | 109 | api | the existing catalog suite, unmodified |
| AC-028 | 104, 110 | api | `TestParseMaxAccounts`, `TestAccountLimit_CountsAccountsAndPendingInvites` |
| AC-029 | 104, 108 | api | `TestAccountLimit_RefusesAtCap/*`, `TestAccountLimit_AcceptAndFirstAccountNeverRefused` |
| AC-030 | 104, 208 | api, web | `TestEnvConfig_AllowlistsMaxAccounts`; SettingsPanel label test |
| AC-031 | 204, 208 | web | `AddAdultDialog.test.tsx`, `KidEditor` cap test |
| AC-032 | 303 | demo | manual, on the demo after deploy |
| AC-033 | 205, 209 | web | `services.kid-poll.test.tsx` (20s kid, 60s adult) |
| AC-034 | 205, 209 | web | `services.kid-poll.test.tsx` (visible → poll at once) |
| AC-035 | 205, 209 | web | `services.kid-poll.test.tsx` (hidden → no poll) |
| #89 | 105, 108 | api | `TestOIDCCallback_EmailVerified/*` |

## Order and parallelism

```
Phase 1 (api PR) ──► staging ──► Phase 2 merge (web PR) ──► Phase 3
        ▲
Phase 2 TASK-201..212 run against mocks of the contract above, in parallel
```

- Two agents at most: homepad-api and the frontend. No file overlaps.
- A sibling build (backup/import) and another (status widgets) touch `internal/api/server.go` routes and `src/` in parallel. Each PR rebases on `gitea/main` right before it opens, and keeps its diff to the files listed here.

## Effort summary

| Phase | Hours |
|---|---|
| 1 homepad-api | 23 |
| 2 Frontend | 21 |
| 3 Verify and release | 2.5 |
| **Total** | **~46h** (tasks overlap across two agents; ~4 days elapsed) |

## Risks

| Risk | P | I | Mitigation |
|---|---|---|---|
| A catalog write route misses owner resolution, so a second admin's edit vanishes again | M | M | `catalog-write` class + the second-admin suite reads its list from the router; an unprobed route fails the build (AC-025). |
| The advisory lock serializes every account insert and slows sign-up | L | L | Account inserts are rare; bcrypt runs before the lock is taken. |
| Changing the default closes sign-up on hand-written deploys with no `HOMEPAD_REGISTRATION` | M | M | CHANGELOG calls it out (spec §10); existing accounts are untouched; the admin uses invites. |
| An invite token leaks through logs or `Referer` | L | H | Token only in the URL fragment and POST bodies; only its SHA-256 is stored; a test scans the log output for the token and its hash. |
| A 17.1.0 web build against a 17.0.0 API hides "Create account" on an `open` install | M | L | `authConfig()` falls back to closed by design; ship both halves together. |
| Entry CSS budget | M | L | New admin styles in a CSS file imported by the lazy admin chunk; the sign-in states reuse `auth-*` classes. |
| Rate limit trips other tests that call the public invite routes | M | L | The limiter is per server instance; tests that need many calls build a server with a larger bucket. |
| The demo cap isn't set after deploy | M | M | TASK-303 is a release checklist item; AC-032 is checked on the demo itself. |

## Next step

Start Phase 1 (TASK-101…105) in `homepad-api` on `feat/household-basics`, and Phase 2 (TASK-201…205) in `homepad` on `feat/household-basics-web`, against the contract above.

## Plan history

- 2026-11-07: Initial plan, from the approved spec and UX. Adds homepad-api #89 (OIDC `email_verified`) to the build.
