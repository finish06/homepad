import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import AppHeader from './AppHeader';
import { LauncherProvider } from './launcher';
import type { User } from './api';

expect.extend(toHaveNoViolations);

// v18 — the Gear becomes a unified edit-dashboard dropdown menu. A single click
// on the gear surfaces every edit-dashboard action, role-appropriately, instead
// of the old single Arrange toggle (aria-pressed). These cover SPEC v18
// A1–A9/A13.

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
        arrange={false}
        editMode={false}
        onToggleArrange={() => {}}
        onToggleEditMode={() => {}}
        onOpenLibrary={() => {}}
        onOpenCustomAppForm={() => {}}
        onToggleEdit={() => {}}
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

describe('v18 A1 — Gear is a menu trigger, not a toggle', () => {
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

describe('v18 A2 — personal items for all users', () => {
  it('admin sees Arrange tiles + Add apps', async () => {
    const user = userEvent.setup();
    renderHeader(ADMIN);
    await openGear(user);
    expect(screen.getByTestId('gear-arrange')).toHaveTextContent(/arrange tiles/i);
    expect(screen.getByTestId('gear-add-apps')).toHaveTextContent(/add apps/i);
  });

  it('non-admin also sees Arrange tiles + Add apps', async () => {
    const user = userEvent.setup();
    renderHeader(USER);
    await openGear(user);
    expect(screen.getByTestId('gear-arrange')).toBeInTheDocument();
    expect(screen.getByTestId('gear-add-apps')).toBeInTheDocument();
  });
});

describe('v18 A3 — admin-only editing section', () => {
  it('admin sees the Admin editing section + Edit tiles + Add custom app', async () => {
    const user = userEvent.setup();
    renderHeader(ADMIN);
    await openGear(user);
    const adminLabel = screen.getByTestId('gear-menu-section-admin');
    expect(adminLabel).toHaveTextContent(/admin editing/i);
    expect(adminLabel).toHaveClass('menu-administration-section');
    expect(screen.getByTestId('gear-edit-tiles')).toHaveTextContent(/edit tiles/i);
    expect(screen.getByTestId('gear-add-custom-app')).toHaveTextContent(/add custom app/i);
  });

  it('non-admin does NOT see the admin section or its items', async () => {
    const user = userEvent.setup();
    renderHeader(USER);
    await openGear(user);
    expect(screen.queryByTestId('gear-menu-section-admin')).not.toBeInTheDocument();
    expect(screen.queryByTestId('gear-edit-tiles')).not.toBeInTheDocument();
    expect(screen.queryByTestId('gear-add-custom-app')).not.toBeInTheDocument();
  });
});

describe('v18 A4 — Arrange tiles toggle', () => {
  it('clicking fires onToggleArrange and closes the menu', async () => {
    const user = userEvent.setup();
    const onToggleArrange = vi.fn();
    renderHeader(ADMIN, { onToggleArrange });
    await openGear(user);
    await user.click(screen.getByTestId('gear-arrange'));
    expect(onToggleArrange).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('gear-menu')).not.toBeInTheDocument();
  });

  it('shows a checkmark when arrange=true', async () => {
    const user = userEvent.setup();
    renderHeader(ADMIN, { arrange: true });
    await openGear(user);
    expect(within(screen.getByTestId('gear-arrange')).queryByTestId('gear-arrange-check')).toBeInTheDocument();
  });

  it('shows no checkmark when arrange=false', async () => {
    const user = userEvent.setup();
    renderHeader(ADMIN, { arrange: false });
    await openGear(user);
    expect(within(screen.getByTestId('gear-arrange')).queryByTestId('gear-arrange-check')).not.toBeInTheDocument();
  });
});

describe('v18 A5 — Add apps action', () => {
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

describe('v18 A6 — Edit tiles toggle (admin)', () => {
  it('clicking fires onToggleEditMode and closes the menu', async () => {
    const user = userEvent.setup();
    const onToggleEditMode = vi.fn();
    renderHeader(ADMIN, { onToggleEditMode });
    await openGear(user);
    await user.click(screen.getByTestId('gear-edit-tiles'));
    expect(onToggleEditMode).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('gear-menu')).not.toBeInTheDocument();
  });

  it('shows a checkmark when editMode=true', async () => {
    const user = userEvent.setup();
    renderHeader(ADMIN, { editMode: true });
    await openGear(user);
    expect(within(screen.getByTestId('gear-edit-tiles')).queryByTestId('gear-edit-tiles-check')).toBeInTheDocument();
  });
});

describe('v18 A7 — Add custom app action (admin)', () => {
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

describe('v18 A8 — Gear icon highlights when any mode is active', () => {
  it('carries the active indigo class when arrange=true', () => {
    renderHeader(USER, { arrange: true });
    expect(screen.getByTestId('settings-gear').className).toContain('text-indigo-600');
  });

  it('carries the active class when editMode=true', () => {
    renderHeader(ADMIN, { editMode: true });
    expect(screen.getByTestId('settings-gear').className).toContain('text-indigo-600');
  });

  it('is neutral when neither is active', () => {
    renderHeader(ADMIN, { arrange: false, editMode: false });
    expect(screen.getByTestId('settings-gear').className).not.toContain('text-indigo-600');
  });
});

describe('v18 A9 — menu closes on outside click and Escape', () => {
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

describe('v18 A13 — accessibility', () => {
  it('the open admin gear menu (arrange + editMode on) has no axe violations', async () => {
    const user = userEvent.setup();
    const { container } = renderHeader(ADMIN, { arrange: true, editMode: true });
    await openGear(user);
    const results = await axe(container, {
      rules: { 'aria-required-children': { enabled: false } },
    });
    expect(results).toHaveNoViolations();
  });
});
