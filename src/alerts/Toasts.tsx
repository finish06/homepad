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

  // Where focus goes once a toast that held it has closed (set by dismiss/view,
  // applied after the render that removed it):
  //   number   AC-008 — the Dismiss button at that index in the new stack (the
  //            toast that took its place), or else the alert bell;
  //   'panel'  AC-009 — View with the alert history already open: into the
  //            open panel (it only grabs focus when it opens).
  const focusAfter = useRef<number | 'panel' | null>(null);
  useEffect(() => {
    const target = focusAfter.current;
    if (target === null) return;
    focusAfter.current = null;
    if (target === 'panel') {
      // The panel was already open, or has just opened and focused itself.
      if (document.activeElement && document.activeElement !== document.body) return;
      document.querySelector<HTMLElement>('[role="dialog"][aria-label="Alert History"]')?.focus();
      return;
    }
    const buttons = stackRef.current?.querySelectorAll<HTMLElement>('[data-testid="toast-dismiss"]');
    (buttons?.[target] ?? document.querySelector<HTMLElement>('[data-testid="alert-bell"]'))?.focus();
  }, [queue]);

  const holdsFocus = (idx: number) => stackRef.current?.children[idx]?.contains(document.activeElement) === true;

  // AC-008 — `byKeyboard`: only a keyboard dismissal moves focus on. A mouse
  // click also focuses the button in Chrome and Firefox, and handing that
  // focus to the next toast would pause it (AC-007) for no reason, so a
  // pointer dismissal leaves focus where the browser puts it.
  function dismiss(key: string, byKeyboard: boolean) {
    const idx = queue.findIndex((t) => t.key === key);
    if (byKeyboard && holdsFocus(idx)) focusAfter.current = idx;
    setQueue((q) => q.filter((t) => t.key !== key));
  }

  // AC-009 — View opens the alert history, which takes focus as it opens. If
  // it is already open it does not, so a focused toast hands focus to it
  // rather than letting it fall to <body> as the toast unmounts.
  function view(key: string) {
    const idx = queue.findIndex((t) => t.key === key);
    if (holdsFocus(idx)) focusAfter.current = 'panel';
    setQueue((q) => q.filter((t) => t.key !== key));
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
          onDismiss={(byKeyboard) => dismiss(t.key, byKeyboard)}
          onView={onView ? () => view(t.key) : undefined}
          stack={visible.map((v) => v.key).join(' ')}
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
  stack,
}: {
  toast: Toast;
  onDismiss: (byKeyboard: boolean) => void;
  onView?: () => void;
  // Which toasts are showing, in order. When it changes the stack reflows:
  // fewer toasts, or a queued one moving up into a freed slot.
  stack: string;
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
  const ref = useRef<HTMLDivElement>(null);

  // When a toast above closes, the stack reflows and this one can slide out
  // from under a cursor that never moved, so no mouseleave fires. Re-check
  // the real hover state then, or the toast would stay paused for good.
  useEffect(() => {
    if (hovered && ref.current && !ref.current.matches(':hover')) setHovered(false);
    // Only on a reflow, not on every hover change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stack]);

  // AC-006 — auto-dismiss after 4 seconds, no interaction needed.
  // AC-007 — but never while hovered or focused: the timer stops, and resumes
  // with the time that was left once both have ended.
  useEffect(() => {
    if (paused) return;
    const started = Date.now();
    const timer = setTimeout(() => dismissRef.current(false), remaining.current);
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
      ref={ref}
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
        // A keyboard press fires a click with detail 0; a pointer click has 1+.
        onClick={(e) => onDismiss(e.detail === 0)}
        className={BUTTON}
      >
        <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
    </div>
  );
}
