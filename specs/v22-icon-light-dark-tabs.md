# homepad v22 — Icon Light/Dark Tabs in TileEditModal

**Spec ID:** v22-icon-light-dark-tabs
**Created:** 2026-07-05
**Author:** Walt (product lead)
**Status:** Draft — Kare §8 authored + DESIGN GO (2026-07-05); awaiting Stitch build (blocked on v21 landing first)
**Repos:** `Code/homepad` (UI only — no backend changes required)
**Estimate:** ~3–4 hours Stitch
**Target version:** v13.11.0 (feature = minor; v21 ships as v13.10.0)
**Prerequisite:** v21 (SPEC v21-tile-edit-modal) must land first — v22 refactors
the icon section that v21 introduces. Cannot build v22 on a codebase that does not
yet have `TileEditModal`.

---

## 1. Problem

Caleb's direct request: *"There should be two tabs: Light Mode & Dark Mode. Allow
to have unique icons for each."*

The v21 TileEditModal icon section presents all icon controls in a **flat panel**:
an upload button for the light PNG, an upload button for the dark PNG, a shared URL
field, fetch-favicon, and remove — all visible at once with no clear tab separation
between the two themes. This is functional but visually cluttered and does not make
the "Light Mode" / "Dark Mode" distinction first-class. An admin can overlook the
dark variant controls entirely.

---

## 2. Data-Model Note (key finding — read before building)

**The backend already stores two fully independent icon blobs — no schema changes
are needed for v22.**

Confirmed by reading `homepad-api/internal/api/icons.go` and
`homepad-api/internal/storage/storage.go`:

- The `service_icons` table stores rows keyed by `(service_id, variant)` where
  `variant ∈ {'light', 'dark'}`. Each variant is a completely independent row with
  its own bytes, dimensions, and ETag.
- Existing endpoints: `GET/PUT/DELETE /api/services/{id}/icon/{variant}` — already
  fully variant-specific.
- The front-end `Service` type exposes `iconLight: boolean` and `iconDark: boolean`
  — presence flags, one per variant.
- `iconSrc()` in `src/icons.ts` resolves: preferred-theme variant → other variant
  (fallback) → `services.icon` URL → initials badge.

**The `services.icon` URL field is a single shared column.** It is not variant-
specific. It acts as a universal lower-priority fallback (applied when neither
uploaded PNG variant exists). Adding per-variant URL columns would require a schema
migration; that is out of scope for v22 (see §5.3 for how the URL field is handled
in the tab UI).

**Summary:** V22 is a pure UI reorganisation. No migrations, no new API endpoints
required (except the stretch-goal fetch-favicon variant parameter — see §6.4).

---

## 3. Goal

Reorganise the TileEditModal's icon section into **two named tabs — "Light Mode" and
"Dark Mode"** — each exposing that variant's upload, fetch-favicon, and remove
controls independently. An admin can set a distinct PNG for each theme without
visual clutter from the other mode's controls. The shared URL fallback is surfaced
clearly as applying to both modes.

---

## 4. Scope

**In scope:**
- Replace the flat icon panel in `TileEditModal` with a two-tab ARIA tablist
  ("Light Mode" / "Dark Mode").
- Each tab: its own icon preview, Upload PNG button, Remove control, and
  (stretch) Fetch favicon button — all operating on that tab's variant.
- Shared URL fallback field rendered below the tabpanel, clearly labelled as
  applying to both modes.
- ARIA `tablist` / `tab` / `tabpanel` with keyboard arrow-key navigation (← →).
- All v21 a11y requirements maintained: 44 px touch targets, focus trap, contrast.

**Out of scope:**
- Per-variant URL fallback fields (requires schema migration — future spec if needed).
- Any change to the edit affordance (pencil button) or other modal fields
  (title, URL, description, category) — those are unchanged from v21.
- Backend changes beyond the optional `variant` parameter on the fetch-favicon
  endpoint (§6.4).
- Creating or deleting services.

---

## 5. Tabbed Icon Section

### 5.1 Tab structure

The icon section of `TileEditModal` is replaced by:

```
┌─────────────────────────────────────────────┐
│  [Light Mode]  [Dark Mode]   ← tab strip     │
├─────────────────────────────────────────────┤
│                                             │
│  [icon preview]   Upload PNG                │
│                   Fetch from URL  (stretch) │
│                   Remove icon               │
│                                             │
├─────────────────────────────────────────────┤
│  Icon URL (fallback — both modes)           │
│  [___________________________________]      │
└─────────────────────────────────────────────┘
```

The tab strip is a `role="tablist"` containing two `role="tab"` buttons. The
content below the strip is a single `role="tabpanel"` whose content swaps with the
active tab.

**Default tab on open:** "Light Mode" (index 0). Always — regardless of which
variant exists. The admin explicitly switches to the Dark Mode tab to configure it.

### 5.2 Per-tab controls

Each tab shows:

| Control | Light Mode tab | Dark Mode tab |
|---|---|---|
| **Icon preview** | Resolves `iconSrc(service, 'light', rev)` — the theme-aware preview for light | Resolves `iconSrc(service, 'dark', rev)` |
| **Upload PNG** | `PUT /api/services/{id}/icon/light` — fires immediately on file select | `PUT /api/services/{id}/icon/dark` — same |
| **Remove icon** | Deletes only `icon/light` (with confirm). Falls back to dark or URL. | Deletes only `icon/dark` (with confirm). Falls back to light or URL. |
| **Fetch favicon** | (stretch) `POST /api/services/{id}/fetch-icon?variant=light` | (stretch) `POST /api/services/{id}/fetch-icon?variant=dark` |

**Per-tab remove** removes only the active tab's variant. It does NOT clear the
other variant or the URL field. After removal, `iconSrc()` naturally falls back to
the other variant (if present) or the URL. This is correct behaviour — an admin
who removes the dark PNG keeps the light PNG intact.

### 5.3 Shared URL fallback (below the tabpanel)

The `services.icon` text URL field is rendered **below the tabpanel**, visually
separated from the tab content. Label: **"URL fallback (both modes)"** with helper
text: *"Used when no PNG is uploaded for a mode."*

It is not tab-specific — editing it changes the shared `services.icon` column,
which affects both themes equally. This matches the underlying data model (single
column). The helper text makes the shared nature explicit so an admin is not
surprised.

If an admin needs fully independent URL-based icons for each mode, the correct path
is to upload a PNG for the mode that should differ. Document this in the UI if Kare
finds a natural place for a tooltip or helper.

The URL field value is submitted in the main Save PATCH along with other text
fields (unchanged from v21 §6.2).

### 5.4 Live preview behaviour

The icon preview inside each tab updates immediately when the admin changes that
tab's icon state (upload succeeds, remove confirmed). Switching tabs shows the
preview for the newly-active tab. The preview does NOT update from the other tab's
changes while on a different tab — updates are scoped to the currently-visible tab.

When the admin switches to the Dark Mode tab, the preview resolves
`iconSrc(service, 'dark', rev)`. If no dark variant exists and no URL fallback is
set, the preview shows the initials badge (the natural fallback).

---

## 6. A11y (non-negotiable)

All requirements below are required for v22 to pass PAT.

### 6.1 ARIA tab pattern

Follow the [WAI-ARIA Tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/):

- Container: `role="tablist"` with `aria-label="Icon theme"`.
- Each tab: `role="tab"`, `aria-selected="true|false"`, `aria-controls="<panelId>"`,
  `id="<tabId>"`, `tabindex="0"` (active) or `tabindex="-1"` (inactive).
- Panel: `role="tabpanel"`, `aria-labelledby="<tabId>"`, `id="<panelId>"`.

### 6.2 Keyboard navigation

- **Arrow Left / Arrow Right:** Move focus between tabs. Activates the tab
  immediately (no separate Enter needed — automatic activation pattern).
- **Tab:** Moves focus INTO the active tabpanel (to the first interactive element
  inside it). Does not cycle through inactive tabs.
- **Shift+Tab** from the first element inside the panel: Returns focus to the
  active tab.
- This is the standard automatic-activation tabs pattern and must not require an
  Enter press to activate.

### 6.3 Focus management

- On modal open: focus goes to the first field in the Light Mode tab (or the
  active tab if state is restored). Unchanged from v21.
- On tab switch (arrow key): focus moves to the newly active `role="tab"` button.
  The panelcontent updates but focus stays on the tab, not the panel, until the
  admin presses Tab to enter the panel.

### 6.4 Touch targets and contrast

- Tab buttons: ≥ 44 × 44 px touch target (DESIGN-SYSTEM §9.3).
- All buttons inside each tabpanel: ≥ 44 × 44 px.
- Active tab indicator (underline, border, background): ≥ 3:1 contrast against
  the inactive tab background (DESIGN-SYSTEM §1.1 UI graphic floor).
- All text: ≥ 4.5:1.

---

## 7. Optional / Stretch: Fetch-Favicon Per Variant

If the fetch-favicon feature from v21 (§7.4 of that spec) is implemented, v22
requires a small backend addition to make it per-tab:

**Request:** `POST /api/services/{id}/fetch-icon?variant=light|dark`
*(adds a `variant` query parameter to the existing endpoint signature)*

**Behaviour:** same as v21 §7.4, but stores the fetched icon as `variant` instead
of always `light`. Defaults to `light` if `variant` is omitted (backward-
compatible).

This is only needed if fetch-favicon ships in v21. If v21 deferred it, this
subsection is moot for v22; simply note it here for when fetch-favicon ships.

---

## 8. Design Section

**Owner:** Kare (design/UX). **Status:** DESIGN GO — 2026-07-05.

Every number below is **measured**, not eyeballed. v22 changes only the icon section of
the v21 `TileEditModal`, so this section builds directly on the v21 §8 co-sign and reuses
its exact tokens (`v21-mock.html`); it changes nothing about the modal chrome, the pencil
affordance, the text fields, or the Save/Cancel/discard flow — all of that is inherited
unchanged from v21 §8. I built the new tabbed icon section as a token-accurate mock
(`v22-mock.html`, three states: light-active/filled, dark-active/empty, dark-inherits-light
+ inline remove-confirm), rendered it in headless Chromium at **iPad portrait 768, `dsf=2`,
light and dark**, and read the computed contrast + `getBoundingClientRect` touch boxes off
the live DOM (`v22-measure.js` → `v22-measure-{light,dark}.json`, screenshots
`v22-tabs-{light,dark}.png`). This is a **spec-time co-sign**; the same measurements re-run
on Stitch's built UI at PR review before the design gate closes on the shipped code.

### 8.1 Tab strip — a segmented control (not underline/pill)

**Choice: a segmented control**, not underline tabs and not floating pills. Reasoning: there
are exactly **two, mutually-exclusive modes** — a segmented control is the idiom that says
"pick one of these two," it fills the panel width edge-to-edge (no wasted rail like pills),
its segments are naturally large touch targets, and it matches the iOS/iPad idiom on an
iPad-first homelab. Underline tabs read as "sections of a larger surface" (wrong signal for a
binary toggle) and their active indicator is a thin 2px line that's easy to miss; pills float
and waste the panel width. The segmented control keeps the tab semantics required by §6.1 —
**the ARIA roles (`tablist`/`tab`/`tabpanel`) are independent of the visual treatment**, so
this is still a WAI-ARIA tablist with automatic arrow-key activation, just styled as a segment.

**Where it sits in the hierarchy:** the segmented strip is the **topmost element inside the
v21 icon compound panel** (§8.3 of v21 — the bordered sub-block, `radius-md`, 1px `border-soft`).
The panel remains the "one grouped unit" it was in v21; v22 only reorganises its *interior* into
strip → tabpanel → shared URL field. It does **not** promote the icon controls to a top-level
modal region — the modal's field stack (Title → URL → Category → **Icon panel** → Description)
is unchanged from v21 §8.2.

**Visual treatment (theme-aware, measured):**

- **Track (the well):** the strip is a `--seg-track` well (`#e5e5e5` light / `#101012` dark),
  `radius-md`, 4px inner padding, holding two equal 50%-width segments.
- **Active segment:** a **raised thumb** (`--seg-thumb` `#ffffff` light / `#26262a` dark) with a
  soft `0 1px 2px rgba(0,0,0,.12)` lift, a **1.5px accent border** (theme-aware indigo `#4f46e5`
  light / `#818cf8` dark — the v21 accent token), an **accent label** at 15/**600**, and a filled
  leading status dot. Active is distinguished by **four independent cues — raised fill, accent
  border, accent color, and weight — never color alone.**
- **Inactive segment:** transparent (shows the track), label in the `helper` token
  (`#525252` / `#d4d4d4`) at 15/500, a dimmed dot. Both segments carry a 1.5px *transparent*
  border so switching active↔inactive causes **zero layout shift**.
- **The active indicator per the §6.4 ≥3:1 rule is the accent border + accent label**, not the
  thumb fill. Measured **accent border vs the inactive track: 4.99:1 light / 6.37:1 dark**;
  **accent label vs the thumb: 6.29:1 light / 5.05:1 dark** — both clear ≥3, and the label clears
  ≥4.5 as text. (The raised white/elevated thumb fill is a *secondary* elevation cue — it is only
  ~1.26:1 vs the track and is deliberately **not** the accessibility-load-bearing indicator, the
  same "faint fill needs a defining ring" reasoning v21 used for the icon preview and the #242
  status pip.)

### 8.2 Per-tab icon preview

- **Size 64×64** (reused verbatim from v21 §8.3 — exceeds the ≥48 floor), `radius-md`, on the
  neutral `preview-bg` (`#f5f5f5` light / `#2a2a2c` dark) with the **1px definition border**
  (measured **3.08:1 light / 3.63:1 dark**, ≥3) so a white/transparent PNG still reads a boundary.
- **No redundant "Light preview" / "Dark preview" caption.** The active tab already names the mode,
  and the tabpanel is `aria-labelledby` its tab — a caption would just repeat it. The meaning that a
  caption *would* add (which variant is actually resolving, and the fallback story) is carried more
  precisely by the empty-state and inherit-note in §8.3, which say *why* the preview looks the way it
  does. For screen readers the preview `<img>` carries a **variant-specific `alt`**, e.g.
  *"Light-mode icon preview"* / *"Dark-mode icon preview"*, so the mode is announced without visible
  chrome.
- Live/optimistic update is unchanged from v21: the preview updates the moment that tab's variant
  changes (upload success / remove confirmed), scoped to the **currently visible tab** only (§5.4).

### 8.3 Empty-state per tab — explicit, not a bare initials badge

The initials badge is the *dashboard* fallback; inside the editor it reads as "an icon is set,"
which is misleading when the variant is actually empty. So the preview area is a **designed state**,
one of three:

1. **Has a PNG for this variant** → renders it (64×64 on the definition border).
2. **No PNG for this variant, but the other variant or the URL resolves** → renders the resolved
   fallback icon at **reduced emphasis (`opacity .7`)** with an inline note *"No dark PNG — showing
   the light icon."* (or *"…showing the URL fallback."*). This is the honest state: it shows *exactly*
   what the tile will render and *why*, so the admin isn't fooled into thinking dark is configured
   when it's inheriting. Note in the `secondary` token (measured **4.74:1 light / 6.75:1 dark**).
3. **Truly empty — no PNG for this variant, no other variant, no URL** → an **explicit empty-state**:
   the 64×64 box becomes a **1.5px dashed border** (measured **3.36:1 light / 4.31:1 dark**, ≥3) with
   a muted placeholder glyph and **"No icon set"** (`helper` token, measured **7.81:1 light / 11.48:1
   dark**), plus a one-line consequence hint *"Tile will show its initials badge in [light/dark]
   theme."* This tells the admin it's empty **and** what the live dashboard will do — Principle 5,
   every state designed.

### 8.4 URL fallback field — below the tabpanel, deliberately quieter

The shared `services.icon` URL field sits **below the tabpanel, separated by a full-width 1px
`border-soft` divider with 16px padding above and below** — the divider is the visual signal that
this control is **outside** the active tab and applies to *both* modes, not to the tab above it.

- **Label copy:** **"URL fallback"** with a small **`both modes`** outline pill immediately to its
  right (accent-outlined, measured label 6.29:1 / 5.70:1) — the pill makes the shared scope legible
  at a glance without a sentence. Helper beneath: *"Used when no PNG is uploaded for a mode."*
  (`helper` token, **7.81:1 / 11.48:1**) — states the `iconSrc()` precedence in plain language.
- **Prominence:** deliberately **lower than the tab content**. It is the tertiary link in the
  `iconSrc()` chain (PNG → other variant → URL → initials), so it's a single full-width input with a
  quiet helper, no accent fill — calmer than the active tab's Upload/Fetch controls above the divider.
  This matches the data model (§5.3, §2): one shared column, not two, so it must not look like it lives
  "inside" either tab.
- Submitted with the main Save PATCH, unchanged from v21 §6.2 / AC-005.

### 8.5 Remove-icon confirmation — inline, variant-specific, **never native `confirm()`**

Consistent with **v21 §8.4** (which chose inline confirm for the discard flow), remove uses an
**inline in-panel confirm**, never `window.confirm()`. Native confirm is unstyleable (fails the DS
type/contrast), yanks focus out of the trapped dialog (fights v21's §6.4 focus-trap), and reads as a
foreign OS artifact (Principle 8).

Tapping **"Remove [light/dark] icon"** transforms that control **in place** into a confirm strip —
message **"Remove light icon?"** / **"Remove dark icon?"** (variant-specific so there is zero
ambiguity about which blob is cleared) with **Keep** (secondary, **receives focus — the safe
default**) + **Remove** (danger-outline). Esc / blur = "Keep." The strip is `role="alert"` so the
prompt is announced. It transforms **only the active tab's** control; the other tab is untouched
(§5.2 — per-tab, non-destructive to the other variant, AC-004). Removes fire immediately (not
deferred to Save), unchanged from v21 §6.3.

### 8.6 Fetch-favicon (stretch) — **one button per tab**, shared in-panel busy language

- **Per tab, not shared.** The endpoint is `?variant=light|dark` (§6.4), so each tab's Fetch stores
  into *its own* variant. The tab already **is** the variant selector, so a single shared Fetch button
  would need a redundant second mode picker. One ghost **"Fetch from URL"** (with a small download
  glyph) lives in each tab's control stack, ≥44px.
- **Disabled when the shared URL field is empty** (nothing to fetch from) — rendered `disabled` +
  `aria-disabled="true"` + `title="Enter a URL first"`, a *reasoned* disabled state, not a silent dead
  button (same as v21 §8.5).
- **Loading / success / failure = the v21 §8.5 in-panel language, scoped to the active tab's preview:**
  on tap the preview shows the busy overlay (spinner + "Fetching…"), the button disables; on success
  the preview cross-fades (120ms) to the fetched icon + inline **"Favicon added ✓"** (success token)
  that fades after ~2s; on failure an inline danger-token line *"Couldn't fetch a favicon from this
  URL."* under the panel, existing icon unchanged (§7 / v21 §7.4). **No global toast** — a fetch isn't
  the Save, so feedback stays local. *If v21 deferred fetch-favicon, this subsection is moot for v22
  (§7) and the control simply doesn't render — the tab strip, upload, remove, and URL fallback stand
  on their own.*

### 8.7 Component mapping (`Code/design-system`)

| v22 part | Design-system source |
|---|---|
| **Tab strip (segmented control)** | **New pattern.** The DS has no tab/segmented component yet (§3.4 covered only menus/overlays; v21 added the dialog). v22 introduces the **canonical segmented / tabbed control** — `--seg-track` well on `surface-sunken` (§1.1), `radius-md` (§1.4), the theme-aware **accent** indicator + label (the v21 accent fold-in: `#4f46e5` light / `#818cf8` dark). I fold it back into the DS in the same breath (drift rule). |
| **Tabpanel wrapper** | The **v21 icon compound panel** (v21 §8.3) — bordered sub-block, `radius-md`, 1px `border-soft` — reused, now hosting strip → panel → URL field. |
| **Per-tab preview** | Tile/card treatment (§3.1) at `radius-md` + the #242 "faint fill needs a ≥3:1 definition ring" rule — identical to v21. |
| **Empty-state (dashed box + "No icon set")** | **New small affordance** (Principle 5). Dashed variant of the preview box; folded into the DS empty-state guidance alongside the DS v1.1 states work. |
| **Per-tab controls** (Upload / Fetch / Remove) | Button patterns §3.2 — **Upload** = secondary fill; **Fetch** = ghost/accent; **Remove** = destructive text — all ≥44 (the §3.2 36px miss stays fixed). Inherited from v21. |
| **Inline remove-confirm** | Reuses the **v21 inline-confirm-strip** pattern (v21 §8.4 fold-in) — Keep (secondary) + destructive-outline. |
| **URL fallback field + `both modes` pill** | Input pattern §3.3 at `min-height:44`; the pill is a new lightweight **scope badge** (accent-outline) folded into the DS badge set. |

**Design-system fold-ins produced by this spec** (landed in `Code/design-system` so the doc never
drifts): the **segmented/tabbed control** component (a genuinely new pattern), the **preview
empty-state** affordance, and the **scope-badge** pill. All three reuse existing v21 tokens — no new
color tokens are introduced.

### 8.8 Touch & contrast compliance — **measured** (iPad portrait 768, light + dark)

**Touch targets — all interactive elements ≥44, zero fails in either theme:**

| Element | Measured | Reaches ≥44 by |
|---|---|---|
| **Light Mode / Dark Mode tabs** | **179 × 48** each | 50%-width segment, `min-height:48` |
| Upload PNG | **286 × 44** | `min-height:44` button |
| Fetch from URL | ≥44 tall | `min-height:44` (disabled state keeps the box) |
| Remove [light/dark] icon | ≥44 tall | `min-height:44` danger-text |
| Keep / Remove (confirm strip) | **74 × 44** / ≥44 | `min-height:44` |
| Icon-URL input | **44** tall | `min-height:44` input (v21 §3.3 fix) |

**Contrast — measured ratio (light / dark) vs floor:**

| Element | Token | Light | Dark | Floor |
|---|---|---|---|---|
| Active tab label | accent | **6.29** | **5.05** | 4.5 ✅ |
| Inactive tab label | helper | **6.20** | **12.82** | 4.5 ✅ |
| **Active-tab indicator (accent border) vs inactive track** | accent | **4.99** | **6.37** | 3 ✅ |
| `both modes` scope pill | accent | **6.29** | **5.70** | 4.5 ✅ |
| URL-fallback label | label | **10.37** | **13.51** | 4.5 ✅ |
| Helper text | helper | **7.81** | **11.48** | 4.5 ✅ |
| Empty-state "No icon set" | helper | **7.81** | **11.48** | 4.5 ✅ |
| Empty-state dashed border | border | **3.36** | **4.31** | 3 ✅ |
| Inherit note ("showing the light icon") | secondary | **4.74** | **6.75** | 4.5 ✅ |
| Upload (secondary) label | ink on surface-2 | **16.44** | **13.14** | 4.5 ✅ |
| Fetch (ghost) label | accent | **6.29** | **5.70** | 4.5 ✅ |
| Remove / confirm danger | danger | **6.47** | **6.15** | 4.5 ✅ |
| Keep-confirm label | ink on surface-2 | **16.44** | **13.14** | 4.5 ✅ |
| Confirm-strip message | ink | **17.93** | **15.61** | 4.5 ✅ |
| Icon-preview definition border | border | **3.08** | **3.63** | 3 ✅ |

**Token note (fold into the DS with the segmented control):** the **active indicator is the accent
border + accent label**, both theme-aware (`#4f46e5` light / `#818cf8` dark, the v21 accent fold-in) —
in dark, indigo-600 alone would only clear ~4.47 as a label, so the segmented control uses the same
indigo-400 correction v21 already logged. The raised-thumb fill is an elevation cue only and is
intentionally **not** the ≥3:1 indicator.

**Artifacts:** `v22-mock.html`, `v22-measure.js`, `v22-measure-{light,dark}.json`,
`v22-tabs-{light,dark}.png` (in `/home/kare/work`).

---

## 9. Product Acceptance Criteria

**AC-001 — Icon section shows two tabs**
The TileEditModal icon section (for admin in edit mode) shows a tab strip with
exactly two tabs: "Light Mode" (index 0, default active) and "Dark Mode" (index 1).
No other content from the v21 flat icon panel is visible at the same level.

**AC-002 — Each tab shows its variant's icon preview**
Light Mode tab preview resolves the same icon a tile renders in light theme (same
`iconSrc()` chain for `'light'`). Dark Mode tab preview resolves `'dark'`. The
correct initials badge is shown when neither variant nor URL exists.

**AC-003 — Upload PNG is fully per-tab and independent**
Uploading a PNG in the Light Mode tab stores only the light variant (does not touch
dark). Uploading in the Dark Mode tab stores only the dark variant (does not touch
light). The preview in each tab reflects the upload for that tab; the other tab's
preview is unaffected.

**AC-004 — Remove icon is per-tab and non-destructive to the other variant**
"Remove icon" in the Light Mode tab removes only the light PNG. The dark PNG (if
present) is NOT deleted. "Remove icon" in the Dark Mode tab removes only the dark
PNG. After confirmation and removal, the affected tab's preview updates (falls back
to the other variant or URL or initials badge per `iconSrc()` chain).

**AC-005 — URL field is shared and clearly labelled**
The Icon URL field appears below the tabpanel with a label making clear it applies
to both modes (e.g., "URL fallback — both modes"). Editing it in one tab state is
reflected if the admin later views the field again; it is one field, not two.

**AC-006 — Switching tabs preserves in-progress state**
Switching from the Light Mode tab to the Dark Mode tab (and back) does not discard
any pending URL edits or trigger any network requests. The tab switch is purely a
UI state change.

**AC-007 — Default tab is always Light Mode on modal open**
When the admin opens the TileEditModal (regardless of which variant(s) exist or
the current app theme), the Light Mode tab is active by default.

**AC-008 — Tab strip uses ARIA tablist/tab/tabpanel**
`role="tablist"` container, each tab has `role="tab"` with `aria-selected` and
`aria-controls`, panel has `role="tabpanel"` with `aria-labelledby`. A screen reader
announces the tab strip as a tab list, each tab as selectable, and the panel as the
tab's content region.

**AC-009 — Arrow-key navigation activates tabs**
With focus on a tab, pressing Arrow Right activates the Dark Mode tab (wraps from
Dark to Light). Arrow Left activates the Light Mode tab (wraps from Light to Dark).
Activation is automatic — no Enter required.

**AC-010 — Tab touch targets ≥ 44 × 44 px**
Both tab buttons have ≥ 44 × 44 px touch targets. All Upload, Remove, and
fetch-favicon buttons within each tabpanel also have ≥ 44 × 44 px targets.

**AC-011 — All v21 icon features are preserved, none dropped**
Every capability from v21 §6.2 — upload, remove (with confirmation), icon URL
field, live preview — is still accessible in v22. They are reorganised into the tab
structure, not removed. Fetch-favicon (if v21 shipped it) appears per-tab.

**AC-012 — Dark-mode icon renders on the live tile**
After the admin uploads a dark-mode PNG and saves, when the dashboard is displayed
in dark theme, the tile renders the dark PNG (not the light PNG). `iconSrc()` chain
is unchanged; the tab UI simply makes it easier to set the dark variant.

**AC-013 — Save/Cancel behaviour unchanged from v21**
Save PATCHes text fields and icon URL (unchanged). Cancel with dirty state prompts
discard confirm. Icon uploads and removes fire immediately on action (not deferred
to Save). Modal close behaviour is identical to v21.

---

## 10. Sign-offs

| Seat | Sign-off | Date |
|---|---|---|
| Walt (product) | ✅ APPROVED — 2026-07-05 | |
| Kare (design) | ✅ DESIGN GO — §8 authored, measured @ iPad 768 light+dark (`v22-tabs-{light,dark}.png`); segmented tablist, all touch ≥44, all contrast ≥ floor both themes | 2026-07-05 |

**Cleared to build:** Yes from a design standpoint — both sign-offs present (Walt product ✅ +
Kare design ✅). **Build prerequisite still binds:** v21 (`v21-tile-edit-modal`) must land first —
v22 refactors the icon section v21 introduces (§0 Prerequisite). This is a **spec-time co-sign**; a
built-UI design co-sign re-runs the §8.8 measurements on Stitch's PR before the design gate closes on
shipped code.
