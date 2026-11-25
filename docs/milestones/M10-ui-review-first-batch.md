# Milestone: M10 — UI review, first batch (18.7.0)

**Target Maturity:** GA (maintain)
**Status:** NOT_STARTED (specs approved 2026-11-25; ready to build)
**Horizon:** NOW
**Started:** TBD
**Completed:** TBD
**Created:** 2026-11-25, on Caleb's go, from the 2026-11-24 UI review enhancements (#717–#726). The ranking is in the review comments on each issue.

## Goal

Ship the three highest-ranked UI review items as 18.7.0. They are small polish fixes, a dashboard that no longer jumps while it loads or sits blank when empty, and group headers that show what is inside and can fold away. No new pages and no API change unless a spec says so.

## Success Criteria

- [ ] #725: the seven quick wins ship, or each one is dropped with a reason in its spec ([SPEC-ui-quick-wins](../../specs/SPEC-ui-quick-wins.md))
- [ ] #722: the dashboard loads into a skeleton at the real grid size with no reflow, and every empty state has a working action for the roles that can use it ([SPEC-dashboard-empty-loading](../../specs/SPEC-dashboard-empty-loading.md))
- [ ] #724 (dead CSS only): the retired, unreferenced selectors are deleted. The accent decision and the `index.css` split stay in #724
- [ ] #718: every group header shows its app count and a status bar, and groups fold and unfold. The folded state is saved per user through the existing collapse API ([SPEC-group-header-collapse](../../specs/SPEC-group-header-collapse.md))
- [ ] The inline theme script in `index.html` is unchanged, so the CSP hash in the image and the homelab ConfigMap still matches (SPEC-cleanup-18.6.0 §7)
- [ ] The bundle budget, overflow and centring gates, the #513 hit-area gate and the v19 contrast gates stay green
- [ ] 18.7.0 is in production

## Appetite

One cycle, about a week. #725 and #722 are small and can go first, in parallel. #718 is medium.

## Features

### Feature Detail

| Feature | Spec | Position | Status | Cycle |
|---------|------|----------|--------|-------|
| UI quick wins | [SPEC-ui-quick-wins](../../specs/SPEC-ui-quick-wins.md) | SPECCED | #725 — approved 2026-11-25 | — |
| Dashboard empty and loading states | [SPEC-dashboard-empty-loading](../../specs/SPEC-dashboard-empty-loading.md) | SPECCED | #722 + #724 dead CSS — approved 2026-11-25 | — |
| Group header count, status bar and folding | [SPEC-group-header-collapse](../../specs/SPEC-group-header-collapse.md) | SPECCED | #718 — approved 2026-11-25; Kare checks the bar | — |

## Not in M10

These stay open on Gitea, in ranked order, for a later milestone: #720 (health panel triage, which also takes #726 item 2), #719, #717, #721, #723, #724 (the accent decision is Caleb's: A or B) and #726 (decide, don't build).

## Dependencies

- Caleb answered every spec's open questions on 2026-11-25 (all recommended answers taken; specs/DECISIONS.md).
- Kare checks the DOWN/DEGRADED shapes (#725) and the group status bar (#718) on a real screen during the build.
- The specs touch different files, except `src/index.css` and `src/grid/AppGrid.tsx`, which #722 and #718 both change. Build #722 first, or reserve those files per agent.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Editing the inline theme script breaks the CSP in prod | LOW | HIGH | theme-color and color-scheme change from bundled JS only; a test pins the script hash |
| #722 and #718 conflict in `AppGrid.tsx` and `index.css` | MED | LOW | Build in order, or reserve files |
| Header additions crowd the edit controls at 390px | MED | MED | Real-browser gate at every density and at 390px |

## Cycles

| Cycle | Features Advanced | Status | Outcome |
|-------|-------------------|--------|---------|
| — | — | — | Not yet started |

## Retrospective Notes

Filled in when the milestone completes.
