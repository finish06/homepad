# Changelog

All notable changes to homepad are documented here.

Versions follow SemVer (Major.Minor.Patch) as declared in `package.json` — that
is the canonical app version and the one the footer version badge renders. The
"v7…v16" names are milestone/feature **codenames**, not version numbers; where a
codename maps to a release it is noted in the heading.

## [12.9.0] — 2026-07-02 — Restore favorites toggle + box rename/delete in the App Grid

### Added

- **Per-tile favorite toggle is back (#240).** The App Grid's tool tiles had
  dropped the favorite control the old Catalog ⋯ menu carried — `setFavorite` and
  the launcher **Favorites** section still existed, but there was no UI to pin or
  unpin. Each tile now shows a ★ toggle (a real `<button>` layered over the tool
  link, corner-anchored above it so a real center click lands on the star, not the
  navigation). Activating it pins/unpins via `POST`/`DELETE /api/favorites/{id}`
  (optimistic, with rollback on failure) and mirrors into the shared services
  context so the ⌘K launcher's Favorites section updates live. Available to every
  logged-in user in the normal view (favoriting is personal, not admin edit).
- **Box (category) rename + delete are back (#241).** `SPEC-app-grid §7` had
  deferred these to the old Catalog CategoryManager, which the App Grid replace
  retired — so admins could create boxes but not rename or delete them. In **Edit
  Dashboard** mode each real category box header now exposes **Rename** (inline
  editor → `PATCH /api/categories/{id}`, optimistic, reconciled to the server's
  canonical name, inline error + rollback on a 409 duplicate) and **Delete**
  (in-place confirm → `DELETE /api/categories/{id}`). Because the FK is
  `ON DELETE SET NULL`, a deleted box's apps fall back to **Uncategorized** — the
  client re-homes them live (clears `categoryId` in the shared services) so they
  don't vanish until reload, and rolls both back if the delete fails. The synthetic
  Uncategorized box and non-admins never get the controls.

### Fixed

- **App Grid drag-reorder browser-gate mock (#239).** The `#35` reorder gate mocked
  `PUT /api/categories/order` as HTTP 200, but the real API returns **204** and the
  client only treats 204 as success — so the keyboard drag-reorder rolled straight
  back under test. The gate mock now returns 204, matching the backend.

### Notes

- Per-tile **status dots (#242)** remain deferred (Caleb's call) — untouched here.
- Edit Dashboard mode + drag-to-rearrange (12.8.0), box width (1–6) + the width
  selector + `grid_width` persistence, the ≤640px 2-column layout, and the a11y
  contract are all unchanged by this restoration.

## [12.8.0] — 2026-07-02 — Restore Edit Dashboard + rearrange categories in the App Grid

### Added

- **Edit Dashboard mode + drag-to-rearrange categories are back.** The App Grid
  that replaced the old Catalog layout had dropped two features Caleb uses daily —
  a **regression**. The admin header gear now carries an **"Edit dashboard"**
  toggle (client-ephemeral, admin-only — a reload returns to view mode). While
  it's on, each real category box shows a drag grip; dragging reorders the boxes
  in the 6-column greedy-pack grid and **persists** the new shared order via
  `PUT /api/categories/order` (optimistic, with rollback if the save fails). The
  grip is a real keyboard-operable button (pointer + touch + keyboard sensors, an
  aria-live reorder announcement), so the a11y path is intact. The synthetic
  Uncategorized box stays pinned last and is not draggable. Box width (1–6), the
  width selector + `grid_width` persistence, and the ≤640px 2-column layout are
  unchanged. `SPEC-app-grid.md §7` updated to move these from "out of v1" to IN
  scope.

## [12.7.2] — 2026-07-01 — App Grid tile name keeps its distinguishing suffix (#195)

### Fixed

- **Sibling tiles with a shared prefix no longer become indistinguishable when a
  tile is narrow.** `ArchiveTeam Warrior1` and `ArchiveTeam Warrior2` previously
  both single-line end-ellipsized to `ArchiveTeam …` (at ≤173px tiles — the 6-col
  layout on a 2560px monitor, see #194), dropping the only identifying token and
  violating design-system principle #4. The `.app-grid-tool-name` rule now wraps
  to a second line (`-webkit-line-clamp: 2`, `overflow-wrap: anywhere`) instead of
  clipping to one, so the distinguishing trailing word stays on screen; names too
  long for two lines still ellipsize the last line, and the full string remains
  reachable via the existing `title` tooltip. CSS-only; CDP-verified at 173/235px.
  (This is the defensive half of #195 — #194 separately raises wide-monitor tiles
  back to ≥200px where names wrap cleanly at the space.)

## [12.7.1] — 2026-07-01 — App Grid fills the wide-monitor canvas (#194)

### Fixed
- The App Grid dashboard now fills the shared **1536px** content width instead
  of stopping short at **1392px** (a leftover from the v14 floating-panel
  layout). On a wide monitor the app tiles used to stay the same size as on a
  1440px screen — "more screen, same content", the tail of the #194 inversion.
  They now grow with the canvas (browser-measured tile width: 216px → 235px at
  2560px), stay ≥200px on desktop, and the grid right-aligns with the header and
  status bar. iPad and phone layouts are unchanged.

## [12.7.0] — 2026-07-01 — v14.1 floating-panel 4-column ceiling

### Changed

- **Category panels now cap at 4 columns on wide monitors, down from 6 (v14.1).**
  Product decision (Caleb + Walt): six columns read sparse on a wide screen, and
  four is the glance sweet spot. The responsive field ladder drops the `≥1300 → 6`
  tier, so it is now **4 / 3 / 2 columns** at `≥1024 / ≥768 / <768`. Panel span is
  still `clamp(appCount, 1, fieldCols)` — now capped at 4 — so a category with
  fewer than 4 apps still hugs its content with no phantom empty columns, and a
  larger category wraps to a second internal row past 4 tiles. Desktop tiles stay
  a fixed **190px** and the v12.6.1 mobile fluid-tile behavior (`minmax(0, 190px)`
  below 768px) is untouched — this only lowers the max column ceiling. Verified in
  a real browser (CDP): no horizontal page overflow at 1536/1440/1300/1024/768/390.
  Design doc `docs/homepad-floating-panel-layout.md` updated (Rev 2026-07-01c).

## [12.6.1] — 2026-07-01 — v14 mobile-overflow hotfix

### Fixed

- **Category panels no longer overflow the viewport on mobile (#212).** On a
  phone (~390px) the v14 floating panels ran past the right edge and the whole
  page scrolled sideways: a 2-column panel of fixed 190px slots was
  `2×190+16+32 = 428px` plus a 48px anchor ≈ 476px, well over the screen. Below
  768px the panel now spans the field and the tiles **shrink below 190px to
  fit** — a deliberate, **mobile-only exception** to the "tiles are fixed 190px
  slots and never stretch" principle (below), taken purely to avoid horizontal
  page overflow. The 48px left anchor also drops to the section's ~16px inset at
  mobile widths. **Desktop (≥1024px) is unchanged** — fixed 190px tiles, 48px
  anchor.

## [12.6.0] — 2026-07-01 — v14 Floating Panel Layout + Usage-Priority Ordering

### Floating glass panels + fixed 190px tiles (A-001…A-006)

The dashboard grid is reborn as a **floating panel field**. Each category — plus
Favorites and Uncategorized — is now its own **glass panel** that hugs its
content: a 3-app category spans three columns, a 5-app category spans five, and
panels **pack left-to-right and wrap** instead of each eating a full row with a
right-side void. Panels use frosted-glass tokens (semi-transparent fill, 10px
blur, 22px radius, layered shadow) in both light and dark mode.

Crucially, tiles are now **fixed 190px slots** and never stretch — fixing the
long-standing defect where a 1440px viewport bloated every tile to ~218px. The
field is responsive (6 / 4 / 3 / 2 columns at ≥1300 / ≥1024 / ≥768 / <768px) with
its left edge anchored at x=48. (**Mobile exception, added in 12.6.1 / #212:**
below 768px the tiles may shrink *below* 190px so a full-width panel fits a phone
without overflowing the page — the "never stretch" rule still holds; only the
"never shrink" side is relaxed, and only on mobile.)

### Usage-priority category ordering

Categories now **auto-sort by how often you open their apps** (rolling 30-day
window), so your most-used category lands top-left. Re-ranking is **stable, not
jittery**: it only happens on dashboard mount, at most once per 24 hours, and a
category only jumps a neighbour when the usage margin is clearly decisive
(hysteresis). A cold-start or cleared-data dashboard falls back to the familiar
admin order. In **Arrange mode** a new **Sort: Auto / Custom** toggle lets you
pin a manual drag order, with a **Reset to auto order** action to hand ordering
back to usage.

### Recently opened chip rail

The "Recently opened" row is restyled to match the panels: compact **name-only
glass chips** (44px tall tap targets, 28×28 icon plate) with the label in
AA-compliant neutral-500. Backed by a new timestamped `homepad.openLog` store
(migrated automatically from the old list) that also feeds the usage ranker.

## [12.5.1] — 2026-06-29

### Six columns at 1440px on large monitors (#201)

The large-monitor grid was rendering only **5 columns at a 1440px-wide viewport**
instead of the spec's **6** (AC-004). The auto-fill column template used a 220px
minimum track width; once the scrollbar (~15px) and the `px-4` page padding (32px)
are subtracted from 1440px, the ~1393px of usable width is **7px short** of fitting
six 16px-gapped 220px columns, so the browser silently dropped to 5.

Trimming the minimum track width to **210px** lets six columns fit (6×210 + 5×16 =
1340 ≤ 1393), giving ~219px tiles at 1440px. Narrower breakpoints are unchanged —
1024px stays 4 columns, 1280px stays 5 — and there is no column **inversion** at
2560px. A new **real-browser regression gate** (`large-monitor-grid.spec.ts`) now
asserts the 6-column count at 1440px so jsdom-green can no longer hide this class
of layout regression.

## [12.5.0] — 2026-06-29

### Gear becomes a unified edit-dashboard menu (v18)

The header **gear** is no longer a single Arrange toggle — it is now a **dropdown
menu** that gathers **every edit-dashboard action** behind one discoverable entry
point. One click on the gear and a user sees, role-appropriately:

- **My Dashboard** (all users): **Arrange tiles** (toggle, checkmark when on) and
  **Add apps** (opens the library).
- **Admin editing** (admins only, amber/shield section): **Edit tiles** (toggle
  for the per-tile icon controls, CategoryManager, and inline add) and **Add
  custom app** — which opens the service form **directly, without first entering
  edit mode**.

The gear icon stays **highlighted** whenever any editing mode is active (Arrange
or Edit tiles), so the "editing is on" signal persists with the menu closed. The
menu closes on outside click, Escape (focus returns to the gear), and after every
action.

The admin **"Edit dashboard"** item has moved **out of the avatar menu** into this
gear menu as **"Edit tiles"**; the avatar menu's "My Dashboard" section is now
symmetric for all roles ("Go to my dashboard"). The standalone "+ Add apps" button
above the grid and the "Done editing" banner exit are unchanged. No API changes.

## [12.4.1] — 2026-06-29

### Design-system alignment — light-mode contrast + 44px touch targets

Kare's v12.4.0 (9aaad1e) alignment review (`design-review-20260629.md`) found the
last-mile light-mode misses left after the #180–#185 a11y push. homepad is the
design system's **reference app**, so it must pass its own bar (AA contrast, ≥44px
targets through the iPad range).

- **#188** — the tile `⋯` menu glyph was `neutral-400` (#a3a3a3) on white = 2.52:1.
  Now `neutral-500` (4.75:1); dark keeps `neutral-400` (~7:1 on near-black).
- **#189** — the quick-launcher placeholder/glyph was #9aa3b8 = 2.53:1 → #6e6e6e
  (~5:1), and the bar grew from 36px to a 44px touch target.
- **#190** — the header settings gear was 36×36 (`h-9 w-9`) → 44×44 (`h-11 w-11`),
  matching the bell and tile `⋯` trigger beside it.
- **#191** — the header "Updated X ago" caption was `neutral-400` = 2.52:1 →
  `neutral-500` in light mode (dark unchanged). The "N not monitored" caption was
  already `neutral-500`.
- **#185** (advisory) — the "+ Add apps" button is now a ≥44px (`min-h-11`) target.

`#182` (account-avatar hit area) was verified already at 44×44 on `main` — the
44px hit box wraps the 34px disc (UserMenu, guarded by `A182`); the review measured
the disc, not the button. `#180/#181/#183` are verified fixed and closed.

## [12.4.0] — 2026-06-28

### App Library search — no-matches hint

Caleb's overnight ask was two App Library improvements: a **search filter** and
an **"Already added" badge**. Both were already shipped in the original
browse/add-from-library modal (`feat A16,A19`): the modal has a "Filter apps…"
input that filters by name, description and category, and an offer with
`added: true` already renders a "✓ Added" affordance instead of a plain "Add"
(it intentionally stays clickable as "Add again" — tested AC-D6 — rather than a
hard-disabled button).

The one genuine gap was in the search: when the filter excluded **every** app
the list rendered blank with no feedback. This release closes that:

- Typing a query that matches nothing now shows **"No apps match …"** (reusing
  the existing `launcher-no-results-title` token) instead of an empty list.
- Pure frontend, no backend change. `src/LibraryBrowse.tsx`.

## [12.3.0] — 2026-06-28

### Arrange mode — settings gear reveals tile reorder grips (#166)

A per-user **settings gear** now sits in the header (left of the alert bell),
shown to every logged-in user. Activating it turns on **Arrange mode**, which
reveals the per-tile **reorder grip** so tiles can be dragged into a new order;
turning it off tucks the grips away again for a clean, decluttered launcher.
Arrange is client-ephemeral — a reload returns to the normal view.

This reconciles the #166 Arrange work with the v12.2.0 (#174) per-tile menu that
shipped to production. Arrange gates **only** the reorder grip. The per-tile
**"⋯"** menu — **Favorite ★** and **Remove from dashboard** — stays present in
both the normal and the Arrange view; favoriting is not behind Arrange.
Favorited tiles still pin to the top Favorites section regardless of mode.

## [12.2.0] — 2026-06-28

### Remove from dashboard + tile descriptions

Two small dashboard improvements.

**Remove from dashboard.** The per-tile **"⋯"** menu previously offered only
*Favorite*. The only way to delete a service was the admin-and-edit-mode
`IconControls` card — so a non-admin user, whose dashboard is entirely their
own (v9), had no way to remove a service they had added. The "⋯" menu now
carries a **"Remove from dashboard"** item that opens a **compact in-menu
confirm** before deleting, available to every user on their own tiles. This
uses the already-owner-scoped `DELETE /api/services/{id}` — no API change.

**Service description on the tile.** The `description` field has always been
stored and returned by the API but was rendered as an empty element when blank.
It now renders as a single line beneath the service name when present, and is
**omitted entirely when empty** (no leftover gap).

Respects `SPEC-settings-admin-vs-user`: removing one's own tile is a personal,
per-user dashboard action — no new route, no global state.

## [12.1.0] — 2026-06-28

### Status Alert History (v17, #165)

Cap5 status-change toasts auto-dismiss in four seconds, so a user who stepped
away had no way to review what changed. v17 adds a **session-persistent,
in-memory alert log**: the v13 poller already diffs service status every ~60s,
so every transition it detects is now also recorded.

- A quiet **bell icon** in the header (right of ⌘K, left of the avatar) with an
  unread badge that appears at ≥1 and caps the display at `99+`.
- Clicking the bell opens the **Alert History panel** (same overlay chrome as
  the ⌘K launcher) listing transitions newest-first — service name, a colored
  from→to status-dot pair, a timestamp, and a "Visit" link that opens the
  service in a new tab. Opening clears the badge; the list survives.
- In-memory only (last 50 events, ring-buffered); resets on reload/logout. No
  backend, no localStorage. The first poll after load records nothing (baseline).
- Escape / ✕ / scrim / a second bell click all close the panel and return focus
  to the bell. One overlay at a time — opening the launcher closes the panel.
- `src/alerts.tsx` (provider + `statusDotClass` helper), `src/AlertHistoryPanel.tsx`,
  bell in `src/AppHeader.tsx`, transition capture in `src/services.tsx`, wiring in
  `src/App.tsx`.

## [12.0.3] — 2026-06-27

### Status-Change Toasts No Longer Replay Stale Alerts (#147)

The status-change toast system left `recentChanges` populated after the
`ToastContainer` consumed it, so any remount of the container would resurrect a
prior poll's status flips as ghost toasts. The container now resets
`recentChanges` to `[]` after consumption, so a remount has nothing stale to
replay.

- `src/Toasts.tsx`: clear `recentChanges` once its toasts have been queued.
- `src/services.tsx`: expose the reset alongside `recentChanges`.

## [12.0.2] — 2026-06-26

### Footer Version Shows the Build SHA, Not "(dev)" (#157)

The prod footer badge read `homepad v12 (dev)` instead of the build's short
commit SHA. The Docker build stage only COPYs the source tree (no `.git`), so
`vite.config.ts`'s `git rev-parse` always threw and `__GIT_SHA__` fell back to
`'dev'`. The image build now threads the commit SHA in as a `GIT_SHA` env var and
Vite reads it first, falling back to git then `'dev'`.

- `Dockerfile`: build stage `ARG GIT_SHA` → `ENV GIT_SHA` before `npm run build`.
- `vite.config.ts`: read `process.env.GIT_SHA` first, then git, then `'dev'`.
- Requires ci-shared to pass `--build-arg GIT_SHA=<short-sha>` on `docker build`.

### Dark-Mode Contrast on the Edit-Dashboard Categories Section (#158)

The admin "Categories" manager (shown in edit mode) carried only light-mode
styling, so its inputs and Add / Save / Delete buttons read washed-out against
the dark panel. Added `dark:` variants — same class of fix as #29.

- `Catalog.tsx`: `dark:` variants on the `CategoryManager` / `CategoryRow`
  inputs and buttons.

## [12.0.1] — 2026-06-26

### Quick-Peek Degraded Dot Fix (#155)

The status quick-peek popover rendered DEGRADED services with an amber dot. They
now render a red dot, matching DOWN — degraded is a problem state and should read
as one.

- `StatusBar.tsx`: DEGRADED maps to the red status dot like DOWN in the popover.

## [12.0.0] — 2026-06-26 — v15 + v16

The v15 and v16 milestones shipped together as 12.0.0.

### Status Bar Quick-Peek (#153) — v16

The status-bar summary chips (UP / DOWN / NOT MONITORED) are now clickable. Each
opens a popover listing the services in that bucket — every row a new-tab link to
the app, with a status dot, alphabetical by name. One popover open at a time;
dismiss on outside click, on Escape (focus returns to the chip), or by re-clicking
the open chip.

- `StatusBar.tsx`: `StatusPeekPopover` (role `dialog`), per-chip trigger buttons,
  outside-click + Escape handlers. The DOWN chip's bucket is DOWN **and** DEGRADED.

### Version Badge Footer + Changelog Overlay (#152) — v15

The footer shows the running app version and short git SHA, injected at build time
via Vite `define` (`__APP_VERSION__` / `__GIT_SHA__`). Clicking the version badge
opens a changelog overlay that browses what shipped in each release, sourced from a
static `src/changelog.json` with a fixed 88px chip gutter (feature / enhancement /
bug-fix / security).

- `ChangelogOverlay.tsx`, `src/changelog.json`, version-footer in `App`.

## [11.0.0] — 2026-06-23 — v14

### Dashboard Status & Recency

- Dashboard status summary bar — at-a-glance up/down/unknown counts across all tiles.
- Recently opened row — a localStorage-backed recency strip of the apps you last launched.
- Uptime sparkline dots gain a hover tooltip with the per-check timestamp and status.
- Ambient status-change toasts — a quiet alert when a service flips up or down.

## [10.0.0] — 2026-06-23 — v13

### Live Status Auto-Refresh

- Live status auto-refresh with a "last updated" indicator — tiles repoll without a
  page reload.

## [9.0.0] — 2026-06-19 — v12

### Settings Boundary Clarity

- The user menu splits into "My Dashboard" (all users) and "Administration"
  (admin only).
- Per-field `[env]` badges mark admin settings sourced from environment configuration.

## [8.0.0] — 2026-06-18 — v11

### Admin/Personal Scope Clarity (#52/#55/#61)

The admin vs. personal settings split was confusing after the v9 per-user model
shipped: "Edit dashboard" and "Admin settings" sat side by side with no scope
signal, the Settings modal was titled "Settings" (reads as personal, behaves as
global), and non-admins had no explanation of where their settings lived.

**Changes:**
- `UserMenu.tsx`: ADMIN section divider (shield icon, amber styling) groups
  admin-only items and separates them from personal actions. "Edit dashboard"
  gets a **personal** scope tag; "Admin settings" gets a **global** scope tag
  (amber). Non-admin users see a "Your tiles… are your personal dashboard" note.
- `SettingsPanel.tsx`: modal retitled **"Admin Panel"** (was "Settings");
  subtitle added: "Changes here are global — they affect all users on this
  homepad." App Library section note updated to say "all users"; System section
  note updated to say "globally to all accounts."
- `Catalog.tsx` (#61): edit-mode banner "Editing your personal dashboard" is
  gated on `adminEdit` (not the general `editMode` flag) so it shows exactly
  when an admin is editing their personal tiles.

All existing `data-testid` values preserved. 327 vitest passing, 0 axe
violations (jest-axe on UserMenu admin role).

### UserMenu Dropdown Z-Index Fix (#57/#58)

The sticky `<header>` at `z-10` established a stacking context; the tile
drag-grips (also `z-10`, later in DOM order) painted over the open UserMenu
dropdown, making menu items unreachable while tiles were present.

**Fix:** `AppHeader.tsx` header lifted from `z-10` → `z-20`. This clears the
grips' `z-10` while remaining below the launcher overlay (`z-60`) and
ServiceForm modal (`z-20` but rendered after the header, so DOM order prevails).

### Real-Browser Regression Gate for Z-Index (#59/#60)

`tests/browser-gate/header-zindex.spec.ts` added: a Playwright spec that opens
the UserMenu dropdown, finds every drag-grip that geometrically overlaps the
dropdown, and asserts `document.elementFromPoint` at each overlap centre returns
a node inside the dropdown, not the grip. This test is invisible to jsdom (no
z-index, no hit-testing) and requires real Chromium — same pattern as the #35
gate. Reverts the header to `z-10` → this spec goes red.

---

## [7.0.0] — 2026-06-13 — v10

Always-on tile drag-and-drop (dnd-kit), per-tile "⋯" overflow menu, real-browser
gate for pointer/touch interactions (#35 fix: menu open on pointerup; dismiss on
pointerdown to guard against synthetic touch tap teardown).

## [6.0.0] — 2026-06-05 — v9

Per-user dashboards: personal tile ordering, favorites, App Library
browse/add (per-user), admin catalog CRUD, admin Settings panel (shared
App Library + read-only system config).

## [5.0.0] — earlier — v8

Command Launcher (⌘K / search overlay, keyboard navigation).

## [4.0.0] — earlier — v7

UX redesign: dark/light theme, redesigned header, UserMenu, v7 design tokens.
