// cap5 — Status-Change Toast Alerts.
//
// A small, self-contained overlay that watches `recentChanges` on the services
// context (set by the v13 poller when a service flips between UP/DOWN/DEGRADED)
// and surfaces a brief bottom-right toast per flip. Toasts auto-dismiss after
// 4s, stack newest-at-bottom, cap at 3 visible (the rest queue), and never fire
// on initial load (the provider leaves recentChanges empty for the baseline) or
// while the tab is hidden. Informational only — no tap target, no history.
import { useEffect, useRef, useState } from 'react';
import { useServicesContext, type StatusChange } from './services';

type Toast = { key: string; change: StatusChange };

export default function ToastContainer() {
  const ctx = useServicesContext();
  const recentChanges = ctx?.recentChanges;
  const [queue, setQueue] = useState<Toast[]>([]);
  // Dedup so a re-render with the same recentChanges reference can't double-enqueue.
  const seen = useRef(new Set<string>());

  // Enqueue toasts whenever a fresh batch of changes arrives. Empty on initial
  // load (AC-003); dropped entirely while the tab is hidden (AC-012).
  useEffect(() => {
    if (!recentChanges || recentChanges.length === 0) return;
    if (document.visibilityState === 'hidden') return;
    const incoming: Toast[] = [];
    recentChanges.forEach((c) => {
      const key = `${c.id}-${c.to}-${Date.now()}`;
      if (seen.current.has(key)) return;
      seen.current.add(key);
      incoming.push({ key, change: c });
    });
    if (incoming.length) setQueue((q) => [...q, ...incoming]);
  }, [recentChanges]);

  function dismiss(key: string) {
    setQueue((q) => q.filter((t) => t.key !== key));
  }

  // AC-008 — at most 3 visible; the queue holds the rest until earlier ones clear.
  const visible = queue.slice(0, 3);
  if (visible.length === 0) return null;

  return (
    // AC-014 — the overlay never blocks the dashboard; only the toasts catch events.
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {visible.map((t) => (
        <ToastItem key={t.key} toast={t} onDismiss={() => dismiss(t.key)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const { change } = toast;
  const isDown = change.to === 'DOWN' || change.to === 'DEGRADED';
  const label = isDown ? `${change.name} went ${change.to}` : `${change.name} is back UP`;

  // AC-006 — auto-dismiss after 4 seconds, no interaction needed.
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4_000);
    return () => clearTimeout(timer);
    // onDismiss is stable per toast key; run the timer once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // AC-009 — red accent for trouble, green for recovery; readable in both themes.
  // AC-010 — assertive for DOWN/DEGRADED, polite for recoveries.
  // AC-011 — the `.toast-item` slide/fade is disabled under prefers-reduced-motion
  // (see index.css), so reduced-motion users get an instant appear.
  const accent = isDown ? 'border-red-500' : 'border-emerald-500';
  return (
    <div
      role="status"
      aria-live={isDown ? 'assertive' : 'polite'}
      className={`toast-item pointer-events-auto min-w-56 max-w-xs rounded border-l-4 ${accent} bg-white px-4 py-3 text-sm font-medium text-neutral-900 shadow-lg dark:bg-neutral-800 dark:text-neutral-100`}
    >
      {label}
    </div>
  );
}
