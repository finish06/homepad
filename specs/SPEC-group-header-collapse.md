# Spec: Group header metadata and collapsible groups

**Spec ID:** SPEC-group-header-collapse
**Version:** 0.1.0
**Created:** 2026-11-25
**Author:** Claude (Caleb asked 2026-11-25 to write up M10)
**Status:** Approved — 2026-11-25 (Caleb took every recommended answer in §6). Not built. Kare checks the status bar during the build, since it replaces the held direction in SPEC-app-grid §10.1–10.3
**Repo:** `Code/homepad` (web app at the root; no `api/` changes)
**Issues:** #718
**Target version:** 18.7.0
**Milestone:** M10

---

## 1. Overview

Each App Grid box header today shows only its title, plus the edit controls in Edit Dashboard. With 68 services in many boxes, you cannot tell from a header how many apps a box holds, whether any are down, or fold away a box you rarely use.

This spec adds four things to every box header:

1. A count pill with the number of apps in the box.
2. A small status bar that shows the box's status mix, coloured like the health meter.
3. A "N down" badge when something in the box is down or degraded.
4. A chevron button that collapses the box to its header row. The choice is saved per user on the server.

The server side of collapse already exists (v5, `GET/PUT /api/me/collapsed-categories`). The web client for it was removed in #415 and never came back. This spec wires the App Grid to it. **No API change.**

This spec replaces the held design direction in SPEC-app-grid §10.1–§10.3. §10.3 asked Kare for a design treatment of the status strip; §3.2 here is that proposal, and Kare signs it off in review.

## 2. Checked against the code

Checked on `main` at f32a4b0.

| Claim in #718 | What the code says |
|---|---|
| BoxCard header at `src/grid/AppGrid.tsx:600-651` | Drifted. The header is at lines 631–682. It holds the box grip (edit mode), the `h2` title, Rename/Delete and the `WidthSelector`. True: no count, no status, no chevron. |
| `.cat-count` token at `src/index.css:390` | Drifted. It is at line 413 (dark at 426). Nothing uses it now; its last user was the Catalog, deleted in #412. It is free to reuse. |
| Health meter banding at `src/app/StatusBar.tsx:50-68` | True. `tickClass` (line 50) and `statusBand` (line 62) are module-private. UP is green, NOT_MONITORED and UNKNOWN are gray, DOWN and DEGRADED are red. Colours come from `--v-up`, `--v-down`, `--v-tick-idle` (`.health-tick-*`, `src/index.css:783-785`). |
| Artboard header at `docs/design/v16-ui/Main.dc.html:124-134` | True, with one difference. The artboard bar is one tick per app in layout order and can draw amber. The health meter is banded and never amber (SPEC-v24 §8.B). This spec follows the meter, as #718 and the review ask. The "1 down" badge is in `Groups.dc.html`, not `Main.dc.html`. |
| "localStorage is acceptable" | Not needed. `api/internal/api/collapse.go` stores the collapsed category ids per user (migration `0005`). See §4. |
| Collapse already wired in the web app | Wrong. `getCollapsedCategories` / `setCollapsedCategories` were removed from `src/api.ts` in 898df31 (#415), along with `tests/e2e/collapse.spec.ts`. `src/api.test.ts` still has two orphan "v5 collapsible categories" section headers. The gate mocks (`tests/browser-gate/mockApi.ts:121` and others) still answer the route. |

## 3. Design

### 3.1 Header layout

One row, in this order:

`[chevron] Title (6) [• 1 down] ……… [status bar]` then the edit controls, when shown.

- The chevron, pill, badge and bar never shrink. The title takes the rest and truncates with an ellipsis, as now.
- The title, pill, badge and bar sit in one group that never wraps. The edit controls (Rename, Delete, width selector) stay a separate group after it. The header keeps `flex-wrap: wrap`, so at narrow widths the edit group drops to its own line below. The metadata never wraps into it or splits around it.
- The header looks the same at Large, Compact and List. Density changes tiles, not the header.
- At 390px the box is full width (about 358px of content). The metadata needs about 190px; the title gets the rest. The bar stays 64px wide.

### 3.2 Count pill and status bar

- The pill shows `box.tools.length` in the `.cat-count` style. Its accessible text is "6 apps".
- The bar is 64×5px with rounded ends. It has up to three segments in band order: green (UP), gray (NOT_MONITORED, UNKNOWN), red (DOWN, DEGRADED). Each segment's width is its share of the box's apps, with a 4px minimum so one red app always shows. A band with no apps draws nothing.
- Colours reuse the health meter: `.health-tick-up`, `.health-tick-idle`, `.health-tick-down` (or the same tokens). `tickClass` and `statusBand` move out of `StatusBar.tsx` into one shared module that both the meter and the bar import. No new status colours.
- Status hue is separate from tile icon hue. The bar never uses the service hue or a category hue (#352, `specs/DECISIONS.md` 2026-11-24).
- The bar is `aria-hidden`. A visually hidden line carries the same facts: "6 apps: 4 up, 1 down, 1 not monitored". Bands with zero apps are left out of the line.
- An empty box shows "0" and no bar.
- The bar and badge follow the live status poll. Status changes are not announced.

### 3.3 "N down" badge

- Shown when the box has any DOWN or DEGRADED app, in both expanded and collapsed state. N counts both, like the health panel's down chip.
- A red dot plus the text "1 down". The text carries the meaning; the colour only repeats it.
- Hidden when N is 0.

### 3.4 Collapse

- The chevron is a real `<button>` placed before the `h2`. It points down when open and right when collapsed.
- `aria-expanded` is `true` when open. `aria-controls` names the tools region. Its accessible name is "{title} apps" and does not change with state.
- The hit area is at least 24×24px (44×44 at Large and on touch), using negative margins like the box grip so the header height does not change.
- Collapsed: the header row stays; the tools grid, the empty-state line and the rename/delete panels are not rendered. The box keeps its width, so the boxes beside it do not move. Only its height shrinks.
- After a toggle, focus stays on the chevron. The button is the same element in both states.
- The existing `app-grid-announce` live region says "Media collapsed. 6 apps, 1 down." or "Media expanded."
- The Uncategorized box (id `''`) gets the pill, bar and badge but no chevron. It has no category id to save, and v5 Q2 (`specs/DECISIONS.md` 2026-06-12) keeps render-time buckets always expanded.

### 3.5 Saving the state

- On load, AppGrid fetches `GET /api/me/collapsed-categories` beside `fetchCategories()`. The grid renders once both answer, so a collapsed box never flashes open. Any error or non-200 means "all expanded".
- Ids in the set that name no current box are ignored. The server already drops them on write, and a deleted box's row is removed by the FK cascade.
- A toggle updates the screen at once, then sends `PUT` with the whole set. If the PUT fails, the toggle rolls back and the existing grid toast says "Couldn't save. Try again."
- Fast toggles are not lost: each PUT sends the latest full set, and a reply for an older PUT never rolls back a newer toggle.
- Re-add `getCollapsedCategories()` and `setCollapsedCategories(ids)` to `src/api.ts` on the shared `request()` helper.

### 3.6 Edit Dashboard and arrange mode

Recommended (OQ-1): while Edit Dashboard is on (`arranging`, any user), every box shows open and the chevrons are hidden. The saved set does not change. Leaving the mode puts the saved state back.

This keeps every ★, edit pencil and tile drag grip reachable without changing their hit areas, and keeps box drag (v28) exactly as it is. A drag can never start or end on a collapsed box, because there is none in this mode.

### 3.7 Kids

A kid can read the set (`GET` is kid-filtered) but gets 403 on `PUT` (`classKidForbidden`, SPEC-kid-accounts AC-007). Backups also never hold folded sections for kids. Recommended (OQ-2): a kid sees the pill, bar and badge, but no chevron.

## 4. API

**No API change.** Verified in code:

| Point | Behaviour |
|---|---|
| Routes | `GET /api/me/collapsed-categories` (`classKidFiltered`), `PUT /api/me/collapsed-categories` (`classKidForbidden`), `api/internal/api/server.go:319-320`. |
| Payload | GET returns `200 {"collapsed": ["<category id>", ...]}`, empty by default. PUT takes `{"collapsed": [...]}`, replaces the whole set, and returns `204`. Bad JSON is `400`; no session is `401`. |
| Who | Any signed-in adult, admin or member, reads and writes only their own set. A kid gets `403` on PUT. A kid's GET only returns categories the kid can see. |
| Stale ids | Unknown, stale or malformed ids are dropped on write, never a 4xx (`storage/collapse.go`). Deleting a category or a user removes its rows (`ON DELETE CASCADE`, migration `0005`). |
| Backup | Each adult's set is exported as `collapsedSections` (section names, in section order) and shown as "folded sections". On restore, a matched adult's set is replaced by the file's; names missing from the file are dropped with a warning (SPEC-backup-import). Kids have no folded sections. |

## 5. Acceptance criteria

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-001 | Every box header shows a count pill equal to the number of apps the user sees in that box, in the `.cat-count` style, with the accessible text "N apps". | Must |
| AC-002 | Every box with at least one app shows a 64×5px status bar with up to three segments in the order green, gray, red. Segment widths follow the app counts, with a 4px minimum. An empty box shows no bar. | Must |
| AC-003 | The bar uses the health meter's band mapping and colour tokens from one shared module that `StatusBar.tsx` also uses. DEGRADED is red, UNKNOWN is gray. No service or category hue is used. | Must |
| AC-004 | Each header has hidden text naming the counts per band ("6 apps: 4 up, 1 down, 1 not monitored"). The bar is `aria-hidden`. | Must |
| AC-005 | A box with any DOWN or DEGRADED app shows a "N down" badge with visible text, in both states. N counts both. It is hidden when N is 0. | Must |
| AC-006 | Every real category box has a chevron `<button>` with `aria-expanded`, `aria-controls` and the stable name "{title} apps". Uncategorized has none. | Must |
| AC-007 | Collapsing hides the tools grid and shows only the header row, with title, pill, badge and bar. The box keeps its width; no other box moves. | Must |
| AC-008 | Enter and Space toggle the chevron. Focus stays on it. The live region announces "{title} collapsed. N apps, M down." (the down part only when M > 0) or "{title} expanded." | Must |
| AC-009 | The collapsed set loads from `GET /api/me/collapsed-categories` before the grid first renders. A collapsed box never shows open first. A failed GET renders all boxes open. | Must |
| AC-010 | A toggle PUTs the whole current set. A failed PUT rolls back that toggle and shows an error toast. A reply to an older PUT never undoes a newer toggle. | Must |
| AC-011 | The state survives a reload and is per user: user A collapsing a box does not collapse it for user B. | Must |
| AC-012 | Ids in the loaded set that match no box are ignored, and no error shows. | Should |
| AC-013 | In Edit Dashboard every box shows open and no chevron renders. The saved set is unchanged, and the saved state returns on leaving the mode. | Must |
| AC-014 | The width selector, box drag (v28), arrange mode, ★ and edit pencil behave as before. The #513 hit-area gate passes unchanged at Large, Compact and List. | Must |
| AC-015 | At 390px and 1440px, at each density, in view and edit mode, the title, pill, badge and bar sit on one line. They never wrap into or overlap the edit controls. No horizontal scroll. | Must |
| AC-016 | A kid sees pill, bar and badge but no chevron, and the client never sends the PUT for a kid. | Should |
| AC-017 | The new header passes jest-axe in light and dark mode. Pill and badge text meet 4.5:1, and the bar segments meet 3:1 against the box. | Must |

## 6. Open questions — decided

**Decided by Caleb on 2026-11-25: every recommended answer below is taken.** The ACs use them.

| ID | Question | Recommended default |
|----|----------|---------------------|
| OQ-1 | In Edit Dashboard, should collapsed boxes stay collapsed (smaller, easier to drag) or open? | Open them all for the session and hide chevrons (§3.6). It keeps every edit control reachable and needs no drag changes. |
| OQ-2 | Kids: no chevron, a chevron that resets on reload, or let kids PUT (an API change)? | No chevron. It keeps SPEC-kid-accounts D3 (kids change only theme and favorites). |
| OQ-3 | Show the "N down" badge only when collapsed (as #718 says) or always (as the Groups artboard shows)? | Always. A problem should be visible in every header, and it costs one short pill. |
| OQ-4 | Should a box with no monitored apps show an all-gray bar, or hide the bar like the health meter does in the fleet-not-monitored state? | Show the gray bar. Within one box it still tells you "nothing here is checked". |

## 7. Out of scope

- Any change to `GET/PUT /api/me/collapsed-categories`, the backup format, or migrations.
- Collapsing the Uncategorized box or the Recently opened row.
- An admin default ("ship this box collapsed"), v5 Q3.
- "Collapse all" / "Expand all".
- Changing the health meter itself. Its only change is importing the shared band module.
- Moving or resizing the box grip, width selector, ★ or edit pencil.
- Pairing with #720. That is its own spec.

## 8. Test plan

Each AC has a test that fails before the change.

| AC | Test file |
|----|-----------|
| AC-001, AC-002, AC-004, AC-005 | `src/grid/app-grid-group-header.test.tsx` (new): pill text, segment order and widths for mixed boxes, empty box, hidden summary text, badge shown and hidden |
| AC-002, AC-003 | `src/lib/statusBands.test.ts` (new): band mapping for all five statuses; `src/app/StatusBar.test.tsx` and `src/app/HealthPanel.test.tsx` still pass on the shared module; `tests/browser-gate/health-meter-banding-v24.spec.ts` unchanged |
| AC-006, AC-007, AC-008 | `src/grid/app-grid-group-header.test.tsx`: role, `aria-expanded`, `aria-controls`, name; tools hidden; keyboard toggle; `document.activeElement` is the chevron; announce text |
| AC-009, AC-010, AC-012 | `src/grid/app-grid-group-header.test.tsx`: no first-paint flash, GET failure, PUT body, rollback and toast, out-of-order replies, stale ids; `src/api.test.ts`: the two client functions (URL, method, body, status mapping) under the existing v5 section header |
| AC-011 | `tests/browser-gate/app-grid-group-header-718.spec.ts` (new): collapse, reload, still collapsed; second user's mock set stays expanded |
| AC-013 | `src/grid/app-grid-group-header.test.tsx` and `src/grid/app-grid-fav-arrange-gate.test.tsx`: edit and arrange mode render open, no chevron, no PUT |
| AC-014 | `tests/browser-gate/fav-edit-hit-areas-513.spec.ts`, `tests/browser-gate/app-grid-rearrange.spec.ts`, `tests/browser-gate/app-grid-box-manage.spec.ts`, `src/grid/AppGrid.tiledrag.test.tsx`, all unchanged and passing, with a collapsed box in the mocked set |
| AC-015 | `tests/browser-gate/app-grid-group-header-718.spec.ts`: Large, Compact, List × 390 and 1440 × view and edit; metadata boxes share one top offset; no overlap with edit controls; `scrollWidth <= clientWidth` |
| AC-016 | `src/grid/app-grid-group-header.test.tsx` kid case; `tests/browser-gate/kid-board-ipad.spec.ts` asserts no chevron and no PUT (the `kidMocks.ts` PUT trap already exists) |
| AC-017 | `src/grid/app-grid-group-header.test.tsx` jest-axe; contrast measured in `tests/browser-gate/app-grid-group-header-718.spec.ts`, light and dark |

No Go tests: the API is unchanged. The existing `api/internal/api/collapse_test.go`, `kid_filter_test.go` and `kid_writelock_test.go` already cover the routes.

Gates: `npm run lint`, `npm run build`, `npx vitest run`, `npm run test:gate`, `npm run test:e2e`.
