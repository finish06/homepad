# homepad v28 — Tile Drag-and-Drop Reorder in Edit Mode

**Spec ID:** SPEC-v28-tile-drag-reorder
**Created:** 2026-07-25
**Author:** Walt (product lead)
**Status:** Ready for Build — both sign-offs complete (2026-07-26)
**Repos:** `Code/homepad` (UI only — no API or DB changes required)
**Estimate:** ~4–6 hours Stitch
**Target version:** 15.5.0 (feature = minor, fully additive)
**Closes issues:** #393

---

## 1. Problem

Today the tiles inside each category box on the homepad dashboard have a fixed display
order. The order is determined by the server (`PUT /api/layout` records a personal
`user_layout.sort_index` per tile, and the Catalog launcher already lets a user drag
tiles into a new order and persist it). The **AppGrid edit mode** — the admin's "Edit
Dashboard" view toggled from the gear menu — **does not expose that reorder control**.
An admin in edit mode can rename and delete boxes, set a box's column width, and edit
individual tile metadata (v21 pencil), but cannot move a tile to a different slot within
its box.

**Caleb's direct request (2026-07-25):** "Improve homepad and allow re-arranging tiles
with drag and drop when in edit mode."

---

## 2. What already exists (ground truth before spec)

These facts constrain the build scope — Stitch should read them carefully:

- **`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`** are already listed in
  `package.json` as production dependencies and are already used in both `AppGrid.tsx`
  (category/box drag-and-drop) and `Catalog.tsx` (tile drag-and-drop within
  categories). No new dependency is introduced by this feature.
- **`PUT /api/layout`** already exists in homepad-api (`handleUpdateLayout`,
  `storage.SetLayout`). It accepts `{"order": ["id1", "id2", …]}` — the full ordered
  list of service IDs, position 0 first — and writes them to `user_layout.sort_index`
  per user. Returns 204 on success.
- **`setLayout(order: string[]) → Promise<boolean>`** already exists in `api.ts`.
  Returns `true` on 204, `false` otherwise. Already used by the Catalog reorder path.
- **`user_layout` table** (migration `0001_init.up.sql`) already stores per-user
  `sort_index` integers. The `GET /api/services` query already joins on it, ordering
  tiles by `ul.sort_index NULLS LAST, s.name`. All ordering infrastructure is in place.
- **`AppGrid.tsx` already uses the dnd-kit sensor recipe** for box reordering:
  `PointerSensor` (8px activation), `TouchSensor` (200ms delay, 5px tolerance),
  `KeyboardSensor` (with `sortableKeyboardCoordinates`). The same sensor config applies
  to tile reorder.
- **`Catalog.tsx` already implements within-category tile drag-and-drop** via a
  per-section `DndContext` + `SortableContext` + `arrayMove` pattern. This feature
  applies that same proven pattern inside AppGrid's edit mode, scoped to each box.

**Build scope conclusion:** This is a **frontend-only change to `AppGrid.tsx`** (and
possibly a small `index.css` addition for the tile grip's edit-mode style). No migration,
no new API endpoint, no changes to homepad-api.

---

## 3. Scope

### In scope
- **Within-box tile drag-and-drop in AppGrid edit mode.** When an admin enters "Edit
  Dashboard" mode (gear → Edit Dashboard), each tile inside a category box gains a drag
  grip handle. Dragging a tile within its box and releasing it reorders the tiles; the
  new order is persisted via `PUT /api/layout`.
- **Keyboard-accessible reorder path.** Space/Enter to pick up the tile grip, Arrow
  keys to move one slot, Space/Enter to drop, Escape to cancel. Required — drag-only
  reorder is an accessibility dead end.
- **Touch drag.** Long-press (200ms hold) on the grip lifts the tile; pan to the target
  slot, release to drop. Uses the existing `TouchSensor` config.
- **Optimistic update with rollback.** The UI reflects the new order immediately on
  drop; if `PUT /api/layout` fails, the order reverts and a brief error toast is shown
  (same pattern as box reorder and tile edit save).
- **`aria-live` announcements.** Reuse the existing `app-grid-announce` region already
  rendered at the AppGrid root (the one used for box reorder). Announce: pickup phrase,
  position-as-moving phrase, drop/cancel outcome.

### Out of scope
- **Cross-box (cross-category) tile drag.** Moving a tile from one box to another
  implies reassigning its category — an editorial action separate from reorder. Use the
  tile's pencil modal (v21) to change its category field. Each box's `DndContext` is
  its own isolated scope; cross-context drops are rejected by dnd-kit by default.
- **Global (admin-shared) tile order.** The persisted order is per-user via
  `user_layout` — each user arranges their own view independently. There is no "set
  this order for everyone" action in this feature.
- **Uncategorized box reorder.** The synthetic Uncategorized box (empty `id`) is
  already excluded from AppGrid's box sortable context. Tile reorder within the
  Uncategorized box follows the same pattern as named boxes (it is included in scope),
  but Uncategorized tiles can only be dragged within that box, not out.
- **Catalog launcher tile reorder.** Already shipped and working. Not touched.
- **Reorder outside edit mode.** Tile grips are absent from the DOM when `editing` is
  false — no zero-opacity ghost, no disabled button.
- **homepad-api changes.** No migration, no new endpoint, no struct changes.

---

## 4. UX Behavior

### 4.1 Entering drag mode (the grip)

Each tile in AppGrid edit mode gains a dedicated **drag grip** — a small interactive
`<button>` that is the *sole* drag origin for that tile. The grip must not compete for
tap/click area with:
- The tile's anchor `<a>` (the main service link, full tile body)
- The pencil edit button `app-grid-tool-edit` (bottom-right corner, v21)
- The favorite star `app-grid-tool-fav` (top-right corner)
- The status pip `app-grid-tool-status` (top-left, `pointer-events: none`)

Exact placement and styling of the grip are **Kare's §8 responsibility**. This spec
requires:
- It is a real `<button>` (keyboard operable, no `div`).
- It carries the `useSortable` `listeners` and `attributes` (not the tile wrapper).
- Its `aria-label` is `"Reorder {service.name}"`.
- It has `aria-pressed={isDragging}` to signal the picked-up state.
- It is absent from the DOM when `editing` is false (AC-001).

### 4.2 Drag lifecycle

1. **Lift** — pointer down (≥8px move), long-press (200ms), or Space/Enter on the grip.
   The tile gets an `is-grabbed` CSS class (opacity and/or subtle scale per Kare §8).
   The `DragOverlay` or dnd-kit's built-in placeholder shows where the tile will land.
2. **Move** — drag across the box's tile grid. A visual gap opens where the tile will
   be inserted. Auto-scroll engages when the pointer is within ~50px of the viewport
   edge (dnd-kit's default behavior via the `AutoScroll` modifier or its built-in
   equivalent).
3. **Drop** — release pointer, Space/Enter. Optimistic reorder fires immediately;
   `PUT /api/layout` is called with the full new ID order. On success: order persists.
   On failure: order reverts to pre-drag state and a brief error toast appears
   ("Could not save the new tile order.").
4. **Cancel** — Escape key, or pointer moved outside all droppable areas. Order reverts
   to pre-drag state. No API call is made.

Tiles in the same box that are NOT being dragged shift smoothly to fill the gap
(dnd-kit CSS `transition` on the `transform`).

### 4.3 Keyboard path (mandatory)

Focus the grip `<button>` via Tab (grip is in the normal tab order in edit mode).

| Key             | Action                                                  |
|-----------------|--------------------------------------------------------|
| Space / Enter   | Pick up the tile (announces position + instructions)   |
| ArrowUp / Left  | Move one slot toward the start of the box              |
| ArrowDown / Right | Move one slot toward the end of the box             |
| Space / Enter   | Drop the tile at the current slot (persists)           |
| Escape          | Cancel and return to original position                 |

`aria-live` announcements on each key event:
- **Pickup:** `"{name} grabbed, position {i} of {n}. Use arrow keys to move, space to
  drop, escape to cancel."`
- **Move:** `"{name} moved to position {j} of {n}."`
- **Drop:** `"{name} dropped at position {j} of {n}."`
- **Cancel:** `"Reorder cancelled."`
- **Persist failure:** `"Could not save the new tile order."`

### 4.4 Concurrency / multi-user

`user_layout` is per-user. Each user's reorder writes only their own rows. Two admins
reordering simultaneously each write their own layout; they do not collide. Last write
wins within a single user's session (the full array is sent on every drop). This is
acceptable for a homelab with a small user base.

---

## 5. Technical Design

### 5.1 Per-box DndContext isolation

Each named category box and the Uncategorized box wraps its tile grid in its own
`DndContext`. The sensor config is **identical** to the existing box reorder:

```ts
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
);
```

This per-box isolation means dnd-kit cannot route a drop across box boundaries —
cross-box drag is structurally impossible, not just prevented by guard logic.

### 5.2 SortableTile wrapper

Introduce a `SortableTile` component analogous to the existing `SortableBox`:

```ts
function SortableTile({ service, ...props }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef,
          transform, transition, isDragging } = useSortable({ id: service.id });
  return (
    <ToolLink
      service={service}
      sortable={{ attributes, listeners, setNodeRef, setActivatorNodeRef,
                  transform, transition, isDragging }}
      {...props}
    />
  );
}
```

`ToolLink` already accepts `editing`; extend its props to also accept an optional
`sortable` bag (same shape as `BoxSortable`) that it applies to the wrapper `div` and
hands the grip `<button>` when present.

### 5.3 Reorder handler and persistence

The `onTileDragEnd` handler lives at the AppGrid level (where `updateSvcs` / the shared
services array lives). It mirrors `onDragEnd` (the box reorder handler):

```ts
const onTileDragEnd = useCallback(async (e: DragEndEvent) => {
  const { active, over } = e;
  if (!over || active.id === over.id) return;
  const prev = svcs ?? [];
  const gi = prev.findIndex(s => s.id === active.id);
  const gj = prev.findIndex(s => s.id === over.id);
  if (gi < 0 || gj < 0) return;
  const next = arrayMove(prev, gi, gj);
  updateSvcs(() => next);
  const name = prev[gi].name;
  const pos = next.findIndex(s => s.id === active.id) + 1;
  setAnnounce(`${name} dropped at position ${pos}.`);
  const ok = await setLayout(next.map(s => s.id));
  if (!ok) {
    updateSvcs(() => prev);
    setAnnounce('Could not save the new tile order.');
    setToast({ msg: 'Could not save the new tile order.', kind: 'error' });
  }
}, [svcs, updateSvcs]);
```

The full service array (across all categories) is sent, which is exactly what
`PUT /api/layout` expects — it stores per-service sort indices that the `GET
/api/services` query uses, and the per-category grouping is unaffected.

### 5.4 BoxCard integration

In edit mode, `BoxCard`'s `app-grid-tools` `<div>` is replaced by:

```tsx
<DndContext sensors={sensors} collisionDetection={closestCenter}
            onDragEnd={onTileDragEnd}>
  <SortableContext items={box.tools.map(s => s.id)} strategy={rectSortingStrategy}>
    {box.tools.map(s =>
      <SortableTile key={s.id} service={s} theme={theme} editing={editing}
                    onToggleFavorite={onToggleFavorite} onEdit={onEdit}
                    onOpenIframe={onOpenIframe} showUptimeDisplay={showUptimeDisplay} />
    )}
  </SortableContext>
</DndContext>
```

In non-edit mode, tiles render as plain `ToolLink` elements (no `DndContext`, no
sortable wiring), unchanged from today.

### 5.5 No new API surface

`setLayout` and `PUT /api/layout` are unchanged. No new calls are introduced. The
existing whole-array contract is used on every tile drop.

---

## 6. Acceptance Criteria

**AC-001 — Grip is edit-mode-only.** When `editing` is false, the tile drag grip
`<button>` is absent from the DOM (not hidden, not disabled — not present). A
non-admin user in view mode sees no drag affordance.

**AC-002 — Lift on pointer drag.** In edit mode, pressing and moving ≥8px on the tile
grip initiates a drag. The dragged tile gets the `is-grabbed` class. Other tiles in the
same box shift to show a placeholder gap at the prospective drop slot.

**AC-003 — Lift on long-press (touch).** In edit mode, pressing and holding the grip for
200ms on a touch device initiates a drag without triggering page scroll.

**AC-004 — Keyboard pickup.** Tabbing to the grip `<button>` and pressing Space (or
Enter) picks up the tile. An `aria-live` announcement states position and instructions.

**AC-005 — Keyboard move.** While a tile is picked up, ArrowDown/Right moves it one
slot toward the end; ArrowUp/Left moves it one slot toward the start. Each move
announces the new position.

**AC-006 — Keyboard drop.** Pressing Space (or Enter) while a tile is picked up drops
it at the current slot. The drop is announced. `PUT /api/layout` is called with the new
order.

**AC-007 — Keyboard cancel.** Pressing Escape while a tile is picked up returns it to
its original position. No API call is made. "Reorder cancelled." is announced.

**AC-008 — Drop persists.** After a successful drag drop, `PUT /api/layout` is called
exactly once with the complete ordered list of all service IDs (across all categories,
per the existing `setLayout` contract). The response is 204.

**AC-009 — Optimistic rollback on failure.** If `PUT /api/layout` returns a non-204
status, the tile order reverts to its pre-drag state and a brief error toast ("Could not
save the new tile order.") appears at bottom-right. The announcement region carries the
error text for screen-reader users.

**AC-010 — Within-box only.** A tile cannot be dragged from one category box to
another. Releasing a tile outside its own box (or over another box's tile) returns it to
its original slot (cancel behavior). No API call is made.

**AC-011 — Uncategorized box included.** Tiles in the Uncategorized box are reorderable
within that box by the same mechanism.

**AC-012 — Pencil and star unaffected.** In edit mode, the pencil (`app-grid-tool-edit`,
bottom-right) and favorite star (`app-grid-tool-fav`, top-right) remain clickable with
no conflict from the grip. Clicking the pencil while not dragging still opens the
`TileEditModal`. Clicking the star still toggles the favorite.

**AC-013 — Non-edit-mode tiles unchanged.** Tiles outside edit mode render identically
to today — no added DOM nodes, no behavior change.

**AC-014 — Reduced motion.** Under `prefers-reduced-motion: reduce`, transition
animations on shifting tiles are disabled (or instant). The grip, keyboard path, and
persistence are unaffected.

**AC-015 — Order visible immediately.** After a drop (before the API response), the UI
shows the new order. There is no momentary revert-then-restore flicker.

**AC-016 — Order persists across reload.** After a successful `PUT /api/layout`, a page
reload (which calls `GET /api/services`) returns tiles in the saved order.

**AC-017 — Empty box safe.** A box with 0 tiles renders its empty state unchanged; the
`DndContext` wrapper in edit mode is a no-op and introduces no visual difference.

**AC-018 — Single-tile box safe.** A box with exactly 1 tile shows the grip (the tile
can be focused but has nowhere to move). Drag events fire and resolve to a no-op; no
crash.

**AC-019 — Announce region.** The `aria-live="polite"` region (already rendered at
`app-grid-announce`) carries tile-reorder announcements. Existing box-reorder
announcements are unchanged.

---

## 7. Open Questions for Caleb

None at this time — the request is unambiguous (drag-to-reorder tiles in edit mode),
the scope boundaries (within-box only, per-user ordering) match the existing model, and
no product direction decisions are outstanding.

---

## 8. Design — Kare's section

**Author:** Kare (design/UX) · **Date:** 2026-07-25 · **Verified:** rendered on the
*built* frontend (local vite, mocked API), glass tiles at both themes, deviceScaleFactor 2.
All contrast numbers below are **sampled from the true composited pixel** (glass blur +
accent gradient baked in) at the grip's corner, not computed from token math — see §8.7.

Reference renders (proposed grip in place, bottom-left, beside the pencil bottom-right;
tile #2 shown in its lifted `is-grabbed` state):

- `specs/assets/v28-tile-drag/grip-light.png`
- `specs/assets/v28-tile-drag/grip-dark.png`

### 8.0 Design intent

Reorder is a *calm, discoverable* affordance, not a loud one. In edit mode the tile
already carries three corner controls plus the accent edit-outline; the grip must join
that cluster as a fourth, balanced corner — legible enough to invite a drag, quiet enough
not to compete with the pencil (the primary per-tile action) or the icon/label. It reuses
the **exact construction** of the shipped box grip (`app-grid-box-grip`) and per-tile
pencil (`app-grid-tool-edit`) so it reads as part of the same edit-mode language — with
**one measured correction**: the box grip's *colors* cannot be copied onto the glass tile
(§8.7), so the grip takes the box-grip slate pair **swapped by theme**.

### 8.1 Placement — the free corner

The tile (`.app-grid-tool-wrap`, `position: relative`; the tile body is 190×124px) has
four corners, three already occupied:

| Corner        | Occupant                                   | Interactive? |
|---------------|--------------------------------------------|--------------|
| top-left      | status pip `.app-grid-tool-status` (8/8)   | no (`pointer-events: none`) |
| top-right     | favorite star `.app-grid-tool-fav` (4/4)   | yes |
| bottom-right  | pencil `.app-grid-tool-edit` (4/4)         | yes (edit mode) |
| **bottom-left** | **— free —**                             | — |

→ **The drag grip lives bottom-left**, anchored `bottom: 4px; left: 4px`. This makes it
the **horizontal mirror of the pencil** (bottom-right), exactly as the pencil (v21) mirrors
the star. The two bottom-corner controls become a matched *edit-mode pair*: reorder on the
left, edit on the right.

**Measured tap clearance (no collision):** grip painted glyph 34×34 at `left:4` → hit-area
centre at `x ≈ left+21`; pencil painted 34×34 at `right:4` → hit-area centre at
`x ≈ right−21`. On the 190px tile the two 44px hit boxes span `[left−1, left+43]` and
`[right−43, right+1]` — a **~148px gap between centres**, zero overlap. The grip sits below
the status pip (top-left) with the full tile height between them. AC-012 (pencil/star
unaffected) is satisfied by geometry, not guard logic.

### 8.2 The grip — construction, icon, touch target

A real `<button>` (per §4.1), built like the pencil/star — a 34×34 **painted** glyph with
a transparent, centred **44×44 `::before`** that extends only the *hit area*, so the glyph
never moves and the ≥44×44 touch rule (design-principle 3) is met with **0px layout shift**:

```css
.app-grid-tool-grip {
  position: absolute; bottom: 4px; left: 4px;
  display: inline-flex; align-items: center; justify-content: center;
  width: 34px; height: 34px;
  border: none; background: transparent;
  color: #64748b;                    /* LIGHT rest — slate-500, see §8.7 */
  font-size: 18px; line-height: 1;   /* same glyph size as the box grip */
  border-radius: 999px;
  cursor: grab; touch-action: none;  /* touch-action:none so a drag doesn't fight scroll */
  opacity: 1;                        /* NOT hover-gated — see §8.2 note */
  transition: color 120ms ease, background 120ms ease;
}
.app-grid-tool-grip::before {        /* invisible 44×44 hit area, centred on the 34px glyph */
  content: ''; position: absolute; top: 50%; left: 50%;
  transform: translate(-50%, -50%); width: 44px; height: 44px;
}
.app-grid-tool-grip:hover        { color: #475569; background: rgba(15,23,42,0.06); }
.app-grid-tool-grip:focus-visible{ outline: none; box-shadow: 0 0 0 2px #4f46e5; }
.app-grid-tool-grip[aria-pressed='true'] { color: #4f46e5; cursor: grabbing; }

.dark .app-grid-tool-grip                 { color: #94a3b8; }  /* DARK rest — slate-400 */
.dark .app-grid-tool-grip:hover           { color: #cbd5e1; background: rgba(255,255,255,0.08); }
.dark .app-grid-tool-grip:focus-visible   { box-shadow: 0 0 0 2px #818cf8; }
.dark .app-grid-tool-grip[aria-pressed='true'] { color: #818cf8; }
```

- **Icon:** the braille **`⠿` (U+283F)** — the *same* glyph as the shipped box grip, so
  the drag-handle metaphor is one symbol system-wide. No new icon asset.
- **Touch target:** 44×44 via the `::before` (design-principle 3), glyph fixed at 34×34.
- **Focus ring / pressed accent:** the grip's accent is the **pencil's theme-aware indigo**
  (`#4f46e5` light / `#818cf8` dark), *not* the box grip's `#6366f1`. This is deliberate:
  the grip lives among the tile's edit affordances, so it joins the *tile-edit* accent
  family (pencil, edit-outline) rather than the box-header family. Measured: focus ring
  `#4f46e5` on the light tile = **6.2:1**; `#818cf8` on the dark tile = **4.8:1** — both
  clear the 3:1 non-text floor (the flat `#4f46e5` would fail at **2.3:1** on the dark
  tile, which is exactly why the pencil already swaps to `#818cf8` in dark).

**Note — always visible, never hover-gated (touch-first).** The star and pencil are
*revealed* on `.app-grid-tool-wrap:hover`. The grip is **not** — it rests at full opacity
whenever `editing` is true. This homelab is iPad/phone-first (CLAUDE.md); touch has no
hover, and a keyboard user must be able to Tab to a grip they can see. A hover-revealed
drag handle is undiscoverable on the exact devices this feature targets.

**Note — calm via colour, not opacity.** The grip rests at `opacity: 1`; its low emphasis
comes from the *mid-slate token*, not a dimmed alpha. This is a homepad lesson learned:
dimming an affordance with `opacity` erodes its measured contrast against the glass (the
idle-tile `opacity:.52` that killed meta-text contrast in v15). The grip stays calm because
slate-500/400 *is* calm, while still sitting at 4.7:1 / 5.6:1 (§8.7).

**Absent when not editing (AC-001/013).** The grip `<button>` is rendered only when
`editing` is true — no zero-opacity ghost, no disabled node — mirroring the pencil.

### 8.3 Lifted / dragging state (`is-grabbed`)

While a tile is picked up it must read as **lifted toward the user** — clearly above its
resting siblings, and unmistakably *not* an error (no red, no heavy fade). The box already
defines `is-grabbed` (opacity 0.9 + elevation); the tile extends that with a **hair of
scale** for a stronger "picked up" read, applied to the **inner `.app-grid-tool`** (not the
wrapper — dnd-kit owns the wrapper's `transform` for translation, so scaling the child
avoids clobbering the drag translate):

```css
.app-grid-tool-wrap.is-grabbed { z-index: 5; }              /* float above siblings */
.app-grid-tool-wrap.is-grabbed .app-grid-tool {
  transform: scale(1.03);                                    /* subtle lift, not a jump */
  box-shadow: 0 14px 32px var(--v-shadow), inset 0 1px 0 var(--v-tilehi);
  border-color: #4f46e5;                                     /* edit accent; #818cf8 in dark */
  cursor: grabbing;
}
.dark .app-grid-tool-wrap.is-grabbed .app-grid-tool { border-color: #818cf8; }
```

- **Distinct from rest:** elevation (14/32 shadow vs the resting 6/20) + `scale(1.03)` +
  accent border. The 2px inset edit-outline stays underneath, so the tile still reads as
  editable.
- **Never an error:** opacity stays at/near full; the only colour added is the edit accent
  (indigo), never a status red. Design-principle 6 (motion has purpose): the scale is a
  1.03 lift, not decoration.
- Non-dragged siblings in the same box shift with dnd-kit's `transform` transition
  (rectSortingStrategy) to open the gap (§8.4).

### 8.4 Drop placeholder gap

As the dragged tile moves, its origin slot must read as *"a tile will land here"* — an
empty gap on glass otherwise looks like a *missing* tile, not a target. The vacated slot
shows an explicit placeholder occupying the full **190×124 tile footprint**, at the tile
radius, in the edit accent:

```css
.app-grid-tool-placeholder {
  min-height: 120px;                       /* same footprint as a tile (A1 min-height) */
  border-radius: var(--r-tile);            /* 18px — matches tiles */
  border: 2px dashed #4f46e5;              /* edit accent; #818cf8 in dark */
  background: rgba(79, 70, 229, 0.07);     /* faint accent wash */
}
.dark .app-grid-tool-placeholder {
  border-color: #818cf8;
  background: rgba(129, 140, 248, 0.10);
}
```

The dashed accent outline ties the gap to the same edit-mode indigo as the grip's grabbed
state and the edit-outline — one accent, one language. It is a **non-text** marker (a
target region), so 3:1 is the bar; the `#4f46e5`/`#818cf8` border clears it (6.2:1 / 4.8:1
per §8.7). If the build uses dnd-kit's in-place shift instead of a rendered placeholder
node, the sibling gap must still be legible — but the explicit placeholder is the
recommended, on-brand treatment.

### 8.5 Reduced-motion variant (AC-014)

Under `prefers-reduced-motion: reduce`, **motion is removed but every state cue stays** —
the lifted tile and the drop target are still fully distinguishable *statically*:

```css
@media (prefers-reduced-motion: reduce) {
  /* sibling tiles snap to their new slots — no sliding animation */
  .app-grid-tool-wrap { transition: none !important; }
  /* drop the scale (a motion cue); keep elevation + accent border (static cues) */
  .app-grid-tool-wrap.is-grabbed .app-grid-tool { transform: none; }
  .app-grid-tool-grip { transition: none; }
}
```

- Tiles **snap** to their reordered positions instead of sliding (dnd-kit `transition`
  suppressed).
- The lifted state drops `scale(1.03)` (the animated cue) but **keeps the elevated shadow
  and accent border**, so a reduced-motion user still sees which tile is grabbed.
- The placeholder appears instantly (no fade).
- Per AC-014, the grip, keyboard path, and persistence are untouched.

### 8.6 States coverage (design-principle 5)

| State | Treatment |
|-------|-----------|
| Grip at rest (edit mode) | slate glyph, opacity 1, `cursor: grab` |
| Grip hover | brighter slate + faint pill background |
| Grip focus (keyboard) | 2px accent focus ring (`#4f46e5` / `#818cf8`) |
| Grip pressed / picked up | accent glyph + `cursor: grabbing`, `aria-pressed=true` |
| Tile lifted | elevation + `scale(1.03)` + accent border (`is-grabbed`) |
| Drop target slot | dashed accent placeholder, tile footprint |
| Empty box (0 tiles, AC-017) | unchanged empty state; no grip, no placeholder |
| Single-tile box (AC-018) | grip present, focusable; drag resolves to a no-op |
| Reduced motion | all of the above, minus animation (§8.5) |
| Non-edit mode / non-admin (AC-001/013) | grip absent from DOM entirely |
| Save failure (AC-009) | order reverts + bottom-right error toast (existing toast style) |

### 8.7 Contrast — measured, both themes (design-principle 1)

The grip is a **non-text UI affordance** → WCAG **1.4.11, 3:1** floor. The glass tile
background is not a fixed colour; it is `--v-tile` composited over the accent gradient, so
I sampled the **true composited pixel** at the grip corner (bottom-left inner) from the
built frontend at both themes (`v28-grip-pixel.js`):

**Light — grip-corner bg sampled `rgb(254,254,255)`:**

| Candidate | Ratio | 3:1 |
|-----------|-------|-----|
| slate-300 `#cbd5e1` | 1.47:1 | ✗ |
| slate-400 `#94a3b8` (box grip's *light* colour) | **2.54:1** | ✗ |
| **slate-500 `#64748b`** ← chosen rest | **4.72:1** | ✓ |
| slate-600 `#475569` ← chosen hover | 7.52:1 | ✓ |

**Dark — grip-corner bg sampled `rgb(40,41,54)`:**

| Candidate | Ratio | 3:1 |
|-----------|-------|-----|
| slate-300 `#cbd5e1` ← chosen hover | 9.68:1 | ✓ |
| **slate-400 `#94a3b8`** ← chosen rest | **5.61:1** | ✓ |
| slate-500 `#64748b` | 3.02:1 | ✓ (tight) |
| slate-600 `#475569` | 1.90:1 | ✗ |

**Finding baked into the design:** the box grip's *light* colour **`#94a3b8` fails on the
glass tile at 2.54:1** — the glass tile is a *brighter* surface than the box header the box
grip sits on. So the tile grip takes the **box-grip slate pair swapped by theme**: rest
`#64748b` (light, 4.72:1 — clears even the 4.5:1 text bar) / `#94a3b8` (dark, 5.61:1); hover
`#475569` (7.52:1) / `#cbd5e1` (9.68:1). The pressed/focus accent (`#4f46e5` / `#818cf8`)
and the placeholder border clear 3:1 in both themes (§8.2). **Every resting, hover, focus,
and grabbed colour is ≥3:1 on the composited glass — no contrast defect ships.**

*Method:* `v28-grip-pixel.js` (pixel-accurate composited sample) + `v28-grip-mock.js`
(the reference renders above). Both retained in `/home/kare/work`.

### 8.8 Design system note

No new tokens are introduced — the grip reuses the existing slate scale (`#64748b`,
`#94a3b8`, `#475569`, `#cbd5e1`), the tile-edit accent (`#4f46e5`/`#818cf8`), the tile radius
(`--r-tile`), and the shipped 34×34-glyph-in-44×44-hit construction. The one *pattern*
addition — a per-tile drag grip in the bottom-left corner — folds into the App Grid section
of the design system as the fourth tile corner affordance; I will update `SPEC-app-grid.md`
/ the design-system App Grid entry when this ships.

---

## Sign-offs

- [x] **Walt** (product) — spec authored, spec approved · **2026-07-26** · product **APPROVE**. Caleb's request met, 19 ACs testable, Kare §8 complete with contrast measured from composited pixel.
- [x] **Kare** (design) — §8 complete, design co-signed · **2026-07-25** · design **GO**.
  Grip placed bottom-left (mirror of the pencil), braille `⠿`, 44×44 hit target, colours
  measured ≥3:1 on the composited glass in both themes (§8.7). No new tokens.

**Ready for Build:** when both sign-offs are present above.
