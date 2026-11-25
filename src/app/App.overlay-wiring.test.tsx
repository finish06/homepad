import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { authConfig, me, type User } from '../api';

// Coverage for App.tsx's OVERLAY WIRING — the callbacks App hands to its lazy
// children and to AppHeader. These were 14 of App.tsx's 28 functions and the
// single biggest hole in the project's function coverage (App.tsx sat at 50%,
// dragging the total to 88.08% against a 90% target).
//
// They are all one-liners, which is exactly why they were never covered: nothing
// in App.test.tsx opens an overlay and then closes it, so every `onClose`,
// `onAdded` and `onOpen*` arrow was dead to the suite. One-line state setters are
// also where a wrong setter hides perfectly — `setBrowseOpen(false)` in the slot
// that should close the custom-app form reads fine and breaks nothing a unit test
// was watching.
//
// Each case therefore asserts the OBSERVABLE consequence (which overlay is
// mounted or gone), never just that a handler ran.

// SPEC-dashboard-empty-loading §3.4 — the stub draws one box, "Media" (c1),
// from the shared services list: empty, it shows the box button (when App
// passes onAddToBox); filled, its tiles carry data-service-id like the real
// grid's, unless `stubGrid.collapsed` hides them.
const stubGrid = vi.hoisted(() => ({ collapsed: false, boxGone: false }));
vi.mock('../grid/AppGrid', async () => {
  const { useServicesContext } = await import('../services');
  return {
    default: function AppGridStub(props: {
      onAddToBox?: (box: { id: string; title: string }, opener: HTMLButtonElement) => void;
    }) {
      const inBox = (useServicesContext()?.items ?? []).filter((s) => s.categoryId === 'c1');
      // The box deleted elsewhere while the Library was open.
      if (stubGrid.boxGone && inBox.length > 0) return <div data-testid="app-grid-stub" />;
      return (
        <div data-testid="app-grid-stub">
          <section data-box-id="c1">
            <h2 tabIndex={-1}>Media</h2>
            {inBox.length === 0
              ? props.onAddToBox && (
                  <button
                    data-testid="stub-box-add"
                    onClick={(e) => props.onAddToBox!({ id: 'c1', title: 'Media' }, e.currentTarget)}
                  >
                    Browse the App Library
                  </button>
                )
              : !stubGrid.collapsed &&
                inBox.map((t) => (
                  <div key={t.id} className="app-grid-tool-wrap" data-service-id={t.id}>
                    <a data-testid="tool-link" href="#t">
                      {t.name}
                    </a>
                  </div>
                ))}
          </section>
        </div>
      );
    },
  };
});

// The three lazy children, stubbed with buttons that fire the callbacks App
// passes in — the only way to reach them from outside.
vi.mock('../library/LibraryBrowse', () => ({
  default: (props: {
    onClose: () => void;
    onAdded: (s: unknown) => void;
    onCustomAdd: () => void;
    targetCategory?: { id: string; title: string };
  }) => (
    <div data-testid="library-stub" data-target={props.targetCategory?.id ?? ''} data-target-title={props.targetCategory?.title ?? ''}>
      <button data-testid="lib-close" onClick={props.onClose}>close</button>
      <button data-testid="lib-custom" onClick={props.onCustomAdd}>custom</button>
      <button
        data-testid="lib-added"
        onClick={() =>
          props.onAdded({
            id: 's9', slug: 's9', name: 'Added App', description: '', url: 'https://a.test',
            icon: '', status: 'UP', favorite: false, iconLight: false, iconDark: false,
            // The server files the copy in the target box (SPEC-dashboard-empty-loading OQ-2).
            categoryId: props.targetCategory?.id ?? null,
          })
        }
      >
        added
      </button>
    </div>
  ),
}));

// SPEC-ui-quick-wins AC-009 — the toast overlay, stubbed with a button that
// fires the onView App passes in (the real toasts need a status flip between
// two polls; Toasts.test.tsx covers them).
vi.mock('../alerts/Toasts', () => ({
  default: (props: { onView?: () => void }) => (
    <button data-testid="toast-view-stub" onClick={() => props.onView?.()}>
      view
    </button>
  ),
}));

vi.mock('../library/ServiceForm', () => ({
  default: (props: { onClose: () => void; onSaved: (s: unknown, m: 'add' | 'edit') => void }) => (
    <div data-testid="form-stub">
      <button data-testid="form-close" onClick={props.onClose}>close</button>
      <button
        data-testid="form-saved"
        onClick={() =>
          props.onSaved(
            {
              id: 's8', slug: 's8', name: 'Custom App', description: '', url: 'https://c.test',
              icon: '', status: 'UP', favorite: false, iconLight: false, iconDark: false,
            },
            'add',
          )
        }
      >
        saved
      </button>
    </div>
  ),
}));

vi.mock('../library/SettingsPanel', () => ({
  default: (props: { scope?: string; onClose: () => void }) => (
    <div data-testid="settings-panel-stub" data-scope={props.scope ?? ''}>
      <button data-testid="settings-panel-close" onClick={props.onClose}>close</button>
    </div>
  ),
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

const USER: User = { id: 'u1', email: 'nani@ohana.io', role: 'member', themePref: 'system' };
const ADMIN: User = { id: 'a1', email: 'lilo@ohana.io', role: 'admin', themePref: 'system' };

beforeEach(() => {
  vi.mocked(authConfig).mockResolvedValue({ oidcEnabled: false } as never);
});
afterEach(() => vi.clearAllMocks());

async function boot(who: User) {
  vi.mocked(me).mockResolvedValue(who as never);
  render(<App />);
  await screen.findByTestId('app-grid-stub');
}

const openGear = async (u: ReturnType<typeof userEvent.setup>) =>
  u.click(await screen.findByTestId('settings-gear'));
const openUserMenu = async (u: ReturnType<typeof userEvent.setup>) =>
  u.click(await screen.findByTestId('user-menu-trigger'));

describe('App overlay wiring — the library browser', () => {
  // SPEC-ui-quick-wins AC-017 — adding from the Library is admin-only on the
  // server (403 for members since 18.0.0), so a member's Gear has no way in.
  // The library cases below therefore boot as an admin.
  it('a member has no Add apps in the Gear, so no way into the Library', async () => {
    const u = userEvent.setup();
    await boot(USER);
    await openGear(u);
    expect(screen.queryByTestId('gear-add-apps')).not.toBeInTheDocument();
    expect(screen.getByTestId('gear-edit-dashboard')).toBeInTheDocument();
  });

  it('gear → Add apps mounts the library, and its onClose unmounts it', async () => {
    const u = userEvent.setup();
    await boot(ADMIN);
    await openGear(u);
    await u.click(screen.getByTestId('gear-add-apps'));
    expect(await screen.findByTestId('library-stub')).toBeInTheDocument();

    await u.click(screen.getByTestId('lib-close'));
    expect(screen.queryByTestId('library-stub')).not.toBeInTheDocument();
  });

  it('the library\'s onCustomAdd swaps it for the custom-app form, not both at once', async () => {
    // The swap is the assertion. A handler that opened the form without closing
    // the library would leave two overlays stacked, and "the form appeared" alone
    // would not notice.
    const u = userEvent.setup();
    await boot(ADMIN);
    await openGear(u);
    await u.click(screen.getByTestId('gear-add-apps'));
    await screen.findByTestId('library-stub');

    await u.click(screen.getByTestId('lib-custom'));
    expect(await screen.findByTestId('form-stub')).toBeInTheDocument();
    expect(screen.queryByTestId('library-stub')).not.toBeInTheDocument();
  });

  it('the library\'s onAdded is wired and leaves the overlay open', async () => {
    const u = userEvent.setup();
    await boot(ADMIN);
    await openGear(u);
    await u.click(screen.getByTestId('gear-add-apps'));
    await screen.findByTestId('library-stub');

    await u.click(screen.getByTestId('lib-added'));
    // Adding from the catalog is not a dismissal — you add several in one visit.
    expect(screen.getByTestId('library-stub')).toBeInTheDocument();
  });
});

describe('App overlay wiring — the custom-app form', () => {
  it('gear → Add custom app mounts the form, and onClose unmounts it', async () => {
    const u = userEvent.setup();
    await boot(ADMIN);
    await openGear(u);
    await u.click(screen.getByTestId('gear-add-custom-app'));
    expect(await screen.findByTestId('form-stub')).toBeInTheDocument();

    await u.click(screen.getByTestId('form-close'));
    expect(screen.queryByTestId('form-stub')).not.toBeInTheDocument();
  });

  it('onSaved closes the form — a save is a dismissal, unlike onAdded above', async () => {
    const u = userEvent.setup();
    await boot(ADMIN);
    await openGear(u);
    await u.click(screen.getByTestId('gear-add-custom-app'));
    await screen.findByTestId('form-stub');

    await u.click(screen.getByTestId('form-saved'));
    expect(screen.queryByTestId('form-stub')).not.toBeInTheDocument();
  });
});

describe('App overlay wiring — settings scope, dashboard, changelog', () => {
  it('My settings opens the panel in the PERSONAL scope', async () => {
    // Scope is the point: both menu items mount the same component, and the only
    // thing distinguishing them is the scope App sets alongside.
    const u = userEvent.setup();
    await boot(USER);
    await openUserMenu(u);
    await u.click(screen.getByTestId('menu-my-settings'));
    const panel = await screen.findByTestId('settings-panel-stub');
    expect(panel).toHaveAttribute('data-scope', 'personal');

    await u.click(screen.getByTestId('settings-panel-close'));
    expect(screen.queryByTestId('settings-panel-stub')).not.toBeInTheDocument();
  });

  it('Admin settings opens the same panel in the ADMIN scope', async () => {
    const u = userEvent.setup();
    await boot(ADMIN);
    await openUserMenu(u);
    await u.click(screen.getByTestId('menu-admin-settings'));
    expect(await screen.findByTestId('settings-panel-stub')).toHaveAttribute('data-scope', 'admin');
  });

  it('Go to dashboard scrolls to the top', async () => {
    const u = userEvent.setup();
    const scrollTo = vi.fn();
    Object.defineProperty(window, 'scrollTo', { value: scrollTo, writable: true });
    await boot(USER);
    await openUserMenu(u);
    await u.click(screen.getByTestId('menu-go-dashboard'));
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('the changelog opens from the footer and closes again', async () => {
    const u = userEvent.setup();
    await boot(USER);
    await u.click(await screen.findByTestId('changelog-open'));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    await u.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('App overlay wiring — alerts and the edit-mode banner', () => {
  it('the bell toggles the alert panel open and shut (toggleAlerts)', async () => {
    const u = userEvent.setup();
    await boot(USER);
    const bell = await screen.findByTestId('alert-bell');

    // Anchored on the panel's own close button, which exists only while the panel
    // is mounted. An earlier draft of this test guessed at a panel testid and fell
    // back through queryByRole('dialog') ?? queryByRole('region') with a
    // .catch(() => null) — which would have passed whatever the bell did, or did
    // not do. That is the exact shape of a vacuous assertion.
    await u.click(bell);
    expect(await screen.findByTestId('alert-panel-close')).toBeInTheDocument();

    await u.click(bell);
    expect(screen.queryByTestId('alert-panel-close')).not.toBeInTheDocument();
  });

  it('the panel\'s own close button dismisses it (closeAlerts, a different path from the bell)', async () => {
    const u = userEvent.setup();
    await boot(USER);
    await u.click(await screen.findByTestId('alert-bell'));
    await u.click(await screen.findByTestId('alert-panel-close'));
    expect(screen.queryByTestId('alert-panel-close')).not.toBeInTheDocument();
  });

  // SPEC-ui-quick-wins AC-009 — a toast's View opens the alert history panel,
  // through the same path as the bell (badge cleared, launcher closed).
  it('a toast\'s View opens the alert history panel, and a second View keeps it open', async () => {
    const u = userEvent.setup();
    await boot(USER);
    await u.click(await screen.findByTestId('toast-view-stub'));
    expect(await screen.findByTestId('alert-panel-close')).toBeInTheDocument();
    // View is "open", never "toggle": a second toast's View must not close it.
    await u.click(screen.getByTestId('toast-view-stub'));
    expect(screen.getByTestId('alert-panel-close')).toBeInTheDocument();
  });

  it('an admin in arrange mode can exit via the banner Done button', async () => {
    const u = userEvent.setup();
    await boot(ADMIN);
    await openGear(u);
    await u.click(screen.getByTestId('gear-edit-dashboard'));
    expect(await screen.findByTestId('edit-mode-banner')).toBeInTheDocument();

    await u.click(screen.getByTestId('exit-edit-mode'));
    expect(screen.queryByTestId('edit-mode-banner')).not.toBeInTheDocument();
  });
});

// SPEC-dashboard-empty-loading AC-010, AC-011 — an admin's empty-box button
// opens the ONE App-level Library aimed at that box, and App returns focus.
describe('App overlay wiring — the Library from an empty box', () => {
  beforeEach(() => {
    stubGrid.collapsed = false;
    stubGrid.boxGone = false;
  });

  it('the box button opens the one Library with that box as its target', async () => {
    const u = userEvent.setup();
    await boot(ADMIN);
    await u.click(await screen.findByTestId('stub-box-add'));
    const lib = await screen.findByTestId('library-stub');
    expect(lib).toHaveAttribute('data-target', 'c1');
    expect(lib).toHaveAttribute('data-target-title', 'Media');
    expect(screen.getAllByTestId('library-stub')).toHaveLength(1);
  });

  it('the Gear\'s Add apps still opens the Library with no target', async () => {
    const u = userEvent.setup();
    await boot(ADMIN);
    // Open from a box first, close, then from the Gear: the target must not stick.
    await u.click(await screen.findByTestId('stub-box-add'));
    await u.click(await screen.findByTestId('lib-close'));
    await openGear(u);
    await u.click(screen.getByTestId('gear-add-apps'));
    expect(await screen.findByTestId('library-stub')).toHaveAttribute('data-target', '');
  });

  it('closing with nothing added returns focus to the box button', async () => {
    const u = userEvent.setup();
    await boot(ADMIN);
    const btn = await screen.findByTestId('stub-box-add');
    await u.click(btn);
    await u.click(await screen.findByTestId('lib-close'));
    expect(screen.queryByTestId('library-stub')).toBeNull();
    expect(btn).toHaveFocus();
  });

  it('when the box filled and the button is gone, focus moves to the added app\'s tile link', async () => {
    const u = userEvent.setup();
    await boot(ADMIN);
    await u.click(await screen.findByTestId('stub-box-add'));
    await u.click(await screen.findByTestId('lib-added'));
    expect(screen.queryByTestId('stub-box-add')).toBeNull();
    await u.click(screen.getByTestId('lib-close'));
    const link = screen.getByTestId('tool-link');
    expect(link.closest('[data-service-id]')).toHaveAttribute('data-service-id', 's9');
    expect(link).toHaveFocus();
  });

  it('when that tile is not rendered, focus moves to the box heading', async () => {
    stubGrid.collapsed = true;
    const u = userEvent.setup();
    await boot(ADMIN);
    await u.click(await screen.findByTestId('stub-box-add'));
    await u.click(await screen.findByTestId('lib-added'));
    await u.click(screen.getByTestId('lib-close'));
    expect(screen.getByRole('heading', { name: 'Media' })).toHaveFocus();
    expect(document.activeElement).not.toBe(document.body);
  });

  it('when the box itself is gone, focus still lands on the dashboard, never <body>', async () => {
    stubGrid.boxGone = true;
    const u = userEvent.setup();
    await boot(ADMIN);
    await u.click(await screen.findByTestId('stub-box-add'));
    await u.click(await screen.findByTestId('lib-added'));
    await u.click(screen.getByTestId('lib-close'));
    expect(document.activeElement).not.toBe(document.body);
    expect(screen.getByTestId('settings-gear')).toHaveFocus();
  });
});
