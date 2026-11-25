# Milestone: M6 — Layout & design evolution

**Target Maturity:** GA (maintain)
**Status:** COMPLETE
**Horizon:** DONE
**Started:** 2026-11-24 (the 18.3.0 triage, #703)
**Completed:** 2026-11-25 (every item decided; the last decisions are recorded in specs/DECISIONS.md and 18.6.0)
**Created:** 2026-10-11 — from the backlog triage that closed 26 of 71 open issues with evidence (see `.add/handoff.md`)

## Goal

Design-led improvements to how the grid uses space and reads at a glance, led by Kare. Exploratory — each item is a decision before it is an implementation.

## Success Criteria

- [x] #192 re-reviewed: every blocker (#188–#191, #182) and the advisory (#185) were already closed. Closed in the #703 triage
- [x] #269 wide-viewport pane fill: already shipped (SPEC-pane-fill-reflow, v13.2.0 and v13.3.0, gate `tests/browser-gate/app-grid-pane-fill.spec.ts`). Closed in the #703 triage
- [x] #206 no longer true (the App Grid replaced `Catalog.tsx`; the Recently Opened icon has a plate). #348 done (#351 landed). #352 decided by Caleb: keep the per-service icon hue (specs/DECISIONS.md, SPEC-decisions-18.4.0)
- [x] #403 decided by Caleb: keep dnd-kit's in-place shift, which v28 §8.4 allows. A placeholder is built only if a real iPad test shows the drop spot is unclear (specs/DECISIONS.md)
- [x] #346 bento grid: no-go for now. Caleb parked it; Kare's brief and mockups stay on the issue (specs/DECISIONS.md)

## Appetite

Exploratory. Budget set per item with Kare; stop on a no-go rather than polishing.

## Features

### Feature Detail

| Feature | Spec | Position | Status | Cycle |
|---------|------|----------|--------|-------|
| Old design review re-check | — | DONE | #192 — all blockers already closed | — |
| Wide-viewport pane fill | specs/SPEC-pane-fill-reflow.md | DONE | #269 — shipped in v13.2.0/v13.3.0 | — |
| Grid voids, icon hue, measured corrections | [SPEC-decisions-18.4.0](../../specs/SPEC-decisions-18.4.0.md) | DONE | #206 obsolete, #348 done, #352 decided (per-service hue) | — |
| Drop placeholder: spec vs build | specs/v28-tile-drag-reorder.md §8.4 | DONE | #403 — decided: keep the in-place shift | — |
| Bento-grid exploration | — | DONE | #346 — parked (no-go for now) | — |

Every issue listed here was **re-checked against `main` at `57733eb` on 2026-10-11** and is still true. Issues that turned out to be fixed, obsolete or duplicates were closed with evidence rather than carried in.

## Dependencies

- **Kare** leads; nothing here moves without design.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Exploration never converges | MED | LOW | Each item ends in a decision, recorded on its issue |
| Layout changes regress the guards built this quarter | MED | MED | The bundle budget, overflow and centring gates must stay green |

## Cycles

| Cycle | Features Advanced | Status | Outcome |
|-------|-------------------|--------|---------|
| — | — | — | No cycles of its own. Settled in the 18.3.0 triage (#703) and Caleb's 2026-11-24 decisions (18.4.0 #707, 18.6.0 #711) |

## Retrospective Notes

Closed 2026-11-25. All 7 issues are closed: 4 were already done or no longer true (#192, #269, #206, #348), and 3 were decided by Caleb with no build (#352, #403, #346).

Nothing is carried. Two things could come back as new work: a drop placeholder if the iPad test shows it is needed (#403), and the bento grid as a new product spec (#346). New design work comes from the UI review enhancements (#717–#726).
