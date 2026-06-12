import { useEffect, useState } from 'react';
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
} from './api';
import { DEFAULT_ICON, iconSrc, validateIconFile } from './icons';
import ServiceForm from './ServiceForm';
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
};

export default function Catalog({
  isAdmin = false,
  editMode = false,
  arrange = false,
}: {
  isAdmin?: boolean;
  editMode?: boolean;
  arrange?: boolean;
}) {
  const [items, setItems] = useState<Service[] | null>(null);
  // v4: the admin-managed categories, in sort_index order. Empty → the catalog
  // renders the flat v1 grid (A10), so v4 is invisible until an admin makes one.
  const [cats, setCats] = useState<Category[]>([]);
  // Bumped on every icon mutation to bust the <img> cache so a replaced or
  // deleted icon re-renders the new bytes (the GET URL is otherwise stable).
  const [rev, setRev] = useState(0);
  // null = closed; {} = add; { service } = edit that service (A6 admin form).
  const [form, setForm] = useState<{ service?: Service } | null>(null);
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

  useEffect(() => {
    services().then(setItems);
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

  // Move a tile one slot up (dir -1) or down (dir +1) WITHIN its section, then
  // persist the new global order. `sectionIds` is the ordered id list of the
  // section the arrow lives in, so a tile swaps with its section-neighbor — it
  // never jumps category (v4 A11). For the flat v1 grid the section is the whole
  // catalog, so this reduces to v1's adjacent swap. Optimistic with rollback to
  // the prior order if the API rejects — the pre-move snapshot is captured up
  // front so the rollback can't race a later render.
  async function moveItem(id: string, dir: -1 | 1, sectionIds: string[]) {
    const prev = items;
    if (!prev) return;
    const sIdx = sectionIds.indexOf(id);
    const targetId = sectionIds[sIdx + dir];
    if (sIdx < 0 || targetId === undefined) return;
    const gi = prev.findIndex((s) => s.id === id);
    const gj = prev.findIndex((s) => s.id === targetId);
    if (gi < 0 || gj < 0) return;
    const next = [...prev];
    [next[gi], next[gj]] = [next[gj], next[gi]];
    setItems(next);
    const ok = await setLayout(next.map((s) => s.id));
    if (!ok) setItems(prev);
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

  // Reorder one slot up (dir -1) / down (dir +1), then persist the whole-array
  // order (same contract as the per-user layout). Optimistic with rollback.
  async function moveCat(id: string, dir: -1 | 1) {
    const i = cats.findIndex((c) => c.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= cats.length) return;
    const prev = cats;
    const next = [...cats];
    [next[i], next[j]] = [next[j], next[i]];
    setCats(next);
    const ok = await setCategoryOrder(next.map((c) => c.id));
    if (!ok) setCats(prev);
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

  // A section's responsive tile grid. `sectionIds` scopes reorder to the section
  // so a tile only swaps with its section-neighbors (v4 A11); for the flat v1
  // grid the section is the whole catalog.
  function renderGrid(sectionItems: Service[]) {
    const ids = sectionItems.map((s) => s.id);
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
        {sectionItems.map((s, i) => (
          <ServiceTile
            key={s.id}
            service={s}
            index={i}
            total={sectionItems.length}
            sectionIds={ids}
            theme={theme}
            rev={rev}
            editMode={adminEdit}
            arrange={arrange}
            cats={cats}
            onToggleFavorite={toggleFavorite}
            onMove={moveItem}
            onIconFlag={setIconFlag}
            onRemoveService={removeService}
            onEditService={() => setForm({ service: s })}
            onAssignCategory={assignCat}
          />
        ))}
      </div>
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
            onMove={moveCat}
          />
        </div>
      )}

      {!grouped ? (
        items.length === 0 ? (
          <p className="text-sm text-neutral-400">
            No services in the catalog yet — an admin can add them.
          </p>
        ) : (
          renderGrid(items)
        )
      ) : (
        <div className="space-y-8">
          {/* Favorites + Uncategorized are render-time buckets, not categories
              rows, so they have no id to key collapse state on — they stay
              always-expanded for v5 (Q2). Only real category sections collapse. */}
          {favorites.length > 0 && (
            <Section title="Favorites" count={favorites.length}>{renderGrid(favorites)}</Section>
          )}
          {cats.map((c) => {
            const sectionItems = items.filter((s) => s.categoryId === c.id);
            return (
              <Section
                key={c.id}
                title={c.name}
                count={sectionItems.length}
                collapsible
                collapsed={collapsed.has(c.id)}
                error={collapseError === c.id}
                controlsId={`section-${c.id}`}
                onToggle={() => toggleCollapse(c.id)}
              >
                {renderGrid(sectionItems)}
              </Section>
            );
          })}
          {uncategorized.length > 0 && (
            <Section title="Uncategorized" count={uncategorized.length}>
              {renderGrid(uncategorized)}
            </Section>
          )}
        </div>
      )}

      {form && (
        <ServiceForm service={form.service} onClose={() => setForm(null)} onSaved={onSaved} />
      )}
    </>
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
  children,
}: {
  title: string;
  count: number;
  collapsible?: boolean;
  collapsed?: boolean;
  error?: boolean;
  controlsId?: string;
  onToggle?: () => void;
  children: React.ReactNode;
}) {
  // v4 static header (Favorites / Uncategorized): no toggle, always shows tiles.
  if (!collapsible) {
    return (
      <section>
        <h2
          data-testid="category-header"
          className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500"
        >
          {title}
        </h2>
        {children}
      </section>
    );
  }

  // A folded section shows a count so it still says how much is inside; the count
  // is omitted when expanded so the header text stays just the name (v4 parity).
  return (
    <section>
      <h2 className="mb-3">
        <button
          type="button"
          data-testid="category-header"
          aria-expanded={!collapsed}
          aria-controls={controlsId}
          onClick={onToggle}
          className="flex w-full items-center gap-1.5 rounded text-sm font-semibold uppercase tracking-wide text-neutral-500 outline-none hover:text-neutral-700 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:text-neutral-300"
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
          {collapsed && (
            <span data-testid="category-count" className="font-normal text-neutral-400">
              · {count}
            </span>
          )}
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

function ServiceTile({
  service,
  index,
  total,
  sectionIds,
  theme,
  rev,
  editMode,
  arrange,
  cats,
  onToggleFavorite,
  onMove,
  onIconFlag,
  onRemoveService,
  onEditService,
  onAssignCategory,
}: {
  service: Service;
  index: number;
  total: number;
  sectionIds: string[];
  theme: IconVariant;
  rev: number;
  editMode: boolean;
  arrange: boolean;
  cats: Category[];
  onToggleFavorite: (id: string) => void;
  onMove: (id: string, dir: -1 | 1, sectionIds: string[]) => void;
  onIconFlag: (id: string, variant: IconVariant, present: boolean) => void;
  onRemoveService: (id: string) => void;
  onEditService: () => void;
  onAssignCategory: (serviceId: string, categoryId: string | null) => Promise<Result>;
}) {
  return (
    <div
      data-testid="service-tile"
      className="relative rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900"
    >
      <span
        data-testid="status-badge"
        data-status={service.status}
        title={service.status}
        aria-label={`status: ${service.status}`}
        className={`absolute right-3 top-3 h-2.5 w-2.5 rounded-full ${statusDot[service.status] ?? statusDot.UNKNOWN}`}
      />
      {/* A5.1: the favorite ★ toggle is a personalization control, revealed only
          in Arrange mode alongside the reorder arrows. Favorited tiles still pin
          to the top in the normal view (server-driven order) — only this editable
          control is gated, never the favorites feature or the pinning. */}
      {arrange && (
        <button
          type="button"
          data-testid="favorite-toggle"
          data-favorite={service.favorite ? 'true' : 'false'}
          aria-pressed={service.favorite}
          aria-label={service.favorite ? 'Unfavorite' : 'Favorite'}
          title={service.favorite ? 'Unfavorite' : 'Favorite'}
          onClick={() => onToggleFavorite(service.id)}
          className={`absolute left-2 top-2 flex h-8 w-8 items-center justify-center rounded-full text-lg leading-none outline-none transition hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-indigo-500 ${
            service.favorite ? 'text-amber-400' : 'text-neutral-300 hover:text-neutral-400'
          }`}
        >
          {service.favorite ? '★' : '☆'}
        </button>
      )}
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
          className="h-12 w-12 rounded-lg object-contain"
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
      </a>

      {editMode ? (
        <IconControls
          service={service}
          cats={cats}
          onIconFlag={onIconFlag}
          onRemoveService={onRemoveService}
          onEditService={onEditService}
          onAssignCategory={onAssignCategory}
        />
      ) : arrange ? (
        <div className="absolute bottom-2 right-2 flex gap-1">
          <button
            type="button"
            data-testid="move-up"
            aria-label="Move up"
            title="Move up"
            disabled={index === 0}
            onClick={() => onMove(service.id, -1, sectionIds)}
            className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-400 outline-none transition hover:bg-neutral-100 hover:text-neutral-600 focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:pointer-events-none disabled:opacity-30"
          >
            ↑
          </button>
          <button
            type="button"
            data-testid="move-down"
            aria-label="Move down"
            title="Move down"
            disabled={index === total - 1}
            onClick={() => onMove(service.id, 1, sectionIds)}
            className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-400 outline-none transition hover:bg-neutral-100 hover:text-neutral-600 focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:pointer-events-none disabled:opacity-30"
          >
            ↓
          </button>
        </div>
      ) : null}
    </div>
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
  onMove,
}: {
  cats: Category[];
  onCreate: (name: string) => Promise<Result>;
  onRename: (id: string, name: string) => Promise<Result>;
  onDelete: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
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
        {cats.map((c, i) => (
          <CategoryRow
            key={c.id}
            cat={c}
            index={i}
            total={cats.length}
            onRename={onRename}
            onDelete={onDelete}
            onMove={onMove}
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
  index,
  total,
  onRename,
  onDelete,
  onMove,
}: {
  cat: Category;
  index: number;
  total: number;
  onRename: (id: string, name: string) => Promise<Result>;
  onDelete: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
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
        data-testid="category-move-up"
        aria-label={`Move ${cat.name} up`}
        disabled={index === 0}
        onClick={() => onMove(cat.id, -1)}
        className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 disabled:pointer-events-none disabled:opacity-30"
      >
        ↑
      </button>
      <button
        type="button"
        data-testid="category-move-down"
        aria-label={`Move ${cat.name} down`}
        disabled={index === total - 1}
        onClick={() => onMove(cat.id, 1)}
        className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 disabled:pointer-events-none disabled:opacity-30"
      >
        ↓
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
