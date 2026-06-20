import { useEffect, useRef, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
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
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  assignCategory,
  categories,
  createCategory,
  deleteCategory,
  deleteIcon,
  deleteService,
  getCollapsedCategories,
  renameCategory,
  services,
  setCategoryOrder,
  setCollapsedCategories,
  setFavorite,
  setLayout,
  uploadIcon,
  type Category,
  type IconVariant,
  type Result,
  type Service,
  type ServiceStatus,
  type UptimeCheck,
} from './api';
import { DEFAULT_ICON, iconSrc, validateIconFile } from './icons';
import LibraryBrowse from './LibraryBrowse';
import ServiceForm from './ServiceForm';
import { useServicesContext } from './services';
import { useResolvedTheme } from './theme';

// v5: localStorage mirrors the last-known collapsed-category set so the catalog
// paints the right open/closed state on the FIRST render — no flash of the wrong
// state while the per-user server value loads. The server set is authoritative
// once fetched; this is purely a first-paint cache (same role as v3's theme cache).
const COLLAPSE_CACHE_KEY = 'homepad.collapsedCategories';

function loadCachedCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSE_CACHE_KEY);
    const ids = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(ids) ? (ids as string[]) : []);
  } catch {
    return new Set();
  }
}

function cacheCollapsed(set: Set<string>) {
  try {
    localStorage.setItem(COLLAPSE_CACHE_KEY, JSON.stringify([...set]));
  } catch {
    // ignore quota / disabled storage — the server set stays authoritative
  }
}

// Small colored dot per tile — UP green, DOWN red, DEGRADED amber, UNKNOWN gray.
const statusDot: Record<ServiceStatus, string> = {
  UP: 'bg-emerald-500',
  DOWN: 'bg-red-500',
  DEGRADED: 'bg-amber-400',
  UNKNOWN: 'bg-neutral-300',
  // NOT_MONITORED (no gatus_key): an outlined dashed ring, not a solid dot —
  // signals "no monitoring wired" vs UNKNOWN's "monitoring failure". Ring is
  // neutral-400/500 (#80): neutral-300 was near-invisible at 9px, reading as an
  // ambiguous faint dot; this is legibly an intentional marker, still no glow.
  NOT_MONITORED: 'bg-transparent border-2 border-dashed border-neutral-400 dark:border-neutral-500',
};

const statusLabel: Record<ServiceStatus, string> = {
  UP: 'UP',
  DOWN: 'DOWN',
  DEGRADED: 'DEGRADED',
  UNKNOWN: 'UNKNOWN',
  NOT_MONITORED: 'Not monitored',
};

export default function Catalog({
  isAdmin = false,
  editMode = false,
}: {
  isAdmin?: boolean;
  editMode?: boolean;
}) {
  // v8: the Service[] is shared with the command launcher via ServicesProvider so
  // both render the SAME already-loaded array (no second fetch, §3/A12). When the
  // provider is absent (isolated component tests), Catalog owns the list itself —
  // the v1 behaviour, unchanged — and does its own fetch below.
  const servicesCtx = useServicesContext();
  const [localItems, setLocalItems] = useState<Service[] | null>(null);
  const items = servicesCtx ? servicesCtx.items : localItems;
  const setItems = servicesCtx ? servicesCtx.setItems : setLocalItems;
  // v4: the admin-managed categories, in sort_index order. Empty → the catalog
  // renders the flat v1 grid (A10), so v4 is invisible until an admin makes one.
  const [cats, setCats] = useState<Category[]>([]);
  // Bumped on every icon mutation to bust the <img> cache so a replaced or
  // deleted icon re-renders the new bytes (the GET URL is otherwise stable).
  const [rev, setRev] = useState(0);
  // null = closed; {} = add; { service } = edit that service (A6 admin form).
  const [form, setForm] = useState<{ service?: Service } | null>(null);
  // v9.3 §7.2 — the browse + add-from-library modal. Reachable from the empty
  // dashboard CTA and the always-visible "Add apps" entry.
  const [browseOpen, setBrowseOpen] = useState(false);
  // v5: the set of collapsed category ids (a row = "this user folded it"; absence
  // = expanded, the default). Seeded synchronously from the localStorage cache so
  // first paint is correct, then reconciled with the authoritative server set on
  // load. Keyed on id so v4 rename/reorder are transparent; a deleted category
  // simply stops rendering (and the server cascades its row away).
  const [collapsed, setCollapsed] = useState<Set<string>>(() => loadCachedCollapsed());
  // The category id whose last toggle failed to persist — shown inline so a
  // rolled-back optimistic collapse tells the user it didn't save (A10).
  const [collapseError, setCollapseError] = useState<string | null>(null);
  // v3: the active theme is now the resolved theme from ThemeProvider (pref +
  // OS), so the icon variant follows the System/Light/Dark control — not just
  // the OS. Without a provider (isolated tests) it falls back to the live OS.
  const theme = useResolvedTheme();

  // v10: always-on drag-and-drop. `activeDragId` is the id of the tile currently
  // picked up (pointer or keyboard) — it drives the lifted style and the grip's
  // aria-pressed "grabbed" state (§10). `announce` feeds the visually-hidden
  // aria-live region (§10/A7). `layoutError` shows the inline rollback affordance
  // when a reorder PUT fails (A10).
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const [layoutError, setLayoutError] = useState(false);

  // Sensors: pointer (8px activation so a click/tap still opens the tile — D2/A12),
  // touch (200ms press-hold so a drag doesn't fight page scroll — §5.3/A14), and
  // keyboard (the REQUIRED a11y path — §10/A6) with the sortable coordinate getter.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    // Only fetch services when no provider owns the list (the provider does the
    // single shared load otherwise — §3/A12).
    if (!servicesCtx) services().then(setLocalItems);
    categories().then(setCats);
    // v5: load the authoritative per-user collapsed set, then refresh the cache.
    // A non-200 / offline yields [] (every section expanded — v4 behavior).
    getCollapsedCategories().then((ids) => {
      const set = new Set(ids);
      setCollapsed(set);
      cacheCollapsed(set);
    });
  }, []);

  // Optimistically flip the star, then persist. Roll back if the API rejects.
  // `next` is derived from current state up front — not from inside the setItems
  // updater — because that updater runs on a later render, so reading a value it
  // mutated would race with the persist call below.
  async function toggleFavorite(id: string) {
    const current = items?.find((s) => s.id === id);
    if (!current) return;
    const next = !current.favorite;
    setItems((cur) => cur?.map((s) => (s.id === id ? { ...s, favorite: next } : s)) ?? cur);
    const ok = await setFavorite(id, next);
    if (!ok) {
      setItems((cur) => cur?.map((s) => (s.id === id ? { ...s, favorite: !next } : s)) ?? cur);
    }
  }

  // v10: commit a within-section tile reorder on drop. `overId` is the tile the
  // dragged tile landed on (always in the same section — each section is its own
  // DndContext, so cross-section drops can't happen: A4). We move `activeId` to
  // `overId`'s slot in the FULL items array and persist the whole new id order
  // via PUT /api/layout — exactly the v7 arrows' contract (§6/D7). arrayMove
  // preserves every other tile's relative order, so sibling sections are
  // untouched. Optimistic with rollback + inline error if the PUT fails (A10);
  // the pre-move snapshot is captured up front so rollback can't race a render.
  async function reorderTile(activeId: string, overId: string) {
    const prev = items;
    if (!prev || activeId === overId) return;
    const gi = prev.findIndex((s) => s.id === activeId);
    const gj = prev.findIndex((s) => s.id === overId);
    if (gi < 0 || gj < 0) return;
    const next = arrayMove(prev, gi, gj);
    setItems(next);
    setLayoutError(false);
    const ok = await setLayout(next.map((s) => s.id));
    if (!ok) {
      setItems(prev);
      setLayoutError(true);
    }
  }

  // v10 A3: commit a category-section reorder on drop. Move `activeId` to
  // `overId`'s slot in the category list and persist the whole new id order via
  // PUT /api/categories/order — the same whole-array contract the v7 arrows used
  // (§6/D7). Favorites/Uncategorized are render buckets outside this sortable
  // context, so they can't be dragged and stay pinned first/last. Optimistic
  // with rollback + the shared inline error if the PUT fails (A10).
  async function reorderCategory(activeId: string, overId: string) {
    const prev = cats;
    if (activeId === overId) return;
    const gi = prev.findIndex((c) => c.id === activeId);
    const gj = prev.findIndex((c) => c.id === overId);
    if (gi < 0 || gj < 0) return;
    const next = arrayMove(prev, gi, gj);
    setCats(next);
    setLayoutError(false);
    const ok = await setCategoryOrder(next.map((c) => c.id));
    if (!ok) {
      setCats(prev);
      setLayoutError(true);
    }
  }

  // v10 A3 — drag handlers for the category-section sortable context. Mirror the
  // tile handlers (§10/A7 announcements + grabbed state) but for whole sections;
  // "position i of n" is the slot among real categories (Favorites/Uncategorized
  // aren't in this context).
  function onCatDragStart(e: DragStartEvent) {
    const id = e.active.id as string;
    setActiveDragId(id);
    const name = cats.find((c) => c.id === id)?.name ?? '';
    const i = cats.findIndex((c) => c.id === id) + 1;
    setAnnounce(
      `${name} section grabbed, position ${i} of ${cats.length}. Use arrow keys to move, space to drop, escape to cancel.`,
    );
  }
  function onCatDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over || over.id === active.id) return;
    const j = cats.findIndex((c) => c.id === over.id) + 1;
    const name = cats.find((c) => c.id === active.id)?.name ?? '';
    if (j > 0) setAnnounce(`${name} section moved to position ${j} of ${cats.length}.`);
  }
  function onCatDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveDragId(null);
    const name = cats.find((c) => c.id === active.id)?.name ?? '';
    if (over && active.id !== over.id) {
      const j = cats.findIndex((c) => c.id === over.id) + 1;
      setAnnounce(`${name} section dropped at position ${j}.`);
      void reorderCategory(active.id as string, over.id as string);
    } else {
      const i = cats.findIndex((c) => c.id === active.id) + 1;
      setAnnounce(`${name} section dropped at position ${i}.`);
    }
  }
  function onCatDragCancel() {
    setActiveDragId(null);
    setAnnounce('Reorder cancelled.');
  }

  // v5: fold/unfold a category section, optimistically. The whole collapsed set
  // is captured up front so a rollback can't race a later render (same idiom as
  // toggleFavorite). Mirrors the new set into the first-paint cache immediately,
  // then PUTs it; on failure it reverts state + cache and flags the section so an
  // inline "couldn't save" shows (A10). Only real categories toggle — Favorites
  // and Uncategorized are always-expanded (Q2), so this is never called for them.
  async function toggleCollapse(id: string) {
    const prev = collapsed;
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCollapsed(next);
    setCollapseError(null);
    cacheCollapsed(next);
    const ok = await setCollapsedCategories([...next]);
    if (!ok) {
      setCollapsed(prev);
      cacheCollapsed(prev);
      setCollapseError(id);
    }
  }

  // Flip a service's local variant flag and bust the icon cache. Called after a
  // successful upload (present=true) or delete (present=false) so the tile
  // re-resolves its src without a full catalog refetch.
  function setIconFlag(id: string, variant: IconVariant, present: boolean) {
    const key = variant === 'light' ? 'iconLight' : 'iconDark';
    setItems((cur) => cur?.map((s) => (s.id === id ? { ...s, [key]: present } : s)) ?? cur);
    setRev((r) => r + 1);
  }

  // Remove a service from the catalog. Optimistic with rollback — the server
  // cascades its uploaded icons away.
  async function removeService(id: string) {
    const prev = items;
    if (!prev) return;
    setItems(prev.filter((s) => s.id !== id));
    const ok = await deleteService(id);
    if (!ok) setItems(prev);
  }

  // Reflect a created/updated service in the local list without a refetch. A
  // create appends; an edit replaces in place but KEEPS the existing favorite +
  // icon flags, because the create/update response serializes those as their
  // zero values (the server only sets them on the list endpoint). `rev` bumps so
  // a changed icon URL re-renders past the <img> cache.
  function onSaved(saved: Service, mode: 'add' | 'edit') {
    if (mode === 'add') {
      setItems((cur) => [...(cur ?? []), saved]);
    } else {
      setItems(
        (cur) =>
          cur?.map((s) =>
            s.id === saved.id
              ? { ...saved, favorite: s.favorite, iconLight: s.iconLight, iconDark: s.iconDark }
              : s,
          ) ?? cur,
      );
    }
    setRev((r) => r + 1);
    setForm(null);
  }

  // v9.3 §7.2 — an add-from-library copy lands on MY dashboard. Append it the same
  // way a custom add does so the new tile shows the moment the modal is dismissed.
  function onAddedFromLibrary(added: Service) {
    setItems((cur) => [...(cur ?? []), added]);
    setRev((r) => r + 1);
  }

  // v4 admin category management. All mutations are independently admin-gated
  // server-side; these handlers reflect the result locally without a refetch and
  // return the Result so the manager can surface 403/404/409/400 inline.

  // Create appends the new category last (server sets sort_index = max+1).
  async function createCat(name: string): Promise<Result> {
    const r = await createCategory(name);
    if (r.ok && r.category) setCats((cur) => [...cur, r.category!]);
    return r;
  }

  // Rename replaces the category in place, keeping its position.
  async function renameCat(id: string, name: string): Promise<Result> {
    const r = await renameCategory(id, name);
    if (r.ok && r.category) setCats((cur) => cur.map((c) => (c.id === id ? r.category! : c)));
    return r;
  }

  // Delete is optimistic: drop the category AND fall its apps back to
  // Uncategorized (FK ON DELETE SET NULL — no app is deleted). Roll both back if
  // the API rejects. Snapshots are captured up front so rollback can't race.
  async function removeCat(id: string) {
    const prevCats = cats;
    const prevItems = items;
    setCats((cur) => cur.filter((c) => c.id !== id));
    setItems(
      (cur) =>
        cur?.map((s) => (s.categoryId === id ? { ...s, categoryId: null, categoryName: null } : s)) ??
        cur,
    );
    const ok = await deleteCategory(id);
    if (!ok) {
      setCats(prevCats);
      setItems(prevItems);
    }
  }

  // Assign (or clear) a service's category. On success only categoryId/Name are
  // updated from the response — favorite/icon flags are preserved (the PATCH
  // response serializes them as zero values, like onSaved's edit merge).
  async function assignCat(serviceId: string, categoryId: string | null): Promise<Result> {
    const r = await assignCategory(serviceId, categoryId);
    if (r.ok && r.service) {
      setItems(
        (cur) =>
          cur?.map((s) =>
            s.id === serviceId
              ? { ...s, categoryId: r.service!.categoryId ?? null, categoryName: r.service!.categoryName ?? null }
              : s,
          ) ?? cur,
      );
    }
    return r;
  }

  if (items === null) {
    return <p className="text-sm text-neutral-400">loading services…</p>;
  }

  const adminEdit = isAdmin && editMode;

  // A section's responsive tile grid, wrapped in its OWN dnd-kit DndContext so a
  // tile drag is scoped to its section (v4 A11 / v10 A4): keyboard navigation and
  // pointer drops can't leave this section's SortableContext, so a tile never
  // jumps category. The grip handle on each tile is the drag origin (the tile
  // stays a plain <a> — D2). For the flat v1 grid the section is the whole
  // catalog. Announcements (§10/A7) carry "position i of n" within `sectionIds`.
  function renderGrid(sectionItems: Service[]) {
    const sectionIds = sectionItems.map((s) => s.id);
    const n = sectionIds.length;
    const nameOf = (id: string) => sectionItems.find((s) => s.id === id)?.name ?? '';

    function onDragStart(e: DragStartEvent) {
      const id = e.active.id as string;
      setActiveDragId(id);
      const i = sectionIds.indexOf(id) + 1;
      setAnnounce(
        `${nameOf(id)} grabbed, position ${i} of ${n}. Use arrow keys to move, space to drop, escape to cancel.`,
      );
    }
    function onDragOver(e: DragOverEvent) {
      const { active, over } = e;
      // dnd-kit fires onDragOver on pick-up with over === active (no real move);
      // skip it so the "grabbed" announcement stands until an actual arrow move.
      if (!over || over.id === active.id) return;
      const j = sectionIds.indexOf(over.id as string) + 1;
      if (j > 0) setAnnounce(`${nameOf(active.id as string)} moved to position ${j} of ${n}.`);
    }
    function onDragEnd(e: DragEndEvent) {
      const { active, over } = e;
      setActiveDragId(null);
      if (over && active.id !== over.id) {
        const j = sectionIds.indexOf(over.id as string) + 1;
        setAnnounce(`${nameOf(active.id as string)} dropped at position ${j}.`);
        void reorderTile(active.id as string, over.id as string);
      } else {
        const i = sectionIds.indexOf(active.id as string) + 1;
        setAnnounce(`${nameOf(active.id as string)} dropped at position ${i}.`);
      }
    }
    function onDragCancel() {
      setActiveDragId(null);
      setAnnounce('Reorder cancelled.');
    }

    return (
      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <SortableContext items={sectionIds} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
            {sectionItems.map((s) => (
              <ServiceTile
                key={s.id}
                service={s}
                theme={theme}
                rev={rev}
                editMode={adminEdit}
                cats={cats}
                grabbed={activeDragId === s.id}
                onToggleFavorite={toggleFavorite}
                onIconFlag={setIconFlag}
                onRemoveService={removeService}
                onEditService={() => setForm({ service: s })}
                onAssignCategory={assignCat}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    );
  }

  // v4 grouped render: Favorites first (a favorited app shows here AND in its
  // category — taxonomy vs. shortcut), then each category in admin order, then
  // Uncategorized last (omitted when empty). With NO categories the catalog
  // renders exactly as v1 — one flat grid, no headers (A10) — so the day-one
  // seeded catalog is unchanged until an admin curates.
  const grouped = cats.length > 0;
  const favorites = items.filter((s) => s.favorite);
  const uncategorized = items.filter((s) => s.categoryId == null);

  return (
    <>
      {/* v10 §10/A7 — the visually-hidden live region that announces drag grab /
          move / drop / cancel to screen readers. assertive so the position update
          interrupts and is heard during a keyboard reorder. */}
      <div data-testid="drag-live-region" aria-live="assertive" role="status" className="sr-only">
        {announce}
      </div>

      {/* v11 §4.4 D6 — edit mode touches only MY personal tiles; this banner
          says so at point-of-use, distinct from the global Admin Panel. */}
      {adminEdit && (
        <div data-testid="edit-mode-banner" className="edit-mode-banner" role="status">
          <PencilIcon />
          Editing your personal dashboard
        </div>
      )}

      {/* v10 §6/A10 — a reorder PUT failed; the optimistic order was rolled back. */}
      {layoutError && (
        <p data-testid="layout-error" role="alert" className="mb-3 text-sm text-red-600">
          Couldn’t save the new order — it was put back. Please try again.
        </p>
      )}

      {/* §7.2 — the App Library entry, available to every user (not admin-gated):
          their personal dashboard is theirs to fill. */}
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          data-testid="open-library"
          onClick={() => setBrowseOpen(true)}
          className="rounded-lg border border-indigo-200 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50 dark:border-indigo-900 dark:text-indigo-300"
        >
          + Add apps
        </button>
      </div>

      {adminEdit && (
        <div className="mb-4 space-y-4">
          <button
            type="button"
            data-testid="add-service"
            onClick={() => setForm({})}
            className="rounded-lg border border-indigo-200 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50"
          >
            + Add app
          </button>
          <CategoryManager
            cats={cats}
            onCreate={createCat}
            onRename={renameCat}
            onDelete={removeCat}
          />
        </div>
      )}

      {items.length === 0 ? (
        <div data-testid="dashboard-empty" className="dashboard-empty">
          <p className="dashboard-empty-title">Your dashboard is empty</p>
          <p className="dashboard-empty-sub">
            Add apps from the App Library to get started.
          </p>
          <button
            type="button"
            data-testid="browse-library-cta"
            onClick={() => setBrowseOpen(true)}
            className="dashboard-empty-cta"
          >
            Browse the App Library
          </button>
        </div>
      ) : !grouped ? (
        renderGrid(items)
      ) : (
        <div className="space-y-8">
          {/* Favorites + Uncategorized are render-time buckets, not categories
              rows, so they have no id to key collapse state on — they stay
              always-expanded for v5 (Q2). Only real category sections collapse. */}
          {favorites.length > 0 && (
            <Section title="Favorites" count={favorites.length}>{renderGrid(favorites)}</Section>
          )}
          {/* v10 A3 — the real category sections are a sortable list: drag a
              header grip to reorder folders (PUT /api/categories/order). Its own
              DndContext, separate from each section's tile context, so a section
              moves as a whole block (D3). */}
          <DndContext
            sensors={sensors}
            onDragStart={onCatDragStart}
            onDragOver={onCatDragOver}
            onDragEnd={onCatDragEnd}
            onDragCancel={onCatDragCancel}
          >
            <SortableContext items={cats.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-8">
                {cats.map((c) => {
                  const sectionItems = items.filter((s) => s.categoryId === c.id);
                  return (
                    <SortableSection
                      key={c.id}
                      cat={c}
                      count={sectionItems.length}
                      collapsed={collapsed.has(c.id)}
                      error={collapseError === c.id}
                      controlsId={`section-${c.id}`}
                      grabbed={activeDragId === c.id}
                      onToggle={() => toggleCollapse(c.id)}
                    >
                      {renderGrid(sectionItems)}
                    </SortableSection>
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
          {uncategorized.length > 0 && (
            <Section title="Uncategorized" count={uncategorized.length}>
              {renderGrid(uncategorized)}
            </Section>
          )}
        </div>
      )}

      {browseOpen && (
        <LibraryBrowse
          isAdmin={isAdmin}
          onClose={() => setBrowseOpen(false)}
          onAdded={onAddedFromLibrary}
          onCustomAdd={() => {
            setBrowseOpen(false);
            setForm({});
          }}
        />
      )}

      {form && (
        <ServiceForm service={form.service} onClose={() => setForm(null)} onSaved={onSaved} />
      )}
    </>
  );
}

// #79: a small pill badge showing how many apps a section holds. Lives on every
// section header (Favorites / categories / Uncategorized) so the count is legible
// at a glance whether the section is expanded or collapsed. normal-case keeps the
// digits from inheriting the header's uppercase tracking.
function CategoryCount({ count }: { count: number }) {
  return (
    <span
      data-testid="category-count"
      className="cat-count normal-case"
      aria-label={`${count} app${count === 1 ? '' : 's'}`}
    >
      {count}
    </span>
  );
}

// A catalog section: a header (the category / Favorites / Uncategorized name) and
// its tile grid beneath. v5: a `collapsible` section's header is a real disclosure
// — a <button aria-expanded> controlling the tile region (aria-controls), operable
// by click/Enter/Space — that folds the tiles away when collapsed. Favorites and
// Uncategorized pass collapsible=false and render the v4 static header unchanged.
function Section({
  title,
  count,
  collapsible = false,
  collapsed = false,
  error = false,
  controlsId,
  onToggle,
  containerRef,
  containerStyle,
  grabbed = false,
  dragHandle,
  children,
}: {
  title: string;
  count: number;
  collapsible?: boolean;
  collapsed?: boolean;
  error?: boolean;
  controlsId?: string;
  onToggle?: () => void;
  // v10 A3: when this section is a sortable category, the wrapper supplies the
  // dnd-kit node ref + lifted transform style + the header drag grip.
  containerRef?: (node: HTMLElement | null) => void;
  containerStyle?: React.CSSProperties;
  grabbed?: boolean;
  dragHandle?: React.ReactNode;
  children: React.ReactNode;
}) {
  // v4 static header (Favorites / Uncategorized): no toggle, always shows tiles.
  if (!collapsible) {
    return (
      <section>
        <h2 data-testid="category-header" className="cat-head font-semibold uppercase">
          <span>{title}</span>
          <CategoryCount count={count} />
        </h2>
        {children}
      </section>
    );
  }

  // A folded section shows a count so it still says how much is inside; the count
  // is omitted when expanded so the header text stays just the name (v4 parity).
  return (
    <section
      ref={containerRef}
      style={containerStyle}
      className={`rounded-lg transition-transform motion-reduce:transition-none ${
        grabbed ? 'z-10 scale-[1.01] shadow-lg ring-1 ring-indigo-500/35 motion-reduce:scale-100' : ''
      }`}
    >
      <h2 className="flex items-center">
        {dragHandle}
        <button
          type="button"
          data-testid="category-header"
          aria-expanded={!collapsed}
          aria-controls={controlsId}
          onClick={onToggle}
          className="cat-head w-full rounded font-semibold uppercase outline-none hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:text-slate-300"
        >
          {/* A right-pointing chevron that rotates to point down when expanded.
              An SVG (no text content) keeps the header's textContent == title.
              motion-reduce disables the rotation transition (prefers-reduced-motion). */}
          <svg
            data-testid="disclosure-chevron"
            aria-hidden="true"
            viewBox="0 0 12 12"
            className={`h-3 w-3 shrink-0 transition-transform motion-reduce:transition-none ${
              collapsed ? '' : 'rotate-90'
            }`}
          >
            <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>{title}</span>
          {/* #79: the app count is ALWAYS shown (not just when collapsed) so a
              collapsed-empty section is instantly distinguishable from a
              collapsed-with-content one, and an expanded-empty category reads as
              "0" instead of looking broken (Walt's 2026-06-19 live-UI review). */}
          <CategoryCount count={count} />
          {error && (
            <span data-testid="collapse-error" className="font-normal normal-case text-red-600">
              couldn’t save
            </span>
          )}
        </button>
      </h2>
      {!collapsed && <div id={controlsId}>{children}</div>}
    </section>
  );
}

// v10 A3 — a category section made draggable. Wraps the v5 collapsible Section,
// supplying the dnd-kit sortable node ref, lifted transform, and a header drag
// grip (a real <button>, the sole drag origin — the disclosure button keeps
// collapsing). The whole section moves as one block (D3). The grip carries
// aria-pressed for the grabbed state and an aria-live-friendly label (§10).
function SortableSection({
  cat,
  count,
  collapsed,
  error,
  controlsId,
  grabbed,
  onToggle,
  children,
}: {
  cat: Category;
  count: number;
  collapsed: boolean;
  error: boolean;
  controlsId: string;
  grabbed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition } =
    useSortable({ id: cat.id });
  const grip = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      data-testid="drag-handle"
      data-drag-type="category"
      data-category-id={cat.id}
      aria-label={`Reorder ${cat.name} section`}
      aria-pressed={grabbed}
      className={`mr-1 flex h-9 w-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-base leading-none normal-case outline-none transition focus-visible:ring-2 focus-visible:ring-indigo-500 active:cursor-grabbing ${
        grabbed ? 'text-indigo-600 dark:text-indigo-400' : 'text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200'
      }`}
    >
      ⠿
    </button>
  );
  return (
    <Section
      title={cat.name}
      count={count}
      collapsible
      collapsed={collapsed}
      error={error}
      controlsId={controlsId}
      onToggle={onToggle}
      containerRef={setNodeRef}
      containerStyle={{ transform: CSS.Transform.toString(transform), transition }}
      grabbed={grabbed}
      dragHandle={grip}
    >
      {children}
    </Section>
  );
}

// The uptime sparkline (spec specs/uptime-sparkline.md): a row of ≤20 dots,
// oldest→newest, green(success)/red, followed by an "XX% / N checks" label.
// Renders nothing when the service has no monitoring (absent/empty checks), so
// unmonitored tiles keep their current height (AC-005/006/012). The dot row is
// aria-hidden decoration; the label text carries the accessible summary.
function UptimeSparkline({ checks }: { checks?: UptimeCheck[] }) {
  if (!checks || checks.length === 0) return null;
  const total = checks.length;
  const successes = checks.reduce((n, c) => (c.success ? n + 1 : n), 0);
  const pct = Math.round((successes / total) * 100);
  return (
    <div data-testid="uptime-sparkline" className="mt-1.5 flex flex-col gap-1">
      <div aria-hidden="true" className="flex flex-nowrap gap-0.5 overflow-hidden">
        {checks.map((c, i) => (
          <span
            key={i}
            data-testid="uptime-dot"
            data-success={c.success}
            className={`h-1.5 min-w-px flex-1 rounded-[1px] ${c.success ? 'bg-emerald-500' : 'bg-red-500'}`}
          />
        ))}
      </div>
      <span data-testid="uptime-label" className="text-xs text-neutral-400 dark:text-neutral-500">
        {pct}% / {total} {total === 1 ? 'check' : 'checks'}
      </span>
    </div>
  );
}

function ServiceTile({
  service,
  theme,
  rev,
  editMode,
  cats,
  grabbed,
  onToggleFavorite,
  onIconFlag,
  onRemoveService,
  onEditService,
  onAssignCategory,
}: {
  service: Service;
  theme: IconVariant;
  rev: number;
  editMode: boolean;
  cats: Category[];
  grabbed: boolean;
  onToggleFavorite: (id: string) => void;
  onIconFlag: (id: string, variant: IconVariant, present: boolean) => void;
  onRemoveService: (id: string) => void;
  onEditService: () => void;
  onAssignCategory: (serviceId: string, categoryId: string | null) => Promise<Result>;
}) {
  // v10: make the tile a dnd-kit sortable. The grip <button> below carries the
  // drag `listeners`/`attributes` (NOT the whole tile) so the <a> stays a clean
  // link — navigate vs. reorder never collide (D2). `transition` is gated by
  // Tailwind's motion-reduce so a reduced-motion user gets a snap, not a slide
  // (§2/A13); the position transform itself still applies so the drag works.
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition } =
    useSortable({ id: service.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid="service-tile"
      className={`tile group relative transition-transform motion-reduce:transition-none ${
        grabbed ? 'z-10 scale-[1.02] shadow-lg ring-1 ring-indigo-500/35 motion-reduce:scale-100' : ''
      }`}
    >
      <span
        data-testid="status-badge"
        data-status={service.status}
        role="img"
        title={statusLabel[service.status] ?? service.status}
        aria-label={`status: ${statusLabel[service.status] ?? service.status}`}
        className={`status-dot absolute right-3 top-3 ${statusDot[service.status] ?? statusDot.UNKNOWN}`}
      />
      {/* v10 §5.2 — the always-on drag grip. A real <button> (the single drag
          origin for pointer, touch, AND keyboard) at the bottom-right so it
          doesn't fight the "⋯" menu (top-left) or the status dot (top-right).
          Low-emphasis on desktop, always visible on touch (no hover dependency,
          §9/A14). `grabbed` drives the accent + aria-pressed (§10/A6). */}
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        data-testid="drag-handle"
        data-drag-type="tile"
        data-service-id={service.id}
        aria-label={`Reorder ${service.name}`}
        aria-pressed={grabbed}
        className={`absolute bottom-2 right-2 z-10 flex h-11 w-11 cursor-grab touch-none items-center justify-center rounded-md text-base leading-none outline-none transition focus-visible:ring-2 focus-visible:ring-indigo-500 active:cursor-grabbing sm:h-9 sm:w-9 sm:opacity-40 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 ${
          grabbed ? 'text-indigo-600 opacity-100 dark:text-indigo-400' : 'text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200'
        }`}
      >
        {grabbed && <span data-testid="drop-indicator" className="sr-only">moving</span>}
        ⠿
      </button>
      {/* v10 §7 — favoriting moved out of the (removed) arrange mode into a
          per-tile "⋯" overflow menu. The tile stays a clean <a> link; the menu
          is the one always-on per-tile control surface (the favorite toggle is
          one tap deep). */}
      <TileMenu service={service} onToggleFavorite={onToggleFavorite} />
      <a
        href={service.url}
        target="_blank"
        rel="noreferrer noopener"
        className="flex flex-col rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <img
          data-testid="service-tile-icon"
          src={iconSrc(service, theme, rev)}
          alt=""
          onError={handleIconError}
          className="tile-icon"
        />
        <span data-testid="service-tile-name" className="mt-3 truncate font-semibold text-neutral-800 dark:text-neutral-100">
          {service.name}
        </span>
        <span
          data-testid="service-tile-description"
          className="mt-0.5 truncate pr-14 text-sm text-neutral-500"
        >
          {service.description}
        </span>
        <UptimeSparkline checks={service.uptimeChecks} />
      </a>

      {editMode && (
        <IconControls
          service={service}
          cats={cats}
          onIconFlag={onIconFlag}
          onRemoveService={onRemoveService}
          onEditService={onEditService}
          onAssignCategory={onAssignCategory}
        />
      )}
    </div>
  );
}

// v10 §7 — the per-tile "⋯" overflow menu. A real <button> (top-left, the status
// dot owns top-right) that opens a small menu hosting the favorite toggle. It
// stops propagation so it's distinct from the tile link, closes on Esc /
// outside-click, and restores focus to the trigger — a standard menu pattern,
// mirroring UserMenu. Low-emphasis at rest, brighter on hover/focus-within;
// always visible on touch (no hover dependency, §9).
function TileMenu({
  service,
  onToggleFavorite,
}: {
  service: Service;
  onToggleFavorite: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // #35: this trigger lives inside a dnd-kit sortable that re-renders the node
  // during a pointer gesture, so `pointerdown` and `pointerup` land on different
  // node instances and the browser never synthesises the `click` we relied on —
  // mouse/touch could never open the menu. Act on `pointerup` (which fires
  // reliably) instead, and suppress the trailing `click` when one does arrive so
  // we don't double-toggle. A keyboard Enter/Space fires `click` with no
  // preceding pointer gesture, so that path still toggles. `pointerHandled` is
  // reset on each `pointerdown` so a stale flag can't swallow a later click.
  const pointerHandled = useRef(false);

  useEffect(() => {
    if (!open) return;
    // #35 (touch mode): dismiss on `pointerdown`, NOT `mousedown`. We OPEN the
    // menu on the trigger's `pointerup`; a touch tap then emits a *trailing
    // synthetic* `mousedown` for the same physical tap, which a mousedown
    // outside-dismiss listener (attached the instant the menu opened) would fire
    // on — slamming the just-opened menu shut (observed MENU_OPEN->MENU_CLOSE).
    // `pointerdown` is the same event family as the open gesture: the opening
    // tap's pointerdown already fired before this listener was attached, and the
    // trailing synthetic *mouse* events aren't pointer events, so they're
    // ignored. A genuinely separate tap/click outside fires a fresh pointerdown
    // and dismisses correctly (mouse emits pointerdown too, so desktop is fine).
    function onDocPointer(e: PointerEvent) {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !triggerRef.current?.contains(t)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', onDocPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDocPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const fav = service.favorite;
  return (
    // #35 (mouse mode): `z-20` lifts the trigger above the sibling tile <a>.
    // Both were position:static/z-auto, so the anchor (later in DOM) painted on
    // top at the button's CENTER — a real center click hit the link, not the
    // ⋯ button, and the menu never opened (only a thin left edge of the button
    // poked out). The drag grip already carries z-10 for exactly this reason;
    // this container had no z-index. z-20 keeps it above the grip too.
    <div className="absolute left-2 top-2 z-20">
      <button
        ref={triggerRef}
        type="button"
        data-testid="tile-menu"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`More options for ${service.name}`}
        onPointerDown={() => {
          pointerHandled.current = false;
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
          pointerHandled.current = true;
          setOpen((o) => !o);
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (pointerHandled.current) {
            pointerHandled.current = false;
            return;
          }
          setOpen((o) => !o);
        }}
        className="tile-menu-trigger flex h-11 w-11 items-center justify-center rounded-full text-lg leading-none text-neutral-400 outline-none transition hover:bg-neutral-100 hover:text-neutral-600 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-indigo-500 sm:h-9 sm:w-9 sm:opacity-40 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 dark:hover:bg-neutral-800"
      >
        ⋯
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={`${service.name} options`}
          className="absolute left-0 top-full z-10 mt-1 min-w-[10rem] rounded-lg border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-800"
        >
          <button
            type="button"
            role="menuitem"
            data-testid="favorite-toggle"
            data-favorite={fav ? 'true' : 'false'}
            aria-pressed={fav}
            onPointerDown={() => {
              pointerHandled.current = false;
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
              pointerHandled.current = true;
              onToggleFavorite(service.id);
              setOpen(false);
              triggerRef.current?.focus();
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (pointerHandled.current) {
                pointerHandled.current = false;
                return;
              }
              onToggleFavorite(service.id);
              setOpen(false);
              triggerRef.current?.focus();
            }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-neutral-700 outline-none hover:bg-neutral-100 focus-visible:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-700"
          >
            <span className={fav ? 'text-amber-400' : 'text-neutral-400'}>{fav ? '★' : '☆'}</span>
            {fav ? 'Favorited' : 'Favorite'}
          </button>
        </div>
      )}
    </div>
  );
}

// v11 §4.4 — leading icon for the edit-mode banner. A trivial inline copy of
// UserMenu's PencilIcon (kept local rather than shared — a single small SVG).
function PencilIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
    </svg>
  );
}

// onError fallback: a failed icon load collapses to the bundled local default
// so a tile never shows the browser's broken-image glyph. onerror is cleared
// first so the default (which can't fail) can't loop.
function handleIconError(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  img.onerror = null;
  img.src = DEFAULT_ICON;
}

// Per-tile edit-mode controls: upload/replace/remove a light and a dark PNG,
// plus remove the service. Client-validates each pick before upload and shows
// an inline error on reject.
function IconControls({
  service,
  cats,
  onIconFlag,
  onRemoveService,
  onEditService,
  onAssignCategory,
}: {
  service: Service;
  cats: Category[];
  onIconFlag: (id: string, variant: IconVariant, present: boolean) => void;
  onRemoveService: (id: string) => void;
  onEditService: () => void;
  onAssignCategory: (serviceId: string, categoryId: string | null) => Promise<Result>;
}) {
  return (
    <div data-testid="icon-controls" className="mt-3 border-t border-neutral-100 pt-3">
      <div className="grid grid-cols-2 gap-2">
        <IconSlot
          service={service}
          variant="light"
          present={service.iconLight}
          onIconFlag={onIconFlag}
        />
        <IconSlot
          service={service}
          variant="dark"
          present={service.iconDark}
          onIconFlag={onIconFlag}
        />
      </div>
      {/* v4: assign this app to a category (or clear to Uncategorized). Only
          shown once at least one category exists — otherwise there's nothing to
          assign to and the catalog renders flat. */}
      {cats.length > 0 && (
        <CategorySelect service={service} cats={cats} onAssign={onAssignCategory} />
      )}
      <button
        type="button"
        data-testid="edit-service"
        onClick={onEditService}
        className="mt-2 w-full rounded-lg border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
      >
        Edit app
      </button>
      <button
        type="button"
        data-testid="delete-service"
        onClick={() => onRemoveService(service.id)}
        className="mt-2 w-full rounded-lg border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
      >
        Delete service
      </button>
    </div>
  );
}

function IconSlot({
  service,
  variant,
  present,
  onIconFlag,
}: {
  service: Service;
  variant: IconVariant;
  present: boolean;
  onIconFlag: (id: string, variant: IconVariant, present: boolean) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file after a reject
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const problem = await validateIconFile(file);
      if (problem) {
        setError(problem);
        return;
      }
      const res = await uploadIcon(service.id, variant, file);
      if (!res.ok) {
        setError(res.error ?? 'Upload failed.');
        return;
      }
      onIconFlag(service.id, variant, true);
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    setError(null);
    setBusy(true);
    try {
      const ok = await deleteIcon(service.id, variant);
      if (ok) onIconFlag(service.id, variant, false);
      else setError('Remove failed.');
    } finally {
      setBusy(false);
    }
  }

  const label = variant === 'light' ? 'Light' : 'Dark';
  return (
    <div className="text-xs">
      <span className="mb-1 block font-medium text-neutral-500">{label}</span>
      <label
        className={`flex cursor-pointer items-center justify-center rounded-md border border-dashed px-2 py-1.5 text-center text-neutral-500 hover:bg-neutral-50 ${
          variant === 'dark' ? 'bg-neutral-900 text-neutral-300 hover:bg-neutral-800' : 'bg-white'
        }`}
      >
        {present ? 'Replace' : 'Upload'} PNG
        <input
          type="file"
          accept="image/png"
          data-testid={`icon-input-${variant}`}
          aria-label={`${label} icon`}
          disabled={busy}
          onChange={onPick}
          className="sr-only"
        />
      </label>
      {present && (
        <button
          type="button"
          data-testid={`icon-remove-${variant}`}
          aria-label={`Remove ${label.toLowerCase()} icon`}
          disabled={busy}
          onClick={onRemove}
          className="mt-1 w-full rounded-md px-2 py-0.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
        >
          × Remove
        </button>
      )}
      {error && (
        <p data-testid={`icon-error-${variant}`} className="mt-1 text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

// v4 admin category manager (edit mode): create a category, and per existing
// category rename / reorder / delete. Mirrors the edit-mode card idiom; every
// action surfaces the server's 403/404/409/400 inline. Shown even with zero
// categories so the first one can be created.
function CategoryManager({
  cats,
  onCreate,
  onRename,
  onDelete,
}: {
  cats: Category[];
  onCreate: (name: string) => Promise<Result>;
  onRename: (id: string, name: string) => Promise<Result>;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    const n = name.trim();
    if (!n) return;
    setError(null);
    setBusy(true);
    try {
      const r = await onCreate(n);
      if (!r.ok) setError(r.error ?? 'Could not create category.');
      else setName('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      data-testid="category-manager"
      className="rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
        Categories
      </h3>
      <div className="space-y-2">
        {cats.map((c) => (
          <CategoryRow
            key={c.id}
            cat={c}
            onRename={onRename}
            onDelete={onDelete}
          />
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          data-testid="category-name-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New category"
          className="flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-indigo-500"
        />
        <button
          type="button"
          data-testid="category-create"
          disabled={busy}
          onClick={create}
          className="rounded-lg border border-indigo-200 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50 disabled:opacity-60"
        >
          Add category
        </button>
      </div>
      {error && (
        <p data-testid="category-create-error" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

// A single category row: an inline rename field + Save, reorder arrows, and
// Delete. Local rename state is seeded from the category name; the row keys on
// the category id so it survives reorder.
function CategoryRow({
  cat,
  onRename,
  onDelete,
}: {
  cat: Category;
  onRename: (id: string, name: string) => Promise<Result>;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState(cat.name);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const n = name.trim();
    if (!n) return;
    setError(null);
    setBusy(true);
    try {
      const r = await onRename(cat.id, n);
      if (!r.ok) setError(r.error ?? 'Could not rename category.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="category-row" data-category-id={cat.id} className="flex items-center gap-1">
      <input
        data-testid="category-rename-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label={`Rename ${cat.name}`}
        className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-indigo-500"
      />
      <button
        type="button"
        data-testid="category-rename"
        disabled={busy}
        onClick={save}
        className="rounded-md border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
      >
        Save
      </button>
      <button
        type="button"
        data-testid="category-delete"
        aria-label={`Delete ${cat.name}`}
        onClick={() => onDelete(cat.id)}
        className="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
      >
        Delete
      </button>
      {error && (
        <p data-testid="category-row-error" className="ml-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

// v4 per-tile category assignment (edit mode). Picking an option PATCHes the
// service's categoryId (empty value → null, i.e. Uncategorized); a server
// rejection (e.g. 400 bogus category) surfaces inline, like an icon error.
function CategorySelect({
  service,
  cats,
  onAssign,
}: {
  service: Service;
  cats: Category[];
  onAssign: (serviceId: string, categoryId: string | null) => Promise<Result>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value || null;
    setError(null);
    setBusy(true);
    try {
      const r = await onAssign(service.id, value);
      if (!r.ok) setError(r.error ?? 'Could not assign category.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 text-xs">
      <span className="mb-1 block font-medium text-neutral-500">Category</span>
      <select
        data-testid="category-select"
        aria-label="Category"
        value={service.categoryId ?? ''}
        disabled={busy}
        onChange={onChange}
        className="w-full rounded-md border border-neutral-300 px-2 py-1 text-xs outline-none focus:border-indigo-500"
      >
        <option value="">Uncategorized</option>
        {cats.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {error && (
        <p data-testid="category-select-error" className="mt-1 text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
