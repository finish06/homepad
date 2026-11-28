// SPEC-health-widget AC-016, AC-017 — the person's hidden widgets: the
// account wins, localStorage is a user-matched first-paint cache seeded once
// from the two old keys, and a failed save rolls back. Replaces
// healthBarPref.test.ts and showWidgetsPref.test.ts.
import { StrictMode, createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('./widgetsInfo', () => ({ saveHiddenWidgets: vi.fn() }));
import { saveHiddenWidgets } from './widgetsInfo';
import { CACHE_KEY, loadCached, useHiddenWidgetsPref, type HiddenWidgetsAccount } from './hiddenWidgetsPref';

const mockSave = vi.mocked(saveHiddenWidgets);
const cached = () => JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
const member = (extra: Partial<HiddenWidgetsAccount> = {}): HiddenWidgetsAccount => ({ id: 'u1', role: 'member', ...extra });

beforeEach(() => {
  localStorage.clear();
  mockSave.mockReset();
  mockSave.mockResolvedValue(true);
});
afterEach(() => localStorage.clear());

describe('first paint (AC-016)', () => {
  it('the account list wins over any cache, and is cached for next time', () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ v: 1, user: 'u1', hidden: ['clock'] }));
    const { result } = renderHook(() => useHiddenWidgetsPref(member({ hiddenWidgets: ['tiles', 'weather'] })));
    expect(result.current[0]).toEqual(['weather', 'tiles']);
    expect(cached()).toEqual({ v: 1, user: 'u1', hidden: ['weather', 'tiles'] });
  });

  it('uses the cache only when its user matches', () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ v: 1, user: 'u1', hidden: ['clock'] }));
    expect(loadCached('u1', 'member')).toEqual(['clock']);
    expect(loadCached('someone-else', 'member')).toEqual([]);
    // A kid defaults to no health.
    expect(loadCached('someone-else', 'kid')).toEqual(['health']);
  });

  it('with no account list, the cache paints first', () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ v: 1, user: 'u1', hidden: ['health'] }));
    const { result } = renderHook(() => useHiddenWidgetsPref(member()));
    expect(result.current[0]).toEqual(['health']);
  });

  it('an older API: the old fields map the way the migration does', () => {
    const { result } = renderHook(() => useHiddenWidgetsPref(member({ showHealthBar: false, showWidgets: false })));
    expect(result.current[0]).toEqual(['clock', 'weather', 'healthDetails', 'tiles']);
    const kid = renderHook(() =>
      useHiddenWidgetsPref({ id: 'k1', role: 'kid', showHealthBar: true, showWidgets: false }),
    );
    // A kid's showWidgets was never read.
    expect(kid.result.current[0]).toEqual([]);
  });

  it('with no new cache, seeds from the old keys, then removes them', () => {
    localStorage.setItem('homepad:show-health-bar', 'false');
    localStorage.setItem('homepad:show-widgets', 'false');
    expect(loadCached('u1', 'member')).toEqual(['clock', 'weather', 'healthDetails', 'tiles']);

    const { result } = renderHook(() => useHiddenWidgetsPref(member({ hiddenWidgets: [] })));
    expect(result.current[0]).toEqual([]);
    expect(localStorage.getItem('homepad:show-health-bar')).toBeNull();
    expect(localStorage.getItem('homepad:show-widgets')).toBeNull();
  });

  it("a kid never seeds from the old per-device keys (they may be an adult's)", () => {
    localStorage.setItem('homepad:show-health-bar', 'true');
    expect(loadCached('k1', 'kid')).toEqual(['health']);
  });

  it('a malformed cache falls back to the defaults', () => {
    localStorage.setItem(CACHE_KEY, '{nope');
    expect(loadCached('u1', 'member')).toEqual([]);
    localStorage.setItem(CACHE_KEY, JSON.stringify({ v: 2, user: 'u1', hidden: ['clock'] }));
    expect(loadCached('u1', 'member')).toEqual([]);
  });

  it('a storage throw falls back to the defaults without error', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('private mode');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => loadCached('u1', 'member')).not.toThrow();
    expect(loadCached('u1', 'member')).toEqual([]);
    expect(loadCached('k1', 'kid')).toEqual(['health']);
    const { result } = renderHook(() => useHiddenWidgetsPref(member()));
    expect(result.current[0]).toEqual([]);
    act(() => result.current[1](['clock']));
    expect(result.current[0]).toEqual(['clock']);
    get.mockRestore();
    set.mockRestore();
  });

  it('adopts a new account value when /api/me changes', () => {
    const { result, rerender } = renderHook((p: HiddenWidgetsAccount) => useHiddenWidgetsPref(p), {
      initialProps: member({ hiddenWidgets: [] }),
    });
    rerender(member({ hiddenWidgets: ['health'] }));
    expect(result.current[0]).toEqual(['health']);
  });
});

describe('saving (AC-017)', () => {
  it('moves at once and saves the whole list', async () => {
    const { result } = renderHook(() => useHiddenWidgetsPref(member({ hiddenWidgets: ['clock'] })));
    act(() => result.current[1](['tiles', 'clock']));
    expect(result.current[0]).toEqual(['clock', 'tiles']);
    expect(cached().hidden).toEqual(['clock', 'tiles']);
    await waitFor(() => expect(mockSave).toHaveBeenCalledWith(['clock', 'tiles']));
  });

  it('rolls the state and the cache back on false', async () => {
    mockSave.mockResolvedValue(false);
    const { result } = renderHook(() => useHiddenWidgetsPref(member({ hiddenWidgets: ['clock'] })));
    act(() => result.current[1]([]));
    expect(result.current[0]).toEqual([]);
    await waitFor(() => expect(result.current[0]).toEqual(['clock']));
    expect(cached().hidden).toEqual(['clock']);
  });

  it('rolls back on a throw', async () => {
    mockSave.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useHiddenWidgetsPref(member({ hiddenWidgets: [] })));
    act(() => result.current[1](['health']));
    await waitFor(() => expect(result.current[0]).toEqual([]));
    expect(cached().hidden).toEqual([]);
  });

  it('saves go out one after another, in the order they were made', async () => {
    let answerFirst: (ok: boolean) => void = () => {};
    mockSave
      .mockImplementationOnce(() => new Promise<boolean>((r) => (answerFirst = r)))
      .mockResolvedValueOnce(true);
    const { result } = renderHook(() => useHiddenWidgetsPref(member({ hiddenWidgets: [] })));
    act(() => result.current[1](['clock']));
    act(() => result.current[1](['clock', 'weather']));
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    // The second waits for the first, so the server can't apply them out of order.
    await act(async () => answerFirst(false));
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(2));
    expect(mockSave).toHaveBeenLastCalledWith(['clock', 'weather']);
    // An older save failing while a newer one is still to come changes nothing.
    expect(result.current[0]).toEqual(['clock', 'weather']);
    expect(cached().hidden).toEqual(['clock', 'weather']);
  });

  it('when the newest save fails after an older one landed, the screen shows the older one', async () => {
    mockSave.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const { result } = renderHook(() => useHiddenWidgetsPref(member({ hiddenWidgets: [] })));
    act(() => result.current[1](['clock']));
    act(() => result.current[1](['clock', 'weather']));
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current[0]).toEqual(['clock']));
    expect(cached().hidden).toEqual(['clock']);
  });

  it('a failed save goes back to what the server last stored, not to the screen before', async () => {
    const { result } = renderHook(() => useHiddenWidgetsPref(member({ hiddenWidgets: [] })));
    act(() => result.current[1](['clock']));
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    mockSave.mockResolvedValueOnce(false);
    act(() => result.current[1](['clock', 'tiles']));
    await waitFor(() => expect(result.current[0]).toEqual(['clock']));
  });

  it('the same list sends nothing', () => {
    const { result } = renderHook(() => useHiddenWidgetsPref(member({ hiddenWidgets: ['weather'] })));
    act(() => result.current[1](['weather']));
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('sends one PATCH per change under StrictMode', async () => {
    const wrapper = ({ children }: { children: ReactNode }) => createElement(StrictMode, null, children);
    const { result } = renderHook(() => useHiddenWidgetsPref(member({ hiddenWidgets: [] })), { wrapper });
    act(() => result.current[1](['clock']));
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
  });
});
