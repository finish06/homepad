import { afterEach, describe, expect, it, vi } from 'vitest';
import { login, logout, me, register, services, setFavorite, setLayout } from './api';

// The client talks ONLY to the same-domain /api proxy — never to Gatus. These
// tests mock global fetch and assert both the URL and the response mapping.
// The URL assertions double as the web half of A11: every call stays under /api.

function mockFetch(body: BodyInit | null, status: number) {
  const fn = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    new Response(body, { status }),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('me', () => {
  it('returns the user on 200', async () => {
    const fn = mockFetch(JSON.stringify({ id: 'u1', email: 'a@b.c', role: 'user' }), 200);
    await expect(me()).resolves.toEqual({ id: 'u1', email: 'a@b.c', role: 'user' });
    expect(fn).toHaveBeenCalledWith('/api/me', { credentials: 'include' });
  });

  it('returns null when unauthenticated (401)', async () => {
    mockFetch(null, 401);
    await expect(me()).resolves.toBeNull();
  });
});

describe('login', () => {
  it('returns ok + user on 200', async () => {
    const fn = mockFetch(JSON.stringify({ id: 'u1', email: 'a@b.c', role: 'admin' }), 200);
    const r = await login('a@b.c', 'pw');
    expect(r).toEqual({ ok: true, status: 200, user: { id: 'u1', email: 'a@b.c', role: 'admin' } });
    const [url, opts] = fn.mock.calls[0];
    expect(url).toBe('/api/login');
    expect(opts).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(JSON.parse(opts!.body as string)).toEqual({ email: 'a@b.c', password: 'pw' });
  });

  it('returns the error body on failure', async () => {
    mockFetch('bad credentials', 401);
    await expect(login('a@b.c', 'pw')).resolves.toEqual({
      ok: false,
      status: 401,
      error: 'bad credentials',
    });
  });

  it('falls back to a generic error when the body is empty', async () => {
    mockFetch(null, 500);
    const r = await login('a@b.c', 'pw');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('request failed (500)');
  });
});

describe('register', () => {
  it('returns ok on 201', async () => {
    mockFetch(null, 201);
    await expect(register('a@b.c', 'pw')).resolves.toEqual({ ok: true, status: 201 });
  });

  it('returns the error body on conflict', async () => {
    mockFetch('email taken', 409);
    await expect(register('a@b.c', 'pw')).resolves.toEqual({
      ok: false,
      status: 409,
      error: 'email taken',
    });
  });
});

describe('logout', () => {
  it('POSTs /api/logout', async () => {
    const fn = mockFetch(null, 204);
    await logout();
    expect(fn).toHaveBeenCalledWith('/api/logout', { method: 'POST', credentials: 'include' });
  });
});

describe('services', () => {
  it('unwraps the services array on 200', async () => {
    const list = [
      { id: 's1', slug: 's1', name: 'Svc', description: 'd', url: 'https://x', icon: 'cog', status: 'UP', favorite: false },
    ];
    const fn = mockFetch(JSON.stringify({ services: list }), 200);
    await expect(services()).resolves.toEqual(list);
    expect(fn).toHaveBeenCalledWith('/api/services', { credentials: 'include' });
  });

  it('returns [] on a non-200', async () => {
    mockFetch(null, 401);
    await expect(services()).resolves.toEqual([]);
  });

  it('returns [] when the payload has no services key', async () => {
    mockFetch(JSON.stringify({}), 200);
    await expect(services()).resolves.toEqual([]);
  });
});

describe('setFavorite', () => {
  it('POSTs to favorite and returns true on 204', async () => {
    const fn = mockFetch(null, 204);
    await expect(setFavorite('s1', true)).resolves.toBe(true);
    expect(fn).toHaveBeenCalledWith('/api/favorites/s1', { method: 'POST', credentials: 'include' });
  });

  it('DELETEs to unfavorite and returns true on 204', async () => {
    const fn = mockFetch(null, 204);
    await expect(setFavorite('s1', false)).resolves.toBe(true);
    expect(fn).toHaveBeenCalledWith('/api/favorites/s1', { method: 'DELETE', credentials: 'include' });
  });

  it('returns false on a non-204', async () => {
    mockFetch(null, 500);
    await expect(setFavorite('s1', true)).resolves.toBe(false);
  });
});

describe('setLayout', () => {
  it('PUTs /api/layout with the order and returns true on 204', async () => {
    const fn = mockFetch(null, 204);
    await expect(setLayout(['a', 'b', 'c'])).resolves.toBe(true);
    const [url, opts] = fn.mock.calls[0];
    expect(url).toBe('/api/layout');
    expect(opts).toMatchObject({ method: 'PUT', credentials: 'include' });
    expect(JSON.parse(opts!.body as string)).toEqual({ order: ['a', 'b', 'c'] });
  });

  it('returns false on a non-204 (e.g. 404 unknown id)', async () => {
    mockFetch('no such service in order', 404);
    await expect(setLayout(['nope'])).resolves.toBe(false);
  });
});
