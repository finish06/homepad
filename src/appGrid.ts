import type { Category, Service } from './api';

// SPEC-app-grid — pure layout helpers. The greedy pack + wrap of boxes across
// the 6-column page grid is done by CSS grid auto-placement (see AppGrid.tsx);
// these functions own the JS-side math the component and its tests rely on.

export const MAX_WIDTH = 6;
export const DEFAULT_WIDTH = 3;
export const MOBILE_CAP = 2;

// clampWidth constrains a configured box width to the valid 1–6 range (rounding
// a stray float), so a bad stored value never breaks the grid template.
export function clampWidth(w: number): number {
  return Math.max(1, Math.min(MAX_WIDTH, Math.round(w)));
}

// effectiveWidth is the width actually used to render at the current viewport:
// at ≤640px both the box's column span and its links-per-row cap at 2 (AC-022);
// above 640px the full configured width is used (AC-023).
export function effectiveWidth(w: number, isMobile: boolean): number {
  const c = clampWidth(w);
  return isMobile ? Math.min(c, MOBILE_CAP) : c;
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
