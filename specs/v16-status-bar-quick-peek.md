# Spec: Status Bar Quick-Peek

**Version:** 0.1.0
**Created:** 2026-06-26
**Author:** Walt (product lead)
**Status:** Ready for implementation
**Repo:** `Code/homepad` (frontend only — no backend changes)

---

## 1. Overview

Today, homepad's status bar (v14) shows a compact summary: `3 UP · 1 DOWN · 2 not monitored`.
When something is DOWN, the operator knows there's a problem — but they still have to scan the
entire tile grid to find *which* service it is. With 20+ tiles across categories, this scan takes
long enough to feel friction on every outage.

This feature makes each status chip in the status bar **clickable**. Clicking "1 DOWN" opens a
compact popover that lists the matching services by name, each with its status dot and a direct
link to the service URL. One click to "2 DOWN" → one click to open the offending service.

The implementation is **frontend-only**. All data is already in `ServicesContext` (populated by
the v13 polling loop). No new fetch, no backend changes.

### User story

As a homelab operator with homepad visible on a monitor, when I see "2 DOWN" in the status bar
I want to know immediately which two services are down and navigate to them directly — without
scanning my entire tile grid.

---

## 2. Architecture notes

- **`src/StatusBar.tsx`** — all changes are contained here. The component already reads
  `ctx.items` from `ServicesContext`. We add:
  - `selectedStatus` state — which chip (if any) is currently showing a popover:
    `'UP' | 'DOWN_DEGRADED' | 'NOT_MONITORED' | null`.
  - Each status chip becomes a `<button>`. Clicking toggles the popover for that chip (click again
    or click a different chip to switch; Escape or outside click to close).
  - `StatusPeekPopover` — a small inline component rendering a positioned overlay. Not a separate
    file: it lives in `StatusBar.tsx` since it is entirely co-located with the chip state.

- **Popover positioning** — the popover appears **below the status bar**, centered horizontally
  over the chip that triggered it. Position: `absolute` within a wrapping `relative` container.
  On mobile, the popover is full-width and snaps to the status bar's bottom edge. `z-30` (above
  tiles at `z-10`, below the launcher at `z-60`).

- **Service list in the popover** — filtered from `ctx.items`:
  - "UP" chip → services where `status === 'UP'`
  - "DOWN" chip → services where `status === 'DOWN' || status === 'DEGRADED'` (same bucket as
    the chip label: "DOWN" covers both DOWN and DEGRADED)
  - "not monitored" chip → services where `status === 'NOT_MONITORED'`

  Each row: status dot (same color coding as tiles) + service name + external link icon. The whole
  row is an `<a href={service.url} target="_blank" rel="noreferrer noopener">`. Services are sorted
  alphabetically by name within the popover.

- **Outside-click dismiss** — a `mousedown` listener on `document` closes the popover when the
  click falls outside the popover element. The listener is attached when the popover is open and
  cleaned up on close. This is the same pattern used by `UserMenu`.

- **Keyboard dismiss** — `Escape` closes the open popover. The triggering chip button retains or
  regains focus on close.

- **Empty state** — if a status bucket is empty (e.g., zero DOWN services), that chip is not
  rendered in the status bar (existing behavior, no change). A chip will never be shown for a
  bucket with zero members, so the popover will always have at least one entry.

- **No new context or props** — `StatusBar` already has `useServicesContext()`. No changes to
  parent components, no new context values, no prop threading.

---

## 3. Acceptance Criteria

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-001 | Each status chip in the status bar that represents a non-empty bucket is rendered as a `<button>` (not a plain `<span>`). The visual styling is unchanged — chips look identical to before until clicked. | Must |
| AC-002 | Clicking a status chip opens a popover listing the services in that status bucket. Clicking an already-open chip's button a second time closes the popover. | Must |
| AC-003 | Clicking a different chip while a popover is open: closes the first popover and opens the new one. Only one popover is open at a time. | Must |
| AC-004 | The popover lists services from the matching status bucket, sorted alphabetically by name. Each row shows: the service's status dot (matching tile color coding), the service name, and an external-link icon. | Must |
| AC-005 | Each service row in the popover is an anchor (`<a>`) that opens `service.url` in a new tab (`target="_blank" rel="noreferrer noopener"`). The whole row is the click target (comfortable touch size). | Must |
| AC-006 | The popover appears below the status bar, visually anchored near the chip that triggered it. On desktop it is appropriately narrow (≤320 px). On mobile (<640 px) it spans the full status bar width. | Should |
| AC-007 | The popover is positioned with `z-index` above tiles and the drag handles (`z-30` or equivalent) but below the command launcher overlay (`z-60`). | Must |
| AC-008 | Clicking anywhere outside the open popover (including on a tile, the header, or the body) closes it. The mousedown handler is cleaned up when the popover closes. | Must |
| AC-009 | Pressing Escape while a popover is open closes it. Focus returns to the chip button that triggered it. | Must |
| AC-010 | The popover surface uses `bg-white dark:bg-neutral-900`, `border border-neutral-200 dark:border-neutral-700`, `rounded-xl shadow-lg`. It does not use hardcoded hex colors that break light/dark mode. | Must |
| AC-011 | The status dot in each popover row uses the same color as on the tiles: UP → emerald, DOWN/DEGRADED → red, NOT_MONITORED → dashed outline (or a neutral dot). | Should |
| AC-012 | The popover is scroll-contained: if the service list is long (e.g., 15 UP services), the popover scrolls internally rather than growing to cover the entire page. Max-height: `clamp(180px, 40vh, 320px)`. | Should |
| AC-013 | The chip buttons have `aria-label` values that communicate the action: e.g., `aria-label="Show 2 services that are DOWN"`. The popover has `role="dialog"` or `role="listbox"` as appropriate. | Should |
| AC-014 | The existing status bar `data-testid="status-bar"`, `data-testid="status-bar-up"`, `data-testid="status-bar-down"`, `data-testid="status-bar-not-monitored"` attributes are preserved unchanged (no regression on existing tests). | Must |
| AC-015 | `npm test` passes. New Vitest tests cover: (a) clicking a DOWN chip renders a popover listing DOWN/DEGRADED services; (b) clicking outside the popover closes it; (c) pressing Escape closes the popover; (d) clicking a second chip switches the popover. TDD: red test committed first, then implementation. | Must |

---

## 4. User test cases

### TC-001: Click DOWN chip to see which services are down

**Precondition:** Dashboard loaded. Two services report status DOWN. Status bar shows "X UP · 2 DOWN".

**Steps:**
1. Click "2 DOWN" in the status bar.

**Expected:** A popover appears listing both down services by name with red status dots. Each row is clickable (link to service URL).

**Maps to:** AC-002, AC-004, AC-005

---

### TC-002: Click through to the service

**Precondition:** Popover is open showing one DOWN service "Jellyfin".

**Steps:**
1. Click the "Jellyfin" row in the popover.

**Expected:** `Jellyfin`'s URL opens in a new browser tab. The popover remains open.

**Maps to:** AC-005

---

### TC-003: Click outside to dismiss

**Precondition:** Popover is open.

**Steps:**
1. Click on a tile on the main dashboard (outside the popover).

**Expected:** The popover closes. The tile click is handled normally (opens the service, or does nothing if not on the link area).

**Maps to:** AC-008

---

### TC-004: Escape dismisses, focus returns

**Precondition:** Popover is open. The "2 DOWN" chip button currently has or most recently had focus.

**Steps:**
1. Press Escape.

**Expected:** The popover closes. Focus is on the "2 DOWN" chip button.

**Maps to:** AC-009

---

### TC-005: Switching chips

**Precondition:** The UP chip popover is open (showing 5 UP services).

**Steps:**
1. Click the "NOT MONITORED" chip.

**Expected:** The UP popover closes immediately. The NOT_MONITORED popover opens, showing the not-monitored services. No flash or layout jump.

**Maps to:** AC-003

---

### TC-006: Popover scrolls for many services

**Precondition:** 20 services are UP.

**Steps:**
1. Click the "20 UP" chip.

**Expected:** The popover opens and shows a scrollable list. Its height does not expand to cover the entire page. The status bar and header remain visible above.

**Maps to:** AC-012

---

### TC-007: Live refresh updates popover contents

**Precondition:** Popover is open showing "Jellyfin DOWN". The v13 auto-refresh fires and Jellyfin is now UP.

**Steps:**
1. Allow the ~60s polling cycle to fire while the popover is open.

**Expected:** The popover's list updates to reflect the new state (Jellyfin is removed from the DOWN list, or the DOWN popover shows 0 entries and closes gracefully, or the status bar summary updates). The popover does not crash.

**Maps to:** AC-002 (live state coherence)

---

## 5. Out of scope

- Keyboard navigation within the popover list (arrow-key roving focus). The rows are plain links — Tab navigation is sufficient for v1.
- Grouping services by category within the popover (alphabetical is sufficient).
- A "Show all UP services" mode that spans the entire catalog view (that's a future filter feature).
- Any backend change or new API call.
- The UP chip popover is still provided for completeness / quick navigate-to, but the primary value is the DOWN/DEGRADED chip. Both are required by these ACs.
- Filtering or sorting options within the popover.

---

## 6. Implementation guidance

### `src/StatusBar.tsx`

```tsx
// Sketch — Stitch writes the real implementation
type PeekStatus = 'UP' | 'DOWN_DEGRADED' | 'NOT_MONITORED';

export default function StatusBar() {
  const ctx = useServicesContext();
  const [peek, setPeek] = useState<PeekStatus | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<Partial<Record<PeekStatus, HTMLButtonElement | null>>>({});

  // Outside-click dismiss
  useEffect(() => {
    if (!peek) return;
    const handler = (e: MouseEvent) => {
      if (!popoverRef.current?.contains(e.target as Node)) setPeek(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [peek]);

  // Escape dismiss
  useEffect(() => {
    if (!peek) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPeek(null);
        triggerRefs.current[peek]?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [peek]);

  if (!ctx?.items) return null;

  // ... build segments, render chips as <button> elements,
  // render <StatusPeekPopover> when peek !== null
}
```

**`StatusPeekPopover`** — inline component in `StatusBar.tsx`:

```tsx
function StatusPeekPopover({
  services,
  popoverRef,
}: {
  services: Service[];
  popoverRef: React.RefObject<HTMLDivElement>;
}) {
  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Services in this status"
      className="absolute left-1/2 top-full z-30 mt-1 -translate-x-1/2
                 w-64 max-h-72 overflow-y-auto
                 bg-white dark:bg-neutral-900
                 border border-neutral-200 dark:border-neutral-700
                 rounded-xl shadow-lg"
    >
      {services.map((s) => (
        <a
          key={s.id}
          href={s.url}
          target="_blank"
          rel="noreferrer noopener"
          className="flex items-center gap-2 px-3 py-2 text-sm
                     text-neutral-800 dark:text-neutral-200
                     hover:bg-neutral-50 dark:hover:bg-neutral-800"
        >
          <StatusDot status={s.status} />
          <span className="truncate">{s.name}</span>
          <ExternalLinkIcon className="ml-auto shrink-0 h-3 w-3 text-neutral-400" />
        </a>
      ))}
    </div>
  );
}
```

The wrapping `<div>` around the status bar chips needs `position: relative` so the `absolute`
popover is positioned correctly. Wrap the inner content (not the whole status bar) in a relative
container to avoid the popover clipping against the page edge.

---

## 7. Success metric

After this ships, an operator who sees "2 DOWN" in the status bar can identify the affected
services and navigate to them in two clicks — with no tile scanning, no mental search, and no
context switch away from the dashboard. The time from "I see a DOWN alert" to "I'm on the
service page" drops from 10–30 seconds of scanning to under 5 seconds.
