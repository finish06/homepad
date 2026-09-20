import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  RECENT_KEY,
  RECENT_MAX,
  clearRecentlyOpened,
  recordOpened,
  resolveRecent,
  useRecentlyOpened,
} from './recentlyOpened';
import type { Service } from '../api';

function svc(id: string): Service {
  return {
    id, slug: id, name: id, description: '', url: 'https://x.test', icon: '',
    status: 'UP', favorite: false, iconLight: false, iconDark: false,
    categoryId: null, categoryName: null,
  };
}

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('cap3 — recently-opened store', () => {
  it('AC-002 — records newest-first', () => {
    recordOpened('a');
    recordOpened('b');
    expect(JSON.parse(localStorage.getItem(RECENT_KEY)!)).toEqual(['b', 'a']);
  });

  it('AC-002 — re-opening moves to position 0 rather than duplicating', () => {
    recordOpened('a');
    recordOpened('b');
    recordOpened('a');
    expect(JSON.parse(localStorage.getItem(RECENT_KEY)!)).toEqual(['a', 'b']);
  });

  it(`AC-002 — caps at ${RECENT_MAX}, dropping the oldest`, () => {
    for (let i = 0; i < RECENT_MAX + 3; i++) recordOpened(`s${i}`);
    const stored: string[] = JSON.parse(localStorage.getItem(RECENT_KEY)!);
    expect(stored).toHaveLength(RECENT_MAX);
    expect(stored[0]).toBe(`s${RECENT_MAX + 2}`);
    expect(stored).not.toContain('s0');
  });

  it('AC-005 — clear empties the key', () => {
    recordOpened('a');
    clearRecentlyOpened();
    expect(localStorage.getItem(RECENT_KEY)).toBeNull();
  });

  it('AC-006 — ids with no live service are dropped, order preserved', () => {
    const items = [svc('a'), svc('c')];
    expect(resolveRecent(['c', 'gone', 'a'], items).map((s) => s.id)).toEqual(['c', 'a']);
  });

  it('a corrupt stored value is treated as empty, not thrown', () => {
    localStorage.setItem(RECENT_KEY, '{"not":"an array"}');
    expect(() => recordOpened('a')).not.toThrow();
    expect(JSON.parse(localStorage.getItem(RECENT_KEY)!)).toEqual(['a']);
  });

  it('a storage throw degrades silently', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('private mode');
    });
    expect(() => recordOpened('a')).not.toThrow();
    spy.mockRestore();
  });

  it('the hook re-resolves when a tile records an open', () => {
    const items = [svc('a'), svc('b')];
    const { result } = renderHook(() => useRecentlyOpened(items));
    expect(result.current).toEqual([]);
    act(() => recordOpened('b'));
    expect(result.current.map((s) => s.id)).toEqual(['b']);
    act(() => recordOpened('a'));
    expect(result.current.map((s) => s.id)).toEqual(['a', 'b']);
    act(() => clearRecentlyOpened());
    expect(result.current).toEqual([]);
  });
});
