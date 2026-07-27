# homepad v23 — Per-Tile Click Action

**Spec ID:** SPEC-tile-click-action-20260710
**Created:** 2026-07-10
**Author:** Walt (product lead)
**Status:** Draft — Kare §8 design section authored (design GO); awaiting Walt product go
**Repos:** `Code/homepad` (UI) + `Code/homepad-api` (data model + API)
**Estimate:** ~5–8 hours Stitch
**Target version:** v13.12.0 (feature = minor; v21 → v13.10.0, v22 → v13.11.0)
**Closes issues:** n/a — new feature (file Gitea issues for any gaps during build)

**Prerequisites:**
- **v21 (SPEC v21-tile-edit-modal)** must land first — v23 adds a new field inside
  `TileEditModal`, the component that v21 introduces. Cannot build v23 without
  `TileEditModal` in the codebase.
- **SPEC-245-224** (admin gate on service writes) must also land — required by v21,
  so it's transitively required here.

---

## 1. Problem

Every tile on the homepad dashboard opens its service in a **new browser tab** — the
behavior is hardcoded (`target="_blank"` at `AppGrid.tsx:713`). There is no choice.

Caleb's request: **"When in edit-tile mode, add ability to specify the click action:
(1) open in new tab, (2) open in existing tab, (3) open within an overlay iframe."**

Some services open fine in a tab but are better embedded (e.g., a local monitoring
dashboard kept visible alongside the homepad). Others are navigated to and replaced.
A blanket "always new tab" fits no one perfectly; a per-tile setting lets each
service behave the way that makes sense for it.

---

## 2. Scope

**In scope:**
- New `click_action` column on the `services` table (`new_tab | same_tab | iframe`).
- Runtime routing in `ToolLink` for all three behaviors.
- New `IframeOverlay` modal component (backdrop, close button, Esc, loading state,
  service title in header, graceful fallback for blocked embeds).
- Click-action selector in `TileEditModal` (the v21 component); admin-only, edit mode.
- Backend: migration, `serviceView` wire field, accept on create/update.

**Out of scope:**
- Per-user click-action override (all users see the admin's choice — shared catalog
  model, same as v21 rationale §2).
- Detecting X-Frame-Options / CSP preemptively at admin-config time (browser
  limitation; spec a graceful runtime fallback instead — see §5).
- Click-action on Library items (library is an admin browse/add tool, not a navigable
  tile).

---

## 3. Data Model

### 3.1 New column — `services.click_action`

```sql
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS click_action TEXT NOT NULL DEFAULT 'new_tab'
  CHECK (click_action IN ('new_tab', 'same_tab', 'iframe'));
```

**Default `'new_tab'`** — existing rows are unchanged in behavior after migration.
No backfill pass required; the DEFAULT handles all pre-existing services atomically.

**Migration file:** `homepad-api/migrations/0008_click_action.up.sql` (+ matching
`.down.sql` that drops the column).

**Multi-tenant alignment:**
The `services` table is admin-managed and shared (SPEC-245-224 / Caleb directive
2026-07-02). `click_action` is an admin-set property of the shared service entry. All
users see the same click behavior for a given tile. There is no per-user override
layer for this field (out of scope; see §2). Per-user state (favorites, collapsed
categories, layout) is unchanged.

### 3.2 Backend struct changes (homepad-api)

`internal/storage/storage.go` — `Service` struct:
```go
ClickAction string  // 'new_tab' | 'same_tab' | 'iframe'; always populated (DB default 'new_tab')
```

`ServiceUpdate` partial-patch struct:
```go
ClickAction *string // nil = leave unchanged
```

`internal/api/services.go` — `serviceView` wire type:
```go
ClickAction string `json:"clickAction"` // always present on the wire
```

Mapping in `handleListServices`, `handleCreateService`, `handleUpdateService`: read
`click_action` from the DB row and write it to `serviceView.ClickAction`. Accept
`clickAction` on create/update, validate it is one of the three enum values (400 Bad
Request if not).

### 3.3 Frontend type changes

`src/api.ts` — `Service` type:
```ts
clickAction: 'new_tab' | 'same_tab' | 'iframe';
```

`ServiceInput` type:
```ts
click_action?: 'new_tab' | 'same_tab' | 'iframe';
```

Old `Service` payloads from a pre-migration server will omit `clickAction`. The
`ToolLink` component must treat absent/undefined as `'new_tab'` (safe default,
matches the hardcoded prior behavior).

---

## 4. Edit UI — Click Action Selector in TileEditModal

The `TileEditModal` component (introduced in v21) gains a **"Click action"** field,
visible to admins in edit mode only (non-admins don't see the modal at all — per v21
§5 + §2).

### 4.1 Field placement

Insert **after the URL field and before Description** in `TileEditModal`'s form
body. The click action is URL-adjacent because it controls how the URL is navigated.

### 4.2 Control type and copy

A **segmented control** (three-button toggle; or a `<select>` if the design system
makes a segmented control costly — defer the choice to Kare §8):

| Value | Label | Sub-label / hint |
|---|---|---|
| `new_tab` | **New tab** | Opens in a new browser tab *(default)* |
| `same_tab` | **Same tab** | Navigates this tab to the service |
| `iframe` | **Inline overlay** | Embeds the service in an overlay panel |

The hint copy is shown as a small line below or inside the control — exact layout
per Kare §8.

The "Inline overlay" option should carry a brief caveat inline: *"Some sites block
embedding — a fallback link appears if that happens."* (one short sentence; do not
hide this.)

### 4.3 Default state

When the modal opens for an existing service, the control reflects the saved
`click_action`. For a service that pre-dates migration (or a server returning no
`clickAction`), treat it as `'new_tab'` and leave the control on New tab.

On **save**, include `click_action` in the PATCH payload only when the value has
changed (same pattern as `categoryId` in `ServiceForm.tsx`). No-op patches are
avoided.

---

## 5. Runtime Click Behavior

`ToolLink` in `AppGrid.tsx` currently always renders an `<a>` with
`target="_blank"`. With this spec, it branches on `service.clickAction`:

### 5.1 `new_tab` (default)

Unchanged from today:

```html
<a href={service.url} target="_blank" rel="noreferrer noopener" …>
```

`rel="noreferrer noopener"` is required — do not remove it for new-tab links.

### 5.2 `same_tab`

```html
<a href={service.url} …>  <!-- no target attribute -->
```

The browser navigates the current tab to `service.url`. No `rel` restrictions needed
(same-origin navigation does not leak referrer context through `noopener`). If the
URL is external, standard browser behavior applies.

### 5.3 `iframe` — Inline Overlay

Clicking the tile **intercepts navigation** and opens `IframeOverlay`:

```tsx
<a
  href={service.url}
  onClick={(e) => { e.preventDefault(); openIframeOverlay(service); }}
  …
>
```

`href` remains set so right-click → "Open link in new tab" still works (the
accessible name + `href` must be present even when the click is overridden).

The `IframeOverlay` component is described in §5.4.

### 5.4 `IframeOverlay` component

A full-screen (or near-full-screen) backdrop modal. Structure:

```
┌──────────────────────────────────────────────────────────┐
│  [←]  <Service Name>                          [✕ Close] │  ← header bar
│──────────────────────────────────────────────────────────│
│                                                          │
│               <iframe src={url} …/>                      │  ← content
│          (or: loading spinner / error panel)             │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Header:** Service name (tile title) + a close button (`✕` or an ✕ icon) in the
top-right corner. The header must have sufficient height and contrast (Kare §8
governs exact values).

**iframe attributes:**
```html
<iframe
  src={service.url}
  title={service.name}
  loading="lazy"
  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
/>
```

`sandbox` is permissive enough for most self-hosted apps while preventing
top-navigation and plugins. Adjust if specific apps require additional permissions
(that is a runtime concern for the admin, not a spec decision).

**Close affordances:**
- Close button in header (always visible).
- Click / tap the backdrop outside the panel.
- Keyboard `Esc` closes (attach a `keydown` listener on mount, remove on unmount).

**Loading state:** Show a spinner centered in the iframe area from the moment
the overlay opens until the iframe's `onLoad` fires (or the fallback timeout
triggers — see §5.5). Do not show a blank white rectangle.

**Responsive sizing:** On desktop, the overlay panel should fill ≥90% of the
viewport width and ≥90% of viewport height, giving the embedded service maximum
real estate. On mobile (≤640px), it should fill the full viewport width and an
appropriate viewport height. Exact values and scrollbehavior per Kare §8.

### 5.5 Iframe Fallback — Blocked Embeds

Many services block embedding via `X-Frame-Options: DENY/SAMEORIGIN` or
`Content-Security-Policy: frame-ancestors 'self'`. The browser silently renders a
blank iframe; there is no reliable cross-browser event that fires on block.
`onLoad` fires even when the frame is blocked (the browser loads an internal error
page into the frame, not the service).

The spec must handle this honestly:

**Fallback trigger:** Start a 5-second countdown when the overlay opens. If the
iframe's `onLoad` does NOT fire within 5 seconds, show the fallback panel (the
iframe may be blocked or the service may be slow). If `onLoad` fires within 5
seconds, clear the countdown and hide the spinner — content is assumed to have
loaded.

**Fallback panel (replaces the iframe area):**

> **This site can't be embedded**
> Some sites block display in an embedded frame.
>
> [Open in new tab ↗]

The "Open in new tab" button opens `service.url` with `target="_blank"`. The panel
does NOT auto-close the overlay — the user may dismiss it manually or click through.

**Why 5 seconds?** Self-hosted services on LAN should load well within 5 seconds.
A block manifests as an indefinitely blank frame; 5 seconds is short enough to
surface the fallback promptly without false-positiving on a slow-loading legitimate
embed.

**Admin guidance (shown in TileEditModal, §4.2):** *"Some sites block embedding — a
fallback link appears if that happens."* This is the only user-visible documentation
needed; a separate settings page or warning on save is out of scope.

---

## 6. Acceptance Criteria

### AC-001 — Default: new_tab for all existing tiles
All services that existed before migration 0008 run have `click_action = 'new_tab'`
after the migration. Their tiles open in a new tab exactly as before. No visual
change, no behavior change for migrated rows.

### AC-002 — Default on new services
A service created without specifying `click_action` (via the API or TileEditModal)
defaults to `new_tab`. The edit form shows "New tab" as the selected option.

### AC-003 — `new_tab` behavior
Clicking a tile whose `click_action = 'new_tab'` opens the service URL in a new
browser tab. The current tab is not navigated. The link carries
`rel="noreferrer noopener"`.

### AC-004 — `same_tab` behavior
Clicking a tile whose `click_action = 'same_tab'` navigates the current browser tab
to the service URL. The homepad app is replaced by the service in the same tab.

### AC-005 — `iframe` behavior: overlay opens
Clicking a tile whose `click_action = 'iframe'` opens the `IframeOverlay` modal.
The modal contains:
- A header with the service's tile title and a close button.
- A loading spinner while the iframe loads.
- The service rendered in an `<iframe>` once loaded.

The current page (homepad grid) is visible behind the backdrop and does not scroll
or navigate.

### AC-006 — `iframe` behavior: close affordances work
The overlay closes on: (a) clicking the close button; (b) pressing `Esc`;
(c) clicking/tapping the backdrop outside the panel.

### AC-007 — `iframe` behavior: right-click still works
Right-clicking (or long-pressing on mobile) a tile with `click_action = 'iframe'`
offers "Open link in new tab" (or equivalent) via the native browser context menu,
because the `<a href={url}>` is still present in the DOM.

### AC-008 — Iframe fallback: blocked site
When the iframe's `onLoad` does not fire within 5 seconds of the overlay opening,
the iframe area is replaced by the fallback panel: a message ("This site can't be
embedded") and an "Open in new tab" button that opens `service.url` in a new tab.

### AC-009 — Iframe fallback: successful load clears timeout
When the iframe's `onLoad` fires within 5 seconds, the spinner is hidden, the
fallback timeout is cleared, and no fallback panel is shown.

### AC-010 — Edit form: selector visible and functional
In admin edit mode, opening the TileEditModal for any tile shows a "Click action"
control with three options: "New tab", "Same tab", "Inline overlay". The currently
saved `click_action` is reflected in the control on open.

### AC-011 — Edit form: change persists
Changing the click action in TileEditModal and saving causes the tile to use the new
behavior immediately (without a full page reload). A subsequent modal open reflects
the saved value.

### AC-012 — Edit form: non-admins do not see the selector
Non-admin users cannot open TileEditModal (per v21 §5 — pencil affordance is
admin + edit mode only). The `click_action` field is never shown to non-admins.

### AC-013 — Multi-tenant: shared catalog
`click_action` is stored on the shared service row (not per-user). After an admin
changes a tile's click action, ALL logged-in users see the new behavior on their
next tile click (or after the next services poll refresh).

### AC-014 — Backwards compatibility: old API clients
A `Service` object returned by a pre-migration server (no `clickAction` field) is
treated as `'new_tab'` by the frontend. No crash or blank screen.

---

## 7. Out-of-Scope Decisions (explicit)

- **Per-user click-action preference.** If a user wants iframe but the admin set new
  tab, that user cannot override it in v23. A future per-user override spec (requires
  a `service_overrides` table) could address this.
- **Pre-load iframe-compatibility check.** Detecting whether a URL will embed
  successfully before the user opens the overlay is not reliably possible in the
  browser. The fallback (§5.5) is the correct approach.
- **`sandbox` attribute fine-tuning per service.** If a specific service needs
  `allow-top-navigation` or similar, that is a future config field.
- **Mobile-app-like "back" button.** The overlay's `[←]` in the wireframe is
  cosmetic copy only (close behavior is identical to `✕`). A real browsing-history
  back stack inside the overlay is out of scope.

---

## 8. §8 — Design Section (Kare)

**Author:** Kare (design/UX) · **Date:** 2026-07-10 · **Status:** Design GO on both
surfaces (see §8.5).

Grounded in `Code/design-system/DESIGN-SYSTEM.md` and read off the **shipped**
homepad chrome, not invented: the launcher-panel modal family
(`src/index.css` `.launcher-overlay` / `.launcher-panel` / `.alert-history-header`),
the shipped three-segment `ThemeControl` (`src/ThemeControl.tsx`), and the shipped
`.app-spinner`. Every color/size below is either an existing token reused verbatim or
a measured value with its contrast ratio stated. Two surfaces:

- **8.1** Click-action selector inside `TileEditModal`.
- **8.2** The net-new `IframeOverlay`, built on the launcher-panel family.

Design rules in force (design-system §0–§9): AA contrast (≥4.5:1 body, ≥3:1 large /
meaningful UI), touch targets **≥44×44** through the iPad range (drop to 36 only
behind `lg:`/`hover:hover`, never `sm:` — §9.3), the 4/8pt grid, one primary per view,
every state designed, motion respects `prefers-reduced-motion`.

---

### 8.1 Click-action selector — `TileEditModal`

#### 8.1.1 Control type — **segmented control** (recommended, not a dropdown)

Use a **three-segment control**, not a `<select>`. Justification against the system:

1. **A shipped precedent already exists.** `ThemeControl` (System/Light/Dark) is a
   three-segment control that already passes AA and 44px. Click-action is the *same
   shape* — a small, fixed, mutually-exclusive set of 3 — so it reuses an approved
   component instead of inventing a third input idiom (design-system principle #8,
   consistency). A dropdown would be a new pattern for a 3-way choice.
2. **All options stay visible.** The three behaviors are not obvious from their names
   alone; a dropdown hides two of three behind a click and hides the per-option hint
   copy entirely. Segments show all three at once with a live description line.
3. **Touch-first.** Three ≥44px segments are three first-class tap targets; a native
   `<select>` on iPad opens a system wheel and its trigger is easy to render <44px
   (the exact class of miss we filed in #183/#185).

If a future field needs >5 options this recommendation flips to a `<select>` — 3 is
comfortably in segmented-control territory.

#### 8.1.2 Copy (exact — labels, description line, caveat)

| Value | Segment label | Description line (below control, reflects selection) |
|---|---|---|
| `new_tab` | **New tab** | `Opens in a new browser tab.` *(default)* |
| `same_tab` | **Same tab** | `Navigates this tab to the service.` |
| `iframe` | **Inline overlay** | `Embeds the service in an overlay panel. Some sites block embedding — a fallback link appears if that happens.` |

- **One live description line** sits directly under the control and shows the copy for
  the currently-selected segment (not three stacked sub-labels — that crowds the
  segments and pushes the field tall). This keeps the segments to a single word/short
  phrase each and keeps the hint legible.
- The **iframe caveat is not hidden**: it *is* the iframe option's description line, so
  the moment an admin selects "Inline overlay" the block-embedding caveat is on screen
  (satisfies spec §4.2 + §5.5 "do not hide this"). No separate warning banner, no
  tooltip, no on-save dialog.
- Field label above the control: **"Click action"** (matches the sentence-case field
  labels already in the form). Append the default marker only in the description, not
  the label.

#### 8.1.3 Layout, spacing & integration with the field stack

Insert the field **after URL, before Description** (spec §4.1). Vertical rhythm matches
the surrounding fields — the field is one item in the form's existing 16px (`space-y-4`)
stack; inside the field, 8px between label → control → description:

```
Click action                     ← label: 14px / 600, secondary ink, mb-8px
┌───────────┬───────────┬──────────────┐
│  New tab  │ Same tab  │Inline overlay│  ← segmented control, 3 equal segments
└───────────┴───────────┴──────────────┘     (flex-1 each), min-height 44px
Opens in a new browser tab. (default)  ← description line: 13–14px, #475069 (8.0:1),
                                          mt-8px, aria-live="polite"
```

- **Segments are equal-width and fill the field** (`flex-1` each) so the control spans
  the form column at every width; at the phone modal width (panel `min(640px,100vw-32)`
  → ~326px content) each segment is ~108px, enough for "Inline overlay" at 12–13px on
  one line. Set `white-space: nowrap` on segment labels so they never wrap mid-word.
- **Spacing lands on the 4/8 grid**: label→control 8, control→description 8, field
  gap 16. Wrapper border `p-0.5` (2px) exactly as `ThemeControl`.

#### 8.1.4 Segment styling — reuse `ThemeControl` verbatim

Do not restyle. Reuse the shipped classes so light/dark and AA come for free:

- **Group wrapper:** `role="group"` (aria-label "Click action"),
  `inline-flex items-center rounded-lg border border-neutral-200 p-0.5 dark:border-neutral-700`,
  plus `w-full` and `flex-1` per button so it spans the column.
- **Segment button:** `min-h-[44px] rounded-md px-2.5 py-1 text-xs font-medium`
  - **active:** `bg-indigo-600 text-white` — white on `#4f46e5` = **6.29:1** ✅
  - **inactive:** `text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800`
- **Radius** `rounded-md` inside `rounded-lg` wrapper = the 8/12 ramp; no new radius.

#### 8.1.5 Keyboard & touch interaction

Match the shipped `ThemeControl` behavior exactly (consistency, and it's already
QA'd):

- Each segment is a real `<button type="button">` with `aria-pressed={active}`; the
  group is `role="group"`. Each segment is a **Tab stop**; `Enter`/`Space` selects.
  (This is the shipped homepad idiom. A stricter `role="radiogroup"` with arrow-key
  roving is an acceptable enhancement but is *not* required and should not diverge from
  `ThemeControl` unless `ThemeControl` moves too.)
- Selection is **local state only** — it does **not** PATCH on click (unlike
  `ThemeControl`'s optimistic save). The value is committed with the modal's **Save**,
  and `click_action` is included in the PATCH **only when changed** (spec §4.3).
- **Focus ring:** inherit the modal's existing focus-visible treatment; the active
  segment must remain distinguishable by more than color (the filled indigo pill +
  `aria-pressed` both carry it, so it's not color-only).
- **Touch:** each segment ≥44px tall and ≥~100px wide → passes 2.5.5/HIG at iPad
  portrait and phone. No `sm:` shrink.

---

### 8.2 `IframeOverlay` — net-new host modal (built on the launcher-panel family)

**Design intent:** a *host container* for an embedded service, not a navigation step.
It reuses the launcher/alert-history chrome (backdrop, panel surface, header bar,
focus-trap, scroll-lock, motion) so it reads as part of the same modal family, but it
is deliberately **large** (fills the viewport) and has **one dismiss affordance set**,
signalling "you're looking *through* a window at the service," not "you navigated
somewhere with a back button."

**Drop the `[←]` from the §5.4 wireframe.** Spec §7 already says it's cosmetic and
close-identical; rendering a back arrow implies an in-overlay history stack that
doesn't exist. Header = **service name (left) + close ✕ (right)** only. One clear way
out, no false navigation signal.

#### 8.2.1 Backdrop (reuse launcher scrim)

- Light: `background: rgba(15, 23, 42, 0.45)` · Dark: `rgba(2, 4, 10, 0.6)` — the exact
  `.launcher-overlay` / `.dark .launcher-overlay` values.
- `backdrop-filter: blur(2px)` (launcher value).
- `position: fixed; inset: 0;` · **`z-index: 80`** — above the launcher/alert overlay
  (60) and the gear menu (70) so nothing bleeds over the embedded service.
- Clicking/tapping the backdrop **outside the panel** closes (AC-006c) — same
  `e.target === e.currentTarget` guard the launcher uses. (On mobile the panel is
  full-bleed, so backdrop is edge-only; the close button + Esc are the real exits
  there.)
- **Scroll-lock** the page behind while open: `document.body.style.overflow='hidden'`
  restored on unmount — the launcher's exact pattern (the grid behind must not scroll,
  AC-005).

#### 8.2.2 Panel surface & dimensions (measured)

Panel surface reuses `.launcher-panel`: `background:#fff` / `.dark → #0e1117`, `border:
1px solid rgba(15,23,42,.08)` (dark `rgba(255,255,255,.08)`), the launcher box-shadow,
`overflow:hidden`, `display:flex; flex-direction:column`. Radius snaps to the **8/12/16/20
ramp → `border-radius:16px`** (radius-lg; the launcher's off-ramp 14 is corrected here,
not copied) — full-bleed mobile drops to radius 0.

| Viewport | Width | Height | Radius | Notes |
|---|---|---|---|---|
| **Desktop ≥1025px** | `92vw`, **max 1600px** | `92vh` | 16px | centered; ≥90% each (spec §5.4). Cap keeps it from stretching to absurd line-lengths on 2560 while still maximizing embed real-estate. |
| **Tablet 641–1024** | `94vw` | `94vh` | 16px | iPad portrait/landscape. |
| **Mobile ≤640px** | `100vw` (full-bleed) | `100dvh` | 0 | uses `dvh` so iOS URL-bar collapse doesn't clip the header/footer; honors `env(safe-area-inset-*)` (see §8.2.4). |

- Center with the overlay flexbox (`justify-content:center; align-items:center`) on
  desktop/tablet; mobile the panel *is* the viewport.
- Content (`iframe` / spinner / fallback) is `flex:1; min-height:0` so it fills all
  space under the header and the iframe never overflows the rounded corners.

#### 8.2.3 Header bar (height, layout, contrast)

Modeled on `.alert-history-header` (flex, space-between, bottom border) but sized up so
the close target is a full 44px:

- **Bar:** `display:flex; align-items:center; justify-content:space-between; flex:none;`
  `min-height:56px; padding:12px 16px;` (grid values; 44px button + 12 top/bottom = 56).
  `border-bottom:1px solid rgba(15,23,42,.07)` (dark `rgba(255,255,255,.07)`) — family
  divider.
- **Title = service name:** 16px / 650, `#0f172a` = **17.85:1** ✅ (dark `#e6e9f2` =
  **15.57:1** ✅). `white-space:nowrap; overflow:hidden; text-overflow:ellipsis` and
  `min-width:0` so a long name truncates rather than colliding with the ✕ (avoids the
  disney "…oana" overlap, design-system §3.4). Optionally prefix the tile's 20px favicon
  for recognition — decorative, `aria-hidden`.
- **Close ✕:** a real `<button aria-label="Close">`, **44×44** hit box,
  `border-radius:9999px`, glyph 16–18px. **Color `#475069` = 8.02:1** ✅ (dark `#c7ccda`),
  hover `background:#f4f5fb` / dark `rgba(255,255,255,.06)`. This deliberately upgrades
  the `.alert-history-close` pattern, which ships at **28×28 / `#9aa3b8` (~2.8:1)** —
  under both the 44px and the 3:1 rules; do **not** copy those two values here. (Flagging
  `.alert-history-close` as a latent 44/contrast miss for a separate v-cleanup — noted,
  not blocking this build.)

#### 8.2.4 iframe & safe areas

- `<iframe>` fills the content area: `width:100%; height:100%; border:0; display:block;`
  `background:#fff` (so a transparent-bg app doesn't show our surface through it).
  Attributes exactly as spec §5.4 (`title`, `loading="lazy"`, the `sandbox` list).
- **Mobile safe areas** (iPad/phone-first): pad the header with
  `padding-top:max(12px, env(safe-area-inset-top))` and
  `padding-right:max(16px, env(safe-area-inset-right))` so the close ✕ never lands under
  a notch/rounded corner; the panel uses `100dvh`. (Same safe-area lesson as the
  fleet-feed mobile shell.)

#### 8.2.5 Loading state (no blank white)

From open until `onLoad` (or the 5s fallback, §5.5), the content area shows a **centered
loading state on a neutral surface**, never a blank white rectangle (spec §5.4):

- Surface behind: `#f8fafc` light / `#0e1117` dark (fills the content flex area).
- **Reuse `.app-spinner` verbatim** — 32px ring, `border-top-color:#4f46e5` (dark
  `#818cf8`), `app-spin 0.7s linear infinite`; it already `animation:none` under
  `prefers-reduced-motion`. Under reduced motion the ring is still a visible
  in-progress affordance (static ring), paired with the label below so "loading" is
  never motion-only.
- Caption under the spinner: `Loading <service name>…`, 14px, `#475069` (8.0:1) /
  dark `#a3a3a3` (7.5:1), `aria-live="polite"` and centered (spinner + label as a
  vertical stack, 12px gap).

#### 8.2.6 Fallback panel (blocked embed, §5.5)

When the 5s timer fires without `onLoad`, **replace the iframe area** (header stays) with
a centered, single-primary panel — this is a designed "error/empty" state (principle #5):

```
        ⚠  (28px, amber #d97706 — decorative, aria-hidden)

     This site can't be embedded            ← 16px / 650, #0f172a (17.9:1)
  Some sites block display in an embedded    ← 14px / 400, #475069 (8.0:1),
              frame.                            max-width ~40ch, centered

          ┌──────────────────────┐
          │  Open in new tab  ↗  │           ← primary: indigo-600, white
          └──────────────────────┘             (6.29:1), min-h 44, radius 8,
                                                px-4; 24px above it
```

- **Layout:** vertical stack, centered in the content area, `gap` 8 (icon→title→body) /
  24 (body→button), on the same `#f8fafc`/`#0e1117` surface as the loading state.
- **One primary button only** — "Open in new tab ↗" opens `service.url` with
  `target="_blank" rel="noreferrer noopener"` (AC-008). No second button; the header ✕
  is the dismiss (keeps "one primary per view"). The panel does **not** auto-close.
- **Focus moves to the "Open in new tab" button** when the fallback appears, so a
  keyboard user lands on the actionable control.
- Copy is exactly the spec §5.5 strings.

#### 8.2.7 Esc + focus-trap (reference the launcher-panel family)

Reuse `CommandLauncher`'s trap and restore, one-for-one:

- **On open:** move focus into the panel — to the **Close ✕** (or the panel container).
  Capture the launching tile as the restore target (mirror `LauncherProvider.restoreRef`).
- **Focus trap:** `role="dialog" aria-modal="true"`, `aria-label={service.name}` (or
  `aria-labelledby` the header title). Tab/Shift+Tab cycle only within the panel using
  the launcher's `onModalKeyDown` logic (query `a[href], button:not([disabled]), input,
  [tabindex]:not([tabindex="-1"])`, wrap first↔last). Focus can never reach the grid
  behind the scrim.
  - Note: content inside the `<iframe>` is a separate document; browser Tab may enter it
    (expected for an embedded app). The trap governs **our** chrome (close, and the
    fallback button) — that's the right scope.
- **Esc closes** (AC-006b): `keydown` listener attached on mount, removed on unmount
  (spec §5.4), same as the launcher's `Escape` handling.
- **On close** (✕ / Esc / backdrop): restore focus to the tile that opened the overlay.

#### 8.2.8 Animation & `prefers-reduced-motion`

Reuse the launcher motion so the family moves alike:

- **Backdrop:** `launcher-scrim-in` (opacity 0→1, `0.14s ease`).
- **Panel (desktop/tablet):** `launcher-panel-in` (opacity + `translateY(-6px)
  scale(0.98)` → rest, `0.14s ease`).
- **`prefers-reduced-motion: reduce`:** panel falls back to the **opacity-only** fade
  (the launcher's exact reduced-motion rule) — no transform, no scale. The spinner is
  already `animation:none` under reduced motion (§8.2.5).
- **Close:** immediate unmount (matches the launcher — it does not animate out); no
  janky exit. Keep it under ~150ms and purposeful (principle #6). Do **not** add a
  mobile bottom-sheet slide — that's outside the family's motion vocabulary; keep the
  shared fade.

#### 8.2.9 Responsive breakpoints (summary)

- **≤640px:** full-bleed `100vw × 100dvh`, radius 0, safe-area insets, header pinned
  top, backdrop edge-only; exits = ✕ + Esc.
- **641–1024px (iPad):** `94vw × 94vh`, radius 16, centered.
- **≥1025px (desktop):** `92vw × 92vh` (max-width 1600), radius 16, centered.
- Header, contrast, 44px close, focus-trap, and motion are **identical at all three** —
  only panel size/radius/safe-area change (responsive is real, verified per breakpoint —
  principle #7).

---

### 8.3 Design acceptance checklist (measurable gates for Stitch build + QA)

These are the objective checks I'll verify on the built UI in-browser before the design
co-sign is confirmed on the shipped code:

1. Selector renders as a 3-segment control; each segment **≥44×44** at phone (390) and
   iPad portrait (768); active segment white-on-indigo **≥4.5:1** (measured ~6.29).
2. The iframe caveat sentence is **visible** in the description line whenever "Inline
   overlay" is selected (not hidden behind hover/tooltip).
3. Selector value round-trips: opens reflecting saved `click_action`; PATCH sent only
   when changed (AC-010/011).
4. IframeOverlay: backdrop + panel + header reuse the launcher tokens; header title
   **≥4.5:1**, close ✕ **44×44** and glyph **≥4.5:1** (measured ~8.0).
5. Panel fills ≥90% W/H desktop, full-bleed ≤640 with safe-area insets; header/close
   never clipped by notch (AC-005).
6. Loading shows the `.app-spinner` + label on a non-white surface (no blank rectangle);
   fallback panel shows the exact §5.5 copy with a single ≥44px primary (AC-008).
7. Close works via ✕, Esc, and backdrop; focus traps in-panel and restores to the tile
   on close (AC-006); page behind does not scroll/navigate.
8. `prefers-reduced-motion` disables the panel transform (opacity-only) and the spinner
   spin; nothing conveys state by motion alone.

### 8.4 What Stitch must NOT reinvent

The launcher-panel family already ships all of the chrome. Reuse, don't reimplement:
`.launcher-overlay` (backdrop/scroll-lock/scrim motion), `.launcher-panel` (surface/
shadow/panel motion + reduced-motion rule), the `CommandLauncher` focus-trap +
restore-focus logic, `.alert-history-header` (header layout), `.app-spinner` (loading),
and `ThemeControl` (the segmented control). New CSS is limited to: overlay z-index 80,
the large responsive panel sizing (§8.2.2), the 44px/`#475069` close upgrade, and the
fallback-panel layout.

### 8.5 Design co-sign

**Design GO** on both surfaces, conditioned on the §8.3 checklist being verified on the
built UI (my standing verify-on-shipped-code gate — a spec-time GO plus a confirm pass on
what Stitch renders). No blockers in the design as specced here. — **Kare**, 2026-07-10

---

## 9. Product Sign-Off

**Kare (design):** GO on both surfaces (§8.5), conditioned on the §8.3 checklist verified on the built UI — 2026-07-10.

**Walt (product lead):** _awaiting product go_

Spec is **not cleared for build** until both sign-offs are recorded here.

---

## 10. Stitch Build Checklist

### homepad-api

- [ ] **Migration** `migrations/0008_click_action.up.sql` — `ALTER TABLE services ADD COLUMN click_action TEXT NOT NULL DEFAULT 'new_tab' CHECK (...)`.
- [ ] **Migration down** `migrations/0008_click_action.down.sql` — `ALTER TABLE services DROP COLUMN click_action`.
- [ ] **`storage.Service` struct** — add `ClickAction string` field.
- [ ] **`storage.ServiceUpdate` struct** — add `ClickAction *string` field.
- [ ] **`ListServices` query** — `SELECT` + `Scan` include `click_action`.
- [ ] **`CreateService`** — accept + insert `click_action`; default `'new_tab'` if not provided.
- [ ] **`UpdateService`** — accept + apply `ClickAction` in the COALESCE patch.
- [ ] **`serviceView` struct** — add `ClickAction string \`json:"clickAction"\``.
- [ ] **`handleListServices`** — map `sv.ClickAction` to `serviceView.ClickAction`.
- [ ] **`handleCreateService` / `handleUpdateService`** — parse `clickAction` from JSON body; validate enum (`new_tab | same_tab | iframe`), return 400 if invalid.
- [ ] **Tests** — `TestListServices` asserts `clickAction` is present; `TestUpdateService` asserts change persists; invalid enum returns 400.

### homepad (frontend)

- [ ] **`src/api.ts` — `Service` type** — add `clickAction: 'new_tab' | 'same_tab' | 'iframe'`.
- [ ] **`src/api.ts` — `ServiceInput` type** — add `click_action?: 'new_tab' | 'same_tab' | 'iframe'`.
- [ ] **`src/api.ts` — `updateService`** — include `click_action` in the PATCH payload when provided.
- [ ] **`AppGrid.tsx` — `ToolLink`** — replace unconditional `target="_blank"` with a branch:
  - `new_tab` (or absent): current `<a target="_blank" rel="noreferrer noopener">`.
  - `same_tab`: `<a>` with no `target`.
  - `iframe`: `<a href={url} onClick={(e) => { e.preventDefault(); openOverlay(); }}>`.
- [ ] **New `IframeOverlay` component** (`src/IframeOverlay.tsx`):
  - Props: `service: Service`, `onClose: () => void`.
  - Header bar: title + close button.
  - `<iframe>` with `title`, `loading="lazy"`, `sandbox` attributes.
  - Loading spinner until `onLoad` or 5s timeout.
  - Fallback panel on timeout (copy: §5.5).
  - Esc keydown listener + backdrop onClick to close.
  - Focus trap while open (per design-system a11y pattern).
  - prefers-reduced-motion aware (per Kare §8).
- [ ] **`TileEditModal.tsx` (v21 component)** — add click-action selector:
  - State: `clickAction` initialized from `service.clickAction ?? 'new_tab'`.
  - Segmented control (or `<select>` per Kare §8) with three values.
  - Inline caveat for `iframe` option.
  - Include `click_action` in the PATCH payload on save (only when changed).
- [ ] **Backwards compat** — treat `service.clickAction === undefined` as `'new_tab'` in `ToolLink` and `TileEditModal`.
- [ ] **Tests**:
  - `AppGrid.test.tsx` — tile with `new_tab` renders `target="_blank"`; `same_tab` renders no target; `iframe` click opens overlay (mock `IframeOverlay`).
  - `IframeOverlay.test.tsx` — renders header title; Esc closes; close button closes; backdrop closes; fallback panel appears after 5s timeout (fake timers); "Open in new tab" button in fallback has correct `href`.
  - `TileEditModal.test.tsx` (or `ServiceForm.test.tsx`) — selector visible; change + save PATCHes with correct `click_action`; non-admin does not see modal (per v21 tests).

---

## 11. Notes for Joe

- **Pipeline:** v21 → v22 → v23. Stitch cannot start v23 until v21 is cleared and
  built. Joe should dispatch Stitch for v23 only after `TileEditModal` is in `main`.
- **Kare dispatch:** I am dispatching Kare now (see §8) for the design section
  concurrently with this spec. Kare's task subject: `friend.kare.task.<task_id>`.
- **No new backend API endpoints.** `click_action` rides existing
  `GET/PATCH /api/services` — no new routes.
- **SemVer:** patch for migration-only = no, minor feature = yes. v13.12.0.
