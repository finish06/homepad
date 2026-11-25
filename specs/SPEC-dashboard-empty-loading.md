# Spec: Dashboard empty and loading states

**Spec ID:** SPEC-dashboard-empty-loading
**Version:** 0.3.0
**Created:** 2026-11-25
**Author:** Claude (Caleb asked 2026-11-25 to write up M10)
**Status:** Approved — 2026-11-25 (Caleb's answers are in §3). Not built
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
| #722: AppGrid loading returns a 32px `.app-spinner` at `AppGrid.tsx:376-382` | True. It is now at `src/grid/AppGrid.tsx:382-388`, gated on `loading` (`AppGrid.tsx:204`). The app-level loader is at `src/app/App.tsx:148-160`, not 57-69. |
| #722: an empty box is plain text at `AppGrid.tsx:728-731` | True. Now at `src/grid/AppGrid.tsx:759-762`. Admin copy "No apps yet — add from the Library.", others "No apps in this box." |
| #722: non-admins "can add from the Library" | **Wrong.** `POST /api/library/{id}/add` is `classCatalogWrite` (`api/internal/api/server.go:344`), and the handler calls `requireAdmin` (`api/internal/api/library.go:179`). A member gets 403. `LibraryBrowse.add()` returns quietly on `!r.ok` (`src/library/LibraryBrowse.tsx:81-84`), so the member sees nothing happen. Kids can't even list the Library (`GET /api/library` is `classKidForbidden`). |
| #722: with no categories and no apps "the grid renders nothing" | Half true. AppGrid renders nothing, but `App.tsx` already shows `kid-empty` for a kid (`App.tsx:443`) and `admin-empty` for an admin (`App.tsx:452`, SPEC-backup-import B-2). Only a **member** gets a blank page. `admin-empty` borrows the `.kid-empty` class. |
| #722: `.dashboard-empty` exists at `index.css:1592` and is unused | True. Now at `src/index.css:1727-1774`, 9 rules, zero references. |
| #722: real tracks are 190px / 236px | True for Large (`.app-grid-tools`, `index.css:3587-3592`) and Compact (`index.css:4194-4196`). List is one `minmax(0, 1fr)` column with a 6px gap (`index.css:4197-4200`). Below 640px boxes stack full width and the base track is two columns (`index.css:5229-5240`). |
| #722: show "2-3 ghost boxes" | Too loose for "does not reflow". Box widths come from each category's span (3, 4, 6 or 12) and grow by app count (SPEC-pane-fill-reflow R3/R4). `--grow` is the full `box.tools.length` and `--cap` is `contentMaxPx(box.tools.length)` with no clamp (`AppGrid.tsx:596-601`), so the skeleton needs each box's exact app count, not a capped one. A fixed guess will jump. See OQ-1. |
| Not in either issue | AppGrid has no user id today; its props are `isAdmin`, `editMode`, `showUptimeDisplay`, `density` (`AppGrid.tsx:125-140`). `App.tsx` has `user.id`. The per-user cache (OQ-1) needs a new `userId` prop. The Recently opened row is per device (`src/lib/recentlyOpened.ts`) and shows only when a stored id resolves to an app this user can see (`AppGrid.tsx:433`, `RecentlyOpenedRow`), so the skeleton can't tell from the stored list alone whether the row will show. |
| #722: kids could get a CTA | Kids never see an empty box. The API hides a section with no allowed app (SPEC-kid-accounts OQ-2; `visibleCategoryIDs`, `api/internal/api/categories.go:53-66`). The rule in AC-009 still covers them. |
| #724: retired selectors at lines 246, 280, 351, 1592, 2675, 2715, 2727, 2750 | Lines drifted. Now 246 (`.tile`), 280 (`.tile-icon`), 374 (`.cat-head`), 1727 (`.dashboard-empty`), 3221 (`.recently-opened-rail`), 3261 (`.tile-field`), 3273 (`.category-panel`), 3296 (`.panel-tiles`). `index.css` is 5,687 lines. |
| #724: `.recently-opened-*` is dead | **Partly wrong.** Only the v14 rail is dead: `.recently-opened-rail`, `.recently-opened-chips`, `.recently-opened-chip`. The cap3 row is live: `.recently-opened`, `-label`, `-list`, `-item`, `-icon`, `-name`, `-clear` (`AppGrid.tsx:1177-1219`). Keep those. |
| #724: `.tile` is dead | True for the app, but `tests/infra/dark-tile-shadow.test.tsx` greps `.tile` and `.dark .tile` out of `index.css`. Deleting the rules fails it. AC-016 says how it changes. |
| Not in either issue | `.cat-count` (`index.css:413-431`) is also unreferenced. #718 plans to reuse it for the box count pill, so it stays. |
| Not in either issue | The Gear shows **Add apps** to members (`src/app/AppHeader.tsx:202-211`, pinned by `gear-arrange-apps.test.tsx` TC-006). It opens a Library whose Add buttons 403. Decided 2026-11-25: members lose "Add apps" in the Gear. That fix is in SPEC-ui-quick-wins AC-017, also in M10; this spec doesn't change the Gear. |

## 3. Open questions — decided

Decided by Caleb on 2026-11-25 (`specs/DECISIONS.md`). The ACs use these answers.

| # | Question | Decision |
|---|---|---|
| OQ-1 | What shape does the skeleton draw before the data arrives? | **Remember the last layout on this device.** §3.1 says what is stored. On a first visit, or when the cache is missing, bad or for another user, draw a fallback: two half boxes with 3 tiles and one full box with 4 tiles. |
| OQ-2 | When an admin adds from an empty box's button, where does the app go? | **Into that box.** `addFromLibrary` already takes a `categoryId` (`src/api.ts:597`). The Library opens with that box as its target and says so in its heading ("Add to Media"). The Gear's Add apps keeps landing apps in Uncategorized. §3.3 says how this fits the Library grouping from SPEC-ui-quick-wins. |
| OQ-3 | An admin with boxes but no apps sees the dashboard empty state and an empty-box button in every box. Is that too many buttons (#119)? | **Hide the box buttons while `admin-empty` shows.** The boxes keep their text. Once there is one app, `admin-empty` goes and the box buttons appear. The same intent covers members: while `member-empty` shows, the boxes drop their "Ask an admin" line, so the ask is made once, by `member-empty` (AC-021). |
| OQ-4 | Should a member get a read-only "Browse the App Library" in empty states? | **No.** A member can't add, so a Library full of Add buttons that fail is worse than no button. Members get "Ask an admin" text. The Gear fix for members is SPEC-ui-quick-wins AC-017 (§5). |

### 3.1 The skeleton cache

- One `localStorage` key, `homepad.gridShape`, holds one entry: `{ v: 1, user: "<user id>", recent: true|false, boxes: [{ span, count, collapsed }, ...] }`. Boxes are in render order, Uncategorized included.
- `span` is the box's width (3, 4, 6 or 12). `count` is the exact number of apps the user sees in the box, not capped, because `--grow` and `--cap` use the full count. `collapsed` is whether the box drew folded (SPEC-group-header-collapse). `recent` is whether the Recently opened row drew.
- No box names, box ids, app names or app ids are stored. The user id is stored only to tell whose shape it is.
- AppGrid gets a new `userId` prop from `App.tsx` (`user.id`). It reads the entry only if `user` equals `userId`. Any other entry counts as missing: the fallback draws, and the next successful load overwrites it. So a kid who signs in after an admin on a shared iPad never sees the admin's box shape.
- AppGrid writes the entry, under its own `userId`, whenever the rendered shape changes: when `loading` turns false, and after any change to the boxes or their apps (a box added, deleted or resized, an app added, removed or moved between boxes, the Recently opened row appearing or going, and once #718 ships a box folded or unfolded). It compares the new entry with the last one written and skips equal ones. Writes are debounced by 500 ms, so a burst of changes is one write.
- It does not write while `arranging` is on (arrange mode, members and admins), because every box then shows open (SPEC-group-header-collapse §3.6) and that is not the shape the next load draws. When `arranging` turns off, the debounced write runs with the view shape.
- An entry is bad if it does not parse, has another `v`, or holds a `span` outside 3, 4, 6, 12 or a `count` that is not a whole number from 0 to 999. A bad entry counts as missing.
- Sign-out (`handleLogout` in `App.tsx`) removes the key. A session that ends another way leaves it, and the user check above keeps it from showing to the next person.
- Until SPEC-group-header-collapse ships, `collapsed` is always written as `false`. The skeleton already draws a box with `collapsed: true` as its header row only, at its width. When #718 lands it writes the real value, and no skeleton change is needed.

### 3.2 One loading predicate

AppGrid has one `loading` flag. The skeleton shows exactly while it is true. This spec ships it as:

`loading = !catsLoaded || svcs === null`

SPEC-group-header-collapse §3.5 widens it to:

`loading = !catsLoaded || svcs === null || !collapsedReady`

`collapsedReady` is true at once for a kid (#718 adds an `isKid` prop for this), and true for an adult once `GET /api/me/collapsed-categories` settles (any outcome). Nothing else may add a second loading state or a spinner. The skeleton covers the whole wait, and AC-003 measures that whole wait.

### 3.3 The Library's target box

- `LibraryBrowse` gets an optional `targetCategory: { id, title }`. With it, the heading reads "Add to {title}" and every Add sends that `categoryId`. Without it, the heading stays "App Library" and adds land in Uncategorized, as today.
- SPEC-ui-quick-wins item 6 groups offers by `suggestedCategory`. The groups only sort the list. With a target, an offer goes into the target box whatever group it is listed under. The All / Not added / Added filter works the same with or without a target.

### 3.4 Opening the Library from a box

- AppGrid gets a new optional prop: `onAddToBox?: (box: { id: string; title: string }, opener: HTMLButtonElement) => void`. The admin's empty-box button calls it with its box and itself. AppGrid renders the button only when `onAddToBox` is set, the user is an admin, and `admin-empty` is not showing (OQ-3).
- `App.tsx` owns the rest. It keeps `browseTarget: { id, title, opener } | null` beside `browseOpen`, and renders the one `LibraryBrowse` with `targetCategory` set to `browseTarget`'s `{ id, title }`. From the Gear, `browseTarget` is `null` and no target is passed.
- `App.tsx` owns focus return. When the Library closes it clears `browseTarget`, then: if `opener.isConnected`, it focuses `opener`; else it focuses the first `[data-testid="tool-link"]` inside `[data-box-id="{id}"]`; else the Gear trigger (`data-testid="settings-gear"`). An add does not remount AppGrid (`onAddedFromLibrary` only updates the services list), so the opener stays connected unless its box filled.

## 4. Acceptance criteria

### Loading

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-001 | While AppGrid's one `loading` flag is true (§3.2: `!catsLoaded \|\| svcs === null`, widened by SPEC-group-header-collapse to include `!collapsedReady`), it renders a skeleton inside a real `.app-grid` element with the user's `data-density`. No `.app-spinner` shows in the content section. The wrapper keeps `data-testid="app-grid-loading"`. The app-level loader in `App.tsx` is unchanged. | Must |
| AC-002 | The skeleton is built from the real grid classes (`.app-grid-box`, `.app-grid-box-header`, `.app-grid-tools`, `.app-grid-tool` shell), with `--floor`, `--grow` and `--cap` set by the same helpers as real boxes (`boxWidthPx`, `contentMaxPx`, `rowFillCounts`). So every density and breakpoint rule applies to it unchanged. A ghost tile measures the same as a real tile at each density: Large 190px wide and the real Large height, Compact 236×68px, List full width × 44px with a 6px gap. This holds below 640px too. A kid's skeleton is Large, as their grid is. | Must |
| AC-003 | When the loaded layout matches the cached shape (same spans, counts, `collapsed` flags and `recent` flag, §3.1), loading causes no layout shift. In a real browser, the summed `layout-shift` entries from first paint of the skeleton to the loaded grid are under 0.01, at 390, 1440 and 1920px. The window covers the whole `loading` wait (§3.2), including the collapsed-set GET once #718 ships. A 30-app box and a collapsed box are in the cached shape. The first box's top-left corner and the x-position of every tile column do not move. | Must |
| AC-004 | With no cache, a bad cache, or a cache for another user, the fallback skeleton (OQ-1) still puts the first box's top edge and the first tile column where the real grid puts them. Only box count and box height may change. | Must |
| AC-005 | The skeleton reserves the Recently opened row when the cache says `recent: true`. Otherwise, and in the fallback, it reserves nothing there. | Should |
| AC-006 | The grid writes its shape to the cache after load and whenever the rendered shape changes (§3.1), debounced by 500 ms and skipped when equal to the last write. It does not write while `arranging` is on, and writes the view shape when `arranging` turns off. The entry holds only the version, the user id, the `recent` flag and per box `span`, exact `count` and `collapsed`. A read that throws, holds bad data, or names another user falls back without error. | Should |
| AC-007 | Motion. With `prefers-reduced-motion: no-preference`, ghost shapes may shimmer (opacity only; no transform). With `reduce`, the skeleton is static: no element under it has a running animation or transition. With `prefers-reduced-transparency: reduce`, ghost boxes follow the real boxes' near-solid rule. | Must |
| AC-008 | Accessibility. The skeleton shapes are `aria-hidden`. One polite status line says "Loading dashboard…". The skeleton has no focusable element. jest-axe finds no violations. Ghost shapes meet 3:1 against the box in light and dark (WCAG 1.4.11 is not required for decoration, but they must be visible). | Must |

### Empty box

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-009 | Who sees what in an empty box. **Admin:** the line "No apps yet." and a button **Browse the App Library**. **Member and kid** (any non-admin): the line "No apps here yet. Ask an admin to add some." and no button, except while `member-empty` shows (AC-021). In arrange mode (`editing`) the admin sees the same. While `admin-empty` shows, the admin's box buttons are hidden (OQ-3). | Must |
| AC-010 | The admin's button opens the existing App-level `LibraryBrowse` (one instance, not a second copy inside AppGrid). It opens with that box as the target and the heading "Add to {title}" (§3.3). Apps added from it land in that box (OQ-2), whatever group the offer is listed under. The Gear's Add apps still opens "App Library" and adds to Uncategorized. | Must |
| AC-011 | Focus after the Library closes, owned by `App.tsx` (§3.4). If the button is still on the page, focus returns to it. If the box filled and the button is gone, focus moves to the first tile link in that box, which is the first added app. Focus never lands on `<body>`. | Must |

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

### Added in review round 2

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-019 | The cache is per user (§3.1). AppGrid reads an entry only when its user id equals the `userId` prop, so user B never sees user A's shape on the same device. Sign-out removes the key. | Must |
| AC-020 | A box the cache marks `collapsed: true` draws as its header row only, at its full width, so once SPEC-group-header-collapse ships a collapsed box never draws full height and then folds. Until then `collapsed` is always written `false`. | Must |
| AC-021 | While `member-empty` shows (a non-admin who sees no apps), each empty box shows only "No apps here yet." with no "Ask an admin" line and no button. Once the member sees one app, `member-empty` goes and empty boxes show the full AC-009 line. | Must |
| AC-022 | AppGrid takes `onAddToBox(box, opener)` and `userId` as in §3.1 and §3.4. A member or kid render never shows the box button even if `onAddToBox` is passed. | Must |

## 5. Out of scope

- The accent decision (#724 options A and B), token consolidation, and splitting `index.css`. Those wait for Caleb's call on #724.
- The Gear's **Add apps** for members. SPEC-ui-quick-wins AC-017 removes it (decided 2026-11-25, `specs/DECISIONS.md`). This spec does not change the Gear and needs no new issue.
- Any change to who can add apps. The API's role rules stay as they are.
- A skeleton for the app-level loader (`App.tsx:148-160`), Settings, the Library or the launcher.
- Group header count pills and collapsing (#718). This spec only defines the cache's `collapsed` field and the loading predicate that #718 widens.

## 6. Test plan

Each AC with code has a test that fails before its change.

- AC-001: `src/grid/AppGrid.test.tsx` — loading renders `app-grid-loading` inside `.app-grid` with `data-density`, and no `.app-spinner`; the skeleton shows while categories or services are pending and goes when both arrive.
- AC-002: `tests/browser-gate/app-grid-skeleton.spec.ts` — measure ghost and real tile rects at Large, Compact and List, at 390 and 1440px, and a kid at Large. Widths and heights match within 1px.
- AC-003, AC-004, AC-005: `tests/browser-gate/app-grid-skeleton.spec.ts` — hold the mocked `/api/services` response, observe `layout-shift` with a `PerformanceObserver`, release it, then sum the shifts. Compare the first box corner and tile column x-positions before and after. Run once with a matching cache (one box of 30 apps), once with none, once with a cache for another user, and once with `recent: true`.
- AC-006, AC-019: `src/grid/gridShapeCache.test.ts` (new, for `src/grid/gridShapeCache.ts`) — writes only the listed fields, exact counts above 12; `src/grid/AppGrid.test.tsx` with fake timers — one write after load, one debounced write after a burst of changes (box resize, app add), none for an equal shape, none while arranging, one on leaving arrange mode; a throwing, junk or other-user read falls back; sign-out removes the key (`src/app/App.test.tsx`, beside its existing logout case).
- AC-020: `src/grid/gridShapeCache.test.ts` and `tests/browser-gate/app-grid-skeleton.spec.ts` — a `collapsed: true` box draws header-only at full width; `layout-shift` stays under 0.01 once #718 ships (the #718 build adds this browser case).
- AC-007: `tests/browser-gate/app-grid-skeleton.spec.ts` — `page.emulateMedia({ reducedMotion: 'reduce' })`, then `document.getAnimations()` on the skeleton is empty and computed `animation-name` is `none`. A second case with `no-preference` checks the shimmer uses opacity only.
- AC-008: `src/grid/AppGrid.test.tsx` — jest-axe on the loading state, one status line, no focusable element. Contrast of the ghost fill is measured in the browser-gate run, light and dark.
- AC-009, AC-021, AC-022: `src/grid/AppGrid.test.tsx` — replace the two copy cases at lines 246-258 with admin (button), member (no button) and kid (no button) cases, the hidden-button case while `admin-empty` shows, the short member line while the member sees no apps, and a member render with `onAddToBox` passed that still shows no button.
- AC-010, AC-011: `src/app/App.overlay-wiring.test.tsx` — the box button calls `onAddToBox` and opens the one `LibraryBrowse` with the box's id; an add sends that `categoryId`; on close focus returns to the button, or to the first `tool-link` in the box when it filled. `src/library/LibraryBrowse.test.tsx` — heading "Add to {title}" with a target, "App Library" without; an offer grouped under another category still sends the target id.
- AC-012, AC-013: `src/app/admin-empty-import.test.tsx` — a member-empty case; the existing AC-032 cases unchanged.
- AC-014, AC-015, AC-017: `tests/infra/retired-css.test.ts` (new) — no deleted selector in `src/index.css`, no class use in `src/**` or `index.html`; the live `.recently-opened` row, `.cat-count` and `.app-spinner` rules are still there.
- AC-016: `tests/infra/dark-tile-shadow.test.tsx` — retargeted as above.
- AC-018: `tests/infra/bundle-budget.test.ts` unchanged, plus the four named browser-gate specs unchanged.

Gates: `npm run lint`, `npm run build`, `npx vitest run`, `npm run test:gate`, `npm run test:e2e`.

## 7. Build order

Build this spec before SPEC-group-header-collapse. #718 widens the loading predicate (§3.2) and fills the cache's `collapsed` field (§3.1). Both specs change `src/grid/AppGrid.tsx` and `src/index.css`; see the file plan in `docs/milestones/M10-ui-review-first-batch.md`.
