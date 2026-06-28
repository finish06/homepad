# Changelog

All notable changes to homepad are documented here.

Versions follow SemVer (Major.Minor.Patch) as declared in `package.json` — that
is the canonical app version and the one the footer version badge renders. The
"v7…v16" names are milestone/feature **codenames**, not version numbers; where a
codename maps to a release it is noted in the heading.

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
