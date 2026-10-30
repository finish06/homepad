import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { authConfig, me, type User } from '../api';

// SPEC-kid-accounts UX §1 (TASK-402) — the admin menu's "Accounts" item opens the
// Admin Panel scrolled to its Accounts section; "Admin settings" still opens it
// at the top. The panel learns who "you" is from the signed-in user.

vi.mock('../grid/AppGrid', () => ({ default: () => <div data-testid="app-grid-stub" /> }));
vi.mock('../library/SettingsPanel', () => ({
  default: (props: { scope?: string; initialSection?: string; currentUserId?: string; onClose: () => void }) => (
    <div
      data-testid="settings-panel-stub"
      data-scope={props.scope ?? ''}
      data-initial={props.initialSection ?? ''}
      data-current={props.currentUserId ?? ''}
    >
      <button data-testid="settings-panel-close" onClick={props.onClose}>close</button>
    </div>
  ),
}));
vi.mock('../api', () => ({
  authConfig: vi.fn(),
  systemConfig: vi.fn(() => Promise.resolve({ showUptimeDisplay: true })),
  saveSystemSettings: vi.fn(),
  me: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  setThemePref: vi.fn(),
  categories: vi.fn(() => Promise.resolve([])),
  services: vi.fn(() => Promise.resolve([])),
  servicesWithStatus: vi.fn(() => Promise.resolve({ status: 200, services: [] })),
}));

const ADMIN: User = { id: 'a1', email: 'lilo@ohana.io', role: 'admin', themePref: 'system' };

beforeEach(() => {
  vi.mocked(authConfig).mockResolvedValue({ oidcEnabled: false } as never);
  vi.mocked(me).mockResolvedValue(ADMIN as never);
});
afterEach(() => vi.clearAllMocks());

describe('App — the Accounts menu item', () => {
  it('opens the Admin Panel scrolled to Accounts, for the signed-in admin', async () => {
    const u = userEvent.setup();
    render(<App />);
    await screen.findByTestId('app-grid-stub');
    await u.click(screen.getByTestId('user-menu-trigger'));
    await u.click(screen.getByTestId('menu-accounts'));
    const panel = await screen.findByTestId('settings-panel-stub');
    expect(panel).toHaveAttribute('data-scope', 'admin');
    expect(panel).toHaveAttribute('data-initial', 'accounts');
    expect(panel).toHaveAttribute('data-current', 'a1');
  });

  it('"Admin settings" still opens the panel at the top', async () => {
    const u = userEvent.setup();
    render(<App />);
    await screen.findByTestId('app-grid-stub');
    await u.click(screen.getByTestId('user-menu-trigger'));
    await u.click(screen.getByTestId('menu-accounts'));
    await u.click(await screen.findByTestId('settings-panel-close'));
    await u.click(screen.getByTestId('user-menu-trigger'));
    await u.click(screen.getByTestId('menu-admin-settings'));
    expect(await screen.findByTestId('settings-panel-stub')).toHaveAttribute('data-initial', '');
  });
});
