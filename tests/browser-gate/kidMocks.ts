import { type Page, type Route } from '@playwright/test';

// SPEC-kid-accounts (TASK-401) — mocked API for the kid board and the admin
// Accounts section, shared by tests/browser-gate and tests/e2e. It mirrors
// homepad-api's contract (internal/api/admin_accounts.go, kids.go, server.go):
//   - the account and device lists are bare JSON arrays;
//   - a duplicate kid name (case-insensitive) is a 409;
//   - PUT …/services requires `serviceIds`;
//   - every kid-forbidden route answers a kid session with 403.
//
// The kid mock RECORDS every 403 it serves. A kid dashboard that calls a route
// it may not use is a bug even when nothing visible breaks (a toast, a console
// error, a dead retry), so the gates assert that list stays empty.

export type MockService = {
  id: string;
  slug: string;
  name: string;
  description: string;
  url: string;
  icon: string;
  status: string;
  favorite: boolean;
  iconLight: boolean;
  iconDark: boolean;
  categoryId: string | null;
  categoryName?: string | null;
};
export type MockCategory = { id: string; name: string; sortIndex: number; gridWidth?: number };
export type MockAccount = {
  id: string;
  name: string;
  role: 'admin' | 'user' | 'kid';
  lastSeenAt: string | null;
  email?: string;
  avatarColor: string;
  appCount?: number;
  deviceCount?: number;
};
export type MockDevice = { id: string; userAgent: string; createdAt: string; lastSeenAt: string };

export const ADMIN_USER = {
  id: 'u-admin',
  email: 'caleb@ohana.test',
  role: 'admin',
  themePref: 'light',
  name: 'Caleb',
  displayName: 'Caleb',
  avatarColor: 'blue',
  densityPref: 'compact',
  showHealthBar: true,
};

// A kid as GET /api/me returns it: no email, created with the health bar off
// and large tiles (AC-019, UX K-3).
export function kidUser(name = 'Maya', avatarColor = 'teal', id = 'k-maya') {
  return {
    id,
    email: '',
    role: 'kid',
    themePref: 'light',
    name,
    displayName: name,
    avatarColor,
    densityPref: 'large',
    showHealthBar: false,
    showUptimeDisplay: true,
  };
}

function svc(id: string, name: string, categoryId: string | null, categoryName: string | null): MockService {
  return {
    id,
    slug: id,
    name,
    description: '',
    url: `https://${id}.example.test`,
    icon: '', // empty → the bundled default icon, no network
    status: 'UP',
    favorite: false,
    iconLight: false,
    iconDark: false,
    categoryId,
    categoryName,
  };
}

// The shared catalog the admin sees: four sections, 12 apps.
export function catalog(): { services: MockService[]; categories: MockCategory[] } {
  const categories: MockCategory[] = [
    { id: 'c-media', name: 'Media', sortIndex: 0, gridWidth: 6 },
    { id: 'c-photos', name: 'Photos', sortIndex: 1, gridWidth: 6 },
    { id: 'c-learn', name: 'Learning', sortIndex: 2, gridWidth: 6 },
    { id: 'c-ops', name: 'Monitoring', sortIndex: 3, gridWidth: 6 },
  ];
  const services = [
    svc('plex', 'Plex', 'c-media', 'Media'),
    svc('jellyfin', 'Jellyfin', 'c-media', 'Media'),
    svc('abs', 'Audiobookshelf', 'c-media', 'Media'),
    svc('kavita', 'Kavita', 'c-media', 'Media'),
    svc('immich', 'Immich', 'c-photos', 'Photos'),
    svc('photoprism', 'PhotoPrism', 'c-photos', 'Photos'),
    svc('ente', 'Ente', 'c-photos', 'Photos'),
    svc('khan', 'Khan Academy', 'c-learn', 'Learning'),
    svc('grafana', 'Grafana', 'c-ops', 'Monitoring'),
    svc('gatus', 'Gatus', 'c-ops', 'Monitoring'),
    svc('prometheus', 'Prometheus', 'c-ops', 'Monitoring'),
    svc('uptime', 'Uptime Kuma', 'c-ops', 'Monitoring'),
  ];
  return { services, categories };
}

// What the server returns to a kid: only the allowed services, and only the
// categories that contain one (OQ-2).
export function visibleTo(allowed: string[]): { services: MockService[]; categories: MockCategory[] } {
  const { services, categories } = catalog();
  const vis = services.filter((s) => allowed.includes(s.id));
  const used = new Set(vis.map((s) => s.categoryId));
  return { services: vis, categories: categories.filter((c) => used.has(c.id)) };
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const text = (route: Route, body: string, status: number) =>
  route.fulfill({ status, contentType: 'text/plain', body });

// The routes server.go classifies kid-forbidden or admin-only that a dashboard
// could plausibly reach. A kid session gets 403 on each (requireNotKid).
function kidForbidden(method: string, path: string): boolean {
  if (path.startsWith('/api/admin/')) return true;
  if (path === '/api/me/collapsed-categories' && method === 'PUT') return true;
  if (path === '/api/status/refresh') return true;
  if (path === '/api/layout') return true;
  if (path.startsWith('/api/library')) return true;
  if (path.startsWith('/api/services') && method !== 'GET') return true;
  if (/^\/api\/services\/[^/]+\/fetch-icon/.test(path)) return true;
  if (path.startsWith('/api/categories') && method !== 'GET') return true;
  return false;
}

export type KidMock = {
  // Every request the mock answered 403, as "METHOD /path".
  forbidden: string[];
  // Every PATCH /api/me body.
  mePatches: Record<string, unknown>[];
  // Every favorite write, as "POST id" / "DELETE id".
  favorites: string[];
  // Make the next GET /api/me and /api/services answer 401 (a revoked device).
  revoke: () => void;
  // An admin changed this kid's apps: serve this allow-list from now on.
  setAllowed: (ids: string[]) => void;
};

// mockKidSession — a signed-in kid seeing `allowed`. Call it INSTEAD of mockApi.
export async function mockKidSession(
  page: Page,
  allowed: string[],
  opts: { user?: ReturnType<typeof kidUser> } = {},
): Promise<KidMock> {
  const user = opts.user ?? kidUser();
  const state: KidMock = { forbidden: [], mePatches: [], favorites: [], revoke: () => {}, setAllowed: () => {} };
  let revoked = false;
  state.revoke = () => {
    revoked = true;
  };
  let { services, categories } = visibleTo(allowed);
  state.setAllowed = (ids) => {
    ({ services, categories } = visibleTo(ids));
  };

  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();
    if (revoked && path !== '/api/auth/config' && path !== '/api/system/config') {
      return text(route, 'unauthorized', 401);
    }
    if (kidForbidden(method, path)) {
      state.forbidden.push(`${method} ${path}`);
      return text(route, 'not available to kid accounts', 403);
    }
    if (path === '/api/me' && method === 'PATCH') {
      const body = req.postDataJSON() as Record<string, unknown>;
      state.mePatches.push(body);
      if (Object.keys(body).some((k) => k !== 'themePref')) {
        state.forbidden.push(`PATCH /api/me ${Object.keys(body).join(',')}`);
        return text(route, 'kid accounts can only change themePref', 403);
      }
      Object.assign(user, body);
      return json(route, user);
    }
    if (path === '/api/me') return json(route, user);
    if (path === '/api/logout') return route.fulfill({ status: 204, body: '' });
    if (path === '/api/auth/config') return json(route, { oidcEnabled: false });
    if (path === '/api/system/config') return json(route, { showUptimeDisplay: true, statusDegradedMs: 1000 });
    if (path === '/api/services') return json(route, { services });
    if (path === '/api/categories') return json(route, { categories });
    if (path === '/api/me/collapsed-categories') return json(route, { collapsed: [] });
    if (path.startsWith('/api/favorites/')) {
      const id = decodeURIComponent(path.slice('/api/favorites/'.length));
      const s = services.find((x) => x.id === id);
      if (!s) return text(route, 'not found', 404);
      s.favorite = method === 'POST';
      state.favorites.push(`${method} ${id}`);
      return route.fulfill({ status: 204, body: '' });
    }
    if (path === '/api/status') return json(route, { statuses: {} });
    return json(route, {});
  });
  return state;
}

export type AdminMock = {
  accounts: MockAccount[];
  kidServices: Record<string, string[]>;
  sessions: Record<string, MockDevice[]>;
  // Bodies of every PUT …/services, keyed by kid id.
  serviceWrites: { id: string; body: unknown }[];
  // Kid ids signed in "here", in order.
  signIns: string[];
};

export function defaultAccounts(): Pick<AdminMock, 'accounts' | 'kidServices' | 'sessions'> {
  return {
    accounts: [
      { id: 'u-admin', name: 'Caleb', role: 'admin', lastSeenAt: '2026-10-30T08:00:00Z', email: 'caleb@ohana.test', avatarColor: 'blue' },
      { id: 'u-alex', name: 'Alex', role: 'user', lastSeenAt: null, email: 'alex@example.com', avatarColor: '' },
      { id: 'k-maya', name: 'Maya', role: 'kid', lastSeenAt: '2026-10-30T06:00:00Z', avatarColor: 'teal', appCount: 5, deviceCount: 1 },
      { id: 'k-leo', name: 'Leo', role: 'kid', lastSeenAt: null, avatarColor: 'orange', appCount: 0, deviceCount: 0 },
    ],
    kidServices: { 'k-maya': ['plex', 'jellyfin', 'abs', 'kavita', 'immich'], 'k-leo': [] },
    sessions: {
      'k-maya': [
        {
          id: 'h-ipad',
          userAgent:
            'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
          createdAt: '2026-10-22T09:00:00Z',
          lastSeenAt: '2026-10-30T06:00:00Z',
        },
      ],
      'k-leo': [],
    },
  };
}

// mockAdminAccounts — a signed-in admin with a stateful Accounts API over the
// shared catalog. Call it INSTEAD of mockApi. After sign-in-here succeeds the
// mock becomes that kid (the server swaps the cookie), so the reload lands on
// the kid's board exactly as it would for real.
export async function mockAdminAccounts(
  page: Page,
  seed: Partial<Pick<AdminMock, 'accounts' | 'kidServices' | 'sessions'>> = {},
  opts: { accountsStatus?: number } = {},
): Promise<AdminMock> {
  const d = defaultAccounts();
  const state: AdminMock = {
    accounts: seed.accounts ?? d.accounts,
    kidServices: seed.kidServices ?? d.kidServices,
    sessions: seed.sessions ?? d.sessions,
    serviceWrites: [],
    signIns: [],
  };
  const { services, categories } = catalog();
  let kidSession: KidMock | null = null;
  let nextId = 1;

  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const method = req.method();
    if (kidSession) return route.fallback(); // the kid mock (registered later) answers
    const kidMatch = path.match(/^\/api\/admin\/kids\/([^/]+)(\/.*)?$/);

    if (path === '/api/me') return json(route, ADMIN_USER);
    if (path === '/api/auth/config') return json(route, { oidcEnabled: false });
    if (path === '/api/system/config') return json(route, { showUptimeDisplay: true, statusDegradedMs: 1000 });
    if (path === '/api/services') return json(route, { services });
    if (path === '/api/categories') return json(route, { categories });
    if (path === '/api/admin/env-config') return json(route, [{ key: 'HOMEPAD_REGISTRATION', value: 'invite_only' }]);
    if (path === '/api/library') return json(route, { library: [] });
    if (path === '/api/admin/accounts') {
      if (opts.accountsStatus && opts.accountsStatus !== 200) return text(route, 'internal error', opts.accountsStatus);
      return json(route, state.accounts);
    }
    if (path === '/api/admin/kids' && method === 'POST') {
      const body = req.postDataJSON() as { name: string; avatarColor?: string };
      const name = (body.name ?? '').trim();
      if (!name || [...name].length > 40) return text(route, 'name must be 1-40 characters', 400);
      if (state.accounts.some((a) => a.role === 'kid' && a.name.toLowerCase() === name.toLowerCase())) {
        return text(route, 'a kid with that name already exists', 409);
      }
      const acct: MockAccount = {
        id: `k-new-${nextId++}`,
        name,
        role: 'kid',
        lastSeenAt: null,
        avatarColor: body.avatarColor ?? 'blue',
        appCount: 0,
        deviceCount: 0,
      };
      state.accounts.push(acct);
      state.kidServices[acct.id] = [];
      state.sessions[acct.id] = [];
      return json(route, acct, 201);
    }
    if (kidMatch) {
      const id = decodeURIComponent(kidMatch[1]);
      const rest = kidMatch[2] ?? '';
      const kid = state.accounts.find((a) => a.id === id && a.role === 'kid');
      if (!kid) return text(route, 'no such kid account', 404);
      if (rest === '' && method === 'PATCH') {
        const body = req.postDataJSON() as { name?: string; avatarColor?: string };
        if (body.name !== undefined) {
          const name = body.name.trim();
          if (state.accounts.some((a) => a.role === 'kid' && a.id !== id && a.name.toLowerCase() === name.toLowerCase())) {
            return text(route, 'a kid with that name already exists', 409);
          }
          kid.name = name;
        }
        if (body.avatarColor !== undefined) kid.avatarColor = body.avatarColor;
        return json(route, kid);
      }
      if (rest === '' && method === 'DELETE') {
        state.accounts = state.accounts.filter((a) => a.id !== id);
        return route.fulfill({ status: 204, body: '' });
      }
      if (rest === '/services' && method === 'GET') return json(route, { serviceIds: state.kidServices[id] ?? [] });
      if (rest === '/services' && method === 'PUT') {
        const body = req.postDataJSON() as { serviceIds?: string[] };
        state.serviceWrites.push({ id, body });
        if (!Array.isArray(body.serviceIds)) return text(route, 'serviceIds is required', 400);
        state.kidServices[id] = body.serviceIds;
        kid.appCount = body.serviceIds.length;
        return route.fulfill({ status: 204, body: '' });
      }
      if (rest === '/sessions' && method === 'GET') return json(route, state.sessions[id] ?? []);
      const sid = rest.match(/^\/sessions\/([^/]+)$/);
      if (sid && method === 'DELETE') {
        state.sessions[id] = (state.sessions[id] ?? []).filter((s) => s.id !== decodeURIComponent(sid[1]));
        kid.deviceCount = state.sessions[id].length;
        return route.fulfill({ status: 204, body: '' });
      }
      if (rest === '/sign-in-here' && method === 'POST') {
        state.signIns.push(id);
        // The device is now the kid's: route everything to a kid session.
        kidSession = await mockKidSession(page, state.kidServices[id] ?? [], {
          user: kidUser(kid.name, kid.avatarColor, kid.id),
        });
        return route.fulfill({ status: 204, body: '' });
      }
    }
    return json(route, {});
  });
  return state;
}
