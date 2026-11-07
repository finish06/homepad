import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import JoinScreen from './JoinScreen';
import { acceptInvite, logout, lookupInvite, type InviteInfo, type User } from '../api';

// SPEC-household-basics AC-020, UX §4 (plan TASK-203) — the Join screen opened
// from an invite link: live, loading, dead-link and already-signed-in states,
// and the Join errors.

vi.mock('../api', () => ({
  lookupInvite: vi.fn(),
  acceptInvite: vi.fn(),
  logout: vi.fn(),
}));

expect.extend(toHaveNoViolations);

const LIVE: InviteInfo = { name: 'Alex', role: 'user', inviterName: 'Caleb', expiresAt: '2026-11-14T12:00:00Z' };
const ALEX: User = { id: 'u-alex', email: 'alex@example.com', role: 'user', themePref: 'system', name: 'Alex' };
const CALEB: User = { id: 'u-caleb', email: 'caleb@home.lan', role: 'admin', themePref: 'system', name: 'Caleb' };
const DAY = new Date(LIVE.expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function renderJoin(user: User | null = null) {
  const props = { onJoined: vi.fn(), onLeave: vi.fn(), onSignedOut: vi.fn() };
  const utils = render(<JoinScreen token="tok-abc" user={user} {...props} />);
  return { ...utils, ...props };
}

beforeEach(() => {
  vi.mocked(lookupInvite).mockResolvedValue({ ok: true, status: 200, invite: LIVE });
  vi.mocked(logout).mockResolvedValue();
});

afterEach(() => {
  vi.clearAllMocks();
});

async function fillAndJoin(email = 'alex@example.com', password = 'longenough') {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Join' }));
  return user;
}

describe('live invite', () => {
  it('says who invited you and what role you will have, with the name prefilled', async () => {
    renderJoin();
    expect(await screen.findByText('Caleb invited you.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Join Homepad' })).toBeInTheDocument();
    expect(screen.getByText("You'll be a member.")).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Alex');
    expect(screen.getByText('At least 8 characters.')).toBeInTheDocument();
    expect(screen.getByText(`The link ends ${DAY}.`)).toBeInTheDocument();
    expect(lookupInvite).toHaveBeenCalledWith('tok-abc');
  });

  it('reads "You\'ll be an admin." for an admin invite', async () => {
    vi.mocked(lookupInvite).mockResolvedValue({ ok: true, status: 200, invite: { ...LIVE, role: 'admin' } });
    renderJoin();
    expect(await screen.findByText("You'll be an admin.")).toBeInTheDocument();
  });

  it('shows a spinner while the lookup is in flight, then the form', async () => {
    const d = deferred<Awaited<ReturnType<typeof lookupInvite>>>();
    vi.mocked(lookupInvite).mockReturnValue(d.promise);
    renderJoin();
    expect(screen.getByRole('status')).toHaveTextContent('Checking your invite…');
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
    d.resolve({ ok: true, status: 200, invite: LIVE });
    expect(await screen.findByLabelText('Email')).toBeInTheDocument();
  });

  it('joins with the (editable) name, email and password and lands on the dashboard', async () => {
    vi.mocked(acceptInvite).mockResolvedValue({ ok: true, status: 201, user: ALEX });
    const { onJoined } = renderJoin();
    await screen.findByText('Caleb invited you.');
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Alexis');
    await fillAndJoin();
    expect(acceptInvite).toHaveBeenCalledWith({
      token: 'tok-abc',
      email: 'alex@example.com',
      password: 'longenough',
      name: 'Alexis',
    });
    await waitFor(() => expect(onJoined).toHaveBeenCalledWith(ALEX));
  });

  it('has no axe violations', async () => {
    const { container } = renderJoin();
    await screen.findByText('Caleb invited you.');
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('Join errors keep the form values', () => {
  it('email taken (409): says so with a Sign in link', async () => {
    vi.mocked(acceptInvite).mockResolvedValue({ ok: false, status: 409, error: 'email already registered' });
    const { onLeave } = renderJoin();
    await screen.findByText('Caleb invited you.');
    const user = await fillAndJoin();
    expect(await screen.findByText(/That email already has an account\. Sign in instead\./)).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('alex@example.com');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(onLeave).toHaveBeenCalled();
  });

  it('too many tries (429)', async () => {
    vi.mocked(acceptInvite).mockResolvedValue({ ok: false, status: 429, error: 'too many requests' });
    renderJoin();
    await screen.findByText('Caleb invited you.');
    await fillAndJoin();
    expect(await screen.findByText('Too many tries. Wait a minute and try again.')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveValue('longenough');
  });

  it('a short password or bad email shows the existing message', async () => {
    vi.mocked(acceptInvite).mockResolvedValue({
      ok: false,
      status: 400,
      error: 'password must be at least 8 characters',
    });
    renderJoin();
    await screen.findByText('Caleb invited you.');
    await fillAndJoin('alex@example.com', 'short');
    expect(await screen.findByText('password must be at least 8 characters')).toBeInTheDocument();
  });

  it('a link that died meanwhile (404 on Join) shows the dead-link card', async () => {
    vi.mocked(acceptInvite).mockResolvedValue({ ok: false, status: 404, error: 'invite not found' });
    renderJoin();
    await screen.findByText('Caleb invited you.');
    await fillAndJoin();
    expect(await screen.findByText("This invite link doesn't work anymore.")).toBeInTheDocument();
  });

  it('a network failure says to try again', async () => {
    vi.mocked(acceptInvite).mockResolvedValue({ ok: false, status: 0, error: 'network error' });
    renderJoin();
    await screen.findByText('Caleb invited you.');
    await fillAndJoin();
    expect(await screen.findByText("Couldn't join. Try again.")).toBeInTheDocument();
  });
});

describe('dead link', () => {
  it('shows one message for every reason, and a way to sign in', async () => {
    vi.mocked(lookupInvite).mockResolvedValue({ ok: false, status: 404, error: 'invite not found' });
    const { onLeave, container } = renderJoin();
    expect(await screen.findByText("This invite link doesn't work anymore.")).toBeInTheDocument();
    expect(screen.getByText('Ask for a new one.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Go to sign in' }));
    expect(onLeave).toHaveBeenCalled();
  });

  it('a busy server on lookup (429) asks to wait, and Try again looks it up again', async () => {
    vi.mocked(lookupInvite).mockResolvedValueOnce({ ok: false, status: 429, error: 'too many requests' });
    renderJoin();
    expect(await screen.findByText('Too many tries. Wait a minute and try again.')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Caleb invited you.')).toBeInTheDocument();
    expect(lookupInvite).toHaveBeenCalledTimes(2);
  });
});

describe('already signed in', () => {
  it('asks first, and does not look the invite up yet', async () => {
    const { container } = renderJoin(CALEB);
    expect(screen.getByRole('heading', { name: 'Join Homepad' })).toBeInTheDocument();
    expect(screen.getByText("You're signed in as Caleb. Sign out to use this invite.")).toBeInTheDocument();
    expect(lookupInvite).not.toHaveBeenCalled();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('uses the email when the account has no name', () => {
    renderJoin({ ...CALEB, name: '' });
    expect(screen.getByText("You're signed in as caleb@home.lan. Sign out to use this invite.")).toBeInTheDocument();
  });

  it('Sign out and continue signs out, then shows the live form', async () => {
    const { onSignedOut } = renderJoin(CALEB);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign out and continue' }));
    expect(logout).toHaveBeenCalled();
    expect(onSignedOut).toHaveBeenCalled();
    expect(await screen.findByText('Caleb invited you.')).toBeInTheDocument();
  });

  it('Keep me here drops the invite', async () => {
    const { onLeave } = renderJoin(CALEB);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Keep me here' }));
    expect(onLeave).toHaveBeenCalled();
    expect(logout).not.toHaveBeenCalled();
  });
});
