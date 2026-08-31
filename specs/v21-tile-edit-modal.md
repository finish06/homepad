# homepad v21 — Tile Edit Modal

**Spec ID:** v21-tile-edit-modal
**Created:** 2026-07-05
**Author:** Walt (product lead)
**Status:** Draft — awaiting Kare §8 design section
**Repos:** `Code/homepad` (UI) + `Code/homepad-api` (admin gate, optional fetch-icon endpoint)
**Estimate:** ~4–6 hours Stitch
**Target version:** v13.10.0 (feature = minor; v13.9.0 shipped with v20)
**Closes issues:** n/a — new feature; file Gitea issues for any discovered gaps during build
**Prerequisite:** SPEC-245-224 backend admin gates on service write endpoints (specced 2026-07-02, backend not yet shipped — must land first or in same PR as v21)

---

## 1. Problem

Caleb cannot change a tile's icon, title, or URL directly from the dashboard. The only path today:

1. Gear → "Edit dashboard" → admin edit mode.
2. AppGrid exposes **box-level** controls (rename, reorder, delete boxes) — no per-tile edit action.
3. To change a tile, an admin must navigate through the admin panel (`Catalog.tsx` admin edit mode →
   tile's `IconControls` → "Edit app" button → `ServiceForm`).

This is unacceptable friction for a task as simple as "fix this tile's icon." It also means tiles
whose `icon` field was never set (SQL-inserted with `icon = ''`, no uploaded PNG) can only be fixed
by navigating the admin panel — and many homelab tiles have never had their icon set. They show an
initials badge (#85 fixed the gray-square crash, but an initials badge is not a real icon).

**Caleb's direct statement:** "Today, I cannot change icons on the dashboard or change the title
etc. for my personal dashboard. There needs to be a way to edit a specific tile. I think in edit
mode, there is an 'edit tile' [affordance] which opens a modal — along those lines."

---

## 2. Product Decision — Shared Catalog vs. Per-User Override

**This spec resolves the question explicitly. The decision must be in the spec, not assumed.**

Two models were considered:

**(A) Admin edits the shared catalog.** Editing a tile's title/icon/URL changes the shared catalog
entry. All users see the change immediately. Admin-only write.

**(B) Per-user override layer.** Each user can rename/re-icon their own view without touching the
shared catalog. Changes are private to that user. Requires a new `service_overrides` table, new API
endpoints, and a merge/precedence layer in the UI (shared catalog → personal override → rendered
tile).

**Decision: Option A — admin edits the shared catalog.**

Rationale:

1. **Caleb IS the admin.** For his homelab, the shared catalog IS his catalog. He is the only
   admin; there are no competing admin edits. Editing the shared catalog entry is functionally
   identical to editing "his" tile.
2. **The shared-catalog model is already established.** Caleb's 2026-07-02 directive (SPEC-245-224)
   makes the catalog admin-managed. This spec aligns with that policy.
3. **Scope.** Option B requires a new DB table (`service_overrides`), a new read path (override →
   shared → fallback), new API endpoints, and a new UI concept. That is a separate future spec. V21
   is about reducing friction for a single admin making cosmetic tile edits.
4. **Experience equivalence.** Since Caleb is the only admin, editing the shared catalog IS editing
   "his dashboard." Every change is immediately visible to all users — which is also what he wants.

**Consequence:** Only admin users see the edit affordance. Non-admins cannot edit tile properties.
All tile edits change the shared catalog (visible to all users).

**Future path:** If per-user personalization is later requested ("users can rename their own tiles"),
that is a separate v22+ spec with the `service_overrides` table. Out of scope here.

---

## 3. Goal

An admin in edit mode can tap a single, clearly visible affordance on any tile and immediately edit
that tile's core properties — title, URL, description, icon, category — without leaving the
dashboard. The change saves and reflects in the grid without a full page reload.

---

## 4. Scope

**In scope:**
- New per-tile edit affordance (pencil button) on `ToolLink` in `AppGrid.tsx` — admin + edit mode
  only.
- New `TileEditModal` component: fields for title, URL, description, category, icon.
- Backend prerequisite: admin gate on `PATCH /api/services/{id}` and icon upload/delete endpoints
  (per SPEC-245-224, currently not shipped in homepad-api).
- Optional / stretch: `POST /api/services/{id}/fetch-icon` backend endpoint.

**Out of scope:**
- Creating new services ("Add custom app" / library flows — already exist).
- Deleting services (destructive; kept in the admin panel, not in a routine-edit modal).
- Editing `gatus_key` (monitoring integration key — too technical; belongs in the admin ServiceForm).
- Per-user override layer (see §2).
- Auto-favicon fetch on service creation (separate future spec or bug fix; not tied to the modal UX).

---

## 5. The Edit Affordance (AppGrid)

### 5.1 Placement and visibility

`AppGrid.tsx` renders each tile as a `ToolLink` component. Today each tile shows:
- Tile icon + name + status pip
- ★ favorite button (always visible, v20)

**V21 addition:** When `editMode === true && isAdmin`, each `ToolLink` additionally renders a
**pencil edit button**. Tapping it opens the `TileEditModal` for that service. The button is
completely absent when `editMode === false` or for non-admin users — no hidden element, no
zero-opacity state. Consistent with how box-level controls are gated.

### 5.2 Touch and a11y requirements for the affordance

- Hit target: **≥ 44×44px** (DESIGN-SYSTEM §9.3 — iPad-range floor).
- Visual glyph may be smaller. Use transparent `::before` pseudo-element hit-area expansion (the
  same pattern as v20 ★ fix) — zero layout shift.
- `aria-label="Edit [tile name]"` — descriptive; screen reader announces target clearly.
- Standard `<button>` element — keyboard-focusable, activatable via Enter/Space.
- In edit mode, the button is in the natural tab order within the tile's group.

### 5.3 Exact placement, visual design

→ **Delegated to Kare (§8).** Product constraints she must satisfy:
- Clearly associated with its specific tile (no ambiguity about which tile the edit targets).
- Does not obscure the tile icon or primary label at rest.
- Does not conflict with the ★ button's ≥44px hit target.
- Visually distinct from ★ in edit mode (different shape, different affordance).
- The tile's overall edit-mode visual treatment (border, badge, dim, overlay) is Kare's call.

---

## 6. The Edit Tile Modal

### 6.1 Fields

| Field | DB column | Input type | Required |
|---|---|---|---|
| **Title** | `services.name` | `<input type="text">` | Yes |
| **URL** | `services.url` | `<input type="url">` | Yes |
| **Description** | `services.description` | `<textarea>` | No |
| **Category** | `services.category_id` | `<select>` | No (null = Uncategorized) |
| **Icon** | `services.icon` + `service_icons` | Compound — see §6.2 | No |

Category dropdown: all current shared-catalog categories ordered by `sort_index`, plus
"Uncategorized" (sets `category_id` to null). Same ordering as AppGrid.

All fields prefill from the service's current values when the modal opens.

### 6.2 Icon handling (compound section)

The modal's icon section reflects the `iconSrc()` priority chain (`src/icons.ts`):

1. Uploaded PNG (light variant) → `service_icons` table → `GET /api/services/{id}/icon/light`
2. Uploaded PNG (dark variant) → `service_icons` table → `GET /api/services/{id}/icon/dark`
3. Icon URL text field → `services.icon` (plain URL string)
4. Initials badge — automatic fallback, no action needed

**Icon preview:** A rendered preview (≥ 48×48px) using the same `iconSrc()` chain. Updates live as
the admin changes inputs (preview reflects the new state before saving).

**Upload light variant:** File input (`accept="image/png"`). On file selection, immediately uploads
via `PUT /api/services/{id}/icon/light` — does NOT wait for Save. Preview updates on success. Error
toast on upload failure; field resets, user can retry.

**Upload dark variant:** Same, via `PUT /api/services/{id}/icon/dark`. Optional — many tiles only
need a light icon.

**Icon URL field:** Text input. Edits `services.icon` (the lower-priority fallback). Submitted as
part of the main PATCH on Save. If an uploaded PNG exists, this URL is the fallback; if no PNG,
this is the primary icon source.

**Remove icon (with confirmation):** Clears uploaded PNG(s) via DELETE on
`/api/services/{id}/icon/light` and `/dark` if they exist, AND clears the icon URL field. After
removal the tile falls back to initials badge. Requires explicit confirmation before executing (Kare
decides the confirmation pattern in §8 — inline state or native confirm).

**Fetch favicon (optional / stretch goal):** A "Fetch from URL" button that calls
`POST /api/services/{id}/fetch-icon`. Backend fetches the favicon from the service's registered
`url`, stores it in `service_icons` as the light variant. On success, preview updates. On failure
(unreachable, no favicon found), error toast; existing icon unchanged. Kare designs the button and
its loading/success/failure states in §8.

*If the backend fetch-icon endpoint is too complex to implement cleanly in v21, omit it. The icon
URL field plus PNG upload are sufficient for v21. Mark the feature as deferred in a follow-up.*

### 6.3 Modal actions

| Action | Behavior |
|---|---|
| **Save** (primary) | `PATCH /api/services/{id}` with all changed fields. On success: modal closes, tile updates inline, "Tile updated." toast appears. On error (network, 403, validation): error toast; modal stays open; no data lost. |
| **Cancel** | Close without saving. If form is dirty (any field changed from its prefill value), confirm discard before closing. |
| **Close (×)** | Identical to Cancel. |
| **Backdrop click** | Identical to Cancel. |
| **Esc key** | Identical to Cancel. |

Icon PNG uploads fire immediately on file selection (not on Save). "Remove icon" fires immediately
on confirmation (not deferred to Save). The Save PATCH only covers text fields + icon URL.

### 6.4 Accessibility (non-negotiable)

All of these are required for the modal to pass the v21 PAT:

- `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to the modal's visible heading.
- **Focus trap:** Tab / Shift+Tab cycles within the modal only. Focus cannot escape to the document
  behind the modal.
- **Focus on open:** Moves immediately to the first editable field (or the close button if first).
  Follows [WAI-ARIA dialog modal pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).
- **Focus on close:** Returns to the pencil button that opened the modal (regardless of how the
  modal was closed).
- All inputs have explicit `<label for="...">` associations (not implicit wrapping alone — required
  for all screen readers on iOS).
- Save button is `type="submit"` on a `<form>` element.
- All interactive elements within the modal: ≥ 44×44px touch targets.
- File inputs that are CSS-hidden for styling: the visible trigger button forwards keyboard events
  (`Enter`/`Space`) to the hidden input so keyboard users can activate them.
- Contrast: all text ≥ 4.5:1 (body) or ≥ 3:1 (UI graphics) per DESIGN-SYSTEM §1.1.

---

## 7. API and Schema

### 7.1 No schema changes

The `services` table already has all needed fields: `name`, `url`, `description`, `icon`,
`category_id`. The `service_icons` table (uploaded PNGs) already exists. **No migrations needed.**

### 7.2 Existing endpoints used by the modal (no changes to signature)

| Endpoint | Action | Notes |
|---|---|---|
| `PATCH /api/services/{id}` | Save text fields + icon URL | Must have admin gate — see §7.3 |
| `PUT /api/services/{id}/icon/light` | Upload light PNG | Exists; fires immediately on file select |
| `PUT /api/services/{id}/icon/dark` | Upload dark PNG | Exists |
| `DELETE /api/services/{id}/icon/light` | Remove uploaded light icon | Confirm endpoint exists; implement if missing |
| `DELETE /api/services/{id}/icon/dark` | Remove uploaded dark icon | Same |

### 7.3 Backend admin gate — prerequisite (SPEC-245-224)

`PATCH /api/services/{id}` and the icon upload/delete endpoints currently have **no `requireAdmin`
gate** (see comments in `homepad-api/internal/api/services.go`: "no admin gate, owner-scoped").
SPEC-245-224 (2026-07-02) specified these must be admin-only (403 if `role != 'admin'`) — but the
backend implementation was never shipped.

**V21 requires this gate to be present before shipping.** Both the UI gate (pencil is admin-only)
and the backend gate must hold. If SPEC-245-224 backend changes have not landed by the time Stitch
builds v21, include them in the v21 backend PR (or as a prerequisite-only PR that lands first).

Endpoints requiring `requireAdmin` (per SPEC-245-224 §2):
- `POST /api/services`
- `PATCH /api/services/{id}`
- `DELETE /api/services/{id}`
- `PUT /api/services/{id}/icon/{variant}` (icon uploads)
- `DELETE /api/services/{id}/icon/{variant}` (if implementing remove icon)

### 7.4 New endpoint — fetch-icon (optional / stretch goal)

`POST /api/services/{id}/fetch-icon`

- **Auth:** `requireAdmin`
- **Request body:** empty (uses `services.url` for the fetch target)
- **Behavior:**
  1. Load the service record; get its `url`.
  2. HTTP GET the URL with a 5-second timeout.
  3. Parse response HTML: look for `<link rel="icon" href="...">` or `<link rel="shortcut icon" href="...">` (first match).
  4. If not found in HTML, fall back to `{origin}/favicon.ico`.
  5. Fetch the resolved icon URL; download the bytes.
  6. Store in `service_icons` as `variant=light` (upsert).
  7. Return `200 { "iconUrl": "/api/services/{id}/icon/light" }`.
  8. On any failure (timeout, DNS error, 404, non-image content-type): return `422 { "error": "Could not fetch favicon: <reason>" }`. Leave existing icon unchanged.
- **Note:** Mark as optional. If favicon fetch adds unexpected complexity (redirects, auth-walled
  internal services, content-type negotiation), defer to a follow-up spec.

---

## 8. Design Section

**Owner:** Kare (design/UX). **Status:** DESIGN GO — 2026-07-05.

Every number below is **measured**, not eyeballed. The edit-mode tile geometry is read off the live
`AppGrid` tile (`src/index.css` `.app-grid-tool-*`, the same block v20 touched). The modal — which does
not exist yet — was built as a token-accurate mock (`v21-mock.html`), rendered in headless Chromium at
iPad portrait (768×1024, `dsf=2`), light **and** dark, and its computed contrast + `getBoundingClientRect`
touch boxes read off the live DOM (`v21-measure.js` → `v21-measure-{light,dark}.json`,
screenshots `v21-modal-{light,dark}.png`). This is a **spec-time co-sign**; the same measurements are
re-run on Stitch's built UI at PR review before the design gate closes on the shipped code.

### 8.1 Edit affordance — placement & tile treatment

**Placement: a third corner control at the tile's BOTTOM-RIGHT**, mirroring the v20 ★ (top-right) the
way the #242 status pip (top-left) already mirrors it. The tile's corner-affordance system today is:
top-left = system status pip (non-interactive, `pointer-events:none`), top-right = ★ favorite. The
bottom edge is free. The pencil takes **bottom-right**, pairing the two *interactive user controls* on
the right rail (★ top, ✎ bottom) and leaving the left edge to system status — a coherent, legible split.

- **Visual treatment:** identical construction to the ★ — a 34×34 painted glyph button at
  `bottom:4 right:4`, transparent background, **pencil glyph ✎ ≤20px**, resting `opacity ~0.85` (slightly
  more present than the ★'s 0.5, because in edit mode the pencil *is* the primary per-tile action; it
  lifts to `opacity 1` on hover/focus of the tile). Glyph color = the **accent** token (indigo), which is
  theme-aware: `#4f46e5` on the light tile (**measured 6.29:1**), `#818cf8` on the dark tile (**measured
  5.70:1**) — both clear the ≥3:1 graphic floor with margin, and the color reads as "edit/action," visually
  distinct from the amber-once-pinned ★.
- **Hit target = 44×44 via the v20 `::before` pattern, zero layout shift.** Keep the painted box 34×34
  and extend only an invisible, centered `::before{width:44px;height:44px}` (DESIGN-SYSTEM §9.3; the same
  visual≠hit-area technique v20 used for the ★, §8 of that spec). The glyph does not move; the hover/focus
  ring stays hugging the 34px glyph.
- **No collision with the ★ (proven geometrically, and measured).** The ★ hit area is centered at 21px
  from the tile top, spanning y ≈ −1…43px. The pencil hit area is centered 21px from the tile bottom;
  on the ≥120px-tall tile it spans y ≈ 77…121px. **Measured vertical gap between the two hit areas: 34px**
  — no overlap. (Because both are corner-anchored, the guarantee holds for any tile ≥86px tall; homepad
  tiles are ≥120, AC-007.) Horizontally the ★ and pencil share the right rail but never the same row, so
  neither steals the other's tap. `aria-label="Edit [tile name]"`, standard `<button>`, `touch-action:
  manipulation` (kills the 300 ms tap delay), in natural tab order after the ★.
- **Tile edit-mode treatment:** a **2px inset indigo (`--accent`) ring** (`outline:2px solid;
  outline-offset:-2px`) around each editable tile — enough to read "this tile is now editable / tap to
  edit" without a heavy fill, dim, or badge that would fight the icon/label. No dim, no scrim at rest
  (Walt's constraint: the pencil must not obscure the icon or primary label — a corner glyph + a thin ring
  satisfy that; a full-tile overlay would not). The ring uses the same accent as the pencil so the mode
  reads as one coherent state. It is **absent** entirely when `!editMode || !isAdmin` (element not in DOM,
  AC-001) — no zero-opacity ghost.

### 8.2 Modal — layout, hierarchy & reading order

A centered dialog card, `max-width 480px`, `max-height 90vh`, `radius-lg (16px)`, on a `scrim
rgba(0,0,0,.5)` backdrop. On phone (~390) it becomes a near-full-width sheet with 16px side gutters; the
**header and action bar are sticky** and only the field region scrolls, so Save/Cancel are always reachable
without scrolling past a long description. Enter 160 ms `ease-out` (scrim fade + card rise ~8px), exit
140 ms `ease-in`; **both suppressed under `prefers-reduced-motion`** (DESIGN-SYSTEM §1.6).

**Vertical order (top → bottom), which is also the visual-weight and reading order:**

1. **Header** — `h2` "Edit tile" (20/600 ink, **17.93:1 light / 15.61:1 dark**) + a secondary subtitle
   line naming the target tile and scope, e.g. *"Gitea · shared catalog"* (14/secondary, **4.74 / 6.75**)
   so there is zero ambiguity about which tile — and that edits are shared, not personal (§2). `aria-
   labelledby` points at the `h2`. A **✕ close** button sits top-right of the header (44×44 hit,
   **10.37 / 13.51**).
2. **Title** (text, required) — the identity field, first.
3. **URL** (url, required).
4. **Category** (`<select>`).
5. **Icon** — the compound panel (§8.3), set apart as a bordered sub-block so its internal complexity
   reads as one grouped unit rather than loose controls in the field stack.
6. **Description** (`<textarea>`, optional) — last: it is the only multi-line field and the least critical,
   so it anchors the bottom and never pushes the required Title/URL below the fold.
7. **Action bar** (sticky footer) — **Cancel** (secondary) + **Save** (primary), right-aligned weight, one
   clear primary per view (Principle 4). Save is the filled indigo CTA; Cancel is a quiet neutral fill.

Field rhythm is deliberately light→heavy: three simple single-line fields, then the visually heavier icon
panel, then the textarea. One primary action, one accent color, generous 16px inter-field gaps on the 8pt
grid.

> **Note to Walt (§6.4 refinement, in my remit):** focus-on-open should land on the **Title input**, not
> literally the first focusable node (which is the ✕). "First editable field" in §6.4 = Title. This keeps
> the opening focus on the field the admin most often edits and avoids dropping the caret into the middle
> of the icon panel. DOM/tab order stays visual order (✕ → Title → URL → Category → icon controls →
> Description → Cancel → Save); only the initial programmatic focus jumps to Title.

### 8.3 Icon compound section

A bordered panel (`radius-md 12px`, 1px `border-soft`) grouping everything icon-related:

- **Preview — 64×64** (exceeds the ≥48 floor), top-left of the panel, `radius-md`, on a neutral
  `preview-bg` (`#f5f5f5` light / `#2a2a2c` dark) with a **1px definition border** so a white/transparent
  PNG still reads a boundary (**measured 3.08:1 light / 3.63:1 dark**, ≥3:1 — the same "faint fill needs a
  ring" rule as the #242 status pip). It renders the live `iconSrc()` chain and **updates optimistically**
  as inputs change, before Save.
- **Controls stack** (right of the preview, each ≥44px tall): **Upload icon** (secondary fill — the common
  action, given the most weight), **Dark variant** (ghost — optional, deliberately quieter), **Fetch from
  URL** (ghost — §8.5).
- **Icon URL** field spans full width below the preview row, with helper text *"Used as a fallback when no
  PNG is uploaded."* (13px, `helper` token, **7.81 / 11.48**) — this states the `iconSrc()` precedence in
  plain language so the admin understands why a URL may be overridden by an upload.
- **Remove icon** — a destructive **text button** (danger token, **6.47 / 6.15**), bottom of the panel,
  low-emphasis until needed.
- **Upload-in-progress = local feedback, not just a toast.** On file-select the preview enters a **busy**
  state: the current icon dims under a `rgba(0,0,0,.35)` overlay with a centered spinner + "Uploading…",
  and the Upload button disables. On success the preview **cross-fades (120 ms)** to the new icon and a
  brief inline "Updated ✓" (success token) fades after ~1.5 s. On failure, inline error text under the
  panel in the danger token (**≥4.5:1 both themes**), the previous icon is restored, and the button
  re-enables to retry — the text fields are untouched and still savable (AC-009).

### 8.4 Dirty state / discard confirmation — **inline, not `window.confirm()`**

Use an **inline in-modal confirm**, never native `window.confirm()`. Native confirm is unstyleable (fails
the design-system type/contrast), yanks focus out of the trapped dialog (fighting §6.4's focus-trap), and
reads as a foreign OS artifact (Principle 8). Instead: a dismiss attempt (Cancel / ✕ / backdrop / Esc)
**while the form is dirty** transforms the sticky action bar *in place* into a confirm strip — message
**"Discard changes?"** with **Keep editing** (secondary, receives focus — the safe default) and **Discard**
(destructive, danger-outline). Esc while the strip is showing = "Keep editing." If the form is **not**
dirty, dismissal closes immediately with no prompt (AC-011). Dirtiness = any field differing from its
prefill; note that icon PNG upload / Remove fire immediately (§6.3) and are **not** part of dirty-tracking —
only the text fields + Icon URL are.

### 8.5 Fetch-favicon button (stretch)

- **Shape/label:** a **ghost button** in the icon controls stack, label **"Fetch from URL"** with a small
  download glyph (⭳). ≥44px. **Disabled when the URL field is empty** (nothing to fetch from) — with an
  `aria-disabled` + helper reason, not a silent dead button.
- **Loading:** on tap the glyph becomes a spinner, label → "Fetching…", button disabled, and the **preview
  shows the same busy overlay** as an upload (shared state — one in-progress language for the whole panel),
  120–200 ms.
- **Success (inline):** preview cross-fades to the fetched icon + inline "Favicon added ✓" (success token)
  that fades after ~2 s. No global toast — fetch isn't the Save; feedback stays local to the panel.
- **Failure (inline):** button returns to rest; inline danger-token error under the panel — a short human
  line *"Couldn't fetch a favicon from this URL."* (the backend's 422 reason is logged, not dumped at the
  user). Existing icon unchanged (§7.4). Measured error contrast **6.47 / 6.15**, ≥4.5:1.

### 8.6 Touch & contrast compliance — **measured**

Rendered at iPad portrait (768), light + dark, off the live DOM.

**Touch targets — all 14 interactive elements ≥44×44, zero fails in either theme:**

| Element | How it reaches ≥44 |
|---|---|
| Tile pencil ✎, ★ | 34×34 painted glyph + transparent 44×44 `::before` (v20 pattern); **34px gap** between their hit areas |
| ✕ close | 44×44 button box |
| Upload / Dark / Fetch / Remove | `min-height:44` buttons |
| Title / URL / Icon URL / Category `<select>` | `min-height:44` inputs (fixes the DESIGN-SYSTEM §3.3 38px input miss) |
| Description `<textarea>` | `min-height:76` |
| Cancel / Save | `min-height:44` |

**Contrast — measured ratio (light / dark), against the stated floor:**

| Element | Token | Light | Dark | Floor |
|---|---|---|---|---|
| Heading | ink | **17.93** | **15.61** | 4.5 ✅ |
| Subtitle | secondary | **4.74** | **6.75** | 4.5 ✅ |
| Field label | label `#404040`/`#e5e5e5` | **10.37** | **13.51** | 4.5 ✅ |
| Input text | ink | **17.93** | **15.61** | 4.5 ✅ |
| Helper / URL-fallback note | helper `#525252`/`#d4d4d4` | **7.81** | **11.48** | 4.5 ✅ |
| Save label | white on indigo-600 | **6.29** | **6.29** | 4.5 ✅ |
| Cancel label | ink on neutral fill | **16.44** | **13.14** | 4.5 ✅ |
| ✕ close | label | **10.37** | **13.51** | 4.5 ✅ |
| Ghost btn label (Dark/Fetch) | accent | **6.29** | **5.70** | 4.5 ✅ |
| Inline error | danger | **6.47** | **6.15** | 4.5 ✅ |
| Pencil glyph on tile | accent | **6.29** | **5.70** | 3 (graphic) ✅ |
| Input / control border | border `#8c8c8c`/`#808080` | **3.36** | **4.31** | 3 (graphic) ✅ |
| Icon-preview border | border | **3.08** | **3.63** | 3 (graphic) ✅ |

**Three dark-mode token decisions the measurement forced (fold into the design system):**

1. **Primary filled button stays indigo-600 `#4f46e5` + white in BOTH themes (6.29:1).** Do **not** lighten
   the fill to indigo-500 `#6366f1` in dark — that drops white-on-fill to **4.47:1, a fail**. (First mock
   pass caught this.)
2. **Accent (glyph / ghost-label / focus-ring / edit-ring) is theme-aware:** `#4f46e5` light, `#818cf8`
   dark. On the near-black dark surface, indigo-600 is only 4.47:1 — too low for a ghost *label*; indigo-400
   restores 5.70:1.
3. **Control-border token is theme-aware:** `#8c8c8c` light (3.36:1 on white), `#808080` dark (4.31:1 on
   `#1c1c1e`). Never `#a3a3a3` (2.52:1) — that is the same neutral-400 miss the design system already flags
   (§9.2). Helper/label use neutral-700/600, not the barely-passing 4.74 secondary, for headroom.

### 8.7 Component mapping (`Code/design-system`)

| Modal part | Design-system source |
|---|---|
| **Dialog chrome** (card, radius, elevation, backdrop) | `radius-lg 16px` (§1.4); a floating dialog needs elevation on the otherwise-flat homepad surface → `shadow-card`-class drop (§1.5) + a **new `scrim` token** `rgba(0,0,0,.5)`. **This modal establishes the dialog/overlay pattern the system did not have** (§3.4 "no modal/dialog overlay was reachable") — I fold it back into the doc as the canonical dialog component in the same breath (drift rule). |
| **Header heading** | Type scale H1/title role, 20/600 (§1.2), `ink` token (§1.1). |
| **Form fields** (Title/URL/Icon URL/Description/Category) | Inputs pattern (§3.3) — white/`surface`, 1px border, `radius-sm 8px`, label-above 14/600 — **upgraded to `min-height:44`** per the §9.3 touch rule (the §3.3 38px height was a logged miss). |
| **Icon preview** | Tile/card treatment (§3.1) at `radius-md`, plus the #242 "faint fill needs a ≥3:1 definition ring" rule. |
| **Buttons** | Primary solid indigo (§3.2) for **Save**; secondary neutral fill for **Cancel**/**Upload**; ghost/accent for **Dark variant**/**Fetch**; destructive text for **Remove**/**Discard** — all at ≥44 (fixing the §3.2 36px miss). |
| **✕ close / corner pencil** | Icon-button pattern (§3.4) + the v20 visual≠hit-area `::before` touch technique (§9.3). |
| **Toasts** ("Tile updated." / errors, §6.3) | Homepad's existing toast; the design system has **no toast spec yet** — logged as a fold-in for DS v1.1 (out of scope to define here, but flagged so it isn't silently invented). |

**Design system fold-ins produced by this spec** (I will land these in `Code/design-system` so the doc
never drifts from what ships): the **dialog/overlay component** (§3.4 gap closed), the **`scrim` token**,
the three **theme-aware token corrections** (button fill, accent, control border) in §8.6, and the
**toast** placeholder for v1.1.

**Artifacts:** `v21-mock.html`, `v21-measure.js`, `v21-measure-{light,dark}.json`,
`v21-modal-{light,dark}.png` (in `/home/kare/work`).

---

## 9. Product Acceptance Criteria

**AC-001 — Edit affordance is admin-only, edit-mode-only**
When an admin enables edit mode (gear → "Edit dashboard"), each AppGrid tile shows a pencil button
with ≥ 44×44px touch target and `aria-label="Edit [tile name]"`. Non-admin users in any state, and
admin users with edit mode off, see no pencil button (element is absent from DOM, not hidden).

**AC-002 — Modal opens on pencil activation**
Tapping or clicking the pencil opens the "Edit tile" modal. The modal has `role="dialog"`,
`aria-modal="true"`, and a visible heading. Focus moves immediately to the first editable field.

**AC-003 — Modal prefills from current shared catalog state**
All fields (title, URL, description, category, icon) reflect the tile's current values from the
shared catalog. The icon preview renders the same icon the tile itself renders (same `iconSrc()`
chain).

**AC-004 — Title edit persists and updates tile inline**
Admin changes the title and saves. The tile's name updates in the App Grid without a page reload.
All other users see the updated name on next page load.

**AC-005 — URL edit persists**
Admin changes the URL and saves. Tapping the tile opens the new URL.

**AC-006 — Description edit persists**
Admin changes the description and saves. Change persists in the DB and is returned by
`GET /api/services`.

**AC-007 — Category reassignment moves tile**
Admin selects a different category and saves. The tile moves to the new category box in the App
Grid (or to "Uncategorized" if cleared). The change is reflected for all users.

**AC-008 — Icon URL saves and renders**
Admin enters an icon URL in the "Icon URL" field and saves. The tile renders it as the icon
(`<img src="...">`). A broken or unreachable URL falls back to initials badge — no broken-image
state.

**AC-009 — PNG upload saves and renders without Save click**
Admin taps "Upload icon" and selects a PNG. The modal's icon preview updates immediately (the
upload fires on file selection, not on Save). On modal Save, the tile renders the uploaded PNG. An
upload failure shows an error within the modal and does not prevent saving text fields.

**AC-010 — Remove icon clears to initials badge**
After confirmation, "Remove icon" deletes uploaded PNG(s) and clears the icon URL field. The tile
reverts to the initials badge.

**AC-011 — Modal dismisses on Esc, backdrop click, Cancel**
All three dismiss the modal. If any field is dirty (changed from prefill), the user is asked to
confirm discard before the modal closes.

**AC-012 — Focus trap holds while modal is open**
While the modal is open, Tab / Shift+Tab cycles within the modal. Focus does not leave the modal.

**AC-013 — Focus returns to pencil button on close**
On close (by any means — Save, Cancel, Esc, backdrop), keyboard focus returns to the pencil button
that opened the modal.

**AC-014 — Success: modal closes, tile updates, toast appears**
On successful Save: modal closes, the tile's changed properties reflect immediately in the App Grid,
and a "Tile updated." toast appears.

**AC-015 — Error: modal stays open, no data lost**
If the PATCH request fails (network, 403, validation), an error toast appears. The modal stays open
with all entered values intact. The admin can correct and retry.

**AC-016 — Backend admin gate enforced (SPEC-245-224)**
`PATCH /api/services/{id}` returns 403 for non-admin callers. The backend gate must be present
alongside the UI gate (pencil is admin-only). A non-admin who bypasses the UI and calls the endpoint
directly receives a 403.

---

## 10. Built-UI Design Co-Sign (Kare)

**Verdict: APPROVE — design GO.** Reviewed the **built** UI on PR #320 (build `homepad:4655683-test`) live
in the headless Chromium sidecar, as **admin, in edit mode**, at **iPad portrait 768×1024, light + dark**.
Every value below is read off the live DOM (`getComputedStyle` / `getBoundingClientRect`, contrast computed
from resolved fg/bg), not eyeballed. The built UI matches §8 on every measurable rule; **one minor** focus
deviation (issue **#321**) is filed and does not gate the merge.

Artifacts: `_v21_modal_light.png`, `_v21_modal_dark.png`, `_v21_step1.png` (edit-mode tiles), `_v21_discard_light.png`.

### 10.1 Edit affordance (§8.1) — ✅

| Check | Spec | Measured (light / dark) |
|---|---|---|
| Painted glyph box | 34×34 | **34×34** |
| Hit area (`::before`) | 44×44 | **44×44** |
| Glyph size | ≤20px | **16px** |
| Resting opacity | ~0.85 | **0.85** |
| `aria-label` | "Edit <name>" | **"Edit ArchiveTeam Warrior1"** |
| Corner anchor | bottom-right 4/4; ★ top-right 4/4 | **pencil BR 4/4 · ★ TR 4/4** |
| Hit-area gap to ★ | ≥34px, no collision | **36px** (on a 122px tile) |
| `touch-action` | manipulation | **manipulation** |
| Glyph contrast (accent) | ≥3 graphic | **6.29 (#4f46e5) / 5.54 (#818cf8)** |

Pencil renders **only** when `editMode && isAdmin` (absent from DOM otherwise, AC-001 ✓).

### 10.2 Modal a11y & layout (§8.2) — ✅

`role="dialog"` ✓ · `aria-modal="true"` ✓ · `aria-labelledby` resolves to the `h2` ✓ ·
**focus-on-open lands on the Title field** (`tile-field-title`, §8.2 note ✓) · `max-width` **480px** ·
`max-height` **90vh (921.6px)** · `radius` **16px** · scrim **rgba(0,0,0,.5)**. Reading order Title → URL →
Category → icon panel → Description → Cancel/Save matches §8.2. Clean `Esc` closes and **returns focus to the
opening pencil** (`aria-label="Edit …"` ✓, AC-013) · **backdrop click closes** ✓.

### 10.3 Touch targets (§8.6) — ✅ all ≥44, zero fails (both themes)

✕ close **44×44** · Title/URL/Icon-URL inputs **44.5** · Category select **44** · Upload/Dark/Fetch **44** ·
Remove **44** · Description textarea **85** (min 76) · Cancel/Save **44**.

### 10.4 Icon compound panel (§8.3, §8.5) — ✅

Preview **64×64** on a definition border (**3.36 light / 4.31 dark**, ≥3 ✓) · Upload = secondary solid,
Dark variant + Fetch = ghost · optimistic preview updates live (title "…edited" → badge AW→AE observed) ·
**Fetch-from-URL disabled when URL empty** with `disabled` + `aria-disabled="true"` + `title="Enter a URL
first"` (§8.5 — reasoned, not a silent dead button ✓) · Remove = danger text (**6.57 / 6.15**).

### 10.5 Discard confirmation (§8.4) — ✅ inline, not native (one minor delta)

Dirty dismissal transforms the action bar **in place** into "Discard changes?" + **Keep editing**
(secondary) + **Discard** (danger-outline). `window.confirm` spy confirms native confirm is **never called**
(✓). `Esc`-on-strip = "Keep editing" (✓). **Minor (#321):** on strip appearance focus stays on the Title
input rather than moving to "Keep editing" (the `autoFocus` on the swap doesn't fire). Low impact — strip is
`role="alert"` (announced), Esc=keep works, and focus rests on the benign Title, not the destructive
Discard, so no accidental-discard risk. Fix dispatched to Stitch (imperative focus via ref + effect).

### 10.6 Contrast & the §8.6 dark-token corrections — ✅ VERIFIED LIVE

All text/graphic contrast clears its floor in **both** themes (measured light / dark): heading 17.93/15.61 ·
subtitle 6.19/8.11 · label 10.37/13.51 · input text 17.93/15.61 · helper 7.81/11.48 · Cancel 17.93/15.61 ·
✕ close 10.37/13.51 · Remove-danger 6.57/6.15.

The three dark-mode token decisions from §8.6 are **confirmed on the built UI**:

1. **Primary fill stays indigo-600 `#4f46e5` + white in BOTH themes → white-on-fill 6.29:1** (not lightened
   to indigo-500, which would fail at 4.47). ✓
2. **Accent (glyph / ghost label / edit ring) is theme-aware:** `#4f46e5` light, `#818cf8` dark → ghost label
   **6.29 light / 5.70 dark** (indigo-600 would be 4.47 in dark — the fail this correction prevents). ✓
3. **Control-border token theme-aware:** `#8c8c8c` light (**3.36**) / `#808080` dark (**4.31**), both ≥3. ✓

### 10.7 Design deltas

- **#321 (minor):** discard-strip focus stays on Title, not "Keep editing" (§8.4). Filed + fix dispatched to
  Stitch. Does **not** gate merge.
- Hit-area gap to ★ measured **36px** vs the §8.1 stated 34px — expected (gap scales with tile height; §8.1
  computed on a 120px tile, live tiles are 122px). Not a defect: ≥34, no collision.

**Design GO on the built UI. Ships from a design standpoint with #321 tracked as a known minor.**

---

## Sign-offs

| Seat | Sign-off | Date |
|---|---|---|
| Walt (product) | ✅ APPROVED — 2026-07-05 | |
| Kare (design) | ✅ DESIGN GO — §8 authored, measured @ iPad 768 light+dark; **built-UI co-sign §10 APPROVE (PR #320, one minor #321)** | 2026-07-05 |

**Cleared to build:** Yes — both sign-offs present (Walt product ✅ + Kare design ✅). Backend
prerequisite still binds: the SPEC-245-224 admin gate on `PATCH /api/services/{id}` and the icon
endpoints must land first or in the same PR (§7.3 / AC-016).
