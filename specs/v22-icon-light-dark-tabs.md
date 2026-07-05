# homepad v22 — Icon Light/Dark Tabs in TileEditModal

**Spec ID:** v22-icon-light-dark-tabs
**Created:** 2026-07-05
**Author:** Walt (product lead)
**Status:** Draft — awaiting Kare §8 design section
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

*This section is owned by Kare. It is **required** before this spec is final and
before Stitch builds.*

Kare's design section must address:

1. **Tab strip visual treatment** — active vs. inactive tab state (color, underline,
   border, background). How does the tab strip sit within the modal's overall
   hierarchy? Pill tabs, underline tabs, or segmented control?

2. **Per-tab icon preview** — size (≥ 48×48 px per v21 floor), shape, border
   treatment. Does the preview carry a label ("Light preview" / "Dark preview") or
   is the tab label sufficient?

3. **Empty-state per tab** — when a variant has no uploaded PNG and no URL fallback,
   what does the preview area show? (Initials badge is the data-model fallback, but
   should there also be an explicit empty-state affordance — e.g., dashed border
   with "No icon set"?)

4. **URL fallback field placement and labelling** — it sits below the tabpanel.
   Visual separator, label copy, helper text. How prominent should it be relative to
   the tab content above it?

5. **Remove icon confirmation pattern** — within each tab. Native `confirm()` or
   inline state (consistent with whatever v21 decides in its §8)?

6. **Fetch-favicon button** (if included) — one button per tab, or shared? Loading
   and success/failure treatment within the tab.

7. **Component mapping** — which design-system (`Code/design-system`) components
   map to the tab strip, tabpanel wrapper, and per-tab controls?

8. **Touch and contrast compliance** — confirm ≥ 44 px for tabs and all per-tab
   buttons; contrast floors for active/inactive tab indicator and all text.

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
| Kare (design) | ⬜ Awaiting §8 design section | |

**Cleared to build:** No — awaiting Kare §8 design section and sign-off.
