import { describe, expect, it } from 'vitest';
import type { Category, Service } from './api';
import { boxesFromData, boxWidthPx, clampWidth, contentMaxPx, fitsViewport, MAX_WIDTH, moveCategory, rowFillCounts } from './appGrid';

// SPEC-app-grid (Amendment A1) — pure layout helpers. The flex-wrap page pack +
// the fixed-190px auto-fill tools track are pure CSS (browser-gate territory);
// these cover the JS-side math: the box width clamp (1–8, A1), the content-sized
// box-width formula (AC-002-A1), the viewport-fit test that drives the D-3 width
// selector disable, and grouping the user's own services under their box in admin
// order (AC-012, AC-024).

const cat = (id: string, name: string, sortIndex: number, gridWidth?: number): Category => ({
  id,
  name,
  sortIndex,
  gridWidth,
});

const svc = (id: string, name: string, categoryId?: string | null): Service =>
  ({ id, name, categoryId, slug: id, description: '', url: 'https://x', icon: '', status: 'UNKNOWN', favorite: false, iconLight: false, iconDark: false }) as Service;

describe('clampWidth (A1 — range 1–8)', () => {
  it('clamps to the 1–8 range and rounds', () => {
    expect(MAX_WIDTH).toBe(8);
    expect(clampWidth(0)).toBe(1);
    expect(clampWidth(-3)).toBe(1);
    expect(clampWidth(9)).toBe(8);
    expect(clampWidth(7)).toBe(7);
    expect(clampWidth(3)).toBe(3);
    expect(clampWidth(2.6)).toBe(3);
  });
});

describe('boxWidthPx (AC-002-A1 — content-sized box)', () => {
  // box width = w × TILE_PX(190) + (w-1) × GAP(16) + 2 × PADDING(16)
  it('computes the exact content width for a given --w', () => {
    expect(boxWidthPx(1)).toBe(190 + 32); // 222
    expect(boxWidthPx(3)).toBe(634); // 3×190 + 2×16 + 32
    expect(boxWidthPx(6)).toBe(1252); // fits 1280 (A1 table)
    expect(boxWidthPx(7)).toBe(1458); // overflows 1440
    expect(boxWidthPx(8)).toBe(1664); // overflows 1440, fits 1920
  });
});

describe('fitsViewport (D-3 — width selector disable)', () => {
  // A --w whose box would exceed the available width is offered DISABLED so an
  // admin never sets an off-screen box on their own display (A1 D-3 option c).
  it('is true when the box fits, false when it would overflow', () => {
    expect(fitsViewport(6, 1280)).toBe(true); // 1252 ≤ 1280
    expect(fitsViewport(7, 1440)).toBe(false); // 1458 > 1440
    expect(fitsViewport(8, 1440)).toBe(false); // 1664 > 1440
    expect(fitsViewport(8, 1920)).toBe(true); // 1664 ≤ 1920
    expect(fitsViewport(1, 320)).toBe(true); // 222 ≤ 320
  });
});

// SPEC-pane-fill-reflow (Phase 1, R3) — contentMaxPx is the box's content-max
// GROW CAP: the width to show all n apps in ONE row. Same slot formula as
// boxWidthPx BUT deliberately UNCLAMPED — boxWidthPx clamps --w to 1–8 (the
// admin range), whereas a box can hold MORE than 8 apps and its true single-row
// content width must be reported so the box can grow to reveal every column.
describe('contentMaxPx (R3 content-max grow cap)', () => {
  it('computes the single-row content width for n apps (n × 190 + (n−1) × 16 + 32)', () => {
    expect(contentMaxPx(1)).toBe(222);
    expect(contentMaxPx(3)).toBe(634);
    expect(contentMaxPx(5)).toBe(1006);
  });

  it('is 0 for an empty box (0 apps) — the box stays at its --w floor, never grows (AC-R3-5)', () => {
    expect(contentMaxPx(0)).toBe(0);
  });

  it('does NOT clamp at 8 (unlike boxWidthPx): a >8-app box reports its true content-max', () => {
    // boxWidthPx clamps to width 8 (1664); a 10-app box's real content-max is wider.
    expect(contentMaxPx(10)).toBe(2076); // 10×190 + 9×16 + 32
    expect(contentMaxPx(10)).toBeGreaterThan(boxWidthPx(10));
  });
});

// SPEC-pane-fill-reflow (Phase 1, R4) — rowFillCounts bins the boxes into the
// visual flex-wrap rows the browser would form (greedy fill by each box's --w
// FLOOR width until the next won't fit, then wrap) and returns, per box, how many
// boxes share its row. A count of 1 marks a LONE box, which R4 grows to 100% of
// the frame instead of stopping at its content-max cap.
describe('rowFillCounts (R4 lone-box detection)', () => {
  it('marks both boxes as sharing a row when they fit the content width', () => {
    // 812 + 16 + 396 = 1224 ≤ 1504 → one row of two.
    expect(rowFillCounts([812, 396], 1504)).toEqual([2, 2]);
  });

  it('marks each box lone when the second wraps to its own row', () => {
    // 634 + 16 + 634 = 1284 > 1248 → the second box wraps → two rows of one.
    expect(rowFillCounts([634, 634], 1248)).toEqual([1, 1]);
  });

  it('handles a mixed pack: a lone first row then a shared second row', () => {
    // 812 alone (812 + 16 + 812 = 1640 > 1504), then 812 + 16 + 300 = 1128 fits.
    expect(rowFillCounts([812, 812, 300], 1504)).toEqual([1, 2, 2]);
  });

  it('marks a single box as lone (count 1)', () => {
    expect(rowFillCounts([500], 1504)).toEqual([1]);
  });

  it('returns [] for no boxes', () => {
    expect(rowFillCounts([], 1504)).toEqual([]);
  });
});

describe('boxesFromData', () => {
  it('groups the user services under their category box in admin sort order', () => {
    const cats = [cat('c1', 'Media', 0, 4), cat('c2', 'Infra', 1, 2)];
    const services = [
      svc('s1', 'Plex', 'c1'),
      svc('s2', 'Grafana', 'c2'),
      svc('s3', 'Jellyfin', 'c1'),
    ];
    const boxes = boxesFromData(cats, services);
    expect(boxes.map((b) => b.title)).toEqual(['Media', 'Infra']);
    expect(boxes[0]).toMatchObject({ id: 'c1', width: 4 });
    expect(boxes[0].tools.map((t) => t.name)).toEqual(['Plex', 'Jellyfin']);
    expect(boxes[1]).toMatchObject({ id: 'c2', width: 2 });
    expect(boxes[1].tools.map((t) => t.name)).toEqual(['Grafana']);
  });

  it('keeps an empty category as a box with no tools (AC-012)', () => {
    const boxes = boxesFromData([cat('c1', 'Empty', 0, 3)], []);
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toMatchObject({ id: 'c1', title: 'Empty', width: 3 });
    expect(boxes[0].tools).toEqual([]);
  });

  it('defaults a category with no gridWidth to width 3', () => {
    const boxes = boxesFromData([cat('c1', 'Media', 0)], []);
    expect(boxes[0].width).toBe(3);
  });

  it('collects uncategorized services into a trailing box, only when present', () => {
    const withUncat = boxesFromData([cat('c1', 'Media', 0, 3)], [svc('s1', 'Plex', 'c1'), svc('s2', 'Loose', null)]);
    expect(withUncat.map((b) => b.title)).toEqual(['Media', 'Uncategorized']);
    expect(withUncat[1].id).toBe('');
    expect(withUncat[1].tools.map((t) => t.name)).toEqual(['Loose']);

    const noUncat = boxesFromData([cat('c1', 'Media', 0, 3)], [svc('s1', 'Plex', 'c1')]);
    expect(noUncat.map((b) => b.title)).toEqual(['Media']);
  });
});

// AG-EDIT-3 — drag-to-reorder boxes (Edit Dashboard). The pure move: `activeId`
// takes `overId`'s slot in the admin (sortIndex) order, every other box keeps its
// relative order, and sortIndex is rewritten to the new positions so boxesFromData
// renders the new order. This is the JS-side math the DnD onDragEnd persists via
// setCategoryOrder — the drag itself is browser-gate territory.
describe('moveCategory (AG-EDIT-3 drag-to-reorder)', () => {
  const c = (id: string, sortIndex: number): Category => ({ id, name: id, sortIndex, gridWidth: 3 });

  it('moves the dragged box into the target slot, preserving other order', () => {
    const cats = [c('a', 0), c('b', 1), c('c', 2), c('d', 3)];
    // drag 'a' onto 'c' → order becomes b, c, a, d
    const next = moveCategory(cats, 'a', 'c');
    expect(next.map((x) => x.id)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('rewrites sortIndex to the new contiguous positions', () => {
    const cats = [c('a', 0), c('b', 1), c('c', 2)];
    const next = moveCategory(cats, 'c', 'a'); // c, a, b
    expect(next.map((x) => x.id)).toEqual(['c', 'a', 'b']);
    expect(next.map((x) => x.sortIndex)).toEqual([0, 1, 2]);
  });

  it('operates in sortIndex order even when the input array order differs', () => {
    // input array is NOT in sortIndex order; move must respect the displayed order
    const cats = [c('c', 2), c('a', 0), c('b', 1)];
    const next = moveCategory(cats, 'a', 'b'); // display a,b,c → move a onto b → b,a,c
    expect(next.map((x) => x.id)).toEqual(['b', 'a', 'c']);
    expect(next.map((x) => x.sortIndex)).toEqual([0, 1, 2]);
  });

  it('returns the input unchanged when active === over or an id is unknown', () => {
    const cats = [c('a', 0), c('b', 1)];
    expect(moveCategory(cats, 'a', 'a')).toBe(cats);
    expect(moveCategory(cats, 'a', 'zzz')).toBe(cats);
  });
});
