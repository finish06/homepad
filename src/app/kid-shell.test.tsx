import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import App from './App';
import * as api from '../api';
import type { Category, Service, User } from '../api';

// SPEC-kid-accounts §8 / UX §5 (TASK-405) — the kid shell. The existing
// dashboard, gated on role === 'kid' (not on missing data): no edit mode, no
// Library, no Add, no tile edit, no admin entries; a menu with the kid's name,
// Appearance and Sign out (K-2); large tiles (K-3); the health bar off
// (OQ-3); an empty state a child can read; ⌘K over the served list only; and a
// 401 that lands on the normal login screen (AC-012).
//
// The REAL AppGrid renders here, so a tile affordance that would 403 shows up.
// Every api function is a spy; anything outside ALLOWED must never be called
// for a kid, because the server answers those with 403 (server.go route
// classes) and a kid "should never see admin affordances or get a 403".

vi.mock('../api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api')>();
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(real)) out[k] = typeof v === 'function' ? vi.fn() : v;
  return out;
});

expect.extend(toHaveNoViolations);

// What a kid session may call: reads the server filters for it, its favorites,
// its theme, and signing out.
const ALLOWED = new Set([
  'me',
  'authConfig',
  'systemConfig',
  'categories',
  'services',
  'servicesWithStatus',
  'setFavorite',
  'setThemePref',
  'logout',
  'login',
]);

const KID: User = {
  id: 'k-maya',
  email: '',
  role: 'kid',
  themePref: 'light',
  name: 'Maya',
  displayName: 'Maya',
  avatarColor: 'teal',
  densityPref: 'large',
  showHealthBar: false,
  showUptimeDisplay: true,
};

const ADULT: User = { id: 'u1', email: 'nani@ohana.io', role: 'user', themePref: 'light' };

function svc(id: string, name: string, categoryId: string): Service {
  return {
    id, slug: id, name, description: '', url: `https://${id}.test`, icon: '', status: 'UP',
    favorite: false, iconLight: false, iconDark: false, categoryId, categoryName: null,
  };
}
const SERVED: Service[] = [svc('plex', 'Plex', 'c-media'), svc('jellyfin', 'Jellyfin', 'c-media'), svc('immich', 'Immich', 'c-photos')];
const CATS: Category[] = [
  { id: 'c-media', name: 'Media', sortIndex: 0 },
  { id: 'c-photos', name: 'Photos', sortIndex: 1 },
];

function serve(user: User, items: Service[] = SERVED, cats: Category[] = CATS, status = 200) {
  vi.mocked(api.me).mockResolvedValue(user);
  vi.mocked(api.authConfig).mockResolvedValue({ oidcEnabled: false });
  vi.mocked(api.systemConfig).mockResolvedValue({ showUptimeDisplay: true, statusDegradedMs: 1000 });
  vi.mocked(api.categories).mockResolvedValue(cats);
  vi.mocked(api.services).mockResolvedValue(items);
  vi.mocked(api.servicesWithStatus).mockResolvedValue({ status, services: status === 200 ? items : [] });
  vi.mocked(api.setFavorite).mockResolvedValue(true);
  vi.mocked(api.setThemePref).mockResolvedValue(true);
  vi.mocked(api.logout).mockResolvedValue(undefined);
}

function forbiddenCalls(): string[] {
  return Object.entries(api)
    .filter(([k, v]) => !ALLOWED.has(k) && vi.isMockFunction(v) && v.mock.calls.length > 0)
    .map(([k]) => k);
}

async function bootKid(user: User = KID, items: Service[] = SERVED) {
  serve(user, items);
  render(<App />);
  if (items.length > 0) await screen.findAllByTestId('tool-link');
  else await screen.findByTestId('kid-empty');
}

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.clearAllMocks();
});

describe('Kid shell — what is removed (AC-008)', () => {
  it('no Gear (edit mode, Add apps, Add custom app), no alert bell, no freshness label', async () => {
    await bootKid();
    expect(screen.queryByTestId('settings-gear')).toBeNull();
    expect(screen.queryByTestId('alert-bell')).toBeNull();
    expect(screen.queryByTestId('status-last-updated')).toBeNull();
    expect(screen.getByTestId('launcher-trigger')).toBeInTheDocument();
  });

  it('no tile edit, no box editing, no "Add box", no edit banner', async () => {
    await bootKid();
    expect(screen.queryByTestId('tile-edit')).toBeNull();
    expect(screen.queryByTestId('add-box')).toBeNull();
    expect(screen.queryByTestId('width-selector')).toBeNull();
    expect(screen.queryByTestId('box-rename')).toBeNull();
    expect(screen.queryByTestId('edit-mode-banner')).toBeNull();
  });

  it('the tiles are the served list, grouped by section', async () => {
    await bootKid();
    const boxes = screen.getAllByTestId('app-grid-box');
    expect(boxes.map((b) => within(b).getByTestId('box-title').textContent)).toEqual(['Media', 'Photos']);
    expect(screen.getAllByTestId('tool-link').map((a) => a.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining('Plex'), expect.stringContaining('Immich')]),
    );
  });

  it('calls nothing a kid session is refused (no 403 can surface)', async () => {
    const u = userEvent.setup();
    await bootKid();
    await u.click(screen.getByTestId('user-menu-trigger'));
    await u.click(screen.getByTestId('user-menu-trigger'));
    await u.click(screen.getByTestId('kid-favorites-toggle'));
    await u.click(screen.getAllByTestId('tile-favorite')[0]);
    expect(forbiddenCalls()).toEqual([]);
  });
});

describe('Kid shell — the user menu (K-2)', () => {
  it('the trigger shows the kid’s color dot and name', async () => {
    await bootKid();
    const trigger = screen.getByTestId('user-menu-trigger');
    expect(trigger).toHaveTextContent('Maya');
    expect(within(trigger).getByTestId('kid-dot')).toHaveAttribute('data-color', 'teal');
  });

  it('Sign out returns to the normal login screen', async () => {
    const u = userEvent.setup();
    await bootKid();
    await u.click(screen.getByTestId('user-menu-trigger'));
    await u.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    expect(await screen.findByText('Sign in to your dashboard')).toBeInTheDocument();
    expect(api.logout).toHaveBeenCalledTimes(1);
  });
});

describe('Kid shell — favorites (D3, TC-006)', () => {
  it('a "Pick favorites" toggle reveals the ★, which writes only the favorite', async () => {
    const u = userEvent.setup();
    await bootKid();
    expect(screen.queryByTestId('tile-favorite')).toBeNull();
    const toggle = screen.getByRole('button', { name: 'Pick favorites' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await u.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await u.click(screen.getByRole('button', { name: 'Pin Plex to favorites' }));
    await waitFor(() => expect(api.setFavorite).toHaveBeenCalledWith('plex', true));
    // Still no shared-catalog affordance in the mode.
    expect(screen.queryByTestId('tile-edit')).toBeNull();
    expect(screen.queryByTestId('tile-drag-handle')).toBeNull();
    await u.click(toggle);
    expect(screen.queryByTestId('tile-favorite')).toBeNull();
  });
});

describe('Kid shell — tiles and health (K-3, OQ-3, AC-019)', () => {
  it('tiles are large whatever the device cache says, and density is never written', async () => {
    localStorage.setItem('homepad:tile-density', 'list');
    await bootKid({ ...KID, densityPref: 'compact' });
    expect(screen.getByTestId('app-grid')).toHaveAttribute('data-density', 'large');
    expect(api.setDensityPref).not.toHaveBeenCalled();
  });

  it('the health panel is off for a kid created with the bar off', async () => {
    await bootKid();
    expect(screen.queryByTestId('status-bar')).toBeNull();
  });

  it('when a kid’s bar is on it counts only the served apps, and offers no re-poll', async () => {
    await bootKid({ ...KID, showHealthBar: true });
    expect(screen.getByTestId('health-subline')).toHaveTextContent(/^3 services across/);
    expect(screen.queryByTestId('health-retry')).toBeNull();
  });
});

describe('Kid shell — empty state (UX §5)', () => {
  it('zero apps: "No apps yet. Ask a grown-up to add some." and nothing to act on', async () => {
    await bootKid(KID, []);
    const empty = screen.getByTestId('kid-empty');
    expect(empty).toHaveTextContent('No apps yet. Ask a grown-up to add some.');
    expect(within(empty).queryByRole('button')).toBeNull();
    expect(screen.queryByText(/add your first service/i)).toBeNull();
    expect(screen.queryByTestId('app-grid')).toBeNull();
  });
});

describe('Kid shell — ⌘K (AC-016)', () => {
  it('the launcher lists exactly the served apps', async () => {
    // jsdom has no scrollIntoView; the launcher scrolls its active row.
    Element.prototype.scrollIntoView = vi.fn();
    const u = userEvent.setup();
    await bootKid();
    await u.click(screen.getByTestId('launcher-trigger'));
    const results = await screen.findByTestId('launcher-results');
    const names = within(results)
      .getAllByRole('option')
      .map((o) => o.textContent ?? '');
    expect(names).toHaveLength(3);
    for (const n of ['Plex', 'Jellyfin', 'Immich']) expect(names.some((t) => t.includes(n))).toBe(true);
  });
});

describe('Kid shell — a signed-out device (AC-012, TC-005)', () => {
  it('a 401 from the poll lands on the normal login screen', async () => {
    serve(KID, SERVED, CATS, 401);
    render(<App />);
    expect(await screen.findByText('Sign in to your dashboard')).toBeInTheDocument();
    expect(screen.queryByText(/removed/i)).toBeNull();
  });

  it('an adult’s 401 keeps today’s behaviour: polling stops quietly (AC-018)', async () => {
    serve(ADULT, SERVED, CATS, 401);
    render(<App />);
    await waitFor(() => expect(api.servicesWithStatus).toHaveBeenCalled());
    expect(await screen.findByTestId('user-menu-trigger')).toBeInTheDocument();
    expect(screen.queryByText('Sign in to your dashboard')).toBeNull();
  });
});

describe('Kid shell — accessibility', () => {
  it('the kid header and open menu have no axe violations', async () => {
    const u = userEvent.setup();
    await bootKid();
    await u.click(screen.getByTestId('user-menu-trigger'));
    const results = await axe(document.querySelector('header')!, {
      // Pre-existing: ThemeControl's role="group" inside role="menu" (see UserMenu.test).
      rules: { 'aria-required-children': { enabled: false } },
    });
    expect(results).toHaveNoViolations();
  });
});

describe('AC-018 — adults see no change', () => {
  it('an adult still gets the Gear, the bell and the health panel', async () => {
    serve(ADULT);
    render(<App />);
    await screen.findAllByTestId('tool-link');
    expect(screen.getByTestId('settings-gear')).toBeInTheDocument();
    expect(screen.getByTestId('alert-bell')).toBeInTheDocument();
    expect(screen.getByTestId('status-bar')).toBeInTheDocument();
    expect(screen.queryByTestId('kid-favorites-toggle')).toBeNull();
  });
});

describe('Kid shell — the admin changes the list remotely (AC-002, TC-003)', () => {
  it('the next poll shows the new app and drops the removed one, without a reload', async () => {
    await bootKid();
    expect(screen.getByText('Immich')).toBeInTheDocument();
    // The admin unticks Immich and ticks Navidrome, in a section the kid had none of.
    const next = [SERVED[0], SERVED[1], svc('navidrome', 'Navidrome', 'c-music')];
    vi.mocked(api.servicesWithStatus).mockResolvedValue({ status: 200, services: next });
    vi.mocked(api.categories).mockResolvedValue([CATS[0], { id: 'c-music', name: 'Music', sortIndex: 2 }]);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(await screen.findByText('Navidrome')).toBeInTheDocument();
    expect(screen.queryByText('Immich')).toBeNull();
    expect(screen.getAllByTestId('box-title').map((b) => b.textContent)).toEqual(['Media', 'Music']);
  });
});
