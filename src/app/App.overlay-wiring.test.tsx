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

vi.mock('../grid/AppGrid', () => ({
  default: () => <div data-testid="app-grid-stub" />,
}));

// The three lazy children, stubbed with buttons that fire the callbacks App
// passes in — the only way to reach them from outside.
vi.mock('../library/LibraryBrowse', () => ({
  default: (props: {
    onClose: () => void;
    onAdded: (s: unknown) => void;
    onCustomAdd: () => void;
  }) => (
    <div data-testid="library-stub">
      <button data-testid="lib-close" onClick={props.onClose}>close</button>
      <button data-testid="lib-custom" onClick={props.onCustomAdd}>custom</button>
      <button
        data-testid="lib-added"
        onClick={() =>
          props.onAdded({
            id: 's9', slug: 's9', name: 'Added App', description: '', url: 'https://a.test',
            icon: '', status: 'UP', favorite: false, iconLight: false, iconDark: false,
          })
        }
      >
        added
      </button>
    </div>
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

const USER: User = { id: 'u1', email: 'nani@ohana.io', role: 'user', themePref: 'system' };
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
  it('gear → Add apps mounts the library, and its onClose unmounts it', async () => {
    const u = userEvent.setup();
    await boot(USER);
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
    await boot(USER);
    await openGear(u);
    await u.click(screen.getByTestId('gear-add-apps'));
    await screen.findByTestId('library-stub');

    await u.click(screen.getByTestId('lib-custom'));
    expect(await screen.findByTestId('form-stub')).toBeInTheDocument();
    expect(screen.queryByTestId('library-stub')).not.toBeInTheDocument();
  });

  it('the library\'s onAdded is wired and leaves the overlay open', async () => {
    const u = userEvent.setup();
    await boot(USER);
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
