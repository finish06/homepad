# Spec: v14 — Floating Panel Layout + Usage-Priority Ordering

**Version:** 0.1.0
**Created:** 2026-07-01
**Authors:** Walt (product lead) · Kare (design lead — co-owned, UI-bearing spec)
**Status:** Approved — ready for implementation
**Repo:** `Code/homepad` (frontend only — no backend changes)
**Design artifact:** `homepad-floating-panel-layout.md` (Kare's pod; refreshed mock `.kare-panels.png`)

---

## 1. Overview

Two things are broken about the current dashboard:

1. **Tile stretch defect.** The existing `grid-cols-6` layout at 1440px stretches every tile to ~218px — wider than the intended 190px. Tiles feel bloated and inconsistent.
2. **Ordering is admin-set, not user-tuned.** Categories sit in the order an admin chose at setup time, regardless of what the user actually opens. A power user with 12 categories has to scan past rarely-used ones to find their go-to apps every visit.

This spec fixes both with a single cohesive redesign:

- **Floating glass panels per category** — each category becomes its own independently-sized glass card. Tiles stay exactly 190px (never stretch). Panels pack left-to-right and wrap, so a 3-app category and a 3-app category sit side by side instead of each occupying a full row with a right-side void.
- **Usage-priority category ordering** — categories automatically sort by how often the user opens their apps. The F-scan hits the important content top-left. Re-ranking is stable (on mount only, with hysteresis), not live/jittery.
- **Recently Opened chip rail redesign** — the existing recently-opened row gets a visual update that matches the new panel system: compact horizontal chips (colored plate + name) instead of the current icon-stack thumbnails. This also brings the chip rail into alignment with the contrast and touch-target requirements the new design system enforces.

### User story

As a homelab operator, I want my dashboard to show my most-used apps near the top-left and make each app category visually distinct, so I can get to what I need in one glance — without admin intervention or daily reshuffling.

---

## 2. Design section (Kare — co-owned)

_This section is Kare's. Do not implement the visual layer without it. Walt has reviewed, incorporated, and co-signed._

### 2A. Floating panel field

**Field geometry (desktop ≥1300px):**
- 6-column grid. Tile slot = **190px** (fixed, never stretches). Column gap = **16px**. Panel gap = **16px** (space between sibling panels in the same row).
- Max-width ~1300–1392px. **Left edge anchored at x=48** — every panel row starts at this edge. No centering of sparse rows (design-system principle: "Left-anchor to the F-scan"; centering applies only to a single focal element — empty-state, modal, hero).
- Panel span = `clamp(appCount, 1, 6)`. A category with 3 apps spans 3 columns; a category with 8 apps spans 6 columns and the overflow wraps within that panel. Panels with ≤6 apps hug their content exactly — no trailing void column.
- Panels wrap: a 3-col panel followed by a 3-col panel fills one row; a 5-col panel followed by a 3-col panel wraps (5 + 3 > 6, so the 3-col panel begins a new row, left-anchored).

**Responsive breakpoints:**

| Viewport    | Columns | Behavior                                  |
|-------------|---------|-------------------------------------------|
| ≥1300px     | 6       | Standard desktop — full field             |
| 1024–1299px | 4       | Panels reflow to 4-col max span           |
| 768–1023px  | 3       | Panels stack full-width (all span = cols) |
| <768px      | 2       | Mobile — panels stack, 2-col field        |

At 768px ("iPad stack point"), all panels go full-width and stack vertically in usage-priority order, left edge preserved, read order maintained.

**Panel glass tokens:**
```
light: background rgba(255,255,255,0.72) + backdrop-filter blur(10px)
       border 1px solid rgba(255,255,255,0.6)
       border-radius 22px
       box-shadow: 0 2px 8px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.04)
       padding 16px

dark:  background rgba(30,30,40,0.68) + backdrop-filter blur(10px)
       border 1px solid rgba(255,255,255,0.08)
       border-radius 22px
       box-shadow: 0 2px 8px rgba(0,0,0,0.32), 0 8px 24px rgba(0,0,0,0.24)
       padding 16px
```

Tiles inside panels remain at 190×190px and never resize. The panel hugs the tile grid; it does not stretch to fill unused columns.

### 2B. Recently Opened chip rail

**Treatment:** A compact horizontal chip rail above the panel field. Each chip is a miniature of the tile: a colored app-icon plate + the service name. Same glass material as panels, one register quieter (shadow one notch lighter so it reads as subordinate to the catalog).

**Exact dimensions (measured in-browser):**
- Chip overall: **120.8 × 44px** (measured), height target = **44px** (the whole chip is the tap target — ≥44px WCAG touch target ✓)
- Chip corner radius: **12px**
- App icon plate: **28 × 28px**, corner radius **8px**
- App name: **14px / weight 600**, name-only (no source/URL line)
- Chip padding: `6px 14px 6px 6px` (tight right to let the name breathe)
- Chip gap: **12px** between chips
- Glass fill: matches the panel glass tokens above, with shadow one notch lighter (0 1px 4px rgba(0,0,0,0.04) light / 0 1px 4px rgba(0,0,0,0.16) dark)

**Positioning:**
- Rail sits **above the panel field**, at the **same x=48 left edge** (measured: rail left = field left)
- **24px gap** between the rail bottom and the first panel row
- Rail label: "Recently opened" — 12px / weight 700 / uppercase / color **neutral-500 (`#737373`, contrast 4.74:1 ✓)**. Do NOT use neutral-400 (fails AA).
- Horizontal-scroll on overflow; hidden scrollbar (overflow-x: auto, scrollbar invisible)
- Hidden in edit/Arrange mode; hidden when recently-opened list is empty; hidden on empty-state dashboard

---

## 3. Usage-priority ordering — Walt's product ratification

Kare flagged these thresholds for Walt to ratify. They are now ratified as spec:

| Decision | Ratified value | Rationale |
|----------|---------------|-----------|
| Usage window | **30 days rolling** | Long enough to reflect real patterns; short enough to adapt as users add/change services |
| Re-rank timing | **On dashboard mount only** — never live on the open-count tick | Live reshuffling is disorienting and violates spatial memory. Mount-time is natural |
| Re-rank rate cap | **≤1 per 24 hours** | Even on mount, don't re-sort if it's been <24h since last sort. The user's layout stays stable for a working day |
| Hysteresis | **Swap categories only when margin ≥ 15% of total opens OR ≥ 3 opens in the window** | Prevents churn from small statistical noise. Both conditions are checked independently (OR, not AND) |
| Cold-start / no data | **Fallback to admin sort_index** (current server order) | Familiar and non-disruptive for a new or cleared-data user |
| Storage tier | **localStorage** — `homepad.openLog` (see §6) | Per-browser; no backend change. Cross-device sync is explicitly out of scope for v14 |
| Manual override | **Arrange mode sets "custom sort"** — persists as a flag in `homepad.sortMode`. When `sortMode === 'custom'`, usage ranking is ignored and the v10 server layout order applies. A "Reset to auto order" action in Arrange mode clears the flag. | Respects the investment in v10 drag-and-drop while giving usage-ordering as the smart default |

---

## 4. Acceptance criteria

### 4A. Floating panel layout

| ID | Criterion | Priority |
|----|-----------|----------|
| A-001 | On a ≥1300px viewport, each category renders as a floating glass panel. A category with N apps spans exactly `clamp(N, 1, 6)` columns of the 6-column field. Tiles inside are 190px wide — not stretched, not shrunk. | Must |
| A-002 | Panels pack left-to-right and wrap: two 3-app categories sit side by side (filling the 6-column field); a 5-app and a 3-app panel cause the 3-app panel to wrap to a new row. Every panel row starts at the left edge (x=48). No centering of sparse rows. | Must |
| A-003 | The glass panel uses the design tokens from §2A (rgba background, blur, radius 22, layered shadow, 16px padding) in both light and dark mode. | Must |
| A-004 | At 1024–1299px, panels reflow to a 4-column max span. At 768–1023px, all panels stack full-width. At <768px, the field is 2 columns and panels fill it. The left edge is preserved at every breakpoint. | Must |
| A-005 | The "Uncategorized" section (services with no category) continues to render as a panel using the same glass styling. "Favorites" pinned services also render in a panel. | Must |
| A-006 | The tile-stretch defect is fixed: at 1440px viewport width, tile measured width = 190px ± 2px. | Must |
| A-007 | In edit/Arrange mode, panels retain their glass styling; drag-and-drop for tiles within a panel and category-section reordering continue to work (v10 behavior preserved). | Must |
| A-008 | The empty-state dashboard (zero services) renders correctly — the panel field is absent, the empty-state prompt shows as before. | Must |

### 4B. Recently Opened chip rail

| ID | Criterion | Priority |
|----|-----------|----------|
| B-001 | The recently-opened row renders as a horizontal chip rail above the panel field, at x=48 (same left edge as panels), with a 24px gap to the first panel row. | Must |
| B-002 | Each chip is 44px tall (full chip = tap target), radius 12, with a 28×28px colored app-icon plate (radius 8) and the service name (14px/600, name-only — no source line). Chip gap = 12px. Glass fill and shadow match §2B tokens. | Must |
| B-003 | The rail label "Recently opened" renders in neutral-500 (#737373), 12px/700/uppercase. Contrast ≥ 4.5:1. | Must |
| B-004 | Clicking a chip opens `service.url` in a new tab and records the open (moves the service to position 0 in the open log). | Must |
| B-005 | The rail is hidden in edit/Arrange mode, on empty-state dashboard, and when the open log is empty. It reappears when edit mode exits and the log is non-empty. | Must |
| B-006 | On narrow viewports (mobile), the chip rail scrolls horizontally without breaking page layout. The scrollbar is hidden (not just styled away — `overflow-x: auto` with invisible scrollbar). | Must |
| B-007 | A "Clear" control at the trailing end of the rail clears the open log and hides the rail immediately. It uses `data-testid="recently-opened-clear"`. | Must |
| B-008 | The chip rail carries `data-testid="recently-opened-row"` on its container. Each chip carries `data-testid="recently-opened-item"` and `data-service-id={id}`. | Must |
| B-009 | Services deleted from the catalog are silently excluded from the chip rail. If all stored services are deleted, the rail hides. | Must |
| B-010 | If localStorage is unavailable, the chip rail is absent and the rest of the dashboard is unaffected. | Must |

### 4C. Usage-priority category ordering

| ID | Criterion | Priority |
|----|-----------|----------|
| C-001 | On a fresh user (no `homepad.openLog` data), categories render in admin sort_index order (cold-start fallback). | Must |
| C-002 | After a user opens services across multiple categories, on the next dashboard mount (and after ≥24h since last re-rank), categories are sorted by descending 30-day open count. | Must |
| C-003 | A category's ranking score = total opens of its apps in the rolling 30-day window. Categories with zero opens sort to the end (after scored categories, in admin sort_index order among themselves). | Must |
| C-004 | Re-rank fires at most once per 24 hours (wall clock). A second mount within the same 24-hour window shows the same order as the first — no re-sort mid-day. | Must |
| C-005 | Hysteresis: two categories swap positions only if the margin between them is ≥15% of the higher-scored category's 30-day opens, OR ≥3 opens. Below that margin, the current order is preserved. | Must |
| C-006 | When the user enters Arrange mode, a "Sort: Auto / Custom" toggle is visible. It defaults to "Auto" (usage-priority). Setting "Custom" lets the user drag categories to a manual order (v10 behavior). The `sortMode` preference persists in `homepad.sortMode` localStorage key. In Custom mode, usage ranking is fully ignored — server layout order applies. | Must |
| C-007 | In Custom sort mode, a "Reset to auto order" action clears `homepad.sortMode` and returns to usage-priority. | Should |
| C-008 | Favorites and Uncategorized sections always render at the end of the category stack, after usage-scored categories, regardless of sort mode. (Their existing behavior — v5 always-expanded, v4 taxonomy — is unchanged.) | Must |

---

## 5. User test cases

### TC-001: Tile size check
**Steps:** Load dashboard at 1440px width. Inspect any tile.
**Expected:** Tile measured width = 190px ± 2px. No stretching.
**Maps to:** A-006

### TC-002: Panel packing
**Steps:** Have two categories with 3 apps each. Load at 1300px+.
**Expected:** Both categories appear side by side in one row, each panel spanning exactly 3 columns. A third 3-app category wraps to a new row.
**Maps to:** A-001, A-002

### TC-003: Glass styling in dark mode
**Steps:** Toggle dark mode. Inspect a category panel.
**Expected:** Panel shows dark glass tokens (semi-transparent dark bg, blur, 22px radius, dark shadow). Light tokens do not leak through.
**Maps to:** A-003

### TC-004: Chip rail appearance
**Steps:** Open two services. Navigate back to dashboard.
**Expected:** Chip rail appears above the panel field with same left edge. Each chip: 44px tall, colored plate, name only, no source line.
**Maps to:** B-001, B-002

### TC-005: Chip rail label contrast
**Steps:** Load dashboard. Inspect "Recently opened" label color.
**Expected:** Color is #737373 (neutral-500). Not neutral-400.
**Maps to:** B-003

### TC-006: Usage ordering after opens
**Precondition:** User has `sortMode = 'auto'` (or unset). User opens apps in Category B 10 times and Category A 2 times over the past week.
**Steps:** Clear `homepad.sortRankAt` (the last-ranked timestamp) to force a re-rank. Reload dashboard.
**Expected:** Category B appears before Category A.
**Maps to:** C-002

### TC-007: Cold start
**Precondition:** Clear all `homepad.*` localStorage keys.
**Steps:** Load dashboard.
**Expected:** Categories appear in admin sort_index order (same as they were before this feature). No errors.
**Maps to:** C-001

### TC-008: Custom sort mode
**Steps:** Enter Arrange mode. Set "Sort: Custom". Drag Category A above Category B. Exit Arrange mode.
**Expected:** Category A stays above B regardless of open counts. Usage ranking is not applied on next mount (within 24h or not).
**Maps to:** C-006

### TC-009: 24h re-rank cap
**Precondition:** Dashboard has been mounted and ranked in the last 2 hours.
**Steps:** Open 20 apps in Category X. Reload dashboard.
**Expected:** Category X does NOT jump to the top (re-rank hasn't fired yet — last rank was <24h ago). Order is the same as the previous load.
**Maps to:** C-004

### TC-010: Edit mode hides chip rail
**Steps:** Open edit/Arrange mode.
**Expected:** Chip rail disappears. On exit from edit mode, it reappears.
**Maps to:** B-005

---

## 6. Implementation guidance

### 6.1 localStorage schema — `homepad.openLog`

Replace the current string-array `homepad.recentlyOpened` with a timestamped log:

```ts
type OpenEntry = { id: string; t: number }; // t = ms since epoch
// homepad.openLog: OpenEntry[] (newest-first, max 500 entries, entries >30d pruned on write)
```

On write (recordOpen), prepend the new entry, drop any prior occurrence of the same `id` from the log first, then prune entries older than 30 days, then cap at 500 entries.

**Migration:** On first load, if `homepad.recentlyOpened` exists and `homepad.openLog` does not, convert the stored string array to `OpenEntry[]` using `t = Date.now()` for all entries (they appear as "opened just now" — this is acceptable). Remove the old key after migration.

The chip rail reads the 8 most recent unique entries from `openLog` (position 0..7 after dedup by id). The category ranker reads the full log and aggregates by `categoryId` within the last 30 days.

**Key summary:**

| Key | Content | Used by |
|-----|---------|---------|
| `homepad.openLog` | `{id, t}[]` newest-first, max 500, >30d pruned | chip rail (recency) + category ranker |
| `homepad.sortMode` | `'auto' \| 'custom'` (absent = auto) | Arrange mode toggle |
| `homepad.sortRankAt` | `number` (ms epoch of last re-rank) | re-rank gate (24h cap) |
| `homepad.categoryOrder` | `string[]` (category ids, ranked order) | display order when `sortMode === 'auto'` |
| ~~homepad.recentlyOpened~~ | deprecated; migrated on first read | — |

### 6.2 Category ranker — `src/category-ranker.ts`

```ts
export function rankCategories(
  cats: Category[],
  openLog: OpenEntry[],
  servicesByCatId: Map<string, string[]>, // catId → serviceId[]
  prevOrder: string[],                    // current displayed order (for hysteresis)
): string[] { ... }
```

1. Build a `Map<serviceId, openCount>` from `openLog` entries with `t >= now - 30d`.
2. Score each category: sum of open counts for its services.
3. Sort by score descending; ties broken by admin sort_index ascending.
4. Apply hysteresis: compare new order against `prevOrder`. For each adjacent pair (i, i+1) in the new order, if category at new[i] was below new[i+1] in `prevOrder`, only swap if `score[new[i]] - score[new[i+1]] >= Math.max(3, Math.ceil(0.15 * score[new[i]]))`.
5. Append zero-scored categories in admin sort_index order.
6. Favorites and Uncategorized are never in this list — they always append after.

Export a pure function with no side effects. Test-first in `src/category-ranker.test.ts`.

### 6.3 Panel layout — CSS

The tile grid moves from `grid-cols-N gap-4` to a **CSS custom property approach** that enforces 190px slots:

```css
.tile-field {
  display: grid;
  grid-template-columns: repeat(var(--field-cols, 6), 190px);
  gap: 16px;
  max-width: calc(var(--field-cols, 6) * 190px + (var(--field-cols, 6) - 1) * 16px);
  margin-left: 48px;
}

.category-panel {
  grid-column: span var(--panel-cols);
  background: rgba(255,255,255,0.72);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255,255,255,0.6);
  border-radius: 22px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.04);
  padding: 16px;
}
.dark .category-panel {
  background: rgba(30,30,40,0.68);
  border-color: rgba(255,255,255,0.08);
  box-shadow: 0 2px 8px rgba(0,0,0,0.32), 0 8px 24px rgba(0,0,0,0.24);
}
```

`--field-cols` is set by a responsive wrapper (`6 / 4 / 3 / 2` at the respective breakpoints).
`--panel-cols` is set inline per panel: `style={{ '--panel-cols': clamp(apps.length, 1, fieldCols) }}`.

Tiles inside a panel use a sub-grid or nested flex of 190px items — they never resize.

### 6.4 Chip rail — `src/recently-opened-row.tsx` (update)

Replace the current icon-stack rendering with the chip rail. Key class changes:

```tsx
// chip container
<div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">

// each chip (44px tall, radius 12, glass fill)
<a className="flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-1.5 h-11
              bg-white/72 backdrop-blur-[10px] border border-white/60
              shadow-[0_1px_4px_rgba(0,0,0,0.04)]
              dark:bg-[rgba(30,30,40,0.68)] dark:border-white/8 dark:shadow-[0_1px_4px_rgba(0,0,0,0.16)]
              hover:bg-white/85 dark:hover:bg-[rgba(30,30,40,0.82)]">
  {/* 28×28 plate */}
  <img className="h-7 w-7 rounded-lg object-contain" ... />
  {/* name */}
  <span className="text-sm font-semibold leading-tight text-neutral-800 dark:text-neutral-100 max-w-[8rem] truncate">
    {s.name}
  </span>
</a>

// label
<span className="text-[12px] font-bold uppercase tracking-wide text-neutral-500">
  Recently opened
</span>
```

### 6.5 Mount-time re-rank flow (`src/Catalog.tsx`)

On mount:
1. Read `homepad.sortMode`. If `'custom'`, use server category order (existing `cats` from API). Skip steps 2–5.
2. Read `homepad.sortRankAt`. If `Date.now() - sortRankAt < 86_400_000` (24h), use `homepad.categoryOrder` (previous computed order). Skip steps 4–5.
3. Otherwise: read `homepad.openLog`, call `rankCategories(cats, openLog, servicesByCatId, prevOrder)`.
4. Write result to `homepad.categoryOrder` and `homepad.sortRankAt = Date.now()`.
5. Apply the ordered category list to the render.

---

## 7. Out of scope

- **Cross-device usage sync** — `openLog` is per-browser. Cross-device sync would require a backend `POST /api/opens/{id}` endpoint and a usage aggregation query. Explicitly deferred; flag in STATUS if Caleb wants it.
- **Per-app open counts in the UI** — usage data stays internal to the ranker; no "opened 15 times" badge shown.
- **Admin control of usage ordering** — admins do not override per-user usage ranking. Admin sort_index only applies in cold-start / custom sort mode.
- **Configuring hysteresis thresholds** — hardcoded at 15% / 3 opens; not user-configurable.
- **CommandLauncher open tracking** — launcher navigations are not recorded to `openLog` (same exclusion as cap3 v1). Add in a future slice if needed.
- **Drag-and-drop between panels** — tiles are re-assignable to categories via admin Assign menu (v4); drag-between-panels is not in scope.
- **Animation on re-rank** — categories reorder silently on mount; no layout-shift animation in v14.

---

## 8. Success metric

After v14 ships, a returning user can reach their most-used app within 1 glance + 1 click: the category they use most is top-left, its tiles are always 190px, and up to 8 recently-opened services are one chip-tap away above the fold.

---

## 9. Sign-offs

- **Walt (product):** GO — spec reflects Caleb's confirmed intent (usage-priority ordering, glass panels, Recently Opened chip treatment). Ordering/storage decisions are ratified. This is ready for Stitch to build.
- **Kare (design):** GO — design section finalized, mock measured in-browser, all tokens specified. See `homepad-floating-panel-layout.md` for the full design doc and `.kare-panels.png` for the refreshed mock.
