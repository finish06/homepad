import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import UserMenu from './UserMenu';
import { ThemeProvider } from '../theme/theme';
import type { User } from '../api';

// SPEC-kid-accounts UX §5 / K-2 (TASK-405) — the kid's menu: the kid's name and
// color dot (no role pill — "kid" is a word for the admin, not the child),
// Appearance, and a visible Sign out. Nothing else.

expect.extend(toHaveNoViolations);

const KID: User = {
  id: 'k-maya', email: '', role: 'kid', themePref: 'light', name: 'Maya', displayName: 'Maya', avatarColor: 'pink',
};

function renderMenu(user: User = KID) {
  const onLogout = vi.fn();
  render(
    <ThemeProvider userPref="light">
      <UserMenu
        user={user}
        onOpenAdminSettings={vi.fn()}
        onOpenMySettings={vi.fn()}
        onOpenAccounts={vi.fn()}
        onGoToDashboard={vi.fn()}
        onLogout={onLogout}
      />
    </ThemeProvider>,
  );
  return { onLogout };
}

afterEach(() => vi.clearAllMocks());

describe('Kid user menu (K-2)', () => {
  it('the trigger carries the color dot and the name, and still names itself "Account menu"', () => {
    renderMenu();
    const trigger = screen.getByRole('button', { name: 'Account menu' });
    expect(trigger).toHaveTextContent('Maya');
    expect(within(trigger).getByTestId('kid-dot')).toHaveAttribute('data-color', 'pink');
  });

  it('shows the name and dot, Appearance and Sign out — and no role pill or email', async () => {
    renderMenu();
    await userEvent.click(screen.getByTestId('user-menu-trigger'));
    const menu = screen.getByTestId('user-menu');
    expect(within(menu).getByTestId('user-menu-name')).toHaveTextContent('Maya');
    expect(within(menu).getByTestId('kid-dot')).toBeInTheDocument();
    expect(within(menu).queryByTestId('user-menu-role')).toBeNull();
    expect(within(menu).queryByTestId('user-menu-email')).toBeNull();
    expect(within(menu).queryByText('kid')).toBeNull();
    expect(within(menu).getByText('Appearance')).toBeInTheDocument();
    expect(within(menu).getByTestId('theme-control')).toBeInTheDocument();
    expect(within(menu).getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Sign out']);
  });

  it('has no My Dashboard, My settings, Administration or Accounts entries', async () => {
    renderMenu();
    await userEvent.click(screen.getByTestId('user-menu-trigger'));
    for (const id of [
      'menu-my-dashboard-section',
      'menu-go-dashboard',
      'menu-my-settings',
      'menu-dashboard-note',
      'menu-administration-section',
      'menu-admin-settings',
      'menu-accounts',
    ]) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
  });

  it('Sign out fires onLogout and closes the menu', async () => {
    const { onLogout } = renderMenu();
    await userEvent.click(screen.getByTestId('user-menu-trigger'));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('user-menu')).toBeNull();
  });

  it('a kid with no display name still gets a readable label', () => {
    renderMenu({ ...KID, name: '', displayName: '' });
    expect(screen.getByTestId('user-menu-trigger')).toHaveTextContent('Me');
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <ThemeProvider userPref="light">
        <UserMenu user={KID} onOpenAdminSettings={vi.fn()} onOpenMySettings={vi.fn()} onLogout={vi.fn()} />
      </ThemeProvider>,
    );
    await userEvent.click(screen.getByTestId('user-menu-trigger'));
    expect(
      await axe(container, { rules: { 'aria-required-children': { enabled: false } } }),
    ).toHaveNoViolations();
  });
});

describe('AC-018 — adults keep "Log out"', () => {
  it('an adult menu is unchanged: email, role pill, Log out', async () => {
    renderMenu({ id: 'u1', email: 'nani@ohana.io', role: 'user', themePref: 'light' });
    await userEvent.click(screen.getByTestId('user-menu-trigger'));
    expect(screen.getByTestId('user-menu-email')).toHaveTextContent('nani@ohana.io');
    expect(screen.getByTestId('user-menu-role')).toHaveTextContent('user');
    expect(screen.getByTestId('menu-logout')).toHaveTextContent('Log out');
    expect(screen.queryByTestId('kid-dot')).toBeNull();
  });
});
