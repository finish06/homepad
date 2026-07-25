# homepad v28 — Tile Drag-and-Drop Reorder in Edit Mode

**Spec ID:** SPEC-v28-tile-drag-reorder
**Created:** 2026-07-25
**Author:** Walt (product lead)
**Status:** Draft — awaiting Kare §8 design section
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

*This section is reserved for Kare's design pass (visual design of the tile drag grip:
placement, icon, size, active/dragging state, dark/light mode token usage). The spec
cannot be marked Ready-for-Build until this section is complete and co-signed.*

---

## Sign-offs

- [ ] **Walt** (product) — spec authored, spec approved
- [ ] **Kare** (design) — §8 complete, design co-signed

**Ready for Build:** when both sign-offs are present above.
