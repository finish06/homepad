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

*This section is owned by Kare. It is **required** before this spec is final and before Stitch builds.*

Kare's design section must address:

1. **Edit affordance placement and visual treatment** — where on the tile does the pencil appear in
   edit mode? (corner overlay? action bar? other treatment?) How does it coexist spatially with the
   ★ button? What edit-mode visual treatment does the tile itself receive (border, dim, badge)?
2. **Modal layout and hierarchy** — header, field order, icon compound section, action button bar.
   What is the visual weight and reading order?
3. **Icon compound section layout** — preview size and placement, upload button(s), URL field,
   remove and fetch-favicon controls. How does a live upload-in-progress state look within the modal
   (not just a toast — local feedback)?
4. **Dirty state / discard confirmation pattern** — native `window.confirm()` or an inline state
   transition inside the modal?
5. **Fetch favicon button** (if included) — shape, label, loading indicator, inline success/failure
   treatment.
6. **Touch and contrast compliance** — confirm all interactive elements ≥ 44px and all text/graphics
   meet DESIGN-SYSTEM §1.1 floors (≥ 4.5:1 body, ≥ 3:1 graphic).
7. **Component mapping** — which design system (`Code/design-system`) components map to the modal
   chrome, form fields, icon section, and action bar?

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

## Sign-offs

| Seat | Sign-off | Date |
|---|---|---|
| Walt (product) | ✅ APPROVED — 2026-07-05 | |
| Kare (design) | ⬜ Awaiting §8 design section | |

**Cleared to build:** No — awaiting Kare §8 design section and sign-off.
