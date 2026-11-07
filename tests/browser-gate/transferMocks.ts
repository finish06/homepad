import { type Page, type Route } from '@playwright/test';
import { mockAdminAccounts, type AdminMock } from './kidMocks';

// SPEC-backup-import — the five admin-only transfer routes, mocked to the
// contract in docs/plans/backup-import-plan.md, on top of the admin Accounts
// mock (signed-in admin, shared catalog). Shared by tests/browser-gate and
// tests/e2e. Records every request so a spec can assert what was sent.

type Counts = {
  create: { sections: number; apps: number; icons: number; offers: number; kids: number };
  update: { sections: number; apps: number; icons: number; offers: number; people: number; settings: number };
  delete: { sections: number; apps: number; offers: number };
  unchanged: number;
  skipped: number;
};

function counts(): Counts {
  return {
    create: { sections: 0, apps: 0, icons: 0, offers: 0, kids: 0 },
    update: { sections: 0, apps: 0, icons: 0, offers: 0, people: 0, settings: 0 },
    delete: { sections: 0, apps: 0, offers: 0 },
    unchanged: 0,
    skipped: 0,
  };
}

export const BACKUP_FILE = JSON.stringify(
  {
    format: 'homepad-backup',
    schemaVersion: 1,
    exportedAt: '2026-11-07T18:04:11Z',
    homepadVersion: '17.1.0',
    includesPeople: true,
    settings: { showUptimeDisplay: true, statusDegradedMs: 1500 },
    sections: [{ name: 'Media', gridWidth: 6 }],
    apps: [
      {
        slug: 'jellyfin',
        name: 'Jellyfin',
        description: 'Movies and TV',
        url: 'https://jellyfin.home.arpa',
        icon: '',
        section: 'Media',
        clickAction: 'new_tab',
        gatusKey: null,
        uploadedIcons: {},
      },
    ],
    library: [],
    people: { adults: [], kids: [{ name: 'Sam', avatarColor: 'green', prefs: { theme: 'light', density: 'large', showHealthBar: false, showUptimeDisplay: true }, allowedApps: ['jellyfin'], favorites: [] }] },
  },
  null,
  2,
);

export function restorePlan(mode: 'merge' | 'replace') {
  const summary = counts();
  const items: unknown[] = [];
  if (mode === 'replace') {
    summary.delete.apps = 12;
    summary.delete.sections = 4;
    items.push({ kind: 'app', name: 'Plex', section: 'Media', action: 'delete' });
    items.push({ kind: 'section', name: 'Photos', action: 'delete' });
  }
  summary.create.apps = 1;
  summary.create.kids = 1;
  summary.unchanged = mode === 'merge' ? 1 : 0;
  if (mode === 'replace') summary.create.sections = 1;
  items.push(
    mode === 'merge'
      ? { kind: 'section', name: 'Media', action: 'unchanged' }
      : { kind: 'section', name: 'Media', action: 'create' },
    { kind: 'app', name: 'Jellyfin', section: 'Media', action: 'create' },
    { kind: 'kid', name: 'Sam', action: 'create', warnings: ['kid_needs_device'] },
  );
  return {
    planHash: `hash-${mode}`,
    mode,
    summary,
    items,
    warnings: [],
    ignored: { fields: 0, settings: [], dropped: [] },
    otherAccounts: 3,
  };
}

export const SERVICES_YAML = `- Media:
    - Sonarr:
        icon: sonarr.png
        href: http://sonarr.home.arpa/
        description: Series
        siteMonitor: http://sonarr.home.arpa/
        widget: { type: sonarr, url: http://sonarr.home.arpa, key: abc123 }
    - Plex:
        icon: mdi-plex
        href: http://plex.home.arpa/
- Infra:
    - Router:
        href: http://192.0.2.1
        ping: 192.0.2.1
        target: _self
    - Core:
        - Proxmox:
            icon: https://example.com/proxmox.png
            href: https://pve.home.arpa:8006
`;

export function importPlan() {
  const summary = counts();
  summary.create.sections = 3;
  summary.create.apps = 4;
  return {
    planHash: 'hash-import',
    mode: 'import',
    summary,
    items: [
      { kind: 'section', name: 'Media', action: 'create' },
      { kind: 'section', name: 'Infra', action: 'create' },
      { kind: 'section', name: 'Infra / Core', action: 'create' },
      // Icons are left empty so the preview renders initials badges (no network).
      { kind: 'app', name: 'Sonarr', section: 'Media', action: 'create', warnings: ['widget_dropped'] },
      { kind: 'app', name: 'Plex', section: 'Media', action: 'create', warnings: ['icon_glyph'], detail: 'mdi-plex' },
      { kind: 'app', name: 'Router', section: 'Infra', action: 'create' },
      { kind: 'app', name: 'Proxmox', section: 'Infra / Core', action: 'create' },
    ],
    warnings: [],
    ignored: { fields: 1, settings: [], dropped: ['widgets'] },
    gatusSnippet:
      'endpoints:\n  - name: Sonarr\n    group: Media\n    url: "http://sonarr.home.arpa/"\n    interval: 60s\n    conditions:\n      - "[STATUS] < 400"\n  - name: Router\n    group: Infra\n    url: "icmp://192.0.2.1"\n    interval: 60s\n    conditions:\n      - "[CONNECTED] == true"\n',
    otherAccounts: 3,
  };
}

export type TransferMock = AdminMock & {
  exports: string[];
  restores: { path: string; body: string }[];
  imports: { path: string; body: unknown }[];
};

function result(plan: Record<string, unknown>) {
  const { planHash: _h, ...rest } = plan;
  void _h;
  return { ...rest, applied: true };
}

export async function mockTransfer(page: Page, opts: { importError?: Record<string, unknown> } = {}): Promise<TransferMock> {
  const admin = await mockAdminAccounts(page);
  const state = admin as TransferMock;
  state.exports = [];
  state.restores = [];
  state.imports = [];
  // Registered after the admin mock, so these win (Playwright routes are LIFO).
  await page.route('**/api/admin/**', async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    if (path === '/api/admin/export') {
      state.exports.push(url.search);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Content-Disposition': 'attachment; filename="homepad-backup-2026-11-07.json"', 'Cache-Control': 'no-store' },
        body: BACKUP_FILE,
      });
    }
    if (path.startsWith('/api/admin/restore')) {
      state.restores.push({ path: path + url.search, body: req.postData() ?? '' });
      const mode = (url.searchParams.get('mode') ?? 'merge') as 'merge' | 'replace';
      const plan = restorePlan(mode);
      return route.fulfill({ json: path.endsWith('/preview') ? plan : result(plan) });
    }
    if (path.startsWith('/api/admin/import/homepage')) {
      state.imports.push({ path: path + url.search, body: req.postDataJSON() });
      if (opts.importError && path.endsWith('/preview')) {
        return route.fulfill({ status: Number(opts.importError.status ?? 422), json: opts.importError });
      }
      const plan = importPlan();
      return route.fulfill({ json: path.endsWith('/preview') ? plan : result(plan) });
    }
    return route.fallback();
  });
  return state;
}
