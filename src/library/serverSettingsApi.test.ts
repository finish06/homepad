import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  adminServerSettings,
  oidcTestStatus,
  resetServerSetting,
  saveServerSettings,
  startOidcTest,
  type ServerSettings,
} from './serverSettingsApi';

// SPEC-admin-server-settings §7 / §8 — the web client for the server-settings
// routes. Lives in the lazy SettingsPanel chunk, not src/api.ts, so the entry
// chunk does not grow (AC-037).

const BODY: ServerSettings = {
  envOnly: false,
  settings: [
    {
      key: 'GATUS_BASE_URL',
      group: 'status',
      value: 'https://status.example.com',
      source: 'ui',
      envValue: 'http://gatus.example.com:8080',
      defaultValue: '',
      editable: true,
      applies: 'live',
      updatedAt: '2026-11-23T18:04:00Z',
      updatedBy: { id: 'u1', name: 'Caleb' },
    },
  ],
};

function respond(status: number, body: unknown, asText = false) {
  const fn = vi.fn().mockResolvedValue(
    new Response(asText ? String(body) : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': asText ? 'text/plain' : 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('adminServerSettings (AC-007, AC-036)', () => {
  it('GETs /api/admin/server-settings and returns the body', async () => {
    const fn = respond(200, BODY);
    await expect(adminServerSettings()).resolves.toEqual(BODY);
    expect(fn).toHaveBeenCalledWith('/api/admin/server-settings', { credentials: 'include' });
  });

  it('never calls the old env-config route (AC-036, Q3 A)', async () => {
    const fn = respond(200, BODY);
    await adminServerSettings();
    for (const call of fn.mock.calls) expect(String(call[0])).not.toContain('env-config');
  });

  it('rejects on a non-200, a network error, or a body without a settings list', async () => {
    respond(403, 'forbidden', true);
    await expect(adminServerSettings()).rejects.toThrow();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await expect(adminServerSettings()).rejects.toThrow();
    respond(200, { envOnly: false });
    await expect(adminServerSettings()).rejects.toThrow();
  });

  it('reads envOnly as false unless it is true', async () => {
    respond(200, { settings: [] });
    await expect(adminServerSettings()).resolves.toEqual({ envOnly: false, settings: [] });
  });
});

describe('saveServerSettings (AC-008)', () => {
  it('PATCHes {set} and returns the full GET body', async () => {
    const fn = respond(200, BODY);
    const r = await saveServerSettings({ GATUS_BASE_URL: 'https://status.example.com' });
    expect(r).toEqual({ ok: true, body: BODY });
    const [path, init] = fn.mock.calls[0];
    expect(path).toBe('/api/admin/server-settings');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ set: { GATUS_BASE_URL: 'https://status.example.com' } });
  });

  it('sends confirm codes and the oidcTest token when given', async () => {
    const fn = respond(200, BODY);
    await saveServerSettings({ COOKIE_SECURE: true }, { confirm: ['cookie_secure_on'], oidcTest: 'tok' });
    expect(JSON.parse(fn.mock.calls[0][1].body)).toEqual({
      set: { COOKIE_SECURE: true },
      confirm: ['cookie_secure_on'],
      oidcTest: 'tok',
    });
  });

  it('reads a 409 confirm_required with its warnings (objects or bare codes)', async () => {
    respond(409, {
      error: 'confirm_required',
      warnings: [{ code: 'trusted_proxies', message: 'Homepad sees you as 192.0.2.10 now.' }, 'registration_open'],
    });
    const r = await saveServerSettings({ HOMEPAD_TRUSTED_PROXIES: 'web' });
    expect(r).toEqual({
      ok: false,
      failure: {
        status: 409,
        error: 'confirm_required',
        warnings: [
          { code: 'trusted_proxies', message: 'Homepad sees you as 192.0.2.10 now.' },
          { code: 'registration_open' },
        ],
      },
    });
  });

  it('reads a 400 invalid with its key and plain message', async () => {
    respond(400, { error: 'invalid', key: 'HOMEPAD_MAX_ACCOUNTS', message: 'Enter a whole number from 0 to 10000.' });
    const r = await saveServerSettings({ HOMEPAD_MAX_ACCOUNTS: -3 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failure).toMatchObject({ status: 400, error: 'invalid', key: 'HOMEPAD_MAX_ACCOUNTS' });
      expect(r.failure.message).toBe('Enter a whole number from 0 to 10000.');
    }
  });

  it('a plain-text error and a network failure still come back as failures', async () => {
    respond(500, 'boom', true);
    const r = await saveServerSettings({ GATUS_BASE_URL: '' });
    expect(r).toEqual({ ok: false, failure: { status: 500, error: 'unknown', warnings: [] } });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    const n = await saveServerSettings({ GATUS_BASE_URL: '' });
    expect(n).toEqual({ ok: false, failure: { status: 0, error: 'network', warnings: [] } });
  });

  it('a 200 that is not the GET body is a failure, not a crash', async () => {
    respond(200, { nope: true });
    const r = await saveServerSettings({ GATUS_BASE_URL: '' });
    expect(r.ok).toBe(false);
  });
});

describe('resetServerSetting (AC-009)', () => {
  it('DELETEs one key with no body', async () => {
    const fn = respond(200, BODY);
    const r = await resetServerSetting('GATUS_BASE_URL');
    expect(r).toEqual({ ok: true, body: BODY });
    const [path, init] = fn.mock.calls[0];
    expect(path).toBe('/api/admin/server-settings/GATUS_BASE_URL');
    expect(init.method).toBe('DELETE');
    expect(init.body).toBeUndefined();
  });

  it('sends confirm codes and the test token in the query string (0.2.1)', async () => {
    const fn = respond(200, BODY);
    await resetServerSetting('COOKIE_SECURE', { confirm: ['cookie_secure_on', 'x'], oidcTest: 'tok 1' });
    const [path, init] = fn.mock.calls[0];
    expect(path).toBe('/api/admin/server-settings/COOKIE_SECURE?confirm=cookie_secure_on%2Cx&oidcTest=tok+1');
    expect(init.body).toBeUndefined();
  });

  it('a body with save notes keeps them; extra warning fields and `missing` are read', async () => {
    respond(200, { ...BODY, warnings: [{ code: 'proxy_unresolved', message: 'Some names don\'t resolve.', hosts: ['web', 1] }] });
    const r = await resetServerSetting('HOMEPAD_TRUSTED_PROXIES');
    expect(r.ok && r.body.notes).toEqual([{ code: 'proxy_unresolved', message: "Some names don't resolve.", hosts: ['web'] }]);
    respond(409, {
      error: 'confirm_required',
      message: 'm',
      warnings: [{ code: 'max_accounts_below_count', message: 'm', accounts: 7, pendingInvites: 2, limit: 5 }, { code: 'trusted_proxies', currentAddress: 'a', newAddress: 'b' }, { nope: 1 }],
    });
    const c = await saveServerSettings({ HOMEPAD_MAX_ACCOUNTS: 5 });
    expect(!c.ok && c.failure.warnings).toEqual([
      { code: 'max_accounts_below_count', message: 'm', accounts: 7, pendingInvites: 2, limit: 5 },
      { code: 'trusted_proxies', currentAddress: 'a', newAddress: 'b' },
    ]);
    respond(400, { error: 'invalid', key: 'OIDC_ENABLED', message: 'm', missing: ['OIDC_CLIENT_ID', 3] });
    const m = await saveServerSettings({ OIDC_ENABLED: true });
    expect(!m.ok && m.failure.missing).toEqual(['OIDC_CLIENT_ID']);
  });

  it('reads a refusal', async () => {
    respond(409, { error: 'would_lock_out' });
    const r = await resetServerSetting('OIDC_ISSUER');
    expect(r).toEqual({ ok: false, failure: { status: 409, error: 'would_lock_out', warnings: [] } });
  });
});

describe('the test sign-in (AC-023)', () => {
  it('POSTs the staged values and returns the id and authorize URL', async () => {
    const fn = respond(200, { id: 't1', authorizeUrl: 'https://id.example.com/authorize?x=1' });
    const r = await startOidcTest({ OIDC_CLIENT_ID: 'homepad' });
    expect(r).toEqual({ ok: true, id: 't1', authorizeUrl: 'https://id.example.com/authorize?x=1' });
    const [path, init] = fn.mock.calls[0];
    expect(path).toBe('/api/admin/server-settings/oidc/test');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ set: { OIDC_CLIENT_ID: 'homepad' } });
  });

  it('a 422 discovery_failed is a failure with the message', async () => {
    respond(422, { error: 'discovery_failed', message: "Couldn't read the sign-in settings." });
    const r = await startOidcTest({ OIDC_ISSUER: 'https://id.example.com/wrong' });
    expect(r).toEqual({
      ok: false,
      failure: { status: 422, error: 'discovery_failed', message: "Couldn't read the sign-in settings.", warnings: [] },
    });
  });

  it('a 200 without an authorize URL is a failure', async () => {
    respond(200, { id: 't1' });
    expect((await startOidcTest({})).ok).toBe(false);
  });

  it('polls the status by id', async () => {
    const fn = respond(200, { state: 'passed', token: 'tok' });
    await expect(oidcTestStatus('t 1')).resolves.toEqual({ state: 'passed', token: 'tok' });
    expect(fn.mock.calls[0][0]).toBe('/api/admin/server-settings/oidc/test/t%201');
  });

  it('a failed test carries its message', async () => {
    respond(200, { state: 'failed', message: 'That account is not an admin.' });
    await expect(oidcTestStatus('t1')).resolves.toEqual({ state: 'failed', message: 'That account is not an admin.' });
  });

  it('a network blip reads as still pending; a 404 as failed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await expect(oidcTestStatus('t1')).resolves.toEqual({ state: 'pending' });
    respond(404, 'not found', true);
    await expect(oidcTestStatus('t1')).resolves.toEqual({ state: 'failed' });
  });

  it('an unknown state reads as pending', async () => {
    respond(200, { state: 'weird' });
    await expect(oidcTestStatus('t1')).resolves.toEqual({ state: 'pending' });
  });
});
