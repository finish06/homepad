# Spec: Status-Change Toast Alerts — Capability #5

**Version:** 0.2.0
**Created:** 2026-06-23
**Author:** Walt (product lead)
**Status:** Shipped — bug-fix required (see AC-015, issue #147)
**Repo:** `Code/homepad` (frontend only — no backend changes)
**Estimate:** ~30 minutes
**Depends on:** v13 live-status-refresh (shipped), v14 StatusBar (shipped)

---

## 1. Overview

The v13 poller refreshes service statuses every ~60 seconds. When a service
flips UP→DOWN or DOWN→UP between polls, the dashboard updates silently —
tiles repaint and the StatusBar count shifts. A user watching a different
app or glancing back at the tab has no indication that something just changed.

This capability adds a **brief toast notification** whenever a service
changes from UP to DOWN (or DEGRADED), or from DOWN/DEGRADED back to UP.
Toasts appear in the bottom-right corner, stack if multiple services flip in
the same poll cycle, and auto-dismiss after 4 seconds. No user interaction
required; no backend changes.

### User story

As a homelab user with my dashboard open in a background tab, when I switch
back after a network event, I want to see a brief "MyService went DOWN" (or
"back UP") toast so I immediately know what changed without scanning every
tile.

### What this is NOT

This is a lightweight ambient alert — not an alarm, not a persistent
notification, not an audit log. It surfaces what the *current poll cycle*
detected. If the tab is closed or the browser is offline when the flip
happens, no toast fires. That is acceptable — users who need guaranteed
alerting have Gatus's own notification integrations.

---

## 2. Acceptance Criteria

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-001 | When a service's status changes from UP to DOWN or DEGRADED between two consecutive polls, a toast appears reading **"[Service name] went DOWN"** (or "went DEGRADED"). | Must |
| AC-002 | When a service's status changes from DOWN or DEGRADED to UP between two consecutive polls, a toast appears reading **"[Service name] is back UP"**. | Must |
| AC-003 | **No toast fires on initial page load.** The first fetch sets the baseline; toasts only fire from the *second* fetch onward when a diff is detected. | Must |
| AC-004 | Status changes between UNKNOWN and any other state do **not** trigger a toast. UNKNOWN means the monitoring check hasn't run yet — it is infrastructure noise, not a real flip. | Must |
| AC-005 | Status changes involving NOT_MONITORED do **not** trigger a toast. These tiles are not wired to Gatus. | Must |
| AC-006 | Toasts auto-dismiss after **4 seconds** without any user interaction. | Must |
| AC-007 | If multiple services flip in a single poll cycle, each service gets its own toast. Toasts stack vertically (newest on top, or newest at bottom — consistent direction). | Must |
| AC-008 | At most **3 toasts** are visible at once. If more than 3 changes arrive in one cycle, queue the extras; they appear as earlier ones dismiss. | Should |
| AC-009 | DOWN / DEGRADED toasts use a **red/amber visual accent**; UP toasts use a **green accent**. The design must be readable in both light and dark mode. | Must |
| AC-010 | Toasts carry `role="status"` and `aria-live="polite"` for UP recoveries, and `aria-live="assertive"` for DOWN/DEGRADED alerts, so screen readers announce them without disrupting reading flow unnecessarily. | Should |
| AC-011 | Under `prefers-reduced-motion`, toasts appear and disappear instantly (no slide/fade animation). | Must |
| AC-012 | Toasts do **not** appear while the tab is hidden (`document.visibilityState === 'hidden'`). If a poll fires while hidden and detects changes, those changes are silently dropped — the next visible poll is the source of truth. | Must |
| AC-013 | The existing tile pulse animation (v13) still fires alongside toasts — the two signals are independent. | Must |
| AC-014 | Toasts do not block interaction with any part of the dashboard (pointer-events pass through the overlay area when no toast is visible). | Must |
| AC-015 | `recentChanges` in context **must be reset to `[]` immediately after `ToastContainer` consumes it.** If `ToastContainer` unmounts and remounts while `ServicesProvider` is still alive, the fresh mount must not re-fire ghost toasts from a prior poll cycle. Expose a `clearRecentChanges` callback in context; `ToastContainer` calls it after enqueuing. | Must |

---

## 3. User Test Cases

### TC-001: Service goes DOWN
**Precondition:** Dashboard loaded, all services UP. Simulate: change one service's
status to DOWN on the next poll (or mock the API response).
1. Wait for the next poll cycle (~60s, or trigger via tab hide/show).
**Expected:** Toast appears bottom-right: "MyService went DOWN" with red accent.
Disappears after 4 seconds. Tile pulse also fires.

### TC-002: Service recovers to UP
**Precondition:** One service is DOWN. Simulate recovery on next poll.
1. Wait for next poll.
**Expected:** Toast appears: "MyService is back UP" with green accent. Disappears after 4 seconds.

### TC-003: No toast on initial load
**Precondition:** Fresh page load (or hard-refresh). Services have various statuses.
**Expected:** No toasts appear on first render — regardless of how many DOWN services exist.

### TC-004: Multiple simultaneous flips
**Precondition:** Two services flip DOWN in the same poll response.
**Expected:** Two stacked toasts — one per service. Each has its own 4-second timer.

### TC-005: UNKNOWN status — no toast
**Precondition:** A service flips from UP to UNKNOWN (e.g. Gatus check not yet run).
**Expected:** No toast fires.

### TC-006: Dark mode
**Precondition:** Dark mode enabled, one service goes DOWN.
**Expected:** DOWN toast is readable on the dark background (red accent visible, text legible).

### TC-007: Reduced motion
**Precondition:** OS/browser `prefers-reduced-motion: reduce`.
**Expected:** Toast appears and disappears without slide/fade — immediate show and hide.

### TC-008: Tab hidden during flip
**Precondition:** Switch away from the tab. While hidden, a poll detects a service going DOWN.
**Expected:** No toast appears when you return (the change was dropped). The tile and StatusBar
will reflect the new status (v13 behaviour), but no toast for that missed event.

---

## 4. Implementation Guidance for Stitch

### Architecture: two small additions + one context extension

**New files:**
- `src/Toasts.tsx` — the toast container + individual toast component

**Modified files:**
- `src/services.tsx` — extend `mergeStatuses` to return detected changes; add
  `recentChanges` to context
- `src/App.tsx` — mount `<ToastContainer />` inside `<ServicesProvider>`

---

### Step 1 — Extend `services.tsx`

Add a `StatusChange` type and modify `mergeStatuses` to return both the merged
array AND the list of meaningful transitions:

```tsx
export type ServiceStatus = 'UP' | 'DOWN' | 'DEGRADED' | 'UNKNOWN' | 'NOT_MONITORED';

export type StatusChange = {
  id: string;
  name: string;
  from: ServiceStatus;
  to: ServiceStatus;
};

// The statuses worth toasting — exclude monitoring-infra states (AC-004, AC-005)
const TOASTABLE: Set<ServiceStatus> = new Set(['UP', 'DOWN', 'DEGRADED']);

export function mergeStatuses(
  current: Service[],
  fresh: Service[],
): { next: Service[]; changes: StatusChange[] } {
  const byId = new Map(fresh.map((s) => [s.id, s]));
  const changes: StatusChange[] = [];
  let changed = false;
  const next = current.map((s) => {
    const f = byId.get(s.id);
    if (!f) return s;
    if (f.status === s.status && sameChecks(s.uptimeChecks, f.uptimeChecks)) return s;
    changed = true;
    // Only surface transitions between toastable states (AC-004, AC-005)
    if (s.status !== f.status && TOASTABLE.has(s.status) && TOASTABLE.has(f.status)) {
      changes.push({ id: s.id, name: s.name, from: s.status, to: f.status });
    }
    return { ...s, status: f.status, uptimeChecks: f.uptimeChecks };
  });
  return { next: changed ? next : current, changes };
}
```

> Note: `mergeStatuses` is already exported and tested. Update its return type
> and fix all call sites (just `services.tsx` itself and any tests).

Extend `ServicesContextValue` with a toast queue:

```tsx
export type ServicesContextValue = {
  items: Service[] | null;
  setItems: React.Dispatch<React.SetStateAction<Service[] | null>>;
  lastUpdatedAt: number | null;
  // cap5: status changes from the most-recent poll (empty on initial load, AC-003)
  recentChanges: StatusChange[];
};
```

In `ServicesProvider`, after merging statuses on a non-initial poll, set `recentChanges`:

```tsx
const [recentChanges, setRecentChanges] = useState<StatusChange[]>([]);

// Inside load():
if (initial) {
  setItems(fresh);
  setLastUpdatedAt(Date.now());
  // Do NOT set recentChanges — initial load is baseline (AC-003)
} else {
  const { next, changes } = mergeStatuses(cur ?? [], fresh);
  setItems(next);
  setLastUpdatedAt(Date.now());
  if (changes.length) setRecentChanges(changes);
}
```

Extend `ServicesContextValue` with a `clearRecentChanges` callback (AC-015):

```tsx
export type ServicesContextValue = {
  items: Service[] | null;
  setItems: React.Dispatch<React.SetStateAction<Service[] | null>>;
  lastUpdatedAt: number | null;
  recentChanges: StatusChange[];
  clearRecentChanges: () => void;  // AC-015: called by ToastContainer after consuming
};
```

In `ServicesProvider`, expose `clearRecentChanges: () => setRecentChanges([])` and pass both through the context value.

---

### Step 2 — `src/Toasts.tsx`

A toast entry type + container that consumes `recentChanges` from context:

```tsx
type Toast = { id: string; change: StatusChange };

export default function ToastContainer() {
  const ctx = useServicesContext();
  const [queue, setQueue] = useState<Toast[]>([]);
  const seen = useRef(new Set<string>());  // dedup by change id+to key

  // When recentChanges updates, enqueue new toasts (AC-003: empty on initial load)
  useEffect(() => {
    if (!ctx?.recentChanges.length) return;
    // AC-012: skip if hidden
    if (document.visibilityState === 'hidden') return;
    const incoming = ctx.recentChanges
      .map((c) => ({ id: `${c.id}-${c.to}-${Date.now()}`, change: c }))
      .filter((t) => !seen.current.has(t.id));
    incoming.forEach((t) => seen.current.add(t.id));
    setQueue((q) => [...q, ...incoming]);
    // AC-015: reset context so a remounted ToastContainer can't replay ghost toasts
    ctx.clearRecentChanges();
  }, [ctx?.recentChanges]);

  function dismiss(id: string) {
    setQueue((q) => q.filter((t) => t.id !== id));
  }

  // AC-008: show at most 3 at once (the queue holds the rest)
  const visible = queue.slice(0, 3);

  return (
    <div
      aria-live="polite"   // individual toasts override with assertive for DOWN (AC-010)
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"  // AC-014
    >
      {visible.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  );
}
```

Individual `ToastItem` handles the 4-second auto-dismiss timer and styling:

```tsx
const isDown = t.change.to === 'DOWN' || t.change.to === 'DEGRADED';
const label = isDown
  ? `${t.change.name} went ${t.change.to}`
  : `${t.change.name} is back UP`;

// AC-006: auto-dismiss after 4 s
useEffect(() => {
  const timer = setTimeout(() => onDismiss(), 4_000);
  return () => clearTimeout(timer);
}, []);
```

Tailwind classes for the toast surface (light + dark mode, AC-009):
```
// DOWN: bg-white dark:bg-neutral-800 border-l-4 border-red-500 shadow-lg rounded
// UP:   bg-white dark:bg-neutral-800 border-l-4 border-emerald-500 shadow-lg rounded
```

For reduced motion (AC-011), add `motion-safe:` prefix to any transition/animation
class, or check `prefers-reduced-motion` via `window.matchMedia` and skip the class.

---

### Step 3 — Mount in `App.tsx`

Inside `Home`, after `<ServicesProvider>` is mounted, add `<ToastContainer />` as a
sibling to the existing children (it can go anywhere inside the provider, since it
reads from context):

```tsx
// src/App.tsx — inside <ServicesProvider>
<ToastContainer />
```

No other change to App.tsx structure needed.

---

### Step 4 — Update call sites for `mergeStatuses`

`mergeStatuses` now returns `{ next, changes }` instead of the array directly.
Update all usages:

```tsx
// Before (services.tsx load function):
setItems((cur) => (cur && status === 200 ? mergeStatuses(cur, fresh) : fresh));

// After:
setItems((cur) => {
  if (!cur || status !== 200) return fresh;
  const { next } = mergeStatuses(cur, fresh);
  return next;
});
```

---

## 5. Test plan

Stitch should add tests in a new `src/Toasts.test.tsx` and update
`src/services.test.tsx` (or wherever `mergeStatuses` is tested):

| Test | File | Description |
|------|------|-------------|
| T-001 | services.test.tsx | `mergeStatuses` returns `changes=[]` when nothing changed |
| T-002 | services.test.tsx | `mergeStatuses` returns a `StatusChange` entry when UP→DOWN |
| T-003 | services.test.tsx | `mergeStatuses` returns a `StatusChange` entry when DOWN→UP |
| T-004 | services.test.tsx | `mergeStatuses` returns NO `StatusChange` for UNKNOWN↔UP (AC-004) |
| T-005 | services.test.tsx | `mergeStatuses` returns NO `StatusChange` for NOT_MONITORED↔UP (AC-005) |
| T-006 | Toasts.test.tsx | Toast renders with service name + "went DOWN" label for a DOWN change |
| T-007 | Toasts.test.tsx | Toast renders "is back UP" for an UP change |
| T-008 | Toasts.test.tsx | Toast is not rendered on initial context load (`recentChanges=[]`) |
| T-009 | Toasts.test.tsx | Toast auto-dismisses after 4 seconds (fake timers) |
| T-010 | Toasts.test.tsx | Multiple simultaneous changes produce multiple toasts |
| T-011 | Toasts.test.tsx | At most 3 toasts visible when 4+ changes arrive (AC-008) |
| T-012 | Toasts.test.tsx | Ghost-toast regression (AC-015): after `ToastContainer` consumes changes, `clearRecentChanges` is called; a fresh `ToastContainer` mount finds `recentChanges=[]` and fires no toasts |

---

## 6. Out of Scope

- **Persistent notification log** — toasts are ephemeral; no history panel
- **Click to navigate to service** — toasts are informational only; no tap target
- **Missed-event replay** — if the tab is hidden and changes are missed, no backfill
- **DEGRADED→DOWN or DOWN→DEGRADED transitions** — these are both "trouble" states;
  toasting a DEGRADED→DOWN flip adds noise without clear user value; excluded for now
- **Sound / vibration** — ambient-only; no audio alerts
- **Per-service toast opt-out** — blanket feature; no per-tile mute
- **Push notifications** — browser-level, requires permission flow; deferred

---

## 7. Revision History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2026-06-23 | 0.1.0 | Walt | Initial spec — grounded in services.tsx mergeStatuses, v13 polling, v14 StatusBar; cap3+cap4 patterns |
| 2026-06-26 | 0.2.0 | Walt | **AC-015 (mandatory):** `recentChanges` must be reset to `[]` after consumption. Adds `clearRecentChanges` to context; `ToastContainer` calls it post-enqueue. Fixes ghost-toast regression identified in issue #147. Adds T-012 test. |
