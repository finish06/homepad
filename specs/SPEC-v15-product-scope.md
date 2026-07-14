# Homepad v15 — Product Scope

**Author:** Walt (product lead)
**Date:** 2026-07-14
**Status:** approved — co-signed with Kare, cleared for build
**Design spec:** `design/SPEC-v15-design-system.md` (PR #347, Kare)
**Supersedes visual layer of:** v14.0.2
**Preserves:** every v14 feature — this is a reskin, not a feature cut

---

## 1. Product intent

v15 is a visual overhaul of homepad: a frosted-glass design system (dark-first, full light mode, 8 accent themes) that brings the dashboard up to the quality bar Caleb set in the reference mockup. The underlying feature set, data model, and all five service-status states are unchanged from v14.0.2.

The user experience goal: the dashboard should feel polished enough to leave visible on a TV or monitor as a live ops surface — it should *look* like it knows what it's doing, not just *work* like it does.

---

## 2. What v15 is (and is not)

**Is:**
- Glass-morphism reskin: frosted panels, soft shadows, backdrop-filter blur, tinted ambient field
- Dark-first with full light mode (System/Light/Dark, server-persisted)
- 8 user-selectable accent themes (replaces v14's 7; see §5.2)
- New health-summary panel replacing the old count strip (see §5.3)
- Measured a11y corrections applied at build time (from `design/SPEC-v15-design-system.md §9`)
- All five service states carried forward: up / down / degraded / unknown / idle

**Is not:**
- A feature addition — no new services, categories, or auth changes
- A rebuild — ~80% restyle of existing components, one new surface (health panel)
- A removal of any v14 capability

---

## 3. Product acceptance criteria

Ordered by user-visible surface. Maps to the design spec sections in parentheses.

### 3.1 Overall experience

| ID | Criterion |
|----|-----------|
| AC-V15-001 | In dark mode with any accent, the dashboard looks like the reference mockup (`design/v15-example.html`) — frosted panels, rounded tiles, tinted ambient field. |
| AC-V15-002 | In light mode with any accent, the dashboard is clearly a light-mode version of the same design — pale tinted field, frosted glass, same layout. |
| AC-V15-003 | Switching accent theme updates the ambient field, wordmark gradient, avatar, and focus rings without reloading the page. Tile category colors do not change when accent changes. |
| AC-V15-004 | No v14 feature is missing: ⌘K command palette, arrange mode, favorite/remove menu, uptime sparkline toggle, per-tile click action, description, 5 status states (up/down/degraded/unknown/idle), light/dark icon tabs in edit modal. |
| AC-V15-005 | `prefers-reduced-motion` suppresses all animation and transitions. Tiles render at rest; the down-status dot is static; panels appear immediately. |

### 3.2 Health summary panel (new surface, §4.2 of design spec)

| ID | Criterion |
|----|-----------|
| AC-V15-010 | The top of the dashboard shows a health summary panel (glass panel) replacing the old count strip. |
| AC-V15-011 | **Operational state:** when all services are up, idle, or unknown, the panel shows a green LED, headline "All systems operational", and a sub-line "{N} services across {G} groups · {M} monitored". |
| AC-V15-012 | **Attention state (any down):** panel shows a red LED, headline "1 service needs attention" / "N services need attention" (N = count of down + degraded combined), plus online/degraded/offline count chips. |
| AC-V15-013 | **Attention state (degraded only, no down):** panel shows an amber LED, same headline copy pattern as AC-V15-012, amber chips for degraded count. |
| AC-V15-014 | **Loading state:** panel shows a pulsing neutral LED and "Checking services…" with skeleton chips. |
| AC-V15-015 | **Empty state (no services):** panel shows "No services yet" headline and "Add your first service to get started" sub-line; meter and chips hidden. |
| AC-V15-016 | **Stale data:** when service data is >5 min old, the freshness label turns amber; >15 min old, it turns red. The health headline and LED reflect last-known status and do not change on stale alone. |
| AC-V15-017 | Offline and degraded chip counts >0 are colored with severity color (red/amber), not muted (see §9 correction #3 of design spec). |
| AC-V15-018 | `idle` and `unknown` service states never promote the LED to red or amber. |

### 3.3 Service tiles

| ID | Criterion |
|----|-----------|
| AC-V15-020 | Tiles render in the glass style: frosted background, rounded 18px, soft shadow. |
| AC-V15-021 | **All five status states render distinctly** — up (green dot), down (red pulsing dot + left bar + tinted border), degraded (amber dot + left bar, no pulse), unknown (neutral dot), idle (dashed ring, dimmed name/meta without blanket opacity). |
| AC-V15-022 | Idle tiles are dimmed via token-level approach (name `--muted`, reduced icon tint, dashed ring) — NOT `opacity:.52`, which fails contrast. Idle tile name and meta pass WCAG AA. |
| AC-V15-023 | Category tints (Develop/Kids/External/Friends/Media) are independent of the accent theme. Changing accent leaves tile icon tints unchanged. |
| AC-V15-024 | Tile hover lifts 2px. Focus ring uses `--accent-3` (2px). Both respond in ≤180ms. |
| AC-V15-025 | The sparkline, ⋯ menu (favorite/remove), arrange-mode grip, and service description all exist and work as in v14. |

### 3.4 Topbar

| ID | Criterion |
|----|-----------|
| AC-V15-030 | Topbar renders as a glass pill with: brand mark + wordmark, ⌘K search trigger, freshness label, gear/edit menu (admin), alert bell, mode toggle, avatar. |
| AC-V15-031 | Mode toggle, avatar, and search pill all have ≥44×44px hit areas (verified on iPad). |
| AC-V15-032 | The topbar accent swatch row from the mockup is **not** present in the topbar. Swatches are under the profile menu's Appearance section. |
| AC-V15-033 | On phone (390px) the topbar does not show a swatch row and fits without a third wrap row. |

### 3.5 Profile menu — Appearance section

| ID | Criterion |
|----|-----------|
| AC-V15-040 | The profile/avatar menu has an Appearance section containing: (a) the mode control (System / Light / Dark), (b) the accent color picker (8 swatches). |
| AC-V15-041 | Mode control is a 3-way System/Light/Dark selection (not a binary toggle). The "System" option is present and follows `prefers-color-scheme`. Selection persists server-side via `PATCH /api/me {themePref}`. |
| AC-V15-042 | Accent swatches have ≥44×44px hit areas. Selected state is clearly indicated (ring). All 8 accents are present: blue, teal, green, yellow, orange, red, pink, purple. |
| AC-V15-043 | Stored accent values `indigo` and `violet` are silently migrated to `purple` on first load. Any other unknown stored value falls back to `blue`. |

### 3.6 ⌘K command palette

| ID | Criterion |
|----|-----------|
| AC-V15-050 | The command palette (`⌘K` / search trigger) opens and renders in the v15 glass style (centered modal, radius 24, backdrop blur). |
| AC-V15-051 | Existing behavior is fully preserved: grouped by category, per-row status dot, category tint, Favorites pinned, keyboard navigation. |

---

## 4. Out of scope (v15)

- New features: new service states, new settings, new auth or admin flows
- Rebuilding the data model or API contracts
- Changing the sparkline toggle behavior (off by default — see §5.4)
- A top-level accent swatch bar in the topbar
- A binary (non-3-way) mode toggle
- Any v14 feature removal

---

## 5. Product decisions (§10 of design spec, resolved)

These resolve the four open calls Kare flagged.

### 5.1 Mode toggle placement

**Decision: single 3-way System/Light/Dark control under the profile Appearance section. No additional top-level sun/moon toggle.**

v14's `ThemeControl` already implements System/Light/Dark with server persistence via `PATCH /api/me {themePref}`. Moving the mode toggle to the topbar as a binary would drop the System option and create two sources of truth for mode state. Users reach the profile menu for the accent picker anyway — mode belongs there too, as a single coherent Appearance section. Low friction; no capability loss.

A future "quick mode toggle" in the topbar is a separate decision for a future version if Caleb wants it, provided it cycles System→Light→Dark (preserving all three states) and writes `themePref`.

### 5.2 Accent migration: `indigo`+`violet` → `purple`

**Decision: map stored `indigo` → `purple`, stored `violet` → `purple`. Unknown stored values → `blue` (default).**

Both `indigo` and `violet` in v14 are blue-purple family hues. `purple` is the closest single visual match. Mapping either to `blue` would be a more jarring shift for existing users. The migration is a one-time `localStorage` fixup on load, trivially reversible. Default accent stays `blue`.

### 5.3 Health-panel headline copy + stale/degraded thresholds

**Copy decisions:**

| State | LED | Headline |
|---|---|---|
| All up/idle/unknown | green | "All systems operational" |
| Any degraded, no down | amber | "1 service needs attention" / "N services need attention" |
| Any down | red | "1 service needs attention" / "N services need attention" |
| Loading | neutral (pulse) | "Checking services…" |
| Empty | — | "No services yet" / sub "Add your first service to get started" |

N = count(down) + count(degraded). The LED color (red vs amber) carries the severity distinction; the chips carry the breakdown. One headline pattern, two LED colors.

**Stale thresholds:** freshness label → amber at >5 min, red at >15 min. Headline and LED do not change on stale — they reflect last-known service state, not data freshness. The freshness label is the stale signal.

**Degraded threshold:** any `degraded` count ≥ 1 (with `down` = 0) triggers amber. `idle`/`unknown` never trigger amber or red.

### 5.4 Sparkline on tiles by default

**Decision: off by default. Preserve the v14 user toggle.**

The v15 grid is denser (162px tiles, gap 12). A sparkline at the bottom of each tile adds meaningful visual weight at default density — a full-screen view with 20–30 tiles would feel cluttered. The per-user sparkline toggle must remain fully functional in v15 (feature preservation requirement). Users who want sparklines toggle them on; the default dashboard is clean.

---

## 6. Success metric

A user opens homepad on a TV/monitor and immediately reads the system health state from the headline. Switching accent or mode takes one tap and feels instant. The dashboard could be mistaken for a polished commercial product.

---

## 7. Co-sign (records the gate)

*v15 ships to Stitch only with both sign-offs:*

- [x] **Walt** — product go. The product scope above is the build target. Decisions in §5 are final. Kare's §9 corrections are **build acceptance requirements** — a build that ships with `opacity:.52` idle tiles, 38px topbar controls, or the swatch row in the topbar does not pass PAT.
- [ ] **Kare** — design go (recorded in `design/SPEC-v15-design-system.md §11`; conditional on §9 corrections in build acceptance)
- [ ] **Caleb** — approves token set + accent-under-profile handling
