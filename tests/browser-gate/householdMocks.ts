import type { Page, Route } from '@playwright/test';
import { ADMIN_USER, catalog } from './kidMocks';

// SPEC-household-basics — stateful mocks of the homepad-api contract in
// docs/plans/household-basics-plan.md, for the sign-in states and the invite
// link. Used by the browser gate and by tests/e2e/household.spec.ts.

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const text = (route: Route, body: string, status: number) =>
  route.fulfill({ status, contentType: 'text/plain', body });

export const MEMBER_USER = {
  id: 'u-alex',
  email: 'alex@example.com',
  role: 'user',
  themePref: 'light',
  name: 'Alex',
  displayName: 'Alex',
  avatarColor: '',
  densityPref: 'compact',
  showHealthBar: true,
};

export type HouseholdMock = {
  // Every /api/* URL the page requested, so a test can prove the invite token
  // never travelled in a path or query.
  urls: string[];
  registers: unknown[];
  accepts: unknown[];
};

// mockHousehold — a Homepad that starts empty (setupNeeded) or already set up,
// with an optional live invite. Register creates the first admin once; after
// that it is 403, as under invite_only. Lookup and accept answer for `token`
// only; any other token is the one 404 every dead link gets.
export async function mockHousehold(
  page: Page,
  opts: { setupDone?: boolean; registration?: 'open' | 'invite_only'; token?: string; inviteRole?: 'admin' | 'user' } = {},
): Promise<HouseholdMock> {
  const state: HouseholdMock = { urls: [], registers: [], accepts: [] };
  let setupDone = opts.setupDone ?? false;
  let used = false;
  let me: Record<string, unknown> | null = null;
  const { services, categories } = catalog();

  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();
    state.urls.push(req.url());

    if (path === '/api/auth/config') {
      return json(route, { oidcEnabled: false, registration: opts.registration ?? 'invite_only', setupNeeded: !setupDone });
    }
    if (path === '/api/system/config') return json(route, { showUptimeDisplay: true, statusDegradedMs: 1000 });
    if (path === '/api/me' && method === 'GET') return me ? json(route, me) : text(route, 'unauthorized', 401);
    if (path === '/api/register' && method === 'POST') {
      state.registers.push(req.postDataJSON());
      if (setupDone && opts.registration !== 'open') return text(route, 'registration is invite-only', 403);
      setupDone = true;
      return json(route, { ...ADMIN_USER }, 201);
    }
    if (path === '/api/login' && method === 'POST') {
      me = { ...ADMIN_USER };
      return json(route, me);
    }
    if (path === '/api/logout') {
      me = null;
      return route.fulfill({ status: 204, body: '' });
    }
    if (path === '/api/invites/lookup' && method === 'POST') {
      const { token } = req.postDataJSON() as { token: string };
      if (!opts.token || token !== opts.token || used) return text(route, 'invite not found', 404);
      return json(route, {
        name: 'Alex',
        role: opts.inviteRole ?? 'user',
        inviterName: 'Caleb',
        expiresAt: '2026-11-14T12:00:00Z',
      });
    }
    if (path === '/api/invites/accept' && method === 'POST') {
      const body = req.postDataJSON() as { token: string; name?: string };
      state.accepts.push(body);
      if (!opts.token || body.token !== opts.token || used) return text(route, 'invite not found', 404);
      used = true;
      me = { ...MEMBER_USER, role: opts.inviteRole ?? 'user', name: body.name ?? 'Alex', displayName: body.name ?? 'Alex' };
      return json(route, me, 201);
    }
    if (!me) return text(route, 'unauthorized', 401);
    if (path === '/api/services') return json(route, { services });
    if (path === '/api/categories') return json(route, { categories });
    if (path === '/api/me/collapsed-categories') return json(route, { collapsed: [] });
    if (path === '/api/status') return json(route, { statuses: {} });
    return json(route, {});
  });
  return state;
}
