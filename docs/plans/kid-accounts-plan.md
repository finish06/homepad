# Implementation Plan: Kid Accounts

**Spec:** [`specs/SPEC-kid-accounts.md`](../../specs/SPEC-kid-accounts.md) v0.2.0 (APPROVED 2026-10-22)
**UX:** [`specs/ux/kid-accounts-ux.md`](../../specs/ux/kid-accounts-ux.md) (APPROVED 2026-10-22)
**Created:** 2026-10-22
**Team:** Solo + agent team (GA: up to 5 parallel agents via worktrees)
**Estimated effort:** ~44h of task time across two repos, about 5–6 working days solo (the spec's 3–4 days was optimistic)
**Target:** 17.0.0 (major: session storage moves to Postgres)
**Maturity:** GA — all gates blocking, strict TDD, 90% coverage on `src`

---

## Overview

Add a third role, `kid`. A kid is created by an admin with just a name, sees only the services the admin ticks, and stays signed in on one device for 180 days. The work lands in four slices, in this order:

1. persistent, hashed sessions (any account; the big change);
2. the kid role, the allow-list, and server-side filtering;
3. the admin Accounts API;
4. the frontend: the Accounts section, the kid editor and the kid shell.

Slice 1 is a hard prerequisite for "stays signed in" and changes behaviour for every account, so it ships and soaks in staging on its own first.

## Findings from reading the code (2026-10-22)

- `internal/session/session.go` is a 55-line in-memory map, used in only three places: `auth.go` (login, logout, the auth middleware) and `oidc.go` (callback). Keeping its method set (`Create`/`UserID`/`Destroy`) behind an interface means the Postgres store drops in with no changes to the handlers.
- `users.display_name` **already exists** (migration 0006). Migration 0017 adds only `avatar_color`, allows the `kid` role, and relaxes email/password for kids. The spec §6 line "add `users.display_name`" is covered by the existing column.
- `server.go` registers 40 routes. That's the list the route-coverage test (TASK-205) enumerates.
- The latest migration is 0016, so 0017 is the next free number.

## Success Criteria

- All 18 Must ACs implemented and tested, and AC-019 (Should) implemented.
- Coverage ≥90% on `src`; Go tests green, including the new route-coverage test.
- `npm run lint`, `typecheck`, `vitest --coverage`, `test:gate`, `test:e2e` all green.
- TC-001…TC-007 pass in staging. The UX §7 screenshot checkpoints have been captured.
- Slice 1 has soaked in staging for 24h with no unexpected 401s before slice 2 merges.

---

## Phase 1 — Persistent sessions (homepad-api) · AC-010, AC-011, TC-002, TC-007

| Task | Description | Effort | Depends on |
|---|---|---|---|
| TASK-101 | RED: tests for a `session.Store` interface. Create returns a token; only `sha256(token)` is stored; UserID slides `last_seen_at` and `expires_at`; an expired session → not found; Destroy; `ListForUser`; `RevokeByHandle`. Run them against the in-memory store and Postgres (testsupport DB). | 2h | — |
| TASK-102 | Migration `0017a_sessions` (part 1 of 0017): `sessions(token_hash bytea PK, user_id FK ON DELETE CASCADE, created_at, last_seen_at, expires_at, user_agent)`, with indexes on `user_id` and `expires_at`. Down migration included. | 1h | — |
| TASK-103 | GREEN: `PgStore`. Write `last_seen_at` at most once per minute per session, so every poll doesn't write. Add an hourly expired-row sweep. Lifetimes: kid 180d, adult 30d, both sliding. | 3h | 101, 102 |
| TASK-104 | Wire it in: `auth.go` and `oidc.go` take the interface; the cookie gets `Max-Age` matching the lifetime, and is refreshed when the expiry slides. Capture the user agent on create. | 1.5h | 103 |
| TASK-105 | Tests: restart survival (new server, same DB, same cookie → 200); the raw token never appears in the DB (scan the column); logout deletes the row. | 1.5h | 104 |

**Gate:** PR to homepad-api; QA via Joe's dispatch; staging; 24h soak. This changes sign-in for everyone, so it is its own PR.

## Phase 2 — Kid role, allow-list, filtering (homepad-api) · AC-003…AC-007, AC-013, AC-014, AC-016, AC-019

| Task | Description | Effort | Depends on |
|---|---|---|---|
| TASK-201 | Migration `0017b_kid_accounts`: add `kid` to the role CHECK; make email and password nullable only when `role='kid'` (CHECK); add `users.avatar_color`; create `kid_allowed_services` (both FKs cascade). | 1h | Phase 1 merged |
| TASK-202 | RED then GREEN: `storage.VisibleServiceIDs(ctx, user)` returns nil for admin and user, and the allow-list for a kid. | 1.5h | 201 |
| TASK-203 | Filter every catalog read through it: services, status (by the allowed services' Gatus keys), categories (hide empty ones), icon reads (404 off-list), favorites writes (404 off-list). | 3h | 202 |
| TASK-204 | Kid write lock: 403 on every catalog, category, library, layout, icon-write, admin and settings mutation; `PATCH /api/me` accepts only `themePref`. One `requireNotKid` middleware, applied in `server.go`. | 2h | 201 |
| TASK-205 | **Route-coverage test.** Enumerate all routes in `server.go`, and assert each one is classified as filtered, not-kid, or catalog-free. A new, unclassified route fails the build. This enforces the rule instead of asserting it in a comment. | 2h | 203, 204 |
| TASK-206 | Register can never set a role (AC-013). Deleting a kid cascades sessions, favorites, preferences and allow-list rows (AC-014). Kids are created with `showHealthBar=false` and `densityPref=large` (AC-019, UX K-3). | 1.5h | 201 |
| TASK-207 | TC-004 as a Go test: a kid token across the escalation calls (each → 403 or 404, as specified). | 1h | 203, 204 |

## Phase 3 — Admin Accounts API (homepad-api) · AC-001, AC-002, AC-009, AC-012

| Task | Description | Effort | Depends on |
|---|---|---|---|
| TASK-301 | `GET /api/admin/accounts`; `POST`, `PATCH` and `DELETE /api/admin/kids[/{id}]`. Name: 1–40 characters, unique among kids. | 2h | Phase 2 |
| TASK-302 | `GET` and `PUT /api/admin/kids/{id}/services` (whole-set replace; unknown IDs → 400). | 1h | 301 |
| TASK-303 | `GET` and `DELETE /api/admin/kids/{id}/sessions[/{sid}]`. The handle is an opaque ID, never the token or its hash. | 1.5h | 301, Phase 1 |
| TASK-304 | `POST /api/admin/kids/{id}/sign-in-here`: requires an admin session, destroys the caller's session, and sets the kid cookie, all in one response. | 1.5h | 303 |
| TASK-305 | Classify the new routes in the TASK-205 test (admin-only); add the OpenAPI/README API table rows. | 0.5h | 301–304 |

Phases 2 and 3 can ship as one homepad-api PR.

## Phase 4 — Frontend (homepad) · AC-008, AC-015, AC-016, AC-018, UX §2–§5

| Task | Description | Effort | Depends on |
|---|---|---|---|
| TASK-401 | `api.ts`: the admin account and kid calls, plus `role: 'kid'` on the user type. Mock-API fixtures for the browser gate and e2e. | 1.5h | Phase 3 contract (can mock first) |
| TASK-402 | Accounts section, first in the Admin Panel, plus the "Accounts" menu item (UX §1–§2, K-1): list, empty, loading and error states. | 2.5h | 401 |
| TASK-403 | Kid editor modal (UX §3): name and color; checklist grouped by section with tri-state headers (`aria-checked="mixed"`); search; the "12 of 52" count; the zero-apps warning; the dirty-form confirm; delete confirm; devices list with Sign out. | 4h | 401 |
| TASK-404 | The sign-in-here confirm (UX §4): disabled with "Save first" when dirty; reloads into the kid board on success. | 1h | 403 |
| TASK-405 | Kid shell (UX §5), gated on `role === 'kid'`: hide edit mode, the Library, Add, tile edit and Admin; menu = name, Appearance, Sign out (K-2); empty-state copy; ⌘K over the visible list only. | 2.5h | 401 |
| TASK-406 | jest-axe on the new surfaces; browser-gate tests at 820 and 1180 for the kid board; capture the UX §7 screenshots. | 2h | 402–405 |
| TASK-407 | `docs/kid-accounts.md` (AC-017): setup, "hides, doesn't block", and pointers to Screen Time and Guided Access. Link it from the README. CHANGELOG entry and 17.0.0 version bump. | 1h | 405 |

## Phase 5 — Verify and release

| Task | Description | Effort |
|---|---|---|
| TASK-501 | Run TC-001…TC-007 against staging on a real iPad-sized viewport, and once on a real iPad if Caleb has one handy (TC-001's Home Screen step). | 1.5h |
| TASK-502 | QA dispatch via Joe for each PR. Read the review body, not just the approval. | — |
| TASK-503 | Release notes call out the one-time sign-out on the 17.0.0 deploy, then promotion on Caleb's go (Joe/Gus). | 0.5h |

---

## Order and parallelism

```
Phase 1 (api PR #1) ──► staging soak 24h ──► Phase 2+3 (api PR #2) ──► Phase 4 merge (web PR)
                                             ▲
                     Phase 4 TASK-401..405 can start against mocks once Phase 3's contract is fixed
```

- One homepad PR in staging at a time (house rule). The frontend PR waits for the homepad-api PR #2 to reach staging.
- Two agents at most: one on homepad-api and one on the frontend against mocks. File ownership doesn't overlap.

## Effort summary

| Phase | Hours |
|---|---|
| 1 Persistent sessions | 9 |
| 2 Kid role and filtering | 12 |
| 3 Admin API | 6.5 |
| 4 Frontend | 14.5 |
| 5 Verify and release | 2 |
| **Total** | **~44h** |

## Risks

| Risk | P | I | Mitigation |
|---|---|---|---|
| A catalog route misses the filter and leaks a hidden app | M | M | The TASK-205 route-coverage test fails the build on any unclassified route. |
| Persistent sessions cause write load or a sign-in regression for everyone | M | H | Write `last_seen` at most once a minute; Phase 1 ships alone and soaks for 24h. |
| The one-time sign-out on the 17.0.0 deploy surprises users | H | L | Release notes; it happens once, and is the last deploy that ever does it. |
| Sign-in-here leaves the admin stuck on the iPad | L | M | Visible Sign out in the kid menu (K-2). |
| iPadOS PWA cookie quirks (ITP caps script-set cookies at 7 days) | M | H | The cookie is set by the server, HttpOnly, first-party, which ITP doesn't cap. TC-002 verifies after 7+ days in staging. |
| The demo seed or the shared demo account breaks on the new sessions table | L | M | The demo runs migrations on boot; add a smoke check of the demo login to TASK-501. |

## Next step

Start Phase 1 (TASK-101) in `homepad-api` on a branch off `main`.

## Plan history

- 2026-10-22: Initial plan, from the approved spec and UX.
