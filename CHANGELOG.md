# Changelog

All notable changes to homepad are documented here.
Versions align with the homepad milestone naming: v9, v10, v11 → semver major.

## [16.0.0] — 2026-06-26

### Status Bar Quick-Peek (#153)

The status-bar summary chips (UP / DOWN / NOT MONITORED) are now clickable. Each
opens a popover listing the services in that bucket — every row a new-tab link to
the app, with a status dot, alphabetical by name. One popover open at a time;
dismiss on outside click, on Escape (focus returns to the chip), or by re-clicking
the open chip.

- `StatusBar.tsx`: `StatusPeekPopover` (role `dialog`), per-chip trigger buttons,
  outside-click + Escape handlers. The DOWN chip's bucket is DOWN **and** DEGRADED.

## [15.0.0] — 2026-06-26

### Version Badge Footer + Changelog Overlay (#152)

The footer shows the running app version and short git SHA, injected at build time
via Vite `define` (`__APP_VERSION__` / `__GIT_SHA__`). Clicking the version badge
opens a changelog overlay that browses what shipped in each release, sourced from a
static `src/changelog.json` with a fixed 88px chip gutter (feature / enhancement /
bug-fix / security).

- `ChangelogOverlay.tsx`, `src/changelog.json`, version-footer in `App`.

## [14.0.0] — 2026-06-23

### Dashboard Status & Recency

- Dashboard status summary bar — at-a-glance up/down/unknown counts across all tiles.
- Recently opened row — a localStorage-backed recency strip of the apps you last launched.
- Uptime sparkline dots gain a hover tooltip with the per-check timestamp and status.
- Ambient status-change toasts — a quiet alert when a service flips up or down.

## [13.0.0] — 2026-06-23

### Live Status Auto-Refresh

- Live status auto-refresh with a "last updated" indicator — tiles repoll without a
  page reload.

## [12.0.0] — 2026-06-19

### Settings Boundary Clarity

- The user menu splits into "My Dashboard" (all users) and "Administration"
  (admin only).
- Per-field `[env]` badges mark admin settings sourced from environment configuration.

## [11.0.0] — 2026-06-18

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

## [10.0.0] — 2026-06-13

Always-on tile drag-and-drop (dnd-kit), per-tile "⋯" overflow menu, real-browser
gate for pointer/touch interactions (#35 fix: menu open on pointerup; dismiss on
pointerdown to guard against synthetic touch tap teardown).

## [9.0.0] — 2026-06-05

Per-user dashboards: personal tile ordering, favorites, App Library
browse/add (per-user), admin catalog CRUD, admin Settings panel (shared
App Library + read-only system config).

## [8.0.0] — earlier

Command Launcher (⌘K / search overlay, keyboard navigation).

## [7.0.0] — earlier

UX redesign: dark/light theme, redesigned header, UserMenu, v7 design tokens.
