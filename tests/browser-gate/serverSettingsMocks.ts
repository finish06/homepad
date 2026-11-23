import type { Page, Route } from '@playwright/test';
import type { ServerSetting, ServerSettings, SettingValue, SettingWarning } from '../../src/library/serverSettingsApi';
import { settingsBody } from '../../src/test/serverSettingsFixture';

// SPEC-admin-server-settings §7 — a stateful mock of the server-settings routes
// for the browser gate and e2e. It plays the server's part of the contract the
// web app is built against: precedence (UI > env > default), the §2.5 guards
// (409 confirm_required with warnings until resent with `confirm`, 409
// would_lock_out without a passed test, 400 invalid), the test sign-in, and
// env-only mode. Hosts are example.com only.

export type ServerSettingsMock = {
  state: ServerSettings;
  patches: { set: Record<string, SettingValue>; confirm?: string[]; oidcTest?: string }[];
  deletes: string[];
  tests: Record<string, SettingValue>[];
};

export type ServerSettingsOpts = {
  over?: Record<string, Partial<ServerSetting>>;
  envOnly?: boolean;
  // TC-008 — no admin has a password: OIDC changes need a passed test.
  noAdminPassword?: boolean;
  // TC-003 — accounts + pending invites today.
  accountCount?: number;
  // The authorize page the test sign-in opens.
  authorizeUrl?: string;
};

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

export const AUTHORIZE_URL = 'https://id.example.com/authorize?state=test-1';

export async function mockServerSettings(page: Page, opts: ServerSettingsOpts = {}): Promise<ServerSettingsMock> {
  const mock: ServerSettingsMock = {
    state: settingsBody(opts.over ?? {}, opts.envOnly ?? false),
    patches: [],
    deletes: [],
    tests: [],
  };
  let polls = 0;
  let passedToken: string | null = null;
  const find = (k: string) => mock.state.settings.find((s) => s.key === k);

  function warningsFor(set: Record<string, SettingValue>): SettingWarning[] {
    const out: SettingWarning[] = [];
    if ('COOKIE_SECURE' in set) out.push({ code: set.COOKIE_SECURE === true ? 'cookie_secure_on' : 'cookie_secure_off' });
    if ('HOMEPAD_TRUSTED_PROXIES' in set) {
      out.push({
        code: 'trusted_proxies',
        message: 'Homepad sees you as 192.0.2.10 now. With this list it would see 198.51.100.7.',
        currentAddress: '192.0.2.10',
        newAddress: '198.51.100.7',
      });
    }
    if (set.HOMEPAD_REGISTRATION === 'open' && find('HOMEPAD_REGISTRATION')?.value !== 'open') {
      out.push({ code: 'registration_open' });
    }
    const lim = set.HOMEPAD_MAX_ACCOUNTS;
    if (typeof lim === 'number' && lim > 0 && opts.accountCount && lim < opts.accountCount) {
      out.push({
        code: 'max_accounts_below_count',
        message: 'server words',
        accounts: opts.accountCount - 2,
        pendingInvites: 2,
        limit: lim,
      });
    }
    return out;
  }

  await page.route('**/api/admin/server-settings**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const method = req.method();

    if (path === '/api/admin/server-settings' && method === 'GET') return json(route, mock.state);

    if (path === '/api/admin/server-settings' && method === 'PATCH') {
      const body = req.postDataJSON() as { set: Record<string, SettingValue>; confirm?: string[]; oidcTest?: string };
      mock.patches.push(body);
      if (mock.state.envOnly) return json(route, { error: 'env_only', message: 'Server settings come from the environment only.' }, 409);
      for (const [k, v] of Object.entries(body.set)) {
        if (!find(k)) return json(route, { error: 'unknown key' }, 404);
        if (k === 'PORT') return json(route, { error: 'read_only' }, 400);
        if (k === 'HOMEPAD_MAX_ACCOUNTS' && (typeof v !== 'number' || v < 0 || v > 10000)) {
          return json(route, { error: 'invalid', key: k, message: 'Enter a whole number from 0 to 10000.' }, 400);
        }
      }
      const needed = warningsFor(body.set).filter((w) => !(body.confirm ?? []).includes(w.code));
      if (needed.length) return json(route, { error: 'confirm_required', warnings: needed }, 409);
      const oidc = Object.keys(body.set).some((k) => k.startsWith('OIDC_'));
      if (oidc && opts.noAdminPassword && (!body.oidcTest || body.oidcTest !== passedToken)) {
        return json(
          route,
          { error: 'would_lock_out', message: 'No admin has a password, so a mistake here could lock everyone out. Test sign-in with the new settings first.' },
          409,
        );
      }
      for (const [k, v] of Object.entries(body.set)) {
        const s = find(k)!;
        Object.assign(s, s.secret ? { isSet: true } : { value: v, savedValue: v }, {
          saved: true,
          source: 'ui',
          updatedAt: '2026-11-23T18:04:00Z',
          updatedBy: { id: 'u-admin', name: 'Caleb' },
        });
      }
      return json(route, mock.state);
    }

    const del = path.match(/^\/api\/admin\/server-settings\/([A-Z_]+)$/);
    if (del && method === 'DELETE') {
      const k = del[1];
      const s = find(k);
      if (!s) return json(route, { error: 'unknown key' }, 404);
      // 0.2.1: confirm codes and the test token ride in the query string.
      const q = new URL(req.url()).searchParams;
      mock.deletes.push(q.toString() ? `${k}?${q.toString()}` : k);
      const back = s.envValue !== null && s.envValue !== undefined && s.envValue !== '' ? s.envValue : s.defaultValue;
      Object.assign(s, s.secret ? { isSet: s.envIsSet } : { value: back }, {
        source: s.secret ? (s.envIsSet ? 'env' : 'default') : s.envValue !== null && s.envValue !== undefined && s.envValue !== '' ? 'env' : 'default',
        updatedAt: null,
        updatedBy: null,
        saved: false,
        savedValue: undefined,
      });
      return json(route, mock.state);
    }

    if (path === '/api/admin/server-settings/oidc/test' && method === 'POST') {
      mock.tests.push((req.postDataJSON() as { set: Record<string, SettingValue> }).set);
      polls = 0;
      return json(route, { id: 'test-1', authorizeUrl: opts.authorizeUrl ?? AUTHORIZE_URL });
    }
    if (path === '/api/admin/server-settings/oidc/test/test-1' && method === 'GET') {
      polls += 1;
      if (polls < 2) return json(route, { state: 'pending' });
      passedToken = 'tok-1';
      return json(route, { state: 'passed', token: passedToken });
    }
    return json(route, { error: 'not mocked' }, 404);
  });

  // The provider's page the test sign-in opens in a new tab.
  await page.context().route('https://id.example.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Provider</title><p>Signed in.</p>' }),
  );
  return mock;
}
