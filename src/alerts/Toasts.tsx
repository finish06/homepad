// cap5 — Status-Change Toast Alerts.
//
// A small, self-contained overlay that watches `recentChanges` on the services
// context (set by the v13 poller when a service flips between UP/DOWN/DEGRADED)
// and surfaces a brief bottom-right toast per flip. Toasts auto-dismiss after
// 4s, stack newest-at-bottom, cap at 3 visible (the rest queue), and never fire
// on initial load (the provider leaves recentChanges empty for the baseline) or
// while the tab is hidden.
//
// SPEC-ui-quick-wins §3.3 (AC-007..AC-009) supersedes cap5's "click to navigate
// is out of scope" line: a toast pauses while hovered or focused, has a Dismiss
// button, and a status toast (every toast today) has a "View" button that opens
// the alert history panel (decided §7 Q2). The 4s time and the 3-toast cap are
// unchanged.
import { useEffect, useRef, useState } from 'react';
import { useServicesContext, type StatusChange } from '../services';

type Toast = { key: string; change: StatusChange };

// How long a toast stays when nobody is looking at it (cap5 AC-006).
const TOAST_MS = 4_000;

export default function ToastContainer({ onView }: { onView?: () => void } = {}) {
  const ctx = useServicesContext();
  const recentChanges = ctx?.recentChanges;
  const [queue, setQueue] = useState<Toast[]>([]);
  // Dedup so a re-render with the same recentChanges reference can't double-enqueue.
  const seen = useRef(new Set<string>());
  const stackRef = useRef<HTMLDivElement>(null);
  // AC-008 — set when a toast that held focus closes: the index (in the new
  // visible stack) whose Dismiss button takes focus after the render.
  const focusAfter = useRef<number | null>(null);

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
    // AC-015 — drain the context queue now that we've taken ownership of these
    // changes, so a later ToastContainer mount can't replay them as ghost toasts.
    ctx?.clearRecentChanges();
  }, [recentChanges]);

  // AC-008 — if focus was inside the toast that just closed, it goes to the
  // toast that took its place (the next one down), or else to the alert bell.
  useEffect(() => {
    const i = focusAfter.current;
    if (i === null) return;
    focusAfter.current = null;
    const buttons = stackRef.current?.querySelectorAll<HTMLElement>('[data-testid="toast-dismiss"]');
    const target = buttons?.[i] ?? document.querySelector<HTMLElement>('[data-testid="alert-bell"]');
    target?.focus();
  }, [queue]);

  function dismiss(key: string, moveFocus = true) {
    const idx = queue.findIndex((t) => t.key === key);
    const el = stackRef.current?.children[idx];
    if (moveFocus && el?.contains(document.activeElement)) focusAfter.current = idx;
    setQueue((q) => q.filter((t) => t.key !== key));
  }

  // AC-009 — View opens the alert history, which takes focus itself, so the
  // closing toast must not also pull focus to a sibling or the bell.
  function view(key: string) {
    dismiss(key, false);
    onView?.();
  }

  // AC-008 — at most 3 visible; the queue holds the rest until earlier ones clear.
  const visible = queue.slice(0, 3);
  if (visible.length === 0) return null;

  return (
    // AC-014 — the overlay never blocks the dashboard; only the toasts catch events.
    <div ref={stackRef} className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {visible.map((t) => (
        <ToastItem
          key={t.key}
          toast={t}
          onDismiss={() => dismiss(t.key)}
          onView={onView ? () => view(t.key) : undefined}
        />
      ))}
    </div>
  );
}

const BUTTON =
  'inline-flex min-h-6 min-w-6 items-center justify-center rounded text-neutral-600 outline-none hover:bg-neutral-100 hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-neutral-300 dark:hover:bg-neutral-700 dark:hover:text-white';

function ToastItem({
  toast,
  onDismiss,
  onView,
}: {
  toast: Toast;
  onDismiss: () => void;
  onView?: () => void;
}) {
  const { change } = toast;
  const isDown = change.to === 'DOWN' || change.to === 'DEGRADED';
  const label = isDown ? `${change.name} went ${change.to}` : `${change.name} is back UP`;
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;
  // Time left on the clock; it runs down only while the toast is not paused.
  const remaining = useRef(TOAST_MS);
  // The latest onDismiss, so the timer never calls a stale one.
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  // AC-006 — auto-dismiss after 4 seconds, no interaction needed.
  // AC-007 — but never while hovered or focused: the timer stops, and resumes
  // with the time that was left once both have ended.
  useEffect(() => {
    if (paused) return;
    const started = Date.now();
    const timer = setTimeout(() => dismissRef.current(), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - started));
    };
  }, [paused]);

  // AC-009 — red accent for trouble, green for recovery; readable in both themes.
  // AC-010 — assertive for DOWN/DEGRADED, polite for recoveries. The live
  // region holds the message alone, so the button names are not read with it.
  // AC-011 — the `.toast-item` slide/fade is disabled under prefers-reduced-motion
  // (see index.css), so reduced-motion users get an instant appear.
  const accent = isDown ? 'border-red-500' : 'border-emerald-500';
  return (
    <div
      data-testid="toast"
      data-paused={paused}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        // Focus moving between this toast's own buttons is not a blur of the toast.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
      className={`toast-item pointer-events-auto flex min-w-56 max-w-xs items-center gap-2 rounded border-l-4 ${accent} bg-white py-2 pl-4 pr-2 text-sm font-medium text-neutral-900 shadow-lg dark:bg-neutral-800 dark:text-neutral-100`}
    >
      <span role="status" aria-live={isDown ? 'assertive' : 'polite'} className="flex-1 py-1">
        {label}
      </span>
      {onView && (
        <button type="button" data-testid="toast-view" onClick={onView} className={`${BUTTON} px-2 underline`}>
          View
        </button>
      )}
      <button
        type="button"
        data-testid="toast-dismiss"
        aria-label="Dismiss"
        title="Dismiss"
        onClick={onDismiss}
        className={BUTTON}
      >
        <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
    </div>
  );
}
