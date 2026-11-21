import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitForElementToBeRemoved, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { authConfig, me, setThemePref, type User } from '../api';

// Mirror App.test's isolation: stub the heavy children + the api module so the
// logged-in dashboard mounts without a backend. The footer (v15) lives in Home,
// so we drive it through a real <App /> with a resolved session.
vi.mock('../grid/AppGrid', () => ({
  default: () => <div data-testid="app-grid-stub" />,
}));
vi.mock('../library/SettingsPanel', () => ({
  default: () => <div data-testid="settings-panel-stub" />,
}));
vi.mock('../api', () => ({
  authConfig: vi.fn(),
  systemConfig: vi.fn(() => Promise.resolve({ showUptimeDisplay: true })),
  saveSystemSettings: vi.fn(() => Promise.resolve({ showUptimeDisplay: true })),
  me: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  setThemePref: vi.fn(),
  categories: vi.fn(() => Promise.resolve([])),
  services: vi.fn(() => Promise.resolve([])),
  servicesWithStatus: vi.fn(() => Promise.resolve({ status: 200, services: [] })),
}));

const USER: User = { id: 'u1', email: 'nani@ohana.io', role: 'user', themePref: 'system' };

beforeEach(() => {
  vi.mocked(me).mockResolvedValue(USER);
  vi.mocked(authConfig).mockResolvedValue({ oidcEnabled: false, registration: 'invite_only', setupNeeded: false });
  vi.mocked(setThemePref).mockResolvedValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
});

async function dropLoading() {
  await waitForElementToBeRemoved(() => screen.queryByText(/loading/i));
}

describe('v15 version footer', () => {
  // AC-001 / AC-021(e)
  it('renders an app-footer at the bottom of the Home view', async () => {
    render(<App />);
    await dropLoading();
    expect(screen.getByTestId('app-footer')).toBeInTheDocument();
  });

  // AC-002 / AC-005
  it('shows "homepad v{N} ({sha})" as a button labelled "Open changelog"', async () => {
    render(<App />);
    await dropLoading();
    const btn = screen.getByRole('button', { name: /open changelog/i });
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.textContent).toMatch(/^homepad v.+ \(.+\)$/);
  });

  // AC-008 — clicking the badge opens the changelog dialog.
  it('opens the changelog overlay when the badge is clicked', async () => {
    const user = userEvent.setup();
    render(<App />);
    await dropLoading();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /open changelog/i }));
    // The overlay is a lazy chunk, so it appears after its import resolves.
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Changelog')).toBeInTheDocument();
  });

  // AC-009 — the close button closes it and focus returns to the badge.
  it('the close button closes the overlay and focus returns to the badge', async () => {
    const user = userEvent.setup();
    render(<App />);
    await dropLoading();
    const badge = screen.getByRole('button', { name: /open changelog/i });
    await user.click(badge);
    await user.click(await screen.findByRole('button', { name: /close changelog/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(badge).toHaveFocus();
  });

  // AC-012 — each open lands on the default, not the last selection.
  it('re-opening lands on the default version, not the last one picked', async () => {
    const user = userEvent.setup();
    render(<App />);
    await dropLoading();
    const badge = screen.getByRole('button', { name: /open changelog/i });
    await user.click(badge);
    await screen.findByRole('dialog');
    const nav = screen.getByRole('navigation', { name: 'Versions' });
    const defaultLabel = within(nav).getByRole('button', { current: true }).textContent;
    const other = within(nav)
      .getAllByRole('button')
      .find((b) => b.textContent !== defaultLabel)!;
    await user.click(other);
    expect(other).toHaveAttribute('aria-current', 'true');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(badge);
    await screen.findByRole('dialog');
    expect(
      within(screen.getByRole('navigation', { name: 'Versions' })).getByRole('button', { current: true }),
    ).toHaveTextContent(defaultLabel!);
  });
});
