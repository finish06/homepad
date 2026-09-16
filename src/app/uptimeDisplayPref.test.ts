// cap6 v2 — the per-user "show uptime display" preference (the per-tile
// sparkline). RED tests for the STATE + PERSISTENCE contract:
//   AC-016/026 default from the account · AC-022 rollback on a failed save
//   AC-023 no first-paint flash (localStorage cache) · older-backend degrade
//
// Storage model (spec §3 OQ-2, resolved): /api/me is the source of truth and wins
// on every resolve; localStorage is a FIRST-PAINT CACHE ONLY. This is the
// tileDensity.ts model — but unlike tileDensity, a failed write ROLLS BACK
// (AC-010 follows the setFavorite/setLayout shape, not fire-and-forget).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('../api', () => ({ setUptimeDisplayPref: vi.fn() }));
import { setUptimeDisplayPref } from '../api';

import {
  DEFAULT_SHOW_UPTIME_DISPLAY,
  loadUptimeDisplayPref,
  saveUptimeDisplayPref,
  useUptimeDisplayPref,
} from './uptimeDisplayPref';

const KEY = 'homepad:show-uptime-display';
const mockSet = vi.mocked(setUptimeDisplayPref);

beforeEach(() => {
  localStorage.clear();
  mockSet.mockReset();
  mockSet.mockResolvedValue(true);
});
afterEach(() => localStorage.clear());

describe('uptime display preference — state + persistence', () => {
  it('AC-026 — defaults to visible when nothing is stored', () => {
    expect(DEFAULT_SHOW_UPTIME_DISPLAY).toBe(true);
    expect(loadUptimeDisplayPref()).toBe(true);
  });

  it('AC-023 — honours a cached false synchronously on the first render', () => {
    saveUptimeDisplayPref(false);
    expect(localStorage.getItem(KEY)).toBe('false');
    // No await: the very first value must already be false, or the bar flashes.
    const { result } = renderHook(() => useUptimeDisplayPref(undefined));
    expect(result.current[0]).toBe(false);
  });

  it('AC-023 — a malformed cached value falls back to the default', () => {
    localStorage.setItem(KEY, 'not-a-boolean');
    expect(loadUptimeDisplayPref()).toBe(true);
  });

  it('AC-023 — a storage throw degrades to the default without throwing', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('private mode');
    });
    expect(() => loadUptimeDisplayPref()).not.toThrow();
    expect(loadUptimeDisplayPref()).toBe(true);
    spy.mockRestore();

    const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('private mode');
    });
    expect(() => saveUptimeDisplayPref(false)).not.toThrow();
    setSpy.mockRestore();
  });

  it('the server value wins over the cache and is mirrored into it', async () => {
    saveUptimeDisplayPref(true);
    const { result } = renderHook(({ pref }) => useUptimeDisplayPref(pref), {
      initialProps: { pref: undefined as boolean | undefined },
    });
    expect(result.current[0]).toBe(true);

    const { result: r2 } = renderHook(() => useUptimeDisplayPref(false));
    await waitFor(() => expect(r2.current[0]).toBe(false));
    expect(localStorage.getItem(KEY)).toBe('false');
  });

  it('writes through to the server and caches the new value', async () => {
    const { result } = renderHook(() => useUptimeDisplayPref(undefined));
    await act(async () => result.current[1](false));
    expect(mockSet).toHaveBeenCalledWith(false);
    expect(result.current[0]).toBe(false);
    expect(localStorage.getItem(KEY)).toBe('false');
  });

  it('AC-022 — rolls back to the persisted value when the save fails', async () => {
    mockSet.mockResolvedValue(false);
    const { result } = renderHook(() => useUptimeDisplayPref(undefined));
    expect(result.current[0]).toBe(true);

    await act(async () => result.current[1](false));

    await waitFor(() => expect(result.current[0]).toBe(true));
    expect(localStorage.getItem(KEY)).toBe('true');
  });

  it('AC-022 — a rejected write also rolls back rather than leaving the toggle flipped', async () => {
    mockSet.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useUptimeDisplayPref(undefined));
    await act(async () => result.current[1](false));
    await waitFor(() => expect(result.current[0]).toBe(true));
  });

  it('does not write when the value is unchanged', async () => {
    const { result } = renderHook(() => useUptimeDisplayPref(undefined));
    await act(async () => result.current[1](true));
    expect(mockSet).not.toHaveBeenCalled();
  });
});
