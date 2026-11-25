# Milestone: M4 — Accessibility debt

**Target Maturity:** GA (maintain)
**Status:** COMPLETE
**Horizon:** DONE
**Started:** 2026-11-24 (the 18.3.0 cleanup, #703)
**Completed:** 2026-11-25 (the last item, #477, shipped in 18.6.0 and is in production)
**Created:** 2026-10-11 — from the backlog triage that closed 26 of 71 open issues with evidence (see `.add/handoff.md`)

## Goal

Meet WCAG AA everywhere homepad is used, starting with the one issue marked major: the dark-mode login.

## Success Criteria

- [x] #379: login in **dark mode** meets AA. Already fixed by the v27 login restyle (d3a0b2a, #381), and now pinned by a real-browser gate: `tests/browser-gate/a11y-touch-v19.spec.ts` "v19 login @768 DARK" (added in #729) measures the labels, subtitle, "Create account", "or", PocketID and the typed text in the input, and fails if the field is a light slab. Measured 2026-11-25: 5.9:1 to 15.5:1
- [x] #262 / #263: the shared `.status-dot` has a definition ring that meets 3:1, and its glow follows its state (UNKNOWN has no glow). 18.3.0, #703 (SPEC-ui-cleanup-18.3.0 AC-001, AC-002; `tests/browser-gate/status-dot-shared-262-263.spec.ts`)
- [x] #187: avatar hover covers the full target. No longer true: the avatar disc is now 44×44, the same size as its button. Closed in the #703 triage
- [x] #513: the ★ and edit-pencil hit areas never take each other's taps, at every density. 18.3.0, #703 (AC-007; `tests/browser-gate/fav-edit-hit-areas-513.spec.ts` hit-tests Large, Compact and List)
- [x] #375 / #376: #375 no longer true (18.1.0 replaced the env-config viewer; the error is never inside a `<dl>`). #376 fixed in 18.3.0, #703 (AC-005): the uptime switch is outside any `aria-busy` element while settings load
- [x] #477: sparkline keyboard focus. Decided by Caleb on 2026-11-24 (specs/DECISIONS.md): cap4 AC-006 withdrawn, because the dots sit inside the tile link. Instead the tile link gets a short description, such as "Last 20 checks: 19 up, 1 down". 18.6.0, #711
- [x] #488: settings copy. Decided by Caleb (SPEC-decisions-18.4.0): a one-line hint under "Show uptime display" says what it shows at each density. 18.4.0, #707

## Appetite

Planned as one to two cycles, with #477 waiting on Kare. As run: Caleb decided #477 without a design pass, and M4 had no cycles of its own. Everything landed in the 18.3.0, 18.4.0 and 18.6.0 cleanups.

## Features

### Feature Detail

| Feature | Spec | Position | Status | Cycle |
|---------|------|----------|--------|-------|
| Dark-mode login | — | DONE | #379 — fixed earlier (#381); dark gate added in #729 | — |
| Shared status dot | [SPEC-ui-cleanup-18.3.0](../../specs/SPEC-ui-cleanup-18.3.0.md) | DONE | #262 #263 — 18.3.0 | — |
| Avatar hover target | — | DONE | #187 — no longer true (44px disc) | — |
| ★ / edit-pencil hit areas overlap at compact & list | [SPEC-ui-cleanup-18.3.0](../../specs/SPEC-ui-cleanup-18.3.0.md) AC-007 | DONE | **#513** — 18.3.0, real-browser gate at every density | — |
| Env-config semantics | [SPEC-ui-cleanup-18.3.0](../../specs/SPEC-ui-cleanup-18.3.0.md) | DONE | #375 obsolete (18.1.0), #376 18.3.0 | — |
| Sparkline keyboard focus | [SPEC-cleanup-18.6.0](../../specs/SPEC-cleanup-18.6.0.md) | DONE | #477 — AC-006 withdrawn; text description instead, 18.6.0 | — |
| Settings copy | [SPEC-decisions-18.4.0](../../specs/SPEC-decisions-18.4.0.md) | DONE | #488 — hint added, 18.4.0 | — |

Every issue listed here was **re-checked against `main` at `57733eb` on 2026-10-11** and is still true. Issues that turned out to be fixed, obsolete or duplicates were closed with evidence rather than carried in.

## Dependencies

- **Kare** for #477 placement and the #379 design treatment.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Contrast fixes measured on the source, not the rendered page | MED | MED | Every fix verified in a real browser (L-005) |
| Waiting on design stalls the whole milestone | MED | LOW | Ship the measurable fixes first; #477 and #488 don't block the rest |

## Cycles

| Cycle | Features Advanced | Status | Outcome |
|-------|-------------------|--------|---------|
| — | — | — | No cycles of its own. Done through the 18.3.0 (#703), 18.4.0 (#707) and 18.6.0 (#711) cleanups |

## Retrospective Notes

Closed 2026-11-25. All 9 issues are closed: 4 fixed in code (#262, #263, #513, #376), 3 already fixed or no longer true (#379, #187, #375), and 2 decided by Caleb and then built (#477, #488). #379 had no automated check in dark mode, so #729 added one to the v19 gate.
