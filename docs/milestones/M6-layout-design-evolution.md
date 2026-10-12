# Milestone: M6 — Layout & design evolution

**Target Maturity:** GA (maintain)
**Status:** NOT_STARTED
**Horizon:** LATER
**Started:** TBD
**Completed:** TBD
**Created:** 2026-10-11 — from the backlog triage that closed 26 of 71 open issues with evidence (see `.add/handoff.md`)

## Goal

Design-led improvements to how the grid uses space and reads at a glance, led by Kare. Exploratory — each item is a decision before it is an implementation.

## Success Criteria

- [ ] Kare re-reviews #192 (the v12.4.0 review, five blockers) against the current UI, and closes what the v15+ redesign already superseded
- [ ] #269 wide-viewport pane fill — decided and, if kept, implemented
- [ ] #206, #352 and #348 each decided
- [ ] #403 resolved: spec §8.4 requires an explicit drop placeholder, but the build uses dnd-kit's in-place behaviour — align one with the other
- [ ] #346 bento-grid exploration reaches a go/no-go

## Appetite

Exploratory. Budget set per item with Kare; stop on a no-go rather than polishing.

## Features

### Feature Detail

| Feature | Spec | Position | Status | Cycle |
|---------|------|----------|--------|-------|
| Old design review re-check | — | SHAPED | #192 | — |
| Wide-viewport pane fill | specs/SPEC-pane-fill-reflow.md | SHAPED | #269 | — |
| Grid voids, icon hue, measured corrections | — | SHAPED | #206 #352 #348 | — |
| Drop placeholder: spec vs build | specs/v28-tile-drag-reorder.md §8.4 | SHAPED | #403 | — |
| Bento-grid exploration | — | SHAPED | #346 | — |

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
| — | — | — | Not yet started |

## Retrospective Notes

Filled in when the milestone completes.
