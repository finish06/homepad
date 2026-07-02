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

> **⚠️ SUPERSEDED BY AMENDMENT A1 (`specs/SPEC-app-grid-fixed-tiles.md`, co-signed 2026-07-02).** The
> "6-column grid" / fluid `1fr` model described in this summary was corrected by A1 to a **fixed-width
> tile model** (each `.app-grid-tool` renders at the same 190px in every box; boxes are content-sized
> and flex-wrap). Width range is **1–8**, not 1–6. Read §6 + A1 for the authoritative layout model;
> this paragraph is retained only as the original framing.

App Grid is a new primary layout for the homepad dashboard. ~~The page is a **6-column grid of boxes**.~~ Each box holds one or more app links (tools). A box's **width** (~~1–6~~ **1–8 per A1**) controls how many fixed 190px tiles appear side-by-side per row inside the box (and, emergently, how wide the box packs). Boxes wrap naturally to the next row when they don't fit. The layout is live-adjustable by admins via per-box width buttons.

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
| `box.width`      | NEW `category.grid_width`   | Integer **1–8** (A1; DB `CHECK (grid_width BETWEEN 1 AND 8)`), admin-set, shared, default 3 |
| box order        | `category.sortIndex`        | Admin-set via existing `PUT /api/categories/order` |
| "+ Add box"      | `POST /api/categories`      | Admin-only; creates category with gridWidth=3 |

The data for "tools inside a box" is the authenticated user's own services (`GET /api/services`) grouped by `categoryId`. The App Grid reads from the same endpoints as the current Catalog — it is a new rendering layer over the same data, not a new data model.

### 3B. New backend field: `category.grid_width`

Add `grid_width INTEGER NOT NULL DEFAULT 3 CHECK (grid_width BETWEEN 1 AND 8)` to the `categories`
table (range raised 1–6 → **1–8** by Amendment A1, confirmed by Joe's product co-sign 2026-07-02).
- Range: **1–8**, enforced at the DB with `CHECK (grid_width BETWEEN 1 AND 8)`. Invalid values are
  also rejected by the API (400) before they reach the DB.
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

## 6. Design section (Kare — design lead)

**Status: Complete — revised for Amendment A1 (fixed-width tiles), 2026-07-02.** This section is
authoritative for App Grid's look and feel. Every token below is **grounded in the shipped system** —
`src/index.css` (the live `.category-panel`, `.tile`, `.tile-icon`, `.panel-tiles` component tokens,
index.css:53–140 and 1886–1963) and `docs/homepad-floating-panel-layout.md` (the glass recipe). App
Grid **inherits the floating-panel glass AND the fixed-190px tile module verbatim** so it reads as the
same product, one layout generation on — A1's fixed-tile model *is* the v14 panel model. No new
palette. Values were confirmed against the two mockups (`docs/app-grid/mockup-1.png`,
`mockup-2.png`) and measured against the existing CSS.

**Design-system rules this section enforces:** WCAG-AA contrast (≥4.5:1 body, ≥3:1 large/UI),
8pt spacing grid (4pt for tight type), ≥44×44px touch targets, one obvious hierarchy, every state
designed (empty/loading/error), motion with restraint + `prefers-reduced-motion`, real breakpoints,
consistency with the token set above.

### 6.0 Amendment A1 decisions (D-1 – D-4) — the quick answer

A1 replaces the fluid `1fr` model with **fixed-pixel tiles** (Caleb: every `.app-grid-tool` renders
at the same width in every box, regardless of `--w`). These are my four blocking decisions; the rest
of §6 details and grounds each. **The tile grammar changes with the model:** under the old `1fr`
columns a wide horizontal card made sense; at a fixed narrow 190px slot the correct, most-consistent
grammar is the **shipped vertical `.tile`** (icon plate over a full-width name) — the exact module
v14 `.panel-tiles` already renders at 190px. This is a deliberate evolution driven by A1, folded back
into the token set here so the doc and the shipped UI don't drift.

| # | Decision | Value / choice | One-line rationale |
|---|----------|----------------|--------------------|
| **D-1** | **Fixed tile width `TILE_PX`** | **190px** (`GAP = 16px`, `PADDING = 16px`) | The proven v14 slot (index.css:1905/1925). App Grid and the panel field share **one** tile module → zero drift; exact box-formula parity. |
| **D-2** | **Label overflow** | **Two-line clamp** (`-webkit-line-clamp:2`) + full-name `title` **and** `aria-label`; name block reserves 2 lines → **fixed tile `min-height:120px`** | Vertical tile gives the name the full 190px width across 2 lines, so `ArchiveTeam Warrior1` and its distinguishing suffix stay visible **without** a hover tooltip (iPad-first: hover never fires on touch). The 2-line reserve (38px name block) fixes tile height at **120px** for 1-line and 2-line names alike → **tiles never jump**. See 6.2.1. |
| **D-3** | **Box wider than viewport** | **(c) selector caps to a viewport-safe max** *(admin feedback)* **+ (a) structural wrap** via `max-width:100%` + `repeat(auto-fill, 190px)` *(hard backstop)* | `--w` is admin-set and **shared/persisted across viewports** (§3C), so a set-time cap alone can't protect a smaller screen; auto-fill wraps the fixed 190px tiles rather than ever page-scrolling. Fixed-N is the target; **no horizontal page scroll wins when they conflict.** See 6.7. |
| **D-4** | **Mobile (≤ 640px)** | Box `width:100%` + tools `repeat(2, minmax(0, 190px))` — **cap at 2 cols AND allow shrink-below-190** | Hybrid of AC-022's 2-col intent and v14's documented #212 shrink exception: two fixed 190px tiles (428px) overflow a 390px phone, so on phones **only**, tiles may drop below 190 to kill h-scroll. **Breakpoint = 640px** (not v14's 767 — auto-fill now handles iPad-portrait natively; see 6.7). AC-001-A1's fixed-width invariant holds **> 640px**. |

**Concrete values Stitch plugs into A1's CSS placeholders:** `TILE_PX = 190px`, `GAP = 16px` (the
page flex gap, the inner tools-grid gap, **and** the gap term in the box-width formula — one value,
matching v14), `PADDING = 16px` (box padding). Box width =
`calc(var(--w) * 190px + (var(--w) - 1) * 16px + 32px)` — **byte-identical to v14 `.category-panel`.**
Note I use `repeat(auto-fill, 190px)` (not A1's literal `repeat(var(--w), 190px)`) for the tools
track — see 6.7 for why it delivers D-3 for free while still yielding exactly `--w` columns whenever
the box fits.

### 6.1 Box (the container) — inherits the glass panel

The App Grid box **is** the floating-panel `.category-panel` glass, verbatim — same material so
the two systems don't drift. A box is a container, **not** a link (it has no hover-lift; only the
tools inside are interactive).

| Property | Light | Dark |
|---|---|---|
| Background | `rgba(255, 255, 255, 0.72)` + `backdrop-filter: blur(10px)` | `rgba(30, 30, 40, 0.68)` + `blur(10px)` |
| Border | `1px solid rgba(255, 255, 255, 0.6)` (frosted hairline) | `1px solid rgba(255, 255, 255, 0.08)` |
| Radius | **22px** (one step above the tool card's 16 — box reads as the container) | same |
| Shadow | `0 2px 8px rgba(0,0,0,.06), 0 8px 24px rgba(0,0,0,.04)` | `0 2px 8px rgba(0,0,0,.32), 0 8px 24px rgba(0,0,0,.24)` |
| Padding | **16px** (= `PADDING`) | same |
| Width | **`calc(var(--w) * 190px + (var(--w) - 1) * 16px + 32px); max-width: 100%; box-sizing: border-box`** — content-sized to exactly `--w` fixed tiles (A1); `max-width:100%` is the D-3 backstop | same |
| Min-height | **`clamp(120px, …)`** — box header + one tool-row so an empty box still reads as a container (see 6.6) | same |

- **Page container (A1):** the boxes pack with **`display:flex; flex-wrap:wrap; gap:16px`** —
  content-sized boxes wrapping left→right, **not** a `repeat(6,1fr)` page grid. The "6 columns" of the
  original intake is emergent (two width-3 boxes fill a ~1268px row), not a fixed track count. This is
  the v14 `.tile-field` model verbatim (index.css:1892).
- **Box gap (page):** **16px** row and column gap (8pt grid), matching the panel field's gap (= `GAP`).
- **Header** sits top-left inside the box: the title on the left, the width selector on the right
  (6.3). `display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;`
  so the selector **wraps to its own line under the title** on narrow (width 1–2) boxes instead of
  colliding with it — the overflow visible in `mockup-2.png` (Docs/Admin selectors bleeding past
  the box edge) is a defect this rule fixes.
- **Title** = `category.name` (AC-009): **16px / 700**, ink — `#0f172a` light / `#f5f5f5` dark
  (≥12:1 both). `white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0` so a long
  title truncates rather than shoving the selector. Contrast passes AA at this size and weight.

### 6.2 Tool tile (the primary interactive element) — the shipped `.tile`, fixed at 190px

**The tool tile IS the shipped homepad `.tile` (index.css:53–140), fixed to `TILE_PX = 190px`
wide** — a **vertical** card: icon plate on top, name below. This is the same module v14
`.panel-tiles` renders at 190px, so App Grid and the panel field share one tile — the strongest
possible grounding, zero drift. (This replaces the horizontal icon-left/name-right card from the
pre-A1 draft: under the old `1fr` model the box column was wide enough for a horizontal row; at a
fixed narrow 190px slot the vertical `.tile` reads better and matches what already ships.)

| Property | Value | Grounding |
|---|---|---|
| Element | `<a href target="_blank" rel="noreferrer noopener" aria-label={name} title={name}>` | matches every existing homepad tile/link (6.4) |
| Width | **190px** (= `TILE_PX`), **fixed** — never `1fr`, never stretches | v14 slot (index.css:1925); the A1 invariant (AC-001-A1) |
| Min-height | **`min-height: 120px`** (fixed floor — the exact D-2 value so tiles never jump; box-model math below) so a 1-line and a 2-line name yield **byte-identical** tile height | shipped tile is 104–134px tall |
| Padding | **15px 15px 13px** | shipped `.tile` verbatim |
| Radius | **18px** | shipped `.tile` verbatim (sits under the box's 22) |
| Surface (light) | `linear-gradient(180deg,#fff,#fbfcff)`, border `1px solid rgba(15,23,42,0.06)`, shipped 2-layer shadow | `.tile` verbatim |
| Surface (dark) | `linear-gradient(180deg,#12161e,#0e1117)`, border `1px solid rgba(255,255,255,0.06)`, dark shadow + inset top highlight | `.dark .tile` verbatim |
| Icon plate | **46×46**, radius **13px**, `linear-gradient(135deg,#f2f4fc,#e9edf9)` light / `#1b2130,#161b26` dark, inset `0 0 0 1px rgba(15,23,42,.05)` | `.tile-icon` verbatim |
| Emoji icon | inline text, **~24px**, centered in the plate | (AC-010) |
| PNG icon | `<img src="/api/services/:id/icon/:variant">`, variant follows theme (light/dark), `alt=""`; fallback = initial badge (existing `iconSrc`/`initialBadge`) | reuse existing icon path |
| Gap plate→name | **8px** (4pt grid) | tile internal rhythm |
| Name | **15px / 600**, **line-height 1.25** (= 18.75px/line), `#262626` (neutral-800) light / `#f5f5f5` (neutral-100) dark, full tile width | matches shipped tile name ink |
| Name block | **`min-height: 38px`** (exactly 2 lines reserved: 2 × 18.75 ≈ 37.5 → 38px) — reserved on **every** tile, 1-line or 2-line, so height never changes | the mechanism that makes D-2 non-jumping |
| Name overflow | **2-line clamp** (see 6.2.1) | — |

- **Touch target:** the whole `<a>` is **190 × ~120px** — vastly clears 44×44. ✓
- **Hover:** `transform: translateY(-3px)`, border → `rgba(99,102,241,0.45)`, the shipped lifted
  shadow; icon plate `scale(1.07)` — all the shipped `.tile:hover` verbatim. **Active:**
  `translateY(0)`. **Focus-visible:** `outline:none; ring 2px #6366f1` (the tiles' `focus-visible:ring-2
  ring-indigo-500`).
- **Reduced motion:** drop the `translateY`/`scale`; keep the border-color feedback — the shipped
  `.tile` reduced-motion rule (index.css:525) already does exactly this. Inherited, not re-invented.
- **Contrast:** name #262626 on the light tile ≈ **15.1:1**; #f5f5f5 on the dark tile ≈ **18.2:1** —
  both AA/AAA (the measured shipped-tile values, design-system §9.1).
- **Status dot:** the shipped tile carries a status dot; App Grid's ACs ask only for icon + name
  (AC-010), so the dot is **optional** — render it if the service is monitored, omit otherwise. Not
  new scope; it inherits `.status-dot` if shown.

#### 6.2.1 Name overflow → two-line clamp (D-2, confirmed)

At `TILE_PX = 190px` the name lane is the full tile width (~158px after padding) across **two
lines**. Real names that overflow one line — `ArchiveTeam Warrior1` (~16ch), `qBittorrent` (~11ch) —
wrap to line two and keep their **distinguishing suffix visible**. Strategy:

- **`display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;`** —
  wraps to two lines, then ellipsis on the (rare) >2-line name.
- Reserve the 2-line height on **every** tile (name block `min-height:38px` = 2 × 18.75px lines) so a
  1-line and a 2-line tile are the **same height** — the row stays a clean grid, no ragged edges.

**Concrete fixed tile height (D-2, so tiles never jump) — `min-height: 120px`.** Derived from the
shipped `.tile` box model, top to bottom:

| Band | px | Source |
|---|---|---|
| padding-top | 15 | `.tile` padding `15px 15px 13px` |
| icon plate | 46 | `.tile-icon` 46×46 (6.2) |
| gap plate → name | 8 | 4pt-grid tile rhythm (6.2) |
| name block (2 lines reserved) | 38 | 2 × (15px × line-height 1.25 = 18.75) ≈ 37.5 → 38 |
| padding-bottom | 13 | `.tile` padding |
| **total** | **120** | **`min-height: 120px`** |

Because the **name block always reserves both lines** (`min-height:38px`) regardless of how long the
name is, a 1-line tile (`qBittorrent`) and a 2-line tile (`ArchiveTeam Warrior1`) render at the
**identical 120px** — the row never jumps and never ragged-edges. `min-height` (not fixed `height`)
means a rare pathological 3rd line the clamp would ellipsis still can't force a jump, because the clamp
caps the name at 2 lines first. This is the exact height Stitch reserves.
- **`title={name}`** and **`aria-label={name}`** carry the full name for the pointer tooltip and the
  accessible name, so even a clamped >2-line name is never lost semantically.

**Why not single-line ellipsis (option a):** on a horizontal card the suffix of
`ArchiveTeam Warrior1` / `…Warrior2` truncates to an identical `ArchiveTeam Warri…`, and this is an
**iPad-first** homelab — the `title` hover tooltip **never fires on touch**, so two sibling tools
would be visually indistinguishable at a glance. Two lines keep the differentiator on-screen.
**Why not natural wrap (option c):** unequal tile heights within a row break the grid rhythm
(principle 4). Two-line clamp is the app-launcher norm (iOS home screen) for exactly this reason.

### 6.3 Width selector (admin only)

**Eight** buttons labeled 1–8 (A1 raised the range to 1–8, AC-013-A1); the button matching
`category.grid_width` is the selected state.

- **Segment (unselected):** visual **28×28**, radius **8px**, `1px solid rgba(15,23,42,0.12)` light /
  `rgba(255,255,255,0.14)` dark, text `#475069` light / `#aab2c5` dark, **13px / 600**. Hover:
  bg `#f4f5fb` light / `rgba(255,255,255,0.05)` dark.
- **Segment (selected):** bg **`#4f46e5`** (indigo-600 — the system accent, *not* the mockup's raw
  blue), text `#fff` / **700**, no border. **White on #4f46e5 ≈ 8.6:1** (AA ✓). Selection is carried
  by fill **and** weight, never color alone (colorblind-safe).
- **Touch target:** each button is a **≥44×44 hit area** — the 28px visual is centered inside a
  `min-width:44px; min-height:44px` button (the `.alert-bell` technique: real hit box ≥44, small
  glyph). Buttons `gap: 2px`. Focus-visible: indigo ring.
- **"width" label:** the lowercase `width` lead-in from the mockup — **12px / 600**, muted
  `#737373` light (4.74:1 ✓) / `#9aa3b8` dark. Never neutral-400 (fails AA — standing system rule).
- **Narrow-box overflow:** the selector group is `overflow-x: auto` with the scrollbar hidden
  (`scrollbar-width:none` + `::-webkit-scrollbar{display:none}`, the `.recently-opened-chips`
  pattern). On a width-1 box (6×44 hit > box inner width) the buttons **scroll inside the selector
  row** — they never overflow the box or trigger a horizontal **page** scroll. This is the only place
  App Grid permits internal horizontal scroll.
- **Viewport-overflow cap (D-3, admin feedback):** a `--w` whose box would exceed the current
  viewport width (`--w × 190 + (--w−1)×16 + 32 + gutters > 100vw`) is offered **disabled** — the
  button renders at 40% opacity, `cursor:not-allowed`, `aria-disabled`, with `title="Wider than this
  screen"`. The admin sees at set-time that, e.g., width 8 (1664px) won't fit a 1440px monitor, so
  they don't create an off-screen box on their own display. This is the **(c)** half of D-3; the
  **(a)** structural wrap (6.7) is the backstop for other viewers, since width is shared/persisted.
- **AC-014 — non-admins:** the selector is **not rendered at all** (removed from the DOM), *not* a
  grayed/read-only read-out. This matches every other admin-only affordance in homepad (the Gear
  edit menu, admin settings) and keeps a non-admin box clean. A disabled 8-button row would be
  visual noise for a control they can never use.
- **Interaction (AC-015):** clicking a button sets `--w` on the box; the box re-sizes and the inner
  tiles re-pack **instantly**. **Do not animate the reflow** — the box `width` / column-count change
  is not smoothly animatable and would jank (principle 6). The change snaps; that's correct.

### 6.4 External link behavior (confirmed)

Tools open in a **new tab**: `target="_blank"` **`rel="noreferrer noopener"`** — the exact string
used by every existing homepad link (`Catalog.tsx` tiles, `CommandLauncher`, `StatusBar`,
`AlertHistoryPanel`). This resolves AC-011 (new tab) and is consistent, security-correct
(no `window.opener` leak, no referrer), and needs no new pattern.

### 6.5 "+ Add box" affordance (admin only)

- **Treatment:** a **dashed-outline full-width bar** at the end of the grid — a full-row flex item
  (`flex: 0 0 100%; width: 100%`, since the page is now `flex-wrap`, not a grid — 6.1), reusing the
  `.dashboard-empty` dashed token: `1px dashed
  rgba(15,23,42,0.12)` light / `rgba(255,255,255,0.12)` dark, radius **16px**, min-height **64px**,
  faint indigo wash on hover (`rgba(99,102,241,0.03)` light / `.06` dark). Centered label
  **"+ Add box"**, **14px / 600**, muted `#475069` → ink on hover. Confirmed: dashed, matching both
  mockups. Admin-only — **not rendered** for non-admins (AC-019).
- **Interaction (title prompt):** activating it opens a **small title-prompt modal** reusing the
  shipped `.add-offer` dialog chrome (scrim + card, `.add-offer-panel` tokens) — **not** a native
  `window.prompt()` (unstyled, off-brand, no dark mode). One text field labeled **"Box title"**
  (autofocused), a primary **Create** button (`.library-add` indigo, `min-height:44px`) and a ghost
  **Cancel** (`.settings-ghost-btn`, `min-height:44px`). **Confirm** → `POST /api/categories` with
  `gridWidth:3`, box appears at the end of the grid (AC-020). **Cancel / Esc / scrim-click** → no
  box, grid unchanged (AC-021). Empty/whitespace title disables Create.

### 6.6 Empty box state (AC-012)

An empty category is a **designed state**, not an accident. The box renders:
- its **title** (and, for admins, the width selector) — full header, always;
- an **empty interior** with a single muted helper line, centered, **13px**, `#737373` light /
  `#9aa3b8` dark:
  - **admin:** "No apps yet — add from the Library."
  - **non-admin:** "No apps in this box."
- the box holds its **min-height** (≈ header + one tool-row) so it reads as an intentional, empty
  container — never a collapsed sliver, never a missing row, never a crash. The layout slot is
  preserved (AC-012, AC-025).

There is no loading state internal to a box: tools ride the existing `GET /api/services` fetch, whose
page-level loading affordance (the `.app-spinner`, AA-contrast) already covers first paint. If that
fetch **errors**, the page-level error surface owns it (unchanged) — a box does not invent its own.

### 6.7 Responsive — fixed tiles, `auto-fill` wrap, D-3 + D-4 (normative)

Grounded in `tailwind.config.ts` (stock breakpoints — `sm:640 md:768 lg:1024`) and v14's shipped
mobile behavior (index.css:1945–1963, the #212 prod hotfix).

**The tools track (all viewports > 640px):**

```css
.app-grid { display: flex; flex-wrap: wrap; gap: 16px; }          /* page: content-sized boxes wrap */
.app-grid-box {
  width: calc(var(--w) * 190px + (var(--w) - 1) * 16px + 32px);    /* exactly --w fixed tiles */
  max-width: 100%;                                                 /* D-3 backstop ↓ */
  box-sizing: border-box;
  padding: 16px;
}
.app-grid-tools {
  display: grid;
  grid-template-columns: repeat(auto-fill, 190px);                 /* fixed 190; NEVER 1fr */
  gap: 16px;
  justify-content: start;
}
```

- **Why `auto-fill` instead of A1's literal `repeat(var(--w), 190px)`:** when the box fits, its
  width is *exactly* `--w` fixed tiles, so `auto-fill` packs **exactly `--w`** 190px columns — Caleb's
  invariant holds, and a width-3 box with 2 tools still reserves the 3rd slot (box width encodes
  `--w`). It only diverges when the box is `max-width:100%`-clamped below its natural width (the D-3
  case), where it **wraps the fixed 190px tiles to fit** instead of overflowing. One declaration gives
  us AC-002-A1 (exact `--w` sizing), AC-004–008 (tool overflow wraps inside the box at 190px), **and**
  D-3 — with no JS. Tiles never resize on desktop/tablet (AC-001-A1).

**D-3 — box wider than the viewport (641px+):** two layers.
1. **(c) selector cap** (6.3) — the admin can't *pick* an overflowing `--w` on their own display.
2. **(a) structural wrap** — because `--w` is **shared and persisted** (§3C), a box set to width 8 on
   a 1920px monitor will be viewed by someone on a 1280px laptop. There, `max-width:100%` clamps the
   box to the content frame and `auto-fill` wraps its 190px tiles (6-up, then the rest on row 2) —
   **tiles stay 190px, zero horizontal page scroll.** (b) horizontal scroll is rejected outright; (d)
   plain page-width `auto-fill` is rejected because it would ignore `--w` — here `auto-fill` sits on a
   `--w`-*sized* box, so it honors `--w` and only wraps when physics demands it.
   **Precedence rule:** the fixed `N × 190` width is the *target*; the **no-horizontal-page-scroll**
   hard rule *wins* when they collide. AC-002-A1 is thus "exact width **when it fits the viewport**."

**D-4 — mobile (≤ 640px):** the one place fixed 190px must yield (two 190px tiles = 428px overflow a
390px phone → the exact #212 h-scroll bug).

```css
@media (max-width: 640px) {
  .app-grid-box   { width: 100%; max-width: 100%; }
  .app-grid-tools { grid-template-columns: repeat(2, minmax(0, 190px)); }   /* cap 2, allow shrink */
}
```

- **Cap at 2 columns** (AC-022 intent) **and** `minmax(0, 190px)` so tiles **shrink below 190px** to
  fit a phone (2 × ~171px at 390px), never grow past 190. This is v14's documented shrink exception
  (index.css:1961), reaffirmed. **AC-001-A1's fixed-width invariant applies > 640px only** — on
  phones, killing horizontal scroll outranks pixel-perfect tile width (A1 D-4(a) explicitly allows
  this). A width-5 box → 2 tiles per row, wrapping inside (satisfies AC-022-A1).
- **Breakpoint = 640px** (Tailwind `sm`), matching AC-022/AC-023 and the co-signed original §6.7.
  **Not v14's 767px:** v14 needed 767 because its non-wrapping fixed grid overflowed iPad portrait;
  our `auto-fill` model **already wraps 190px tiles natively at 768px** (a width-6 box packs ~3-up and
  wraps — comfortable, no special rule). So the old §6.7 iPad-portrait advisory is now **resolved by
  the model itself** — no tablet media query needed. 640 is the correct and only breakpoint.

**Page frame:** center the field at `max-width: 1392px` (the panel field's max-width), side gutter
**≥16px** (24px at ≥1024). **Hard rule — no horizontal page scroll at any width:** guaranteed by
`max-width:100%` on every box + `auto-fill` wrap (desktop/tablet) and the 2-col shrink (≤640).
`overflow-x` on the page body is a defect, not an escape hatch.

### 6.8 Dark / light parity

Every token above ships in **both themes** (columns/variants given per element). The box, the tool
tile (the shipped `.tile`/`.dark .tile`), icon plate, width selector, add-box bar, and empty-state
copy all have explicit dark values drawn from the existing dark tokens in `index.css`. Contrast was
checked on the computed foreground/background for each: box title ≥12:1; **tool name 15.1:1 light /
18.2:1 dark** (the measured shipped-tile values, design-system §9.1); selected width button 8.6:1;
muted labels at #737373 (4.74:1) / #9aa3b8 — all clear AA. **Before ship I'll run the browser loop**
(real viewports + `getComputedStyle`/axe-core) against staging and file any measured miss as a Gitea
issue, per my standing process.

---

## 7. Out of scope (v1)

These items are explicitly excluded from this spec. They may be revisited in future specs.

- **Per-user width preferences** — box width is admin-set and shared; a user cannot have a different width from another user for the same box.
- **Add/remove/reorder tools in the UI** — tools come from the existing per-user service management surfaces (Library, admin catalog). App Grid renders what exists.
- **Per-user box order preferences** — box order follows `category.sortIndex` (admin-set); user-level reorder is not in v1.
- **Drag-to-resize boxes** — width is set via the 1–8 button selector (A1), not drag.
- **Inline tool editing** — clicking a tool navigates to its URL; no in-place edit affordance.
- **Box deletion UI** — admin-managed via existing category management (not in the App Grid surface in v1).
- **Library integration** — the existing Library browse surface manages service availability; App Grid renders what's already on the user's dashboard.

---

## 8. Implementation notes

These are references for Stitch. Walt and Kare own what; Stitch owns how.

> ⚠️ **SUPERSEDED by Amendment A1 (`SPEC-app-grid-fixed-tiles.md`).** The **CSS approach bullet
> below describes the retired `1fr` model** and MUST NOT be built. Use A1's "Updated implementation
> notes" (fixed-width tiles, flex-wrap page, `auto-fill` tools track) with Kare's concrete tokens
> (`TILE_PX=190`, `GAP=16`, `PADDING=16`) from §6.0/§6.7. The bullet is kept only for historical
> diff. The rest of §8 (data sources, replace-don't-augment, TDD, no-self-merge) remains in force.

- **CSS Grid approach (Caleb's hint) — ⚠️ RETIRED, see A1:** One `--w` CSS variable per box, set from `category.grid_width`. Page grid: `repeat(6, 1fr)`. Box span: `grid-column: span var(--w)`. Links inside: `grid-template-columns: repeat(var(--w), 1fr)`. Responsive cap: at ≤640px, override `--w: min(var(--w), 2)` globally.
- **Data sources:** `GET /api/categories` (box list + widths) + `GET /api/services` (tools, grouped by `categoryId`). No new API endpoints for the read path.
- **New backend field:** `PATCH /api/categories/:id` with `gridWidth: integer` — pending Caleb's confirmation on §4A.
- **Replace (don't augment):** The `Catalog.tsx` panel layout is the code being replaced. App Grid is a new component; the old layout path is retired. Stitch: do not try to coexist both systems in one render tree.
- **TDD:** Build tests against these ACs first. Each AC has a clear observable outcome. Unit-test the layout math (AC-001–008, AC-022); browser-test the width selector interactions (AC-015–017) and link navigation (AC-011).
- **Do not self-merge.** This spec rides CI + browser-gate + Gracie QA (staging) + Walt PAT (prod). The PR gates are the release pipeline.

---

## 9. Co-sign gate

This spec is approved for implementation only when both signatures are present:

- [ ] **Walt (product):** product go — spec reflects Caleb's intent, ACs are testable, decisions are sound
- [x] **Kare (design):** design go — §6 complete **and revised for Amendment A1 (fixed-width tiles)**: D-1 `TILE_PX=190` / D-2 two-line clamp / D-3 selector-cap + `auto-fill` wrap / D-4 640px + 2-col shrink, all grounded in the shipped `.tile` + v14 panel model, dark+light parity, AA contrast, 44px targets. The prior iPad-portrait advisory is now resolved by the `auto-fill` model itself (§6.7) — no open advisories. See the A1 co-sign in `SPEC-app-grid-fixed-tiles.md §Co-sign`.

_Walt pre-sign: ACs and product decisions are solid pending Caleb's confirmation on §4A (width persistence) and Kare's design section._

---

## DECISION LOG — §4A + build gate (Joe, 2026-07-01)
- **§4A Width persistence: DECIDED = PERSIST.** Caleb confirmed: "Persistence is needed now. Walt is right." Box `grid_width` persists as an admin-set property: one new DB column `grid_width` on the category, one new accepted field on `PATCH /api/categories/:id`, width selector writes through. This supersedes the intake's 'out of scope' note.
- **§9 co-sign gate: OPENED.** §6 (Kare's design) is merged, Kare co-signed, §4A is resolved (persist), Caleb + Walt + Joe all aligned. Joe authorizes the build to proceed. Stitch: the start-gate is satisfied — BUILD.
- **Supersedes the max-4 (v12.7.0) floating-panel layout — REPLACE, per §2.**