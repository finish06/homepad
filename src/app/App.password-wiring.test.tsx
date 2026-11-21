import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { authConfig, me, type User } from '../api';

// SPEC-password-reset-link AC-020 — My settings learns from GET /api/me
// whether the account has a password, and its email for password managers.

vi.mock('../grid/AppGrid', () => ({ default: () => <div data-testid="app-grid-stub" /> }));
vi.mock('../library/SettingsPanel', () => ({
  default: (props: { scope?: string; hasPassword?: boolean; email?: string }) => (
    <div
      data-testid="settings-panel-stub"
      data-scope={props.scope ?? ''}
      data-has-password={String(props.hasPassword)}
      data-email={props.email ?? ''}
    />
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

afterEach(() => vi.clearAllMocks());

async function openMySettings(u: User) {
  vi.mocked(authConfig).mockResolvedValue({ oidcEnabled: false } as never);
  vi.mocked(me).mockResolvedValue(u);
  const user = userEvent.setup();
  render(<App />);
  await screen.findByTestId('app-grid-stub');
  await user.click(screen.getByTestId('user-menu-trigger'));
  await user.click(screen.getByTestId('menu-my-settings'));
  return screen.findByTestId('settings-panel-stub');
}

describe('App — My settings gets hasPassword (AC-020)', () => {
  it('passes hasPassword and the email', async () => {
    const panel = await openMySettings({ id: 'u1', email: 'jo@example.com', role: 'user', themePref: 'system', hasPassword: true });
    expect(panel).toHaveAttribute('data-scope', 'personal');
    expect(panel).toHaveAttribute('data-has-password', 'true');
    expect(panel).toHaveAttribute('data-email', 'jo@example.com');
  });

  it('an older API without the field reads as no password', async () => {
    const panel = await openMySettings({ id: 'u1', email: 'jo@example.com', role: 'user', themePref: 'system' });
    expect(panel).toHaveAttribute('data-has-password', 'false');
  });
});
