import type { Page, Route } from '@playwright/test';
import { catalog } from './kidMocks';
import { MEMBER_USER } from './householdMocks';

// SPEC-password-reset-link — stateful mocks of the reset-link and Change
// password routes, for tests/e2e/password-reset.spec.ts. Lookup and accept
// answer for `token` only, once; any other token gets the one 404 every dead
// link gets. Change password takes `current` as the right current password.

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const text = (route: Route, body: string, status: number) =>
  route.fulfill({ status, contentType: 'text/plain', body });

export type PasswordMock = {
  // Every /api/* URL the page requested, so a test can prove the token never
  // travelled in a path or query.
  urls: string[];
  accepts: unknown[];
  changes: unknown[];
};

export async function mockPasswords(
  page: Page,
  opts: {
    token?: string;
    signedIn?: boolean;
    current?: string;
    // SPEC-qa-cleanup-18.5.0 (#606) — false: the signed-in adult is SSO-only.
    hasPassword?: boolean;
    // #606, #610 — answer every Change password with this refusal instead:
    // 409 (the account has no password any more) or 429 with Retry-After.
    changeRefusal?: { status: 409 } | { status: 429; retryAfter: number };
  } = {},
): Promise<PasswordMock> {
  const state: PasswordMock = { urls: [], accepts: [], changes: [] };
  let used = false;
  let me: Record<string, unknown> | null = opts.signedIn ? { ...MEMBER_USER, hasPassword: opts.hasPassword ?? true } : null;
  const { services, categories } = catalog();

  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const method = req.method();
    state.urls.push(req.url());

    if (path === '/api/auth/config') return json(route, { oidcEnabled: false, registration: 'invite_only', setupNeeded: false });
    if (path === '/api/system/config') return json(route, { showUptimeDisplay: true, statusDegradedMs: 1000 });
    if (path === '/api/me' && method === 'GET') return me ? json(route, me) : text(route, 'unauthorized', 401);
    if (path === '/api/password-resets/lookup' && method === 'POST') {
      const { token } = req.postDataJSON() as { token: string };
      if (!opts.token || token !== opts.token || used) return text(route, 'reset link not found', 404);
      return json(route, { email: MEMBER_USER.email, name: 'Alex', expiresAt: '2026-11-21T21:40:00Z' });
    }
    if (path === '/api/password-resets/accept' && method === 'POST') {
      const body = req.postDataJSON() as { token: string };
      state.accepts.push(body);
      if (!opts.token || body.token !== opts.token || used) return text(route, 'reset link not found', 404);
      used = true;
      me = { ...MEMBER_USER, hasPassword: true };
      return json(route, me);
    }
    if (!me) return text(route, 'unauthorized', 401);
    if (path === '/api/me/password' && method === 'POST') {
      const body = req.postDataJSON() as { currentPassword: string };
      state.changes.push(body);
      const refusal = opts.changeRefusal;
      if (refusal?.status === 409) return json(route, { error: 'sso_account' }, 409);
      if (refusal?.status === 429) {
        return route.fulfill({
          status: 429,
          contentType: 'text/plain',
          body: 'too many wrong passwords',
          headers: { 'Retry-After': String(refusal.retryAfter) },
        });
      }
      if (body.currentPassword !== opts.current) return json(route, { error: 'wrong_password' }, 403);
      return route.fulfill({ status: 204, body: '' });
    }
    if (path === '/api/services') return json(route, { services });
    if (path === '/api/categories') return json(route, { categories });
    if (path === '/api/me/collapsed-categories') return json(route, { collapsed: [] });
    if (path === '/api/status') return json(route, { statuses: {} });
    return json(route, {});
  });
  return state;
}
