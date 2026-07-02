import type { Category, Service } from './api';

// SPEC-app-grid (Amendment A1) — pure layout helpers. The flex-wrap page pack and
// the fixed-190px auto-fill tools track are pure CSS (see AppGrid.tsx / index.css);
// these functions own the JS-side math the component and its tests rely on.

// Kare's finalized tokens (A1 D-1) — byte-identical to the v14 .category-panel.
export const TILE_PX = 190;
export const GAP_PX = 16;
export const PADDING_PX = 16;
export const MAX_WIDTH = 8; // A1: range widens 1–6 → 1–8 (Caleb confirmed).
export const DEFAULT_WIDTH = 3;

// clampWidth constrains a configured box width to the valid 1–8 range (rounding
// a stray float), so a bad stored value never breaks the layout.
export function clampWidth(w: number): number {
  return Math.max(1, Math.min(MAX_WIDTH, Math.round(w)));
}

// boxWidthPx is the exact content-sized width of a box at width `w` (AC-002-A1):
// w fixed 190px tiles + the (w-1) inner gaps + 2×16px padding. Identical to the
// `.category-panel` calc() so App Grid and the v14 field share one box model.
export function boxWidthPx(w: number): number {
  const c = clampWidth(w);
  return c * TILE_PX + (c - 1) * GAP_PX + 2 * PADDING_PX;
}

// fitsViewport answers "does a box at width `w` fit `vw` px without overflowing?"
// It drives the D-3 width-selector disable: a --w whose box would exceed the
// admin's current viewport is offered disabled so they never set an off-screen
// box on their own display. The structural max-width:100% + auto-fill wrap in CSS
// is the real cross-viewport backstop; this is the set-time affordance.
export function fitsViewport(w: number, vw: number): boolean {
  return boxWidthPx(w) <= vw;
}

// A box is one App Grid container: a category plus the caller's own tools in it.
// An empty `id` marks the synthetic "Uncategorized" box (no real category → no
// width selector, no persistence).
export type Box = {
  id: string;
  title: string;
  width: number;
  tools: Service[];
};

const UNCATEGORIZED_TITLE = 'Uncategorized';

// boxesFromData maps the shared categories (in their admin sort order) to boxes,
// filling each with the caller's OWN services for that category (AC-024). An
// empty category still yields a box with no tools (AC-012). Services with no
// category collect into a single trailing "Uncategorized" box, rendered only
// when at least one such service exists.
export function boxesFromData(categories: Category[], services: Service[]): Box[] {
  const byCategory = new Map<string, Service[]>();
  const uncategorized: Service[] = [];
  for (const s of services) {
    if (s.categoryId) {
      const list = byCategory.get(s.categoryId) ?? [];
      list.push(s);
      byCategory.set(s.categoryId, list);
    } else {
      uncategorized.push(s);
    }
  }

  const ordered = [...categories].sort((a, b) => a.sortIndex - b.sortIndex);
  const boxes: Box[] = ordered.map((c) => ({
    id: c.id,
    title: c.name,
    width: clampWidth(c.gridWidth ?? DEFAULT_WIDTH),
    tools: byCategory.get(c.id) ?? [],
  }));

  if (uncategorized.length > 0) {
    boxes.push({ id: '', title: UNCATEGORIZED_TITLE, width: DEFAULT_WIDTH, tools: uncategorized });
  }
  return boxes;
}

// moveCategory reorders the boxes for Edit-Dashboard drag-to-reorder: it takes the
// admin (sortIndex) order, moves `activeId` into `overId`'s slot preserving every
// other box's relative order, and rewrites sortIndex to the new contiguous
// positions so boxesFromData renders the new order. Returns the input untouched
// (same reference) when the drop is a no-op or an id is unknown, so callers can
// skip a needless persist. AppGrid's onDragEnd persists the new id order via
// setCategoryOrder — the same whole-array contract the old Catalog reorder used.
export function moveCategory(categories: Category[], activeId: string, overId: string): Category[] {
  if (activeId === overId) return categories;
  const ordered = [...categories].sort((a, b) => a.sortIndex - b.sortIndex);
  const from = ordered.findIndex((c) => c.id === activeId);
  const to = ordered.findIndex((c) => c.id === overId);
  if (from < 0 || to < 0) return categories;
  const moved = ordered.slice();
  const [item] = moved.splice(from, 1);
  moved.splice(to, 0, item);
  return moved.map((c, i) => ({ ...c, sortIndex: i }));
}
