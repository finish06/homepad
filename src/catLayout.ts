// SPEC-category-pane-width-layout — the pure layout core (no DOM).
//
// Categories carry a 2D layout (row group + column order + width %). This module
// turns that flat list into rows of panes, resolves each pane's rendered width,
// decides per-row responsive collapse (D8), computes the per-pane tile count, and
// holds the edit-mode resize/merge/move math. All functions are pure so they can
// be unit-tested without a browser (jsdom has no layout — see CLAUDE.md).

// D8 / build-note tile constants (confirm TILE_MIN against a live render).
export const TILE_MIN = 168; // comfortable tile content width (px)
export const TILE_GAP = 16; // gap-4, 8pt grid
export const PANE_MIN = 176; // TILE_MIN + 8 slack — a pane never renders narrower
export const ROW_GAP = 32; // D2 row gutter (gap-8), same as inter-row rhythm
export const MOBILE_MAX = 640; // AC4 — below this, layout always stacks full-width

// The layout-relevant slice of a Category. Kept local so this module doesn't
// depend on the full api.ts Category shape.
export type CatLayout = {
  id: string;
  layoutRow: number;
  layoutColOrder: number;
  layoutWidthPct: number;
};

// D1 — responsive horizontal padding per side, stepping up and holding at 64px.
export function paddingEachSide(viewportWidth: number): number {
  if (viewportWidth >= 1920) return 64;
  if (viewportWidth >= 1440) return 48;
  if (viewportWidth >= 1024) return 32;
  if (viewportWidth >= 640) return 24;
  return 16;
}

// Usable content width = viewport minus padding on both sides. No content cap
// (AC5) — past 1920 the padding holds and the content band keeps growing.
export function usablePx(viewportWidth: number): number {
  return viewportWidth - 2 * paddingEachSide(viewportWidth);
}

// Group a flat category list into rows keyed by layoutRow (ascending), each row
// ordered by layoutColOrder. Ties fall back to id for determinism.
export function groupIntoRows<T extends CatLayout>(cats: T[]): T[][] {
  const byRow = new Map<number, T[]>();
  for (const c of cats) {
    const bucket = byRow.get(c.layoutRow) ?? [];
    bucket.push(c);
    byRow.set(c.layoutRow, bucket);
  }
  return [...byRow.keys()]
    .sort((a, b) => a - b)
    .map((k) =>
      byRow
        .get(k)!
        .slice()
        .sort((a, b) => a.layoutColOrder - b.layoutColOrder || a.id.localeCompare(b.id)),
    );
}

// AC3 — a pane alone in its row always renders 100%, whatever its stored pct.
export function effectiveWidthPct(row: CatLayout[], idx: number): number {
  return row.length === 1 ? 100 : row[idx].layoutWidthPct;
}

// Pixel width of a pane rendered at `pct` on `viewportWidth` (spec formula:
// pane_px = usable × pct/100 — gutters are not subtracted from this count).
export function panePx(pct: number, viewportWidth: number): number {
  return (usablePx(viewportWidth) * pct) / 100;
}

// Per-pane dynamic tile count. Minimum 1 so a narrow pane never clips a tile (AC2).
export function tilesPerRow(panePixels: number): number {
  return Math.max(1, Math.floor((panePixels + TILE_GAP) / (TILE_MIN + TILE_GAP)));
}

// D8 — per-row responsive collapse: a row goes single-column when any of its
// panes would render below PANE_MIN at its assigned pct on this viewport. A lone
// pane (100%) effectively never triggers this.
export function rowCollapses(row: CatLayout[], viewportWidth: number): boolean {
  if (row.length <= 1) return false;
  // AC4 — hard mobile breakpoint: below 640px everything stacks, regardless of pct.
  if (viewportWidth < MOBILE_MAX) return true;
  // D8 — otherwise per-row: collapse if any pane would fall under the 176px floor.
  return row.some((_, i) => panePx(effectiveWidthPct(row, i), viewportWidth) < PANE_MIN);
}

export type PaneView = {
  id: string;
  widthPct: number; // rendered width (100 when collapsed or lone)
  panePx: number;
  tiles: number;
};
export type RowView = {
  collapsed: boolean;
  panes: PaneView[];
};

// Composite view model the component renders from. One entry per row; when a row
// collapses, every pane is promoted to full width in layoutColOrder (AC4).
export function layoutRows(cats: CatLayout[], viewportWidth: number): RowView[] {
  return groupIntoRows(cats).map((row) => {
    const collapsed = rowCollapses(row, viewportWidth);
    return {
      collapsed,
      panes: row.map((_, i) => {
        const widthPct = collapsed ? 100 : effectiveWidthPct(row, i);
        const px = panePx(widthPct, viewportWidth);
        return { id: row[i].id, widthPct, panePx: px, tiles: tilesPerRow(px) };
      }),
    };
  });
}

// D3 — resize snap: valid two-pane splits are 25/50/75 (each pane keeps a 25%
// floor). Snap when within 3% of a snap point; hard floor 25, cap 75.
export function snapWidthPct(raw: number): number {
  const clamped = Math.max(25, Math.min(75, raw));
  const nearest = Math.round(clamped / 25) * 25;
  if (Math.abs(clamped - nearest) <= 3) return nearest;
  return Math.round(clamped);
}

// D4 — a fresh merge splits evenly (AC8). Optional raw ratio snaps like a resize.
export function resolveMergeSplit(rawA?: number): [number, number] {
  const a = rawA === undefined ? 50 : snapWidthPct(rawA);
  return [a, 100 - a];
}

// Renumber every row's colOrder to a contiguous 0..n-1 in current order, and
// compact row indices to contiguous 0..m-1. Keeps persisted layout well-formed.
function normalize<T extends CatLayout>(cats: T[]): T[] {
  const rows = groupIntoRows(cats);
  const out: T[] = [];
  rows.forEach((row, rowIdx) => {
    row.forEach((c, colIdx) => {
      out.push({ ...c, layoutRow: rowIdx, layoutColOrder: colIdx });
    });
  });
  return out;
}

// AC8 — drop `draggedId` next to `targetId` (side = which side of the target),
// merging both into the target's row at an even 50/50 split.
export function mergeCategories<T extends CatLayout>(
  cats: T[],
  draggedId: string,
  targetId: string,
  side: 'left' | 'right',
): T[] {
  const target = cats.find((c) => c.id === targetId);
  if (!target || draggedId === targetId) return cats;
  const targetRow = target.layoutRow;

  // Sequence the target row's members (minus the dragged one), then splice the
  // dragged pane in on the requested side of the target.
  const rowMembers = groupIntoRows(cats.filter((c) => c.layoutRow === targetRow))[0].filter(
    (c) => c.id !== draggedId,
  );
  const targetPos = rowMembers.findIndex((c) => c.id === targetId);
  const insertAt = side === 'left' ? targetPos : targetPos + 1;
  const order = rowMembers.map((c) => c.id);
  order.splice(insertAt, 0, draggedId);

  const [a] = resolveMergeSplit(); // 50/50 for the two-pane common case
  // #217 — split evenly with floor, giving the remainder to the last pane so the
  // row's widths always sum to exactly 100% (Round(100/n) undershoots, e.g. n=3).
  const base = Math.floor(100 / order.length);
  const remainder = 100 - base * order.length;
  const next = cats.map((c) => {
    const pos = order.indexOf(c.id);
    if (pos === -1) return c;
    const evenPct = pos === order.length - 1 ? base + remainder : base;
    return {
      ...c,
      layoutRow: targetRow,
      layoutColOrder: pos,
      layoutWidthPct: order.length === 2 ? (pos === 0 ? a : 100 - a) : evenPct,
    };
  });
  return normalize(next);
}

// AC7 — pull `id` into its own new row inserted at `newRowIndex`, full-width.
export function moveToNewRow<T extends CatLayout>(cats: T[], id: string, newRowIndex: number): T[] {
  // Shift existing rows at/after the insertion point down by one, place the moved
  // pane in the freed slot at 100%, then normalize away any gaps.
  const shifted = cats.map((c) => {
    if (c.id === id) {
      return { ...c, layoutRow: newRowIndex, layoutColOrder: 0, layoutWidthPct: 100 };
    }
    return c.layoutRow >= newRowIndex ? { ...c, layoutRow: c.layoutRow + 1 } : c;
  });
  return normalize(shifted);
}
