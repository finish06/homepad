# Spec: Dashboard empty and loading states

**Spec ID:** SPEC-dashboard-empty-loading
**Version:** 0.1.0
**Created:** 2026-11-25
**Author:** Claude (Caleb asked 2026-11-25 to write up M10)
**Status:** Approved — 2026-11-25 (Caleb took every recommended answer in §3). Not built
**Repo:** `Code/homepad` (web app at the root; no `api/` changes)
**Issues:** #722, #724 (dead CSS only)
**Target version:** 18.7.0
**Milestone:** M10

---

## 1. Overview

Three changes to the dashboard, plus a CSS clean-up.

1. **Loading.** The App Grid shows a skeleton of boxes and tiles, not a small floating spinner. The skeleton has the same shape as the real grid, so nothing jumps when the apps arrive.
2. **Empty box.** An admin gets a button to the App Library in every empty box. Members and kids get plain words and no button, because they can't add apps.
3. **Empty dashboard.** Members get a designed empty state. Today they get a blank page. The admin and kid empty states stay.
4. **Dead CSS.** The retired v7 and v14 selectors that nothing uses are deleted.

No new API. No change to who can do what.

## 2. Checked against the code

Checked at `f32a4b0`. Line numbers in the issues have drifted.

| Claim in the issue | What the code says |
|---|---|
| #722: AppGrid loading returns a 32px `.app-spinner` at `AppGrid.tsx:376-382` | True. It is now at `src/grid/AppGrid.tsx:383-388`. The app-level loader is at `src/app/App.tsx:148-160`, not 57-69. |
| #722: an empty box is plain text at `AppGrid.tsx:728-731` | True. Now at `src/grid/AppGrid.tsx:759-762`. Admin copy "No apps yet — add from the Library.", others "No apps in this box." |
| #722: non-admins "can add from the Library" | **Wrong.** `POST /api/library/{id}/add` is `classCatalogWrite` (`api/internal/api/server.go:344`), and the handler calls `requireAdmin` (`api/internal/api/library.go:179`). A member gets 403. `LibraryBrowse.add()` returns quietly on `!r.ok` (`src/library/LibraryBrowse.tsx:81-84`), so the member sees nothing happen. Kids can't even list the Library (`GET /api/library` is `classKidForbidden`). |
| #722: with no categories and no apps "the grid renders nothing" | Half true. AppGrid renders nothing, but `App.tsx` already shows `kid-empty` for a kid (`App.tsx:443`) and `admin-empty` for an admin (`App.tsx:452`, SPEC-backup-import B-2). Only a **member** gets a blank page. `admin-empty` borrows the `.kid-empty` class. |
| #722: `.dashboard-empty` exists at `index.css:1592` and is unused | True. Now at `src/index.css:1727-1774`, 9 rules, zero references. |
| #722: real tracks are 190px / 236px | True for Large (`.app-grid-tools`, `index.css:3587-3592`) and Compact (`index.css:4194-4196`). List is one `minmax(0, 1fr)` column with a 6px gap (`index.css:4197-4200`). Below 640px boxes stack full width and the base track is two columns (`index.css:5229-5240`). |
| #722: show "2-3 ghost boxes" | Too loose for "does not reflow". Box widths come from each category's span (3, 4, 6 or 12) and grow by app count (SPEC-pane-fill-reflow R3/R4). A fixed guess will jump. See OQ-1. |
| #722: kids could get a CTA | Kids never see an empty box. The API hides a section with no allowed app (SPEC-kid-accounts OQ-2; `visibleCategoryIDs`, `api/internal/api/categories.go:53-66`). The rule in AC-009 still covers them. |
| #724: retired selectors at lines 246, 280, 351, 1592, 2675, 2715, 2727, 2750 | Lines drifted. Now 246 (`.tile`), 280 (`.tile-icon`), 374 (`.cat-head`), 1727 (`.dashboard-empty`), 3221 (`.recently-opened-rail`), 3261 (`.tile-field`), 3273 (`.category-panel`), 3296 (`.panel-tiles`). `index.css` is 5,687 lines. |
| #724: `.recently-opened-*` is dead | **Partly wrong.** Only the v14 rail is dead: `.recently-opened-rail`, `.recently-opened-chips`, `.recently-opened-chip`. The cap3 row is live: `.recently-opened`, `-label`, `-list`, `-item`, `-icon`, `-name`, `-clear` (`AppGrid.tsx:1177-1219`). Keep those. |
| #724: `.tile` is dead | True for the app, but `tests/infra/dark-tile-shadow.test.tsx` greps `.tile` and `.dark .tile` out of `index.css`. Deleting the rules fails it. AC-016 says how it changes. |
| Not in either issue | `.cat-count` (`index.css:413-431`) is also unreferenced. #718 plans to reuse it for the box count pill, so it stays. |
| Not in either issue | The Gear shows **Add apps** to members (`src/app/AppHeader.tsx:203-212`, pinned by `gear-arrange-apps.test.tsx` TC-006). It opens a Library whose Add buttons 403. That is a separate bug; see §5. |

## 3. Open questions — decided

**Decided by Caleb on 2026-11-25: every recommended answer below is taken.** The ACs use them.

| # | Question | Recommended default |
|---|---|---|
| OQ-1 | What shape does the skeleton draw before the data arrives? | **Remember the last layout on this device.** Store each box's span and app count (capped at 12, no names or ids) in `localStorage`, the same way density is cached. Draw that. On a first visit, or when the cache is missing or bad, draw a fallback: two half boxes with 3 tiles and one full box with 4 tiles. |
| OQ-2 | When an admin adds from an empty box's button, where does the app go? | **Into that box.** `addFromLibrary` already takes a `categoryId` (`src/api.ts:597`). The Library opens with that box as its target and says so in its heading ("Add to Media"). The Gear's Add apps keeps landing apps in Uncategorized. |
| OQ-3 | An admin with boxes but no apps sees the dashboard empty state and an empty-box button in every box. Is that too many buttons (#119)? | **Hide the box buttons while `admin-empty` shows.** The boxes keep their text. Once there is one app, `admin-empty` goes and the box buttons appear. |
| OQ-4 | Should a member get a read-only "Browse the App Library" in empty states? | **No.** A member can't add, so a Library full of Add buttons that fail is worse than no button. Members get plain words. Fix the Gear for members in its own issue (§5). |

The ACs below use these answers.

## 4. Acceptance criteria

### Loading

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-001 | While AppGrid loads (`!catsLoaded \|\| svcs === null`), it renders a skeleton inside a real `.app-grid` element with the user's `data-density`. No `.app-spinner` shows in the content section. The wrapper keeps `data-testid="app-grid-loading"`. The app-level loader in `App.tsx` is unchanged. | Must |
| AC-002 | The skeleton is built from the real grid classes (`.app-grid-box`, `.app-grid-box-header`, `.app-grid-tools`, `.app-grid-tool` shell), with `--floor`, `--grow` and `--cap` set by the same helpers as real boxes (`boxWidthPx`, `contentMaxPx`, `rowFillCounts`). So every density and breakpoint rule applies to it unchanged. A ghost tile measures the same as a real tile at each density: Large 190px wide and the real Large height, Compact 236×68px, List full width × 44px with a 6px gap. This holds below 640px too. A kid's skeleton is Large, as their grid is. | Must |
| AC-003 | When the loaded layout matches the cached shape (OQ-1), loading causes no layout shift. In a real browser, the summed `layout-shift` entries from first paint of the skeleton to the loaded grid are under 0.01, at 390, 1440 and 1920px. The first box's top-left corner and the x-position of every tile column do not move. | Must |
| AC-004 | With no cache, the fallback skeleton (OQ-1) still puts the first box's top edge and the first tile column where the real grid puts them. Only box count and box height may change. | Must |
| AC-005 | The skeleton reserves the Recently opened row when this device has recent items stored. With none stored, it reserves nothing there. | Should |
| AC-006 | After each successful load, the grid writes its shape to the cache (OQ-1). The cache holds only spans and app counts. A read that throws or holds bad data falls back without error. | Should |
| AC-007 | Motion. With `prefers-reduced-motion: no-preference`, ghost shapes may shimmer (opacity only; no transform). With `reduce`, the skeleton is static: no element under it has a running animation or transition. With `prefers-reduced-transparency: reduce`, ghost boxes follow the real boxes' near-solid rule. | Must |
| AC-008 | Accessibility. The skeleton shapes are `aria-hidden`. One polite status line says "Loading dashboard…". The skeleton has no focusable element. jest-axe finds no violations. Ghost shapes meet 3:1 against the box in light and dark (WCAG 1.4.11 is not required for decoration, but they must be visible). | Must |

### Empty box

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-009 | Who sees what in an empty box. **Admin:** the line "No apps yet." and a button **Browse the App Library**. **Member and kid** (any non-admin): the line "No apps here yet. Ask an admin to add some." and no button. In edit mode the admin sees the same. While `admin-empty` shows, the admin's box buttons are hidden (OQ-3). | Must |
| AC-010 | The admin's button opens the existing App-level `LibraryBrowse` (one instance, not a second copy inside AppGrid). It opens with that box as the target. Apps added from it land in that box (OQ-2). The Gear's Add apps still adds to Uncategorized. | Must |
| AC-011 | Focus after the Library closes. If the button is still on the page, focus returns to it. If the box filled and the button is gone, focus moves to the first added tile in that box. Focus never lands on `<body>`. | Must |

### Empty dashboard

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-012 | A member with no apps sees `data-testid="member-empty"`: "No apps yet. Ask an admin to add some." No button. It uses the same look as `kid-empty` and `admin-empty`. | Must |
| AC-013 | `admin-empty` (its buttons, its import link, its testid) and `kid-empty` (its copy, its testid) are unchanged. `admin-empty-import.test.tsx` AC-032 cases still pass: a member sees no import link and no `admin-empty`. | Must |
| AC-014 | The `.dashboard-empty` rules are deleted, not revived. Empty states share the existing `.kid-empty` style. | Should |

### Dead CSS (#724)

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-015 | These rules are deleted from `src/index.css`, with their `.dark` variants and media-query copies: `.tile`, `.tile:hover`, `.tile-icon`, `.tile:hover .tile-icon`, `.cat-head`, `.cat-head::before`, `.dashboard-empty` and its `-art`, `-title`, `-sub`, `-cta` parts, `.recently-opened-rail`, `.recently-opened-chips` (and its `::-webkit-scrollbar`), `.recently-opened-chip`, `.tile-field`, `.category-panel`, `.panel-tiles`. In the reduced-motion block at `index.css:1153-1166`, only the `.tile` and `.tile-icon` lines go; `.user-avatar` stays. Live rules stay: the cap3 `.recently-opened*` row, `.cat-count`, `.app-spinner`. Comments that point at deleted rules as a reference (`index.css:183-185`, `3341`, `3600`; `src/grid/appGridLayout.ts:7`) are reworded. | Must |
| AC-016 | `tests/infra/dark-tile-shadow.test.tsx` (#93) stops reading `.tile`. It is retargeted to the live tile: `.dark .app-grid-tool` sets its own `box-shadow`, and `--v-shadow-tile` has a different value under `.dark` than in light mode (today 0.28 vs 0.1 alpha). The #93 guard keeps working on the tile people see. | Must |
| AC-017 | A new source-contract test fails if any selector deleted in AC-015 comes back in `src/index.css`, or if any of them is used as a class in `src/**` or `index.html`. | Should |

### Gates

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-018 | The bundle budgets are not raised: `ENTRY_JS_GZIP_BUDGET = 105_000` and `ENTRY_CSS_GZIP_BUDGET = 20_500` (`tests/infra/bundle-budget.test.ts:147-148`), and both pass. The overflow and centring browser gates stay green unchanged: `header-search-centered.spec.ts` (centred, no overflow per role), `app-grid-fixed-tiles.spec.ts` (no horizontal scroll at 1280px), `app-grid-pane-fill.spec.ts` (fill and the 3840px centred cluster), `kid-board-ipad.spec.ts`. | Must |

## 5. Out of scope

- The accent decision (#724 options A and B), token consolidation, and splitting `index.css`. Those wait for Caleb's call on #724.
- Fixing **Add apps** for members in the Gear. It opens a Library whose Add buttons 403. File it as its own issue: either hide it for members or make the Library read-only for them. This spec does not change the Gear.
- Any change to who can add apps. The API's role rules stay as they are.
- A skeleton for the app-level loader (`App.tsx:148-160`), Settings, the Library or the launcher.
- Group header count pills and collapsing (#718).

## 6. Test plan

Each AC with code has a test that fails before its change.

- AC-001: `src/grid/AppGrid.test.tsx` — loading renders `app-grid-loading` inside `.app-grid` with `data-density`, and no `.app-spinner`.
- AC-002: `tests/browser-gate/app-grid-skeleton.spec.ts` — measure ghost and real tile rects at Large, Compact and List, at 390 and 1440px, and a kid at Large. Widths and heights match within 1px.
- AC-003, AC-004, AC-005: `tests/browser-gate/app-grid-skeleton.spec.ts` — hold the mocked `/api/services` response, observe `layout-shift` with a `PerformanceObserver`, release it, then sum the shifts. Compare the first box corner and tile column x-positions before and after. Run once with a matching cache and once with none, and once with recent items stored.
- AC-006: `src/grid/gridShapeCache.test.ts` — writes spans and counts only; a throwing or junk read falls back.
- AC-007: `tests/browser-gate/app-grid-skeleton.spec.ts` — `page.emulateMedia({ reducedMotion: 'reduce' })`, then `document.getAnimations()` on the skeleton is empty and computed `animation-name` is `none`. A second case with `no-preference` checks the shimmer uses opacity only.
- AC-008: `src/grid/AppGrid.test.tsx` — jest-axe on the loading state, one status line, no focusable element. Contrast of the ghost fill is measured in the browser-gate run, light and dark.
- AC-009: `src/grid/AppGrid.test.tsx` — replace the two copy cases at lines 246-258 with admin (button), member (no button) and kid (no button) cases, and the hidden-button case while `admin-empty` shows.
- AC-010, AC-011: `src/app/App.overlay-wiring.test.tsx` — the box button opens the one `LibraryBrowse` with the box's id; an add sends that `categoryId`; focus returns to the button, or to the first new tile when the box filled.
- AC-012, AC-013: `src/app/admin-empty-import.test.tsx` — a member-empty case; the existing AC-032 cases unchanged.
- AC-014, AC-015, AC-017: `tests/infra/retired-css.test.ts` (new) — no deleted selector in `src/index.css`, no class use in `src/**` or `index.html`; the live `.recently-opened` row, `.cat-count` and `.app-spinner` rules are still there.
- AC-016: `tests/infra/dark-tile-shadow.test.tsx` — retargeted as above.
- AC-018: `tests/infra/bundle-budget.test.ts` unchanged, plus the four named browser-gate specs unchanged.

Gates: `npm run lint`, `npm run build`, `npx vitest run`, `npm run test:gate`, `npm run test:e2e`.
