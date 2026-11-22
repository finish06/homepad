import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import ResetPasswordScreen from './ResetPasswordScreen';
import { logout, type User } from '../api';
import { acceptReset, lookupReset, type ResetInfo } from '../passwordApi';

// SPEC-password-reset-link AC-006…AC-009, AC-012, AC-019, UX §3 — the reset
// screen opened from /#reset=…: loading, live, dead, signed in as someone
// else, the Save errors and too many tries.

vi.mock('../api', () => ({ logout: vi.fn() }));
vi.mock('../passwordApi', () => ({ lookupReset: vi.fn(), acceptReset: vi.fn() }));

expect.extend(toHaveNoViolations);

const LIVE: ResetInfo = { email: 'jo@example.com', name: 'Jo', expiresAt: '2026-11-21T21:40:00Z' };
const JO: User = { id: 'u-jo', email: 'jo@example.com', role: 'user', themePref: 'system', name: 'Jo', hasPassword: true };
const CALEB: User = { id: 'u-caleb', email: 'caleb@home.lan', role: 'admin', themePref: 'system', name: 'Caleb' };
const ENDS = (() => {
  const d = new Date(LIVE.expiresAt);
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at ${d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
})();

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function renderReset(user: User | null = null) {
  const props = { onDone: vi.fn(), onLeave: vi.fn(), onSignedOut: vi.fn() };
  const utils = render(<ResetPasswordScreen token="tok-abc" user={user} {...props} />);
  return { ...utils, ...props };
}

beforeEach(() => {
  vi.mocked(lookupReset).mockResolvedValue({ ok: true, status: 200, info: LIVE });
  vi.mocked(logout).mockResolvedValue();
});

afterEach(() => {
  vi.clearAllMocks();
});

async function fill(next: string, again = next) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('New password'), next);
  await user.type(screen.getByLabelText('Type it again'), again);
  return user;
}

describe('loading (UX §3.3)', () => {
  it('shows the title and a spinner, then the form', async () => {
    const d = deferred<Awaited<ReturnType<typeof lookupReset>>>();
    vi.mocked(lookupReset).mockReturnValue(d.promise);
    renderReset();
    expect(screen.getByRole('heading', { name: 'Set a new password' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Checking your link…');
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
    d.resolve({ ok: true, status: 200, info: LIVE });
    expect(await screen.findByLabelText('New password')).toBeInTheDocument();
    expect(lookupReset).toHaveBeenCalledWith('tok-abc');
  });
});

describe('live link (AC-019, TC-001)', () => {
  it('names the account, with the hints, the caveat and when the link ends', async () => {
    const { container } = renderReset();
    expect(await screen.findByRole('heading', { name: 'Set a new password for jo@example.com.' })).toBeInTheDocument();
    expect(screen.getByText('At least 8 characters.')).toBeInTheDocument();
    expect(screen.getByText('Saving signs you out on your other devices.')).toBeInTheDocument();
    expect(screen.getByText(`The link ends ${ENDS}.`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save password' })).toBeInTheDocument();

    // Password managers save the new password against the right account.
    const username = container.querySelector('input[autocomplete="username"]') as HTMLInputElement;
    expect(username).not.toBeNull();
    expect(username.value).toBe('jo@example.com');
    expect(username.readOnly).toBe(true);
    expect(screen.getByLabelText('New password')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByLabelText('Type it again')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByLabelText('New password')).toHaveAccessibleDescription('At least 8 characters.');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Save sets the password and signs in', async () => {
    vi.mocked(acceptReset).mockResolvedValue({ ok: true, status: 200, user: JO });
    const { onDone } = renderReset();
    await screen.findByLabelText('New password');
    const user = await fill('a new password');
    await user.click(screen.getByRole('button', { name: 'Save password' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(JO));
    expect(acceptReset).toHaveBeenCalledWith('tok-abc', 'a new password');
  });

  it('shows Saving… while it works', async () => {
    const d = deferred<Awaited<ReturnType<typeof acceptReset>>>();
    vi.mocked(acceptReset).mockReturnValue(d.promise);
    const { onDone } = renderReset();
    await screen.findByLabelText('New password');
    const user = await fill('a new password');
    await user.click(screen.getByRole('button', { name: 'Save password' }));
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(screen.getByLabelText('New password')).toBeDisabled();
    d.resolve({ ok: true, status: 200, user: JO });
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(JO));
  });

  it('signed in as the same person: straight to the form', async () => {
    renderReset(JO);
    expect(await screen.findByLabelText('New password')).toBeInTheDocument();
    expect(screen.queryByText(/You're signed in as/)).not.toBeInTheDocument();
  });
});

describe('errors on Save (AC-009, UX §3.3)', () => {
  it('too short, under New password; the link is not used', async () => {
    renderReset();
    await screen.findByLabelText('New password');
    const user = await fill('short');
    await user.click(screen.getByRole('button', { name: 'Save password' }));
    const field = screen.getByLabelText('New password');
    expect(screen.getByText('Use at least 8 characters.')).toBeInTheDocument();
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription(expect.stringContaining('Use at least 8 characters.'));
    expect(field).toHaveFocus();
    expect(acceptReset).not.toHaveBeenCalled();
  });

  it('too long counts bytes, so emoji hit it sooner', async () => {
    renderReset();
    await screen.findByLabelText('New password');
    const long = '😀'.repeat(19); // 19 characters, 76 bytes
    const user = await fill(long);
    await user.click(screen.getByRole('button', { name: 'Save password' }));
    expect(screen.getByText('That password is too long. Use 72 characters or fewer.')).toBeInTheDocument();
    expect(acceptReset).not.toHaveBeenCalled();
  });

  it('the two differ, under Type it again; what was typed stays', async () => {
    renderReset();
    await screen.findByLabelText('New password');
    const user = await fill('a new password', 'a new passw0rd');
    await user.click(screen.getByRole('button', { name: 'Save password' }));
    const again = screen.getByLabelText('Type it again');
    expect(screen.getByText("The two passwords don't match.")).toBeInTheDocument();
    expect(again).toHaveAttribute('aria-invalid', 'true');
    expect(again).toHaveFocus();
    expect(screen.getByLabelText('New password')).toHaveValue('a new password');
    expect(acceptReset).not.toHaveBeenCalled();
  });

  it('checks on Save, never while typing', async () => {
    renderReset();
    await screen.findByLabelText('New password');
    await fill('short', 'other');
    expect(screen.queryByText('Use at least 8 characters.')).not.toBeInTheDocument();
    expect(screen.queryByText("The two passwords don't match.")).not.toBeInTheDocument();
  });

  it('429 above the button', async () => {
    vi.mocked(acceptReset).mockResolvedValue({ ok: false, status: 429, error: 'too many requests' });
    renderReset();
    await screen.findByLabelText('New password');
    const user = await fill('a new password');
    await user.click(screen.getByRole('button', { name: 'Save password' }));
    expect(await screen.findByText('Too many tries. Wait a minute and try again.')).toBeInTheDocument();
    expect(screen.getByLabelText('New password')).toHaveValue('a new password');
  });

  it('a network failure', async () => {
    vi.mocked(acceptReset).mockResolvedValue({ ok: false, status: 0, error: 'network error' });
    renderReset();
    await screen.findByLabelText('New password');
    const user = await fill('a new password');
    await user.click(screen.getByRole('button', { name: 'Save password' }));
    expect(await screen.findByText("Couldn't save the password. Try again.")).toBeInTheDocument();
  });

  it('404 on Save turns the card dead', async () => {
    vi.mocked(acceptReset).mockResolvedValue({ ok: false, status: 404, error: 'reset link not found' });
    renderReset();
    await screen.findByLabelText('New password');
    const user = await fill('a new password');
    await user.click(screen.getByRole('button', { name: 'Save password' }));
    expect(await screen.findByRole('heading', { name: "This reset link doesn't work anymore." })).toBeInTheDocument();
  });
});

describe('dead link (AC-006, TC-002)', () => {
  it('one message for every reason, with Go to sign in', async () => {
    vi.mocked(lookupReset).mockResolvedValue({ ok: false, status: 404, error: 'reset link not found' });
    const { onLeave, container } = renderReset();
    expect(await screen.findByRole('heading', { name: "This reset link doesn't work anymore." })).toBeInTheDocument();
    expect(screen.getByText('Ask for a new one.')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Go to sign in' }));
    expect(onLeave).toHaveBeenCalled();
  });

  it('reads Go to my dashboard when a session exists', async () => {
    vi.mocked(lookupReset).mockResolvedValue({ ok: false, status: 404, error: 'reset link not found' });
    renderReset(JO);
    expect(await screen.findByRole('button', { name: 'Go to my dashboard' })).toBeInTheDocument();
  });
});

describe('signed in as someone else (UX §3.3, R-3)', () => {
  it('looks the link up first, then asks', async () => {
    const { onLeave } = renderReset(CALEB);
    expect(await screen.findByText("You're signed in as Caleb. Sign out to use this reset link.")).toBeInTheDocument();
    expect(lookupReset).toHaveBeenCalledWith('tok-abc');
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Keep me here' }));
    expect(onLeave).toHaveBeenCalled();
    expect(logout).not.toHaveBeenCalled();
  });

  it('Sign out and continue signs out and shows the form', async () => {
    const { onSignedOut } = renderReset(CALEB);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Sign out and continue' }));
    expect(await screen.findByLabelText('New password')).toBeInTheDocument();
    expect(logout).toHaveBeenCalled();
    expect(onSignedOut).toHaveBeenCalled();
  });

  it('uses the email when the session has no name', async () => {
    renderReset({ ...CALEB, name: '' });
    expect(await screen.findByText("You're signed in as caleb@home.lan. Sign out to use this reset link.")).toBeInTheDocument();
  });
});

describe('too many tries on lookup (AC-012)', () => {
  it('offers Try again, which looks up again', async () => {
    vi.mocked(lookupReset).mockResolvedValueOnce({ ok: false, status: 429, error: 'too many requests' });
    renderReset();
    expect(await screen.findByText('Too many tries. Wait a minute and try again.')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByLabelText('New password')).toBeInTheDocument();
    expect(lookupReset).toHaveBeenCalledTimes(2);
  });
});

// SPEC-signin-hardening UX §3.1 — the reset screen's wait line uses the
// server's Retry-After.
describe('the wait line follows Retry-After', () => {
  it('on save', async () => {
    vi.mocked(acceptReset).mockResolvedValue({ ok: false, status: 429, error: 'too many attempts', retryAfter: 120 });
    renderReset();
    await screen.findByLabelText('New password');
    const user = await fill('a new password');
    await user.click(screen.getByRole('button', { name: 'Save password' }));
    expect(await screen.findByText('Too many tries. Wait 2 minutes and try again.')).toBeInTheDocument();
  });

  it('on lookup', async () => {
    vi.mocked(lookupReset).mockResolvedValueOnce({ ok: false, status: 429, error: 'too many attempts', retryAfter: 180 });
    renderReset();
    expect(await screen.findByText('Too many tries. Wait 3 minutes and try again.')).toBeInTheDocument();
  });
});
