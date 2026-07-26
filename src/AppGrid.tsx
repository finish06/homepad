import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  categories as fetchCategories,
  createCategory,
  deleteCategory,
  renameCategory,
  saveCategoryWidth,
  setCategoryOrder,
  setFavorite,
  setLayout,
  services as fetchServices,
  type Category,
  type Service,
  type ServiceStatus,
} from './api';
import { boxesFromData, boxWidthPx, contentMaxPx, fitsViewport, frameContentPx, MAX_WIDTH, moveCategory, rowFillCounts, type Box } from './appGrid';
import { iconSrc, initialBadge } from './icons';
import { useServicesContext } from './services';
import { useResolvedTheme } from './theme';

// v14.0.1 optimize — both overlays mount only on a user action (open a tile's
// Edit modal, or open a clickAction='iframe' tile), never during the grid's
// initial render, so they are code-split into their own async chunks. Suspense
// fallback is null: each renders its own fixed backdrop, so the sub-frame gap
// before its small chunk resolves is imperceptible.
const TileEditModal = lazy(() => import('./TileEditModal'));
const IframeOverlay = lazy(() => import('./IframeOverlay'));

// AppGrid (SPEC-app-grid, Amendment A1) — the primary dashboard layout: glass
// boxes (= categories) that pack left→right with flex-wrap. Each box's width
// (1–8) drives ONLY its content width via one `--w` CSS variable; the tool tiles
// inside are a FIXED 190px auto-fill track, so a tile is the same width in every
// box (Caleb's invariant, AC-001-A1). The flex-wrap page pack and the ≤640px
// 2-column cap are pure CSS (index.css `.app-grid`). This component owns the data
// fetch, the admin width selector, and the "+ Add box" flow. It replaces the v14
// floating-panel Catalog layout (§2).

const WIDTHS = Array.from({ length: MAX_WIDTH }, (_, i) => i + 1); // [1..8]

// SPEC-pane-fill-reflow (Phase 1, R4) / SPEC-ultrawide-fluid-frame (Phase 1b) —
// the shared CONTENT_WIDTH frame is `max-w-[max(1536px,92vw)] px-4` (layout.ts):
// capped at 1536px on standard desktops, fluid 92vw on wider monitors. Lone-box
// detection bin-packs the boxes' --w floors into that width via frameContentPx
// (src/appGrid.ts), the JS mirror of the CSS token.

// useViewportWidth tracks window.innerWidth so the width selector can offer a
// --w that would render off-screen as DISABLED (A1 D-3). The ≤640px mobile
// behavior itself is pure CSS now (D-4) — no JS width cap is needed.
function useViewportWidth(): number {
  const [vw, setVw] = useState(() => window.innerWidth || 1024);
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return vw;
}

export default function AppGrid({
  isAdmin,
  editMode = false,
  showUptimeDisplay = true,
}: {
  isAdmin: boolean;
  editMode?: boolean;
  // cap6 — the global admin toggle for the per-tile uptime line. Defaults to ON
  // (opt-out) so existing callers and the pre-fetch initial render are unchanged.
  showUptimeDisplay?: boolean;
}) {
  // Services come from the shared provider (the SAME array the launcher + live
  // poll use — §3/A12); AppGrid self-fetches only when rendered without a
  // provider (isolated tests). Categories (box list + widths) AppGrid owns.
  const ctx = useServicesContext();
  const [cats, setCats] = useState<Category[]>([]);
  const [catsLoaded, setCatsLoaded] = useState(false);
  const [ownSvcs, setOwnSvcs] = useState<Service[] | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  // aria-live announcement for the drag-to-reorder a11y path (mirrors the old
  // Catalog category reorder — §10/A7).
  const [announce, setAnnounce] = useState('');
  const viewportWidth = useViewportWidth();
  const gridTheme = useResolvedTheme();
  // v21 — the tile whose edit modal is open (with the pencil that opened it, for
  // focus return, AC-013), plus a small imperative toast for Save success/error
  // (AC-014/015). editMode is admin-only upstream, so the pencil never renders
  // for a non-admin — the modal is unreachable without the affordance.
  const [editTarget, setEditTarget] = useState<{ service: Service; opener: HTMLElement | null } | null>(null);
  const [toast, setToast] = useState<{ msg: string; kind: 'success' | 'error' } | null>(null);
  // v23 — the service whose IframeOverlay is open (clickAction='iframe'), or null.
  const [iframeTarget, setIframeTarget] = useState<Service | null>(null);
  const openIframe = useCallback((service: Service) => setIframeTarget(service), []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // Sensors for box drag-to-reorder (Edit Dashboard). Pointer with an 8px
  // activation so a click on a width button still registers; touch with a
  // press-hold so a drag doesn't fight page scroll; keyboard (the REQUIRED a11y
  // path) with the sortable coordinate getter. Same recipe as the retired Catalog.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    let alive = true;
    fetchCategories().then((c) => {
      if (!alive) return;
      setCats(c);
      setCatsLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (ctx) return; // provider owns the services load
    let alive = true;
    fetchServices().then((s) => alive && setOwnSvcs(s));
    return () => {
      alive = false;
    };
  }, [ctx]);

  const svcs = ctx ? ctx.items : ownSvcs;
  const loading = !catsLoaded || svcs === null;

  // Update the services the grid renders from. When a provider is present it owns
  // the array (the SAME one the launcher's Favorites section filters — §3/A12), so
  // a favorite flip written here shows up in the launcher live; without a provider
  // (isolated render) AppGrid owns its own copy.
  const updateSvcs = useCallback(
    (updater: (list: Service[]) => Service[]) => {
      if (ctx) ctx.setItems((cur) => (cur ? updater(cur) : cur));
      else setOwnSvcs((cur) => (cur ? updater(cur) : cur));
    },
    [ctx],
  );

  // v21 — open the edit modal for a tile, remembering the pencil that opened it.
  const openEdit = useCallback(
    (service: Service, opener: HTMLElement | null) => setEditTarget({ service, opener }),
    [],
  );
  // Close and return focus to the opening pencil (AC-013), after the modal unmounts.
  const closeEdit = useCallback(() => {
    const opener = editTarget?.opener;
    setEditTarget(null);
    if (opener) requestAnimationFrame(() => opener.focus());
  }, [editTarget]);
  // Merge a saved/live change into the shared service so the tile updates inline
  // without a reload (AC-004/007/009) — the same array the launcher reads (§3/A12).
  const patchService = useCallback(
    (id: string, partial: Partial<Service>) =>
      updateSvcs((list) => list.map((s) => (s.id === id ? { ...s, ...partial } : s))),
    [updateSvcs],
  );

  // #240 — per-tile favorite toggle (restores the control the old Catalog ⋯ menu
  // had). Optimistic pin/unpin with rollback on a failed POST/DELETE; `next` is
  // captured up front so the persist can't send a stale value (the favorites bug
  // fixed in Catalog). Mirrors into the shared services so the launcher stays live.
  const onToggleFavorite = useCallback(
    async (id: string) => {
      const current = (svcs ?? []).find((s) => s.id === id);
      if (!current) return;
      const next = !current.favorite;
      updateSvcs((list) => list.map((s) => (s.id === id ? { ...s, favorite: next } : s)));
      const ok = await setFavorite(id, next);
      if (!ok) {
        updateSvcs((list) => list.map((s) => (s.id === id ? { ...s, favorite: !next } : s)));
      }
    },
    [svcs, updateSvcs],
  );

  // Optimistic width change: update local state immediately (AC-015 — no
  // reload), persist, and roll back on failure (§4A persist).
  const changeWidth = useCallback(
    async (id: string, width: number) => {
      let prev = 3;
      setCats((cs) =>
        cs.map((c) => {
          if (c.id === id) prev = c.gridWidth ?? 3;
          return c.id === id ? { ...c, gridWidth: width } : c;
        }),
      );
      const ok = await saveCategoryWidth(id, width);
      if (!ok) {
        setCats((cs) => cs.map((c) => (c.id === id ? { ...c, gridWidth: prev } : c)));
      }
    },
    [],
  );

  // Commit a box (category) reorder on drop: move the dragged box into the
  // target's slot and persist the whole new id order via PUT /api/categories/order
  // — the same whole-array contract the old Catalog reorder + v7 arrows used.
  // moveCategory renumbers sortIndex so boxesFromData renders the new order.
  // Optimistic with rollback if the PUT fails. The synthetic Uncategorized box
  // (empty id) is outside the sortable context, so it can't be a drag source or
  // target here.
  const onDragEnd = useCallback(
    async (e: DragEndEvent) => {
      const { active, over } = e;
      if (!over || active.id === over.id) return;
      const prev = cats;
      const next = moveCategory(prev, active.id as string, over.id as string);
      if (next === prev) return;
      setCats(next);
      const name = prev.find((c) => c.id === active.id)?.name ?? 'Box';
      const pos = next.findIndex((c) => c.id === active.id) + 1;
      setAnnounce(`${name} moved to position ${pos} of ${next.length}.`);
      const ok = await setCategoryOrder(next.map((c) => c.id));
      if (!ok) {
        setCats(prev);
        setAnnounce('Could not save the new order.');
      }
    },
    [cats],
  );

  // v28 (SPEC-v28-tile-drag-reorder §5.3) — commit a within-box tile reorder on
  // drop. `active`/`over` are tiles in the SAME box (each box is its own
  // DndContext, so cross-box drops can't happen — AC-010). arrayMove moves the
  // dragged tile into the target's slot in the FULL services array and persists
  // the whole new id order via PUT /api/layout — the existing whole-array
  // setLayout contract (AC-008); every other tile's relative order is preserved,
  // so sibling boxes are untouched. Optimistic (AC-015) with rollback + an error
  // toast if the PUT fails (AC-009); the pre-move snapshot is captured up front so
  // rollback can't race a render. The success announcement is set box-locally (it
  // needs the within-box position) — see BoxCard's onTileDrop.
  const onTileDragEnd = useCallback(
    async (e: DragEndEvent) => {
      const { active, over } = e;
      if (!over || active.id === over.id) return;
      const prev = svcs ?? [];
      const gi = prev.findIndex((s) => s.id === active.id);
      const gj = prev.findIndex((s) => s.id === over.id);
      if (gi < 0 || gj < 0) return;
      const next = arrayMove(prev, gi, gj);
      updateSvcs(() => next);
      const ok = await setLayout(next.map((s) => s.id));
      if (!ok) {
        updateSvcs(() => prev);
        setAnnounce('Could not save the new tile order.');
        setToast({ msg: 'Could not save the new tile order.', kind: 'error' });
      }
    },
    [svcs, updateSvcs],
  );

  // #241 — box (category) rename. Optimistic name swap, then reconcile to the
  // server's canonical name; roll back + surface the error inline on a rejection
  // (409 duplicate etc.). Returns true or the error string for the row to show.
  const onRenameBox = useCallback(
    async (id: string, name: string): Promise<true | string> => {
      const prev = cats;
      setCats((cs) => cs.map((c) => (c.id === id ? { ...c, name } : c)));
      const r = await renameCategory(id, name);
      if (!r.ok) {
        setCats(prev);
        return r.error ?? 'Could not rename box';
      }
      if (r.category) {
        setCats((cs) => cs.map((c) => (c.id === id ? { ...c, name: r.category!.name } : c)));
      }
      return true;
    },
    [cats],
  );

  // #241 — box delete. The FK is ON DELETE SET NULL server-side, so the box's
  // apps fall back to Uncategorized — none are deleted. Optimistically drop the
  // box AND re-home its apps in the shared services (clear categoryId) so they
  // render under Uncategorized live instead of vanishing until a reload; roll
  // both back if the DELETE fails.
  const onDeleteBox = useCallback(
    async (id: string): Promise<boolean> => {
      const prevCats = cats;
      const prevSvcs = svcs;
      setCats((cs) => cs.filter((c) => c.id !== id));
      updateSvcs((list) => list.map((s) => (s.categoryId === id ? { ...s, categoryId: null } : s)));
      const ok = await deleteCategory(id);
      if (!ok) {
        setCats(prevCats);
        if (prevSvcs) updateSvcs(() => prevSvcs);
      }
      return ok;
    },
    [cats, svcs, updateSvcs],
  );

  const onCreate = useCallback(async (title: string) => {
    const r = await createCategory(title);
    if (r.ok && r.category) {
      setCats((cs) => [...cs, { ...r.category!, gridWidth: r.category!.gridWidth ?? 3 }]);
      setAddOpen(false);
      return true;
    }
    return r.error ?? 'Could not create box';
  }, []);

  if (loading) {
    return (
      <div className="app-spinner" role="status" aria-live="polite" data-testid="app-grid-loading">
        <span className="sr-only">Loading dashboard…</span>
      </div>
    );
  }

  const boxes = boxesFromData(cats, svcs ?? []);
  // R4 — mark boxes alone in their visual row so BoxCard lifts their cap to 100%.
  // Bin-pack the boxes' --w floors into the current .app-grid content width; a row
  // of one is a lone box. Recomputes on viewportWidth + boxes changes (both already
  // drive re-render), so it tracks resizes and width-selector edits live.
  const contentWidth = frameContentPx(viewportWidth);
  const rowCounts = rowFillCounts(boxes.map((b) => boxWidthPx(b.width)), contentWidth);
  const loneById = new Map(boxes.map((b, i) => [b.id, rowCounts[i] === 1]));
  // Edit Dashboard is admin-only + client-ephemeral (a reload returns to view
  // mode). Only REAL category boxes rearrange; the synthetic Uncategorized box
  // (empty id) stays pinned last, outside the sortable context.
  const editing = isAdmin && editMode;
  const sortableBoxes = boxes.filter((b) => b.id !== '');
  const uncatBox = boxes.find((b) => b.id === '');

  const addButton = isAdmin && (
    <button
      type="button"
      className="app-grid-add"
      data-testid="add-box"
      onClick={() => setAddOpen(true)}
    >
      + Add box
    </button>
  );

  return (
    <>
      <div
        className={`app-grid${editing ? ' is-editing' : ''}`}
        data-testid="app-grid"
        data-editing={editing || undefined}
      >
        {editing ? (
          <>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={sortableBoxes.map((b) => b.id)} strategy={rectSortingStrategy}>
                {sortableBoxes.map((box) => (
                  <SortableBox key={box.id} box={box} isAdmin={isAdmin} viewportWidth={viewportWidth} editing={editing} lone={loneById.get(box.id) ?? false} onWidth={changeWidth} onToggleFavorite={onToggleFavorite} onEdit={openEdit} onOpenIframe={openIframe} onRename={onRenameBox} onDelete={onDeleteBox} showUptimeDisplay={showUptimeDisplay} sensors={sensors} onTileDragEnd={onTileDragEnd} setAnnounce={setAnnounce} />
                ))}
              </SortableContext>
            </DndContext>
            {uncatBox && (
              <BoxCard key="__uncat__" box={uncatBox} isAdmin={isAdmin} viewportWidth={viewportWidth} editing={editing} lone={loneById.get(uncatBox.id) ?? false} onWidth={changeWidth} onToggleFavorite={onToggleFavorite} onEdit={openEdit} onOpenIframe={openIframe} onRename={onRenameBox} onDelete={onDeleteBox} showUptimeDisplay={showUptimeDisplay} sensors={sensors} onTileDragEnd={onTileDragEnd} setAnnounce={setAnnounce} />
            )}
          </>
        ) : (
          boxes.map((box) => (
            <BoxCard key={box.id || '__uncat__'} box={box} isAdmin={isAdmin} viewportWidth={viewportWidth} editing={editing} lone={loneById.get(box.id) ?? false} onWidth={changeWidth} onToggleFavorite={onToggleFavorite} onEdit={openEdit} onOpenIframe={openIframe} onRename={onRenameBox} onDelete={onDeleteBox} showUptimeDisplay={showUptimeDisplay} />
          ))
        )}
        {addButton}
      </div>
      {/* a11y: announce reorder outcomes to screen readers (drag path — §10/A7). */}
      <div className="sr-only" role="status" aria-live="polite" data-testid="app-grid-announce">
        {announce}
      </div>
      {addOpen && <AddBoxModal onCreate={onCreate} onClose={() => setAddOpen(false)} />}
      {editTarget && (
        <Suspense fallback={null}>
          <TileEditModal
            service={editTarget.service}
            categories={cats}
            theme={gridTheme}
            onClose={closeEdit}
            onPatch={(partial) => patchService(editTarget.service.id, partial)}
            onToast={(msg, kind) => setToast({ msg, kind })}
          />
        </Suspense>
      )}
      {/* v23 — the in-app embed overlay for a clickAction='iframe' tile. Rendered
          at the grid root (like the edit modal) so its fixed backdrop escapes any
          box stacking context. */}
      {iframeTarget && (
        <Suspense fallback={null}>
          <IframeOverlay service={iframeTarget} onClose={() => setIframeTarget(null)} />
        </Suspense>
      )}
      {/* v21 — Save success / error toast (AC-014/015). Bottom-right, auto-dismiss;
          same visual family as the cap5 status toasts. */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-[60] pointer-events-none">
          <div
            role="status"
            aria-live={toast.kind === 'error' ? 'assertive' : 'polite'}
            data-testid="tile-toast"
            className={`toast-item pointer-events-auto min-w-56 max-w-xs rounded border-l-4 ${
              toast.kind === 'error' ? 'border-red-500' : 'border-emerald-500'
            } bg-white px-4 py-3 text-sm font-medium text-neutral-900 shadow-lg dark:bg-neutral-800 dark:text-neutral-100`}
          >
            {toast.msg}
          </div>
        </div>
      )}
    </>
  );
}

// The dnd-kit sortable wiring a box needs in Edit Dashboard mode: the node ref,
// the lifted transform, and the drag-handle grip (activator ref + listeners).
type BoxSortable = {
  setNodeRef: (el: HTMLElement | null) => void;
  setActivatorNodeRef: (el: HTMLElement | null) => void;
  attributes: React.HTMLAttributes<HTMLButtonElement>;
  listeners: Record<string, unknown> | undefined;
  transform: { x: number; y: number; scaleX: number; scaleY: number } | null;
  transition: string | undefined;
  isDragging: boolean;
};

// A single box: glass container, header (drag grip in edit mode + title + admin
// width selector), and the inner tools grid (or the designed empty state, §6.6).
// `sortable` is present only when the box is draggable (Edit Dashboard, real
// categories); it supplies the node ref, lifted transform, and grip.
function BoxCard({
  box,
  isAdmin,
  viewportWidth,
  editing,
  lone,
  onWidth,
  onToggleFavorite,
  onEdit,
  onOpenIframe,
  onRename,
  onDelete,
  showUptimeDisplay,
  sortable,
  sensors,
  onTileDragEnd,
  setAnnounce,
}: {
  box: Box;
  isAdmin: boolean;
  viewportWidth: number;
  editing: boolean;
  lone: boolean;
  onWidth: (id: string, width: number) => void;
  onToggleFavorite: (id: string) => void;
  onEdit: (service: Service, opener: HTMLElement | null) => void;
  onOpenIframe: (service: Service) => void;
  onRename: (id: string, name: string) => Promise<true | string>;
  onDelete: (id: string) => Promise<boolean>;
  showUptimeDisplay: boolean;
  sortable?: BoxSortable;
  // v28 — tile drag-and-drop wiring, present only in edit mode: the shared sensor
  // recipe, the AppGrid-level reorder+persist handler, and the announce setter for
  // the box-local a11y phrases.
  sensors?: ReturnType<typeof useSensors>;
  onTileDragEnd?: (e: DragEndEvent) => void;
  setAnnounce?: (msg: string) => void;
}) {
  const theme = useResolvedTheme();
  // The width selector, like rename/delete, is an Edit Dashboard affordance:
  // it only appears for an admin in edit mode, and never on the synthetic
  // Uncategorized box (empty id, no real category).
  const canManage = editing && box.id !== '';
  const showSelector = canManage;
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(box.title);
  const [renameError, setRenameError] = useState('');
  const [renamingBusy, setRenamingBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // --w stays the RAW configured width (drives the width-selector state + the
  // legacy content calc the tests assert). SPEC-pane-fill-reflow (Phase 1) adds the
  // grow model as three more vars that index.css turns into `flex` + `max-width`:
  //   --floor : boxWidthPx(--w) — the box's minimum (the admin width is a FLOOR).
  //   --grow  : app count (0 if empty) — grow weight, so a box that can USE the
  //             extra width (more 190px columns) claims proportionally more of it.
  //   --cap   : content-max — the width to show every app in one row, but never
  //             below the floor (so max-width can't shrink the box under its --w).
  //             A LONE box (alone in its row, R4) lifts this to 100% to fill the
  //             frame; an EMPTY box keeps grow 0 + floor cap so it never balloons.
  // The ≤640px mobile behavior (full-width box, 2-col shrink) is pure CSS (D-4).
  const floorPx = boxWidthPx(box.width);
  const hasApps = box.tools.length > 0;
  const capPx = Math.max(floorPx, contentMaxPx(box.tools.length));
  const style: React.CSSProperties = {
    ['--w' as string]: box.width,
    ['--floor' as string]: `${floorPx}px`,
    ['--grow' as string]: hasApps ? box.tools.length : 0,
    ['--cap' as string]: lone && hasApps ? '100%' : `${capPx}px`,
  };
  if (sortable) {
    style.transform = CSS.Transform.toString(sortable.transform);
    style.transition = sortable.transition;
  }

  const startRename = () => {
    setName(box.title);
    setRenameError('');
    setRenaming(true);
  };
  const saveRename = async () => {
    const n = name.trim();
    if (!n || renamingBusy) return;
    setRenamingBusy(true);
    const r = await onRename(box.id, n);
    setRenamingBusy(false);
    if (r === true) setRenaming(false);
    else setRenameError(r);
  };

  return (
    <section
      ref={sortable?.setNodeRef}
      className={`app-grid-box${sortable?.isDragging ? ' is-grabbed' : ''}`}
      data-testid="app-grid-box"
      data-box-id={box.id}
      style={style}
    >
      <header className="app-grid-box-header">
        {sortable && (
          // The sole drag origin (a real <button>, keyboard-operable). #35 gate:
          // it lives inside the sortable subtree but must never contest a pixel
          // an open header dropdown owns — CSS keeps the grid stacking below the
          // header (z-20) / dropdown (z-50).
          <button
            type="button"
            ref={sortable.setActivatorNodeRef}
            {...sortable.attributes}
            {...(sortable.listeners as React.DOMAttributes<HTMLButtonElement>)}
            className="app-grid-box-grip"
            data-testid="box-drag-handle"
            data-category-id={box.id}
            aria-label={`Reorder ${box.title}`}
            aria-pressed={sortable.isDragging}
          >
            ⠿
          </button>
        )}
        <h2 className="app-grid-box-title" data-testid="box-title" title={box.title}>
          {box.title}
        </h2>
        {canManage && (
          <div className="app-grid-box-actions">
            <button
              type="button"
              className="app-grid-box-action"
              data-testid="box-rename"
              aria-label={`Rename ${box.title}`}
              onClick={startRename}
            >
              Rename
            </button>
            <button
              type="button"
              className="app-grid-box-action is-danger"
              data-testid="box-delete"
              aria-label={`Delete ${box.title}`}
              onClick={() => setConfirming(true)}
            >
              Delete
            </button>
          </div>
        )}
        {showSelector && (
          <WidthSelector
            width={box.width}
            viewportWidth={viewportWidth}
            onPick={(w) => onWidth(box.id, w)}
          />
        )}
      </header>
      {canManage && renaming && (
        // Rename editor (kept below the header so the h2 box-title stays present).
        <div className="app-grid-box-rename">
          <input
            className="settings-input"
            data-testid="box-rename-input"
            aria-label={`New name for ${box.title}`}
            value={name}
            autoFocus
            onChange={(e) => {
              setName(e.target.value);
              setRenameError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveRename();
              if (e.key === 'Escape') setRenaming(false);
            }}
          />
          <button
            type="button"
            className="app-grid-box-action"
            data-testid="box-rename-save"
            disabled={!name.trim() || renamingBusy}
            onClick={saveRename}
          >
            Save
          </button>
          <button
            type="button"
            className="app-grid-box-action"
            data-testid="box-rename-cancel"
            onClick={() => setRenaming(false)}
          >
            Cancel
          </button>
          {renameError && (
            <p className="app-grid-add-error" role="alert" data-testid="box-rename-error">
              {renameError}
            </p>
          )}
        </div>
      )}
      {canManage && confirming && (
        // In-place delete confirm (apps fall back to Uncategorized, none deleted).
        <div
          className="app-grid-box-confirm"
          role="alertdialog"
          aria-label={`Delete ${box.title}`}
          data-testid="box-delete-confirm"
        >
          <p className="app-grid-box-confirm-text">
            Delete <strong>{box.title}</strong>? Its apps move to Uncategorized.
          </p>
          <div className="app-grid-box-confirm-actions">
            <button
              type="button"
              className="app-grid-box-action is-danger"
              data-testid="box-delete-yes"
              onClick={() => {
                setConfirming(false);
                void onDelete(box.id);
              }}
            >
              Delete box
            </button>
            <button
              type="button"
              className="app-grid-box-action"
              data-testid="box-delete-no"
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {box.tools.length === 0 ? (
        <p className="app-grid-empty" data-testid="box-empty">
          {isAdmin ? 'No apps yet — add from the Library.' : 'No apps in this box.'}
        </p>
      ) : editing && sensors && onTileDragEnd ? (
        // v28 — each box wraps its tile grid in its OWN DndContext (§5.1/§5.4), so
        // a tile drag is structurally scoped to this box: dnd-kit cannot route a
        // drop across box boundaries (AC-010). The grip on each SortableTile is the
        // sole drag origin. The box-local start/over/end/cancel handlers own the
        // within-box "position i of n" announcements (they need box.tools);
        // onTileDragEnd (AppGrid) owns the actual reorder + persistence + rollback.
        <TileDndGrid
          box={box}
          theme={theme}
          editing={editing}
          sensors={sensors}
          onTileDragEnd={onTileDragEnd}
          setAnnounce={setAnnounce}
          onToggleFavorite={onToggleFavorite}
          onEdit={onEdit}
          onOpenIframe={onOpenIframe}
          showUptimeDisplay={showUptimeDisplay}
        />
      ) : (
        <div className="app-grid-tools" data-testid="box-tools">
          {box.tools.map((s) => (
            <ToolLink key={s.id} service={s} theme={theme} editing={editing} onToggleFavorite={onToggleFavorite} onEdit={onEdit} onOpenIframe={onOpenIframe} showUptimeDisplay={showUptimeDisplay} />
          ))}
        </div>
      )}
    </section>
  );
}

// v28 — one box's tile grid as a self-contained dnd-kit sortable scope. Split out
// of BoxCard so the start/over/end/cancel closures capture this box's `tools` for
// the within-box "position i of n" announcements (§4.3). The reorder mutation +
// persistence lives at the AppGrid level (onTileDragEnd) where the shared services
// array is; here we only announce and forward the drop.
function TileDndGrid({
  box,
  theme,
  editing,
  sensors,
  onTileDragEnd,
  setAnnounce,
  onToggleFavorite,
  onEdit,
  onOpenIframe,
  showUptimeDisplay,
}: {
  box: Box;
  theme: 'light' | 'dark';
  editing: boolean;
  sensors: ReturnType<typeof useSensors>;
  onTileDragEnd: (e: DragEndEvent) => void;
  setAnnounce?: (msg: string) => void;
  onToggleFavorite: (id: string) => void;
  onEdit: (service: Service, opener: HTMLElement | null) => void;
  onOpenIframe: (service: Service) => void;
  showUptimeDisplay: boolean;
}) {
  const tileIds = box.tools.map((s) => s.id);
  const n = tileIds.length;
  const nameOf = (id: string) => box.tools.find((s) => s.id === id)?.name ?? '';
  const announce = setAnnounce ?? (() => {});

  const onDragStart = (e: DragStartEvent) => {
    const id = e.active.id as string;
    const i = tileIds.indexOf(id) + 1;
    announce(
      `${nameOf(id)} grabbed, position ${i} of ${n}. Use arrow keys to move, space to drop, escape to cancel.`,
    );
  };
  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    // dnd-kit fires onDragOver on pick-up with over === active (no real move);
    // skip it so the "grabbed" announcement stands until an actual arrow move.
    if (!over || over.id === active.id) return;
    const j = tileIds.indexOf(over.id as string) + 1;
    if (j > 0) announce(`${nameOf(active.id as string)} moved to position ${j} of ${n}.`);
  };
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (over && active.id !== over.id) {
      const j = tileIds.indexOf(over.id as string) + 1;
      announce(`${nameOf(active.id as string)} dropped at position ${j} of ${n}.`);
      onTileDragEnd(e);
    }
    // dropped in place, or outside every droppable (AC-010) → snap back, no PUT.
  };
  const onDragCancel = () => announce('Reorder cancelled.');

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <SortableContext items={tileIds} strategy={rectSortingStrategy}>
        <div className="app-grid-tools" data-testid="box-tools">
          {box.tools.map((s) => (
            <SortableTile
              key={s.id}
              service={s}
              theme={theme}
              editing={editing}
              onToggleFavorite={onToggleFavorite}
              onEdit={onEdit}
              onOpenIframe={onOpenIframe}
              showUptimeDisplay={showUptimeDisplay}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

// v28 — SortableTile makes one tile draggable within its box's DndContext (§5.2),
// analogous to SortableBox. It calls useSortable (needs a DndContext ancestor,
// hence a distinct component) and hands the wiring to ToolLink, which applies the
// node ref + lifted transform to the tile wrapper and the grip to a real <button>.
function SortableTile({
  service,
  theme,
  editing,
  onToggleFavorite,
  onEdit,
  onOpenIframe,
  showUptimeDisplay,
}: {
  service: Service;
  theme: 'light' | 'dark';
  editing: boolean;
  onToggleFavorite: (id: string) => void;
  onEdit: (service: Service, opener: HTMLElement | null) => void;
  onOpenIframe: (service: Service) => void;
  showUptimeDisplay: boolean;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: service.id });
  return (
    <ToolLink
      service={service}
      theme={theme}
      editing={editing}
      onToggleFavorite={onToggleFavorite}
      onEdit={onEdit}
      onOpenIframe={onOpenIframe}
      showUptimeDisplay={showUptimeDisplay}
      sortable={{ attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging }}
    />
  );
}

// SortableBox makes one real-category box draggable in Edit Dashboard mode. It
// calls useSortable (which needs a DndContext ancestor — hence a distinct
// component rendered only in edit mode) and hands the wiring to BoxCard.
function SortableBox({
  box,
  isAdmin,
  viewportWidth,
  editing,
  lone,
  onWidth,
  onToggleFavorite,
  onEdit,
  onOpenIframe,
  onRename,
  onDelete,
  showUptimeDisplay,
  sensors,
  onTileDragEnd,
  setAnnounce,
}: {
  box: Box;
  isAdmin: boolean;
  viewportWidth: number;
  editing: boolean;
  lone: boolean;
  onWidth: (id: string, width: number) => void;
  onToggleFavorite: (id: string) => void;
  onEdit: (service: Service, opener: HTMLElement | null) => void;
  onOpenIframe: (service: Service) => void;
  onRename: (id: string, name: string) => Promise<true | string>;
  onDelete: (id: string) => Promise<boolean>;
  showUptimeDisplay: boolean;
  // v28 — tile drag wiring, forwarded to BoxCard's per-box tile DndContext.
  sensors?: ReturnType<typeof useSensors>;
  onTileDragEnd?: (e: DragEndEvent) => void;
  setAnnounce?: (msg: string) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: box.id });
  return (
    <BoxCard
      box={box}
      isAdmin={isAdmin}
      viewportWidth={viewportWidth}
      editing={editing}
      lone={lone}
      onWidth={onWidth}
      onToggleFavorite={onToggleFavorite}
      onEdit={onEdit}
      onOpenIframe={onOpenIframe}
      onRename={onRename}
      onDelete={onDelete}
      showUptimeDisplay={showUptimeDisplay}
      sortable={{ attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging }}
      sensors={sensors}
      onTileDragEnd={onTileDragEnd}
      setAnnounce={setAnnounce}
    />
  );
}

// SPEC-242 §5 — the per-tile status indicator's human labels. NOT_MONITORED is
// "not monitored" (absence of monitoring, not a failure — D-6); the rest are the
// raw state. Drives both the aria-label ("status: {label}") and the title.
const statusLabel: Record<ServiceStatus, string> = {
  UP: 'UP',
  DOWN: 'DOWN',
  DEGRADED: 'DEGRADED',
  UNKNOWN: 'UNKNOWN',
  NOT_MONITORED: 'not monitored',
};

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

// SPEC-242 D-4 — pulse a tile's status pip once when its status flips between
// poll cycles (AC-011/013). Tracks the previous status across renders: the first
// render (mount) never pulses, an unchanged status never pulses, and only the
// tile that changed pulses. Under prefers-reduced-motion the pip snaps to the new
// state with no animation (AC-012). Mirrors the shipped Catalog useStatusPulse.
function useStatusPulse(status: ServiceStatus): boolean {
  const prev = useRef(status);
  const [pulsing, setPulsing] = useState(false);
  useEffect(() => {
    if (prev.current === status) return;
    prev.current = status;
    if (prefersReducedMotion()) return;
    setPulsing(true);
    const t = setTimeout(() => setPulsing(false), 700);
    return () => clearTimeout(t);
  }, [status]);
  return pulsing;
}

// SPEC uptime-windows — the long rolling windows shown per tile, in display order.
// Mirrors the backend's gatus.UptimeWindows.
const UPTIME_WINDOW_ORDER = ['24h', '7d', '30d'];

// fmtUptime renders a fraction (0..1) as a glanceable percentage (AC-U07): exactly
// 100% drops the decimal; everything else shows one decimal, rounded nearest.
function fmtUptime(v: number): string {
  const rounded = (v * 100).toFixed(1);
  // Round first, then check the boundary: a value like 0.9995 rounds to "100.0",
  // which should read "100%" (no decimal) — not "100.0%".
  return parseFloat(rounded) >= 100 ? '100%' : `${rounded}%`;
}

// UptimeWindowsLine renders Gatus's computed 24h/7d/30d availability under the tile
// name — monitored services only. Returns null when there is no data so an
// unmonitored tile renders nothing extra and its height is unchanged (AC-U06).
function UptimeWindowsLine({ windows }: { windows?: Record<string, number> }) {
  if (!windows) return null;
  const parts = UPTIME_WINDOW_ORDER.filter((w) => typeof windows[w] === 'number');
  if (parts.length === 0) return null;
  return (
    <span className="app-grid-tool-uptime" data-testid="tile-uptime">
      {parts.map((w) => `${w} ${fmtUptime(windows[w])}`).join('  ·  ')}
    </span>
  );
}

// One tool link: icon plate + name, opens the tool in a new tab (AC-011, §6.4).
// The visible name truncates; the accessible name (aria-label) + native title
// carry the full string (§6.2.1). A favorite ★ toggle (#240) sits in the corner
// as a SIBLING of the <a> (interactive content can't nest in an anchor) — its
// own <button>, painted above the link, so a real center click hits the star,
// not the navigation; the handler preventDefault/stopPropagation guard the rest.
function ToolLink({
  service,
  theme,
  editing,
  onToggleFavorite,
  onEdit,
  onOpenIframe,
  showUptimeDisplay,
  sortable,
}: {
  service: Service;
  theme: 'light' | 'dark';
  // v21 — admin edit mode: render the pencil affordance + mark the tile editable.
  editing: boolean;
  onToggleFavorite: (id: string) => void;
  onEdit: (service: Service, opener: HTMLElement | null) => void;
  // v23 — open the in-app embed overlay for a clickAction='iframe' tile.
  onOpenIframe: (service: Service) => void;
  showUptimeDisplay: boolean;
  // v28 — dnd-kit sortable wiring, present only when the tile is draggable (edit
  // mode, via SortableTile). Applied to the wrapper (node ref + lifted transform)
  // and the grip <button> (activator ref + listeners). Same shape as BoxSortable.
  sortable?: BoxSortable;
}) {
  const fav = service.favorite;
  // SPEC-242 D-4 — one-shot pulse when this tile's status changes on a live poll.
  const pulsing = useStatusPulse(service.status);
  const editRef = useRef<HTMLButtonElement>(null);
  // v23 — how this tile navigates (SPEC-tile-click-action §5). Absent/undefined
  // is treated as 'new_tab' (AC-014, the hardcoded prior behavior). new_tab keeps
  // target=_blank + the safe rel; same_tab drops target so the current tab
  // navigates; iframe keeps href (right-click "open in new tab" still works,
  // AC-007) but intercepts the left-click to open IframeOverlay (AC-005).
  const action = service.clickAction ?? 'new_tab';
  const linkProps: React.ComponentPropsWithoutRef<'a'> =
    action === 'new_tab'
      ? { target: '_blank', rel: 'noreferrer noopener' }
      : action === 'iframe'
        ? {
            onClick: (e) => {
              e.preventDefault();
              onOpenIframe(service);
            },
          }
        : {}; // same_tab — plain in-tab navigation, no target/rel
  return (
    <div
      ref={sortable?.setNodeRef}
      className={`app-grid-tool-wrap${editing ? ' is-editing' : ''}${sortable?.isDragging ? ' is-grabbed' : ''}`}
      style={
        sortable
          ? { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }
          : undefined
      }
    >
      {/* SPEC-242 §5 — per-tile status pip. A SIBLING of the <a> (not nested), so
          it stays out of the anchor's accessible name — its own aria-label carries
          the status independently (D-1 DOM). top-LEFT at 8/8 mirrors the favorite ★
          (top-right) so the two corner affordances never collide; pointer-events:
          none (CSS) → it never intercepts a tap and adds zero layout (120px height,
          AC-007). data-status drives the fill/ring/glow per state. */}
      <span
        className={`app-grid-tool-status${pulsing ? ' app-grid-tool-status--pulse' : ''}`}
        data-testid="tile-status"
        data-status={service.status}
        data-pulsing={pulsing ? 'true' : 'false'}
        role="img"
        title={statusLabel[service.status] ?? service.status}
        aria-label={`status: ${statusLabel[service.status] ?? service.status}`}
      />
      <a
        className="app-grid-tool"
        data-testid="tool-link"
        data-status={service.status}
        href={service.url}
        aria-label={service.name}
        title={service.name}
        {...linkProps}
      >
        <span className="app-grid-tool-icon">
          <img
            src={iconSrc(service, theme, 0)}
            alt=""
            data-fallback={initialBadge(service.name)}
            onError={onIconError}
          />
        </span>
        <span className="app-grid-tool-name">{service.name}</span>
        {/* cap6 — the global admin toggle gates the uptime line here (D2, render
            gate not data suppression). When off, the tile renders as if it had
            no uptime data (AC-002/003); the status pip above is untouched. */}
        {showUptimeDisplay && <UptimeWindowsLine windows={service.uptimeWindows} />}
      </a>
      <button
        type="button"
        className={`app-grid-tool-fav${fav ? ' is-favorite' : ''}`}
        data-testid="tile-favorite"
        aria-pressed={fav}
        aria-label={fav ? `Unpin ${service.name} from favorites` : `Pin ${service.name} to favorites`}
        title={fav ? 'Favorited' : 'Favorite'}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggleFavorite(service.id);
        }}
      >
        {fav ? '★' : '☆'}
      </button>
      {/* v21 §8.1 — per-tile pencil edit affordance. A SIBLING of the <a> (like
          the ★ and status pip), painted BOTTOM-right so it pairs with the ★
          (top-right) and never shares a row/tap with it. Rendered ONLY in admin
          edit mode (editing) — absent from the DOM otherwise (AC-001), no
          zero-opacity ghost. Opens the edit modal for this tile and hands its own
          element up as the focus-return target (AC-013). */}
      {editing && (
        <button
          type="button"
          ref={editRef}
          className="app-grid-tool-edit"
          data-testid="tile-edit"
          aria-label={`Edit ${service.name}`}
          title="Edit tile"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onEdit(service, editRef.current);
          }}
        >
          ✎
        </button>
      )}
      {/* v28 §8.1/§8.2 — the tile drag grip. A real <button> and the SOLE drag
          origin (pointer, touch, AND keyboard); it carries the useSortable
          listeners/attributes (not the tile wrapper) so navigate vs. reorder never
          collide (§4.1). Bottom-LEFT — the horizontal mirror of the pencil
          (bottom-right), the fourth tile corner (§8.1). Rendered ONLY in edit mode
          with sortable wiring present — absent from the DOM otherwise (AC-001/013),
          no zero-opacity ghost. aria-pressed signals the picked-up state. */}
      {editing && sortable && (
        <button
          type="button"
          ref={sortable.setActivatorNodeRef}
          {...sortable.attributes}
          {...(sortable.listeners as React.DOMAttributes<HTMLButtonElement>)}
          className="app-grid-tool-grip"
          data-testid="tile-drag-handle"
          data-service-id={service.id}
          aria-label={`Reorder ${service.name}`}
          aria-pressed={sortable.isDragging}
        >
          ⠿
        </button>
      )}
    </div>
  );
}

function onIconError(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  const fb = img.dataset.fallback;
  if (fb && img.src !== fb) img.src = fb;
}

// The admin width selector: eight 1–8 buttons (A1 range); the active one carries
// fill + weight (never color alone, §6.3). Each button is a ≥44px hit area (CSS).
// D-3: a --w whose box would render wider than the current viewport is offered
// DISABLED (aria-disabled + a "Wider than this screen" title) so the admin never
// sets an off-screen box on their own display. Below 640px the box is CSS-forced
// full-width (D-4), so the fit check is skipped there — every width is selectable.
function WidthSelector({
  width,
  viewportWidth,
  onPick,
}: {
  width: number;
  viewportWidth: number;
  onPick: (w: number) => void;
}) {
  const mobile = viewportWidth <= 640;
  return (
    <div className="app-grid-width" data-testid="width-selector" role="group" aria-label="Box width">
      <span className="app-grid-width-label" aria-hidden="true">
        width
      </span>
      {WIDTHS.map((n) => {
        const selected = n === width;
        // Never disable the currently-selected width (it's already set) — only
        // widths that would newly overflow this screen.
        const disabled = !mobile && !selected && !fitsViewport(n, viewportWidth);
        return (
          <button
            key={n}
            type="button"
            data-testid={`width-btn-${n}`}
            className={`app-grid-width-btn${selected ? ' is-selected' : ''}`}
            aria-pressed={selected}
            aria-disabled={disabled || undefined}
            aria-label={`Width ${n}`}
            title={disabled ? 'Wider than this screen' : undefined}
            onClick={() => !disabled && onPick(n)}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}

// "+ Add box" title-prompt modal (§6.5) — styled dialog, not window.prompt.
// Confirm → create; empty/whitespace disables Create; Esc / scrim / Cancel → no
// box (AC-021).
function AddBoxModal({
  onCreate,
  onClose,
}: {
  onCreate: (title: string) => Promise<true | string>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async () => {
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    const r = await onCreate(t);
    if (r !== true) {
      setError(r);
      setBusy(false);
    }
  };

  return (
    <div
      className="launcher-overlay add-offer-overlay"
      data-testid="add-box-modal"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="add-offer-panel" role="dialog" aria-modal="true" aria-label="Add box">
        <h2 className="add-offer-title">Add box</h2>
        <label className="add-offer-field">
          <span className="add-offer-label">Box title</span>
          <input
            id="add-box-input"
            data-testid="add-box-input"
            ref={inputRef}
            className="settings-input"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setError('');
            }}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </label>
        {error && <p className="app-grid-add-error" role="alert">{error}</p>}
        <div className="add-offer-actions">
          <button
            type="button"
            className="settings-ghost-btn"
            data-testid="add-box-cancel"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="library-add"
            data-testid="add-box-create"
            disabled={!title.trim() || busy}
            onClick={submit}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
