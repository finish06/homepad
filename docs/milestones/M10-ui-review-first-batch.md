# Milestone: M10 — UI review, first batch (18.7.0)

**Target Maturity:** GA (maintain)
**Status:** COMPLETE
**Horizon:** DONE
**Started:** 2026-11-25 (#735 and #736 built in parallel)
**Completed:** 2026-11-26 (18.7.0 in production at `fd60fa7`, 14:39Z)
**Created:** 2026-11-25, on Caleb's go, from the 2026-11-24 UI review enhancements (#717–#726). The ranking is in the review comments on each issue.

## Goal

Ship the three highest-ranked UI review items as 18.7.0. They are small polish fixes, a dashboard that no longer jumps while it loads or sits blank when empty, and group headers that show what is inside and can fold away. No new pages and no API change unless a spec says so.

## Success Criteria

- [x] #725: the seven quick wins ship, or each one is dropped with a reason in its spec ([SPEC-ui-quick-wins](../../specs/SPEC-ui-quick-wins.md))
- [x] #722: the dashboard loads into a skeleton at the real grid size with no reflow, and every empty state has a working action for the roles that can use it ([SPEC-dashboard-empty-loading](../../specs/SPEC-dashboard-empty-loading.md))
- [x] #724 (dead CSS only): the retired, unreferenced selectors are deleted. The accent decision and the `index.css` split stay in #724
- [x] #718: every group header shows its app count and a status bar, and groups fold and unfold. The folded state is saved per user through the existing collapse API ([SPEC-group-header-collapse](../../specs/SPEC-group-header-collapse.md))
- [x] The inline theme script in `index.html` is unchanged, so the CSP hash in the image and the homelab ConfigMap still matches (SPEC-cleanup-18.6.0 §7)
- [x] The bundle budget, overflow and centring gates, the #513 hit-area gate and the v19 contrast gates stay green
- [x] 18.7.0 is in production

## Appetite

One cycle, about a week. #722 and #725 are small and can start together, under the file plan below. #718 is medium and starts once #722 has merged, because it builds on #722's loading predicate and skeleton cache.

## Features

### Feature Detail

| Feature | Spec | Position | Status | Cycle |
|---------|------|----------|--------|-------|
| UI quick wins | [SPEC-ui-quick-wins](../../specs/SPEC-ui-quick-wins.md) | SHIPPED | #725 — #735, #740 (18.7.0) | — |
| Dashboard empty and loading states | [SPEC-dashboard-empty-loading](../../specs/SPEC-dashboard-empty-loading.md) | SHIPPED | #722 + #724 dead CSS — #736 (18.7.0) | — |
| Group header count, status bar and folding | [SPEC-group-header-collapse](../../specs/SPEC-group-header-collapse.md) | SHIPPED | #718 — #746, #753 (18.7.0) | — |

## Not in M10

These stay open on Gitea, in ranked order, for a later milestone: #720 (health panel triage, which also takes #726 item 2), #719, #717, #721, #723, #724 (the accent decision is Caleb's: A or B) and #726 (decide, don't build).

## Dependencies

- Caleb answered every spec's open questions on 2026-11-25 (`specs/DECISIONS.md`).
- Kare checks the DOWN/DEGRADED shapes (#725) and the group status bar (#718) on a real screen during the build.
- #718 depends on #722. It widens #722's one loading predicate (SPEC-dashboard-empty-loading §3.2) and fills the skeleton cache's `collapsed` field (§3.1).

### Files each spec changes

Source files only. Tests named in each spec's test plan follow their source file's owner.

| File | #725 | #722 | #718 |
|---|---|---|---|
| `src/index.css` | `color-scheme` on `:root` / `.dark`; pip shapes in `.app-grid-tool-status` | skeleton rules; deletes the dead #724 rules | header chevron, pill, badge, bar |
| `src/grid/AppGrid.tsx` | — | skeleton; new props `userId`, `onAddToBox(box, opener)` and `dashboardEmpty`; empty-box copy and button; `data-service-id` on the tile wrapper; focusable box heading; debounced cache write, cancelled on unmount | header; new prop `isKid`; collapse state, `confirmed`/`desired`, `collapsedReady` |
| `src/app/App.tsx` | `onView` for `ToastContainer` | `userId`, `onAddToBox` and `dashboardEmpty` on `<AppGrid>`; one `dashboardEmpty` value for `admin-empty`, `member-empty` and the prop; `browseTarget` state, added ids, `targetCategory` to `LibraryBrowse` and focus return on close; sign-out cancels the pending cache write, then clears the key | `isKid` on `<AppGrid>` (one line) |
| `src/library/LibraryBrowse.tsx` | groups and the Added filter | `targetCategory` heading and `categoryId` | — |
| `src/grid/gridShapeCache.ts` (new) | — | creates it, with `cancelPendingShapeWrite()` | writes real `collapsed` |
| `src/app/StatusBar.tsx` | — | — | imports the shared band module |
| `src/lib/statusBands.ts` (new) | — | — | creates it |
| `src/api.ts` | — | — | collapse client functions |
| `src/grid/appGridLayout.ts` | — | one comment reworded | — |
| `src/app/AppHeader.tsx` | freshness button, Gear arrows, no "Add apps" for members | — | — |
| `src/app/UserMenu.tsx`, `src/ui/useMenuKeys.ts` (new) | arrow keys | — | — |
| `src/alerts/Toasts.tsx` | pause, dismiss, View | — | — |
| `src/services.tsx` | one in-flight `refresh()` | — | — |
| `src/theme/browserChrome.ts` (new), `src/theme/theme.tsx`, `src/theme/accent.ts` | `theme-color` | — | — |
| `src/app/AuthForm.tsx` | show password, Caps Lock, re-announce | — | — |

Shared files: `src/index.css` and `src/app/App.tsx` (all three), `src/library/LibraryBrowse.tsx` (#725 and #722), `src/grid/AppGrid.tsx` and `src/grid/gridShapeCache.ts` (#722 and #718). The shared tests follow the same pairs: `src/app/App.overlay-wiring.test.tsx` and `src/library/LibraryBrowse.test.tsx` (#725, #722), `src/grid/gridShapeCache.test.ts` and `tests/browser-gate/app-grid-skeleton.spec.ts` (#722, #718).

### Build order and file reservations (L-023)

1. **#722 and #725 build in parallel.** #722 owns `src/grid/AppGrid.tsx` and `src/grid/gridShapeCache.ts`. In the three shared files each touches only its own part from the table above: #725 never edits the empty states, the `<AppGrid>` element, the `LibraryBrowse` element and its state, or `LibraryBrowse`'s heading and `add()`; #722 never edits `ToastContainer`, the pip rules or `LibraryBrowse`'s list rendering.
2. **#722 merges first.** #725 then rebases onto it and resolves `src/index.css`, `src/app/App.tsx` and `src/library/LibraryBrowse.tsx`. The #725 builder does the rebase.
3. **#718 starts after #722 merges**, on top of it. It owns `src/grid/AppGrid.tsx`, `src/grid/gridShapeCache.ts`, `src/app/StatusBar.tsx` and `src/api.ts`. In `src/app/App.tsx` it adds only the `isKid` prop to the `<AppGrid>` element that #722 already changed, so it never meets #722 there. It shares `src/index.css` (different rules) and `src/app/App.tsx` (the `<AppGrid>` element vs `ToastContainer`) with #725.
4. The planned merge order is #722, #725, #718. If #725 runs late, #718 may merge before it, and the #725 builder rebases once more. Whoever rebases also resolves the `CHANGELOG.md` lines.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Editing the inline theme script breaks the CSP in prod | LOW | HIGH | theme-color and color-scheme change from bundled JS only; a test pins the script hash |
| Parallel builds conflict in `index.css`, `App.tsx`, `LibraryBrowse.tsx` or `AppGrid.tsx` | MED | LOW | The file plan above: reservations, a fixed merge order, and a named rebaser |
| Header additions crowd the edit controls at 390px | MED | MED | Real-browser gate at every density and at 390px |

## Cycles

| Cycle | Features Advanced | Status | Outcome |
|-------|-------------------|--------|---------|
| — | — | — | No ADD cycle. Three workstreams, one Opus agent per spec, merged #735, #736, #740, #746, #753; release #758 |

## Left over

- Kare's checks on a real screen: the DOWN and DEGRADED pip shapes (#725), the skeleton and empty-box button (#722), and the group status bar (#718). Shipped without them.
- #745: the health panel grows as services load and shifts the page (found during #722).
- Open question for Caleb (SPEC-group-header-collapse §10): after one failed or slow load of the saved folds, saving stays off for that visit. Should a late reply or a retry turn it back on?
- SPEC-group-header-collapse §10 item 8: a fold made just before a restore or import reloads the grid can be lost.
- #724 (accent A or B, the `index.css` split) and the rest of #717–#726 stay open.

## Retrospective Notes

- Three parallel builds under one file plan (reservations, a fixed merge order, a named rebaser) all merged in a day and a half.
- The approved spec carried a data-loss rule (§3.5: a failed load let the next fold overwrite the saved set). Code review flagged it, the builder kept it because it was approved, and it took a follow-up PR (#753) on Caleb's call. A spec rule that review calls data loss is worth escalating before merge, not after.
- Code review on #753 went four rounds; the fourth partly asked to undo the third. Once the status is green, answering on the PR and stopping was right.
