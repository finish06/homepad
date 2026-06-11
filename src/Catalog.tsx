import { useEffect, useState } from 'react';
import {
  deleteIcon,
  deleteService,
  services,
  setFavorite,
  setLayout,
  uploadIcon,
  type IconVariant,
  type Service,
  type ServiceStatus,
} from './api';
import { DEFAULT_ICON, iconSrc, validateIconFile } from './icons';
import ServiceForm from './ServiceForm';
import { useResolvedTheme } from './theme';

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
  // Bumped on every icon mutation to bust the <img> cache so a replaced or
  // deleted icon re-renders the new bytes (the GET URL is otherwise stable).
  const [rev, setRev] = useState(0);
  // null = closed; {} = add; { service } = edit that service (A6 admin form).
  const [form, setForm] = useState<{ service?: Service } | null>(null);
  // v3: the active theme is now the resolved theme from ThemeProvider (pref +
  // OS), so the icon variant follows the System/Light/Dark control — not just
  // the OS. Without a provider (isolated tests) it falls back to the live OS.
  const theme = useResolvedTheme();

  useEffect(() => {
    services().then(setItems);
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

  // Move a tile one slot up (dir -1) or down (dir +1), then persist the new
  // order. Optimistic with rollback to the prior order if the API rejects —
  // same shape as toggleFavorite. The pre-move snapshot is captured up front so
  // the rollback can't race a later render.
  async function moveItem(id: string, dir: -1 | 1) {
    const prev = items;
    if (!prev) return;
    const idx = prev.findIndex((s) => s.id === id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= prev.length) return;
    const next = [...prev];
    [next[idx], next[target]] = [next[target], next[idx]];
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

  if (items === null) {
    return <p className="text-sm text-neutral-400">loading services…</p>;
  }

  const adminEdit = isAdmin && editMode;

  return (
    <>
      {adminEdit && (
        <div className="mb-4">
          <button
            type="button"
            data-testid="add-service"
            onClick={() => setForm({})}
            className="rounded-lg border border-indigo-200 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50"
          >
            + Add app
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-neutral-400">
          No services in the catalog yet — an admin can add them.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
          {items.map((s, i) => (
            <ServiceTile
              key={s.id}
              service={s}
              index={i}
              total={items.length}
              theme={theme}
              rev={rev}
              editMode={adminEdit}
              arrange={arrange}
              onToggleFavorite={toggleFavorite}
              onMove={moveItem}
              onIconFlag={setIconFlag}
              onRemoveService={removeService}
              onEditService={() => setForm({ service: s })}
            />
          ))}
        </div>
      )}

      {form && (
        <ServiceForm service={form.service} onClose={() => setForm(null)} onSaved={onSaved} />
      )}
    </>
  );
}

function ServiceTile({
  service,
  index,
  total,
  theme,
  rev,
  editMode,
  arrange,
  onToggleFavorite,
  onMove,
  onIconFlag,
  onRemoveService,
  onEditService,
}: {
  service: Service;
  index: number;
  total: number;
  theme: IconVariant;
  rev: number;
  editMode: boolean;
  arrange: boolean;
  onToggleFavorite: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onIconFlag: (id: string, variant: IconVariant, present: boolean) => void;
  onRemoveService: (id: string) => void;
  onEditService: () => void;
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
          onIconFlag={onIconFlag}
          onRemoveService={onRemoveService}
          onEditService={onEditService}
        />
      ) : arrange ? (
        <div className="absolute bottom-2 right-2 flex gap-1">
          <button
            type="button"
            data-testid="move-up"
            aria-label="Move up"
            title="Move up"
            disabled={index === 0}
            onClick={() => onMove(service.id, -1)}
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
            onClick={() => onMove(service.id, 1)}
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
  onIconFlag,
  onRemoveService,
  onEditService,
}: {
  service: Service;
  onIconFlag: (id: string, variant: IconVariant, present: boolean) => void;
  onRemoveService: (id: string) => void;
  onEditService: () => void;
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
