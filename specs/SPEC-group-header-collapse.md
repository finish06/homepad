# Spec: Group header metadata and collapsible groups

**Spec ID:** SPEC-group-header-collapse
**Version:** 0.4.0
**Created:** 2026-11-25
**Author:** Claude (Caleb asked 2026-11-25 to write up M10)
**Status:** Approved — 2026-11-25 (Caleb's answers are in §6). Built 2026-11-25; see §10 (as built). Kare checks the status bar during the build, since it replaces the held direction in SPEC-app-grid §10.1–10.3
**Repo:** `Code/homepad` (web app at the root; no `api/` changes)
**Issues:** #718
**Target version:** 18.7.0
**Milestone:** M10

---

## 1. Overview

Each App Grid box header today shows only its title, plus an admin's edit controls in arrange mode. With 68 services in many boxes, you cannot tell from a header how many apps a box holds, whether any are down, or fold away a box you rarely use.

This spec adds four things to every box header:

1. A count pill with the number of apps in the box.
2. A small status bar that shows the box's status mix, coloured like the health meter.
3. A "N down" badge when something in the box is DOWN or DEGRADED. N counts both (§3.3).
4. A chevron button that collapses the box to its header row. The choice is saved per user on the server.

The server side of collapse already exists (v5, `GET/PUT /api/me/collapsed-categories`). The web client for it was removed in #415 and never came back. This spec wires the App Grid to it. **No API change.**

This spec replaces the held design direction in SPEC-app-grid §10.1–§10.3. §10.3 asked Kare for a design treatment of the status strip; §3.2 here is that proposal, and Kare signs it off in review.

## 2. Checked against the code

Checked on `main` at f32a4b0.

| Claim in #718 | What the code says |
|---|---|
| BoxCard header at `src/grid/AppGrid.tsx:600-651` | Drifted. The header is at lines 631–681. It holds the box grip (admin arrange mode), the `h2` title, Rename/Delete and the `WidthSelector`. True: no count, no status, no chevron. |
| (not in #718) Edit and arrange modes | There is one session flag, `editMode`, in `App.tsx` (line 221). Adults turn it on with the Gear's "Arrange apps" (`src/app/AppHeader.tsx:230-242`); a kid with `KidFavoritesToggle`. AppGrid splits it (`AppGrid.tsx:400-413`): `arranging = editMode` for any user (the ★), and `editing = isAdmin && editMode` (box grip, Rename/Delete, width selector, tile pencil, tile drag). So `editing` is never true without `arranging`. Some older comments call the mode "Edit Dashboard"; the menu item has said "Arrange apps" since SPEC-density-to-my-settings. |
| (not in #718) Who is a kid | AppGrid's props are `isAdmin`, `editMode`, `showUptimeDisplay`, `density` (`AppGrid.tsx:125-140`), plus `userId` and `onAddToBox` from #722. It cannot tell a kid from a member. `isKid` is computed in `App.tsx:215`. This spec adds an `isKid` prop that `App.tsx` passes to `<AppGrid>`. |
| (not in #718) Loading | AppGrid's one `loading` flag is `!catsLoaded \|\| svcs === null` (`AppGrid.tsx:204`). SPEC-dashboard-empty-loading (#722) replaces the spinner it gates with a skeleton and defines the shared predicate this spec widens (§3.5). |
| `.cat-count` token at `src/index.css:390` | Drifted. It is at line 413 (dark at 426). Nothing uses it now; its last user was the Catalog, deleted in #412. It is free to reuse. |
| Health meter banding at `src/app/StatusBar.tsx:50-68` | True. `tickClass` (line 50) and `statusBand` (line 62) are module-private. UP is green, NOT_MONITORED and UNKNOWN are gray, DOWN and DEGRADED are red. Colours come from `--v-up`, `--v-down`, `--v-tick-idle` (`.health-tick-*`, `src/index.css:783-785`). The health panel's "N down" chip already counts DOWN + DEGRADED (`StatusBar.tsx:262-283`). Tile pips name each status on its own: "status: UP", "DOWN", "DEGRADED", "UNKNOWN", "not monitored" (`statusLabel`, `AppGrid.tsx:1001-1007`). |
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

- The pill shows `box.tools.length` in the `.cat-count` style. Its accessible text is the **count phrase**: "1 app" for one, "N apps" for any other number ("0 apps", "6 apps"). The same count phrase is used in the announcement (§3.4).
- The bar is 64×5px with rounded ends. It has up to three segments in band order: green (UP), gray (NOT_MONITORED, UNKNOWN), red (DOWN, DEGRADED). Each non-empty band gets at least 4px, so one red app always shows. The rest of the 64px is shared among the non-empty bands by app count: width = 4 + (64 − 4 × bands) × count / total. The three widths always add up to 64px, so the bar never overflows or clips. Example: 98 up, 1 gray, 1 down gives 4 + 52 × 0.98 ≈ 55.0, then 4.5 and 4.5 px. A band with no apps draws nothing.
- Colours reuse the health meter: `.health-tick-up`, `.health-tick-idle`, `.health-tick-down` (or the same tokens). `tickClass` and `statusBand` move out of `StatusBar.tsx` into one new shared module, `src/lib/statusBands.ts`, that both the meter and the bar import. No new status colours.
- Status hue is separate from tile icon hue. The bar never uses the service hue or a category hue (#352, `specs/DECISIONS.md` 2026-11-24).
- The bar shows bands. The words name statuses. The bar is `aria-hidden`. A visually hidden line gives the count per status, in the words the tile pips use, in this order: up, down, degraded, unknown, not monitored. Example for a 6-app box: "2 up, 1 down, 1 degraded, 1 unknown, 1 not monitored". It does not repeat the count, because the pill already gives the count phrase. Statuses with zero apps are left out. An empty box has no status line. So UNKNOWN is never called "not monitored" and DEGRADED is never called "down".
- An empty box shows "0" and no bar.
- The bar and badge follow the live status poll. Status changes are not announced.

### 3.3 "N down" badge

- Shown when the box has any DOWN or DEGRADED app, in both expanded and collapsed state (decided, OQ-3).
- "N down" means N apps that are DOWN or DEGRADED. This is the same word and the same count as the health panel's down chip (`StatusBar.tsx:283`), so the two never disagree.
- A red dot plus the text "2 down". The text carries the meaning; the colour only repeats it.
- The badge is `aria-hidden`. Screen readers get the exact split from the hidden status line (§3.2), so they never hear "2 down" for one DOWN and one DEGRADED app.
- Hidden when N is 0.

### 3.4 Collapse

- The chevron is a real `<button>` placed before the `h2`. It points down when open and right when collapsed.
- `aria-expanded` is `true` when open. `aria-controls` names a wrapper `div` around the box body (tools grid or empty line) that is always rendered, with `hidden` set while collapsed, so the id always exists. The body's contents are not rendered while collapsed. Its accessible name is "{title} apps" and does not change with state.
- The hit area is at least 24×24px (44×44 at Large and on touch), using negative margins like the box grip so the header height does not change.
- Collapsed: the header row stays; the tools grid, the empty-state line and the rename/delete panels are not rendered (the empty, `hidden` body wrapper from the line above stays). The box keeps its width, so the boxes beside it do not move. Only its height shrinks.
- After a toggle, focus stays on the chevron. The button is the same element in both states.
- The existing `app-grid-announce` live region says one of three things, exactly:
  - on collapse, a box with apps: "{title} collapsed. {count phrase}: {status line}." For example "Media collapsed. 6 apps: 5 up, 1 degraded." or "Media collapsed. 1 app: 1 up."
  - on collapse, an empty box: "{title} collapsed. 0 apps."
  - on expand: "{title} expanded."
- The Uncategorized box (id `''`) gets the pill, bar and badge but no chevron. It has no category id to save, and v5 Q2 (`specs/DECISIONS.md` 2026-06-12) keeps render-time buckets always expanded.

### 3.5 Saving the state

- AppGrid gets a new `isKid` prop from `App.tsx` (`isKid`, `App.tsx:215`). For an admin or member (`!isKid`), AppGrid fetches `GET /api/me/collapsed-categories` on mount, in parallel with `fetchCategories()`. A new flag, `collapsedReady`, turns true when that GET settles, with any outcome, or after 3 seconds, whichever comes first. Any error, non-200 or timeout means "all expanded". A reply that comes after the 3 seconds is ignored for the rest of that mount: the boxes stay open and `confirmed` stays empty. If the user toggles in that mount, the PUT sends the on-screen set and replaces the server's set, which matches what they saw. The next load reads the set again. `request()` has no timeout of its own, so AppGrid sets this one.
- This widens the one loading predicate that SPEC-dashboard-empty-loading §3.2 defines:
  `loading = !catsLoaded || svcs === null || !collapsedReady`
  While it is true the #722 skeleton shows, drawn from the per-user cache, which records which boxes were collapsed. So a collapsed box never shows open first, and there is no second spinner or wait.
- A kid makes no collapse request at all, GET or PUT. For a kid `collapsedReady` is true from the start and the set is empty. A kid's set is always empty anyway: PUT is forbidden for kids and backups hold no folded sections for them (§4). A kid has no chevron (§3.7).
- Each box's `collapsed` flag goes into the #722 skeleton cache through #722's shape write (SPEC-dashboard-empty-loading §3.1): after load and after every fold or unfold, debounced, never while `arranging` is on.
- Ids in the set that name no current box are ignored. The server already drops them on write, and a deleted box's row is removed by the FK cascade.
- The client keeps two sets. `confirmed` is the last set the server accepted. `desired` is what the screen shows. At load both are the GET result (or empty), filtered to the ids of boxes on screen.
- PUT returns `204` with no body (`api/internal/api/collapse.go:68`). So on success, `confirmed` becomes the set that was sent, filtered to the ids of boxes currently on screen. The server drops unknown ids the same way (§4).
- When boxes change (a box deleted, a grid reload), `desired` and `confirmed` are both pruned to the current box ids. Pruning alone never sends a PUT, so a deleted box causes no extra follow-up.
- A toggle changes `desired` at once. If no PUT is in flight, it sends `PUT` with the whole `desired` set. PUTs go one at a time: while one is in flight, more toggles only change `desired`.
- When a PUT **succeeds**, `confirmed` becomes the sent set, pruned as above. If `desired` now differs from `confirmed`, the client sends one follow-up PUT with `desired`. A success reply never changes the screen, so it never undoes a newer toggle.
- When a PUT **fails** (network error or any non-2xx), the screen goes back to `confirmed`, the queued follow-up is dropped, and the existing grid toast says "Couldn't save. Try again." once. This also undoes any newer toggles made while that PUT was in flight. That is on purpose: one simple rule, and the screen then matches the server.
- So the server never applies an older set after a newer one, and after any reply the screen is either the newest set or the server's set.
- Re-add `getCollapsedCategories()` and `setCollapsedCategories(ids)` to `src/api.ts` on the shared `request()` helper.

### 3.6 Arrange mode (members) and editing (admins)

Decided (OQ-1). The rule keys on `arranging` (`= editMode`), not on `editing`. `arranging` is true for any user in the mode, and `editing` (admin only) is never true without it, so one check covers both:

- A member in arrange mode (`arranging` true, `editing` false): every box shows open, no chevron renders. The ★ on every tile, including tiles in boxes the member had collapsed, is reachable.
- An admin in arrange mode (`arranging` and `editing` true): the same, and the box grip, Rename/Delete, width selector, tile pencil and tile drag grip are all reachable.
- The saved set does not change and no PUT is sent. Leaving the mode puts the saved state back.

This keeps every control reachable without changing its hit area, and keeps box drag (v28) as it is. A drag can never start or end on a collapsed box, because there is none in this mode. A kid's favorites mode also sets `arranging`; a kid has no chevron and no collapsed box in any mode.

### 3.7 Kids

A kid could read the set (`GET` is kid-filtered) but gets 403 on `PUT` (`classKidForbidden`, SPEC-kid-accounts AC-007), and backups never hold folded sections for kids, so a kid's set is always empty. Decided (OQ-2): a kid sees the pill, bar and badge, but no chevron. The client sends neither GET nor PUT for a kid (§3.5).

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
| AC-001 | Every box header shows a count pill equal to the number of apps the user sees in that box, in the `.cat-count` style, with the accessible text "1 app" for one app and "N apps" otherwise ("0 apps", "6 apps"). | Must |
| AC-002 | Every box with at least one app shows a 64×5px status bar with up to three segments in the order green, gray, red. Widths follow §3.2's formula: each non-empty band ≥4px and the total is exactly 64px (98/1/1 does not overflow). A box whose apps are all UNKNOWN or NOT_MONITORED shows one all-gray 64px bar (OQ-4). An empty box shows no bar. | Must |
| AC-003 | The bar uses the health meter's band mapping and colour tokens from one shared module, `src/lib/statusBands.ts`, that `StatusBar.tsx` also uses. DEGRADED is red, UNKNOWN is gray. No service or category hue is used. | Must |
| AC-004 | Each header has hidden text with the count per status, in status words and the order up, down, degraded, unknown, not monitored, leaving out zeros (for 6 apps: "2 up, 1 down, 1 degraded, 1 unknown, 1 not monitored"; the pill gives the count). UNKNOWN is counted as "unknown" and DEGRADED as "degraded", matching the tile pip labels. The bar is `aria-hidden`. | Must |
| AC-005 | A box with any DOWN or DEGRADED app shows a "N down" badge with visible text, in both states. N is the number of DOWN plus DEGRADED apps, the same count as the health panel's down chip. The badge is `aria-hidden` (AC-004 carries the split). It is hidden when N is 0. | Must |
| AC-006 | For an admin or member outside arrange mode, every real category box has a chevron `<button>` with `aria-expanded`, `aria-controls` and the stable name "{title} apps". The `aria-controls` id exists in the DOM when the box is open, collapsed or empty. Uncategorized has none. | Must |
| AC-007 | Collapsing hides the tools grid and shows only the header row, with title, pill, badge and bar. The box keeps its width; no other box moves. | Must |
| AC-008 | Enter and Space toggle the chevron. Focus stays on it. The live region announces exactly one of: "{title} collapsed. {count phrase}: {AC-004 status line}." for a box with apps, "{title} collapsed. 0 apps." for an empty box, or "{title} expanded." The count phrase is "1 app" or "N apps" (§3.2). | Must |
| AC-009 | For an admin or member, the grid stays in the shared `loading` state (the #722 skeleton) until `GET /api/me/collapsed-categories` settles or 3 seconds pass, whichever is first: `loading = !catsLoaded \|\| svcs === null \|\| !collapsedReady`. A timeout renders all boxes open, and a later reply is ignored for that mount. A collapsed box never shows open first. A failed GET renders all boxes open. A kid sends no GET; `collapsedReady` is true at once and every box is open. | Must |
| AC-010 | A toggle PUTs the whole `desired` set. PUT returns 204 with no body; on success `confirmed` becomes the sent set, filtered to current box ids. Deleting a box prunes both sets and sends no PUT. At most one PUT is in flight; toggles made meanwhile are sent as one follow-up PUT with the latest `desired` set after a success. A success reply never changes the screen. A failed PUT puts the screen back to `confirmed` (the last set the server accepted), drops the queued follow-up, and shows the error toast once, even if that undoes newer toggles (§3.5). A kid's grid makes no collapse request. | Must |
| AC-011 | The state survives a reload and is per user: user A collapsing a box does not collapse it for user B. | Must |
| AC-012 | Ids in the loaded set that match no box are ignored, and no error shows. | Should |
| AC-013 | While `arranging` is true (a member in arrange mode, or an admin, for whom `editing` is also true), every box shows open and no chevron renders. A member can reach the ★ on every tile of a box they had collapsed; an admin can also reach the grip, Rename/Delete, width selector and pencil. No PUT is sent, the saved set is unchanged, and the saved state returns on leaving the mode. | Must |
| AC-014 | The width selector, box drag (v28), arrange mode, ★ and edit pencil behave as before. The #513 hit-area gate passes unchanged at Large, Compact and List. | Must |
| AC-015 | At 390px and 1440px, at each density, in view mode and in an admin's arrange mode (edit controls shown), the title, pill, badge and bar sit on one line. They never wrap into or overlap the edit controls. No horizontal scroll. | Must |
| AC-016 | A kid sees pill, bar and badge but no chevron, and the client sends no collapse request (GET or PUT) for a kid. | Should |
| AC-017 | The new header passes jest-axe in light and dark mode. Pill and badge text meet 4.5:1, and the bar segments meet 3:1 against the box. | Must |
| AC-018 | Each box's real `collapsed` flag reaches the #722 skeleton cache after load and after every fold or unfold (debounced, not while `arranging`). With a matching cache that holds a collapsed box, the skeleton draws that box header-only and the summed `layout-shift` from skeleton to loaded grid stays under 0.01 (SPEC-dashboard-empty-loading AC-003, AC-020). | Must |

## 6. Open questions — decided

Decided by Caleb on 2026-11-25 (`specs/DECISIONS.md`). The ACs use these answers.

| ID | Question | Decision |
|----|----------|----------|
| OQ-1 | While editing or arranging, should collapsed boxes stay collapsed (smaller, easier to drag) or open? | Every box shows open and chevrons are hidden while `arranging` is on, for members and admins (§3.6). It keeps every ★ and edit control reachable and needs no drag changes. |
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
| AC-001, AC-002, AC-004, AC-005 | `src/grid/app-grid-group-header.test.tsx` (new): pill text ("1 app", "0 apps", "6 apps"), segment order and widths for mixed boxes, all-gray bar, empty box, hidden status line in status words (DEGRADED read as "degraded", UNKNOWN as "unknown"), badge text counts DOWN + DEGRADED, badge `aria-hidden`, badge shown and hidden |
| AC-002, AC-003 | `src/lib/statusBands.test.ts` (new): band mapping for all five statuses; `src/app/StatusBar.test.tsx` and `src/app/HealthPanel.test.tsx` still pass on the shared module; `tests/browser-gate/health-meter-banding-v24.spec.ts` unchanged |
| AC-006, AC-007, AC-008 | `src/grid/app-grid-group-header.test.tsx`: role, `aria-expanded`, `aria-controls`, name; tools hidden; keyboard toggle; `document.activeElement` is the chevron; the three exact announce strings, including a 1-app box ("1 app: 1 up") and an empty box ("0 apps") |
| AC-009, AC-010, AC-012 | `src/grid/app-grid-group-header.test.tsx`: skeleton (`app-grid-loading`) stays until the GET settles and a collapsed box never renders open, GET failure, a GET held past 3 s (fake timers) renders all open and its late reply changes nothing, kid sends no GET, PUT body, one PUT in flight and one follow-up after success, a success reply that leaves a newer toggle on screen, a failure that reverts to `confirmed` (also undoing a toggle made in flight), drops the follow-up and toasts once, `confirmed` equals the sent set after a 204, deleting a collapsed box sends no follow-up PUT, stale ids; `src/api.test.ts`: the two client functions (URL, method, body, status mapping) under the existing v5 section header |
| AC-011 | `tests/browser-gate/app-grid-group-header-718.spec.ts` (new): collapse, reload, still collapsed; second user's mock set stays expanded |
| AC-013 | `src/grid/app-grid-group-header.test.tsx` and `src/grid/app-grid-fav-arrange-gate.test.tsx`: a member in arrange mode and an admin in arrange mode, each with a collapsed box in the set: every box open, no chevron, the ★ reachable in the formerly collapsed box (and for the admin the pencil), no PUT, saved state back on exit |
| AC-014 | `tests/browser-gate/fav-edit-hit-areas-513.spec.ts`, `tests/browser-gate/app-grid-rearrange.spec.ts`, `tests/browser-gate/app-grid-box-manage.spec.ts`, `src/grid/AppGrid.tiledrag.test.tsx`, all unchanged and passing, with a collapsed box in the mocked set |
| AC-015 | `tests/browser-gate/app-grid-group-header-718.spec.ts`: Large, Compact, List × 390 and 1440 × view and admin arrange mode; metadata boxes share one top offset; no overlap with edit controls; `scrollWidth <= clientWidth` |
| AC-016 | `src/grid/app-grid-group-header.test.tsx` kid case (no GET, no PUT); `tests/browser-gate/kid-board-ipad.spec.ts` asserts no chevron and no PUT (the `kidMocks.ts` PUT trap already exists) |
| AC-017 | `src/grid/app-grid-group-header.test.tsx` jest-axe; contrast measured in `tests/browser-gate/app-grid-group-header-718.spec.ts`, light and dark |
| AC-018 | `src/grid/app-grid-group-header.test.tsx` with fake timers: the written `collapsed` flags match the set after load and after a toggle, and nothing is written while arranging; `tests/browser-gate/app-grid-skeleton.spec.ts`: a matching cache with a collapsed box, `layout-shift` under 0.01 |

No Go tests: the API is unchanged. The existing `api/internal/api/collapse_test.go`, `kid_filter_test.go` and `kid_writelock_test.go` already cover the routes.

Gates: `npm run lint`, `npm run build`, `npx vitest run`, `npm run test:gate`, `npm run test:e2e`.

## 9. Build order

Build after SPEC-dashboard-empty-loading (#722). This spec widens #722's loading predicate and fills its cache's `collapsed` field, so it needs both to exist. Both change `src/grid/AppGrid.tsx`, `src/index.css` and the `<AppGrid>` element in `src/app/App.tsx` (this spec adds `isKid`); see the file plan in `docs/milestones/M10-ui-review-first-batch.md`.

## 10. As built (2026-11-25)

Small calls made while building. The PR lists them under "Spec deviations".

1. **The bar's gray band uses `--v-unknown`, not the meter's `--v-tick-idle`.** The meter's idle gray is far under 3:1 against the box, so it fails AC-017, and an all-gray bar (OQ-4) would barely show. `--v-unknown` is the existing token the tile pips use for UNKNOWN, so no new colour (it measures about 4.5:1 in light mode). Green and red are the meter's tokens unchanged (light: about 3.2:1 and 4.5:1).
2. **The "N down" words are the body text colour on a faint red wash, after a red dot.** Red text (`--v-down`) on the box measured 3.4:1 in light mode, under AC-017's 4.5:1. The words carry the meaning (§3.3); the dot and the wash repeat it in the meter's red.
3. **The pill is one shade darker in light mode inside the header** (`#475569` instead of `.cat-count`'s `#64748b`, which is about 4.2:1 on the translucent box). Dark mode keeps `.cat-count` as it is.
4. **Chevron hit area on touch.** `pointer: coarse` gets 44×44 at every density (§3.4: "at Large and on touch"). The browser gate's project has touch on, so it checks 24×24 at Compact and List in a mouse-only context.
5. **The box grip moved inside the metadata group**, so at narrow widths it can never wrap away from the title. Its size, margins and drag wiring are unchanged; the rearrange and #513 gates pass unchanged.
6. **AC-014 with a collapsed box.** The existing gates (`fav-edit-hit-areas-513`, `app-grid-rearrange`, `app-grid-box-manage`, `AppGrid.tiledrag.test.tsx`) run unchanged against their own mocks, whose saved set is empty. The collapsed-set case (two boxes folded, then arrange mode: ★ and pencil answer at their centre, keyboard box drag, width selector, no PUT) is in `tests/browser-gate/app-grid-group-header-718.spec.ts` at all three densities.
7. **AC-018's layout-shift sum** is measured at page level for the collapse wait itself: services load first, the saved set is held, and the swap from skeleton to grid shifts under 0.01. With services held too, an adult's health panel grows on load (SPEC-dashboard-empty-loading §8.1), so that case checks the grid inside its own section, as #722 does.
