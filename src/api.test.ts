import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assignCategory,
  authConfig,
  categories,
  createCategory,
  createService,
  deleteCategory,
  deleteIcon,
  deleteService,
  login,
  logout,
  me,
  register,
  renameCategory,
  services,
  setCategoryOrder,
  setFavorite,
  setLayout,
  setThemePref,
  updateService,
  uploadIcon,
} from './api';

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

describe('authConfig', () => {
  it('reports oidcEnabled:true from /api/auth/config', async () => {
    const fn = mockFetch(JSON.stringify({ oidcEnabled: true }), 200);
    await expect(authConfig()).resolves.toEqual({ oidcEnabled: true });
    expect(fn).toHaveBeenCalledWith('/api/auth/config', { credentials: 'include' });
  });

  it('reports oidcEnabled:false when the API says so', async () => {
    mockFetch(JSON.stringify({ oidcEnabled: false }), 200);
    await expect(authConfig()).resolves.toEqual({ oidcEnabled: false });
  });

  it('treats a non-200 as oidcEnabled:false', async () => {
    mockFetch(null, 500);
    await expect(authConfig()).resolves.toEqual({ oidcEnabled: false });
  });

  it('treats a fetch failure as oidcEnabled:false', async () => {
    const fn = vi.fn(async () => {
      throw new Error('network down');
    });
    vi.stubGlobal('fetch', fn);
    await expect(authConfig()).resolves.toEqual({ oidcEnabled: false });
  });
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

describe('createService', () => {
  const input = {
    slug: 'plex',
    name: 'Plex',
    description: 'Media',
    url: 'https://plex.x',
    icon: 'https://plex.x/icon.png',
    gatus_key: 'plex',
  };

  it('POSTs the catalog fields and returns the created service on 201', async () => {
    const created = { id: 's1', ...input, status: 'UNKNOWN', favorite: false, iconLight: false, iconDark: false };
    const fn = mockFetch(JSON.stringify(created), 201);
    const r = await createService(input);
    expect(r).toEqual({ ok: true, status: 201, service: created });
    const [url, opts] = fn.mock.calls[0];
    expect(url).toBe('/api/services');
    expect(opts).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(JSON.parse(opts!.body as string)).toEqual(input);
  });

  it('surfaces the server error inline on a 409 slug collision', async () => {
    mockFetch('a service with that slug already exists', 409);
    await expect(createService(input)).resolves.toEqual({
      ok: false,
      status: 409,
      error: 'a service with that slug already exists',
    });
  });

  it('surfaces a 403 forbidden for a non-admin', async () => {
    mockFetch('admin role required', 403);
    const r = await createService(input);
    expect(r.ok).toBe(false);
    expect(r.status).toBe(403);
    expect(r.service).toBeUndefined();
  });
});

describe('updateService', () => {
  it('PATCHes only the given fields and returns the updated service on 200', async () => {
    const updated = {
      id: 's1', slug: 'plex', name: 'Plex Media', description: 'Media', url: 'https://plex.x',
      icon: '', status: 'UP', favorite: false, iconLight: false, iconDark: false,
    };
    const fn = mockFetch(JSON.stringify(updated), 200);
    const r = await updateService('s1', { name: 'Plex Media' });
    expect(r).toEqual({ ok: true, status: 200, service: updated });
    const [url, opts] = fn.mock.calls[0];
    expect(url).toBe('/api/services/s1');
    expect(opts).toMatchObject({ method: 'PATCH', credentials: 'include' });
    expect(JSON.parse(opts!.body as string)).toEqual({ name: 'Plex Media' });
  });

  it('surfaces the server error inline on a 409 slug collision', async () => {
    mockFetch('a service with that slug already exists', 409);
    await expect(updateService('s1', { slug: 'taken' })).resolves.toEqual({
      ok: false,
      status: 409,
      error: 'a service with that slug already exists',
    });
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

describe('uploadIcon', () => {
  it('PUTs raw PNG bytes with image/png and returns ok on 204', async () => {
    const fn = mockFetch(null, 204);
    const png = new Blob([new Uint8Array([0x89, 0x50])], { type: 'image/png' });
    await expect(uploadIcon('s1', 'light', png)).resolves.toEqual({ ok: true, status: 204 });
    const [url, opts] = fn.mock.calls[0];
    expect(url).toBe('/api/services/s1/icon/light');
    expect(opts).toMatchObject({ method: 'PUT', credentials: 'include' });
    expect((opts!.headers as Record<string, string>)['Content-Type']).toBe('image/png');
    expect(opts!.body).toBe(png);
  });

  it('surfaces the server validation error on a non-204 (e.g. 415)', async () => {
    mockFetch('not a png', 415);
    const png = new Blob([new Uint8Array([1])], { type: 'image/png' });
    await expect(uploadIcon('s1', 'dark', png)).resolves.toEqual({
      ok: false,
      status: 415,
      error: 'not a png',
    });
  });
});

describe('deleteIcon', () => {
  it('DELETEs the variant and returns true on 204', async () => {
    const fn = mockFetch(null, 204);
    await expect(deleteIcon('s1', 'dark')).resolves.toBe(true);
    expect(fn).toHaveBeenCalledWith('/api/services/s1/icon/dark', {
      method: 'DELETE',
      credentials: 'include',
    });
  });

  it('returns false on a non-204 (e.g. 403 non-admin)', async () => {
    mockFetch(null, 403);
    await expect(deleteIcon('s1', 'light')).resolves.toBe(false);
  });
});

describe('deleteService', () => {
  it('DELETEs the service and returns true on 204', async () => {
    const fn = mockFetch(null, 204);
    await expect(deleteService('s1')).resolves.toBe(true);
    expect(fn).toHaveBeenCalledWith('/api/services/s1', {
      method: 'DELETE',
      credentials: 'include',
    });
  });

  it('returns false on a non-204 (e.g. 403 non-admin)', async () => {
    mockFetch(null, 403);
    await expect(deleteService('s1')).resolves.toBe(false);
  });
});

// ── v4 categories ──────────────────────────────────────────────────────────

describe('categories (v4)', () => {
  it('unwraps the categories array on 200', async () => {
    const list = [
      { id: 'c1', name: 'Media', sortIndex: 0 },
      { id: 'c2', name: 'Infra', sortIndex: 1 },
    ];
    const fn = mockFetch(JSON.stringify({ categories: list }), 200);
    await expect(categories()).resolves.toEqual(list);
    expect(fn).toHaveBeenCalledWith('/api/categories', { credentials: 'include' });
  });

  it('returns [] on a non-200 (falls back to flat render)', async () => {
    mockFetch(null, 401);
    await expect(categories()).resolves.toEqual([]);
  });

  it('returns [] when the payload has no categories key', async () => {
    mockFetch(JSON.stringify({}), 200);
    await expect(categories()).resolves.toEqual([]);
  });
});

describe('createCategory (v4)', () => {
  it('POSTs the name and returns the created category on 201', async () => {
    const created = { id: 'c1', name: 'Media', sortIndex: 0 };
    const fn = mockFetch(JSON.stringify(created), 201);
    const r = await createCategory('Media');
    expect(r).toEqual({ ok: true, status: 201, category: created });
    const [url, opts] = fn.mock.calls[0];
    expect(url).toBe('/api/categories');
    expect(opts).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(JSON.parse(opts!.body as string)).toEqual({ name: 'Media' });
  });

  it('surfaces a 409 duplicate-name error inline', async () => {
    mockFetch('a category with that name already exists', 409);
    await expect(createCategory('Media')).resolves.toEqual({
      ok: false,
      status: 409,
      error: 'a category with that name already exists',
    });
  });

  it('surfaces a 403 forbidden for a non-admin', async () => {
    mockFetch('admin role required', 403);
    const r = await createCategory('Media');
    expect(r.ok).toBe(false);
    expect(r.status).toBe(403);
    expect(r.category).toBeUndefined();
  });
});

describe('renameCategory (v4)', () => {
  it('PATCHes the name and returns the updated category on 200', async () => {
    const updated = { id: 'c1', name: 'Infra', sortIndex: 0 };
    const fn = mockFetch(JSON.stringify(updated), 200);
    const r = await renameCategory('c1', 'Infra');
    expect(r).toEqual({ ok: true, status: 200, category: updated });
    const [url, opts] = fn.mock.calls[0];
    expect(url).toBe('/api/categories/c1');
    expect(opts).toMatchObject({ method: 'PATCH', credentials: 'include' });
    expect(JSON.parse(opts!.body as string)).toEqual({ name: 'Infra' });
  });

  it('surfaces a 404 unknown id inline', async () => {
    mockFetch('no such category', 404);
    await expect(renameCategory('nope', 'Infra')).resolves.toEqual({
      ok: false,
      status: 404,
      error: 'no such category',
    });
  });

  it('surfaces a 409 duplicate-name inline', async () => {
    mockFetch('a category with that name already exists', 409);
    const r = await renameCategory('c1', 'Media');
    expect(r.ok).toBe(false);
    expect(r.status).toBe(409);
  });
});

describe('deleteCategory (v4)', () => {
  it('DELETEs the category and returns true on 204', async () => {
    const fn = mockFetch(null, 204);
    await expect(deleteCategory('c1')).resolves.toBe(true);
    expect(fn).toHaveBeenCalledWith('/api/categories/c1', {
      method: 'DELETE',
      credentials: 'include',
    });
  });

  it('returns false on a non-204 (e.g. 403 non-admin)', async () => {
    mockFetch(null, 403);
    await expect(deleteCategory('c1')).resolves.toBe(false);
  });
});

describe('setCategoryOrder (v4)', () => {
  it('PUTs /api/categories/order with the order and returns true on 204', async () => {
    const fn = mockFetch(null, 204);
    await expect(setCategoryOrder(['c2', 'c1'])).resolves.toBe(true);
    const [url, opts] = fn.mock.calls[0];
    expect(url).toBe('/api/categories/order');
    expect(opts).toMatchObject({ method: 'PUT', credentials: 'include' });
    expect(JSON.parse(opts!.body as string)).toEqual({ order: ['c2', 'c1'] });
  });

  it('returns false on a non-204 (e.g. 404 unknown id in order)', async () => {
    mockFetch('no such category in order', 404);
    await expect(setCategoryOrder(['nope'])).resolves.toBe(false);
  });
});

describe('assignCategory (v4)', () => {
  it('PATCHes the service categoryId and returns the updated service on 200', async () => {
    const updated = {
      id: 's1', slug: 'plex', name: 'Plex', description: 'd', url: 'https://plex.x',
      icon: '', status: 'UP', favorite: false, iconLight: false, iconDark: false,
      categoryId: 'c1', categoryName: 'Media',
    };
    const fn = mockFetch(JSON.stringify(updated), 200);
    const r = await assignCategory('s1', 'c1');
    expect(r).toEqual({ ok: true, status: 200, service: updated });
    const [url, opts] = fn.mock.calls[0];
    expect(url).toBe('/api/services/s1');
    expect(opts).toMatchObject({ method: 'PATCH', credentials: 'include' });
    expect(JSON.parse(opts!.body as string)).toEqual({ categoryId: 'c1' });
  });

  it('sends categoryId:null to clear back to Uncategorized', async () => {
    const fn = mockFetch(
      JSON.stringify({ id: 's1', categoryId: null, categoryName: null }),
      200,
    );
    await assignCategory('s1', null);
    const [, opts] = fn.mock.calls[0];
    expect(JSON.parse(opts!.body as string)).toEqual({ categoryId: null });
  });

  it('surfaces a 400 for a categoryId naming no category', async () => {
    mockFetch('no such category', 400);
    await expect(assignCategory('s1', 'bogus')).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'no such category',
    });
  });
});

describe('setThemePref (v3)', () => {
  it('PATCHes /api/me with the themePref and returns true on 200', async () => {
    const fn = mockFetch(JSON.stringify({ id: 'u1', themePref: 'dark' }), 200);
    await expect(setThemePref('dark')).resolves.toBe(true);
    const [url, opts] = fn.mock.calls[0];
    expect(url).toBe('/api/me');
    expect(opts).toMatchObject({ method: 'PATCH', credentials: 'include' });
    expect(JSON.parse(opts!.body as string)).toEqual({ themePref: 'dark' });
  });

  it('returns false on a non-200 (e.g. 400 invalid value / 401 no session)', async () => {
    mockFetch('invalid themePref', 400);
    await expect(setThemePref('system')).resolves.toBe(false);
    mockFetch(null, 401);
    await expect(setThemePref('light')).resolves.toBe(false);
  });
});
