import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AppHeader from './AppHeader';
import { LauncherProvider } from '../launcher/launcher';
import type { User } from '../api';

// SPEC-density-to-my-settings §4 (AC-007..AC-011) — the gear's "Edit dashboard"
// becomes "Arrange apps" and moves under "Add apps".
//
// OQ-3 resolved by Caleb 2026-09-23: the admin/personal section boundary does
// NOT hold here. "Arrange apps" sits directly under "Add apps" in the My
// Dashboard section, grouped by the task rather than by permission — while
// staying admin-only, which AC-008 and TC-006 both require.

const user = (role: 'admin' | 'user'): User =>
  ({ id: 'u1', email: 'a@b.test', role, themePref: 'system' }) as User;

function renderHeader(role: 'admin' | 'user' = 'admin') {
  return render(
    <LauncherProvider>
    <AppHeader
      user={user(role)}
      editMode={false}
      onToggleEdit={vi.fn()}
      onOpenLibrary={vi.fn()}
      onOpenCustomAppForm={vi.fn()}
      onOpenAdminSettings={vi.fn()}
      onOpenMySettings={vi.fn()}
      onGoToDashboard={vi.fn()}
      onLogout={vi.fn()}
      alertCount={0}
      onAlertClick={vi.fn()}
    />
    </LauncherProvider>,
  );
}

const openGear = async () => {
  await userEvent.click(screen.getByTestId('settings-gear'));
  return screen.getByTestId('gear-menu');
};

afterEach(() => vi.clearAllMocks());

describe('gear menu — "Arrange apps" (AC-007..AC-011)', () => {
  it('AC-007 — the item reads "Arrange apps", and nothing says "Edit dashboard"', async () => {
    renderHeader('admin');
    const menu = await openGear();
    expect(within(menu).getByTestId('gear-edit-dashboard')).toHaveTextContent('Arrange apps');
    expect(menu.textContent).not.toMatch(/Edit dashboard/i);
  });

  it('AC-007 / OQ-3 — it sits directly under "Add apps", with nothing between', async () => {
    renderHeader('admin');
    const menu = await openGear();
    const items = Array.from(menu.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"]')).map(
      (el) => el.getAttribute('data-testid'),
    );
    const add = items.indexOf('gear-add-apps');
    const arrange = items.indexOf('gear-edit-dashboard');
    expect(add).toBeGreaterThanOrEqual(0);
    // Adjacent, not merely later: OQ-3 chose literal adjacency over the
    // v12 personal/admin grouping.
    expect(arrange).toBe(add + 1);
  });

  it('AC-008 — behaviour is unchanged: checkbox role, aria-checked, admin-only', async () => {
    renderHeader('admin');
    const menu = await openGear();
    const item = within(menu).getByTestId('gear-edit-dashboard');
    expect(item).toHaveAttribute('role', 'menuitemcheckbox');
    expect(item).toHaveAttribute('aria-checked', 'false');
  });

  it('AC-008 — clicking it still toggles edit mode', async () => {
    const onToggleEdit = vi.fn();
    render(
      <LauncherProvider>
      <AppHeader
        user={user('admin')}
        editMode={false}
        onToggleEdit={onToggleEdit}
        onOpenLibrary={vi.fn()}
        onOpenCustomAppForm={vi.fn()}
        onOpenAdminSettings={vi.fn()}
        onOpenMySettings={vi.fn()}
        onGoToDashboard={vi.fn()}
        onLogout={vi.fn()}
        alertCount={0}
        onAlertClick={vi.fn()}
      />
      </LauncherProvider>,
    );
    await userEvent.click(screen.getByTestId('settings-gear'));
    await userEvent.click(screen.getByTestId('gear-edit-dashboard'));
    expect(onToggleEdit).toHaveBeenCalled();
  });

  it('AC-009 — neither the gear trigger nor the menu is still named "Edit dashboard"', async () => {
    renderHeader('admin');
    const trigger = screen.getByTestId('settings-gear');
    expect(trigger.getAttribute('aria-label')).not.toMatch(/Edit dashboard/i);
    const menu = await openGear();
    expect(menu.getAttribute('aria-label')).not.toMatch(/Edit dashboard/i);
    // Both must still HAVE an accessible name — removing the label is not a fix.
    expect(trigger.getAttribute('aria-label')).toBeTruthy();
    expect(menu.getAttribute('aria-label')).toBeTruthy();
  });

  it('AC-010 — Add apps and Add custom app keep their labels and testids', async () => {
    renderHeader('admin');
    const menu = await openGear();
    expect(within(menu).getByTestId('gear-add-apps')).toHaveTextContent('Add apps');
    expect(within(menu).getByTestId('gear-add-custom-app')).toHaveTextContent('Add custom app');
  });

  it('AC-013 — the testid is retained despite the label change', async () => {
    renderHeader('admin');
    const menu = await openGear();
    expect(within(menu).queryByTestId('gear-edit-dashboard')).not.toBeNull();
  });

  it('TC-006 — a non-admin sees Add apps but no Arrange apps', async () => {
    renderHeader('user');
    const menu = await openGear();
    expect(within(menu).getByTestId('gear-add-apps')).toBeTruthy();
    expect(within(menu).queryByTestId('gear-edit-dashboard')).toBeNull();
  });
});
