import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

// SPEC-ui-quick-wins §3.7, AC-018..AC-020 — sign-in polish: show/hide the
// password, a Caps Lock hint, and errors that re-announce.
describe('SPEC-ui-quick-wins — password field polish', () => {
  const field = () => screen.getByLabelText(/password/i) as HTMLInputElement;
  const toggle = () => screen.getByRole('button', { name: /(show|hide) password/i });

  it('AC-018: the toggle switches password ↔ text without clearing the value', async () => {
    const user = userEvent.setup();
    render(<AuthForm onAuthed={() => {}} />);
    await user.type(field(), 'hunter22');
    expect(field()).toHaveAttribute('type', 'password');
    expect(toggle()).toHaveAccessibleName('Show password');
    expect(toggle()).toHaveAttribute('aria-pressed', 'false');
    expect(toggle()).toHaveAttribute('type', 'button');
    await user.click(toggle());
    expect(field()).toHaveAttribute('type', 'text');
    expect(field()).toHaveValue('hunter22');
    expect(toggle()).toHaveAccessibleName('Hide password');
    expect(toggle()).toHaveAttribute('aria-pressed', 'true');
    await user.click(toggle());
    expect(field()).toHaveAttribute('type', 'password');
    expect(field()).toHaveValue('hunter22');
  });

  it('AC-018: focus and caret stay in the field after a toggle', async () => {
    const user = userEvent.setup();
    render(<AuthForm onAuthed={() => {}} />);
    await user.type(field(), 'hunter22');
    field().setSelectionRange(3, 3);
    await user.click(toggle());
    expect(field()).toHaveFocus();
    expect(field().selectionStart).toBe(3);
    expect(field().selectionEnd).toBe(3);
    // Keyboard path: Tab to the toggle, press it; focus comes back to the field.
    field().setSelectionRange(5, 5);
    await user.tab();
    expect(toggle()).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(field()).toHaveFocus();
    expect(field().selectionStart).toBe(5);
  });

  it('AC-018: the toggle is not part of the field\'s accessible name, and sits outside the label', async () => {
    render(<AuthForm onAuthed={() => {}} />);
    expect(field()).toHaveAccessibleName('Password');
    const label = document.querySelector(`label[for="${field().id}"]`);
    expect(label).not.toBeNull();
    expect(label!.contains(toggle())).toBe(false);
  });

  it('AC-019: Caps Lock on while focused shows a linked, announced hint; off or blur hides it', async () => {
    render(<AuthForm onAuthed={() => {}} />);
    const input = field();
    act(() => input.focus());
    // jsdom's KeyboardEvent.getModifierState reads the modifierCapsLock init.
    fireEvent.keyDown(input, { key: 'A', modifierCapsLock: true });
    const hint = await screen.findByText('Caps Lock is on');
    expect(hint.closest('[aria-live="polite"]')).not.toBeNull();
    expect(input.getAttribute('aria-describedby') ?? '').toContain(hint.id);
    fireEvent.keyUp(input, { key: 'CapsLock', modifierCapsLock: false });
    expect(screen.queryByText('Caps Lock is on')).toBeNull();
    expect(input.getAttribute('aria-describedby') ?? '').not.toContain(hint.id);
    fireEvent.keyDown(input, { key: 'A', modifierCapsLock: true });
    expect(screen.getByText('Caps Lock is on')).toBeInTheDocument();
    act(() => input.blur());
    expect(screen.queryByText('Caps Lock is on')).toBeNull();
  });

  it('AC-019: in set-up mode the Caps Lock hint joins the password hint in aria-describedby', async () => {
    vi.mocked(authConfig).mockResolvedValue(cfg({ setupNeeded: true }));
    render(<AuthForm onAuthed={() => {}} />);
    await screen.findByText('Set up Homepad');
    const input = field();
    const rule = screen.getByText('At least 8 characters.');
    act(() => input.focus());
    fireEvent.keyDown(input, { key: 'A', modifierCapsLock: true });
    const hint = screen.getByText('Caps Lock is on');
    const ids = (input.getAttribute('aria-describedby') ?? '').split(' ');
    expect(ids).toEqual(expect.arrayContaining([rule.id, hint.id]));
  });

  it('AC-020: a second failure with the same text replaces the alert node', async () => {
    const user = userEvent.setup();
    vi.mocked(login).mockResolvedValue({ ok: false, status: 401, error: 'invalid email or password' });
    render(<AuthForm onAuthed={() => {}} />);
    await user.type(screen.getByLabelText(/email/i), 'a@b.lan');
    await user.type(field(), 'wrongwrong');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));
    const first = await screen.findByRole('alert');
    expect(first).toHaveTextContent('invalid email or password');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));
    await waitFor(() => expect(login).toHaveBeenCalledTimes(2));
    const second = await screen.findByRole('alert');
    expect(second).toHaveTextContent('invalid email or password');
    expect(second).not.toBe(first);
    expect(first.isConnected).toBe(false);
  });

  it('has no axe violations with the toggle and the Caps Lock hint showing', async () => {
    const { container } = render(<AuthForm onAuthed={() => {}} />);
    await screen.findByText('Sign in to your dashboard');
    const input = field();
    act(() => input.focus());
    fireEvent.keyDown(input, { key: 'A', modifierCapsLock: true });
    expect(screen.getByText('Caps Lock is on')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});

