import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import AppHeader from './AppHeader';
import { LauncherProvider } from './launcher';
import type { User } from './api';

expect.extend(toHaveNoViolations);

// The Gear is a unified dropdown menu. SPEC-app-grid §2/§7 retired the Catalog
// layout that owned tile Arrange + Edit-tiles modes, so those two items are gone;
// the Gear now carries the service-management actions that outlive the layout
// swap: "Add apps" (Library, all users) and "Add custom app" (admin).

const ADMIN: User = { id: 'a1', email: 'caleb@ohana.io', role: 'admin', themePref: 'system' };
const USER: User = { id: 'u1', email: 'nani@ohana.io', role: 'user', themePref: 'system' };

function renderHeader(
  user: User,
  props: Partial<React.ComponentProps<typeof AppHeader>> = {},
) {
  return render(
    <LauncherProvider>
      <AppHeader
        user={user}
        onOpenLibrary={() => {}}
        onOpenCustomAppForm={() => {}}
        onOpenAdminSettings={() => {}}
        onGoToDashboard={() => {}}
        onLogout={() => {}}
        alertCount={0}
        onAlertClick={() => {}}
        {...props}
      />
    </LauncherProvider>,
  );
}

async function openGear(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId('settings-gear'));
}

afterEach(() => {
  vi.clearAllMocks();
  document.documentElement.classList.remove('dark');
});

describe('A1 — Gear is a menu trigger, not a toggle', () => {
  it('the gear advertises a menu popup (aria-haspopup), not aria-pressed', () => {
    renderHeader(ADMIN);
    const gear = screen.getByTestId('settings-gear');
    expect(gear).toHaveAttribute('aria-haspopup', 'menu');
    expect(gear).not.toHaveAttribute('aria-pressed');
  });

  it('clicking the gear opens the dropdown menu (gear-menu)', async () => {
    const user = userEvent.setup();
    renderHeader(ADMIN);
    expect(screen.queryByTestId('gear-menu')).not.toBeInTheDocument();
    await openGear(user);
    expect(screen.getByTestId('gear-menu')).toHaveAttribute('role', 'menu');
  });
});

describe('A2 — personal items for all users', () => {
  it('admin sees Add apps', async () => {
    const user = userEvent.setup();
    renderHeader(ADMIN);
    await openGear(user);
    expect(screen.getByTestId('gear-add-apps')).toHaveTextContent(/add apps/i);
  });

  it('non-admin also sees Add apps', async () => {
    const user = userEvent.setup();
    renderHeader(USER);
    await openGear(user);
    expect(screen.getByTestId('gear-add-apps')).toBeInTheDocument();
  });

  // The retired Catalog Arrange/Edit-tiles items must not resurface (#223 / §7).
  it('no longer offers Arrange tiles or Edit tiles', async () => {
    const user = userEvent.setup();
    renderHeader(ADMIN);
    await openGear(user);
    expect(screen.queryByTestId('gear-arrange')).not.toBeInTheDocument();
    expect(screen.queryByTestId('gear-edit-tiles')).not.toBeInTheDocument();
  });
});

describe('A3 — admin-only editing section', () => {
  it('admin sees the Admin editing section + Add custom app', async () => {
    const user = userEvent.setup();
    renderHeader(ADMIN);
    await openGear(user);
    const adminLabel = screen.getByTestId('gear-menu-section-admin');
    expect(adminLabel).toHaveTextContent(/admin editing/i);
    expect(adminLabel).toHaveClass('menu-administration-section');
    expect(screen.getByTestId('gear-add-custom-app')).toHaveTextContent(/add custom app/i);
  });

  it('non-admin does NOT see the admin section or its items', async () => {
    const user = userEvent.setup();
    renderHeader(USER);
    await openGear(user);
    expect(screen.queryByTestId('gear-menu-section-admin')).not.toBeInTheDocument();
    expect(screen.queryByTestId('gear-add-custom-app')).not.toBeInTheDocument();
  });
});

describe('A5 — Add apps action', () => {
  it('clicking fires onOpenLibrary and closes the menu', async () => {
    const user = userEvent.setup();
    const onOpenLibrary = vi.fn();
    renderHeader(ADMIN, { onOpenLibrary });
    await openGear(user);
    await user.click(screen.getByTestId('gear-add-apps'));
    expect(onOpenLibrary).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('gear-menu')).not.toBeInTheDocument();
  });
});

describe('A7 — Add custom app action (admin)', () => {
  it('clicking fires onOpenCustomAppForm and closes the menu', async () => {
    const user = userEvent.setup();
    const onOpenCustomAppForm = vi.fn();
    renderHeader(ADMIN, { onOpenCustomAppForm });
    await openGear(user);
    await user.click(screen.getByTestId('gear-add-custom-app'));
    expect(onOpenCustomAppForm).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('gear-menu')).not.toBeInTheDocument();
  });
});

describe('A9 — menu closes on outside click and Escape', () => {
  it('Escape closes the menu and restores focus to the gear', async () => {
    const user = userEvent.setup();
    renderHeader(ADMIN);
    const gear = screen.getByTestId('settings-gear');
    await user.click(gear);
    expect(screen.getByTestId('gear-menu')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('gear-menu')).not.toBeInTheDocument();
    expect(gear).toHaveFocus();
  });

  it('an outside click closes the menu', async () => {
    const user = userEvent.setup();
    renderHeader(ADMIN);
    await openGear(user);
    expect(screen.getByTestId('gear-menu')).toBeInTheDocument();
    await user.click(document.body);
    expect(screen.queryByTestId('gear-menu')).not.toBeInTheDocument();
  });
});

describe('A13 — accessibility', () => {
  it('the open admin gear menu has no axe violations', async () => {
    const user = userEvent.setup();
    const { container } = renderHeader(ADMIN);
    await openGear(user);
    const results = await axe(container, {
      rules: { 'aria-required-children': { enabled: false } },
    });
    expect(results).toHaveNoViolations();
  });
});
