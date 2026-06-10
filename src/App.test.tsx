import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitForElementToBeRemoved } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { authConfig, login, logout, me, register, type User } from './api';

// Catalog has its own tests; stub it so the auth-gate tests stay isolated from
// the /api/services fetch.
vi.mock('./Catalog', () => ({ default: () => <div data-testid="catalog-stub" /> }));

vi.mock('./api', () => ({
  authConfig: vi.fn(),
  me: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
}));

const mockedAuthConfig = vi.mocked(authConfig);
const mockedMe = vi.mocked(me);
const mockedLogin = vi.mocked(login);
const mockedRegister = vi.mocked(register);
const mockedLogout = vi.mocked(logout);

const USER: User = { id: 'u1', email: 'nani@ohana.io', role: 'user' };

beforeEach(() => {
  mockedMe.mockResolvedValue(null);
  mockedAuthConfig.mockResolvedValue({ oidcEnabled: false });
});

afterEach(() => {
  vi.clearAllMocks();
});

async function dropLoading() {
  await waitForElementToBeRemoved(() => screen.queryByText(/loading/i));
}

describe('auth gate', () => {
  it('shows the login form for an unauthenticated visitor', async () => {
    render(<App />);
    await dropLoading();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByTestId('catalog-stub')).not.toBeInTheDocument();
  });

  it('shows the catalog directly when an existing session is found', async () => {
    mockedMe.mockResolvedValue(USER);
    render(<App />);
    await dropLoading();
    expect(screen.getByTestId('catalog-stub')).toBeInTheDocument();
    expect(screen.getByText(USER.email)).toBeInTheDocument();
  });

  it('logs in and reveals the catalog', async () => {
    const user = userEvent.setup();
    mockedLogin.mockResolvedValue({ ok: true, status: 200, user: USER });
    render(<App />);
    await dropLoading();

    await user.type(screen.getByLabelText(/email/i), USER.email);
    await user.type(screen.getByLabelText(/password/i), 'stitch626');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByTestId('catalog-stub')).toBeInTheDocument();
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
    expect(screen.queryByTestId('catalog-stub')).not.toBeInTheDocument();
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

    expect(await screen.findByTestId('catalog-stub')).toBeInTheDocument();
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

    await user.click(screen.getByRole('button', { name: /log out/i }));

    expect(await screen.findByRole('button', { name: /sign in/i })).toBeInTheDocument();
    expect(mockedLogout).toHaveBeenCalled();
    expect(screen.queryByTestId('catalog-stub')).not.toBeInTheDocument();
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
