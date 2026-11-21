import { afterEach, describe, expect, it, vi } from 'vitest';
import { removeAccount, setAccountRole, type Account } from './api';

// SPEC-household-manage-adults §7/§8 — the client half: setAccountRole and
// removeAccount. A 409 carries a JSON code, "self" or "last_admin", which the
// confirm turns into its line (UX §3.4).

function mockFetch(body: unknown, status: number) {
  const fn = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(body === null ? null : typeof body === 'string' ? body : JSON.stringify(body), { status }),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const JO: Account = { id: 'u/jo', name: 'Jo', role: 'admin', lastSeenAt: null, email: 'jo@example.com', avatarColor: '' };

describe('setAccountRole', () => {
  it('PATCHes {role} to the encoded account path and returns the row', async () => {
    const fn = mockFetch(JO, 200);
    const r = await setAccountRole('u/jo', 'admin');
    expect(r).toEqual({ ok: true, status: 200, account: JO });
    const [url, init] = fn.mock.calls[0];
    expect(url).toBe('/api/admin/accounts/u%2Fjo');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(String(init?.body))).toEqual({ role: 'admin' });
    expect(init?.credentials).toBe('include');
  });

  it.each([
    ['self', 'self'],
    ['last_admin', 'last_admin'],
  ] as const)('a 409 {"error":"%s"} reads as code %s', async (wire, code) => {
    mockFetch({ error: wire }, 409);
    const r = await setAccountRole('u-jo', 'user');
    expect(r.ok).toBe(false);
    expect(r.status).toBe(409);
    expect(r.code).toBe(code);
    expect(r.account).toBeUndefined();
  });

  it('a 409 that is not one of the codes has no code', async () => {
    mockFetch('conflict', 409);
    expect((await setAccountRole('u-jo', 'user')).code).toBeUndefined();
    mockFetch({ error: 'something_else' }, 409);
    expect((await setAccountRole('u-jo', 'user')).code).toBeUndefined();
  });

  it('a 404, a 401 and a network failure come back as their status', async () => {
    mockFetch('no such adult account', 404);
    expect(await setAccountRole('u-jo', 'user')).toMatchObject({ ok: false, status: 404 });
    mockFetch('unauthorized', 401);
    expect(await setAccountRole('u-jo', 'user')).toMatchObject({ ok: false, status: 401 });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    expect(await setAccountRole('u-jo', 'user')).toMatchObject({ ok: false, status: 0 });
  });
});

describe('removeAccount', () => {
  it('DELETEs the encoded account path; 204 is ok', async () => {
    const fn = mockFetch(null, 204);
    expect(await removeAccount('u/alex')).toEqual({ ok: true, status: 204 });
    const [url, init] = fn.mock.calls[0];
    expect(url).toBe('/api/admin/accounts/u%2Falex');
    expect(init?.method).toBe('DELETE');
  });

  it('a 409 carries its code', async () => {
    mockFetch({ error: 'last_admin' }, 409);
    expect(await removeAccount('u-alex')).toMatchObject({ ok: false, status: 409, code: 'last_admin' });
    mockFetch({ error: 'self' }, 409);
    expect(await removeAccount('u-alex')).toMatchObject({ ok: false, status: 409, code: 'self' });
  });

  it('a 404 is not ok and has no code', async () => {
    mockFetch('no such adult account', 404);
    const r = await removeAccount('u-alex');
    expect(r).toMatchObject({ ok: false, status: 404 });
    expect(r.code).toBeUndefined();
  });
});
