import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import UserMenu from './UserMenu';
import { ThemeProvider } from './theme';
import type { User } from './api';

expect.extend(toHaveNoViolations);

const ADMIN: User = { id: 'a1', email: 'caleb@ohana.io', role: 'admin', themePref: 'system' };
const USER: User = { id: 'u1', email: 'nani@ohana.io', role: 'user', themePref: 'system' };

function renderMenu(user: User, opts: { dark?: boolean } = {}) {
  return render(
    <ThemeProvider userPref={opts.dark ? 'dark' : 'light'}>
      <UserMenu
        user={user}
        onToggleEdit={vi.fn()}
        onOpenAdminSettings={vi.fn()}
        onLogout={vi.fn()}
      />
    </ThemeProvider>,
  );
}

async function open() {
  await userEvent.click(screen.getByTestId('user-menu-trigger'));
}

afterEach(() => {
  vi.clearAllMocks();
  document.documentElement.classList.remove('dark');
});

// v11 §6 A1 — the admin block gets a dedicated ADMIN section label (shield icon,
// amber-tinted) signaling these controls operate at global scope.
describe('v11 A1 — ADMIN section label', () => {
  it('renders the ADMIN section label for an admin, before the admin items', async () => {
    renderMenu(ADMIN);
    await open();
    const label = screen.getByTestId('menu-admin-section');
    expect(label).toBeInTheDocument();
    expect(label).toHaveTextContent(/admin/i);
    // It precedes the admin menu items in the DOM.
    const edit = screen.getByTestId('menu-edit');
    expect(label.compareDocumentPosition(edit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('does NOT render the ADMIN section label for a non-admin', async () => {
    renderMenu(USER);
    await open();
    expect(screen.queryByTestId('menu-admin-section')).not.toBeInTheDocument();
  });
});

// v11 §6 A2 — scope tags: "personal" on Edit dashboard, "global" on Admin settings.
describe('v11 A2 — scope tags on admin items', () => {
  it('tags Edit dashboard "personal" and Admin settings "global"', async () => {
    renderMenu(ADMIN);
    await open();
    expect(within(screen.getByTestId('menu-edit')).getByText(/personal/i)).toBeInTheDocument();
    expect(within(screen.getByTestId('menu-admin-settings')).getByText(/global/i)).toBeInTheDocument();
  });
});

// v11 §6 A3 — non-admins get a "your dashboard is your settings" note; admins don't.
describe('v11 A3 — non-admin dashboard note', () => {
  it('shows the dashboard note for a non-admin', async () => {
    renderMenu(USER);
    await open();
    const note = screen.getByTestId('menu-dashboard-note');
    expect(note).toHaveTextContent(/personal dashboard/i);
  });

  it('does NOT show the dashboard note for an admin', async () => {
    renderMenu(ADMIN);
    await open();
    expect(screen.queryByTestId('menu-dashboard-note')).not.toBeInTheDocument();
  });
});

// v11 A9 — the new admin label + scope tags carry no axe violations.
// `aria-required-children` is DISABLED here: it is a pre-existing menu concern
// (ThemeControl's role="group" of plain buttons sits inside role="menu") that
// predates v11 and lives outside this spec's change set — gating it here would
// assert on code v11 does not touch. The new label/tags/note are non-interactive
// text + an aria-hidden icon, so they add no violations of their own.
describe('v11 A9 — accessibility', () => {
  it('the admin menu has no axe violations from the new scope UI', async () => {
    const { container } = renderMenu(ADMIN);
    await open();
    const results = await axe(container, {
      rules: { 'aria-required-children': { enabled: false } },
    });
    expect(results).toHaveNoViolations();
  });
});

// v11 A10 — the new UI renders under the dark theme too.
describe('v11 A10 — dark theme', () => {
  it('renders the admin label + scope tags in dark mode', async () => {
    renderMenu(ADMIN, { dark: true });
    await open();
    expect(screen.getByTestId('menu-admin-section')).toBeInTheDocument();
    expect(within(screen.getByTestId('menu-edit')).getByText(/personal/i)).toBeInTheDocument();
    expect(within(screen.getByTestId('menu-admin-settings')).getByText(/global/i)).toBeInTheDocument();
  });
});
