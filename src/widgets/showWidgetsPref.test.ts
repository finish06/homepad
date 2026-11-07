// SPEC-status-widgets AC-031 — "Show widgets" is a per-user switch, on by
// default, stored on the account (PATCH /api/me showWidgets). Same contract as
// the health-bar switch: the server value wins, localStorage is only the
// first-paint cache, and a failed write rolls back.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { loadShowWidgetsPref, useShowWidgetsPref } from './showWidgetsPref';

const KEY = 'homepad:show-widgets';

function mockFetch(status: number) {
  const fn = vi.fn(async () => new Response('{}', { status }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('loadShowWidgetsPref', () => {
  it('defaults to on', () => {
    expect(loadShowWidgetsPref()).toBe(true);
  });
  it('reads the cached choice', () => {
    localStorage.setItem(KEY, 'false');
    expect(loadShowWidgetsPref()).toBe(false);
  });
  it('ignores junk', () => {
    localStorage.setItem(KEY, 'maybe');
    expect(loadShowWidgetsPref()).toBe(true);
  });
  it('survives a storage that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('private mode');
    });
    expect(loadShowWidgetsPref()).toBe(true);
  });
});

describe('useShowWidgetsPref', () => {
  it('the server value wins over the cache, and is cached', () => {
    localStorage.setItem(KEY, 'true');
    const { result } = renderHook(() => useShowWidgetsPref(false));
    expect(result.current[0]).toBe(false);
    expect(localStorage.getItem(KEY)).toBe('false');
  });

  it('without a server value, the cache seeds it', () => {
    localStorage.setItem(KEY, 'false');
    const { result } = renderHook(() => useShowWidgetsPref(undefined));
    expect(result.current[0]).toBe(false);
  });

  it('a change is optimistic and PATCHes /api/me', async () => {
    const fetchFn = mockFetch(200);
    const { result } = renderHook(() => useShowWidgetsPref(true));
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/me');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ showWidgets: false });
    expect(localStorage.getItem(KEY)).toBe('false');
  });

  it('a failed write rolls back', async () => {
    mockFetch(400);
    const { result } = renderHook(() => useShowWidgetsPref(true));
    act(() => result.current[1](false));
    await waitFor(() => expect(result.current[0]).toBe(true));
    expect(localStorage.getItem(KEY)).toBe('true');
  });

  it('a network error rolls back', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))));
    const { result } = renderHook(() => useShowWidgetsPref(true));
    act(() => result.current[1](false));
    await waitFor(() => expect(result.current[0]).toBe(true));
  });

  it('setting the same value sends nothing', () => {
    const fetchFn = mockFetch(200);
    const { result } = renderHook(() => useShowWidgetsPref(true));
    act(() => result.current[1](true));
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
