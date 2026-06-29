# Changelog

All notable changes to homepad are documented here.

Versions follow SemVer (Major.Minor.Patch) as declared in `package.json` — that
is the canonical app version and the one the footer version badge renders. The
"v7…v16" names are milestone/feature **codenames**, not version numbers; where a
codename maps to a release it is noted in the heading.

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
