import { describe, expect, it } from 'vitest';
import {
  PANE_MIN,
  TILE_MIN,
  effectiveWidthPct,
  groupIntoRows,
  layoutRows,
  mergeCategories,
  moveToNewRow,
  panePx,
  resolveMergeSplit,
  rowCollapses,
  snapWidthPct,
  tilesPerRow,
  usablePx,
  type CatLayout,
} from './catLayout';

// SPEC-category-pane-width-layout — the pure layout core (no DOM). Groups
// categories into rows, resolves per-pane widths, per-row responsive collapse
// (D8 176px floor), tile-count math, and the edit-mode resize/merge/move logic.

function cat(over: Partial<CatLayout> = {}): CatLayout {
  return {
    id: over.id ?? 'c',
    layoutRow: over.layoutRow ?? 0,
    layoutColOrder: over.layoutColOrder ?? 0,
    layoutWidthPct: over.layoutWidthPct ?? 100,
    ...over,
  };
}

describe('groupIntoRows', () => {
  // AC1 — same layoutRow ends up side-by-side (same group), ordered by colOrder.
  it('AC1 groups by layoutRow and sorts each row by layoutColOrder', () => {
    const cats = [
      cat({ id: 'b', layoutRow: 0, layoutColOrder: 1, layoutWidthPct: 50 }),
      cat({ id: 'a', layoutRow: 0, layoutColOrder: 0, layoutWidthPct: 50 }),
      cat({ id: 'c', layoutRow: 1, layoutColOrder: 0, layoutWidthPct: 100 }),
    ];
    const rows = groupIntoRows(cats);
    expect(rows.map((r) => r.map((c) => c.id))).toEqual([['a', 'b'], ['c']]);
  });

  // AC9 — default/migrated cats (each its own row, 100%, colOrder 0) stack, in
  // ascending row order, one pane per row — identical to pre-feature.
  it('AC9 defaults render as full-width single-pane rows in order', () => {
    const cats = [
      cat({ id: 'y', layoutRow: 1 }),
      cat({ id: 'x', layoutRow: 0 }),
      cat({ id: 'z', layoutRow: 2 }),
    ];
    const rows = groupIntoRows(cats);
    expect(rows.map((r) => r.map((c) => c.id))).toEqual([['x'], ['y'], ['z']]);
    expect(rows.every((r) => r.length === 1)).toBe(true);
  });
});

describe('effectiveWidthPct', () => {
  // AC3 — a lone pane renders 100% regardless of stored width.
  it('AC3 lone pane in a row is 100% regardless of stored pct', () => {
    const row = [cat({ id: 'a', layoutWidthPct: 50 })];
    expect(effectiveWidthPct(row, 0)).toBe(100);
  });

  it('AC1 a pane sharing a row keeps its stored pct', () => {
    const row = [cat({ id: 'a', layoutWidthPct: 50 }), cat({ id: 'b', layoutWidthPct: 50 })];
    expect(effectiveWidthPct(row, 0)).toBe(50);
    expect(effectiveWidthPct(row, 1)).toBe(50);
  });
});

describe('usablePx (D1 responsive padding)', () => {
  // AC5 — no content cap; usable = viewport minus responsive padding (caps 64px).
  it('AC5 subtracts responsive padding and holds at 64px each side past 1920', () => {
    expect(usablePx(390)).toBe(390 - 2 * 16);
    expect(usablePx(640)).toBe(640 - 2 * 24);
    expect(usablePx(1024)).toBe(1024 - 2 * 32);
    expect(usablePx(1440)).toBe(1440 - 2 * 48);
    expect(usablePx(1920)).toBe(1920 - 2 * 64);
    expect(usablePx(2560)).toBe(2560 - 2 * 64); // padding holds, content keeps growing
  });
});

describe('panePx + tilesPerRow', () => {
  // AC2 — tiles fill the pane without clipping; per-pane dynamic count, min 1.
  it('AC2 tiles_per_row = floor((pane+gap)/(TILE_MIN+gap)), never below 1', () => {
    // 50% of 1920 (usable 1792) = 896px → floor((896+16)/184) = 4
    const px = panePx(50, 1920);
    expect(px).toBe(usablePx(1920) * 0.5);
    expect(tilesPerRow(px)).toBe(Math.floor((px + 16) / (TILE_MIN + 16)));
    // a tiny pane still yields at least one tile (never clips)
    expect(tilesPerRow(120)).toBe(1);
  });

  it('AC2 wide 100% pane fits more tiles than a narrow one', () => {
    expect(tilesPerRow(panePx(100, 1920))).toBeGreaterThan(tilesPerRow(panePx(100, 1024)));
  });
});

describe('rowCollapses (D8 per-row 176px floor)', () => {
  // AC4 — below the floor a shared row collapses to single-column stacking.
  it('AC4 a 25% pane at 640px (148px < 176) collapses its row', () => {
    const row = [
      cat({ id: 'a', layoutWidthPct: 25 }),
      cat({ id: 'b', layoutWidthPct: 75 }),
    ];
    expect(rowCollapses(row, 640)).toBe(true);
  });

  it('a 50/50 row at 640px (296px each ≥ 176) stays side-by-side', () => {
    const row = [
      cat({ id: 'a', layoutWidthPct: 50 }),
      cat({ id: 'b', layoutWidthPct: 50 }),
    ];
    expect(rowCollapses(row, 640)).toBe(false);
  });

  it('AC4 any multi-pane row collapses on a sub-PANE_MIN phone', () => {
    const row = [cat({ id: 'a', layoutWidthPct: 50 }), cat({ id: 'b', layoutWidthPct: 50 })];
    expect(rowCollapses(row, 320)).toBe(true);
    expect(PANE_MIN).toBe(176);
  });
});

describe('layoutRows (composite view model)', () => {
  // AC1/AC4 — desktop keeps a shared row multi-pane; a narrow viewport collapses it.
  it('AC1 shared row renders both panes side-by-side at 1440px', () => {
    const cats = [
      cat({ id: 'a', layoutRow: 0, layoutColOrder: 0, layoutWidthPct: 50 }),
      cat({ id: 'b', layoutRow: 0, layoutColOrder: 1, layoutWidthPct: 50 }),
    ];
    const rows = layoutRows(cats, 1440);
    expect(rows).toHaveLength(1);
    expect(rows[0].collapsed).toBe(false);
    expect(rows[0].panes.map((p) => p.id)).toEqual(['a', 'b']);
    expect(rows[0].panes.map((p) => p.widthPct)).toEqual([50, 50]);
  });

  it('AC4 same layout collapses to stacked full-width panes on a phone', () => {
    const cats = [
      cat({ id: 'a', layoutRow: 0, layoutColOrder: 0, layoutWidthPct: 50 }),
      cat({ id: 'b', layoutRow: 0, layoutColOrder: 1, layoutWidthPct: 50 }),
    ];
    const rows = layoutRows(cats, 390);
    expect(rows[0].collapsed).toBe(true);
    // collapsed → each pane rendered full width, in colOrder
    expect(rows[0].panes.map((p) => [p.id, p.widthPct])).toEqual([
      ['a', 100],
      ['b', 100],
    ]);
  });

  // AC3 through the composite path too.
  it('AC3 lone pane is width 100 in the view model', () => {
    const rows = layoutRows([cat({ id: 'a', layoutRow: 0, layoutWidthPct: 40 })], 1440);
    expect(rows[0].panes[0].widthPct).toBe(100);
  });
});

describe('snapWidthPct (D3 resize snapping)', () => {
  // AC6 — snaps to 25% increments (within 3%), hard floor 25%, cap 75% (partner floor).
  it('AC6 snaps to nearest 25 when within 3%', () => {
    expect(snapWidthPct(51)).toBe(50);
    expect(snapWidthPct(73)).toBe(75);
    expect(snapWidthPct(27)).toBe(25);
  });
  it('AC6 free drag outside the snap window keeps the raw integer', () => {
    expect(snapWidthPct(60)).toBe(60);
    expect(snapWidthPct(40)).toBe(40);
  });
  it('AC6 hard floor at 25 and cap at 75 (partner keeps its 25 floor)', () => {
    expect(snapWidthPct(5)).toBe(25);
    expect(snapWidthPct(95)).toBe(75);
  });
});

describe('resolveMergeSplit + mergeCategories (D4 auto 50/50)', () => {
  // AC8 — merging two full-width cats into one row auto-sets each to 50%.
  it('AC8 default merge split is 50/50', () => {
    expect(resolveMergeSplit()).toEqual([50, 50]);
  });

  it('AC8 mergeCategories puts both in one row at 50% in dropped order', () => {
    const cats = [
      cat({ id: 'a', layoutRow: 0, layoutColOrder: 0, layoutWidthPct: 100 }),
      cat({ id: 'b', layoutRow: 1, layoutColOrder: 0, layoutWidthPct: 100 }),
    ];
    // drag b to a's right
    const next = mergeCategories(cats, 'b', 'a', 'right');
    const a = next.find((c) => c.id === 'a')!;
    const b = next.find((c) => c.id === 'b')!;
    expect(a.layoutRow).toBe(b.layoutRow);
    expect(a.layoutWidthPct).toBe(50);
    expect(b.layoutWidthPct).toBe(50);
    expect(a.layoutColOrder).toBe(0);
    expect(b.layoutColOrder).toBe(1);
  });

  it('AC8 merging to the left orders the dragged pane first', () => {
    const cats = [
      cat({ id: 'a', layoutRow: 0, layoutColOrder: 0, layoutWidthPct: 100 }),
      cat({ id: 'b', layoutRow: 1, layoutColOrder: 0, layoutWidthPct: 100 }),
    ];
    const next = mergeCategories(cats, 'b', 'a', 'left');
    const a = next.find((c) => c.id === 'a')!;
    const b = next.find((c) => c.id === 'b')!;
    expect(b.layoutColOrder).toBe(0);
    expect(a.layoutColOrder).toBe(1);
  });

  // #217 — the widths in a merged row MUST sum to exactly 100% for any pane
  // count. Round(100/n) undershoots for n=3 (33×3=99) and n=7 (14×7=98).
  const rowWidthSum = (cats: CatLayout[]): number => {
    const row = cats[0].layoutRow; // all merged panes share the target's row
    return cats
      .filter((c) => c.layoutRow === row)
      .reduce((sum, c) => sum + c.layoutWidthPct, 0);
  };

  // Build a single row of `n` panes by merging panes 1..n-1 onto pane 0's right.
  const mergeNIntoOneRow = (n: number): CatLayout[] => {
    let cats: CatLayout[] = Array.from({ length: n }, (_, i) =>
      cat({ id: `c${i}`, layoutRow: i, layoutColOrder: 0, layoutWidthPct: 100 }),
    );
    for (let i = 1; i < n; i++) {
      cats = mergeCategories(cats, `c${i}`, 'c0', 'right');
    }
    return cats;
  };

  it('#217 n=2 pane widths sum to exactly 100', () => {
    expect(rowWidthSum(mergeNIntoOneRow(2))).toBe(100);
  });

  it('#217 n=3 pane widths sum to exactly 100 (not 99)', () => {
    expect(rowWidthSum(mergeNIntoOneRow(3))).toBe(100);
  });

  it('#217 n=4 pane widths sum to exactly 100', () => {
    expect(rowWidthSum(mergeNIntoOneRow(4))).toBe(100);
  });

  it('#217 n=7 pane widths sum to exactly 100 (not 98)', () => {
    expect(rowWidthSum(mergeNIntoOneRow(7))).toBe(100);
  });
});

describe('moveToNewRow (D4 new-row drop)', () => {
  // AC7 — dragging a pane to a new row updates layoutRow/layoutColOrder; the
  // pane lands full-width (100%) and rows renumber contiguously.
  it('AC7 moves a pane to its own new row at 100% width, colOrder 0', () => {
    const cats = [
      cat({ id: 'a', layoutRow: 0, layoutColOrder: 0, layoutWidthPct: 50 }),
      cat({ id: 'b', layoutRow: 0, layoutColOrder: 1, layoutWidthPct: 50 }),
    ];
    // pull b out into a new row below row 0
    const next = moveToNewRow(cats, 'b', 1);
    const b = next.find((c) => c.id === 'b')!;
    const a = next.find((c) => c.id === 'a')!;
    expect(b.layoutRow).toBe(1);
    expect(b.layoutColOrder).toBe(0);
    expect(b.layoutWidthPct).toBe(100);
    // a is now alone in row 0
    expect(a.layoutRow).toBe(0);
    // rows are contiguous 0-indexed
    const rowVals = [...new Set(next.map((c) => c.layoutRow))].sort((x, y) => x - y);
    expect(rowVals).toEqual([0, 1]);
  });
});
