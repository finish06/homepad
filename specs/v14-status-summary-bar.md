# Spec: Dashboard Status Summary Bar

**Version:** 0.1.0
**Created:** 2026-06-23
**Author:** Walt (product lead)
**Status:** Ready for implementation
**Repo:** `Code/homepad` (frontend only — no backend changes)

---

## 1. Overview

Today the homepad dashboard shows individual per-tile status dots but gives no fleet-level summary. A user has to visually scan every tile to know whether anything is down or how many services are unmonitored. On a full dashboard with dozens of tiles this scan is slow and error-prone.

This feature adds a **Status Summary Bar** — a single compact strip directly below the sticky header showing three counts: how many services are UP, how many are DOWN (monitored failures), and how many have no monitoring configured. It reads the already-loaded `ServicesContext` array (no new fetch, no loading spinner), so the cost is zero on the network and the DOM.

The bar is always visible to logged-in users once services have loaded. Seeing `"14 UP"` is just as useful as seeing `"2 DOWN"` — the former confirms health; the latter demands action.

### User story

As a homelab operator, I want to see the overall health of my dashboard at a glance — without scanning every tile — so that I can quickly spot outages and know how many services are not yet connected to monitoring.

---

## 2. Architecture notes (inform the implementation)

- `src/services.tsx` — `ServicesContext` exposes `items: Service[] | null`. While null (loading), the bar renders nothing.
- `src/StatusBar.tsx` — new component. Reads from `useServicesContext()`. Pure derived computation over `items`.
- `src/App.tsx` — slot the `<StatusBar />` between `<AppHeader>` and the catalog `<section>` inside `Home`.
- No new API calls. No polling changes. This is a pure presentation layer over already-fetched data.
- When v13 (live auto-refresh) lands, `ServicesContext` will start updating `items` periodically — the bar will automatically reflect fresh counts because it derives from the same context.

### Count definitions

| Bar segment | Condition | Label shown |
|---|---|---|
| UP | `service.status === 'UP'` | `N UP` |
| DOWN | `service.status === 'DOWN'` or `service.status === 'DEGRADED'` | `N DOWN` |
| not monitored | `service.status === 'NOT_MONITORED'` | `N not monitored` |

**UNKNOWN** (`gatus_key` set but Gatus unreachable) is intentionally excluded from the bar — it is a monitoring infrastructure signal, not a per-service health reading. The individual tile's gray dot already surfaces it.

A segment is **only rendered if its count > 0**. If every service is UP (0 DOWN, 0 not-monitored) the bar shows only `"N UP"`.

---

## 3. Acceptance Criteria

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-001 | The status bar appears between the sticky `<AppHeader>` and the tile grid, spanning the full page width. It is visually distinct from both the header and the tiles — a compact strip, not a card or modal. | Must |
| AC-002 | The bar shows exactly the segments whose count > 0, in order: UP (if any) · DOWN (if any) · not monitored (if any). Segments are separated by a `·` character (U+00B7 MIDDLE DOT). A segment is completely absent — no placeholder, no "0 UP" — when its count is zero. | Must |
| AC-003 | The UP count equals the number of services in `ServicesContext.items` where `status === 'UP'`. | Must |
| AC-004 | The DOWN count equals the number of services where `status === 'DOWN'` or `status === 'DEGRADED'`. Both indicate monitored services with failing checks. | Must |
| AC-005 | The not-monitored count equals the number of services where `status === 'NOT_MONITORED'`. | Must |
| AC-006 | While `ServicesContext.items` is null (services still loading), the bar renders nothing — no placeholder text, no empty strip, no layout shift. | Must |
| AC-007 | The UP count chip is green (`text-emerald-600 dark:text-emerald-400`). The DOWN count chip is red (`text-red-600 dark:text-red-500`). The not-monitored chip is neutral/muted (`text-neutral-500 dark:text-neutral-400`). The separator dots are neutral. | Must |
| AC-008 | The bar is visible in both **light mode** and **dark mode**. Colors adjust appropriately (see AC-007). | Must |
| AC-009 | The outer bar element has `data-testid="status-bar"`. Each segment has a dedicated test id: `data-testid="status-bar-up"`, `data-testid="status-bar-down"`, `data-testid="status-bar-not-monitored"`. Absent-count segments are not rendered (not hidden with `display:none`). | Must |
| AC-010 | The bar does **not** cause a layout shift or reflow on the tile grid below when services load. It occupies a fixed-height row (e.g. a consistent `py-1.5` or similar). | Must |
| AC-011 | The bar is accessible: the outer element has `role="status"` and `aria-label="Service status summary"`. Each segment text is readable by a screen reader in natural order. | Should |
| AC-012 | The existing Vitest unit suite (`npm test`) stays fully green. At least two new Vitest unit tests cover `StatusBar`: one asserting the correct counts and segment visibility for a mixed service list, one asserting the bar renders nothing when `items` is null. | Must |
| AC-013 | The bar is present only on the authenticated dashboard view (inside `Home`). It does not appear on the login/register form. | Must |

---

## 4. User test cases

### TC-001: Mixed status dashboard

**Precondition:** User is logged in. Dashboard has: 8 × UP, 2 × DOWN, 1 × DEGRADED, 1 × UNKNOWN, 3 × NOT_MONITORED.

**Steps:**
1. Load the dashboard. Observe the strip between the header and the tiles.

**Expected:** Strip reads: **`8 UP · 3 DOWN · 3 not monitored`**
- 8 UP services → `8 UP` (green)
- 2 DOWN + 1 DEGRADED = 3 → `3 DOWN` (red)
- 3 NOT_MONITORED → `3 not monitored` (neutral)
- 1 UNKNOWN → not counted in any segment, not shown

**Maps to:** AC-003, AC-004, AC-005

---

### TC-002: All services UP — only UP chip shown

**Precondition:** User is logged in. Every service on the dashboard has `status === 'UP'`. No DOWN, no DEGRADED, no NOT_MONITORED.

**Steps:**
1. Load the dashboard.

**Expected:** Strip shows only `"N UP"` (green). No DOWN or not-monitored segment appears. No "0 DOWN" placeholder.

**Maps to:** AC-002

---

### TC-003: Loading state — bar absent

**Precondition:** Dashboard is loading (services have not yet returned from `/api/services`).

**Steps:**
1. Observe the area between the header and where tiles will appear.

**Expected:** The status bar strip is not rendered at all. No empty row, no "loading…" text. Once services load, the bar appears.

**Maps to:** AC-006

---

### TC-004: Dark mode

**Precondition:** User has dark mode enabled. Dashboard has at least one UP service and one NOT_MONITORED service.

**Steps:**
1. Load the dashboard in dark mode.

**Expected:** The UP chip is a lighter green (e.g. `text-emerald-400`). The not-monitored chip is a muted neutral. The strip is readable against the dark page background. No color disappears.

**Maps to:** AC-007, AC-008

---

### TC-005: UNKNOWN services — not counted

**Precondition:** Dashboard has 5 UP, 2 UNKNOWN, 0 DOWN, 0 NOT_MONITORED.

**Steps:**
1. Load the dashboard.

**Expected:** Strip shows only `"5 UP"`. The 2 UNKNOWN services are not shown in the bar.

**Maps to:** AC-003, AC-004, AC-005

---

## 5. Out of scope

- Clicking a chip to filter the tile grid (filter is a separate feature).
- Showing the UNKNOWN count in the bar.
- Showing the DEGRADED count separately from DOWN.
- Mobile-specific layout changes beyond what Tailwind responsive classes handle automatically.
- Any backend changes.
- Any admin-only visibility rules — the bar is shown to all authenticated users.

---

## 6. Implementation guidance

### New file: `src/StatusBar.tsx`

```tsx
import { useServicesContext } from './services';

export default function StatusBar() {
  const ctx = useServicesContext();
  if (!ctx?.items) return null;

  const up = ctx.items.filter(s => s.status === 'UP').length;
  const down = ctx.items.filter(s => s.status === 'DOWN' || s.status === 'DEGRADED').length;
  const notMonitored = ctx.items.filter(s => s.status === 'NOT_MONITORED').length;

  if (ctx.items.length === 0) return null;

  const segments: { id: string; label: string; className: string }[] = [];
  if (up > 0)
    segments.push({ id: 'status-bar-up', label: `${up} UP`, className: 'text-emerald-600 dark:text-emerald-400' });
  if (down > 0)
    segments.push({ id: 'status-bar-down', label: `${down} DOWN`, className: 'text-red-600 dark:text-red-500' });
  if (notMonitored > 0)
    segments.push({ id: 'status-bar-not-monitored', label: `${notMonitored} not monitored`, className: 'text-neutral-500 dark:text-neutral-400' });

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
          <span data-testid={seg.id} className={seg.className}>{seg.label}</span>
        </span>
      ))}
    </div>
  );
}
```

### `src/App.tsx` change

In the `Home` component, insert `<StatusBar />` between `<AppHeader>` and the catalog `<section>`:

```tsx
import StatusBar from './StatusBar';

// Inside Home's return, within <ServicesProvider>:
<AppHeader ... />
<StatusBar />
<section className="mx-auto max-w-6xl px-4 py-6">
  <Catalog ... />
</section>
```

The `<StatusBar />` must be inside `<ServicesProvider>` (which already wraps the whole `Home` body) so `useServicesContext()` resolves.

### New test file: `src/StatusBar.test.tsx`

Cover at minimum:
- Null items → renders nothing
- Mixed statuses → correct UP/DOWN/not-monitored counts and segment visibility
- 0 DOWN → no DOWN segment rendered
- UNKNOWN items → not counted in any segment

Use the same mock pattern as `Catalog.test.tsx` — render with a wrapping `ServicesContext.Provider` seeded with a test `items` array, or mock `useServicesContext` directly.

---

## 7. Success metric

A homelab operator loading the homepad dashboard can read the fleet health summary in under two seconds, without scanning individual tiles. The bar correctly reflects the live state delivered by v13's auto-refresh polling when that feature ships.

---

## 8. Revision history

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2026-06-23 | 0.1.0 | Walt | Initial spec |
