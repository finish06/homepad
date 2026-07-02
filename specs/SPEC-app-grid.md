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

## 6. Design section (Kare — design lead)

**Status: Complete.** This section is authoritative for App Grid's look and feel. Every token
below is **grounded in the shipped system** — `src/index.css` (the live `.category-panel`,
`.tile`, `.tile-icon`, `.launcher-*` component tokens) and `docs/homepad-floating-panel-layout.md`
(the glass recipe). App Grid **inherits the floating-panel glass** so it reads as the same product,
one layout generation on. No new palette. Values were confirmed against the two mockups
(`docs/app-grid/mockup-1.png`, `mockup-2.png`) and measured against the existing CSS.

**Design-system rules this section enforces:** WCAG-AA contrast (≥4.5:1 body, ≥3:1 large/UI),
8pt spacing grid (4pt for tight type), ≥44×44px touch targets, one obvious hierarchy, every state
designed (empty/loading/error), motion with restraint + `prefers-reduced-motion`, real breakpoints,
consistency with the token set above.

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
| Padding | **16px** | same |
| Min-height | **`clamp(120px, …)`** — box header + one tool-row so an empty box still reads as a container (see 6.6) | same |

- **Box gap (page grid):** **16px** row and column gap (8pt grid), matching the panel field's gap.
- **Header** sits top-left inside the box: the title on the left, the width selector on the right
  (6.3). `display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;`
  so the selector **wraps to its own line under the title** on narrow (width 1–2) boxes instead of
  colliding with it — the overflow visible in `mockup-2.png` (Docs/Admin selectors bleeding past
  the box edge) is a defect this rule fixes.
- **Title** = `category.name` (AC-009): **16px / 700**, ink — `#0f172a` light / `#f5f5f5` dark
  (≥12:1 both). `white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0` so a long
  title truncates rather than shoving the selector. Contrast passes AA at this size and weight.

### 6.2 Tool link (the primary interactive element)

A horizontal card — icon plate on the left, name on the right — echoing the tile grammar (plate +
name) at a compact scale. This is the one thing users tap, so it gets a generous target.

| Property | Value | Grounding |
|---|---|---|
| Element | `<a href target="_blank" rel="noreferrer noopener">` | matches every existing homepad tile/row (6.4) |
| Min-height | **56px** (≥44 with margin) | `.library-row` min-height 56 |
| Padding | **8px 12px** | 8pt/4pt grid |
| Radius | **16px** | one step under the box's 22, one above the launcher rows' 9 |
| Surface (light) | `rgba(255,255,255,0.55)`, border `1px solid rgba(15,23,42,0.06)` | inset card on the glass |
| Surface (dark) | `rgba(255,255,255,0.04)`, border `1px solid rgba(255,255,255,0.08)` | |
| Icon plate | **36×36**, radius **10px**, `linear-gradient(135deg,#f2f4fc,#e9edf9)` light / `#1b2130,#161b26` dark, inset `0 0 0 1px rgba(15,23,42,.05)` | resized `.tile-icon` token |
| Emoji icon | rendered as inline text, **20px**, centered in the plate | (AC-010) |
| PNG icon | `<img src="/api/services/:id/icon/:variant">`, variant follows theme (light/dark), `alt=""`; fallback = initial badge (existing `iconSrc`/`initialBadge`) | reuse existing icon path |
| Gap plate→name | **12px** | 4pt grid |
| Name | **15px / 650**, `#262626` (neutral-800) light / `#f5f5f5` dark | matches tile name ink |
| Name overflow | `white-space:nowrap; overflow:hidden; text-overflow:ellipsis` **+ `title={name}`** and the `<a>` `aria-label={name}` | see 6.2.1 |

- **Hover:** border → `rgba(99,102,241,0.45)` (indigo, matches `.tile:hover`), `transform: translateY(-1px)`,
  transition `transform .18s, border-color .25s`. **Active:** `translateY(0)`. **Focus-visible:**
  `outline: none; ring 2px #6366f1` (reuse `focus-visible:ring-2 ring-indigo-500` from the tiles).
- **Reduced motion:** drop the `translateY`; keep the border/opacity feedback (mirrors the existing
  `.tile` reduced-motion rule).
- **Contrast:** name #262626 on the light card ≈ 13:1; #f5f5f5 on the dark card ≈ 15:1 — both AA/AAA.

#### 6.2.1 Name truncation (confirmed strategy)

`mockup-2.png` shows ellipsis at width-2/width-1 ("Sp…", "Ru…", "Ar…"). **Confirmed:** CSS
`text-overflow:ellipsis` (single line) **plus** a native `title` attribute carrying the full name
(hover tooltip) **and** `aria-label` on the `<a>` set to the full name so the accessible name is
never the truncated string. The visible glyph truncates; the semantic name stays whole.

### 6.3 Width selector (admin only)

Six buttons labeled 1–6 (AC-013); the button matching `category.grid_width` is the selected state.

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
- **AC-014 — non-admins:** the selector is **not rendered at all** (removed from the DOM), *not* a
  grayed/read-only read-out. This matches every other admin-only affordance in homepad (the Gear
  edit menu, admin settings) and keeps a non-admin box clean. A disabled 6-button row would be
  visual noise for a control they can never use.
- **Interaction (AC-015):** clicking a button sets `--w` on the box; the box re-spans and the inner
  links regrid **instantly**. **Do not animate the reflow** — `grid-column`/`grid-template-columns`
  changes are not smoothly animatable and would jank (principle 6). The change snaps; that's correct.

### 6.4 External link behavior (confirmed)

Tools open in a **new tab**: `target="_blank"` **`rel="noreferrer noopener"`** — the exact string
used by every existing homepad link (`Catalog.tsx` tiles, `CommandLauncher`, `StatusBar`,
`AlertHistoryPanel`). This resolves AC-011 (new tab) and is consistent, security-correct
(no `window.opener` leak, no referrer), and needs no new pattern.

### 6.5 "+ Add box" affordance (admin only)

- **Treatment:** a **dashed-outline full-width bar** at the end of the grid — `grid-column: 1 / -1`
  (spans all 6 page columns), reusing the `.dashboard-empty` dashed token: `1px dashed
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

### 6.7 Responsive

Grounded in `tailwind.config.ts` (stock breakpoints — `sm:640 md:768 lg:1024`, no overrides).

- **> 640px (`sm` and up):** full **6-column** page grid, `repeat(6, 1fr)`, gap 16px. Box:
  `grid-column: span var(--w)`. Inner tools: `grid-template-columns: repeat(var(--w), 1fr)`, gap
  **12px**. No box is artificially capped (AC-023).
- **≤ 640px:** **2-column** grid. Both box span and links-per-row cap at 2 via
  `--w: min(var(--w), 2)` (the intake's CSS hint). A width-5 box renders as width-2; a 5-tool box
  shows 2 per row and wraps inside (AC-022).
- **Breakpoint confirmed at `640px`** = Tailwind `sm`, matching AC-022/AC-023 and the intake's
  "~640px". Boundary rule: `@media (max-width: 640px)` → 2-col (640 and below = mobile), `min-width:
  641px` → 6-col. Grounded in the design system, not invented.
- **Page frame:** center the grid at `max-width: 1392px` (matches the panel field's `max-width`),
  side gutter **≥16px** (24px at ≥1024). **Hard rule — no horizontal page scroll at any width**
  (carried over from the floating-panel spec): the 6→2 collapse + fluid `1fr` columns keep every box
  within `100vw`; `overflow-x` on the page body is a defect, not an escape hatch.

> **Advisory (open question for Walt — not a design blocker):** the two-tier 6↔2 jump means an
> **iPad portrait (768px)** renders the full 6 columns — a width-6 box then packs 6 tool cards
> across ~118px each, tighter than the 36px plate + name reads comfortably. This homelab is
> iPad-first (CLAUDE.md), so I recommend an **intermediate tier**: cap `--w` at **4** for
> **641–1024px** (`--w: min(var(--w), 4)`), full 6 only at `≥1024px`. It's one extra media query and
> makes iPad portrait comfortable. I've left the **normative** spec at the two tiers the ACs define
> (6 / 2) so I don't contradict AC-022/023; if you take the tablet tier, add an AC for it and I'll
> fold it in. **Co-sign is PASS either way** — this is a refinement, not a gate.

### 6.8 Dark / light parity

Every token above ships in **both themes** (columns/variants given per element). The box, tool card,
icon plate, width selector, add-box bar, and empty-state copy all have explicit dark values drawn
from the existing dark tokens in `index.css`. Contrast was checked on the computed foreground/
background for each: box/tool title ≥12:1, selected width button 8.6:1, muted labels at #737373
(4.74:1) / #9aa3b8 — all clear AA. **Before ship I'll run the browser loop** (real viewports +
`getComputedStyle`/axe-core) against staging and file any measured miss as a Gitea issue, per my
standing process.

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
- [x] **Kare (design):** design go — §6 complete: box/tool/selector/add-box/empty-state tokens grounded in the shipped glass system, dark+light parity, AA contrast, 44px targets, 640px breakpoint confirmed. One advisory (§6.7 iPad-portrait tablet tier) — a refinement, not a gate.

_Walt pre-sign: ACs and product decisions are solid pending Caleb's confirmation on §4A (width persistence) and Kare's design section._

---

## DECISION LOG — §4A + build gate (Joe, 2026-07-01)
- **§4A Width persistence: DECIDED = PERSIST.** Caleb confirmed: "Persistence is needed now. Walt is right." Box `grid_width` persists as an admin-set property: one new DB column `grid_width` on the category, one new accepted field on `PATCH /api/categories/:id`, width selector writes through. This supersedes the intake's 'out of scope' note.
- **§9 co-sign gate: OPENED.** §6 (Kare's design) is merged, Kare co-signed, §4A is resolved (persist), Caleb + Walt + Joe all aligned. Joe authorizes the build to proceed. Stitch: the start-gate is satisfied — BUILD.
- **Supersedes the max-4 (v12.7.0) floating-panel layout — REPLACE, per §2.**