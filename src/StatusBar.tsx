// v14 — Dashboard Status Summary Bar. A compact strip below the sticky header
// summarizing fleet health from the already-loaded ServicesContext array (no new
// fetch). UNKNOWN is intentionally excluded — it is a monitoring-infra signal,
// not a per-service health reading; the tile's gray dot already surfaces it.

import { useServicesContext } from './services';

export default function StatusBar() {
  const ctx = useServicesContext();
  if (!ctx?.items) return null;

  const up = ctx.items.filter((s) => s.status === 'UP').length;
  const down = ctx.items.filter((s) => s.status === 'DOWN' || s.status === 'DEGRADED').length;
  const notMonitored = ctx.items.filter((s) => s.status === 'NOT_MONITORED').length;

  const segments: { id: string; label: string; className: string }[] = [];
  if (up > 0)
    segments.push({ id: 'status-bar-up', label: `${up} UP`, className: 'text-emerald-600 dark:text-emerald-400' });
  if (down > 0)
    segments.push({ id: 'status-bar-down', label: `${down} DOWN`, className: 'text-red-600 dark:text-red-500' });
  if (notMonitored > 0)
    segments.push({
      id: 'status-bar-not-monitored',
      label: `${notMonitored} not monitored`,
      className: 'text-neutral-500 dark:text-neutral-400',
    });

  if (segments.length === 0) return null;

  return (
    <div
      data-testid="status-bar"
      role="status"
      aria-label="Service status summary"
      className="border-b border-neutral-100 bg-white/50 py-1.5 text-center text-xs font-medium tracking-wide dark:border-neutral-800/50 dark:bg-neutral-900/50"
    >
      {segments.map((seg, i) => (
        <span key={seg.id}>
          {i > 0 && <span className="mx-2 text-neutral-300 dark:text-neutral-600">·</span>}
          <span data-testid={seg.id} className={seg.className}>
            {seg.label}
          </span>
        </span>
      ))}
    </div>
  );
}
