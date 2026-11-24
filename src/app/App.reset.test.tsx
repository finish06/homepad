import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { authConfig, logout, lookupInvite, me, type User } from '../api';
import { acceptReset, lookupReset } from '../passwordApi';

// SPEC-password-reset-link AC-019, TC-001 — the App wiring: an `/#reset=…`
// link opens the reset screen in place of the sign-in card, and the token
// leaves the address bar as soon as it is read. The invite link keeps working.

vi.mock('../grid/AppGrid', () => ({ default: () => <div data-testid="app-grid-stub" /> }));
vi.mock('../library/SettingsPanel', () => ({ default: () => null }));

vi.mock('../api', () => ({
  authConfig: vi.fn(),
  systemConfig: vi.fn(() => Promise.resolve({ showUptimeDisplay: true, statusDegradedMs: 1000 })),
  saveSystemSettings: vi.fn(),
  me: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  setThemePref: vi.fn(() => Promise.resolve(true)),
  categories: vi.fn(() => Promise.resolve([])),
  services: vi.fn(() => Promise.resolve([])),
  servicesWithStatus: vi.fn(() => Promise.resolve({ status: 200, services: [] })),
  refreshStatus: vi.fn(),
  lookupInvite: vi.fn(),
  acceptInvite: vi.fn(),
}));
vi.mock('../passwordApi', () => ({ lookupReset: vi.fn(), acceptReset: vi.fn() }));

const JO: User = { id: 'u-jo', email: 'jo@example.com', role: 'member', themePref: 'system', name: 'Jo', hasPassword: true };

beforeEach(() => {
  vi.mocked(me).mockResolvedValue(null);
  vi.mocked(authConfig).mockResolvedValue({ oidcEnabled: false, registration: 'invite_only', setupNeeded: false });
  vi.mocked(lookupReset).mockResolvedValue({
    ok: true,
    status: 200,
    info: { email: 'jo@example.com', name: 'Jo', expiresAt: '2026-11-21T21:40:00Z' },
  });
  vi.mocked(lookupInvite).mockResolvedValue({
    ok: true,
    status: 200,
    invite: { name: 'Alex', role: 'member', inviterName: 'Caleb', expiresAt: '2026-11-14T12:00:00Z' },
  });
  vi.mocked(logout).mockResolvedValue();
});

afterEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('reset link (AC-019)', () => {
  it('opens the reset screen and removes the token from the address bar', async () => {
    window.history.replaceState(null, '', '/#reset=tok-abc');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Set a new password for jo@example.com.' })).toBeInTheDocument();
    expect(window.location.hash).toBe('');
    expect(window.location.href).not.toContain('tok-abc');
    expect(lookupReset).toHaveBeenCalledWith('tok-abc');
    expect(lookupInvite).not.toHaveBeenCalled();
    expect(screen.queryByText('Sign in to your dashboard')).not.toBeInTheDocument();
  });

  it('keeps the path and query when it strips the fragment', async () => {
    window.history.replaceState(null, '', '/?from=chat#reset=tok-abc');
    render(<App />);
    await screen.findByLabelText('New password');
    expect(window.location.pathname + window.location.search + window.location.hash).toBe('/?from=chat');
  });

  it('decodes the token', async () => {
    window.history.replaceState(null, '', `/#reset=${encodeURIComponent('a/b+c')}`);
    render(<App />);
    await screen.findByLabelText('New password');
    expect(lookupReset).toHaveBeenCalledWith('a/b+c');
  });

  it('Save password signs in and lands on the dashboard (TC-001)', async () => {
    window.history.replaceState(null, '', '/#reset=tok-abc');
    vi.mocked(acceptReset).mockResolvedValue({ ok: true, status: 200, user: JO });
    render(<App />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('New password'), 'a new password');
    await user.type(screen.getByLabelText('Type it again'), 'a new password');
    await user.click(screen.getByRole('button', { name: 'Save password' }));
    expect(await screen.findByTestId('app-grid-stub')).toBeInTheDocument();
    expect(acceptReset).toHaveBeenCalledWith('tok-abc', 'a new password');
  });

  it('a dead link offers Go to sign in, which shows the sign-in card', async () => {
    window.history.replaceState(null, '', '/#reset=dead');
    vi.mocked(lookupReset).mockResolvedValue({ ok: false, status: 404, error: 'reset link not found' });
    render(<App />);
    expect(await screen.findByText("This reset link doesn't work anymore.")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Go to sign in' }));
    expect(await screen.findByText('Sign in to your dashboard')).toBeInTheDocument();
  });

  it('signed in as someone else: Keep me here goes to the dashboard', async () => {
    window.history.replaceState(null, '', '/#reset=tok-abc');
    vi.mocked(me).mockResolvedValue({ ...JO, id: 'u-caleb', email: 'caleb@home.lan', name: 'Caleb', role: 'admin' });
    render(<App />);
    expect(await screen.findByText("You're signed in as Caleb. Sign out to use this reset link.")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Keep me here' }));
    expect(await screen.findByTestId('app-grid-stub')).toBeInTheDocument();
  });

  it('signed in as someone else: Sign out and continue shows the form', async () => {
    window.history.replaceState(null, '', '/#reset=tok-abc');
    vi.mocked(me).mockResolvedValue({ ...JO, id: 'u-caleb', email: 'caleb@home.lan', name: 'Caleb', role: 'admin' });
    render(<App />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Sign out and continue' }));
    expect(await screen.findByLabelText('New password')).toBeInTheDocument();
    expect(logout).toHaveBeenCalled();
  });

  it('an invite link still opens the Join screen', async () => {
    window.history.replaceState(null, '', '/#invite=tok-abc');
    render(<App />);
    expect(await screen.findByText('Caleb invited you.')).toBeInTheDocument();
    expect(lookupReset).not.toHaveBeenCalled();
  });

  it('a malformed escape in the token is ignored', async () => {
    window.history.replaceState(null, '', '/#reset=%E0%A4%A');
    render(<App />);
    expect(await screen.findByText('Sign in to your dashboard')).toBeInTheDocument();
    expect(lookupReset).not.toHaveBeenCalled();
  });
});
