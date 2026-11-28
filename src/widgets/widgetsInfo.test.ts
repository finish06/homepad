// SPEC-status-widgets §7.3 — GET /api/widgets/info. Any failure, or a body that
// isn't the documented shape (an older backend's SPA fallback), reads as "all
// off": the strip never shows an error, and ⌘K never offers a broken row.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { call, fetchWidgetsInfo, saveHiddenWidgets } from './widgetsInfo';
import { DEFAULT_HOUSEHOLD, HOUSEHOLD_KEY, loadHousehold, useWidgetsInfo } from './useWidgetsInfo';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const stub = (impl: () => Promise<Response>) => {
  const fn = vi.fn(impl);
  vi.stubGlobal('fetch', fn);
  return fn;
};

const GOOD = {
  clock: { enabled: true, hour12: null },
  weather: { enabled: false, state: 'loading', asOf: null, place: '', units: 'c' },
  search: { enabled: true, name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q={query}' },
};

describe('fetchWidgetsInfo', () => {
  it('returns the info on 200, sent with the session cookie', async () => {
    const fn = stub(async () => new Response(JSON.stringify(GOOD), { status: 200 }));
    expect(await fetchWidgetsInfo()).toEqual(GOOD);
    expect(fn).toHaveBeenCalledWith('/api/widgets/info', { method: 'GET', credentials: 'include' });
  });

  it('null on 401', async () => {
    stub(async () => new Response('unauthorized', { status: 401 }));
    expect(await fetchWidgetsInfo()).toBeNull();
  });

  it('null on a body without the three blocks', async () => {
    stub(async () => new Response('{"clock":{}}', { status: 200 }));
    expect(await fetchWidgetsInfo()).toBeNull();
  });

  it('null on an HTML fallback page', async () => {
    stub(async () => new Response('<!doctype html>', { status: 200 }));
    expect(await fetchWidgetsInfo()).toBeNull();
  });

  it('null on a network failure', async () => {
    stub(async () => Promise.reject(new TypeError('offline')));
    expect(await fetchWidgetsInfo()).toBeNull();
  });
});

describe('call', () => {
  it('sends a JSON body with its content type', async () => {
    const fn = stub(async () => new Response('{"ok":true}', { status: 200 }));
    expect(await call('/x', 'PUT', { a: 1 })).toEqual({ status: 200, data: { ok: true } });
    expect(fn).toHaveBeenCalledWith('/x', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: '{"a":1}',
    });
  });

  it('a 204 has no data', async () => {
    stub(async () => new Response(null, { status: 204 }));
    expect(await call('/x', 'DELETE')).toEqual({ status: 204, data: null });
  });
});

describe('saveHiddenWidgets', () => {
  it('PATCHes the whole list; true only on 200', async () => {
    const fn = stub(async () => new Response('{}', { status: 200 }));
    expect(await saveHiddenWidgets(['clock', 'tiles'])).toBe(true);
    expect(fn).toHaveBeenCalledWith('/api/me', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: '{"hiddenWidgets":["clock","tiles"]}',
    });
    stub(async () => new Response('', { status: 400 }));
    expect(await saveHiddenWidgets([])).toBe(false);
  });
});

// SPEC-health-widget AC-018 — the household cache, and health never hidden
// by a read that failed.
describe('useWidgetsInfo household', () => {
  const cache = (v: unknown) => localStorage.setItem(HOUSEHOLD_KEY, JSON.stringify(v));

  it('with no cache: clock off, weather off, health on', () => {
    expect(DEFAULT_HOUSEHOLD).toEqual({ clock: false, weather: false, health: true });
    expect(loadHousehold()).toEqual(DEFAULT_HOUSEHOLD);
  });

  it('starts from the cache, before the read answers', () => {
    cache({ v: 1, clock: true, weather: true, health: false });
    stub(() => new Promise<Response>(() => {}));
    const { result } = renderHook(() => useWidgetsInfo());
    expect(result.current[0]).toBeNull();
    expect(result.current[2]).toEqual({ clock: true, weather: true, health: false });
  });

  it('writes the cache after a good read', async () => {
    stub(async () => new Response(JSON.stringify({ ...GOOD, health: { enabled: false } }), { status: 200 }));
    const { result } = renderHook(() => useWidgetsInfo());
    await waitFor(() => expect(result.current[2]).toEqual({ clock: true, weather: false, health: false }));
    expect(JSON.parse(localStorage.getItem(HOUSEHOLD_KEY)!)).toEqual({ v: 1, clock: true, weather: false, health: false });
  });

  it('info with no health key (an older API) counts as health on', async () => {
    cache({ v: 1, clock: false, weather: false, health: false });
    stub(async () => new Response(JSON.stringify(GOOD), { status: 200 }));
    const { result } = renderHook(() => useWidgetsInfo());
    await waitFor(() => expect(result.current[0]).not.toBeNull());
    expect(result.current[2].health).toBe(true);
  });

  it.each([
    ['a 500', async () => new Response('', { status: 500 })],
    ['a malformed body', async () => new Response('{"health":{"enabled":false}}', { status: 200 })],
    ['a network failure', async () => Promise.reject(new TypeError('offline'))],
  ])('%s never hides health and keeps the cached flags', async (_name, impl) => {
    cache({ v: 1, clock: true, weather: false, health: true });
    const fn = stub(impl as () => Promise<Response>);
    const { result } = renderHook(() => useWidgetsInfo());
    await waitFor(() => expect(fn).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current[2]).toEqual({ clock: true, weather: false, health: true });
  });

  it('a malformed or old-version cache, or a storage throw, falls back to the defaults', () => {
    localStorage.setItem(HOUSEHOLD_KEY, '{nope');
    expect(loadHousehold()).toEqual(DEFAULT_HOUSEHOLD);
    cache({ v: 2, clock: true, weather: true, health: false });
    expect(loadHousehold()).toEqual(DEFAULT_HOUSEHOLD);
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('private mode');
    });
    expect(loadHousehold()).toEqual(DEFAULT_HOUSEHOLD);
    spy.mockRestore();
  });

  it('only a cached false hides health', () => {
    cache({ v: 1, clock: true, weather: true });
    expect(loadHousehold().health).toBe(true);
  });
});
