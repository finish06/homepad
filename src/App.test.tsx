import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitForElementToBeRemoved } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { authConfig, login, logout, me, register, setThemePref, type User } from './api';

// AppGrid (SPEC-app-grid §2) is the dashboard layout; it has its own tests, so
// stub it here to keep the auth-gate tests isolated from its data fetch. The stub
// reflects isAdmin so we can assert App threads it through.
vi.mock('./AppGrid', () => ({
  default: (props: { isAdmin?: boolean }) => (
    <div data-testid="app-grid-stub" data-admin={String(!!props.isAdmin)} />
  ),
}));

// v9.3 §7.3 — the admin Settings modal has its own tests (SettingsPanel.test);
// stub it here so the App-wiring tests assert only the trigger/mount, and can
// read back the props App threads in (isAdmin, oidcEnabled).
vi.mock('./SettingsPanel', () => ({
  default: (props: { isAdmin?: boolean; oidcEnabled?: boolean; onClose: () => void }) => (
    <div
      data-testid="settings-panel-stub"
      data-admin={String(!!props.isAdmin)}
      data-oidc={String(!!props.oidcEnabled)}
    >
      <button data-testid="settings-panel-close" onClick={props.onClose}>
        close
      </button>
    </div>
  ),
}));

vi.mock('./api', () => ({
  authConfig: vi.fn(),
  me: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  setThemePref: vi.fn(),
  // Home fetches categories for the add-custom-app form's category picker.
  categories: vi.fn(() => Promise.resolve([])),
  // v8: Home now wraps the grid in ServicesProvider, which loads the shared
  // Service[] for the command launcher. Stub it so the provider's fetch resolves.
  services: vi.fn(() => Promise.resolve([])),
  // v13: the provider loads + re-polls via servicesWithStatus. Stub it so the
  // initial load and any poll resolve to an empty, 200 list.
  servicesWithStatus: vi.fn(() => Promise.resolve({ status: 200, services: [] })),
}));

const mockedAuthConfig = vi.mocked(authConfig);
const mockedMe = vi.mocked(me);
const mockedLogin = vi.mocked(login);
const mockedRegister = vi.mocked(register);
const mockedLogout = vi.mocked(logout);
const mockedSetThemePref = vi.mocked(setThemePref);

const USER: User = { id: 'u1', email: 'nani@ohana.io', role: 'user', themePref: 'system' };
const ADMIN: User = { id: 'a1', email: 'lilo@ohana.io', role: 'admin', themePref: 'system' };

beforeEach(() => {
  mockedMe.mockResolvedValue(null);
  mockedAuthConfig.mockResolvedValue({ oidcEnabled: false });
  mockedSetThemePref.mockResolvedValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
  document.documentElement.classList.remove('dark');
  localStorage.clear();
});

async function dropLoading() {
  await waitForElementToBeRemoved(() => screen.queryByText(/loading/i));
}

// v7 ux-redesign §3 — the authenticated dashboard surface carries the .app-surface
// gradient class (radial accents over a light/dark base) instead of the flat
// bg-neutral-50. jsdom can't compute the gradient; we assert the class hook on
// the <main> region (verified visually against specs/screenshots/).
describe('v7 §3 — global gradient surface', () => {
  it('applies .app-surface to the authenticated dashboard main region', async () => {
    mockedMe.mockResolvedValue(USER);
    render(<App />);
    await dropLoading();
    expect(screen.getByRole('main').className).toContain('app-surface');
  });
});

describe('auth gate', () => {
  it('shows the login form for an unauthenticated visitor', async () => {
    render(<App />);
    await dropLoading();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByTestId('app-grid-stub')).not.toBeInTheDocument();
  });

  it('shows the homepad logo on the auth page (#88)', async () => {
    render(<App />);
    await dropLoading();
    const logo = screen.getByRole('img', { name: /homepad/i });
    expect(logo).toHaveAttribute('src', '/icon-192.png');
  });

  it('shows the catalog directly when an existing session is found', async () => {
    mockedMe.mockResolvedValue(USER);
    render(<App />);
    await dropLoading();
    expect(screen.getByTestId('app-grid-stub')).toBeInTheDocument();
    // v7 §6: the email moved into the avatar menu; identity is still always
    // present via the trigger (its title carries the email per §8).
    expect(screen.getByTestId('user-menu-trigger')).toHaveAttribute('title', USER.email);
  });

  it('logs in and reveals the catalog', async () => {
    const user = userEvent.setup();
    mockedLogin.mockResolvedValue({ ok: true, status: 200, user: USER });
    render(<App />);
    await dropLoading();

    await user.type(screen.getByLabelText(/email/i), USER.email);
    await user.type(screen.getByLabelText(/password/i), 'stitch626');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByTestId('app-grid-stub')).toBeInTheDocument();
    expect(mockedLogin).toHaveBeenCalledWith(USER.email, 'stitch626');
  });

  it('shows an error message when login fails', async () => {
    const user = userEvent.setup();
    mockedLogin.mockResolvedValue({ ok: false, status: 401, error: 'bad credentials' });
    render(<App />);
    await dropLoading();

    await user.type(screen.getByLabelText(/email/i), USER.email);
    await user.type(screen.getByLabelText(/password/i), 'wrong');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('bad credentials')).toBeInTheDocument();
    expect(screen.queryByTestId('app-grid-stub')).not.toBeInTheDocument();
  });

  it('registers then logs in the new account', async () => {
    const user = userEvent.setup();
    mockedRegister.mockResolvedValue({ ok: true, status: 201 });
    mockedLogin.mockResolvedValue({ ok: true, status: 200, user: USER });
    render(<App />);
    await dropLoading();

    await user.click(screen.getByRole('button', { name: /need an account\? register/i }));
    await user.type(screen.getByLabelText(/email/i), USER.email);
    await user.type(screen.getByLabelText(/password/i), 'stitch626');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByTestId('app-grid-stub')).toBeInTheDocument();
    expect(mockedRegister).toHaveBeenCalledWith(USER.email, 'stitch626');
    expect(mockedLogin).toHaveBeenCalledWith(USER.email, 'stitch626');
  });

  it('does not attempt login when registration fails', async () => {
    const user = userEvent.setup();
    mockedRegister.mockResolvedValue({ ok: false, status: 409, error: 'email taken' });
    render(<App />);
    await dropLoading();

    await user.click(screen.getByRole('button', { name: /need an account\? register/i }));
    await user.type(screen.getByLabelText(/email/i), USER.email);
    await user.type(screen.getByLabelText(/password/i), 'stitch626');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText('email taken')).toBeInTheDocument();
    expect(mockedLogin).not.toHaveBeenCalled();
  });

  it('logs out back to the login form', async () => {
    const user = userEvent.setup();
    mockedMe.mockResolvedValue(USER);
    mockedLogout.mockResolvedValue();
    render(<App />);
    await dropLoading();

    // v7 §6: Log out now lives inside the avatar menu.
    await user.click(await screen.findByTestId('user-menu-trigger'));
    await user.click(screen.getByTestId('menu-logout'));

    expect(await screen.findByRole('button', { name: /sign in/i })).toBeInTheDocument();
    expect(mockedLogout).toHaveBeenCalled();
    expect(screen.queryByTestId('app-grid-stub')).not.toBeInTheDocument();
  });
});

// Design-system a11y fixes for the login screen (Kare's approved system).
// jsdom has no layout engine, so we can't measure rendered px here — we assert
// the Tailwind class hooks that enforce the rule, and Kare verifies the real
// pixels in the browser before merge. Test names describe the observed symptom.
describe('login a11y — design system', () => {
  // #177 (Blocker, finding #2): every interactive target on the login card must
  // be >=44x44px. Measured before fix: Sign in 36px, inputs 38px, Register 20px.
  it('A177 — all login interactive targets carry a >=44px hit area', async () => {
    mockedAuthConfig.mockResolvedValue({ oidcEnabled: true });
    render(<App />);
    await dropLoading();

    expect(screen.getByRole('button', { name: /sign in/i })).toHaveClass('min-h-[44px]');
    expect(screen.getByLabelText(/email/i)).toHaveClass('min-h-[44px]');
    expect(screen.getByLabelText(/password/i)).toHaveClass('min-h-[44px]');
    expect(
      screen.getByRole('button', { name: /need an account\? register/i }),
    ).toHaveClass('min-h-[44px]');
    expect(await screen.findByRole('button', { name: /pocketid/i })).toHaveClass(
      'min-h-[44px]',
    );
  });

  // #178 (High, finding #4): the "or" divider label was text-neutral-400
  // (#A3A3A3, 2.52:1) — fails AA body. Must clear >=4.5:1; neutral-500
  // (#737373) measures 4.74:1.
  it('A178 — the "or" divider label clears AA body contrast', async () => {
    mockedAuthConfig.mockResolvedValue({ oidcEnabled: true });
    render(<App />);
    await dropLoading();
    await screen.findByRole('button', { name: /pocketid/i });

    const divider = screen.getByText((_, el) => el?.textContent === 'or');
    expect(divider).not.toHaveClass('text-neutral-400');
    expect(divider).toHaveClass('text-neutral-500');
  });
});

// v7 ux-redesign §6 — top-bar declutter. The six bar controls collapse into a
// single avatar UserMenu: theme, Edit (admin), Personal settings, identity,
// role, Log out all move INTO the dropdown. The bar shows only the wordmark and
// the avatar. Avatar shows real initials (§6.2) with an email-first-letter
// fallback. Full a11y per §8.
describe('v7 §6 — top bar declutter + user menu', () => {
  const NAMED_ADMIN: User = { ...ADMIN, name: 'Caleb Dunn' } as User;

  async function openMenu(user: ReturnType<typeof userEvent.setup>) {
    const trigger = await screen.findByTestId('user-menu-trigger');
    await user.click(trigger);
    return trigger;
  }

  it('shows only the wordmark + avatar in the bar (old inline controls removed)', async () => {
    mockedMe.mockResolvedValue(ADMIN);
    render(<App />);
    await dropLoading();
    expect(await screen.findByTestId('user-menu-trigger')).toBeInTheDocument();
    // The admin Edit toggle + theme control still live inside the (closed)
    // menu, not loose in the bar.
    expect(screen.queryByTestId('edit-toggle')).not.toBeInTheDocument();
    expect(screen.queryByTestId('theme-control')).not.toBeInTheDocument();
    expect(screen.queryByTestId('user-menu')).not.toBeInTheDocument();
    // #166 — the per-user settings gear (Arrange-mode entry point) IS a
    // deliberate always-visible bar control, shown to every logged-in user.
    expect(screen.getByTestId('settings-gear')).toBeInTheDocument();
  });

  it('avatar derives real initials from the display name (Caleb Dunn → CD)', async () => {
    mockedMe.mockResolvedValue(NAMED_ADMIN);
    render(<App />);
    await dropLoading();
    expect(await screen.findByTestId('user-menu-trigger')).toHaveTextContent('CD');
  });

  it('avatar falls back to the email first letter when no name is set', async () => {
    mockedMe.mockResolvedValue({ ...USER, email: 'nani@ohana.io' });
    render(<App />);
    await dropLoading();
    expect(await screen.findByTestId('user-menu-trigger')).toHaveTextContent('N');
  });

  it('trigger advertises a menu popup and reflects open state via aria-expanded', async () => {
    const user = userEvent.setup();
    mockedMe.mockResolvedValue(USER);
    render(<App />);
    await dropLoading();
    const trigger = await screen.findByTestId('user-menu-trigger');
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('user-menu')).toHaveAttribute('role', 'menu');
  });

  it('menu carries identity, role, theme control, settings and logout for every user', async () => {
    const user = userEvent.setup();
    mockedMe.mockResolvedValue(USER);
    render(<App />);
    await dropLoading();
    await openMenu(user);
    expect(screen.getByTestId('user-menu-email')).toHaveTextContent('nani@ohana.io');
    expect(screen.getByTestId('user-menu-role')).toHaveTextContent('user');
    expect(screen.getByTestId('theme-control')).toBeInTheDocument();
    expect(screen.getByTestId('menu-logout')).toBeInTheDocument();
  });

  // SPEC-app-grid §2/§7 — the Catalog-only Edit-tiles / Arrange modes are retired
  // with that layout; the Gear no longer carries them (#223). It keeps the
  // service-management actions that outlive the swap (Add apps / Add custom app).
  it('the Gear no longer offers Edit tiles or Arrange (retired with Catalog, #223)', async () => {
    const user = userEvent.setup();
    mockedMe.mockResolvedValue(ADMIN);
    render(<App />);
    await dropLoading();
    await user.click(screen.getByTestId('settings-gear'));
    expect(screen.queryByTestId('gear-edit-tiles')).not.toBeInTheDocument();
    expect(screen.queryByTestId('gear-arrange')).not.toBeInTheDocument();
    expect(screen.getByTestId('gear-add-apps')).toBeInTheDocument();
  });

  // v10 A9 — arrange mode toggle is gone from the avatar menu; v18 also moves
  // Edit dashboard out to the Gear. The avatar menu now carries go-dashboard,
  // admin-settings, logout and the theme control.
  it('A9 — avatar menu: no Personal settings / no Edit dashboard; go-dashboard/admin-settings/logout/theme remain', async () => {
    const user = userEvent.setup();
    mockedMe.mockResolvedValue(ADMIN);
    render(<App />);
    await dropLoading();
    await openMenu(user);
    expect(screen.queryByTestId('menu-settings')).not.toBeInTheDocument();
    expect(screen.queryByTestId('menu-edit')).not.toBeInTheDocument();
    expect(screen.getByTestId('menu-go-dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('menu-admin-settings')).toBeInTheDocument();
    expect(screen.getByTestId('menu-logout')).toBeInTheDocument();
    expect(screen.getByTestId('theme-control')).toBeInTheDocument();
  });

  it('menu Log out performs the logout and returns to the login form', async () => {
    const user = userEvent.setup();
    mockedMe.mockResolvedValue(USER);
    mockedLogout.mockResolvedValue();
    render(<App />);
    await dropLoading();
    await openMenu(user);
    await user.click(screen.getByTestId('menu-logout'));
    expect(mockedLogout).toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('Esc closes the menu and restores focus to the trigger (§8)', async () => {
    const user = userEvent.setup();
    mockedMe.mockResolvedValue(USER);
    render(<App />);
    await dropLoading();
    const trigger = await openMenu(user);
    expect(screen.getByTestId('user-menu')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('user-menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

// v7 §6.3 relocated the three-segment theme control from the bar into the
// avatar menu's Appearance group (the same ThemeControl/useTheme — no duplicated
// state). These v3 cases open the menu first, then exercise the control.
describe('v3 — theme control (now in the avatar menu) (A1, A12)', () => {
  async function openMenu(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByTestId('user-menu-trigger'));
  }

  it('shows the three-option control for a logged-in user (A1)', async () => {
    const user = userEvent.setup();
    mockedMe.mockResolvedValue(USER); // non-admin — control is not admin-gated
    render(<App />);
    await dropLoading();
    await openMenu(user);
    expect(screen.getByTestId('theme-control')).toBeInTheDocument();
    expect(screen.getByTestId('theme-system')).toBeInTheDocument();
    expect(screen.getByTestId('theme-light')).toBeInTheDocument();
    expect(screen.getByTestId('theme-dark')).toBeInTheDocument();
  });

  it('marks the segment matching the user stored themePref active', async () => {
    const user = userEvent.setup();
    mockedMe.mockResolvedValue({ ...USER, themePref: 'dark' });
    render(<App />);
    await dropLoading();
    await openMenu(user);
    expect(screen.getByTestId('theme-dark')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('theme-system')).toHaveAttribute('aria-pressed', 'false');
  });

  it('does NOT show the control on the pre-auth screen (A12)', async () => {
    render(<App />); // logged out
    await dropLoading();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByTestId('theme-control')).not.toBeInTheDocument();
  });

  it('selecting Dark fires PATCH /api/me and applies the dark surface', async () => {
    const user = userEvent.setup();
    mockedMe.mockResolvedValue(USER);
    render(<App />);
    await dropLoading();

    await openMenu(user);
    await user.click(screen.getByTestId('theme-dark'));

    expect(mockedSetThemePref).toHaveBeenCalledWith('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});

describe('PocketID login button', () => {
  const pocketId = () => screen.queryByRole('button', { name: /log in with pocketid/i });

  it('shows the button when oidc is enabled', async () => {
    mockedAuthConfig.mockResolvedValue({ oidcEnabled: true });
    render(<App />);
    await dropLoading();
    expect(await screen.findByRole('button', { name: /log in with pocketid/i })).toBeInTheDocument();
    // local login stays intact alongside it
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('hides the button when oidc is disabled', async () => {
    mockedAuthConfig.mockResolvedValue({ oidcEnabled: false });
    render(<App />);
    await dropLoading();
    // give the config effect a chance to resolve before asserting absence
    expect(await screen.findByRole('button', { name: /sign in/i })).toBeInTheDocument();
    expect(pocketId()).not.toBeInTheDocument();
  });

  it('navigates to /api/auth/oidc/login when activated', async () => {
    const user = userEvent.setup();
    // jsdom's location.assign is non-configurable; swap the whole object.
    const assign = vi.fn();
    vi.stubGlobal('location', { assign });
    mockedAuthConfig.mockResolvedValue({ oidcEnabled: true });
    render(<App />);
    await dropLoading();

    await user.click(await screen.findByRole('button', { name: /log in with pocketid/i }));

    expect(assign).toHaveBeenCalledWith('/api/auth/oidc/login');
    vi.unstubAllGlobals();
  });
});

// v9.3 §7.3 / A17 — the admin Settings surface (App Library management +
// read-only System settings) mounts as a modal from the avatar menu. The
// trigger is admin-only; non-admins never see it and so can never reach the
// admin views. Esc/close dismisses. The panel itself (SettingsPanel) is stubbed
// — its content/a11y is covered by SettingsPanel.test.
describe('v9.3 §7.3 — admin Settings modal wiring (A17)', () => {
  async function openMenu(user: ReturnType<typeof userEvent.setup>) {
    const trigger = await screen.findByTestId('user-menu-trigger');
    await user.click(trigger);
  }

  it('admin sees an Admin settings menu item that opens the settings panel', async () => {
    const user = userEvent.setup();
    mockedMe.mockResolvedValue(ADMIN);
    render(<App />);
    await dropLoading();
    await openMenu(user);
    expect(screen.queryByTestId('settings-panel-stub')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('menu-admin-settings'));
    const panel = screen.getByTestId('settings-panel-stub');
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveAttribute('data-admin', 'true');
  });

  it('non-admin never sees the Admin settings trigger', async () => {
    const user = userEvent.setup();
    mockedMe.mockResolvedValue(USER);
    render(<App />);
    await dropLoading();
    await openMenu(user);
    expect(screen.queryByTestId('menu-admin-settings')).not.toBeInTheDocument();
  });

  it('passes the resolved OIDC state into the panel', async () => {
    const user = userEvent.setup();
    mockedMe.mockResolvedValue(ADMIN);
    mockedAuthConfig.mockResolvedValue({ oidcEnabled: true });
    render(<App />);
    await dropLoading();
    await openMenu(user);
    await user.click(screen.getByTestId('menu-admin-settings'));
    expect(screen.getByTestId('settings-panel-stub')).toHaveAttribute('data-oidc', 'true');
  });

  it('closing the panel unmounts it', async () => {
    const user = userEvent.setup();
    mockedMe.mockResolvedValue(ADMIN);
    render(<App />);
    await dropLoading();
    await openMenu(user);
    await user.click(screen.getByTestId('menu-admin-settings'));
    await user.click(screen.getByTestId('settings-panel-close'));
    expect(screen.queryByTestId('settings-panel-stub')).not.toBeInTheDocument();
  });
});
