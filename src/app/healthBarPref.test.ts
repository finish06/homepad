// SPEC-health-bar-visibility-toggle — the per-user "show the distribution bar"
// preference. RED tests for the STATE + PERSISTENCE contract:
//   AC-001 default visible · AC-010 rollback on a failed save
//   AC-011 no first-paint flash (localStorage cache) · AC-012 older-backend degrade
//
// Storage model (spec §3 OQ-2, resolved): /api/me is the source of truth and wins
// on every resolve; localStorage is a FIRST-PAINT CACHE ONLY. This is the
// tileDensity.ts model — but unlike tileDensity, a failed write ROLLS BACK
// (AC-010 follows the setFavorite/setLayout shape, not fire-and-forget).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('../api', () => ({ setHealthBarPref: vi.fn() }));
import { setHealthBarPref } from '../api';

import {
  DEFAULT_SHOW_HEALTH_BAR,
  loadHealthBarPref,
  saveHealthBarPref,
  useHealthBarPref,
} from './healthBarPref';

const KEY = 'homepad:show-health-bar';
const mockSet = vi.mocked(setHealthBarPref);

beforeEach(() => {
  localStorage.clear();
  mockSet.mockReset();
  mockSet.mockResolvedValue(true);
});
afterEach(() => localStorage.clear());

describe('health bar preference — state + persistence', () => {
  it('AC-001 — defaults to visible when nothing is stored', () => {
    expect(DEFAULT_SHOW_HEALTH_BAR).toBe(true);
    expect(loadHealthBarPref()).toBe(true);
  });

  it('AC-011 — honours a cached false synchronously on the first render', () => {
    saveHealthBarPref(false);
    expect(localStorage.getItem(KEY)).toBe('false');
    // No await: the very first value must already be false, or the bar flashes.
    const { result } = renderHook(() => useHealthBarPref(undefined));
    expect(result.current[0]).toBe(false);
  });

  it('AC-011 — a malformed cached value falls back to the default', () => {
    localStorage.setItem(KEY, 'not-a-boolean');
    expect(loadHealthBarPref()).toBe(true);
  });

  it('AC-012 — a storage throw degrades to the default without throwing', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('private mode');
    });
    expect(() => loadHealthBarPref()).not.toThrow();
    expect(loadHealthBarPref()).toBe(true);
    spy.mockRestore();

    const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('private mode');
    });
    expect(() => saveHealthBarPref(false)).not.toThrow();
    setSpy.mockRestore();
  });

  it('the server value wins over the cache and is mirrored into it', async () => {
    saveHealthBarPref(true);
    const { result } = renderHook(({ pref }) => useHealthBarPref(pref), {
      initialProps: { pref: undefined as boolean | undefined },
    });
    expect(result.current[0]).toBe(true);

    const { result: r2 } = renderHook(() => useHealthBarPref(false));
    await waitFor(() => expect(r2.current[0]).toBe(false));
    expect(localStorage.getItem(KEY)).toBe('false');
  });

  it('writes through to the server and caches the new value', async () => {
    const { result } = renderHook(() => useHealthBarPref(undefined));
    await act(async () => result.current[1](false));
    expect(mockSet).toHaveBeenCalledWith(false);
    expect(result.current[0]).toBe(false);
    expect(localStorage.getItem(KEY)).toBe('false');
  });

  it('AC-010 — rolls back to the persisted value when the save fails', async () => {
    mockSet.mockResolvedValue(false);
    const { result } = renderHook(() => useHealthBarPref(undefined));
    expect(result.current[0]).toBe(true);

    await act(async () => result.current[1](false));

    await waitFor(() => expect(result.current[0]).toBe(true));
    expect(localStorage.getItem(KEY)).toBe('true');
  });

  it('AC-010 — a rejected write also rolls back rather than leaving the toggle flipped', async () => {
    mockSet.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useHealthBarPref(undefined));
    await act(async () => result.current[1](false));
    await waitFor(() => expect(result.current[0]).toBe(true));
  });

  it('does not write when the value is unchanged', async () => {
    const { result } = renderHook(() => useHealthBarPref(undefined));
    await act(async () => result.current[1](true));
    expect(mockSet).not.toHaveBeenCalled();
  });
});
