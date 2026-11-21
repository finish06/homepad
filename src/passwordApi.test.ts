import { afterEach, describe, expect, it, vi } from 'vitest';
import { acceptReset, changePassword, createResetLink, lookupReset } from './passwordApi';

// SPEC-password-reset-link §7/§8 — the client half: make a reset link, look it
// up, use it, and change your own password. The token travels only in POST
// bodies, never a path or a query string.

function mockFetch(body: unknown, status: number, headers?: Record<string, string>) {
  const fn = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(body === null ? null : typeof body === 'string' ? body : JSON.stringify(body), { status, headers }),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

function networkDown() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const LINK = { id: 'r1', expiresAt: '2026-11-21T21:40:00Z', token: 'tok-secret' };

describe('createResetLink (AC-001)', () => {
  it('POSTs to the account and returns the link once', async () => {
    const fetch = mockFetch(LINK, 201);
    await expect(createResetLink('u/1')).resolves.toEqual({ ok: true, status: 201, link: LINK });
    const [path, init] = fetch.mock.calls[0];
    expect(path).toBe('/api/admin/accounts/u%2F1/reset-link');
    expect(init?.method).toBe('POST');
    expect(init?.credentials).toBe('include');
  });

  it('passes the 409 code on', async () => {
    mockFetch({ error: 'sso_account' }, 409);
    const r = await createResetLink('u1');
    expect(r.ok).toBe(false);
    expect(r.status).toBe(409);
    expect(r.error).toContain('sso_account');
  });
});

describe('lookupReset (AC-006)', () => {
  it('sends the token in the body and reads {email, name, expiresAt}', async () => {
    const info = { email: 'jo@example.com', name: 'Jo', expiresAt: LINK.expiresAt };
    const fetch = mockFetch(info, 200);
    await expect(lookupReset('tok-secret')).resolves.toEqual({ ok: true, status: 200, info });
    const [path, init] = fetch.mock.calls[0];
    expect(path).toBe('/api/password-resets/lookup');
    expect(String(path)).not.toContain('tok-secret');
    expect(JSON.parse(String(init?.body))).toEqual({ token: 'tok-secret' });
  });

  it('a dead link is a 404', async () => {
    mockFetch('reset link not found', 404);
    await expect(lookupReset('dead')).resolves.toMatchObject({ ok: false, status: 404 });
  });
});

describe('acceptReset (AC-007)', () => {
  it('sends {token, password} and returns the signed-in user', async () => {
    const user = { id: 'u1', email: 'jo@example.com', role: 'user', themePref: 'system', hasPassword: true };
    const fetch = mockFetch(user, 200);
    await expect(acceptReset('tok-secret', 'new password')).resolves.toEqual({ ok: true, status: 200, user });
    const [path, init] = fetch.mock.calls[0];
    expect(path).toBe('/api/password-resets/accept');
    expect(JSON.parse(String(init?.body))).toEqual({ token: 'tok-secret', password: 'new password' });
  });
});

describe('changePassword (AC-013, AC-014)', () => {
  it('204 is ok', async () => {
    const fetch = mockFetch(null, 204);
    await expect(changePassword('old one', 'new one!')).resolves.toEqual({ ok: true, status: 204 });
    const [path, init] = fetch.mock.calls[0];
    expect(path).toBe('/api/me/password');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ currentPassword: 'old one', newPassword: 'new one!' });
  });

  it('a 403 carries the wrong_password code', async () => {
    mockFetch({ error: 'wrong_password' }, 403);
    const r = await changePassword('nope', 'new one!');
    expect(r).toMatchObject({ ok: false, status: 403 });
    expect(r.error).toContain('wrong_password');
  });

  it('a 429 carries Retry-After in seconds', async () => {
    mockFetch('too many wrong passwords', 429, { 'Retry-After': '900' });
    await expect(changePassword('a', 'b')).resolves.toMatchObject({ ok: false, status: 429, retryAfter: 900 });
  });

  it('a 429 without a usable Retry-After has none', async () => {
    mockFetch('too many', 429, { 'Retry-After': 'soon' });
    const r = await changePassword('a', 'b');
    expect(r.status).toBe(429);
    expect(r.retryAfter).toBeUndefined();
  });

  it('a network failure is status 0', async () => {
    networkDown();
    await expect(changePassword('a', 'b')).resolves.toMatchObject({ ok: false, status: 0 });
  });
});
