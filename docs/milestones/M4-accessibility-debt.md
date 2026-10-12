# Milestone: M4 — Accessibility debt

**Target Maturity:** GA (maintain)
**Status:** NOT_STARTED
**Horizon:** NEXT
**Started:** TBD
**Completed:** TBD
**Created:** 2026-10-11 — from the backlog triage that closed 26 of 71 open issues with evidence (see `.add/handoff.md`)

## Goal

Meet WCAG AA everywhere homepad is used, starting with the one issue marked major: the dark-mode login.

## Success Criteria

- [ ] #379: login in **dark mode** meets AA (labels and inputs ≥4.5:1), measured in a real-browser gate. The v19 gate measures light mode only
- [ ] #262 / #263: the shared `.status-dot` — still used by the command launcher and alert history — meets 3:1 non-text contrast, and UNKNOWN no longer gets the danger glow
- [ ] #187: avatar hover covers the full 44px target, not just the inner disc
- [ ] #375 / #376: env-config `<dl>` conformance and a correctly scoped `aria-busy`
- [ ] #477: sparkline dots are keyboard-focusable (placement needs Kare)
- [ ] #488: decision on the settings copy for Show uptime display + Tile density

## Appetite

One to two cycles; #477 waits on Kare.

## Features

### Feature Detail

| Feature | Spec | Position | Status | Cycle |
|---------|------|----------|--------|-------|
| Dark-mode login | — | SHAPED | #379 — major | — |
| Shared status dot | — | SHAPED | #262 #263 | — |
| Avatar hover target | — | SHAPED | #187 | — |
| Env-config semantics | — | SHAPED | #375 #376 | — |
| Sparkline keyboard focus | specs/cap4 (AC-006) | SHAPED | #477 — needs Kare | — |
| Settings copy | — | SHAPED | #488 — decision | — |

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
| — | — | — | Not yet started |

## Retrospective Notes

Filled in when the milestone completes.
