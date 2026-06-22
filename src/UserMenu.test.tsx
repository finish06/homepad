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

// `a` precedes `b` in document order.
function precedes(a: HTMLElement, b: HTMLElement) {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

afterEach(() => {
  vi.clearAllMocks();
  document.documentElement.classList.remove('dark');
});

// v12 §6 A1 — admins get a "My Dashboard" personal section label above the
// "Edit dashboard" action. It is muted/uppercase (.menu-section-label), NOT
// amber — amber is reserved for the Administration section.
describe('v12 A1 — My Dashboard section (admin)', () => {
  it('renders the My Dashboard label above Edit dashboard, in muted (non-amber) style', async () => {
    renderMenu(ADMIN);
    await open();
    const label = screen.getByTestId('menu-my-dashboard-section');
    expect(label).toBeInTheDocument();
    expect(label).toHaveTextContent(/my dashboard/i);
    // Muted personal style, not the amber administration style.
    expect(label).toHaveClass('menu-section-label');
    expect(label).not.toHaveClass('menu-administration-section');
    // It precedes the Edit dashboard item.
    expect(precedes(label, screen.getByTestId('menu-edit'))).toBe(true);
  });
});

// v12 §6 A2 — admins get an "Administration" section label (shield + amber)
// above "Admin settings" ONLY. "Edit dashboard" lives under My Dashboard,
// before the Administration label — never inside the admin section.
describe('v12 A2 — Administration section (admin)', () => {
  it('renders the Administration label (amber) above Admin settings, after Edit dashboard', async () => {
    renderMenu(ADMIN);
    await open();
    const admin = screen.getByTestId('menu-administration-section');
    expect(admin).toBeInTheDocument();
    expect(admin).toHaveTextContent(/administration/i);
    expect(admin).toHaveClass('menu-administration-section');

    const edit = screen.getByTestId('menu-edit');
    const settings = screen.getByTestId('menu-admin-settings');
    // Edit dashboard is a personal item that sits BEFORE the Administration
    // label; Admin settings is the only item AFTER it.
    expect(precedes(edit, admin)).toBe(true);
    expect(precedes(admin, settings)).toBe(true);
  });
});

// v12 §6 A3 — per-item scope tags: "personal" on Edit dashboard, "global" on
// Admin settings, in both light and dark.
describe('v12 A3 — scope tags on menu items', () => {
  it('tags Edit dashboard "personal" and Admin settings "global" (light)', async () => {
    renderMenu(ADMIN);
    await open();
    expect(within(screen.getByTestId('menu-edit')).getByText(/personal/i)).toBeInTheDocument();
    expect(within(screen.getByTestId('menu-admin-settings')).getByText(/global/i)).toBeInTheDocument();
  });

  it('renders both scope tags in dark mode', async () => {
    renderMenu(ADMIN, { dark: true });
    await open();
    expect(within(screen.getByTestId('menu-edit')).getByText(/personal/i)).toBeInTheDocument();
    expect(within(screen.getByTestId('menu-admin-settings')).getByText(/global/i)).toBeInTheDocument();
  });
});

// v12 §6 A4/A5/A6 — non-admins also get a labeled "My Dashboard" section, with
// the note INSIDE it; they get no Administration section and no Edit dashboard.
describe('v12 A4/A5/A6 — non-admin sees a labeled personal section', () => {
  it('A4 — shows the My Dashboard section label', async () => {
    renderMenu(USER);
    await open();
    expect(screen.getByTestId('menu-my-dashboard-section')).toBeInTheDocument();
  });

  it('A5 — shows no Administration section and no Edit dashboard', async () => {
    renderMenu(USER);
    await open();
    expect(screen.queryByTestId('menu-administration-section')).not.toBeInTheDocument();
    expect(screen.queryByTestId('menu-edit')).not.toBeInTheDocument();
  });

  it('A6 — the dashboard note sits inside the My Dashboard section', async () => {
    renderMenu(USER);
    await open();
    const label = screen.getByTestId('menu-my-dashboard-section');
    const note = screen.getByTestId('menu-dashboard-note');
    expect(note).toHaveTextContent(/personal dashboard/i);
    // The note follows the My Dashboard label (not floating with no heading).
    expect(precedes(label, note)).toBe(true);
  });
});

// #96 — the non-admin "My Dashboard" section used to be text-only with no
// action, so it read as a dead/broken heading next to every other section's
// clickable item. It now carries a real "Go to my dashboard" menuitem (parity
// with the admin's "Edit dashboard"): a focusable, keyboard-navigable action
// that closes the menu and returns the user to their dashboard.
describe('#96 — non-admin My Dashboard has an actionable item', () => {
  it('renders a "Go to my dashboard" menuitem under the My Dashboard label', async () => {
    renderMenu(USER);
    await open();
    const action = screen.getByTestId('menu-go-dashboard');
    expect(action).toHaveAttribute('role', 'menuitem');
    expect(action).toHaveTextContent(/go to my dashboard/i);
    // Tagged "personal" like the admin's Edit dashboard — same scope vocabulary.
    expect(within(action).getByText(/personal/i)).toBeInTheDocument();
    // It sits between the section label and the explanatory note.
    const label = screen.getByTestId('menu-my-dashboard-section');
    const note = screen.getByTestId('menu-dashboard-note');
    expect(precedes(label, action)).toBe(true);
    expect(precedes(action, note)).toBe(true);
  });

  it('fires onGoToDashboard and closes the menu when chosen', async () => {
    const onGoToDashboard = vi.fn();
    render(
      <ThemeProvider userPref="light">
        <UserMenu
          user={USER}
          onToggleEdit={vi.fn()}
          onOpenAdminSettings={vi.fn()}
          onGoToDashboard={onGoToDashboard}
          onLogout={vi.fn()}
        />
      </ThemeProvider>,
    );
    await open();
    await userEvent.click(screen.getByTestId('menu-go-dashboard'));
    expect(onGoToDashboard).toHaveBeenCalledTimes(1);
    // Menu closes after the action fires (like every other menuitem).
    expect(screen.queryByTestId('user-menu')).not.toBeInTheDocument();
  });

  it('admins do not get the "Go to my dashboard" item (they get Edit dashboard)', async () => {
    renderMenu(ADMIN);
    await open();
    expect(screen.queryByTestId('menu-go-dashboard')).not.toBeInTheDocument();
  });
});

// v12 §6 A7 — admins do NOT see the non-admin dashboard note (they get the
// active Edit dashboard button instead).
describe('v12 A7 — admin has no dashboard note', () => {
  it('does NOT show the dashboard note for an admin', async () => {
    renderMenu(ADMIN);
    await open();
    expect(screen.queryByTestId('menu-dashboard-note')).not.toBeInTheDocument();
  });
});

// v12 §6 A11 — the restructured admin menu carries no axe violations.
// `aria-required-children` stays disabled (pre-existing menu concern: the
// ThemeControl role="group" of plain buttons inside role="menu" predates v12
// and is outside this change set).
describe('v12 A11 — accessibility', () => {
  it('the admin menu has no axe violations', async () => {
    const { container } = renderMenu(ADMIN);
    await open();
    const results = await axe(container, {
      rules: { 'aria-required-children': { enabled: false } },
    });
    expect(results).toHaveNoViolations();
  });
});

// v12 §6 A12 — both labels render under the dark theme; My Dashboard keeps its
// muted class, Administration keeps its amber class.
describe('v12 A12 — dark theme labels', () => {
  it('renders My Dashboard (muted) and Administration (amber) labels in dark mode', async () => {
    renderMenu(ADMIN, { dark: true });
    await open();
    const my = screen.getByTestId('menu-my-dashboard-section');
    const admin = screen.getByTestId('menu-administration-section');
    expect(my).toHaveClass('menu-section-label');
    expect(my).not.toHaveClass('menu-administration-section');
    expect(admin).toHaveClass('menu-administration-section');
  });
});
