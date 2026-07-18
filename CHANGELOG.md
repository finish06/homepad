# Changelog

All notable changes to homepad are documented here.

Versions follow SemVer (Major.Minor.Patch) as declared in `package.json` — that
is the canonical app version and the one the footer version badge renders. The
"v7…v16" names are milestone/feature **codenames**, not version numbers; where a
codename maps to a release it is noted in the heading.

## [15.4.1] — 2026-07-18 — Status Summary stat-box alignment & contrast fix

Patch, CSS-only (`src/index.css`), no data/API/markup changes. Kare's live-
measured design fix for the v15 health summary at 646px (Caleb's prod phone
width), light + dark (#384):

- **Alignment.** The two quick-peek stat boxes (`.health-chips`) were
  content-width flex items floating at the left over a full-width meter — the
  `46 UP` box was 64px, `3 NOT MONITORED` was 143px, and neither edge aligned to
  the other or to the uptime bar (314px of dead space to the right). They now lay
  out as an equal-column grid (`grid-auto-columns: minmax(0, 1fr)`) so both boxes
  are equal width and their outer edges sit flush with the meter (49 / 582 →
  261px each). The old flex-end row and its `@media(max-width:720px)`
  flex-start override are removed.
- **Fill/edge.** The light box fill (`--v-chip`) was byte-identical to the panel
  (`--v-glass`) at 1.03:1 — the box was invisible. Light chips now get an ink
  hairline border (`rgba(20,23,30,0.12)`) plus a soft lift; the dark fill is
  raised `0.06 → 0.10` so the box separates from the panel there too.
- **Green.** The `UP` number used the fill-grade success token `--v-up` (3.39:1
  as text on the light chip); it now uses the text-grade `--v-up-strong`
  (5.35:1). No-op in dark, where the two tokens are identical.

(Finding 3 from the rec — the tile/sparkline `emerald-500` vs `--v-up`
design-system reconciliation — is a separate, larger task and is out of scope
here.)

## [15.4.0] — 2026-07-17 — Login/sign-in glass restyle (v27)

Minor feature, no data or API changes. The sign-in screen — the one screen you
see before the glass dashboard, and the last one still on the old flat palette —
is re-skinned onto the v15 glass design system. The card is now a frosted glass
panel floating on the same accent-blob atmosphere as the dashboard, the harsh
pure-white input boxes become soft tinted glass fields, and the primary button
uses the app's solid accent color.

Accessibility: in dark mode five text elements (the field labels, the PocketID
label, the subtitle, the secondary link and the "or" divider) were inheriting
light-mode colors on the dark card and failing WCAG AA — some as low as 1.73:1.
All five now read from the mode-aware glass tokens and clear AA in both light and
dark. The sign-in error message moves to the glass "down" color, measured on the
real glass card at **4.72:1 (dark)** and **4.59:1 (light)** — both clear of the
4.5:1 floor. (Measured on the composited card surface, not on white: the card's
light-mode frost was tuned up until every text element cleared AA there.)

Also in this release: password-manager autofill no longer paints a harsh
white/yellow box over the glass field; the card has a solid fallback and
`-webkit-backdrop-filter` so it never renders invisible on older iPad Safari;
the "Log in with PocketID" button now shows a "Signing in…" state that resets
itself after 30 seconds with a retry hint if the redirect stalls (e.g. during a
PocketBase restart) instead of spinning forever; a faint version footer shows
which build you're signing in to; and the secondary action now reads "Create
account". Touch targets stay ≥44px throughout.

## [15.3.0] — 2026-07-15 — Admin env-config viewer (v26)

Minor feature, fully backward-compatible. Admins get a read-only **Environment
Configuration** list in the Admin Panel → **System** section, below the "Show
uptime display" toggle. It surfaces the server's runtime env vars — the Gatus
base URL, cookie/port settings, registration mode, and the full OIDC setup —
each row showing a friendly label plus the exact env-var name (mono sub-label),
grouped into **Server** and **Identity (OIDC)**. Unset vars render as an em-dash
with an accessible "not set". This closes the v25 gap: admins now have an in-UI
way to confirm the `GATUS_BASE_URL` the poller composes tile health checks
against, without SSHing into the cluster.

The values come from a new admin-only endpoint **`GET /api/admin/env-config`**
(homepad-api, shipped at the same 15.3.0). The endpoint returns an **explicit
allowlist** of 10 non-sensitive keys — a security-by-construction choice: a new
env var is invisible until deliberately added to the list, so secrets like
`DATABASE_URL` and `OIDC_CLIENT_SECRET` are **absent** (not redacted) from the
response. Unauthenticated callers get 401; non-admins get 403.

This phase is **read-only** — editing config from the UI is a deliberate future
phase. Also folds in two accessibility contrast fixes to the System panel: the
light-mode `[env]` badge grey and the dark-mode error text.

**Deploy note:** this release changes **both** `homepad` and `homepad-api`; both
images ship 15.3.0 and must be rolled together (two-image deploy).

## [15.2.0] — 2026-07-15 — Gatus endpoint key on the tile editor

Minor feature, fully backward-compatible. An admin can now set a tile's health
monitoring **directly from the tile edit modal** — no more visiting the Settings
"Add / Edit app" form. Opening a tile's pencil in edit mode reveals a new
**"Gatus endpoint key"** field below Description: type the endpoint slug from
your Gatus config (its `group_name`, e.g. `kube_plex`) and save, and the tile's
health meter starts resolving to online (green) / offline (red) on the next poll
tick. Leave it blank to disable monitoring (the tile reverts to gray
not-monitored). A mismatched or unknown key resolves to **unknown on the tile**,
never a modal error — there's no client-side format validation, only a trim.

Additive and non-breaking: the `services.gatus_key` column already existed and
the PATCH API already accepted it. This release exposes the slug on the service
**read model** (both the homepad-api response and the SPA `Service` type) so the
modal can prefill the current key, and adds the admin-only field to the modal
following the v21–v23 pattern (prefill → dirty-track → PATCH on save). The
existing ServiceForm "Gatus key" field is unchanged. `GATUS_BASE_URL` stays an
operator env var (never exposed in any admin UI); all tiles share one Gatus
instance.

> **Ships with homepad-api.** This SPA release pairs with the homepad-api change
> that returns `gatus_key` on the read model — **roll both images at 15.2.0
> together** (the field prefills from that response).

### Added

- A **"Gatus endpoint key"** admin-only text field in the TileEditModal, below
  Description: prefills from `service.gatus_key`, dirty-tracks, and PATCHes the
  trimmed slug on save (blank clears monitoring). No format validation; a wrong
  key resolves to UNKNOWN on the tile, not a modal error
  (SPEC-v25-gatus-key-tile-health).

### Changed

- The service **read model** (`GET /api/services`, SPA `Service` type) now
  carries `gatus_key` (the slug when monitored, `""` when not) so the tile editor
  can prefill it.
- The modal input `::placeholder` colour is pinned to an AA-contrast token
  (fixing the new Gatus-key placeholder and the pre-existing URL-fallback
  placeholder in one rule).

## [15.1.0] — 2026-07-14 — health-meter status banding

Minor enhancement, fully backward-compatible. The system health panel's
per-service meter now **groups its ticks into three contiguous status bands**,
healthy-first: all online (green) first, then not-monitored (gray), then
offline (red). Previously ticks followed tile-layout order and interleaved the
three colours, so the meter told you individual positions but not the
*distribution*; banded, it reads "mostly green, a sliver of gray, nothing red"
at a glance, and the legend swatches now map onto contiguous meter regions.

Within each band the meter preserves your tile-layout order, so ticks don't jump
around on a refresh — only their band changes when a service's status changes.
Degraded services fold into the red band (no separate amber band), matching the
offline count chip and the quick-peek popover. The meter stays decorative
(`aria-hidden`); the count chips remain the accessible numbers. Nothing else in
the panel changes — LED, headline, chips, legend and the quick-peek popover are
untouched.

### Changed

- The health-panel meter renders its ticks in three status bands
  (green → gray → red) instead of tile-layout order (SPEC-v24-health-meter-banding).

## [15.0.0] — 2026-07-14 — homepad v15: the glass redesign

Major visual release. A full **glass-morphism reskin** of the whole dashboard —
new design system, same app. This is a REPLACE of how homepad *looks*, not what
it does: every v14 feature (service tiles + 5 monitoring states, the uptime
lines, favourite/remove, admin Edit Dashboard, the ⌘K command launcher, the
alert bell, the user profile menu, the version badge + changelog) is preserved
and works exactly as before. Built to Kare's v15 design-system spec.

### Added

- **Frosted-glass design language.** Panels, tiles, the command palette and the
  top bar are now translucent glass over a soft, accent-tinted ambient field —
  rounded corners (24/18/12), layered shadows and a subtle backdrop blur. Dark
  mode stays the default; full light mode is included.
- **A health summary panel.** The old status strip is replaced by a headline
  verdict — “All systems operational” / “N systems need attention” / “Checking
  services…” — alongside online / not-monitored / offline count chips and a
  per-service status meter. It reads the same live data and keeps the click-to-
  peek popover for each bucket.
- **Two more accent colours (8 total).** The accent picker (still under your
  profile’s Appearance section, unchanged) now offers blue · teal · green ·
  yellow · orange · red · pink · purple. Existing indigo/violet choices map to
  purple automatically; the default is now blue.

### Changed

- **Every surface restyled to the glass system** — top bar (now a floating
  pill), service tiles, section headers (with a per-group status count), the ⌘K
  launcher and the profile menu. No layout data, routing or behaviour changed.
- **Accessibility corrections folded in** (Kare §9 / #348): idle tiles are dimmed
  with AA-passing tokens instead of a blanket opacity, the offline count colours
  its number when it matters, and touch targets stay ≥44px.

## [14.0.2] — 2026-07-12 — Fix: overlay launch type no longer reverts on reload

Patch fix for [#342](https://gitea.kube.calebdunn.tech/Code/homepad/issues/342).
Setting a tile's launch type to **Inline overlay** (the "overlay" behaviour) could
appear to save and then revert on the next page reload.

### Fixed

- **Tile Edit — launch type reflects what was persisted (#342).** After Save, the
  inline tile update now mirrors the `click_action` the **server** returned rather
  than the optimistic local selection. If a backend silently drops the value (for
  example one that predates the `click_action` column / migration 0011), the tile
  now shows the un-persisted value immediately instead of a false "saved" that
  reverts on reload. The end-to-end persistence contract itself is unchanged and
  correct on `main`; a companion round-trip test in `homepad-api` (all launch-type
  enum values survive a re-fetch) guards it against regression.

## [14.0.1] — 2026-07-11 — Optimize: code-split on-demand overlays

Performance-only pass (ADD `optimize`). No functional or visual change a user
would notice; every existing test still passes. The admin Settings panel, the
app Library, the custom-app form, the per-tile Edit modal, and the inline iframe
overlay are now lazily loaded (`React.lazy` + `Suspense`), moving them out of the
initial JS bundle into their own on-demand chunks fetched when the surface opens.

### Changed

- **Initial JS bundle trimmed ~7%** — `index-*.js` went from 304.72 kB (gzip
  94.58 kB) to 273.58 kB (gzip 87.91 kB). Five on-demand overlays now load as
  separate async chunks (SettingsPanel, TileEditModal, LibraryBrowse,
  ServiceForm, IframeOverlay; ~10.5 kB gzip total), fetched only when opened.
  The rendered DOM/CSS of each overlay is unchanged — only load timing shifts.

## [14.0.0] — 2026-07-10 — Per-Tile Click Action (v23)

Adds a per-tile choice of how a tile's URL opens — **New tab** (the existing
default), **Same tab**, or an in-app **Inline overlay** (iframe) — set from the
tile's Edit window in Edit-dashboard mode (spec
`specs/SPEC-tile-click-action-20260710.md` §4–§5). Frontend-only; the
`clickAction` field rides the existing create/PATCH service body and defaults to
`new_tab`, so every pre-migration tile is unchanged (AC-014). Companion backend:
`Code/homepad-api#47`.

### Added

- **Per-tile "Click action" setting (`new_tab` | `same_tab` | `iframe`).** In the
  `TileEditModal`, admins pick how the tile opens; the field is optional and reads
  as `new_tab` when absent.
- **`IframeOverlay` inline embed.** The `iframe` action opens the service in a
  sandboxed backdrop modal (service-title header, loading spinner, Esc / backdrop /
  ✕ dismiss, focus management). A 5s blocked-embed fallback surfaces an "Open in
  new tab" panel for sites that refuse framing (X-Frame-Options/CSP), since those
  blocks fire no reliable event (§5.5). Right-click still works — `href` is retained.

### Changed

- **`ToolLink` routing** branches on `clickAction`: `new_tab` →
  `target=_blank rel="noreferrer noopener"`; `same_tab` → same-tab navigation;
  `iframe` → intercepts the click to open the overlay.

### Notes

- Major bump (13.x → 14.0.0) marks the click-action milestone; the change itself
  is additive and backward-compatible (unset tiles behave exactly as before).

## [13.11.0] — 2026-07-05 — Icon Light/Dark Tabs (v22)

Reorganises the v21 `TileEditModal` icon section into a two-tab ARIA tablist —
**Light Mode** (default) and **Dark Mode** — so an admin can set a distinct icon
per theme without the flat panel's clutter (spec
`specs/v22-icon-light-dark-tabs.md`). A **pure front-end reorganisation**: the
backend already stores two independent icon blobs keyed by `(service_id,
variant)` with variant-specific upload/delete endpoints, so there is **no schema
change and no migration**. Frontend-only — only the `homepad` image rebuilds.

### Added

- **Two-tab icon section (§5, §8.1).** The flat icon panel becomes a segmented
  control that is a WAI-ARIA `tablist` — "Light Mode" (index 0, always default on
  open, AC-001/AC-007) + "Dark Mode". Each tab has its own preview, **Upload
  PNG**, **Fetch from URL**, and **Remove**, operating independently on that
  variant (AC-002/AC-003). Roles are independent of the segmented visual
  treatment; automatic-activation with **← / → arrow-key nav** that wraps both
  ways and moves focus to the newly active tab (AC-009).
- **Honest per-tab preview states (§8.3).** A tab with no PNG of its own renders
  the resolved fallback (other variant or URL) at reduced emphasis with an inline
  note (*"No dark PNG — showing the light icon."*); a truly empty variant shows an
  explicit dashed **"No icon set"** box plus the initials-badge consequence hint,
  never a bare badge that reads as "configured". Preview `<img>` carries a
  variant-specific `alt` (§8.2).
- **`both modes` scope pill (§8.4).** The shared `services.icon` URL field is
  relabelled **"URL fallback"** with an accent-outline `both modes` pill and sits
  **below the tabpanel behind a divider** — it applies to both themes (one shared
  column), made explicit so it doesn't read as tab-scoped (AC-005).

### Changed

- **Remove is now per-tab and non-destructive (§5.2, AC-004).** "Remove
  [light/dark] icon" deletes only the active tab's variant via an inline,
  variant-specific confirm (Keep focused as the safe default, §8.5) — it no longer
  clears the other variant or the URL, unlike the v21 flat-panel Remove.
- **Fetch-favicon carries the active variant (§6.4/§8.6).** The front-end now
  sends `POST /api/services/{id}/fetch-icon?variant=light|dark`. **Note:** storing
  the fetched icon under the *dark* variant depends on a companion `homepad-api`
  change to honour the `variant` param; a pre-v22 backend defaults to `light`
  (backward-compatible). The Light-tab fetch works against the current backend.

### Unchanged

- Save/Cancel, discard confirm, focus trap, and all other modal fields are
  inherited from v21 verbatim (AC-013). No `iconSrc()` precedence change — the tab
  UI only makes the existing dark variant easier to set (AC-012).

## [13.10.0] — 2026-07-05 — Tile Edit Modal (v21)

Per-tile editing from the dashboard (spec `specs/v21-tile-edit-modal.md`). An
admin in edit mode gets a pencil affordance on every App Grid tile that opens a
`TileEditModal` for that tile's **shared-catalog** entry (Option A — admin edits
the shared catalog; visible to all users). Touches both `homepad` (this repo)
and `homepad-api` (fetch-favicon endpoint) — both images rebuild.

### Added

- **Per-tile pencil edit affordance (§5, §8.1).** `AppGrid` `ToolLink` renders a
  bottom-right pencil **only** for an admin in edit mode (absent from the DOM
  otherwise — AC-001), a sibling of the tile `<a>` like the ★. 34×34 accent glyph
  + a transparent centered `.app-grid-tool-edit::before` at 44×44 (the v20 ★
  pattern — zero layout shift), theme-aware indigo, `aria-label="Edit <name>"`,
  `touch-action: manipulation`. Editable tiles gain a 2px inset accent ring.
- **`TileEditModal` (§6, §8.2–8.6).** Fields in Kare's order — Title, URL,
  Category, a grouped **icon compound panel**, Description. The icon panel has a
  64px live preview, Upload (light) + Dark-variant + URL-gated **Fetch from URL**,
  an Icon URL field, and Remove — with a local upload/fetch busy state. Save is a
  **single PATCH** (text fields + category) that updates the tile inline and
  toasts "Tile updated."; errors keep the modal open with values intact
  (AC-004…AC-015). Discard is an **inline in-modal confirm**, never
  `window.confirm()` (which would break the focus trap). Full WAI-ARIA dialog:
  `role="dialog"`, `aria-modal`, `aria-labelledby`, focus-on-Title, Tab focus
  trap, Esc / backdrop close, focus return to the pencil.
- **Backend `POST /api/services/{id}/fetch-icon` (homepad-api, §7.4).**
  Admin-only; downloads the favicon from the service's registered URL (HTML
  `<link rel="icon">` sniff → `{origin}/favicon.ico` fallback) and stores a valid
  PNG as the light variant. Clean 422 on any failure, existing icon untouched.

### Notes

- All modal controls are ≥44×44 (inputs, textarea ≥76) and clear the 4.5:1 /
  3:1 contrast floors in light **and** dark (§8.6, measured). Three forced
  dark-mode token decisions are baked in: the primary CTA stays indigo-600 +
  white in both themes, accent is theme-aware indigo-600/indigo-400, and the
  control border is theme-aware `#8c8c8c`/`#808080`.
- The **backend admin gate** the spec §7.3 calls a prerequisite (403 for
  non-admin on `PATCH /api/services/{id}` and the icon endpoints — AC-016) was
  **already shipped in #34** and is green on `main`; no gate change was needed.
  fetch-icon reuses the same `requireAdmin` gate.

## [13.9.0] — 2026-07-05 — Favorite ★ Touch Target & Contrast Fix (v20)

Fixes two pre-existing design-system floors on the per-tile ★ favorite toggle
(`data-testid="tile-favorite"`) at 768px (iPad), both introduced with the App
Grid in #240 and tracked in #255. Frontend only — `src/index.css`, no API
changes.

### Fixed

- **★ favorite hit area lifted 34×34 → 44×44 (DESIGN-SYSTEM §9.3).** A
  transparent, centered `.app-grid-tool-fav::before` extends only the invisible
  hit area to 44×44px; the painted 34×34 button, glyph position (0px delta),
  hover pill, and focus ring are all unchanged. Added `touch-action:
  manipulation` so a corner tap fires without the 300ms double-tap-zoom delay
  (#255).
- **Default ☆ light-mode contrast raised 2.56:1 → 4.76:1 (DESIGN-SYSTEM §1.1).**
  The resting unfavorited ☆ moved slate-400 (`#94a3b8`, 2.56:1 on the white
  tile — below the ≥3:1 non-text floor) to slate-500 (`#64748b`, 4.76:1),
  unifying the resting-star color with dark mode. Opacity (0.5), the favorited
  amber ★, hover, and the focus ring are unchanged (#255).

## [13.8.0] — 2026-07-05 — A11y & Touch-Target Hardening Pass (v19)

An accessibility and touch-target hardening pass over the shared-catalog UI. No
new features: it restores a banner that regressed in the Catalog→AppGrid
migration, fixes a WCAG AA contrast failure and stale non-admin copy, and
verifies-and-measures the existing 44px touch targets and text contrast across
the UI at 768px (light and dark) with the browser gate — no regressions found.

### Changed

- **Non-admin UserMenu note now uses shared-catalog language.** The account
  menu's note for non-admins dropped the stale "personal dashboard" copy in
  favor of shared-catalog wording ("These tiles and categories are the shared
  homelab catalog…"), matching the app's actual multi-user model (#265).

### Fixed

- **Restored the shared-catalog edit-mode banner.** The "Editing the shared
  catalog — changes affect all users" banner had gone missing from the live app
  after the Catalog→AppGrid migration; it is restored at the App level, above
  the grid (#277).
- **Dark-mode edit-banner label contrast raised to 9.03:1.** The banner label
  measured only 2.86:1 in dark mode (indigo-600 on the near-black banner
  ground), failing WCAG AA for its 11px bold text; lifted to indigo-300 for
  9.03:1 (#163).
- **AC-004 browser-gate race.** The a11y/touch gate now awaits the OIDC "or"
  divider before measuring its contrast, fixing an intermittent measurement race
  (#300).

## [13.5.0] — 2026-07-04 — Uptime display toggle (cap6-uptime-display-toggle)

A global admin System setting that hides the per-tile uptime figures across the
app grid without touching Gatus monitoring. Default ON (opt-out): existing
dashboards are unchanged until an admin turns it off. Frontend gates the render;
the backend persists the choice so no redeploy is needed.

### Added

- **"Show uptime display" toggle (admin, System settings).** A writable pill
  switch above the read-only OIDC / self-registration rows. Auto-saves on toggle
  with an inline "Saved ✓" confirmation and an error-revert path; admin-only.
- **`system_settings` store + endpoints.** Public `GET /api/system/config`
  (defaults ON when no row exists) and admin-only `PATCH /api/admin/settings`
  (singleton upsert, partial-patch merge). New migration `0010_system_settings`.

### Changed

- The app grid's per-tile 24h/7d/30d uptime line is now gated by the new setting.
  When OFF the line is omitted with no layout gap; the status pip and the status
  bar are unaffected. Render-gate only — the API still serves uptime data (D2).
- The System settings note no longer declares the whole section read-only; the
  per-row `[env]` badge now carries the read-only signal (D6).

## [13.4.0] — 2026-07-03 — Glass v2 + ROYGBIV accent preference (SPEC-glass-v2-accent)

The glass finally has something to blur, and users pick the hue. Frontend only.

### Added

- **Accent color preference (ROYGBIV).** A new picker in the user menu's
  Appearance section (under the theme control): Red / Orange / Yellow / Green /
  Blue / Indigo / Violet, each re-huing the dashboard's ambient backdrop blobs
  via `--accent-1`/`--accent-2` CSS vars. Indigo is the default and is
  byte-identical to the brand indigo/purple atmosphere. Client-only
  (localStorage `homepad.accent`, applied at boot from `main.tsx`); the accent
  drives AMBIENT color only — never a text/icon/ring token, so it cannot move
  any WCAG contrast. Swatches are ≥44px hit areas; selection is announced
  (aria-pressed) and drawn (ring + checkmark), never color alone.

### Changed

- **Backdrop atmosphere (`.app-surface`).** v1 anchored both color blobs at the
  page's top corners, so everything below the first screenful sat on a flat
  gradient and the boxes' backdrop-filter had nothing to blur — glass read as a
  solid slab. v2 distributes two more accent blobs down the page and lays a
  tiled SVG feTurbulence grain (~3%) on top to stop gradient banding on large
  monitors. All blob alphas ≤0.14 — contrast floors unchanged.
- **Glass material (`.app-grid-box`).** `blur(10px)` → `blur(14px)
  saturate(1.5)` (color through the glass reads richer, not grayer); glass
  alpha 0.72→0.65 light / 0.68→0.60 dark; plus a 1px top-edge bevel highlight
  as a second inset shadow. The structural 1px ring and the content-box width
  math (AC-004–008) are untouched. Worst-case composited titles still measure
  ~16:1.
- **Reduced transparency respected.** Under `prefers-reduced-transparency:
  reduce`, boxes go near-solid with no backdrop-filter.

## [13.3.0] — 2026-07-03 — Ultra-wide fluid content frame (SPEC-ultrawide-fluid-frame, pane-fill Phase 1b)

The dashboard now uses big monitors instead of floating as a fixed 1536px island.
Frontend only — one token + its JS mirror + one media-scoped rule.

### Changed

- **`CONTENT_WIDTH` is fluid above ~1670px viewports:** `max-w-[1536px]` →
  `max-w-[max(1536px,92vw)]` (`src/layout.ts`). The shipped 1536px cap holds as a
  floor through standard desktops (everything ≤1670px is byte-identical), then
  the frame grows as 92vw — a 4vw margin per side. 1920 → ~1766px frame,
  2560 → ~2355px, 3840 (4K) → ~3533px instead of 1536px with ~60% dead margin.
  Header, StatusBar, and grid all ride the one token, so the layers stay
  edge-aligned (#196 AC-009). The pane-fill grow model (Phase 1 R3/R4) fills the
  wider rows; tiles stay exactly 190px (R2, Caleb's invariant).
- **R4 lone-box bin-pack reads the fluid frame:** new `frameContentPx(vw)` in
  `src/appGrid.ts` mirrors the CSS token (was a hardcoded 1536 in AppGrid.tsx);
  `ultrawide-frame.test.ts` locks the CSS/JS pairing, seam continuity at the
  ~1670px crossover, and monotonicity (no #194-style inversion anywhere).
- **R3's residual rule implemented (fluid band only):** when every box in a row
  is already at its content-max and row space remains (few apps on a very wide
  monitor), the packed cluster now CENTERS — `justify-content: center` on
  `.app-grid` inside `@media (min-width: 1671px)`. Below the crossover the base
  rule is untouched.

### QA

- Browser gate extended: the pane-fill dead-space spec now gates 1920/2560/3840
  and asserts the frame itself is fluid; new cluster-centering spec at 3840.
  All 21 gate specs green on the built app in real Chromium.

## [13.2.0] — 2026-07-03 — Pane-fill Phase 1: category boxes fill row dead-space (SPEC-pane-fill-reflow)

Wide-viewport polish for the App Grid: category boxes now **flex-grow above their
`--w` / `grid_width` floor** to consume the leftover slack in a row, so a partly
filled row no longer leaves a band of dead space to the right. The configured
width becomes a **minimum** (floor), not a fixed size — boxes never shrink below
it, they only grow to share the remaining row width. **Frontend only**, and
**additive on top of the App Grid** (v13.0.0) — no layout regression, no API or
backend change, no data migration.

Live in prod and Caleb-approved (2026-07-03). This release carries **only** the
pane-fill layout; the long-window uptime line (24h/7d/30d) is **not** part of this
prod release — its backend was never verified and it ships separately once
confirmed.

### Changed

- **Category boxes grow to fill the row.** `.app-grid-box` changed from a fixed
  `width` to `flex-grow: 1` with the configured width kept as the `min-width`
  floor and a `max-width` cap, so boxes expand to absorb row dead-space instead
  of leaving a gap on the right at wide viewports (1440 / 1920 / 2560). Tiles and
  the App Grid tile sizing are unchanged; a lone box on its own row fills to the
  full content width.

## [13.1.0] — 2026-07-02 — Per-tile status dot on the App Grid (SPEC-242)

Restores the live per-service health indicator on every App Grid tool tile (it
was present on the outgoing v14 floating-panel layout but absent from the App Grid
tile). Frontend only — the status comes from `service.status` on the existing
`GET /api/services` via `ServicesContext`; no new endpoint, no backend change.

### Added

- **Per-tile status dot.** Each tool tile now shows a 9px status pip in its
  **top-left** corner (deliberately mirroring the favorite ★ at top-right so the
  two never collide). Five states, each with an accessible label (`role="img"` +
  `aria-label="status: …"` + hover `title`):
  - **UP** green, **DOWN** red, **DEGRADED** amber — each with a state-coloured glow.
  - **UNKNOWN** neutral grey, ring only, **no** alarm glow (it's monitoring-infra
    noise, not a service failure).
  - **NOT_MONITORED** a dashed hollow ring, no glow — the one non-solid shape, so a
    colour-blind user can still tell it apart (absence of monitoring, not an error).
- A mandatory 1px definition ring on the solid dots so the emerald/amber/neutral
  fills meet the WCAG-AA 3:1 non-text-contrast floor against the near-white tile.
- A single-shot pulse when a tile's status changes on a live poll; it plays only
  on the tile that changed and is skipped entirely under `prefers-reduced-motion`.

The indicator is absolutely positioned with `pointer-events: none`, so it adds
**zero** layout impact — the fixed 120px tile height is unchanged and a tap on the
tile always hits the app link.

## [13.0.0] — 2026-07-02 — App Grid fixed-width tile layout (SPEC-app-grid Amendment A1)

Opens the v13 major line (panel customization). Corrects the App Grid's 1fr layout
regression so a tool tile is the **same fixed width in every box**.

### Changed

- **App Grid is now a fixed-width tile layout (Amendment A1).** Previously each box
  was a span of a `repeat(6, 1fr)` page grid and its tools were `repeat(--w, 1fr)`,
  so a tile's rendered width was `box_width ÷ --w` — a tile in a width-1 box and a
  tile in a width-4 box were **different sizes**. Now:
  - Boxes are **content-sized** and pack left→right with `flex-wrap`; a box at width
    N is exactly `N×190 + (N-1)×16 + 32` px wide (byte-identical to the v14 panel).
  - Tool tiles are a **fixed 190px** `auto-fill` track — the same width in every box
    (AC-001-A1) — and **wrap** (never resize) when a box is clamped narrower than its
    natural width (no horizontal page scroll).
  - Tiles use the vertical tile grammar (icon plate over a full-width, 2-line-clamped
    name) at a **fixed 120px height**, so a 1-line and a 2-line name render identical
    height — tiles no longer jump.
- **Box width range widens from 1–6 to 1–8.** A width whose box would be wider than
  your current screen is offered **disabled** ("Wider than this screen") so an admin
  can't set an off-screen box on their own display.
- **Two width-3 boxes sit two-up at ≥1440px**; below that they wrap gracefully.
- **Mobile (≤640px):** each box goes full-width and its tiles cap at 2 columns,
  shrinking below 190px only as needed to avoid any horizontal scroll.

## [12.9.1] — 2026-07-02 — Gate the App Grid width selector to Edit Dashboard mode

### Fixed

- **Box width selector now only appears in Edit Dashboard mode (#240/#241 follow-up).**
  The per-box width control (the `width` label + six 1–6 buttons) rendered for any
  admin at all times, cluttering the normal browsing view. It now shares the same
  gate as box rename/delete — `editing && box.id !== ''` — so it appears only for an
  admin who has turned on **Edit Dashboard** from the header gear, and never on the
  synthetic Uncategorized box. Non-admins still never see it. Width picking and
  persistence inside edit mode are unchanged.

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
