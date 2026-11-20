// SPEC-status-widgets §7.3 — GET /api/widgets/info. Any failure, or a body that
// isn't the documented shape (an older backend's SPA fallback), reads as "all
// off": the strip never shows an error, and ⌘K never offers a broken row.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { call, fetchWidgetsInfo, saveShowWidgets } from './widgetsInfo';

afterEach(() => vi.unstubAllGlobals());

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

describe('saveShowWidgets', () => {
  it('true only on 200', async () => {
    stub(async () => new Response('{}', { status: 200 }));
    expect(await saveShowWidgets(false)).toBe(true);
    stub(async () => new Response('', { status: 403 }));
    expect(await saveShowWidgets(false)).toBe(false);
  });
});
