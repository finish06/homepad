import { describe, expect, it } from 'vitest';
import type { Category, Service } from '../api';
import { boxesFromData, boxWidthPx, clampWidth, contentMaxPx, DEFAULT_WIDTH, moveCategory, rowFillCounts, SPANS } from './appGridLayout';

// SPEC-app-grid §10.4 (12-column grid, 2026-09-12) + Amendment A1 — pure layout
// helpers. The flex-wrap page pack + the fixed auto-fill tools track are pure CSS
// (browser-gate territory); these cover the JS-side math: the span snap (3/4/6/12),
// the span → floor-px formula that makes a full row of spans fill the frame
// exactly, the R3 content-max cap, R4 lone-box detection, and grouping the user's
// own services under their box in admin order (AC-012, AC-024).

const cat = (id: string, name: string, sortIndex: number, gridWidth?: number): Category => ({
  id,
  name,
  sortIndex,
  gridWidth,
});

const svc = (id: string, name: string, categoryId?: string | null): Service =>
  ({ id, name, categoryId, slug: id, description: '', url: 'https://x', icon: '', status: 'UNKNOWN', favorite: false, iconLight: false, iconDark: false }) as Service;

describe('clampWidth (§10.4 — snap to a legal 12-column span)', () => {
  it('exposes exactly the four spans, half as the default', () => {
    expect(SPANS).toEqual([3, 4, 6, 12]);
    expect(DEFAULT_WIDTH).toBe(6);
  });

  it('passes a legal span through untouched', () => {
    for (const s of SPANS) expect(clampWidth(s)).toBe(s);
  });

  it('snaps a legacy 1–8 tile count (un-migrated backend) or junk to the nearest span', () => {
    expect(clampWidth(1)).toBe(3);
    expect(clampWidth(2)).toBe(3); // nearest; ties go narrower
    expect(clampWidth(5)).toBe(4); // |5-4| = |5-6| → narrower
    expect(clampWidth(7)).toBe(6);
    expect(clampWidth(8)).toBe(6);
    expect(clampWidth(9)).toBe(6); // |9-6| = |9-12| → narrower
    expect(clampWidth(10)).toBe(12);
    expect(clampWidth(0)).toBe(3);
    expect(clampWidth(-3)).toBe(3);
    expect(clampWidth(99)).toBe(12);
    expect(clampWidth(NaN)).toBe(DEFAULT_WIDTH);
    expect(clampWidth(5.6)).toBe(6);
  });
});

describe('boxWidthPx (§10.4 — a span is a fraction of the frame)', () => {
  // floor = (content + gap) × span / 12 − gap, so a full row of spans fills the
  // frame EXACTLY once the (n−1) flex gaps between them are counted.
  const content = 1504; // frameContentPx(1536)
  it('fills the row exactly for every legal combination that sums to 12', () => {
    const gap = 16;
    const row = (spans: number[]) => spans.reduce((a, s) => a + boxWidthPx(s, content), 0) + gap * (spans.length - 1);
    // Math.floor per box can leave ≤ (n−1) px of slack, never overflow.
    for (const spans of [[12], [6, 6], [4, 4, 4], [3, 3, 3, 3], [3, 3, 6], [6, 3, 3]]) {
      expect(row(spans)).toBeLessThanOrEqual(content);
      expect(row(spans)).toBeGreaterThan(content - spans.length);
    }
  });

  it('is proportional: half is twice a quarter plus one gap', () => {
    expect(boxWidthPx(6, content)).toBe(2 * boxWidthPx(3, content) + 16);
    expect(boxWidthPx(12, content)).toBe(content);
  });

  it('tracks the frame — a wider monitor gets wider boxes for the same span', () => {
    expect(boxWidthPx(3, 3500)).toBeGreaterThan(boxWidthPx(3, 1504));
  });

  it('snaps a legacy value before sizing', () => {
    expect(boxWidthPx(8, content)).toBe(boxWidthPx(6, content));
  });
});

// SPEC-pane-fill-reflow (Phase 1, R3) — contentMaxPx is the box's content-max
// GROW CAP: the width to show all n apps in ONE row (n fixed tiles + gaps +
// padding). It is tile-count based and unclamped, independent of the span floor:
// a box grows from its span floor up to this cap.
describe('contentMaxPx (R3 content-max grow cap)', () => {
  it('computes the single-row content width for n apps (n × 190 + (n−1) × 16 + 32)', () => {
    expect(contentMaxPx(1)).toBe(222);
    expect(contentMaxPx(3)).toBe(634);
    expect(contentMaxPx(5)).toBe(1046);
  });

  it('is 0 for an empty box (0 apps) — the box stays at its --w floor, never grows (AC-R3-5)', () => {
    expect(contentMaxPx(0)).toBe(0);
  });

  it('is unclamped: a 10-app box reports its true single-row width', () => {
    expect(contentMaxPx(10)).toBe(2076); // 10×190 + 9×16 + 32
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
    const cats = [cat('c1', 'Media', 0, 4), cat('c2', 'Infra', 1, 3)];
    const services = [
      svc('s1', 'Plex', 'c1'),
      svc('s2', 'Grafana', 'c2'),
      svc('s3', 'Jellyfin', 'c1'),
    ];
    const boxes = boxesFromData(cats, services);
    expect(boxes.map((b) => b.title)).toEqual(['Media', 'Infra']);
    expect(boxes[0]).toMatchObject({ id: 'c1', width: 4 });
    expect(boxes[0].tools.map((t) => t.name)).toEqual(['Plex', 'Jellyfin']);
    expect(boxes[1]).toMatchObject({ id: 'c2', width: 3 });
    expect(boxes[1].tools.map((t) => t.name)).toEqual(['Grafana']);
  });

  it('keeps an empty category as a box with no tools (AC-012)', () => {
    const boxes = boxesFromData([cat('c1', 'Empty', 0, 3)], []);
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toMatchObject({ id: 'c1', title: 'Empty', width: 3 });
    expect(boxes[0].tools).toEqual([]);
  });

  it('defaults a category with no gridWidth to the half span (6)', () => {
    const boxes = boxesFromData([cat('c1', 'Media', 0)], []);
    expect(boxes[0].width).toBe(6);
  });

  it('snaps a legacy tile-count width from an un-migrated backend to a span', () => {
    const boxes = boxesFromData([cat('c1', 'Media', 0, 8)], []);
    expect(boxes[0].width).toBe(6);
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
