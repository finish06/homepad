import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import AuthForm from './AuthForm';
import { authConfig, login, register, type AuthConfig, type User } from '../api';

// SPEC-household-basics AC-005, UX §2 (plan TASK-202) — the sign-in card's
// three states: Set up Homepad (no account yet), Sign in with sign-up closed
// (no "Create account" at all), and Sign in with sign-up open (today's card).
// While the config call is in flight the card renders the closed state, so
// "Create account" never flashes in and out.

vi.mock('../api', () => ({
  authConfig: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
}));

expect.extend(toHaveNoViolations);

const ADMIN: User = { id: 'a1', email: 'caleb@home.lan', role: 'admin', themePref: 'system' };
const cfg = (c: Partial<AuthConfig>): AuthConfig => ({
  oidcEnabled: false,
  registration: 'invite_only',
  setupNeeded: false,
  ...c,
});

beforeEach(() => {
  vi.mocked(authConfig).mockResolvedValue(cfg({}));
});

afterEach(() => {
  vi.clearAllMocks();
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('Set up Homepad (setupNeeded)', () => {
  it('shows the set-up card: title, admin line, password hint, one button', async () => {
    vi.mocked(authConfig).mockResolvedValue(cfg({ setupNeeded: true, oidcEnabled: true }));
    render(<AuthForm onAuthed={() => {}} />);
    expect(await screen.findByText('Set up Homepad')).toBeInTheDocument();
    expect(screen.getByText('This first account is the admin.')).toBeInTheDocument();
    expect(screen.getByText('At least 8 characters.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create admin account' })).toBeInTheDocument();
    // No "Sign in" link (nobody to sign in as) and no PocketID (it may not make an admin).
    expect(screen.queryByRole('button', { name: /^sign in$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /pocketid/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create account/i })).not.toBeInTheDocument();
  });

  it('creates the admin account, then signs in', async () => {
    const user = userEvent.setup();
    const onAuthed = vi.fn();
    vi.mocked(authConfig).mockResolvedValue(cfg({ setupNeeded: true }));
    vi.mocked(register).mockResolvedValue({ ok: true, status: 201 });
    vi.mocked(login).mockResolvedValue({ ok: true, status: 200, user: ADMIN });
    render(<AuthForm onAuthed={onAuthed} />);
    await screen.findByText('Set up Homepad');
    await user.type(screen.getByLabelText(/email/i), ADMIN.email);
    await user.type(screen.getByLabelText(/password/i), 'longenough');
    await user.click(screen.getByRole('button', { name: 'Create admin account' }));
    expect(register).toHaveBeenCalledWith(ADMIN.email, 'longenough');
    expect(login).toHaveBeenCalledWith(ADMIN.email, 'longenough');
    expect(onAuthed).toHaveBeenCalledWith(ADMIN);
  });

  it('when someone else finished setup first (403), says so and switches to Sign in', async () => {
    const user = userEvent.setup();
    vi.mocked(authConfig).mockResolvedValue(cfg({ setupNeeded: true }));
    vi.mocked(register).mockResolvedValue({ ok: false, status: 403, error: 'registration is invite-only' });
    render(<AuthForm onAuthed={() => {}} />);
    await screen.findByText('Set up Homepad');
    await user.type(screen.getByLabelText(/email/i), ADMIN.email);
    await user.type(screen.getByLabelText(/password/i), 'longenough');
    await user.click(screen.getByRole('button', { name: 'Create admin account' }));
    expect(await screen.findByText('Someone else just finished setup. Sign in instead.')).toBeInTheDocument();
    expect(screen.getByText('Sign in to your dashboard')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
    expect(screen.queryByText('Set up Homepad')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create account/i })).not.toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('shows other set-up errors as the API words them', async () => {
    const user = userEvent.setup();
    vi.mocked(authConfig).mockResolvedValue(cfg({ setupNeeded: true }));
    vi.mocked(register).mockResolvedValue({ ok: false, status: 400, error: 'invalid email address' });
    render(<AuthForm onAuthed={() => {}} />);
    await screen.findByText('Set up Homepad');
    await user.type(screen.getByLabelText(/email/i), 'a@b');
    await user.type(screen.getByLabelText(/password/i), 'longenough');
    await user.click(screen.getByRole('button', { name: 'Create admin account' }));
    expect(await screen.findByText('invalid email address')).toBeInTheDocument();
    expect(screen.getByText('Set up Homepad')).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    vi.mocked(authConfig).mockResolvedValue(cfg({ setupNeeded: true }));
    const { container } = render(<AuthForm onAuthed={() => {}} />);
    await screen.findByText('Set up Homepad');
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('Sign in, sign-up closed (invite_only)', () => {
  it('has no "Create account" control and no hint about getting an account', async () => {
    vi.mocked(authConfig).mockResolvedValue(cfg({ registration: 'invite_only', oidcEnabled: true }));
    render(<AuthForm onAuthed={() => {}} />);
    expect(await screen.findByRole('button', { name: /pocketid/i })).toBeInTheDocument();
    expect(screen.getByText('Sign in to your dashboard')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create account/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/create/i)).not.toBeInTheDocument();
  });

  it('renders the closed state while the config call is in flight', async () => {
    const d = deferred<AuthConfig>();
    vi.mocked(authConfig).mockReturnValue(d.promise);
    render(<AuthForm onAuthed={() => {}} />);
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create account/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Set up Homepad')).not.toBeInTheDocument();
    d.resolve(cfg({ registration: 'open' }));
    expect(await screen.findByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = render(<AuthForm onAuthed={() => {}} />);
    await screen.findByText('Sign in to your dashboard');
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('Sign in, sign-up open', () => {
  it('behaves as today: Create account flips the card, registers, then signs in', async () => {
    const user = userEvent.setup();
    const onAuthed = vi.fn();
    vi.mocked(authConfig).mockResolvedValue(cfg({ registration: 'open' }));
    vi.mocked(register).mockResolvedValue({ ok: true, status: 201 });
    vi.mocked(login).mockResolvedValue({ ok: true, status: 200, user: ADMIN });
    render(<AuthForm onAuthed={onAuthed} />);
    await user.click(await screen.findByRole('button', { name: /create account/i }));
    expect(screen.getByText('Create your account')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/email/i), ADMIN.email);
    await user.type(screen.getByLabelText(/password/i), 'longenough');
    await user.click(screen.getByRole('button', { name: /create account/i }));
    expect(register).toHaveBeenCalledWith(ADMIN.email, 'longenough');
    expect(onAuthed).toHaveBeenCalledWith(ADMIN);
  });

  it('shows the account limit in plain words when open sign-up hits the cap', async () => {
    const user = userEvent.setup();
    vi.mocked(authConfig).mockResolvedValue(cfg({ registration: 'open' }));
    vi.mocked(register).mockResolvedValue({ ok: false, status: 409, error: 'account limit reached (limit 12)' });
    render(<AuthForm onAuthed={() => {}} />);
    await user.click(await screen.findByRole('button', { name: /create account/i }));
    await user.type(screen.getByLabelText(/email/i), ADMIN.email);
    await user.type(screen.getByLabelText(/password/i), 'longenough');
    await user.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByText('This Homepad has reached its limit of 12 accounts.')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });
});
