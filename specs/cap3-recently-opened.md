# Spec: "Recently Opened" Row — Capability #3

**Version:** 0.1.0
**Created:** 2026-06-23
**Author:** Walt (product lead)
**Status:** Ready for implementation
**Repo:** `Code/homepad` (frontend only — no backend changes)
**Estimate:** ~45 minutes

---

## 1. Overview

Today, every visit to homepad starts cold: the user has to scan their categories to find the service they want to open. For power users with a large catalog, this is friction they feel every day.

This feature adds a **"Recently opened" row** at the very top of the dashboard — a compact horizontal strip showing the last few services the user actually opened, in recency order. It's backed by `localStorage` and requires zero backend changes: this is a per-browser, per-user convenience layer, not synchronized state.

### User story

As a homelab operator with a dozen services on my dashboard, I want to see the services I opened recently right at the top, so I can reopen them in one click without scanning the full catalog.

---

## 2. Architecture notes

- **Where the click happens:** `ServiceTile` in `src/Catalog.tsx` — the tile renders an `<a href={service.url} target="_blank" rel="noreferrer noopener">` that opens the service URL. An `onClick` handler on this anchor records the service ID in localStorage.
- **localStorage key:** `homepad.recentlyOpened` — a JSON array of service IDs, ordered newest-first, max 8 entries. Stored IDs that no longer exist in the current catalog are silently dropped on render.
- **Where the row renders:** in `src/Catalog.tsx`, above the category/tile grid but below the "+ Add apps" button, whenever the resolved list is non-empty. A single `RecentlyOpenedRow` component owns this. It reads directly from localStorage on mount and subscribes to a custom DOM event (`homepad:opened`) dispatched by `ServiceTile` after each click, so it updates without a React prop drill or context change.
- **No context changes needed.** The row is self-contained; it does not need `ServicesContext` — it only needs the full `items` array to resolve names/icons, which Catalog already has.

---

## 3. Acceptance Criteria

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-001 | The "Recently opened" row appears at the top of the dashboard content area (above the first category or the flat tile grid), visible without scrolling on a typical desktop viewport. It is absent when the localStorage list is empty (first visit or after clearing). | Must |
| AC-002 | When a user clicks any service tile link (navigating to `service.url`), that service's ID is prepended to the `homepad.recentlyOpened` localStorage array. If the service was already in the list, it is moved to position 0 (dedup). The list is capped at 8 entries; entries beyond 8 are dropped. | Must |
| AC-003 | Each item in the "Recently opened" row displays the service icon and the service name, in the same visual style as the regular tile (icon on top, name below), but at a smaller size that fits the horizontal layout (≈ 64px icon). Items are tappable/clickable and open `service.url` in a new tab — the same behavior as the main tile. | Must |
| AC-004 | Clicking an item in the "Recently opened" row also records the open (moves the item to position 0 per AC-002). | Must |
| AC-005 | A **"Clear"** control (e.g., a small "✕ Clear" link or button at the trailing end of the row) removes all entries from the `homepad.recentlyOpened` localStorage key and hides the row immediately. | Must |
| AC-006 | Service IDs stored in `homepad.recentlyOpened` that are not present in the current `items` array (service was deleted from the catalog) are silently filtered out before rendering. If all stored IDs resolve to deleted services, the row is hidden. | Must |
| AC-007 | The row has `data-testid="recently-opened-row"` on its container element. Each item has `data-testid="recently-opened-item"` and a `data-service-id` attribute equal to its service ID. The clear button has `data-testid="recently-opened-clear"`. | Must |
| AC-008 | The "Recently opened" row is **hidden in edit mode** (`editMode === true`). It is not a target for drag-and-drop reordering and does not interfere with category management. | Must |
| AC-009 | The row is **hidden when the dashboard shows the empty state** (zero services in `items`). | Must |
| AC-010 | If localStorage is unavailable (quota exceeded, private-browsing restrictions), reads return an empty list and writes fail silently. The rest of the dashboard is unaffected. | Must |
| AC-011 | The row's horizontal overflow is handled gracefully: on narrow viewports (mobile) the row scrolls horizontally without breaking page layout. On wider viewports all ≤8 items are visible in a single line. | Should |
| AC-012 | The existing Vitest unit suite (`npm test`) remains fully green. At least one new Vitest test covers: recording an open (verify the localStorage write), deduplication (re-opening a service that's already in the list moves it to position 0), and the 8-entry cap. | Must |

---

## 4. User test cases

### TC-001: Row appears after first open

**Precondition:** Fresh browser (or localStorage cleared). User is logged in with at least one service.

**Steps:**
1. Load the dashboard. The "Recently opened" row is absent.
2. Click service "Grafana" — it opens in a new tab.
3. Return to the homepad tab.

**Expected:** The "Recently opened" row now appears at the top of the dashboard with one item: "Grafana". The row was not there before the click.

**Maps to:** AC-001, AC-002, AC-003

---

### TC-002: Recency order + deduplication

**Precondition:** Recently opened list contains [Service A, Service B].

**Steps:**
1. Click Service A again.

**Expected:** List becomes [Service A, Service B] — Service A moves to the front (not duplicated). Count stays at 2.

**Maps to:** AC-002, AC-004

---

### TC-003: 8-entry cap

**Precondition:** User has opened exactly 8 distinct services.

**Steps:**
1. Open a 9th distinct service.

**Expected:** The row shows 8 items. The oldest entry (position 8 before this click) is gone. The 9th service is now at position 1.

**Maps to:** AC-002

---

### TC-004: Clear

**Precondition:** Recently opened row shows 4 items.

**Steps:**
1. Click the "Clear" control.

**Expected:** The "Recently opened" row disappears immediately. `localStorage.getItem('homepad.recentlyOpened')` returns `null` or `[]`.

**Maps to:** AC-005

---

### TC-005: Deleted service filtered out

**Precondition:** Recently opened list contains [Service X, Service Y]. An admin deletes Service X from the catalog. User reloads.

**Expected:** The row shows only Service Y. Service X is silently absent.

**Maps to:** AC-006

---

### TC-006: Hidden in edit mode

**Precondition:** User is an admin, edit mode is ON.

**Expected:** The "Recently opened" row is not rendered. When edit mode is turned OFF, the row reappears (if the list is non-empty).

**Maps to:** AC-008

---

## 5. Out of scope

- Server-side persistence of the "recently opened" list — `localStorage` is intentional; this is a per-browser convenience, not cross-device sync.
- Any backend changes.
- A configurable row length (hardcoded to 8).
- "Pin" or "favorite" from the recently-opened row — that's the existing `favorite` flag on tiles.
- Recording opens from the `CommandLauncher` — launcher navigations are out of scope for v1 of this feature. If it's easy to add without scope creep, Stitch may include it, but the acceptance criteria do not require it.
- Any UI to reorder the recently-opened list.

---

## 6. Implementation guidance

### `src/Catalog.tsx` — recording opens + rendering the row

**Recording a click (AC-002):**

Add an `onClick` handler on the `<a>` inside `ServiceTile` (the existing `href={service.url}` anchor):

```tsx
onClick={() => recordOpen(service.id)}
```

`recordOpen` is a module-level helper (not a hook):

```tsx
const RECENT_KEY = 'homepad.recentlyOpened';
const MAX_RECENT = 8;

function recordOpen(id: string) {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const prev: string[] = raw ? JSON.parse(raw) : [];
    const next = [id, ...prev.filter((x) => x !== id)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('homepad:opened', { detail: { id } }));
  } catch { /* storage unavailable — silent */ }
}
```

**`RecentlyOpenedRow` component:**

```tsx
function RecentlyOpenedRow({
  items,
  theme,
  rev,
  editMode,
}: {
  items: Service[];
  theme: IconVariant;
  rev: number;
  editMode: boolean;
}) {
  const [recentIds, setRecentIds] = useState<string[]>(loadRecent);

  useEffect(() => {
    const handler = () => setRecentIds(loadRecent());
    window.addEventListener('homepad:opened', handler);
    return () => window.removeEventListener('homepad:opened', handler);
  }, []);

  if (editMode || recentIds.length === 0 || items.length === 0) return null;

  const byId = new Map(items.map((s) => [s.id, s]));
  const resolved = recentIds.map((id) => byId.get(id)).filter(Boolean) as Service[];
  if (resolved.length === 0) return null;

  return (
    <div data-testid="recently-opened-row" className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">
          Recently opened
        </span>
        <button
          data-testid="recently-opened-clear"
          onClick={clearRecent}
          className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
        >
          Clear
        </button>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {resolved.map((s) => (
          <a
            key={s.id}
            data-testid="recently-opened-item"
            data-service-id={s.id}
            href={s.url}
            target="_blank"
            rel="noreferrer noopener"
            onClick={() => recordOpen(s.id)}
            className="flex w-16 shrink-0 flex-col items-center gap-1 rounded-lg p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <img
              src={iconSrc(s, theme, rev)}
              alt=""
              data-fallback={initialBadge(s.name)}
              onError={handleIconError}
              className="h-10 w-10 rounded-lg object-contain"
            />
            <span className="w-full truncate text-center text-xs text-neutral-700 dark:text-neutral-300">
              {s.name}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const ids: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids) ? (ids as string[]) : [];
  } catch { return []; }
}

function clearRecent() {
  try { localStorage.removeItem(RECENT_KEY); } catch { /* silent */ }
  window.dispatchEvent(new CustomEvent('homepad:opened'));
}
```

**Placement in the Catalog render:**

Insert `<RecentlyOpenedRow ... />` after the "+ Add apps" / admin toolbar block and before the first category section (or the flat grid for an uncategorized catalog). Pass `items` (the resolved `Service[]`), `theme`, `rev`, and `editMode`.

### `src/recently-opened.test.ts` — unit tests (AC-012)

Test `recordOpen` + `loadRecent` in isolation with a `localStorage` mock:
- Calling `recordOpen('a')` stores `['a']`.
- Calling `recordOpen('b')` then `recordOpen('a')` stores `['a', 'b']` (dedup).
- After 8 opens, opening a 9th drops the oldest.

---

## 7. Success metric

After this ships, a returning homepad user can open their most-used service within 1 click and ≤2 seconds from landing on the dashboard — no scan, no scroll, no search required.
