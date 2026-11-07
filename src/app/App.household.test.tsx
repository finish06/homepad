import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import App from './App';
import { acceptInvite, authConfig, logout, lookupInvite, me, type User } from '../api';

// SPEC-household-basics AC-020 (plan TASK-203/207) and AC-033 (TASK-209) — the
// App wiring: an `/#invite=…` link opens the Join screen in place of the
// sign-in card, and the token leaves the address bar as soon as it is read;
// the kid shell's ServicesProvider polls at KID_POLL_MS, everyone else at the
// default.

vi.mock('../grid/AppGrid', () => ({ default: () => <div data-testid="app-grid-stub" /> }));
vi.mock('../library/SettingsPanel', () => ({ default: () => null }));

const providerProps: Array<{ pollMs?: number }> = [];
vi.mock('../services', async (importOriginal) => {
  const real = await importOriginal<typeof import('../services')>();
  return {
    ...real,
    ServicesProvider: (props: { children: ReactNode; pollMs?: number }) => {
      providerProps.push({ pollMs: props.pollMs });
      return <real.ServicesProvider {...props} />;
    },
  };
});

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

const ALEX: User = { id: 'u-alex', email: 'alex@example.com', role: 'user', themePref: 'system', name: 'Alex' };
const CALEB: User = { id: 'u-caleb', email: 'caleb@home.lan', role: 'admin', themePref: 'system', name: 'Caleb' };
const KID: User = { id: 'k-sam', email: '', role: 'kid', themePref: 'system', name: 'Sam', displayName: 'Sam' };

beforeEach(() => {
  providerProps.length = 0;
  vi.mocked(me).mockResolvedValue(null);
  vi.mocked(authConfig).mockResolvedValue({ oidcEnabled: false, registration: 'invite_only', setupNeeded: false });
  vi.mocked(lookupInvite).mockResolvedValue({
    ok: true,
    status: 200,
    invite: { name: 'Alex', role: 'user', inviterName: 'Caleb', expiresAt: '2026-11-14T12:00:00Z' },
  });
  vi.mocked(logout).mockResolvedValue();
});

afterEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('invite link (AC-020)', () => {
  it('opens the Join screen and removes the token from the address bar', async () => {
    window.history.replaceState(null, '', '/#invite=tok-abc');
    render(<App />);
    expect(await screen.findByText('Caleb invited you.')).toBeInTheDocument();
    expect(window.location.hash).toBe('');
    expect(window.location.href).not.toContain('tok-abc');
    expect(lookupInvite).toHaveBeenCalledWith('tok-abc');
    expect(screen.queryByText('Sign in to your dashboard')).not.toBeInTheDocument();
  });

  it('keeps the path and query when it strips the fragment', async () => {
    window.history.replaceState(null, '', '/?from=chat#invite=tok-abc');
    render(<App />);
    await screen.findByText('Caleb invited you.');
    expect(window.location.pathname + window.location.search + window.location.hash).toBe('/?from=chat');
  });

  it('Join signs the new adult in and lands on their dashboard', async () => {
    window.history.replaceState(null, '', '/#invite=tok-abc');
    vi.mocked(acceptInvite).mockResolvedValue({ ok: true, status: 201, user: ALEX });
    render(<App />);
    await screen.findByText('Caleb invited you.');
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Email'), ALEX.email);
    await user.type(screen.getByLabelText('Password'), 'longenough');
    await user.click(screen.getByRole('button', { name: 'Join' }));
    expect(await screen.findByTestId('app-grid-stub')).toBeInTheDocument();
  });

  it('a dead link offers Go to sign in, which shows the sign-in card', async () => {
    window.history.replaceState(null, '', '/#invite=dead');
    vi.mocked(lookupInvite).mockResolvedValue({ ok: false, status: 404, error: 'invite not found' });
    render(<App />);
    expect(await screen.findByText("This invite link doesn't work anymore.")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Go to sign in' }));
    expect(await screen.findByText('Sign in to your dashboard')).toBeInTheDocument();
  });

  it('already signed in: Keep me here goes to the dashboard', async () => {
    window.history.replaceState(null, '', '/#invite=tok-abc');
    vi.mocked(me).mockResolvedValue(CALEB);
    render(<App />);
    expect(await screen.findByText("You're signed in as Caleb. Sign out to use this invite.")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Keep me here' }));
    expect(await screen.findByTestId('app-grid-stub')).toBeInTheDocument();
    expect(logout).not.toHaveBeenCalled();
  });

  it('already signed in: Sign out and continue shows the live form', async () => {
    window.history.replaceState(null, '', '/#invite=tok-abc');
    vi.mocked(me).mockResolvedValue(CALEB);
    render(<App />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Sign out and continue' }));
    expect(await screen.findByText('Caleb invited you.')).toBeInTheDocument();
    expect(logout).toHaveBeenCalled();
    expect(screen.queryByTestId('app-grid-stub')).not.toBeInTheDocument();
  });

  it('ignores other fragments', async () => {
    window.history.replaceState(null, '', '/#settings');
    render(<App />);
    expect(await screen.findByText('Sign in to your dashboard')).toBeInTheDocument();
    expect(window.location.hash).toBe('#settings');
    expect(lookupInvite).not.toHaveBeenCalled();
  });
});

describe('poll interval wiring (AC-033)', () => {
  it('the kid shell polls at KID_POLL_MS (20s)', async () => {
    vi.mocked(me).mockResolvedValue(KID);
    render(<App />);
    await waitFor(() => expect(providerProps.length).toBeGreaterThan(0));
    expect(providerProps.at(-1)?.pollMs).toBe(20_000);
  });

  it('adults keep the default interval', async () => {
    vi.mocked(me).mockResolvedValue(ALEX);
    render(<App />);
    await waitFor(() => expect(providerProps.length).toBeGreaterThan(0));
    expect(providerProps.at(-1)?.pollMs).toBeUndefined();
  });
});
