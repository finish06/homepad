# SPEC — App Grid

**Spec ID:** SPEC-app-grid
**Version:** 0.1.0 (draft — pending Kare design section)
**Date:** 2026-07-01
**Authors:** Walt (product lead) · Kare (design lead — co-owned, UI-bearing spec)
**Status:** Draft — dispatched to Kare for design section; spec locked for Stitch after co-sign
**Repo:** `Code/homepad`
**Intake:** `docs/app-grid/SPEC-INTAKE.md` (Caleb, 2026-07-01)
**Mockups:** `docs/app-grid/mockup-1.png`, `docs/app-grid/mockup-2.png`

---

## 1. Summary

App Grid is a new primary layout for the homepad dashboard. The page is a **6-column grid of boxes**. Each box holds one or more app links (tools). A box's **width** (1–6) simultaneously controls (a) how many page columns the box spans and (b) how many links appear side-by-side per row inside the box. Boxes wrap naturally to the next row when they don't fit. The layout is live-adjustable by admins via per-box width buttons.

This spec supersedes the v14 floating-panel layout system.

---

## 2. Product decision: App Grid REPLACES the v14 floating-panel layout

**Decision: App Grid replaces (not augments) the v14 floating-panel layout.**

Rationale:
- The intake describes *the* homepad layout, not an alternative mode. A "mode switcher" would introduce scope (toggle UI, mode persistence, dual rendering paths) Caleb did not ask for.
- v14's floating-panel system is in-flight and not yet prod-shipped, so replacing it before release is clean — no migration of a live user setting.
- App Grid is a direct conceptual evolution of the panel model: boxes = panels, but with explicit user/admin-controlled width instead of auto-sizing by app count. It serves the same user need more directly.
- Maintaining two concurrent layout systems adds product surface without proportional value.

**What this means for implementation:**
- The `Catalog.tsx` panel-based layout and the `layoutRow / layoutColOrder / layoutWidthPct` category fields become vestigial once App Grid ships. Those fields and the `saveCategoryLayout` endpoint are superseded. Stitch should archive (not delete) the old layout fields and their associated specs; the DB migration should preserve the columns with a `deprecated_` prefix so rollback is safe.
- The `spec/v14-floating-panel-layout` branch is superseded by this spec.

---

## 3. Data model reconciliation

### 3A. Box → Category

A **box** in App Grid maps directly to a `Category` in the existing shared catalog:

| App Grid concept | Existing data layer         | Notes                                         |
|------------------|-----------------------------|-----------------------------------------------|
| `box.title`      | `category.name`             | Admin-editable, unchanged                     |
| `box.tools[]`    | `services[]` per user, filtered by `categoryId` | Per-user, sourced from `GET /api/services`; the App Grid reads tools from the existing services call — no new endpoint |
| `box.width`      | NEW `category.grid_width`   | Integer 1–6, admin-set, shared, default 3     |
| box order        | `category.sortIndex`        | Admin-set via existing `PUT /api/categories/order` |
| "+ Add box"      | `POST /api/categories`      | Admin-only; creates category with gridWidth=3 |

The data for "tools inside a box" is the authenticated user's own services (`GET /api/services`) grouped by `categoryId`. The App Grid reads from the same endpoints as the current Catalog — it is a new rendering layer over the same data, not a new data model.

### 3B. New backend field: `category.grid_width`

Add `grid_width INTEGER NOT NULL DEFAULT 3` to the `categories` table.
- Range: 1–6. Invalid values are rejected by the API (400).
- API surface: `PATCH /api/categories/:id` — add `gridWidth` as an optional field. Existing endpoint, new accepted field.
- Admin-only to write. Any authenticated user may read (it rides with the existing `GET /api/categories` response).
- The existing `layoutRow / layoutColOrder / layoutWidthPct` fields remain in the DB (deprecated, not deleted) and are excluded from the App Grid rendering path.

### 3C. Multi-tenant compatibility

App Grid is fully compatible with the existing multi-tenant model:
- Category (box) definitions and widths are **admin-managed and shared** across all users — exactly like today's category names and sort order.
- The tools (links) inside each box are **per-user** — each user sees their own services for that category.
- There are no per-user width preferences in v1. Box width is an admin property of the shared catalog.

---

## 4. Out-of-scope analysis and recommendations

The intake marks these as out of scope (v1). Walt's assessment follows each.

### 4A. Width persistence — ⚠️ RECOMMEND REVERSING

**Caleb's call:** Persistence / saving layout is out of scope.
**Walt's assessment: HOLD FLAG — non-persistence on the width selector is actively confusing UX and should be reconsidered before implementation starts.**

A width selector that doesn't save is worse than no selector: the user changes the width, the layout responds, then on next page load it silently resets. This is a confusion vector, not a feature. A launcher where your layout disappears on reload would feel broken.

Persistence of box width is minimal scope: one new DB column (`grid_width`) and one new accepted field on `PATCH /api/categories/:id`. This is 1–2 story points alongside the layout engine itself. The cost of removing it later (users built muscle memory around a non-persisting control) is higher than the cost of adding it now.

**Recommendation to Caleb (via Joe):** Persist `grid_width` as an admin-set property in v1. If Caleb explicitly re-confirms non-persistence, the width selector must carry a visible "(preview only — changes won't be saved)" label in the UI so users aren't misled.

This item is flagged for Caleb/Joe to confirm before Stitch begins backend work. The frontend layout engine can be built without it; the backend field should be resolved first.

### 4B. Add/remove/reorder links in the UI — Confirmed out of scope

**Walt's assessment: Correct call for v1.** Tools inside boxes come from the existing per-user service management (Library + user dashboard). The App Grid renders what exists; it doesn't provide a new CRUD surface for links in v1. The existing admin catalog and Library flows cover service management.

### 4C. Per-user configs / auth / access control — Confirmed out of scope for v1

**Walt's assessment: Correct call.** Box width is admin-set and shared (see §3B). Per-user width preferences (User A sees width 4, User B sees width 2 for the same box) are a separate, later feature. Auth is unchanged; existing session-cookie model applies.

---

## 5. Acceptance criteria

ACs are written from the user's perspective and are testable against the live staging app. All ACs assume a viewport > 640px unless noted.

### Layout engine

**AC-001** — Two width-3 boxes appear side by side on the same row (3+3 = 6 columns, no wrap).

**AC-002** — A width-6 box occupies a full row; no other box appears to its right on the same row, regardless of what follows it.

**AC-003** — A width-4 box followed by a width-2 box fills one row (4+2=6); the next box (any width) wraps to the next row below.

**AC-004** — A box with more tools than its width wraps the extra tools to a second row inside the box: a width-3 box with 4 tools shows 3 tools on row 1, 1 tool on row 2.

**AC-005** — A width-1 box with 3 tools stacks all 3 tools vertically (each tool on its own row; 1 column inside).

**AC-006** — A width-2 box with 2 tools shows both tools on a single row inside the box (side by side).

**AC-007** — A width-6 box with 6 tools shows all 6 tools on a single row (none wrap).

**AC-008** — A width-6 box with 7 tools shows 6 tools on row 1 and 1 tool on row 2.

### Box content

**AC-009** — Each box displays its category title (box.title = category.name) visibly above the tools grid.

**AC-010** — Each tool inside a box displays at minimum its name. If a tool has an icon, the icon appears alongside the name.

**AC-011** — Clicking a tool link navigates to the tool's URL. (Target: new tab; confirmed with Kare in design section §6.)

**AC-012** — A box with no tools (empty category) renders the box title and an empty interior — no crash, no hidden box, no missing row in the layout.

### Width selector (admin only)

**AC-013** — Each box shows a width selector with exactly 6 buttons labeled 1, 2, 3, 4, 5, 6. The button matching the box's current width is visually distinguished (highlighted/selected state).

**AC-014** — The width selector is interactive (buttons are clickable) only when the authenticated user has the `admin` role. Non-admins see no width selector.

**AC-015** — Clicking a width button immediately re-renders the box at the new column span and re-renders the links grid at the new links-per-row density — no page reload required.

**AC-016** — After an admin clicks width 6 on any box: the box spans all 6 columns; up to 6 tools appear per row inside the box.

**AC-017** — After an admin clicks width 1 on any box: the box spans 1 column; each tool appears on its own row (stacked).

**AC-018** — After an admin changes a box width and reloads the page, the box renders at the new width (persistence confirmed per Caleb's resolution of §4A; if Caleb overrides, this AC is replaced by AC-018-alt: a "(preview only — not saved)" label appears adjacent to the width selector).

### + Add box (admin only)

**AC-019** — An "+ Add box" affordance appears at the end of the grid (after all existing boxes). It is visible only to admins; non-admins see no affordance.

**AC-020** — Activating "+ Add box" prompts the admin for a title. Confirming creates a new box with that title, default width 3, and empty tools — immediately visible at the end of the grid.

**AC-021** — Cancelling the "+ Add box" prompt creates no box and leaves the grid unchanged.

### Responsive

**AC-022** — At viewport width ≤ 640px, the page renders a 2-column grid. All box widths and links-per-row cap at 2: a box configured at width 5 renders as width 2 on mobile; a box with 5 tools shows 2 tools per row on mobile (wrapping continues inside the box).

**AC-023** — At viewport width > 640px, the full 6-column grid is active. No box is artificially capped.

### Populated from existing data

**AC-024** — The App Grid page populates box titles from `GET /api/categories` and tools from `GET /api/services` (filtered by `categoryId`). No hardcoded fixture data in production.

**AC-025** — A user with 0 services in a category sees that box with an empty interior (AC-012 behavior); a user with services in a category sees their own tools inside that box, independent of what another user sees in the same box.

---

## 6. Design section — [PLACEHOLDER: Kare's section]

**Status: Pending. This spec is NOT ready for Stitch to build until Kare's design section is present and both Walt and Kare have co-signed.**

Design items Kare owns (non-exhaustive — Kare's section is authoritative):
- Box visual treatment: border, border-radius, shadow/glass tokens, padding, background (dark + light modes). Reference: `docs/homepad-floating-panel-layout.md` (existing glass token definitions).
- Width selector visual: button shape, selected-state highlight, disabled/read-only appearance for non-admins (if hidden vs. grayed).
- Tool link visual: icon size, name typography, touch target (min 44px), hover/active state. Icons are emoji (inline text) or admin-uploaded PNG (existing `/api/services/:id/icon/:variant`).
- "+ Add box" affordance treatment: dashed outline vs. button, placement relative to boxes.
- Responsive breakpoints: exact px threshold (Caleb's intake says ~640px; Kare to confirm against design system).
- External link behavior: new tab vs. same tab (requires `rel="noopener noreferrer"` if new tab).
- Empty box state: placeholder copy or minimal treatment.
- Dark mode parity (all states above in both themes).

---

## 7. Out of scope (v1)

These items are explicitly excluded from this spec. They may be revisited in future specs.

- **Per-user width preferences** — box width is admin-set and shared; a user cannot have a different width from another user for the same box.
- **Add/remove/reorder tools in the UI** — tools come from the existing per-user service management surfaces (Library, admin catalog). App Grid renders what exists.
- **Per-user box order preferences** — box order follows `category.sortIndex` (admin-set); user-level reorder is not in v1.
- **Drag-to-resize boxes** — width is set via the 1–6 button selector, not drag.
- **Inline tool editing** — clicking a tool navigates to its URL; no in-place edit affordance.
- **Box deletion UI** — admin-managed via existing category management (not in the App Grid surface in v1).
- **Library integration** — the existing Library browse surface manages service availability; App Grid renders what's already on the user's dashboard.

---

## 8. Implementation notes

These are references for Stitch. Walt and Kare own what; Stitch owns how.

- **CSS Grid approach (Caleb's hint):** One `--w` CSS variable per box, set from `category.grid_width`. Page grid: `repeat(6, 1fr)`. Box span: `grid-column: span var(--w)`. Links inside: `grid-template-columns: repeat(var(--w), 1fr)`. Responsive cap: at ≤640px, override `--w: min(var(--w), 2)` globally.
- **Data sources:** `GET /api/categories` (box list + widths) + `GET /api/services` (tools, grouped by `categoryId`). No new API endpoints for the read path.
- **New backend field:** `PATCH /api/categories/:id` with `gridWidth: integer` — pending Caleb's confirmation on §4A.
- **Replace (don't augment):** The `Catalog.tsx` panel layout is the code being replaced. App Grid is a new component; the old layout path is retired. Stitch: do not try to coexist both systems in one render tree.
- **TDD:** Build tests against these ACs first. Each AC has a clear observable outcome. Unit-test the layout math (AC-001–008, AC-022); browser-test the width selector interactions (AC-015–017) and link navigation (AC-011).
- **Do not self-merge.** This spec rides CI + browser-gate + Gracie QA (staging) + Walt PAT (prod). The PR gates are the release pipeline.

---

## 9. Co-sign gate

This spec is approved for implementation only when both signatures are present:

- [ ] **Walt (product):** product go — spec reflects Caleb's intent, ACs are testable, decisions are sound
- [ ] **Kare (design):** design go — design section (§6) is complete, tokens + states + responsive + a11y are specified

_Walt pre-sign: ACs and product decisions are solid pending Caleb's confirmation on §4A (width persistence) and Kare's design section._
