// SPEC-status-widgets §7.3 — the admin widget calls. They live in their own
// module, imported only by the lazy editor chunks (AC-033), and a key is only
// ever SENT (write-only, AC-003): no read type has a field that could hold one.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deleteWidget,
  geocode,
  getWidget,
  putWidget,
  saveWidgetSettings,
  testWidget,
  widgetKinds,
  type WidgetInput,
} from './widgetAdminApi';

afterEach(() => vi.unstubAllGlobals());

function stub(status: number, body?: unknown) {
  const fn = vi.fn(async (_url: string, _init?: RequestInit) =>
    new Response(body === undefined ? null : JSON.stringify(body), { status }),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

const INPUT: WidgetInput = {
  kind: 'jellyfin',
  address: 'http://jellyfin.home.arpa:8096',
  secret: 'k-123',
  fields: ['playing', 'movies'],
  intervalS: 60,
  insecureTls: false,
  enabled: true,
};

const CONFIG = {
  kind: 'jellyfin',
  address: 'http://jellyfin.home.arpa:8096',
  username: '',
  hasSecret: true,
  fields: ['playing', 'movies'],
  intervalS: 60,
  insecureTls: false,
  enabled: true,
  state: 'ok',
  error: '',
  lastOkAt: null,
  lastCheckAt: null,
};

describe('widgetKinds', () => {
  it('returns the registry', async () => {
    const body = { secretKeySet: true, kinds: [] };
    const fn = stub(200, body);
    expect(await widgetKinds()).toEqual(body);
    expect(fn.mock.calls[0][0]).toBe('/api/admin/widgets/kinds');
  });
  it('null on failure or a body without kinds', async () => {
    stub(403);
    expect(await widgetKinds()).toBeNull();
    stub(200, { secretKeySet: true });
    expect(await widgetKinds()).toBeNull();
  });
});

describe('getWidget', () => {
  it('the config on 200', async () => {
    const fn = stub(200, CONFIG);
    expect(await getWidget('svc 1')).toEqual({ status: 'ok', config: CONFIG });
    expect(fn.mock.calls[0][0]).toBe('/api/services/svc%201/widget');
  });
  it('none on 404', async () => {
    stub(404);
    expect(await getWidget('s')).toEqual({ status: 'none' });
  });
  it('error otherwise', async () => {
    stub(500);
    expect(await getWidget('s')).toEqual({ status: 'error' });
  });
});

describe('putWidget', () => {
  it('PUTs the body and returns the saved config', async () => {
    const fn = stub(200, CONFIG);
    expect(await putWidget('s', INPUT)).toEqual({ ok: true, config: CONFIG });
    const init = fn.mock.calls[0][1]!;
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual(INPUT);
  });
  it('422 carries the field and the message', async () => {
    stub(422, { field: 'address', message: 'Use an http or https address.' });
    expect(await putWidget('s', INPUT)).toEqual({
      ok: false,
      status: 422,
      field: 'address',
      message: 'Use an http or https address.',
    });
  });
  it('any other failure is a plain failure', async () => {
    stub(500);
    expect(await putWidget('s', INPUT)).toEqual({ ok: false, status: 500 });
  });
});

describe('deleteWidget', () => {
  it('true on 204', async () => {
    const fn = stub(204);
    expect(await deleteWidget('s')).toBe(true);
    expect(fn.mock.calls[0][1]!.method).toBe('DELETE');
  });
  it('false otherwise', async () => {
    stub(500);
    expect(await deleteWidget('s')).toBe(false);
  });
});

describe('testWidget', () => {
  it('ok with the version and the values', async () => {
    stub(200, { ok: true, version: '10.10.3', fields: [] });
    expect(await testWidget('s', INPUT)).toEqual({ ok: true, version: '10.10.3', fields: [] });
  });
  it('a failed test is a 200 with a code', async () => {
    stub(200, { ok: false, error: 'auth' });
    expect(await testWidget('s', INPUT)).toEqual({ ok: false, error: 'auth' });
  });
  it('429 is the rate limit', async () => {
    stub(429);
    expect(await testWidget('s', INPUT)).toEqual({ ok: false, error: 'rate_limited' });
  });
  it('422 carries the message', async () => {
    stub(422, { field: 'fields', message: 'Pick up to 3.' });
    expect(await testWidget('s', INPUT)).toEqual({ ok: false, error: 'invalid', message: 'Pick up to 3.' });
  });
  it('anything else is a request failure', async () => {
    stub(500);
    expect(await testWidget('s', INPUT)).toEqual({ ok: false, error: 'request_failed' });
  });
});

describe('geocode', () => {
  it('encodes the query and returns the places', async () => {
    const places = [{ name: 'Rotterdam', region: 'South Holland', country: 'Netherlands', lat: 51.92, lon: 4.48 }];
    const fn = stub(200, places);
    expect(await geocode('Rotter dam')).toEqual(places);
    expect(fn.mock.calls[0][0]).toBe('/api/admin/geocode?q=Rotter%20dam');
  });
  it('unreachable when the server can’t reach the weather service', async () => {
    stub(502, { error: 'unreachable' });
    expect(await geocode('Rotterdam')).toBe('unreachable');
  });
  it('unreachable on a body that is not a list', async () => {
    stub(200, {});
    expect(await geocode('Rotterdam')).toBe('unreachable');
  });
});

describe('saveWidgetSettings', () => {
  it('PATCHes /api/admin/settings and returns the widgets block', async () => {
    const widgets = { clockEnabled: true };
    const fn = stub(200, { showUptimeDisplay: true, statusDegradedMs: 1000, widgets });
    expect(await saveWidgetSettings({ clockEnabled: true })).toEqual(widgets);
    expect(fn.mock.calls[0][0]).toBe('/api/admin/settings');
    expect(fn.mock.calls[0][1]!.method).toBe('PATCH');
  });
  it('null on failure, or when the backend has no widgets block', async () => {
    stub(422, { field: 'weatherEnabled', message: 'Choose a place first.' });
    expect(await saveWidgetSettings({ weatherEnabled: true })).toBeNull();
    stub(200, { showUptimeDisplay: true });
    expect(await saveWidgetSettings({ clockEnabled: true })).toBeNull();
  });
});
