import type { Plan, PlanItem } from '../api';

// SPEC-backup-import — Plan fixtures shaped exactly like homepad-api's wire
// contract (docs/plans/backup-import-plan.md, "API contract"). Shared by the
// unit suites; the browser gate and e2e have their own copies in
// tests/browser-gate/transferMocks.ts because Playwright specs don't import src/.

const zero = () => ({
  create: { sections: 0, apps: 0, icons: 0, offers: 0, kids: 0 },
  update: { sections: 0, apps: 0, icons: 0, offers: 0, people: 0, settings: 0 },
  delete: { sections: 0, apps: 0, offers: 0 },
  unchanged: 0,
  skipped: 0,
});

export function emptyPlan(mode: Plan['mode'], over: Partial<Plan> = {}): Plan {
  return {
    planHash: 'hash-empty',
    mode,
    summary: zero(),
    items: [],
    warnings: [],
    ignored: { fields: 0, settings: [], dropped: [] },
    otherAccounts: 0,
    ...over,
  };
}

const app = (name: string, section: string | null, action: PlanItem['action'], extra: Partial<PlanItem> = {}): PlanItem => ({
  kind: 'app',
  name,
  section,
  action,
  ...extra,
});

// UX §3.2 — Merge with adds, updates, a skipped person, a new kid, one unchanged.
export function mergePlan(over: Partial<Plan> = {}): Plan {
  const s = zero();
  s.create.sections = 2;
  s.create.apps = 2;
  s.create.icons = 1;
  s.create.kids = 1;
  s.update.apps = 1;
  s.update.people = 1;
  s.unchanged = 1;
  s.skipped = 1;
  return {
    ...emptyPlan('merge'),
    planHash: 'hash-merge-1',
    summary: s,
    items: [
      { kind: 'section', name: 'Media', action: 'create' },
      { kind: 'section', name: 'Network', action: 'create' },
      app('Jellyfin', 'Media', 'create'),
      app('Router', 'Network', 'create'),
      app('Grafana', 'Infra', 'update', { fields: ['name', 'icon'] }),
      app('Sonarr', 'Media', 'unchanged'),
      { kind: 'icon', name: 'Jellyfin', variant: 'dark', action: 'create' },
      { kind: 'adult', name: 'alex@example.com', action: 'update', fields: ['favorites', 'order'] },
      { kind: 'kid', name: 'Maya', action: 'create', warnings: ['kid_needs_device'] },
      { kind: 'adult', name: 'sam@example.com', action: 'skip', reason: 'adult_no_account' },
    ],
    warnings: [{ code: 'unknown_fields', count: 3 }],
    ...over,
  };
}

// UX §3.3 — Replace: everything current is deleted, the file is loaded.
export function replacePlan(over: Partial<Plan> = {}): Plan {
  const s = zero();
  s.delete.apps = 1;
  s.delete.sections = 1;
  s.create.sections = 1;
  s.create.apps = 1;
  return {
    ...emptyPlan('replace'),
    planHash: 'hash-replace-1',
    summary: s,
    items: [
      { kind: 'app', name: 'Old thing', section: 'Infra', action: 'delete' },
      { kind: 'section', name: 'Infra', action: 'delete' },
      { kind: 'section', name: 'Media', action: 'create' },
      app('Jellyfin', 'Media', 'create'),
    ],
    ...over,
  };
}

// TC-008 — the spec's happy-path Homepage import.
export function importPlan(over: Partial<Plan> = {}): Plan {
  const s = zero();
  s.create.sections = 3;
  s.create.apps = 4;
  s.unchanged = 1;
  s.skipped = 1;
  return {
    ...emptyPlan('import'),
    planHash: 'hash-import-1',
    summary: s,
    items: [
      { kind: 'section', name: 'Media', action: 'create' },
      { kind: 'section', name: 'Infra', action: 'create' },
      { kind: 'section', name: 'Infra / Core', action: 'create' },
      app('Sonarr', 'Media', 'create', {
        icon: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/sonarr.png',
        warnings: ['widget_dropped'],
      }),
      app('Plex', 'Media', 'create', { warnings: ['icon_glyph'], detail: 'mdi-plex' }),
      app('Jellyfin', 'Media', 'unchanged', { reason: 'already_here' }),
      app('Router', 'Infra', 'create'),
      app('Proxmox', 'Infra / Core', 'create', { icon: 'https://example.com/proxmox.png' }),
      app('Grafana', 'Infra', 'skip', { reason: 'href_uses_variable' }),
    ],
    ignored: { fields: 5, settings: ['title', 'theme'], dropped: ['widgets', 'docker'] },
    gatusSnippet:
      'endpoints:\n  - name: Sonarr\n    group: Media\n    url: "http://sonarr.home.arpa/"\n    interval: 60s\n    conditions:\n      - "[STATUS] < 400"\n  - name: Router\n    group: Infra\n    url: "icmp://192.0.2.1"\n    interval: 60s\n    conditions:\n      - "[CONNECTED] == true"\n',
    otherAccounts: 2,
    ...over,
  };
}

// TC-009 — the same import after Gatus learned the keys: nothing new, two
// existing apps get their status key.
export function statusOnlyPlan(over: Partial<Plan> = {}): Plan {
  const s = zero();
  s.update.apps = 2;
  s.unchanged = 2;
  return {
    ...emptyPlan('import'),
    planHash: 'hash-import-2',
    summary: s,
    items: [
      app('Sonarr', 'Media', 'update', { reason: 'already_here', warnings: ['status_on'], fields: ['gatusKey'] }),
      app('Router', 'Infra', 'update', { reason: 'already_here', warnings: ['status_on'], fields: ['gatusKey'] }),
      app('Plex', 'Media', 'unchanged', { reason: 'already_here' }),
      app('Proxmox', 'Infra / Core', 'unchanged', { reason: 'already_here' }),
    ],
    ...over,
  };
}

export const asResult = (p: Plan): Plan => {
  const { planHash: _ignored, ...rest } = p;
  void _ignored;
  return { ...rest, applied: true } as Plan;
};
