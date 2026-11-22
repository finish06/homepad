import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { authConfig, logout, me, type User } from '../api';

// SPEC-signin-hardening AC-003, UX §2 — App reads /#signin-error=<code> once,
// takes it out of the address bar (also when a session exists and the
// sign-in card never mounts), and hands the code to the sign-in card.

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

const JO: User = { id: 'u-jo', email: 'jo@example.com', role: 'user', themePref: 'system', name: 'Jo' };

beforeEach(() => {
  vi.mocked(me).mockResolvedValue(null);
  vi.mocked(authConfig).mockResolvedValue({ oidcEnabled: true, registration: 'invite_only', setupNeeded: false });
});

afterEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('/#signin-error= (AC-003)', () => {
  it('shows the message on the sign-in card and clears the fragment, keeping path and query', async () => {
    window.history.replaceState(null, '', '/?from=sso#signin-error=not_invited');
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "You don't have a Homepad account yet. Ask your admin for an invite.",
    );
    expect(window.location.hash).toBe('');
    expect(window.location.pathname + window.location.search).toBe('/?from=sso');
  });

  it('TC-004 — email_unverified lands with its line', async () => {
    window.history.replaceState(null, '', '/#signin-error=email_unverified');
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent("Your identity provider hasn't confirmed your email.");
  });

  it('a fragment that is not a code is cleared and shows nothing', async () => {
    window.history.replaceState(null, '', '/#signin-error=%3Cb%3Ehi');
    render(<App />);
    await screen.findByRole('button', { name: 'Log in with PocketID' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(window.location.hash).toBe('');
  });

  it('is cleared when a session exists and the card never mounts', async () => {
    vi.mocked(me).mockResolvedValue(JO);
    window.history.replaceState(null, '', '/#signin-error=sso_failed');
    render(<App />);
    expect(await screen.findByTestId('app-grid-stub')).toBeInTheDocument();
    expect(window.location.hash).toBe('');
    expect(screen.queryByText("Single sign-on didn't work. Try again.")).not.toBeInTheDocument();
  });

  it('is for the first sign-in card only: signing out later shows no stale line', async () => {
    const user = userEvent.setup();
    vi.mocked(me).mockResolvedValue(JO);
    vi.mocked(logout).mockResolvedValue();
    window.history.replaceState(null, '', '/#signin-error=not_invited');
    render(<App />);
    await screen.findByTestId('app-grid-stub');
    await user.click(screen.getByTestId('user-menu-trigger'));
    await user.click(screen.getByTestId('menu-logout'));
    expect(await screen.findByRole('button', { name: 'Log in with PocketID' })).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('leaves other fragments alone', async () => {
    window.history.replaceState(null, '', '/#section-2');
    render(<App />);
    await screen.findByRole('button', { name: 'Log in with PocketID' });
    expect(window.location.hash).toBe('#section-2');
  });
});
