// SPEC-tile-density §5 + decision record 2026-09-12 OQ-9 — density is a PER-USER,
// server-side preference (Caleb's decision), with localStorage demoted to a
// per-device cache so the first paint does not flash the default. These are the
// RED tests for that contract: the server value seeds and wins, choices are
// written through to PATCH /api/me, and the feature degrades to the per-device
// store when the server has no field (older backend) or the write fails.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { setDensityPref } from '../api';
import { useTileDensity } from './tileDensity';

vi.mock('../api', () => ({
  setDensityPref: vi.fn(async () => true),
}));
const mockedSet = vi.mocked(setDensityPref);

const KEY = 'homepad:tile-density';

beforeEach(() => {
  localStorage.clear();
  mockedSet.mockClear();
  mockedSet.mockResolvedValue(true);
});
afterEach(() => localStorage.clear());

describe('SPEC-tile-density OQ-9 — per-user, server-side density', () => {
  it('seeds from the server preference when one is given', () => {
    const { result } = renderHook(() => useTileDensity('list'));
    expect(result.current[0]).toBe('list');
  });

  it('the server value wins over a different cached device value', () => {
    localStorage.setItem(KEY, 'large');
    const { result } = renderHook(() => useTileDensity('list'));
    expect(result.current[0]).toBe('list');
  });

  it('caches the server value on this device so the next paint does not flash', () => {
    renderHook(() => useTileDensity('list'));
    expect(localStorage.getItem(KEY)).toBe('list');
  });

  it('adopts the server value when it resolves after mount (/api/me is async)', () => {
    const { result, rerender } = renderHook(({ pref }: { pref?: string }) => useTileDensity(pref as never), {
      initialProps: { pref: undefined as string | undefined },
    });
    expect(result.current[0]).toBe('compact');
    rerender({ pref: 'large' });
    expect(result.current[0]).toBe('large');
  });

  it('falls back to the device cache, then the default, when the server has no field', () => {
    localStorage.setItem(KEY, 'large');
    const a = renderHook(() => useTileDensity(undefined));
    expect(a.result.current[0]).toBe('large');
    localStorage.clear();
    const b = renderHook(() => useTileDensity(undefined));
    expect(b.result.current[0]).toBe('compact');
  });

  it('ignores a junk server value', () => {
    const { result } = renderHook(() => useTileDensity('huge' as never));
    expect(result.current[0]).toBe('compact');
  });

  it('writes a choice through to PATCH /api/me and to the device cache', async () => {
    const { result } = renderHook(() => useTileDensity('compact'));
    await act(async () => {
      result.current[1]('list');
    });
    expect(result.current[0]).toBe('list');
    expect(mockedSet).toHaveBeenCalledWith('list');
    expect(localStorage.getItem(KEY)).toBe('list');
  });

  it('keeps the choice on this device when the server write fails (degrades, never reverts)', async () => {
    mockedSet.mockResolvedValue(false);
    const { result } = renderHook(() => useTileDensity('compact'));
    await act(async () => {
      result.current[1]('large');
    });
    expect(result.current[0]).toBe('large');
    expect(localStorage.getItem(KEY)).toBe('large');
  });

  it('does not PATCH when the choice is unchanged', async () => {
    const { result } = renderHook(() => useTileDensity('list'));
    await act(async () => {
      result.current[1]('list');
    });
    expect(mockedSet).not.toHaveBeenCalled();
  });
});

// #441 — `set()` used to call saveDensity() and setDensityPref() INSIDE the
// setDensity((cur) => …) updater. React 18 StrictMode double-invokes state
// updater functions in development precisely to expose side effects like these,
// so every density change wrote localStorage twice and PATCHed /api/me twice.
// Harmless today (both writes are idempotent), but an updater must be pure:
// the next side effect added there would not be idempotent, and nothing would
// say so. These run under StrictMode on purpose — without it React invokes the
// updater once and the bug is invisible.
describe('#441 — set() persists exactly once, even under StrictMode', () => {
  const storageWrites = (spy: ReturnType<typeof vi.spyOn>) =>
    spy.mock.calls.filter(([k]) => k === 'homepad:tile-density').length;

  it('a change writes the device cache once and PATCHes the server once', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const { result } = renderHook(() => useTileDensity('compact'), { wrapper: StrictMode });
    setItem.mockClear();
    mockedSet.mockClear();

    act(() => result.current[1]('list'));

    expect(result.current[0]).toBe('list');
    expect(storageWrites(setItem)).toBe(1);
    expect(mockedSet).toHaveBeenCalledTimes(1);
    expect(mockedSet).toHaveBeenCalledWith('list');
    setItem.mockRestore();
  });

  it('setting the current value is still a no-op — no write, no PATCH', () => {
    // The fix moves the side effects out of the updater, which is where the
    // `cur === d` short-circuit lived. This pins that the short-circuit survived.
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const { result } = renderHook(() => useTileDensity('compact'), { wrapper: StrictMode });
    setItem.mockClear();
    mockedSet.mockClear();

    act(() => result.current[1]('compact'));

    expect(storageWrites(setItem)).toBe(0);
    expect(mockedSet).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it('two quick changes persist each value once, in order', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const { result } = renderHook(() => useTileDensity('compact'), { wrapper: StrictMode });
    setItem.mockClear();
    mockedSet.mockClear();

    act(() => {
      result.current[1]('list');
      result.current[1]('large');
    });

    expect(result.current[0]).toBe('large');
    expect(mockedSet.mock.calls.map(([d]) => d)).toEqual(['list', 'large']);
    expect(storageWrites(setItem)).toBe(2);
    setItem.mockRestore();
  });
});
