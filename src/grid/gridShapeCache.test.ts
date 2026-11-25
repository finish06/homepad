import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Service } from '../api';
import type { Box } from './appGridLayout';
import {
  cancelPendingShapeWrite,
  clearShapeCache,
  FALLBACK_SHAPE,
  readShape,
  scheduleShapeWrite,
  SHAPE_KEY,
  SHAPE_WRITE_DELAY_MS,
  shapeKey,
  shapeOf,
} from './gridShapeCache';

// SPEC-dashboard-empty-loading §3.1 — AC-006, AC-019, AC-020 (the cache half).

const tools = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `s${i}` }) as Service);
const box = (id: string, width: number, n: number): Box => ({ id, title: `Box ${id}`, width, tools: tools(n) });
const stored = () => JSON.parse(localStorage.getItem(SHAPE_KEY) ?? 'null');

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
});
afterEach(() => {
  cancelPendingShapeWrite();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('shapeOf / scheduleShapeWrite — what is stored (AC-006)', () => {
  it('writes only the version, the user, recent and per box span, exact count and collapsed', () => {
    const shape = shapeOf([box('c1', 4, 30), box('c2', 12, 0), box('', 6, 2)], true);
    scheduleShapeWrite('u1', shape);
    vi.advanceTimersByTime(SHAPE_WRITE_DELAY_MS);
    const s = stored();
    expect(Object.keys(s).sort()).toEqual(['boxes', 'recent', 'user', 'v']);
    expect(s).toEqual({
      v: 1,
      user: 'u1',
      recent: true,
      boxes: [
        { span: 4, count: 30, collapsed: false },
        { span: 12, count: 0, collapsed: false },
        { span: 6, count: 2, collapsed: false },
      ],
    });
    for (const b of s.boxes) expect(Object.keys(b).sort()).toEqual(['collapsed', 'count', 'span']);
    // No names or ids beyond the user id.
    expect(localStorage.getItem(SHAPE_KEY)).not.toMatch(/Box|c1|c2|s0/);
  });

  it('keeps counts above 12 exact (--grow and --cap use the full count)', () => {
    scheduleShapeWrite('u1', shapeOf([box('c1', 3, 47)], false));
    vi.advanceTimersByTime(SHAPE_WRITE_DELAY_MS);
    expect(stored().boxes[0].count).toBe(47);
  });

  it('writes collapsed as false until #718 supplies it (AC-020)', () => {
    expect(shapeOf([box('c1', 3, 1)], false).boxes[0].collapsed).toBe(false);
    expect(shapeOf([box('c1', 3, 1)], false, () => true).boxes[0].collapsed).toBe(true);
  });

  it('debounces: a burst is one write, after 500 ms', () => {
    const set = vi.spyOn(Storage.prototype, 'setItem');
    scheduleShapeWrite('u1', shapeOf([box('c1', 3, 1)], false));
    vi.advanceTimersByTime(200);
    scheduleShapeWrite('u1', shapeOf([box('c1', 6, 1)], false));
    vi.advanceTimersByTime(SHAPE_WRITE_DELAY_MS - 1);
    expect(set).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(set).toHaveBeenCalledTimes(1);
    expect(stored().boxes[0].span).toBe(6);
  });

  it('skips a write equal to the stored entry', () => {
    const shape = shapeOf([box('c1', 3, 1)], false);
    scheduleShapeWrite('u1', shape);
    vi.advanceTimersByTime(SHAPE_WRITE_DELAY_MS);
    const set = vi.spyOn(Storage.prototype, 'setItem');
    scheduleShapeWrite('u1', shapeOf([box('c1', 3, 1)], false));
    vi.advanceTimersByTime(SHAPE_WRITE_DELAY_MS);
    expect(set).not.toHaveBeenCalled();
  });

  it('cancelPendingShapeWrite drops a queued write', () => {
    scheduleShapeWrite('u1', shapeOf([box('c1', 3, 1)], false));
    cancelPendingShapeWrite();
    vi.advanceTimersByTime(SHAPE_WRITE_DELAY_MS * 2);
    expect(localStorage.getItem(SHAPE_KEY)).toBeNull();
  });

  it('a write that throws is swallowed', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    scheduleShapeWrite('u1', shapeOf([box('c1', 3, 1)], false));
    expect(() => vi.advanceTimersByTime(SHAPE_WRITE_DELAY_MS)).not.toThrow();
  });
});

describe('readShape — per user, bad entries count as missing (AC-006, AC-019)', () => {
  const put = (v: unknown) => localStorage.setItem(SHAPE_KEY, typeof v === 'string' ? v : JSON.stringify(v));
  const good = { v: 1, user: 'u1', recent: true, boxes: [{ span: 6, count: 30, collapsed: true }] };

  it('reads this user\'s entry', () => {
    put(good);
    expect(readShape('u1')).toEqual({ recent: true, boxes: [{ span: 6, count: 30, collapsed: true }] });
  });

  it('another user\'s entry counts as missing', () => {
    put(good);
    expect(readShape('u2')).toBeNull();
  });

  it('no user id reads nothing', () => {
    put(good);
    expect(readShape(undefined)).toBeNull();
  });

  it.each([
    ['junk', '{not json'],
    ['null', 'null'],
    ['another version', { ...good, v: 2 }],
    ['a bad span', { ...good, boxes: [{ span: 5, count: 1, collapsed: false }] }],
    ['a fractional count', { ...good, boxes: [{ span: 6, count: 1.5, collapsed: false }] }],
    ['a negative count', { ...good, boxes: [{ span: 6, count: -1, collapsed: false }] }],
    ['a count over 999', { ...good, boxes: [{ span: 6, count: 1000, collapsed: false }] }],
    ['a non-boolean collapsed', { ...good, boxes: [{ span: 6, count: 1, collapsed: 'no' }] }],
    ['a non-boolean recent', { ...good, recent: 1 }],
    ['boxes not an array', { ...good, boxes: {} }],
  ])('%s counts as missing', (_label, value) => {
    put(value);
    expect(readShape('u1')).toBeNull();
  });

  it('a read that throws counts as missing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(readShape('u1')).toBeNull();
  });

  it('the fallback is two half boxes of 3 and one full box of 4, no recent row (OQ-1)', () => {
    expect(FALLBACK_SHAPE).toEqual({
      recent: false,
      boxes: [
        { span: 6, count: 3, collapsed: false },
        { span: 6, count: 3, collapsed: false },
        { span: 12, count: 4, collapsed: false },
      ],
    });
  });
});

describe('clearShapeCache — sign-out (AC-019)', () => {
  it('cancels a pending write first, then removes the key', () => {
    put();
    scheduleShapeWrite('u1', shapeOf([box('c1', 12, 1)], false));
    clearShapeCache();
    vi.advanceTimersByTime(SHAPE_WRITE_DELAY_MS * 2);
    expect(localStorage.getItem(SHAPE_KEY)).toBeNull();
  });

  it('a remove that throws is swallowed', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(() => clearShapeCache()).not.toThrow();
  });

  function put() {
    localStorage.setItem(SHAPE_KEY, JSON.stringify({ v: 1, user: 'u1', recent: false, boxes: [] }));
  }
});

describe('shapeKey — the compact change key', () => {
  it('encodes every field, and differs when any field differs', () => {
    const a = { recent: true, boxes: [{ span: 6 as const, count: 30, collapsed: false }, { span: 12 as const, count: 0, collapsed: true }] };
    expect(shapeKey(a)).toBe('1|6:30:0,12:0:1');
    expect(shapeKey({ recent: false, boxes: [] })).toBe('0|');
    expect(shapeKey({ ...a, recent: false })).not.toBe(shapeKey(a));
    expect(shapeKey({ ...a, boxes: [{ span: 6, count: 31, collapsed: false }, a.boxes[1]] })).not.toBe(shapeKey(a));
  });
});
