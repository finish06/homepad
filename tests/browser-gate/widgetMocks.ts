import { type Page, type Route } from '@playwright/test';

// SPEC-status-widgets — a mocked homepad-api for the widget surfaces, shared by
// tests/browser-gate and tests/e2e. It mirrors the contract the API PR ships:
//   - GET /api/services carries `widget` (typed numbers only), never for a kid;
//   - GET /api/widgets/info is the session read of clock, weather and search;
//   - the admin routes carry the widget's address and username, and NEVER its
//     key (write-only, AC-003) — `hasSecret` only.
//
// The admin routes answer with the full admin payload whatever the session's
// role. The real API 403s a non-admin there; answering anyway is deliberate, so
// that a non-admin UI that asked for them would receive the sentinels below
// and the leak test (no-widget-leak.spec.ts) would catch it.

export const WIDGET_ADDRESS = 'http://jellyfin-sentinel.home.arpa:8096';
export const WIDGET_USERNAME = 'widget-user-sentinel';
export const WIDGET_KEY = 'wk-sentinel-5d1f9c2a';

type Role = 'admin' | 'user' | 'kid';

const now = () => new Date().toISOString();
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

const count = (key: string, label: string, value: number) => ({ key, label, unit: 'count', value });

function service(id: string, name: string, categoryId: string, widget?: unknown) {
  return {
    id,
    slug: id,
    name,
    description: '',
    url: `https://${id}.example.com`,
    icon: '',
    status: 'UP',
    favorite: false,
    iconLight: false,
    iconDark: false,
    categoryId,
    categoryName: categoryId === 'c-media' ? 'Media' : 'Tools',
    responseTimeMs: 41,
    ...(widget ? { widget } : {}),
  };
}

export function widgetCatalog() {
  const categories = [
    { id: 'c-media', name: 'Media', sortIndex: 0, gridWidth: 8 },
    { id: 'c-tools', name: 'Tools', sortIndex: 1, gridWidth: 8 },
  ];
  const services = [
    service('jellyfin', 'Jellyfin', 'c-media', {
      kind: 'jellyfin',
      state: 'ok',
      asOf: now(),
      fields: [count('playing', 'playing', 2), count('movies', 'movies', 1204), count('series', 'shows', 86)],
    }),
    // A plain tile between widget tiles, so a grid row mixes the two (AC-008).
    service('gitea', 'Gitea', 'c-media'),
    service('sonarr', 'Sonarr', 'c-media', {
      kind: 'sonarr',
      state: 'ok',
      asOf: now(),
      fields: [count('upcoming', 'this week', 3), count('queued', 'in queue', 1), count('missing', 'missing', 12)],
    }),
    service('radarr', 'Radarr', 'c-media', {
      kind: 'radarr',
      state: 'stale',
      asOf: ago(12),
      fields: [count('upcoming', 'this week', 1), count('queued', 'in queue', 0), count('missing', 'missing', 4)],
    }),
    service('grafana', 'Grafana', 'c-tools'),
    service('vault', 'Vault', 'c-tools'),
  ];
  return { services, categories };
}

export const INFO_ON = {
  clock: { enabled: true, hour12: false },
  weather: {
    enabled: true,
    state: 'ok',
    asOf: now(),
    place: 'Rotterdam',
    units: 'c',
    temp: 7.7,
    high: 9,
    low: 2.8,
    condition: 'cloudy',
    isDay: true,
  },
  search: { enabled: true, name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q={query}' },
};

export const INFO_OFF = {
  clock: { enabled: false, hour12: null },
  weather: { enabled: false, state: 'loading', asOf: null, place: '', units: 'c' },
  search: { enabled: false, name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q={query}' },
};

const KINDS = {
  secretKeySet: true,
  kinds: [
    {
      kind: 'jellyfin',
      label: 'Jellyfin',
      auth: 'api_key',
      match: ['jellyfin'],
      help: 'In Jellyfin: Dashboard → API Keys → +.',
      fields: [
        { key: 'playing', label: 'playing', unit: 'count', default: true },
        { key: 'movies', label: 'movies', unit: 'count', default: true },
        { key: 'series', label: 'shows', unit: 'count', default: true },
        { key: 'episodes', label: 'episodes', unit: 'count', default: false },
        { key: 'songs', label: 'songs', unit: 'count', default: false },
        { key: 'books', label: 'books', unit: 'count', default: false },
      ],
    },
    {
      kind: 'sonarr',
      label: 'Sonarr',
      auth: 'api_key',
      match: ['sonarr'],
      help: 'In Sonarr: Settings → General → API Key.',
      fields: [
        { key: 'upcoming', label: 'this week', unit: 'count', default: true },
        { key: 'queued', label: 'in queue', unit: 'count', default: true },
        { key: 'missing', label: 'missing', unit: 'count', default: true },
      ],
    },
  ],
};

export type WidgetMock = {
  // Every /api/* response body the page received, with its path.
  responses: { method: string; path: string; body: string }[];
  puts: Record<string, unknown>[];
  tests: Record<string, unknown>[];
  settings: Record<string, unknown>[];
  info: typeof INFO_ON | typeof INFO_OFF;
};

export async function mockWidgets(
  page: Page,
  opts: {
    role?: Role;
    density?: 'large' | 'compact' | 'list';
    info?: typeof INFO_ON | typeof INFO_OFF;
    showWidgets?: boolean;
    // The Jellyfin tile's saved widget, as the admin GET returns it.
    savedWidget?: boolean;
  } = {},
): Promise<WidgetMock> {
  const role = opts.role ?? 'user';
  const { services, categories } = widgetCatalog();
  let saved = opts.savedWidget
    ? {
        kind: 'jellyfin',
        address: WIDGET_ADDRESS,
        username: WIDGET_USERNAME,
        hasSecret: true,
        fields: ['playing', 'movies', 'series'],
        intervalS: 60,
        insecureTls: false,
        enabled: true,
        state: 'ok',
        error: '',
        lastOkAt: now(),
        lastCheckAt: now(),
      }
    : null;
  const state: WidgetMock = { responses: [], puts: [], tests: [], settings: [], info: opts.info ?? INFO_OFF };

  if (opts.density) {
    await page.addInitScript((d) => localStorage.setItem('homepad:tile-density', d), opts.density);
  }

  const user =
    role === 'kid'
      ? { id: 'k-maya', email: '', role: 'kid', themePref: 'light', name: 'Maya', displayName: 'Maya', densityPref: 'large', showHealthBar: false }
      : {
          id: role === 'admin' ? 'u-admin' : 'u-nani',
          email: role === 'admin' ? 'admin@example.com' : 'nani@example.com',
          role,
          themePref: 'light',
          densityPref: opts.density ?? 'compact',
          showHealthBar: true,
          showWidgets: opts.showWidgets ?? true,
        };

  const reply = (route: Route, path: string, body: unknown, status = 200) => {
    const text = body === undefined ? '' : JSON.stringify(body);
    state.responses.push({ method: route.request().method(), path, body: text });
    return route.fulfill({ status, contentType: 'application/json', body: text });
  };

  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const method = req.method();
    const widgetMatch = path.match(/^\/api\/services\/([^/]+)\/widget(\/test)?$/);

    if (path === '/api/me' && method === 'GET') return reply(route, path, user);
    if (path === '/api/me' && method === 'PATCH') return reply(route, path, { ...user, ...(req.postDataJSON() as object) });
    if (path === '/api/auth/config') return reply(route, path, { oidcEnabled: false });
    if (path === '/api/system/config') return reply(route, path, { showUptimeDisplay: true, statusDegradedMs: 1000 });
    if (path === '/api/services') {
      // Q3 (a) — a kid never receives widget data.
      const out =
        role === 'kid'
          ? services.map((s) => {
              const c: Record<string, unknown> = { ...s };
              delete c.widget;
              return c;
            })
          : services;
      return reply(route, path, { services: out });
    }
    if (path === '/api/categories') return reply(route, path, { categories });
    if (path === '/api/me/collapsed-categories') return reply(route, path, { collapsed: [] });
    if (path === '/api/widgets/info') {
      const search = role === 'admin' ? { ...state.info.search, kids: false } : state.info.search;
      return reply(route, path, { ...state.info, search });
    }
    if (path === '/api/admin/widgets/kinds') return reply(route, path, KINDS);
    if (widgetMatch && widgetMatch[2]) {
      const body = req.postDataJSON() as Record<string, unknown>;
      state.tests.push(body);
      return reply(route, path, {
        ok: true,
        version: '10.10.3',
        fields: [count('playing', 'playing', 0), count('movies', 'movies', 1204)],
      });
    }
    if (widgetMatch && method === 'GET') {
      if (widgetMatch[1] !== 'jellyfin' || !saved) return reply(route, path, undefined, 404);
      return reply(route, path, saved);
    }
    if (widgetMatch && method === 'PUT') {
      const body = req.postDataJSON() as Record<string, unknown>;
      state.puts.push(body);
      // Write-only: the reply never carries the key back.
      saved = {
        kind: String(body.kind),
        address: String(body.address ?? ''),
        username: String(body.username ?? ''),
        hasSecret: typeof body.secret === 'string' ? body.secret !== '' : !!saved?.hasSecret,
        fields: body.fields as string[],
        intervalS: Number(body.intervalS),
        insecureTls: !!body.insecureTls,
        enabled: true,
        state: 'loading',
        error: '',
        lastOkAt: null as unknown as string,
        lastCheckAt: null as unknown as string,
      };
      return reply(route, path, saved);
    }
    if (widgetMatch && method === 'DELETE') {
      saved = null;
      return reply(route, path, undefined, 204);
    }
    if (path === '/api/admin/geocode') {
      return reply(route, path, [
        { name: 'Rotterdam', region: 'South Holland', country: 'Netherlands', lat: 51.9225, lon: 4.47917 },
        { name: 'Rotterdam', region: 'New York', country: 'United States', lat: 42.8, lon: -73.97 },
      ]);
    }
    if (path === '/api/admin/settings' && method === 'PATCH') {
      const patch = req.postDataJSON() as Record<string, unknown>;
      state.settings.push(patch);
      const cur = state.info;
      const next = {
        clock: {
          enabled: (patch.clockEnabled as boolean | undefined) ?? cur.clock.enabled,
          hour12: 'clockHour12' in patch ? (patch.clockHour12 as boolean | null) : cur.clock.hour12,
        },
        weather: {
          ...INFO_ON.weather,
          enabled: (patch.weatherEnabled as boolean | undefined) ?? cur.weather.enabled,
          place: (patch.weatherPlace as string | undefined) ?? cur.weather.place,
          units: (patch.weatherUnits as 'c' | 'f' | undefined) ?? cur.weather.units,
        },
        search: {
          ...cur.search,
          enabled: (patch.webSearchEnabled as boolean | undefined) ?? cur.search.enabled,
          url: (patch.webSearchUrl as string | undefined) ?? cur.search.url,
        },
      };
      state.info = next as typeof INFO_ON;
      return reply(route, path, {
        showUptimeDisplay: true,
        statusDegradedMs: 1000,
        widgets: {
          clockEnabled: next.clock.enabled,
          clockHour12: next.clock.hour12,
          weatherEnabled: next.weather.enabled,
          weatherPlace: next.weather.place,
          weatherUnits: next.weather.units,
          webSearchEnabled: next.search.enabled,
          webSearchUrl: next.search.url,
          kidWebSearch: false,
        },
      });
    }
    if (path === '/api/admin/env-config') return reply(route, path, []);
    if (path === '/api/admin/accounts') return reply(route, path, []);
    if (path === '/api/library') return reply(route, path, { library: [] });
    if (path.startsWith('/api/services/') && method === 'PATCH') {
      const id = path.split('/')[3];
      const s = services.find((x) => x.id === id)!;
      return reply(route, path, { ...s, ...(req.postDataJSON() as object), gatus_key: '', clickAction: 'new_tab' });
    }
    return reply(route, path, {});
  });

  return state;
}
