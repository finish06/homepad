# homepad v3 — Theme Mode (System / Light / Dark) — Spec

**Status:** Draft, awaiting sign-off
**Authors:** Stitch (Claude Code) + Caleb Dunn
**Last updated:** 2026-06-10
**Methodology:** ADD (getadd.dev), POC maturity dial
**Builds on:** [`specs/v1-launcher.md`](./v1-launcher.md), [`specs/v2-app-icons.md`](./v2-app-icons.md)

---

## Problem

v1's visual direction promised "light + dark, system-aware default. Per-user
theme override stored on the account." That promise is **not yet implemented**:
there is no theme code in `homepad` (`src/` has no theme provider, no
`prefers-color-scheme` handling, no per-user theme persistence), and the catalog
renders one fixed surface.

v2 then made this gap load-bearing. The v2 icon precedence chain resolves a
tile's image against the **active theme** (`GET /api/services/{id}/icon/light`
vs `/icon/dark`) and says "switching theme re-points the `src` … with no
reload." But **nothing currently defines or owns "active theme."** Without a
real theme model, v2's light/dark icon variants can never be exercised by a
user — there's no control that flips `T ∈ {light, dark}`.

v3 closes both gaps with one small, user-facing feature.

## v3 Goal

A user-facing **theme setting with three options — System / Light / Dark** —
that:

1. persists **per-user** so it follows the account across devices and sessions,
2. drives the whole app's light/dark surface, with **System** following the OS
   `prefers-color-scheme` live, and
3. provides the single source of truth for v2's **active theme**, so the
   light/dark **app-icon variant** is selected by the theme the user is actually
   looking at.

**Default = System.**

## In scope (v3)

- A **theme preference** with three values: `system` | `light` | `dark`.
- **Per-user persistence in Postgres** (recommended over `localStorage` — see
  "Where the preference lives"), surfaced on `GET /api/me` and written via a
  new `PATCH /api/me` (or `PUT /api/preferences`) endpoint.
- A **resolved active theme** (`light` | `dark`) derived from the preference +
  the OS `prefers-color-scheme`, applied to the document so all surfaces,
  including v2 tile icons, react to it.
- A **theme control** in the UI (placement defined below).
- **Live OS following** when the preference is `system`: a change to the OS
  setting flips the app with no reload and no extra click.
- An **anti-flash** first-paint strategy so the page never flashes the wrong
  theme before the user's preference loads.
- Wiring v2's icon precedence to the resolved active theme.
- Additive DB migration + back-compat with the existing `users` rows and the
  seeded 39-app catalog (catalog is untouched by this feature).

## Out of scope (deferred)

- **Custom themes / accent colors / per-user palettes** — v3 is strictly the
  three-way light/dark/system switch over v1's existing monochrome + one-accent
  palette. (NEEDS JOE if Caleb wants user-pickable accent later — that's a
  separate spec.)
- **Per-device (as opposed to per-account) theme** — the preference is an
  account property, same model as v1 favorites/layout. A "this device only"
  override is a possible v4+ nicety, not now.
- **Scheduled / sunset-based auto-switching** ("dark after 8pm") — `system`
  already delegates that to the OS; a homepad-native scheduler is out.
- **Theming the login/register screens differently** — those honor the same
  resolved theme, but since they render *before* a user (and thus before a
  stored preference) exists, they fall back to **System** (see "Anonymous /
  pre-auth" below). No separate pre-auth control.
- **High-contrast / reduced-motion accessibility modes** — respect the existing
  `prefers-reduced-motion` from v1 motion rules; no new a11y theme tiers here.

## Stack delta

No new stack. Backend stays Go (`homepad-api`), persistence stays the single
Postgres, frontend stays React + Vite + TS + Tailwind. New moving parts:

- One additive column on `users` (`theme_pref`), one read (already on `/api/me`)
  + one tiny write endpoint.
- One frontend **theme provider** (context) + a small inline first-paint script.
- Tailwind's existing dark-mode mechanism (class strategy) toggled by that
  provider.

No PVC, no new infra, no new env vars.

---

## Where the preference lives — tradeoffs

| Option | Pros | Cons |
|---|---|---|
| **Per-user in Postgres** (recommended) | Follows the account across every device/browser — matches v1's model for favorites + layout (personal state lives server-side); survives cache clears; one source of truth; trivially surfaced on the already-existing `GET /api/me` | One additive column + one write endpoint; a first-paint needs an anti-flash strategy (addressed below) |
| **`localStorage` only** | Zero backend change; instant first paint with no round-trip | **Per-device, not per-user** — log in on a new phone and your theme is gone; clearing site data resets it; diverges from how every other personalization (favorites, order, soon icons) already works (server-side); two sources of truth if we later *also* sync |

### Recommendation: **Per-user in Postgres**, with `localStorage` as a
**first-paint cache only** (not the source of truth).

Homepad already treats personalization as account state (favorites, manual
order both live in Postgres keyed by `user_id`). Theme is the same kind of
fact, so it belongs in the same place — log in anywhere, your theme comes with
you. We use `localStorage` **purely as a render-time cache** to kill the
first-paint flash: the last-known resolved theme is mirrored there so the inline
boot script can apply a surface class before React (and the `/api/me` response)
loads. The server value always wins once `/api/me` resolves; the cache is an
optimization, never the truth.

---

## Data model

### Schema (additive migration `0003_theme_pref.up.sql`)

```sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS theme_pref TEXT NOT NULL DEFAULT 'system'
    CHECK (theme_pref IN ('system', 'light', 'dark'));
```

- **`NOT NULL DEFAULT 'system'`** means every existing user row (and the
  first-registered admin) gets **System** automatically — zero data migration,
  matches the stated default.
- `CHECK` mirrors the v1/v2 pattern (`role`, `variant`) of constraining the
  enum at the DB layer so a bad value can never persist.

`0003_theme_pref.down.sql` is `ALTER TABLE users DROP COLUMN IF EXISTS
theme_pref;` — clean rollback, nothing else references it.

### API surface

| Method | Path | Body | Result |
|---|---|---|---|
| `GET`   | `/api/me` | — | **unchanged shape + one field**: `{id, email, role, themePref}` |
| `PATCH` | `/api/me` | `{"themePref": "system"\|"light"\|"dark"}` | 200 with the updated `userView`; **400** on any other value; **401** if not logged in |

- `PATCH /api/me` is **session-gated only** (any logged-in user sets their *own*
  theme — it's personalization, not an admin action). It writes the current
  user's row only; there is no path to set another user's theme.
- `themePref` is added to the existing `userView` struct
  (`internal/api/auth.go`) returned by `handleRegister`, `handleLogin`, and
  `handleMe`, so the client learns the stored preference on every auth
  touchpoint — no extra round-trip.
- An invalid `themePref` is rejected server-side with **400** (the `CHECK` is a
  backstop; the handler validates first for a clean error).

> The endpoint is named `PATCH /api/me` to leave room for future per-user
> account fields (display name, etc.) without inventing a new route each time.
> If Caleb prefers a dedicated `PUT /api/preferences`, the contract is identical
> — see NEEDS JOE Q2.

---

## How the preference drives the app

### Three concepts, kept distinct

1. **`themePref`** — what the user chose: `system` | `light` | `dark`. Stored
   server-side; the thing the control mutates.
2. **OS preference** — `window.matchMedia('(prefers-color-scheme: dark)')`,
   `dark` or `light`. Read live, never stored.
3. **Resolved theme** — the actual surface rendered, always `light` | `dark`:
   - `themePref === 'light'` → `light`
   - `themePref === 'dark'` → `dark`
   - `themePref === 'system'` → mirror the OS preference (and **re-resolve live**
     when the OS flips).

The resolved theme is applied by toggling a class on `<html>` (`class="dark"` /
absent), which is Tailwind's `darkMode: 'class'` strategy. Every existing
surface already styled with Tailwind picks this up; new dark variants are added
with `dark:` utilities where v1's palette needs them.

### Live OS following

A `ThemeProvider` (React context) holds `themePref` and subscribes to the
`matchMedia` `change` event **only while `themePref === 'system'`**. When the OS
flips and the pref is `system`, the resolved theme updates and the `<html>`
class re-toggles with **no reload and no user action** — and because v2 icon
`src` is a derived value off the resolved theme, the tile icons swap variants in
the same render.

### Anti-flash first paint

To avoid a white flash on a dark-preferring user (or vice-versa):

- A tiny **inline script in `index.html`** (runs before the React bundle) reads
  the `localStorage` first-paint cache (and, absent that, the OS preference) and
  sets the `<html>` class immediately. This is the standard no-FOUC dark-mode
  pattern.
- Once the app boots and `/api/me` resolves, the **server `themePref` becomes
  authoritative**: the provider recomputes the resolved theme and updates both
  the `<html>` class and the `localStorage` cache. In the common case
  (cache == server) nothing visibly changes; if they differ (e.g. theme changed
  on another device), it reconciles to the server value once, smoothly.

### Anonymous / pre-auth

Login and register render before any user (and thus any `themePref`) exists.
They resolve to **System** via the same inline script (OS preference, or the
`localStorage` cache from a prior session on this device). There is **no theme
control on the pre-auth screens** — the setting is an account property and
appears once logged in.

---

## Frontend

### The control — placement

**Recommendation:** a **three-segment control (System / Light / Dark)** living
in a small **account / user menu** in the catalog header (the same header that
v2 puts the admin "Edit" toggle in). A segmented control (not a bare toggle)
because there are three states, and "System" must be explicitly selectable — a
two-state toggle can't express "follow the OS."

- It renders for **every** logged-in user (personalization, not admin-gated —
  contrast with v2's admin-only Edit toggle).
- Choosing a segment: optimistically applies the resolved theme immediately
  (instant feedback), fires `PATCH /api/me`, and on failure rolls back to the
  prior value with an inline message — the **same optimistic-with-rollback
  pattern** as favorites/reorder in `Catalog.tsx`.
- The currently-active segment is visually marked; when `system` is active, a
  subtle hint shows what the OS is currently resolving to (e.g. "System ·
  Dark") so the user understands why the surface looks the way it does.

> **NEEDS JOE (Q1):** exact home of the control — a header user-menu (Stitch's
> lean, lowest footprint) vs. a dedicated Settings page. Note v6
> (`specs/v6-admin-settings.md`, if/when it lands) introduces an admin settings
> surface; theme is **per-user, not admin**, so it should not live behind an
> admin gate regardless. If a *user* settings page emerges later, the control
> can move there with no contract change.

### Type changes

`src/api.ts`:

```ts
export type ThemePref = 'system' | 'light' | 'dark';
export type User = { id: string; email: string; role: string; themePref: ThemePref };

export async function setThemePref(pref: ThemePref): Promise<boolean> {
  const res = await fetch('/api/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ themePref: pref }),
  });
  return res.status === 200;
}
```

`User` gains `themePref`; existing callers that ignore it keep compiling. The
`ThemeProvider` reads it from the `me()` result on boot.

### v2 icon wiring (the payoff)

v2 already says the icon `src` is "a derived value off the theme state." v3
makes that theme state concrete: the v2 precedence chain consumes the
**resolved theme** from `ThemeProvider`. So:

- Resolved `light` → tile tries `/api/services/{id}/icon/light` first.
- Resolved `dark`  → tries `/icon/dark` first.
- Flipping the theme control (or the OS, under `system`) re-points every tile's
  icon `src` in the same render, no reload — exactly v2 A7.

This spec **owns** the definition of "active theme" that v2 A7/A8 reference;
those v2 ACs are now testable end-to-end because a real control can flip `T`.

---

## Acceptance criteria (v3 theme — testable)

v1's A1–A11 and v2's A1–A14 still hold unchanged. New:

| # | Criterion | How verified |
|---|---|---|
| A1 | A logged-in user sees a three-option theme control (System / Light / Dark) in the header user menu | Component test: render catalog as a logged-in user, assert all three options present |
| A2 | Default for a brand-new user is **System** | API integration: register → `GET /api/me` returns `themePref:"system"`; component: fresh user resolves to OS preference |
| A3 | Selecting **Light** sets a light surface; selecting **Dark** sets a dark surface (`<html>` dark class toggles accordingly) | Component test: click Light → assert no `dark` class; click Dark → assert `dark` class on `<html>` |
| A4 | Selecting **System** makes the app follow the OS; flipping the mocked `prefers-color-scheme` re-resolves the surface **with no reload** | Component test: pref=system, mock `matchMedia` dark→light, assert `<html>` class flips without remount |
| A5 | The preference **persists per-user**: set Dark, reload (and log in on a fresh client), theme is still Dark | API integration: `PATCH /api/me {dark}` → new session `GET /api/me` returns `dark`; component reflects it on boot |
| A6 | `PATCH /api/me` accepts only `system\|light\|dark`; any other value → **400** and the stored value is unchanged | API integration: `PATCH {themePref:"neon"}` → 400; `GET /api/me` still prior value |
| A7 | `PATCH /api/me` requires a session — unauthenticated → **401**; a user can only change **their own** theme (no path to set another user's) | API integration: no cookie → 401; assert handler writes only `currentUser` row |
| A8 | First paint does **not** flash the wrong theme for a dark-preferring user | Component/E2E: with cached/OS = dark, assert `<html>` has the dark class on first paint (inline boot script), before React mounts |
| A9 | v2 icon variant follows the **resolved** theme: under resolved-light a tile requests `/icon/light`, under resolved-dark `/icon/dark`, and switching the control swaps `src` with no reload | Component test: both icon flags true, toggle theme, assert `src` switches between `/icon/light` and `/icon/dark` (this is v2 A7 driven by a real control) |
| A10 | Setting `themePref` is optimistic with rollback: a failed `PATCH` reverts the control + surface to the prior value with an inline error | Component test: mock `PATCH` 500, assert UI rolls back |
| A11 | The `users.theme_pref` column is additive; existing rows read back `system`; migration up+down is clean | Smoke: migrate `0003` against a DB with existing users → all `theme_pref='system'`; run `0003…down` → column gone, app reverts to no-control behavior |
| A12 | Pre-auth (login/register) screens render without a theme control and honor System (OS/cache) | Component test: render login logged-out, assert no theme control, assert resolved theme = mocked OS preference |

---

## Migration / back-compat

- **Additive migration only** (`0003_theme_pref.up.sql` / `.down.sql`): one
  `ALTER TABLE users ADD COLUMN theme_pref … DEFAULT 'system'`. No other table
  touched; the **seeded 39-app catalog and `services` schema are entirely
  untouched** — theme is a `users` property, orthogonal to the catalog.
- **Zero data migration.** Every existing user row defaults to `system`, which
  is exactly the intended default, so nobody's experience changes on rollout
  except that the new control appears.
- **API back-compat:** `GET /api/me` (and login/register responses) only *add*
  `themePref`; any older/cached client ignores the new field. `PATCH /api/me`
  is a new route — no existing route changes.
- **Rollback:** `0003…down.sql` drops the column; with the column gone the app
  falls back to System-only behavior (OS + `localStorage` cache), i.e. v1/v2
  visual behavior. Nothing else references `theme_pref`.

---

## Deployment contract delta (for Joe)

Almost nothing changes from v1/v2:

| Concern | v3 delta |
|---|---|
| Persistent storage | **Still none** — preference is one column in the existing Postgres |
| New env vars | None |
| New endpoints | `PATCH /api/me` — under the existing `/api/*` route + session model; no new Ingress/Pangolin rules |
| DB | One additive migration (`0003`); run before/at rollout like any other |
| Replicas | Still 1 (unchanged) |
| Frontend | One inline boot script in `index.html` (anti-flash) — no new asset, no CSP change beyond allowing the existing same-origin inline bootstrap (flag if CSP is tightened later) |

---

## Open decisions (NEEDS JOE)

| # | Question | Stitch's lean |
|---|---|---|
| Q1 | Control placement: header user-menu vs. a dedicated user Settings page | **Header user-menu** — lowest footprint; can migrate to a user-settings page later with no API change |
| Q2 | Write endpoint shape: `PATCH /api/me {themePref}` vs. a dedicated `PUT /api/preferences` | **`PATCH /api/me`** — one place for future per-user account fields |
| Q3 | Persistence: per-user Postgres (recommended) vs. `localStorage`-only | **Per-user Postgres** + localStorage as first-paint cache only — matches favorites/layout model |
| Q4 | Should `system` re-resolve live on OS change, or only on reload? | **Live** — matches user expectation; cheap `matchMedia` listener |

---

**Next ADD phase after sign-off:** test-writer → failing tests for A1–A12
(API integration in `homepad-api`: migration `0003`, `theme_pref` on `userView`,
`PATCH /api/me` handler with 400/401 cases; component tests in `homepad`:
`ThemeProvider`, segmented control, anti-flash boot, v2 icon re-point) →
RED→GREEN→REFACTOR→VERIFY. Backend slice (`0003` + `userView.themePref` +
`PATCH /api/me`) lands first so the web `ThemeProvider` has a real store to read
and write.
