import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createKid,
  deleteKid,
  kidServices,
  kidSessions,
  listAccounts,
  revokeKidSession,
  setKidServices,
  signInHere,
  updateKid,
  type Account,
  type KidDevice,
  type User,
} from './api';

// SPEC-kid-accounts §7 (TASK-401) — the admin Accounts API client. The contract
// is homepad-api's internal/api/admin_accounts.go: bare JSON arrays for the
// lists, `{serviceIds}` for the allow-list (the key is required on PUT), 409 on
// a duplicate kid name, and 204 for the deletes, the replace and sign-in-here.

function mockFetch(body: unknown, status: number) {
  const fn = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(body === null ? null : typeof body === 'string' ? body : JSON.stringify(body), { status }),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

function networkDown() {
  const fn = vi.fn(async () => {
    throw new TypeError('Failed to fetch');
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const KID: Account = {
  id: 'k1',
  name: 'Maya',
  role: 'kid',
  lastSeenAt: null,
  avatarColor: 'teal',
  appCount: 0,
  deviceCount: 0,
};

describe('User type carries the kid role (TASK-401)', () => {
  it('accepts role "kid" with a displayName and avatarColor', () => {
    const u: User = {
      id: 'k1',
      email: '',
      role: 'kid',
      themePref: 'system',
      name: 'Maya',
      displayName: 'Maya',
      avatarColor: 'teal',
    };
    expect(u.role).toBe('kid');
  });
});

describe('listAccounts — GET /api/admin/accounts', () => {
  it('returns the bare JSON array the server sends', async () => {
    const rows: Account[] = [
      { id: 'a1', name: 'Caleb', role: 'admin', lastSeenAt: '2026-10-29T10:00:00Z', email: 'c@x.test', avatarColor: 'blue' },
      KID,
    ];
    const fetch = mockFetch(rows, 200);
    await expect(listAccounts()).resolves.toEqual(rows);
    expect(fetch.mock.calls[0][0]).toBe('/api/admin/accounts');
    expect(fetch.mock.calls[0][1]).toMatchObject({ credentials: 'include' });
  });

  it('rejects on a non-200 so the section can show its error state', async () => {
    mockFetch('forbidden', 403);
    await expect(listAccounts()).rejects.toThrow('forbidden');
  });

  it('rejects on a network failure', async () => {
    networkDown();
    await expect(listAccounts()).rejects.toThrow();
  });
});

describe('createKid — POST /api/admin/kids', () => {
  it('sends {name, avatarColor} and returns the created account on 201', async () => {
    const fetch = mockFetch(KID, 201);
    const r = await createKid('Maya', 'teal');
    expect(r).toMatchObject({ ok: true, status: 201, account: KID });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('/api/admin/kids');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ name: 'Maya', avatarColor: 'teal' });
  });

  it('surfaces a 409 duplicate name with its status, for the inline error', async () => {
    mockFetch('a kid with that name already exists', 409);
    const r = await createKid('maya', 'blue');
    expect(r.ok).toBe(false);
    expect(r.status).toBe(409);
    expect(r.account).toBeUndefined();
  });
});

describe('updateKid — PATCH /api/admin/kids/{id}', () => {
  it('sends only the changed fields, never a password', async () => {
    const fetch = mockFetch({ ...KID, name: 'Maya B' }, 200);
    const r = await updateKid('k1', { name: 'Maya B' });
    expect(r).toMatchObject({ ok: true, account: { name: 'Maya B' } });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('/api/admin/kids/k1');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(init?.body as string)).toEqual({ name: 'Maya B' });
  });

  it('reports a failure with the server text', async () => {
    mockFetch('a kid with that name already exists', 409);
    const r = await updateKid('k1', { name: 'Leo' });
    expect(r).toMatchObject({ ok: false, status: 409, error: 'a kid with that name already exists' });
  });
});

describe('deleteKid — DELETE /api/admin/kids/{id}', () => {
  it('is true on 204', async () => {
    const fetch = mockFetch(null, 204);
    await expect(deleteKid('k1')).resolves.toBe(true);
    expect(fetch.mock.calls[0][0]).toBe('/api/admin/kids/k1');
    expect(fetch.mock.calls[0][1]?.method).toBe('DELETE');
  });

  it('is false otherwise', async () => {
    mockFetch('no such kid account', 404);
    await expect(deleteKid('k1')).resolves.toBe(false);
  });
});

describe('kidServices / setKidServices — the allow-list', () => {
  it('reads {serviceIds} into a plain id list', async () => {
    const fetch = mockFetch({ serviceIds: ['s1', 's2'] }, 200);
    await expect(kidServices('k1')).resolves.toEqual(['s1', 's2']);
    expect(fetch.mock.calls[0][0]).toBe('/api/admin/kids/k1/services');
  });

  it('treats a null list as empty', async () => {
    mockFetch({ serviceIds: null }, 200);
    await expect(kidServices('k1')).resolves.toEqual([]);
  });

  it('rejects on a non-200', async () => {
    mockFetch('no such kid account', 404);
    await expect(kidServices('k1')).rejects.toThrow();
  });

  it('PUTs the whole set as {serviceIds}, true on 204', async () => {
    const fetch = mockFetch(null, 204);
    await expect(setKidServices('k1', ['s2', 's1'])).resolves.toBe(true);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('/api/admin/kids/k1/services');
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(init?.body as string)).toEqual({ serviceIds: ['s2', 's1'] });
  });

  it('sends the key even for an empty list (the server requires it; [] means none)', async () => {
    const fetch = mockFetch(null, 204);
    await setKidServices('k1', []);
    expect(JSON.parse(fetch.mock.calls[0][1]?.body as string)).toEqual({ serviceIds: [] });
  });

  it('is false on a 400', async () => {
    mockFetch('serviceIds names a service that is not in the catalog', 400);
    await expect(setKidServices('k1', ['nope'])).resolves.toBe(false);
  });
});

describe('kidSessions / revokeKidSession — devices', () => {
  it('returns the bare device array', async () => {
    const devices: KidDevice[] = [
      { id: 'h1', userAgent: 'Mozilla/5.0 (iPad)', createdAt: '2026-10-22T09:00:00Z', lastSeenAt: '2026-10-29T08:00:00Z' },
    ];
    const fetch = mockFetch(devices, 200);
    await expect(kidSessions('k1')).resolves.toEqual(devices);
    expect(fetch.mock.calls[0][0]).toBe('/api/admin/kids/k1/sessions');
  });

  it('rejects on a non-200', async () => {
    mockFetch('nope', 500);
    await expect(kidSessions('k1')).rejects.toThrow();
  });

  it('revokes one device by its opaque handle, true on 204', async () => {
    const fetch = mockFetch(null, 204);
    await expect(revokeKidSession('k1', 'h1')).resolves.toBe(true);
    expect(fetch.mock.calls[0][0]).toBe('/api/admin/kids/k1/sessions/h1');
    expect(fetch.mock.calls[0][1]?.method).toBe('DELETE');
  });

  it('encodes path segments', async () => {
    const fetch = mockFetch(null, 204);
    await revokeKidSession('k/1', 'h?1');
    expect(fetch.mock.calls[0][0]).toBe('/api/admin/kids/k%2F1/sessions/h%3F1');
  });
});

describe('signInHere — POST /api/admin/kids/{id}/sign-in-here', () => {
  it('is true on 204', async () => {
    const fetch = mockFetch(null, 204);
    await expect(signInHere('k1')).resolves.toBe(true);
    expect(fetch.mock.calls[0][0]).toBe('/api/admin/kids/k1/sign-in-here');
    expect(fetch.mock.calls[0][1]?.method).toBe('POST');
  });

  it('is false on a failure or a network error', async () => {
    mockFetch('internal error', 500);
    await expect(signInHere('k1')).resolves.toBe(false);
    networkDown();
    await expect(signInHere('k1')).resolves.toBe(false);
  });
});

// A 200 that is not the documented shape (an older backend's SPA fallback, a
// proxy page, a test catch-all answering `{}`) must reject into the caller's
// error state. Returned as-is, a non-array reached `.map` in the Accounts
// section and, with no error boundary, unmounted the whole Admin Panel.
describe('malformed 200 responses reject instead of crashing the caller', () => {
  it('listAccounts rejects a non-array body', async () => {
    mockFetch({}, 200);
    await expect(listAccounts()).rejects.toThrow('unexpected response');
  });

  it('kidSessions rejects a non-array body', async () => {
    mockFetch({ sessions: [] }, 200);
    await expect(kidSessions('k1')).rejects.toThrow('unexpected response');
  });

  it('kidServices rejects a body without serviceIds, so an editor never mistakes it for "no apps"', async () => {
    mockFetch({}, 200);
    await expect(kidServices('k1')).rejects.toThrow('unexpected response');
    mockFetch({ serviceIds: 'plex' }, 200);
    await expect(kidServices('k1')).rejects.toThrow('unexpected response');
  });
});
