import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  categories as fetchCategories,
  createCategory,
  saveCategoryWidth,
  setCategoryOrder,
  setFavorite,
  services as fetchServices,
  type Category,
  type Service,
} from './api';
import { boxesFromData, effectiveWidth, MAX_WIDTH, moveCategory, type Box } from './appGrid';
import { iconSrc, initialBadge } from './icons';
import { useServicesContext } from './services';
import { useResolvedTheme } from './theme';

// AppGrid (SPEC-app-grid) — the primary dashboard layout: a 6-column page grid
// of boxes (= categories). Each box's width (1–6) drives BOTH its column span
// and its links-per-row via one `--w` CSS variable; the greedy pack + wrap and
// the ≤640px 2-column cap are pure CSS (index.css `.app-grid`). This component
// owns the data fetch, the admin width selector, and the "+ Add box" flow. It
// replaces the v14 floating-panel Catalog layout (§2).

const WIDTHS = Array.from({ length: MAX_WIDTH }, (_, i) => i + 1); // [1..6]

// useIsMobile tracks the ≤640px breakpoint (AC-022). CSS min() can't be used
// inside repeat()/span, so the effective (mobile-capped) width is computed in JS
// and written to `--w`; the page grid itself flips to 2 columns via CSS media.
function useIsMobile(): boolean {
  const query = '(max-width: 640px)';
  const [mobile, setMobile] = useState(() => window.matchMedia?.(query)?.matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const onChange = () => setMobile(mq.matches);
    onChange();
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return mobile;
}

export default function AppGrid({ isAdmin, editMode = false }: { isAdmin: boolean; editMode?: boolean }) {
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
  const isMobile = useIsMobile();

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
                  <SortableBox key={box.id} box={box} isAdmin={isAdmin} isMobile={isMobile} onWidth={changeWidth} onToggleFavorite={onToggleFavorite} />
                ))}
              </SortableContext>
            </DndContext>
            {uncatBox && (
              <BoxCard key="__uncat__" box={uncatBox} isAdmin={isAdmin} isMobile={isMobile} onWidth={changeWidth} onToggleFavorite={onToggleFavorite} />
            )}
          </>
        ) : (
          boxes.map((box) => (
            <BoxCard key={box.id || '__uncat__'} box={box} isAdmin={isAdmin} isMobile={isMobile} onWidth={changeWidth} onToggleFavorite={onToggleFavorite} />
          ))
        )}
        {addButton}
      </div>
      {/* a11y: announce reorder outcomes to screen readers (drag path — §10/A7). */}
      <div className="sr-only" role="status" aria-live="polite" data-testid="app-grid-announce">
        {announce}
      </div>
      {addOpen && <AddBoxModal onCreate={onCreate} onClose={() => setAddOpen(false)} />}
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
  isMobile,
  onWidth,
  onToggleFavorite,
  sortable,
}: {
  box: Box;
  isAdmin: boolean;
  isMobile: boolean;
  onWidth: (id: string, width: number) => void;
  onToggleFavorite: (id: string) => void;
  sortable?: BoxSortable;
}) {
  const theme = useResolvedTheme();
  // A synthetic Uncategorized box (empty id) has no real category → no selector.
  const showSelector = isAdmin && box.id !== '';
  const style: React.CSSProperties = { ['--w' as string]: effectiveWidth(box.width, isMobile) };
  if (sortable) {
    style.transform = CSS.Transform.toString(sortable.transform);
    style.transition = sortable.transition;
  }
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
        {showSelector && (
          <WidthSelector width={box.width} onPick={(w) => onWidth(box.id, w)} />
        )}
      </header>
      {box.tools.length === 0 ? (
        <p className="app-grid-empty" data-testid="box-empty">
          {isAdmin ? 'No apps yet — add from the Library.' : 'No apps in this box.'}
        </p>
      ) : (
        <div className="app-grid-tools" data-testid="box-tools">
          {box.tools.map((s) => (
            <ToolLink key={s.id} service={s} theme={theme} onToggleFavorite={onToggleFavorite} />
          ))}
        </div>
      )}
    </section>
  );
}

// SortableBox makes one real-category box draggable in Edit Dashboard mode. It
// calls useSortable (which needs a DndContext ancestor — hence a distinct
// component rendered only in edit mode) and hands the wiring to BoxCard.
function SortableBox({
  box,
  isAdmin,
  isMobile,
  onWidth,
  onToggleFavorite,
}: {
  box: Box;
  isAdmin: boolean;
  isMobile: boolean;
  onWidth: (id: string, width: number) => void;
  onToggleFavorite: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: box.id });
  return (
    <BoxCard
      box={box}
      isAdmin={isAdmin}
      isMobile={isMobile}
      onWidth={onWidth}
      onToggleFavorite={onToggleFavorite}
      sortable={{ attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging }}
    />
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
  onToggleFavorite,
}: {
  service: Service;
  theme: 'light' | 'dark';
  onToggleFavorite: (id: string) => void;
}) {
  const fav = service.favorite;
  return (
    <div className="app-grid-tool-wrap">
      <a
        className="app-grid-tool"
        data-testid="tool-link"
        href={service.url}
        target="_blank"
        rel="noreferrer noopener"
        aria-label={service.name}
        title={service.name}
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
    </div>
  );
}

function onIconError(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  const fb = img.dataset.fallback;
  if (fb && img.src !== fb) img.src = fb;
}

// The admin width selector: six 1–6 buttons; the active one carries fill + weight
// (never color alone, §6.3). Each button is a ≥44px hit area (CSS).
function WidthSelector({ width, onPick }: { width: number; onPick: (w: number) => void }) {
  return (
    <div className="app-grid-width" data-testid="width-selector" role="group" aria-label="Box width">
      <span className="app-grid-width-label" aria-hidden="true">
        width
      </span>
      {WIDTHS.map((n) => {
        const selected = n === width;
        return (
          <button
            key={n}
            type="button"
            data-testid={`width-btn-${n}`}
            className={`app-grid-width-btn${selected ? ' is-selected' : ''}`}
            aria-pressed={selected}
            aria-label={`Width ${n}`}
            onClick={() => onPick(n)}
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
