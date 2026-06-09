import { useEffect, useState } from 'react';
import { services, setFavorite, setLayout, type Service, type ServiceStatus } from './api';

// Small colored dot per tile — UP green, DOWN red, DEGRADED amber, UNKNOWN gray.
const statusDot: Record<ServiceStatus, string> = {
  UP: 'bg-emerald-500',
  DOWN: 'bg-red-500',
  DEGRADED: 'bg-amber-400',
  UNKNOWN: 'bg-neutral-300',
};

export default function Catalog() {
  const [items, setItems] = useState<Service[] | null>(null);

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

  if (items === null) {
    return <p className="text-sm text-neutral-400">loading services…</p>;
  }
  if (items.length === 0) {
    return (
      <p className="text-sm text-neutral-400">
        No services in the catalog yet — an admin can add them.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
      {items.map((s, i) => (
        <ServiceTile
          key={s.id}
          service={s}
          index={i}
          total={items.length}
          onToggleFavorite={toggleFavorite}
          onMove={moveItem}
        />
      ))}
    </div>
  );
}

function ServiceTile({
  service,
  index,
  total,
  onToggleFavorite,
  onMove,
}: {
  service: Service;
  index: number;
  total: number;
  onToggleFavorite: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
}) {
  const icon = `https://cdn.jsdelivr.net/gh/selfhst/icons/svg/${service.icon || 'cog'}.svg`;
  return (
    <div
      data-testid="service-tile"
      className="relative rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <span
        data-testid="status-badge"
        data-status={service.status}
        title={service.status}
        aria-label={`status: ${service.status}`}
        className={`absolute right-3 top-3 h-2.5 w-2.5 rounded-full ${statusDot[service.status] ?? statusDot.UNKNOWN}`}
      />
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
      <a
        href={service.url}
        target="_blank"
        rel="noreferrer noopener"
        className="flex flex-col rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <img
          data-testid="service-tile-icon"
          src={icon}
          alt=""
          className="h-12 w-12 rounded-lg object-contain"
        />
        <span data-testid="service-tile-name" className="mt-3 truncate font-semibold text-neutral-800">
          {service.name}
        </span>
        <span
          data-testid="service-tile-description"
          className="mt-0.5 truncate text-sm text-neutral-500"
        >
          {service.description}
        </span>
      </a>
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
    </div>
  );
}
