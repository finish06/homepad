# homepad v10 — Always-On Drag-and-Drop Reordering — Spec

**Version:** 1.1  **Date:** 2026-06-13  **Status:** DECIDED — Caleb signed off on all open questions (2026-06-13); ready to build
**Authors:** Stitch (Claude Code) + Caleb Dunn
**Audience:** Frontend developer implementing in the homepad codebase
**App:** homepad (custom service dashboard) — React + Vite + **Tailwind CSS**, Go backend. Light + Dark themes.
**Methodology:** ADD (getadd.dev) — POC→Production dial. RED→GREEN→REFACTOR per AC.
**Builds on:** [`v4-app-categories.md`](./v4-app-categories.md), [`v5-collapsible-categories.md`](./v5-collapsible-categories.md), [`v7-ux-redesign.md`](./v7-ux-redesign.md), [`v8-command-launcher.md`](./v8-command-launcher.md), [`v9-per-user-dashboards.md`](./v9-per-user-dashboards.md)

---

## 1. Summary

Since v9 every person owns their **own** dashboard — their apps, their folders,
their arrangement. But reordering today is clumsy: you open the avatar menu, pick
**Personal settings** to flip the whole dashboard into **arrange mode**, then nudge
each tile one slot at a time with **up / down arrow buttons** (`move-up` /
`move-down`), and categories are reordered behind a *different* surface again. It's
modal, it's slow, and "Personal settings" is the only thing that mode does — it has
no other content.

v10 makes reordering **direct and always available**: you **drag** a tile to where
you want it, and you **drag** a category section to reorder your folders — **right
on the dashboard, all the time, with no mode to enter first.** Drag-and-drop
*replaces* the v7 arrange-mode arrows entirely, and the now-empty **Personal
settings** surface is **removed** (it will be re-added later with real content —
out of scope for v10, see §4).

Because drag is mouse-only by nature, v10 ships a **first-class keyboard
alternative** (pick-up / move / drop via the keyboard, announced to screen readers)
as a hard requirement, not a nice-to-have — DnD that only works with a mouse fails
WCAG and is not acceptable (§10, A6/A7).

**Headline interaction**

```
   Regular dashboard — no edit mode, no gear, nothing to toggle on first.

   MEDIA  ⠿                                   ← grab a category section by its grip
   ┌──────────┐  ┌──────────┐  ┌──────────┐
   │ ⠿ Jelly… │  │ ⠿ Plex   │  │ ⠿ Sonarr │   ← each tile has a drag grip (⠿)
   └──────────┘  └──────────┘  └──────────┘
        │  drag Plex left of Jellyfin …
        ▼
   ┌──────────┐  ┌──────────┐  ┌──────────┐
   │ ⠿ Plex   │  │ ⠿ Jelly… │  │ ⠿ Sonarr │   ← order persists to PUT /api/layout
   └──────────┘  └──────────┘  └──────────┘

   Keyboard: focus a grip → Space to pick up → ↑↓←→ to move → Space to drop.
             "Plex, grabbed." … "Plex moved to position 1 of 3." … "Plex dropped."
```

### Design principles
- **Direct manipulation, no mode.** You reorder the thing by dragging the thing,
  where it lives. No arrange/edit toggle stands between intent and action (this is
  the whole point — it replaces the modal v7 arrows).
- **Every pointer is equal.** Mouse, trackpad, **touch**, and **keyboard** can all
  reorder. The keyboard path is co-equal, not a degraded fallback (§10).
- **Each person owns their world (v9).** A user drags **their own** tiles and
  **their own** categories; the reorder persists to **their own** per-user layout.
  No admin gate, no cross-user effect.
- **Restraint, reused.** No new visual language. Reuse the v7 indigo→violet accent,
  radii, shadows, and motion tokens (§2). A tile mid-drag is the same tile, lifted.
- **Client-only, like v8.** v10 reuses the **existing** per-user persistence
  endpoints (`PUT /api/layout`, `PUT /api/categories/order`). **No backend change
  of any kind** (§3).

---

## 2. Design tokens (reuse v7 — no new palette)

v10 introduces **no new color tokens**. It reuses the v7 tokens verbatim
(`specs/v7-ux-redesign.md §2`); values below are referenced, not redefined.

| Concern | Reused v7 token / value | Use in v10 |
|---|---|---|
| Accent gradient | `--accent-from #4f46e5` → `--accent-to #a855f7` | drop-indicator bar, active grip, keyboard "grabbed" ring |
| Title text | `--text-strong #0f172a` | (tile titles, unchanged) |
| Muted text | `--text-muted #475069` | category-header grip rest color |
| Faint text | `--text-faint #9aa3b8` | grip rest color, drag-hint copy |
| Hairline | `--hairline rgba(15,23,42,.06–.08)` | placeholder/gap outline during drag |
| Tile shadow (hover) | v7 tile-hover token | **lifted** (dragging) tile elevation |

### New surfaces (built from existing tokens)
- **Drag grip** (`⠿`, the drag handle on tiles and category headers): a small
  6-dot / grip glyph, `--text-faint` at rest, `--text-muted` on hover, **accent**
  while grabbed. **16×16** hit-glyph inside a **≥44×44** touch target (§9). Rendered
  as a real `<button>` (keyboard + a11y — §10).
- **Lifted tile / section** (the item under the pointer/keyboard while dragging):
  the v7 **tile-hover shadow** token + `transform: scale(1.02)` and a faint accent
  ring (`box-shadow: 0 0 0 1px rgba(99,102,241,.35)`), so the grabbed item reads as
  "picked up." Original slot shows a **placeholder gap** outlined with `--hairline`.
- **Drop indicator:** a **2px accent bar** (`linear-gradient(135deg,#4f46e5,#a855f7)`)
  drawn at the insertion point between tiles (or between sections for category
  drag), `border-radius:2px`. Selection of position is **never** signalled by color
  alone — see §10 (live announcements + numeric position).

### Motion (reuse v7 Motion tokens)
- **Reflow:** sibling tiles slide to make room with `transform .18s ease` (the v7
  tile-hover transition curve). Drop settles with the same easing.
- **`prefers-reduced-motion`:** disable the slide/scale transforms — items
  **snap** to their new positions instead, and the lifted state drops the
  `scale()` (keep the ring/shadow as the non-motion "grabbed" signal). Same rule as
  v7 §2.

---

## 3. Architecture / non-goals (read first)

**v10 is CLIENT-SIDE ONLY and reuses the EXISTING per-user persistence
endpoints — there is NO backend change of any kind.** Like the v8 launcher, this
PR stays entirely within `Code/homepad`.

The two endpoints already exist (confirmed in `homepad-api`) and are **already
per-user** (v9, Invariant 2 — each persists only to the caller's own rows):

| Endpoint | Body | Effect | Status |
|---|---|---|---|
| `PUT /api/layout` | `{ "order": ["<serviceId>", …] }` | rewrites the caller's tile order | **exists** (`favorites.go` → `handleUpdateLayout`; web `api.ts` → `setLayout`) |
| `PUT /api/categories/order` | `{ "order": ["<categoryId>", …] }` | rewrites the caller's category order | **exists** (`categories.go` → `handleSetCategoryOrder`; web `api.ts` → `setCategoryOrder`) |

- These are the **same two endpoints the v7 arrange-mode arrows already call**
  (via `setLayout` / `setCategoryOrder`). v10 changes **how the new order is
  produced** (a drag gesture instead of one-slot arrow nudges) — not where it's
  persisted. The request bodies, responses (204), and per-user scoping are
  unchanged.
- **No new endpoint, no new column, no schema change, no new env var.** If an idea
  needs a server change it is **out of scope for v10**.
- **No persistence beyond the two PUTs.** Drag state (what's grabbed, the live
  insertion point) is ephemeral client state; only the final order is written, once,
  on drop (§6).

> **Non-goal:** anything that touches `homepad-api`. This is a hard requirement, not
> a preference.

**Out of scope for v10 (deferred):**
- Re-adding a **Personal settings** surface with real content (v10 only *removes*
  the empty one — §4; a future spec brings it back).
- **Moving a tile *between* categories** by drag (re-foldering) — v10 reorders
  **within** a section. This is a genuine product fork — see **OQ2**.
- Dragging tiles **into / out of the Favorites** section to favorite/unfavorite
  (favoriting stays an explicit toggle — §7, and **OQ1**).
- Multi-select drag, drag to create a folder, drag across the launcher, drag to
  delete. None ship in v10.

---

## 4. What v10 removes (the arrange-mode teardown)

v10 deletes the modal reorder path that drag replaces. Concretely:

1. **The `move-up` / `move-down` tile arrows** (`Catalog.tsx`, rendered only when
   `arrange`) are **removed** — drag is the reorder affordance now (A1, A8).
2. **The `category-move-up` / `category-move-down` arrows** (the category reorder
   controls) are **removed** — category sections are dragged on the dashboard
   instead (A3, A8). *(Per v9, categories are per-user, so every user reorders
   their own folders directly; this is no longer an admin-only surface.)*
3. **The "Personal settings" menu item** (`UserMenu.tsx`, `data-testid="menu-settings"`)
   and the **arrange-mode state it toggled** (`arrange` in `App.tsx`, plumbed as the
   `arrange` prop through `Catalog`) are **removed entirely** (A9). "Personal
   settings" currently does *nothing but* flip arrange mode and shows no content of
   its own — so once arrange mode is gone, the menu item has nothing to open.
4. The avatar **User Menu** therefore loses one item; everything else in it
   (identity, role pill, Appearance/theme control, **Log out**, and the admin-only
   **Edit dashboard** / **Admin settings** items) is **unchanged**.

> **Scope note on "Edit dashboard" (admin):** v10 does **not** touch the admin-only
> **Edit dashboard** surface (icon upload, rename/delete service, category
> rename/delete via `CategoryManager`). Only the *reorder* affordances (the arrows)
> and the *Personal settings / arrange* toggle are removed. Renaming, deleting, and
> icon editing keep their existing homes. Whether category **reorder** should leave
> `CategoryManager` and live purely on the dashboard is **OQ3**.

---

## 5. The drag interaction model

### 5.1 What's draggable
Two independent sortable contexts on the dashboard:

- **Tiles within a section** (`data-testid="service-tile"`). A tile is dragged to a
  new position **within its own category section** (or within the Favorites
  section, or within Uncategorized) — mirroring the v7 arrows' **section-scoped**
  reorder (`sectionIds`). Cross-section moves are **OQ2** (default: not in v10).
- **Category sections** (`data-testid="category-header"` carries the section grip).
  A whole section is dragged up/down to reorder folders. Whether the section drags
  as a unit (header + its tiles together) is settled below (D3) — yes, the section
  moves as a block.

The **Favorites** pinned section and **Uncategorized** are sortable for their tiles
like any category, but are **not** themselves drag-reorderable as sections
(Favorites is always pinned first, Uncategorized always last — their position is
structural, not user-ordered). Only real user categories reorder (A3).

### 5.2 The drag affordance — a grip handle (`data-testid="drag-handle"`)
Each tile and each category header gets a **dedicated drag grip** (`⠿`), rendered as
a real `<button type="button">`:
- **Always present** on the dashboard (no mode). On `≥640px` it sits at low emphasis
  (`--text-faint`) and brightens on tile hover / focus-within; on touch (`<640px`)
  it is **always fully visible** (no hover to rely on — §9). *(Whether the handle
  should be permanently prominent vs. hover-revealed on desktop is the touch/affordance
  call in **OQ4**; this spec's lean is "subtle-on-desktop, always-on-touch.")*
- **Why a dedicated handle and not whole-tile drag:** the whole tile is an
  `<a target="_blank">` link (v7). A grip cleanly separates *navigate* (click the
  tile) from *reorder* (use the grip) — for pointer, touch, **and** keyboard — with
  no click-vs-drag heuristic to misfire (D2). The grip is the single drag origin for
  all input modalities.
- Accessible name: `aria-label="Reorder {service name}"` (tiles) /
  `"Reorder {category name} section"` (headers). See §10 for ARIA state.

### 5.3 Pointer / touch drag
- **Press the grip and move** to lift the item; sibling items reflow (§2 motion) to
  reveal the live insertion point (drop indicator bar). Release to drop.
- **Activation constraint** (click-vs-drag safety): a drag begins only after the
  pointer moves a small distance (≈**8px**) **or** after a short press-hold
  (≈**200ms**) on touch. A tap/click that doesn't cross the threshold is **not** a
  drag — so tapping a tile still opens the app, and tapping the grip with no
  movement does nothing destructive (D2). This prevents touch-scroll and link-open
  from being hijacked by accidental drags.
- **Auto-scroll:** dragging near the top/bottom edge of the scroll area scrolls the
  dashboard so long lists are reachable.
- **Drop outside any valid target** (or `Esc` mid-drag) **cancels** — the item
  returns to its original slot, no PUT is sent (A5, A10).

### 5.4 Keyboard drag (co-equal — see §10 for the full a11y contract)
- **Tab** to a grip handle (it's a real button, in tab order).
- **Space / Enter** picks the item up ("grabbed"); the item gets a visible accent
  ring and `aria-pressed="true"`; an `aria-live` region announces *"{name} grabbed,
  position {i} of {n}. Use arrow keys to move, space to drop, escape to cancel."*
- **Arrow keys** move the grabbed item one position at a time (↑/↓ and ←/→ both map
  to previous/next within the sortable axis); each move re-announces *"{name} moved
  to position {j} of {n}."*
- **Space / Enter** drops (commits) → announce *"{name} dropped at position {j}."*
  and persist (§6). **Esc** cancels → item returns to origin, announce *"Reorder
  cancelled."*, **no PUT** sent.
- Focus stays on the handle throughout; after drop, focus remains on the handle of
  the moved item.

### 5.5 Collapsed categories (v5)
- A **collapsed** category (v5) still drag-reorders **as a section** by its header
  grip (its hidden tiles ride along — D3). You cannot reorder *tiles inside* a
  collapsed section (they aren't rendered); expand it first. Collapsing/expanding is
  unchanged and is **not** a drag gesture.

---

## 6. Persistence (reuse existing endpoints — §3)

- **Tile reorder:** on drop, compute the new flat service-id order and call
  `setLayout(order)` → `PUT /api/layout { order:[…] }`. The order array carries the
  **full** layout (all of the caller's service ids in their new overall order),
  exactly as the v7 arrows' `moveItem` already does — within-section drag just
  permutes the ids inside that section's contiguous run and leaves the rest intact.
- **Category reorder:** on drop, call `setCategoryOrder(order)` →
  `PUT /api/categories/order { order:[…] }` with the caller's category ids in new
  order — exactly as `moveCat` already does.
- **Optimistic + rollback (reuse v7 behavior):** apply the new order in local state
  immediately on drop for instant feedback; if the PUT fails, **roll back** to the
  prior order and surface the existing inline error affordance. A **cancelled** drag
  (Esc / drop-outside) sends **no** request at all (A10).
- **One write per drop.** No per-move network traffic during a keyboard drag — only
  the final committed order is persisted, once, on drop (A2/A3 assert exactly one
  PUT with the final order).

---

## 7. Favorites — where the toggle goes now (DECIDED: a per-tile "⋯" overflow menu)

This is the one real casualty of removing arrange mode. Today the **favorite star**
(`data-testid="favorite-toggle"`) is rendered on a tile **only when `arrange` is
true** — i.e. favoriting lives *inside* arrange mode. Delete arrange mode and the
star has no home. It must move somewhere on the **always-on** dashboard.

**v10 decision (DECIDED by Caleb, 2026-06-13 — OQ1 option (b); this SUPERSEDES the
earlier lean D5):** the favorite toggle is tucked into a per-tile **"⋯" overflow
menu**, not a persistent star. This is the *cleanest tile* (no second always-on
glyph competing with the drag grip) at the cost of one extra tap to favorite:

- Each tile gets a small **"⋯" overflow button** (`data-testid="tile-menu"`,
  `aria-label="More options for {service name}"`, `aria-haspopup="menu"`), a real
  `<button>` in the top-**left** corner (the status dot owns top-right, v7 §4).
  **Always visible on touch**, low-emphasis at rest and brightened on tile
  hover/focus-within on desktop (same emphasis rule as the grip, §5.2).
- Opening it reveals a small menu containing the **Favorite / Unfavorite** item
  (`data-testid="favorite-toggle"`, `data-favorite="true|false"`,
  `role="menuitem"`). Filled `★ Favorited` when on, outline `☆ Favorite` when off.
- Toggling calls the existing `setFavorite(id, on)` (no change to that endpoint);
  the Favorites pinned section updates as today; the menu closes after the toggle.
- **Click-vs-drag-vs-navigate:** the "⋯" button and its menu items
  `stopPropagation` and are **not** the drag grip and **not** the tile link — the
  tile carries three distinct, keyboard-reachable targets (tile-link, drag grip,
  overflow "⋯"), and the favorite toggle lives one layer down inside the menu. The
  menu closes on Esc / outside-click and restores focus to the "⋯" trigger.
- The overflow menu is the natural home for future per-tile actions, but v10 puts
  **only** Favorite/Unfavorite in it (Simplicity-First — nothing speculative).

> **Why an overflow menu and not a persistent star?** Favorites drive the v8
> launcher default and the pinned section — they're load-bearing, so the toggle
> can't simply vanish with arrange mode. But the tile already gains an always-on
> drag grip in v10; a second always-on glyph (a star) makes the tile busy. Tucking
> favoriting one tap deep keeps the resting tile clean while keeping the
> load-bearing feature reachable with zero modes. (The earlier lean D5 — a
> persistent star — is **superseded**.)

---

## 8. data-testids

**New in v10:**
- `drag-handle` — the grip button on each tile **and** each category header.
  Disambiguate with `data-drag-type="tile"` / `data-drag-type="category"` and the
  owning id: `data-service-id="{id}"` (tile grips) / `data-category-id="{id}"`
  (header grips).
- `drag-live-region` — the visually-hidden `aria-live="assertive"` region that
  announces grab / move / drop / cancel (§10).
- `drop-indicator` — the insertion-point bar shown during an active drag (present
  only while dragging).
- `tile-menu` — the per-tile "⋯" overflow button (§7) that opens the menu hosting
  the favorite toggle.

**Relocated (kept, no longer arrange-gated):**
- `favorite-toggle` (+ `data-favorite`) — no longer behind arrange mode; now a
  `role="menuitem"` **inside the per-tile "⋯" overflow menu** (§7). Present in the
  DOM once that menu is open (not at tile rest).

**Removed (deleted with arrange mode — §4):**
- `move-up`, `move-down` (tile arrows), `category-move-up`, `category-move-down`
  (category arrows), `menu-settings` (Personal settings menu item).

**Preserved unchanged:** `service-tile`, `status-badge`, `service-tile-icon`,
`service-tile-name`, `service-tile-description`, `category-header`,
`disclosure-chevron`, `category-count`, `user-menu*`, `menu-edit`,
`menu-admin-settings`, `menu-logout`, theme controls, launcher testids, and all
v9 library testids.

---

## 9. Light + dark / responsive / touch

- All new surfaces (grip, lifted state, drop indicator, placeholder gap) reuse
  **v7 tokens** (§2) and render correctly in **light and dark** — verify the accent
  drop-indicator and the lifted-tile ring/shadow contrast in both themes.
- **Touch is a first-class drag input**, not an afterthought (Caleb's explicit
  requirement). On `<640px`: grips are always visible, drag uses the press-hold
  activation (§5.3) so it doesn't fight page scroll, hit targets are **≥44×44px**,
  and auto-scroll lets you drag across a long dashboard. The keyboard path also
  covers any touch device with an attached/virtual keyboard.
- **No hover dependency** anywhere — every drag/favorite affordance is reachable by
  touch and keyboard without hover (mirrors the v8 mobile rule). Hover only *adds*
  emphasis on desktop.
- The grid breakpoints (v7 §4: `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4
  2xl:grid-cols-6`) are **unchanged**; tiles reflow within the existing grid during
  drag.
- `prefers-reduced-motion`: honored (§2 — snap instead of slide).

---

## 10. Accessibility — the keyboard alternative is REQUIRED (not optional)

Mouse-only drag-and-drop **fails WCAG 2.1** (2.1.1 Keyboard, 2.5.7 Dragging
Movements). v10 ships a complete keyboard-operable reorder path and screen-reader
announcements as a **hard acceptance criterion** (A6, A7). The pattern follows the
established accessible-DnD model (focusable drag handle + roving "grabbed" state +
`aria-live` move announcements).

- **Drag handles are real buttons** in the tab order (`<button type="button">`),
  with an accessible name (`aria-label="Reorder {name}"`, §5.2). Every reorder a
  mouse can do, the keyboard can do from the handle (§5.4).
- **Grabbed state is exposed, not just visual.** The grabbed handle carries
  `aria-pressed="true"` (toggled by Space/Enter pick-up/drop). *(If implemented via
  a library using `aria-roledescription`/`aria-describedby` drag instructions
  instead, that is acceptable — the requirement is that grabbed state and move
  instructions are programmatically exposed, not the exact attribute. A roving
  `tabindex` over the sortable items is an acceptable equivalent to a per-item
  handle, provided it's fully keyboard-operable and announced.)*
- **Live announcements** via `drag-live-region` (`aria-live="assertive"`, visually
  hidden): pick-up announces name + position + instructions; each arrow move
  announces the new numeric position (*"position {j} of {n}"*); drop announces the
  committed position; Esc/cancel announces cancellation (§5.4). Numeric position is
  what makes progress perceivable without sight.
- **Color independence:** the drop position is conveyed by the **announced numeric
  position** and the reflow/gap **and** the accent indicator — **never** by the
  accent color alone. The lifted item's "grabbed" state is the ring + shadow +
  `aria-pressed`, not color alone.
- **Focus management:** focus never leaves the handle during a keyboard drag and
  rests on the moved item's handle after drop. `Esc` cancels and keeps focus on the
  handle.
- **The "⋯" overflow button** (§7, hosting the favorite toggle) and the **tile
  link** are independently focusable and labeled; Tab order within a tile is
  sensible (link → "⋯" → grip, or as the implementation orders them, but all three
  reachable). The overflow menu itself is a standard menu (Esc closes, focus
  returns to the "⋯" trigger).
- **Contrast:** grip glyph and any drag-hint text meet WCAG AA in both themes
  (re-verify `--text-faint #9aa3b8` at the grip size; bump to `#8a93a8` if it misses
  4.5:1, per v7 §8).
- **Reduced motion:** honored (§2).
- **jest-axe:** no violations on the dashboard at rest, and (where assertable in
  jsdom) during an active keyboard drag.

---

## 11. Decisions (made under delegated authority — Joe, 2026-06-13)

These are the **smaller engineering calls**; the genuine product forks are deferred
to §13 for Caleb.

| # | Decision | Rationale |
|---|---|---|
| **D1** | **Use `@dnd-kit` (`@dnd-kit/core` + `@dnd-kit/sortable`) rather than hand-rolling DnD.** Two new runtime deps (the repo currently has only `react`/`react-dom`). | dnd-kit ships a `KeyboardSensor` + built-in screen-reader announcements + pointer/touch sensors with activation constraints — i.e. it gives us the **required** keyboard/touch a11y (§10) out of the box. Hand-rolling accessible *and* touch-capable DnD would be far more code and risk, violating Simplicity-First in spirit. The two packages are small and tree-shakeable. *(If Caleb would rather avoid the dependency, the fallback is a minimal hand-rolled keyboard-only reorder + HTML5 pointer drag — more code, more a11y risk; flagged should it matter.)* |
| **D2** | **Reorder is via a dedicated grip handle; the tile stays a plain `<a>` link.** Pointer drag uses an 8px / 200ms activation constraint. | Cleanly separates *navigate* from *reorder* for pointer, touch, and keyboard with no click-vs-drag heuristic misfiring and no risk of a drag opening the app in a new tab. |
| **D3** | **A category drags as a whole section (header + its tiles move as one block).** Favorites/Uncategorized are not section-reorderable (structurally pinned first/last). | Matches the mental model ("move this folder") and what `PUT /api/categories/order` persists (a category id order). Reordering tiles *inside* a section is the separate tile-drag context (§5.1). |
| **D4** | **One persistence write per drop; cancelled drags send nothing.** No per-move PUTs during a keyboard drag. | The endpoints rewrite the full order; intermediate states are noise. Matches the v7 arrows' commit-on-action model and keeps it zero-chatter. |
| **D5** | ~~Favorite star becomes a persistently-rendered per-tile toggle.~~ **SUPERSEDED by Caleb's OQ1 sign-off:** the favorite toggle lives in a per-tile **"⋯" overflow menu** (`tile-menu` → `favorite-toggle`), not a persistent star (§7). | Arrange mode is gone, but favorites are load-bearing (launcher default, pinned section). The tile already gains an always-on drag grip in v10; an overflow menu keeps the resting tile clean (no second always-on glyph) while keeping favoriting one tap away. |
| **D6** | **Within-section reorder only in v10; cross-category move is deferred.** | Mirrors exactly what the v7 arrows did (`sectionIds`-scoped). Cross-category drag is a real new capability (re-foldering semantics, category reassignment) — a product fork, **OQ2**, not a freebie. |
| **D7** | **No backend change; reuse `PUT /api/layout` + `PUT /api/categories/order`.** | Hard architecture constraint (§3); both endpoints exist and are already per-user (v9). v10 only changes how the order is *produced*. |

---

## 12. Acceptance criteria (testable)

Component tests (vitest + Testing Library + `@testing-library/user-event`) drive the
ACs; dnd-kit's `KeyboardSensor` makes the keyboard path (A6/A7) assertable in jsdom
without a real pointer. Each AC is implemented **RED→GREEN** (failing test committed
first, tagged with its AC id).

| # | Criterion | How verified |
|---|---|---|
| **A1** | Tiles are draggable **on the regular dashboard with no mode toggle**: each tile renders a `drag-handle` (`data-drag-type="tile"`) immediately, with **no** prior click on a gear/edit/arrange control. | Component: render `Catalog` with seeded services → assert a `drag-handle` per tile is present on first render; assert **no** arrange/edit toggle was interacted with. |
| **A2** | Dragging a tile to a new position **within its section** reorders it and persists **once** via `PUT /api/layout` with the full new id order; the moved tile's new index matches the drop. | Component: drive a keyboard drag (focus grip → Space → ArrowDown → Space) → assert `setLayout` called **exactly once** with the expected reordered id array; DOM order updated. |
| **A3** | Dragging a **category section** reorders the folders and persists **once** via `PUT /api/categories/order` with the new category-id order; Favorites stays first and Uncategorized last. | Component: keyboard-drag a category header grip past a sibling → assert `setCategoryOrder` called once with expected order; Favorites/Uncategorized positions unchanged. |
| **A4** | A tile reorder is **section-scoped** (v10 default): a keyboard/pointer drag cannot move a tile out of its category; positions outside the section are not valid drop targets. | Component: attempt to move the last tile of section A "down" past the section boundary → it stays within A (wraps or stops); no cross-section change; `setLayout` order keeps A's run contiguous. |
| **A5** | **Esc mid-drag cancels**: the item returns to its origin and **no** PUT is sent; dropping outside any sortable target also cancels. | Component: Space to grab, ArrowDown, **Esc** → DOM order unchanged, `setLayout`/`setCategoryOrder` **not** called; live region announced cancellation. |
| **A6** | **Keyboard reorder works end-to-end** (the required a11y path): focus a `drag-handle`, `Space` grabs (`aria-pressed="true"`), Arrow keys move, `Space` drops and persists — for **both** tiles and categories. | Component: full keyboard sequence on a tile grip and a category grip → assert `aria-pressed` toggles, order changes, correct PUT fired once each. |
| **A7** | **Screen-reader announcements**: `drag-live-region` (`aria-live`) announces grab (name + "position i of n" + instructions), each move (new "position j of n"), drop, and cancel. Drop position is conveyed by text/position, never color alone. | Component: assert the live region's text content updates on grab → move → drop → (separately) cancel, including the numeric position. |
| **A8** | The arrange-mode **`move-up` / `move-down`** tile arrows and **`category-move-up` / `category-move-down`** category arrows are **gone** (not rendered in any state). | Component: render dashboard (and, if an admin edit surface remains, that too) → assert none of those four testids exist anywhere. |
| **A9** | The **Personal settings** menu item (`menu-settings`) and arrange mode are **removed**: the User Menu no longer renders `menu-settings`, and there is no `arrange` state/prop toggling the dashboard. | Component: open `UserMenu` → assert `menu-settings` absent; assert remaining items (`menu-edit` admin, `menu-admin-settings` admin, `menu-logout`, theme controls, identity) still present. |
| **A10** | **Optimistic update + rollback**: a successful drop updates order immediately; if the PUT rejects, order **rolls back** to the prior arrangement and an error affordance shows. | Component: mock `setLayout` to reject → after drop, assert order reverts to original and the inline error is shown. |
| **A11** | The **favorite toggle** lives in a per-tile **"⋯" overflow menu** reachable **without** entering any mode: every tile renders a `tile-menu` button at rest; opening it reveals `favorite-toggle` (`data-favorite` reflects state) and toggling calls `setFavorite`; the toggle is **not** the drag handle and does not start a drag or navigate. | Component: assert `tile-menu` present on first render and `favorite-toggle` **absent** until the menu opens; open menu → click toggle → `setFavorite(id, !on)` called, `data-favorite` flips; clicking it does **not** open the tile link or initiate a drag. |
| **A12** | **Pointer/touch click-vs-drag safety**: a plain click/tap on a tile opens its link (no drag triggered); a click/tap on the grip with no movement does not reorder. | Component: click a tile (no movement) → anchor activates (new-tab semantics intact), `setLayout` not called; click grip without movement → no reorder. |
| **A13** | Works in **light and dark**, reuses v7 tokens (no new palette), and honors `prefers-reduced-motion` (transforms disabled → snap). a11y-clean. | Component under `.dark`: assert token classes/vars on grip/indicator/lifted state; set `prefers-reduced-motion` → assert transform-disabling class/branch; jest-axe finds no violations at rest. |
| **A14** | **Responsive / touch**: on `<640px` the grip is always visible and a ≥44px target; on `≥640px` it is low-emphasis at rest and brightens on hover/focus; the favorite star is always visible on touch. | Component at both widths: assert grip visibility/emphasis classes and tap-target sizing; assert star always-visible class on narrow viewport. |

> Playwright e2e (real pointer drag, real touch) is **not** part of the CI gate in
> this container (no browser libs — see homepad's e2e note). A1–A14 are covered by
> vitest component tests driving dnd-kit's keyboard sensor and click/activation
> paths, which **is** the merge gate (build + vitest).

---

## 13. Open questions — RESOLVED (Caleb signed off 2026-06-13)

All five are decided. Recorded here for audit; the body of the spec (§7, D-table)
reflects the resolutions.

- **OQ1 — Where does the favorite toggle live now? → DECIDED: a per-tile "⋯"
  overflow menu** (option (b)), **not** a persistent star. Supersedes the earlier
  lean D5. One extra tap to favorite buys the cleanest resting tile (§7).
- **OQ2 — Cross-category drag or within-section only? → DECIDED: within-section
  reorder only in v10.** Cross-category move (re-foldering) is deferred to **v10.1**
  (D6).
- **OQ3 — Does category reorder leave the admin "Edit dashboard" surface? →
  DECIDED: yes — drag is the single reorder path.** Remove the
  `category-move-up`/`category-move-down` arrows from `CategoryManager` (rename +
  delete stay there); category reorder lives only as dashboard drag (§4).
- **OQ4 — Touch-drag affordance & desktop grip emphasis. → DECIDED: a visible grip
  handle** — always-on touch, subtle-on-desktop (faint at rest, bright on
  hover/focus). The handle is the single drag origin for all input modalities
  (§5.2).
- **OQ5 — dnd-kit dependency. → DECIDED: take it.** v10 adds `@dnd-kit/core` +
  `@dnd-kit/sortable` (D1) — they give the required keyboard + touch a11y for free.

---

## 14. Implementation notes (non-binding)

- Wrap each sortable region in a dnd-kit `DndContext` + `SortableContext`: one
  context for **categories** (the list of sections) and one **per section** for its
  tiles (vertical+horizontal grid sorting via `rectSortingStrategy`). Sensors:
  `PointerSensor` (activation distance ≈8px), `TouchSensor` (delay ≈200ms,
  tolerance), `KeyboardSensor` (the required keyboard path).
- Make `ServiceTile`'s grip the dnd-kit drag handle (`useSortable` `listeners` on the
  grip `<button>`, not the whole tile) so the `<a>` link stays clean (D2). Same for
  the category header grip.
- The order-diff → `setLayout` / `setCategoryOrder` mapping already exists in
  `Catalog.tsx` (`moveItem` / `moveCat` build the order array and PUT it with
  optimistic rollback) — **reuse that persistence + rollback logic**; only the
  *trigger* changes from arrow-onClick to dnd-kit `onDragEnd`. Keep within-section
  scoping (the old `sectionIds`).
- Delete: the `arrange` state in `App.tsx`, the `arrange` prop threaded through
  `Catalog`, the `move-up`/`move-down` and `category-move-up`/`category-move-down`
  buttons, and the `menu-settings` item + its `onToggleSettings` plumbing in
  `UserMenu.tsx`/`App.tsx`. (Surgical — remove only what arrange mode owned; leave
  `menu-edit` / `menu-admin-settings` / `CategoryManager` rename+delete intact,
  pending OQ3.)
- dnd-kit's built-in `announcements` cover most of §10; provide a custom
  `screenReaderInstructions` + announcement strings using the homepad voice and the
  "position j of n" numbers, wired to the `drag-live-region`.
- Reduced-motion: gate the slide/scale on a `prefers-reduced-motion` check (dnd-kit
  exposes drag transforms you can null out).

---

**Next ADD phase after sign-off:** test-writer → failing component tests for A1–A14,
RED→GREEN→REFACTOR→VERIFY, sliced to fit the ~15-min task cap (suggested: slice 1 =
remove arrange mode + arrows + Personal settings and relocate favoriting into the "⋯" overflow menu [A8/A9/A11];
slice 2 = tile drag + keyboard + persistence [A1/A2/A4/A5/A6/A7/A10/A12]; slice 3 =
category-section drag + responsive/touch/dark/a11y polish [A3/A13/A14]). Confirm
OQ1 (favorites home) and OQ5 (dnd-kit) **before** slice 1.
