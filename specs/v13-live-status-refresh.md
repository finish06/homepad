# Spec: Live Status Auto-Refresh + "Last Updated" Indicator

**Version:** 0.1.0
**Created:** 2026-06-23
**Author:** Walt (product lead)
**Status:** Ready for implementation
**Repo:** `Code/homepad` (frontend only — no backend changes)

---

## 1. Overview

Today the homepad dashboard loads service status once on page load and never refreshes it. The backend Gatus poller updates its snapshot every ~60 seconds — but unless the user hits F5, they're looking at stale badges. A service can go DOWN and the user will never know until they refresh.

This feature makes the dashboard **feel alive**: status badges update automatically on a ~60-second cycle, and a small "Updated Xs ago" counter near the header tells the user exactly how fresh the data is. When a service's status actually changes (UP→DOWN or DOWN→UP), its status dot flashes briefly so the user's eye is drawn to the transition — they don't have to scan every tile.

The implementation is **purely frontend**. The backend already has the data; `GET /api/services` already returns per-tile status on every call. We just need to poll it periodically and update the displayed state.

### User story

As a homelab operator with homepad open on a monitor, I want my dashboard to stay current without manual refreshing, so that I can trust what I see and catch outages as they happen.

---

## 2. Architecture notes (inform the implementation)

- `src/services.tsx` — `ServicesProvider` fetches services once on mount (`useEffect → fetchServices().then(setItems)`). The polling interval belongs here, alongside the existing one-shot fetch.
- `src/AppHeader.tsx` — the sticky header is the right home for the "Updated X ago" indicator. It should be subtle (small text, muted color) so it doesn't compete with the tiles.
- The status dot on each tile is rendered in `src/Catalog.tsx` via the `statusDot` map. A CSS animation class can be toggled on change.
- Tab-visibility guard: when the tab is hidden, skip the refresh cycle (don't hammer the API while the user isn't looking). Resume on `visibilitychange` to `visible`.

---

## 3. Acceptance Criteria

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-001 | After the initial page load, `GET /api/services` is re-issued automatically approximately every 60 seconds while the tab is **visible**. A ±10 s tolerance is acceptable; the interval does not need to be exact. | Must |
| AC-002 | When the tab is **hidden** (e.g. user switches away), the polling interval is suspended. It resumes the next time the tab becomes visible again. The first re-poll after returning to the tab fires within 5 seconds of the `visibilitychange` event. | Must |
| AC-003 | On each successful refresh, the displayed status badge for **each tile** reflects the latest value returned by the API — without a page reload. | Must |
| AC-004 | A small "Updated just now" label appears in the app header immediately after the initial load and after each refresh cycle. After a few seconds it transitions to "Updated 10s ago", "Updated 20s ago", etc., ticking in real time (≤2 s granularity). | Must |
| AC-005 | The "Updated X ago" text shows seconds for the first 59 s ("Updated 45s ago"), then switches to minutes ("Updated 1m ago", "Updated 2m ago", etc.). It **does not** show hours or days — if a refresh has not occurred in >5 minutes the label reads "Updated 5m+ ago" (or similar) and does not overflow the header. | Should |
| AC-006 | When a service's status **changes** between the previous value and the new value returned by a refresh cycle (e.g. UP → DOWN, DOWN → UP, UNKNOWN → UP), its status dot plays a short **pulse animation** (≤1 s). Tiles whose status has not changed receive no animation. | Must |
| AC-007 | The pulse animation respects `prefers-reduced-motion`: when the user has enabled reduced-motion, the animation is **skipped entirely** (the dot updates immediately without motion). | Must |
| AC-008 | A failed refresh (network error or non-200 from `/api/services`) is **silently ignored**: the displayed data remains as-is, and the "Updated X ago" counter continues ticking from the last successful refresh. No error toast, no spinner, no visual degradation. | Must |
| AC-009 | The auto-refresh is **additive only**: it never triggers a loading spinner, skeleton, or layout shift. The tiles stay in place; only their status badge values change. | Must |
| AC-010 | The "Updated X ago" indicator is present in the `<AppHeader>` component and has a `data-testid="status-last-updated"` attribute for test targeting. | Must |
| AC-011 | When the user logs out (session expires / 401 returned by a refresh cycle), the polling stops silently. No redirect; that's `App.tsx`'s responsibility. | Should |
| AC-012 | The existing Vitest unit suite (`npm test`) remains fully green after this change. At least one new Vitest test covers the polling behavior (e.g., that `ServicesProvider` calls `fetchServices` more than once over time, verified with a fake timer). | Must |

---

## 4. User test cases

### TC-001: Status updates without page reload

**Precondition:** User is logged in. At least one tile has a `gatus_key` configured.

**Steps:**
1. Load the dashboard. Note the status of "Service A" — it is UP (green dot).
2. Without reloading, wait 70 seconds (or simulate by advancing timers in a test).
3. The backend now reports "Service A" as DOWN.

**Expected:** The tile for "Service A" now shows a red dot and the status label "DOWN". No page reload occurred. The "Updated X ago" counter resets to "Updated just now".

**Maps to:** AC-001, AC-003, AC-004

---

### TC-002: Status dot pulses on change, not on no-change

**Precondition:** Dashboard loaded. Service A is UP, Service B is UP.

**Steps:**
1. Advance time by 60 seconds.
2. The refresh returns Service A = DOWN, Service B = UP (unchanged).

**Expected:** Service A's dot plays a brief pulse. Service B's dot has no animation.

**Maps to:** AC-006

---

### TC-003: Polling suspends on hidden tab

**Precondition:** Dashboard loaded, polling has fired once.

**Steps:**
1. Switch the browser tab to hidden (or dispatch a `visibilitychange` with `document.hidden = true`).
2. Wait 120 seconds.
3. Switch the tab back to visible.

**Expected:** No fetch calls were made during the hidden period. Within 5 seconds of tab becoming visible, a new fetch fires and "Updated just now" resets.

**Maps to:** AC-002

---

### TC-004: Silent failure on network error

**Precondition:** Dashboard loaded, one successful refresh has occurred.

**Steps:**
1. Simulate a failed refresh (network error on `GET /api/services`).
2. Observe the dashboard and "Updated X ago" counter.

**Expected:** The existing tile data remains displayed. No error is shown. The "Updated X ago" counter continues ticking from the last successful refresh (not reset to "just now").

**Maps to:** AC-008

---

### TC-005: Reduced motion — no animation

**Precondition:** `prefers-reduced-motion: reduce` is active in the browser. Dashboard is loaded.

**Steps:**
1. Advance time 60 s; the refresh returns a status change.

**Expected:** The tile's status dot updates its color but no pulse animation plays.

**Maps to:** AC-007

---

## 5. Out of scope

- Server-Sent Events (SSE) or WebSockets — polling is the right fit for now.
- User-configurable refresh interval.
- A manual "Refresh" button.
- Any backend changes — this is a frontend-only feature.
- Refreshing non-status fields (name, description, URL). Only `service.status` is updated on each poll cycle to minimize DOM churn.

---

## 6. Implementation guidance

### `src/services.tsx` — add polling to `ServicesProvider`

```tsx
// Pseudocode sketch (Stitch writes the real implementation)
function ServicesProvider({ children }) {
  const [items, setItems] = useState(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  // Initial load
  useEffect(() => {
    fetchServices().then(data => { setItems(data); setLastUpdatedAt(new Date()); });
  }, []);

  // Polling
  useEffect(() => {
    const poll = async () => {
      if (document.hidden) return;
      try {
        const fresh = await fetchServices();
        setItems(prev => mergeStatuses(prev, fresh)); // only update .status fields
        setLastUpdatedAt(new Date());
      } catch { /* silent */ }
    };
    const id = setInterval(poll, 60_000);
    const onVisibility = () => { if (!document.hidden) poll(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisibility); };
  }, []);

  // Expose lastUpdatedAt via context so AppHeader can render "Updated X ago"
  ...
}
```

`mergeStatuses(prev, fresh)` should return the **same** array with only `status` (and `uptimeChecks` if present) updated — not replace the whole array — so React re-renders only the tiles that actually changed.

### `src/AppHeader.tsx` — "Updated X ago" indicator

Add a small trailing element in the header (right side, below the title or inline with the user menu area). The text ticks every second. Style: `text-xs text-neutral-400 dark:text-neutral-500`, no bold, no icon needed.

### `src/Catalog.tsx` — status dot pulse animation

When a tile's status changes, apply a CSS class (e.g., `animate-pulse-once` defined in `index.css`) for ~700ms. Detect the change by comparing the incoming status from the refresh with the previous value via a `useRef` tracking the last-seen status per tile.

`prefers-reduced-motion` guard: wrap the animation class in a check — `window.matchMedia('(prefers-reduced-motion: reduce)').matches` → skip.

---

## 7. Success metric

After this ships, a homelab operator with homepad visible on a secondary monitor can watch a service go DOWN and see it reflected in the dashboard within ≤90 seconds — without touching the keyboard.
