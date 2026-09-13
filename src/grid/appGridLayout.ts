import type { Category, Service } from '../api';

// SPEC-app-grid (Amendment A1) — pure layout helpers. The flex-wrap page pack and
// the fixed-190px auto-fill tools track are pure CSS (see AppGrid.tsx / index.css);
// these functions own the JS-side math the component and its tests rely on.

// Kare's finalized tokens (A1 D-1) — byte-identical to the v14 .category-panel.
export const TILE_PX = 190;
export const GAP_PX = 16;
export const PADDING_PX = 16;
// SPEC-app-grid §10.4 (Caleb, 2026-09-12, OQ-3) — boxes snap to a 12-COLUMN
// GRID. A box's `gridWidth` is a SPAN: 3 (quarter), 4 (third), 6 (half) or 12
// (full). This replaces the 1–8 tile-count model: a box's floor is now a
// FRACTION of the frame, not N×190px, so it no longer depends on the tile size
// (which is why the 190→236px compact tile did not have to land here too).
export const COLUMNS = 12;
export const SPANS = [3, 4, 6, 12] as const;
export type Span = (typeof SPANS)[number];
export const MAX_WIDTH = 12;
// Half width — the same share of the row the old default (3 of 6) had.
export const DEFAULT_WIDTH: Span = 6;

// clampWidth snaps a stored width to a legal span. A legal span passes through.
// Anything else — a legacy 1–8 tile count from a backend that has not run
// migration 0013 yet, or junk — snaps to the NEAREST span (ties go narrower), so
// a bad stored value never breaks the layout. The backend migration is the
// authoritative remap (SPEC-app-grid §10.4 table); this is only the safety net.
export function clampWidth(w: number): Span {
  if (!Number.isFinite(w)) return DEFAULT_WIDTH;
  const r = Math.round(w);
  if ((SPANS as readonly number[]).includes(r)) return r as Span;
  let best: Span = SPANS[0];
  for (const s of SPANS) if (Math.abs(s - r) < Math.abs(best - r)) best = s;
  return best;
}

// boxWidthPx is a box's FLOOR width in px for span `w` inside a frame whose
// inner content width is `contentWidth`: the span's share of the frame, with
// the flex gaps between boxes in a full row taken out so that 3+3+6 (or
// 4+4+4, 6+6, 12) fills the row EXACTLY. That is the "snap" the artboard
// asked for — no dead space to the right of a row of boxes.
export function boxWidthPx(w: number, contentWidth: number): number {
  const span = clampWidth(w);
  return Math.floor(((contentWidth + GAP_PX) * span) / COLUMNS - GAP_PX);
}

// SPEC-pane-fill-reflow (Phase 1, R3) — contentMaxPx is a box's content-max GROW
// CAP: the exact width to lay all `n` apps out in ONE row (n fixed 190px tiles +
// (n-1) gaps + 2×16 pad). Same slot formula as boxWidthPx but DELIBERATELY
// UNCLAMPED: boxWidthPx clamps --w to the admin 1–8 range, whereas a box can hold
// more than 8 apps and must report its true single-row width so R3 can grow it to
// reveal every column. An empty box (0 apps) has no content, so its cap is 0 (the
// --w floor is the box's minimum; the caller maxes cap against it).
export function contentMaxPx(n: number): number {
  const c = Math.max(0, Math.round(n));
  if (c === 0) return 0;
  return c * TILE_PX + (c - 1) * GAP_PX + 2 * PADDING_PX;
}

// SPEC-pane-fill-reflow (Phase 1, R4) — rowFillCounts bins boxes into the visual
// flex-wrap rows the browser forms, greedily filling a row by each box's FLOOR
// width (its --w basis) until the next box won't fit, then wrapping. It returns,
// per box (input order), how many boxes share its row. A count of 1 marks a LONE
// box: R4 grows a lone populated box to 100% of the frame rather than stranding it
// at its content-max. The pack need only tell rows-of-one from rows-of-many (the
// floor-sum approach does that reliably); it is not a pixel-perfect layout.
export function rowFillCounts(floors: number[], contentWidth: number, gap: number = GAP_PX): number[] {
  const counts = new Array<number>(floors.length).fill(1);
  const rows: number[][] = [];
  let row: number[] = [];
  let used = 0;
  for (let i = 0; i < floors.length; i++) {
    const next = row.length === 0 ? floors[i] : used + gap + floors[i];
    if (row.length > 0 && next > contentWidth) {
      rows.push(row);
      row = [i];
      used = floors[i];
    } else {
      row.push(i);
      used = next;
    }
  }
  if (row.length > 0) rows.push(row);
  for (const r of rows) for (const idx of r) counts[idx] = r.length;
  return counts;
}

// SPEC-ultrawide-fluid-frame (Phase 1b) — the JS mirror of the CONTENT_WIDTH
// frame (src/layout.ts: `max-w-[max(1536px,92vw)] px-4`). The frame caps at
// 1536px on standard desktops and grows fluidly as 92vw beyond ~1670px, so big
// monitors (2560/3840) use their width instead of a fixed centered island.
// frameContentPx returns the INNER width the `.app-grid` flex rows pack into
// (frame minus the px-4 padding) — the R4 lone-box bin-pack reads it. Keep in
// lock-step with the CSS token; ultrawide-frame.test.ts guards the pairing.
export const FRAME_MAX_PX = 1536;
export const FRAME_FLUID_VW = 0.92;
export const FRAME_PAD_PX = 32;
export function frameContentPx(vw: number): number {
  return Math.min(vw, Math.max(FRAME_MAX_PX, vw * FRAME_FLUID_VW)) - FRAME_PAD_PX;
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
