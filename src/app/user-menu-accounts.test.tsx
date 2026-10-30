import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UserMenu from './UserMenu';
import { ThemeProvider } from '../theme/theme';
import type { User } from '../api';

// SPEC-kid-accounts UX §1 / K-1 (TASK-402) — a second Administration item,
// "Accounts", that jumps straight to the Accounts section of the Admin Panel.

const ADMIN: User = { id: 'a1', email: 'caleb@ohana.io', role: 'admin', themePref: 'system' };
const USER: User = { id: 'u1', email: 'nani@ohana.io', role: 'user', themePref: 'system' };

function renderMenu(user: User, onOpenAccounts = vi.fn()) {
  render(
    <ThemeProvider userPref="light">
      <UserMenu
        user={user}
        onOpenAdminSettings={vi.fn()}
        onOpenMySettings={vi.fn()}
        onOpenAccounts={onOpenAccounts}
        onLogout={vi.fn()}
      />
    </ThemeProvider>,
  );
  return onOpenAccounts;
}

afterEach(() => vi.clearAllMocks());

describe('Administration → Accounts', () => {
  it('sits under the Administration label, after Admin settings, and fires onOpenAccounts', async () => {
    const onOpen = renderMenu(ADMIN);
    await userEvent.click(screen.getByTestId('user-menu-trigger'));
    const item = screen.getByTestId('menu-accounts');
    expect(item).toHaveAttribute('role', 'menuitem');
    expect(item).toHaveTextContent('Accounts');
    const admin = screen.getByTestId('menu-admin-settings');
    expect(admin.compareDocumentPosition(item) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      screen.getByTestId('menu-administration-section').compareDocumentPosition(item) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await userEvent.click(item);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('user-menu')).toBeNull();
  });

  it('is not offered to a non-admin', async () => {
    renderMenu(USER);
    await userEvent.click(screen.getByTestId('user-menu-trigger'));
    expect(screen.queryByTestId('menu-accounts')).toBeNull();
  });
});
