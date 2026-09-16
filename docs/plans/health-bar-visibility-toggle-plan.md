# Implementation Plan: Health Bar Visibility Toggle

**Spec:** [`specs/SPEC-health-bar-visibility-toggle.md`](../../specs/SPEC-health-bar-visibility-toggle.md) v0.1.1
**Created:** 2026-09-15
**Team:** Solo + agent team (GA: up to 5 parallel agents via worktrees)
**Estimated effort:** 9.5–12h across two repos
**Maturity:** GA — all 5 gates blocking, strict TDD, 90% coverage

---

## ⚠️ This plan is conditional

The spec is **BLOCKED on OQ-1**: `SettingsPanel` is reachable only through the
admin-gated `menu-admin-settings` item, so a per-user control placed there is
invisible to non-admins. AC-007 and TC-006 cannot be satisfied until that is
resolved.

The plan is structured so this blocks **as little as possible**. Phases 1–3 are
identical under all three OQ-1 resolutions and can start immediately. Only
Phase 4 (the control's host surface) branches, and it is deliberately the
smallest phase.

**Do not start Phase 4 before TASK-001 closes.**

---

## Overview

Add a per-user boolean that hides the health panel's distribution bar while
keeping the verdict line, LED and freshness stamp. Column on `users`, read from
`GET /api/me`, written with `PATCH /api/me`, with a `localStorage` first-paint
cache. Spans `homepad` (frontend) and `homepad-api` (Go backend).

## Success Criteria

- All 14 Must ACs implemented and tested; both Should ACs implemented or explicitly deferred with sign-off
- Coverage stays ≥90% statements/lines on `src` (current: 95.5%)
- `npm run lint`, `npm run typecheck`, `npx vitest run --coverage`, `npm run test:gate` all green
- Go tests green in `homepad-api`
- Screenshot checkpoints captured for TC-001 and TC-005

---

## Phase 0 — Unblock (human gates, not agent work)

| Task | Description | Effort | Depends on | Blocking |
|---|---|---|---|---|
| TASK-001 | **Resolve OQ-1** — decide the control's host surface. Author's preference: (a) a "My settings" entry in `UserMenu`'s My Dashboard section opening `SettingsPanel` in personal mode. | 15min decision | Walt | **Phase 4** |
| TASK-002 | Kare authors §9 design: control treatment, collapsed panel at 390/1024/1440, confirmation that the verdict line alone still reads as a deliberate panel | 1h | TASK-001 | Phase 4 |
| TASK-003 | Confirm OQ-3 — freshness stamp stays on the verdict line and survives hiding | 5min | — | — |

**Phases 1–3 do not wait on any of these.**

---

## Phase 1 — Backend (`homepad-api`) · ~3h

Model on the `densityPref` implementation throughout — same file, same shape.

| Task | Description | Effort | Depends on | ACs |
|---|---|---|---|---|
| TASK-101 | Migration `0015_show_health_bar.{up,down}.sql` — `ALTER TABLE users ADD COLUMN show_health_bar BOOLEAN NOT NULL DEFAULT TRUE` | 20min | — | AC-001 |
| TASK-102 | `internal/storage/storage.go` — add `ShowHealthBar bool` to the User struct (beside `DensityPref`, ~line 63) and a `SetShowHealthBar` method | 30min | TASK-101 | AC-005 |
| TASK-103 | `internal/api/auth.go` — add `ShowHealthBar bool \`json:"showHealthBar"\`` to `userView` (~line 30) and thread it through `toUserView` (~line 37) | 20min | TASK-102 | AC-005 |
| TASK-104 | `internal/api/auth.go` PATCH — add `ShowHealthBar *bool` to the body struct (~line 151); **widen the empty-body guard at line 157** so `{"showHealthBar": false}` alone is accepted, not 400'd; apply via `SetShowHealthBar` (~line 179) | 45min | TASK-103 | AC-008, AC-009 |
| TASK-105 | `internal/api/health_bar_test.go` — model on `density_test.go`: GET returns the field; PATCH sets it; non-boolean → 400; unauthenticated → 401; a user cannot write another user's value | 1h | TASK-104 | AC-006, AC-008, AC-009 |

**Gotcha (TASK-104):** the guard at `auth.go:157` currently rejects any body
without `themePref` or `densityPref`. Missing this makes every single-field
write fail 400 — and the frontend rollback (AC-010) would mask it as a server
error rather than a bug.

---

## Phase 2 — Frontend data layer (`homepad`) · ~2.5h — parallel with Phase 1

Mock the API; do not wait for Phase 1 to land.

| Task | Description | Effort | Depends on | ACs |
|---|---|---|---|---|
| TASK-201 | `src/api.ts` — add `showHealthBar?: boolean` to `User` (optional, so an older backend type-checks); add `setHealthBarPref()` beside `setDensityPref` (~line 588) using `boolRequest('/api/me', 200, …)` | 30min | — | AC-012 |
| TASK-202 | New `src/app/healthBarPref.ts` — model on `src/grid/tileDensity.ts`. `DEFAULT = true`; `loadHealthBarPref()` reads the cache inside try/catch; `saveHealthBarPref()` swallows a storage throw; `useHealthBarPref()` lets the `/api/me` value win on every resolve and writes through on change | 1h | TASK-201 | AC-001, AC-011, AC-012 |
| TASK-203 | Optimistic update + rollback on a failed write, matching `setFavorite`/`setLayout` | 30min | TASK-202 | AC-010 |
| TASK-204 | `src/app/healthBarPref.test.ts` — default, cache hit, `/api/me` overrides cache, storage throw in private mode, write-through, rollback | 1h | TASK-203 | AC-010, AC-011, AC-012 |

**AC-011 is Must.** An implementation that reads only `/api/me` fails this
spec. The cache is the requirement, not an optimisation.

---

## Phase 3 — Panel render (`homepad`) · ~1.5h

| Task | Description | Effort | Depends on | ACs |
|---|---|---|---|---|
| TASK-301 | `StatusBar.tsx` — AND the preference into the existing `showMetrics` guard (~line 324). **Unmount the bar; do not `display:none` it** — it is a focusable group, so it must leave the a11y tree | 30min | TASK-202 | AC-003, AC-015 |
| TASK-302 | Keep the counts in the subline when the bar is hidden, so no information is lost outright | 20min | TASK-301 | AC-016 |
| TASK-303 | Assert the row collapses with no residual gap — do not assume the flex layout does it | 15min | TASK-301 | AC-004 |
| TASK-304 | `StatusBar` unit tests — bar present by default, absent when off, verdict/LED/stamp survive, no gap, counts in subline | 45min | TASK-303 | AC-003, AC-004, AC-016 |

---

## Phase 4 — Control UI (`homepad`) · ~2h · **BLOCKED on TASK-001**

Effort assumes resolution (a) or (b). Resolution (c) — ungating `SettingsPanel`
— adds ~3h and reopens the v11/v12 boundary work.

| Task | Description | Effort | Depends on | ACs |
|---|---|---|---|---|
| TASK-401 | Build the toggle in whichever surface TASK-001 names, per Kare's §9 | 1h | TASK-001, TASK-002, TASK-203 | AC-002 |
| TASK-402 | If resolution (a): add the "My settings" route into `UserMenu`'s My Dashboard section, non-admin reachable, preserving the v12 §4.1 admin/personal boundary | 45min | TASK-001 | AC-007 |
| TASK-403 | Control tests — label and on-state semantics, non-admin can reach and operate it, rollback surfaces on failure | 45min | TASK-401 | AC-002, AC-007, AC-010 |

---

## Phase 5 — Gates, a11y, regression · ~2h

| Task | Description | Effort | Depends on | ACs |
|---|---|---|---|---|
| TASK-501 | a11y — ≥44×44px hit target, accessible name, jest-axe clean in both states | 45min | TASK-401 | AC-014, AC-015 |
| TASK-502 | Browser gate `tests/browser-gate/health-bar-toggle.spec.ts` — hidden state at 390/1024/1440, no residual gap, incident verdict still visible with the bar off. **Use `testInfo.outputPath()` for screenshots, never an absolute path** | 1h | TASK-301 | AC-004, TC-001, TC-005 |
| TASK-503 | Regression — Gatus polling, status payload, tile badges and the v13 60s refresh unaffected | 30min | TASK-301 | AC-013 |
| TASK-504 | `/add:verify --level deploy`; fill the `Maps to:` fields in the spec's TC table | 30min | all | — |

---

## Effort Summary

| Phase | Hours | Blocked? | Parallel-safe |
|---|---|---|---|
| 0 — Unblock | 1.25 (human) | — | — |
| 1 — Backend | 3.0 | No | ✅ with Phase 2 |
| 2 — Frontend data | 2.5 | No | ✅ with Phase 1 |
| 3 — Panel render | 1.5 | No | after TASK-202 |
| 4 — Control UI | 2.0 | **Yes, OQ-1** | — |
| 5 — Gates | 2.0 | Partly | TASK-503 early |
| **Total** | **~11h** + 1.25h human | | |

**Critical path:** TASK-001 → TASK-002 → TASK-401 → TASK-403 → TASK-501 → TASK-504.
The decision, not the code, is the long pole.

### Parallelization (GA allows 5 agents via worktrees)

```
Wave 1 (immediately, no blockers):
  Agent A: TASK-101 → 102 → 103 → 104 → 105   (homepad-api)
  Agent B: TASK-201 → 202 → 203 → 204         (frontend data layer)

Wave 2 (after TASK-202):
  Agent C: TASK-301 → 302 → 303 → 304 → 503

Wave 3 (after TASK-001 + TASK-002 close):
  Agent D: TASK-401 → 402 → 403
  Agent E: TASK-501 → 502

Converge: TASK-504
```

Agents A and B touch different repos and cannot collide. Agent C depends on B's
module contract only — it can start against the signature before B's tests land.

---

## Risks

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| OQ-1 stays unresolved | **High** — it needs a product call | High — Phase 4/5 idle | Phases 1–3 (7h of the 11h) are unblocked; sequence them first |
| `auth.go:157` guard missed | Medium | High — every write 400s, masked by AC-010 rollback | Called out in TASK-104; TASK-105 tests the single-field body explicitly |
| Cache and `/api/me` disagree | Medium | Medium — stale pref sticks | `tileDensity.ts` already solved this: server wins on every resolve. Copy it, don't reinvent |
| Spec/code drift on `Status:` | Medium | Low | Known pattern here — five specs already drifted. Update the `Status:` line in the same PR |
| Coverage dips below 90% | Low | Medium — gate blocks | New code is small and test-heavy; check before pushing |
| Screenshot path hardcoded | Low | High — breaks CI for everyone | TASK-502 names the rule. `app-grid-fav-a11y-v20.spec.ts:65` is the cautionary example |

---

## Deliverables

**`homepad-api`:** `migrations/0015_show_health_bar.{up,down}.sql`,
`internal/storage/storage.go`, `internal/api/auth.go`, `internal/api/health_bar_test.go`

**`homepad`:** `src/api.ts`, `src/app/healthBarPref.ts`, `src/app/StatusBar.tsx`,
the control component (surface per OQ-1), `src/app/healthBarPref.test.ts`,
`src/app/StatusBar.test.tsx` (extended), `tests/browser-gate/health-bar-toggle.spec.ts`,
screenshots for TC-001/TC-005

**Docs:** spec `Status:` and `Maps to:` updated; `CHANGELOG.md` entry

---

## Next Steps

1. **Close TASK-001** — everything in Phase 4 waits on it
2. Dispatch Wave 1 (Agents A and B) now; it needs nothing from Phase 0
3. `/add:tdd-cycle specs/SPEC-health-bar-visibility-toggle.md` to execute
4. `/add:verify --level deploy` before the PR

## Plan History

- 2026-09-15: Initial plan created via /add:plan
