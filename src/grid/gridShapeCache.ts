import { SPANS, type Box, type Span } from './appGridLayout';

// SPEC-dashboard-empty-loading §3.1 — the skeleton cache. While the dashboard
// loads, AppGrid draws the shape of the last grid this device showed THIS user,
// so nothing jumps when the apps arrive (AC-003). One localStorage entry, one
// user: the shape is per user (AC-019) and holds no names or ids beyond the user
// id that says whose shape it is.
//
// The entry is `{ v: 1, user, recent, boxes: [{ span, count, collapsed }] }`:
//   span      the box's width (3, 4, 6 or 12)
//   count     the EXACT number of apps the user sees in it — not capped, since
//             --grow and --cap use the full count
//   collapsed whether the box drew folded (SPEC-group-header-collapse; always
//             false until #718 ships)
//   recent    whether the Recently opened row drew

export const SHAPE_KEY = 'homepad.gridShape';
export const SHAPE_VERSION = 1;
export const SHAPE_WRITE_DELAY_MS = 500;
const MAX_COUNT = 999;

export type ShapeBox = { span: Span; count: number; collapsed: boolean };
export type GridShape = { recent: boolean; boxes: ShapeBox[] };
type StoredShape = GridShape & { v: number; user: string };

// OQ-1 — no cache, a bad one, or another user's: two half boxes of 3 tiles and
// one full box of 4. No Recently opened row (AC-005).
export const FALLBACK_SHAPE: GridShape = {
  recent: false,
  boxes: [
    { span: 6, count: 3, collapsed: false },
    { span: 6, count: 3, collapsed: false },
    { span: 12, count: 4, collapsed: false },
  ],
};

function validBox(b: unknown): b is ShapeBox {
  if (!b || typeof b !== 'object') return false;
  const { span, count, collapsed } = b as Record<string, unknown>;
  return (
    (SPANS as readonly unknown[]).includes(span) &&
    typeof count === 'number' &&
    Number.isInteger(count) &&
    count >= 0 &&
    count <= MAX_COUNT &&
    typeof collapsed === 'boolean'
  );
}

// readShape returns this user's cached shape, or null when it is missing, bad
// (does not parse, another version, a span or count out of range) or another
// user's. A storage read that throws counts as missing too. Never throws.
export function readShape(userId: string | undefined): GridShape | null {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(SHAPE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<StoredShape> | null;
    if (!p || typeof p !== 'object') return null;
    if (p.v !== SHAPE_VERSION || p.user !== userId) return null;
    if (typeof p.recent !== 'boolean' || !Array.isArray(p.boxes) || !p.boxes.every(validBox)) return null;
    return {
      recent: p.recent,
      boxes: p.boxes.map((b) => ({ span: b.span, count: b.count, collapsed: b.collapsed })),
    };
  } catch {
    return null;
  }
}

// shapeOf turns the boxes AppGrid renders into the cached form, in render order.
// `isCollapsed` is #718's hook; until then every box is written open.
export function shapeOf(
  boxes: Box[],
  recent: boolean,
  isCollapsed: (box: Box) => boolean = () => false,
): GridShape {
  return {
    recent,
    boxes: boxes.map((b) => ({
      span: b.width as Span,
      count: Math.min(b.tools.length, MAX_COUNT),
      collapsed: isCollapsed(b),
    })),
  };
}

function serialize(userId: string, shape: GridShape): string {
  const entry: StoredShape = {
    v: SHAPE_VERSION,
    user: userId,
    recent: shape.recent,
    boxes: shape.boxes.map((b) => ({ span: b.span, count: b.count, collapsed: b.collapsed })),
  };
  return JSON.stringify(entry);
}

// One grid per page, so one pending write per page.
let pending: ReturnType<typeof setTimeout> | null = null;

// scheduleShapeWrite writes `shape` under `userId` after SHAPE_WRITE_DELAY_MS.
// A newer call replaces a pending one, so a burst of changes is one write. A
// shape equal to the stored entry is not written again. Storage errors are
// swallowed: the cache is a nicety, never a reason to break the dashboard.
export function scheduleShapeWrite(userId: string, shape: GridShape): void {
  cancelPendingShapeWrite();
  const next = serialize(userId, shape);
  pending = setTimeout(() => {
    pending = null;
    try {
      if (localStorage.getItem(SHAPE_KEY) === next) return;
      localStorage.setItem(SHAPE_KEY, next);
    } catch {
      /* private mode / storage disabled — draw the fallback next time */
    }
  }, SHAPE_WRITE_DELAY_MS);
}

// cancelPendingShapeWrite drops a queued write. AppGrid calls it on unmount and
// when arrange mode turns on; sign-out calls it (through clearShapeCache) before
// removing the key, so a write queued just before sign-out can't put it back.
export function cancelPendingShapeWrite(): void {
  if (pending !== null) {
    clearTimeout(pending);
    pending = null;
  }
}

// clearShapeCache is sign-out's half of AC-019: cancel, then remove the key.
export function clearShapeCache(): void {
  cancelPendingShapeWrite();
  try {
    localStorage.removeItem(SHAPE_KEY);
  } catch {
    /* as above */
  }
}
