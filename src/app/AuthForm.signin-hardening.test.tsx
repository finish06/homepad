import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import AuthForm from './AuthForm';
import { authConfig, login, register, type AuthConfig } from '../api';

// SPEC-signin-hardening AC-003, AC-019, UX §2–§3, §6 — the sign-in card's
// single sign-on message (from /#signin-error=<code>, read by App) and the
// 429 wait line.

vi.mock('../api', () => ({
  authConfig: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
}));

expect.extend(toHaveNoViolations);

const cfg = (c: Partial<AuthConfig>): AuthConfig => ({
  oidcEnabled: true,
  registration: 'invite_only',
  setupNeeded: false,
  ...c,
});

const assign = vi.fn();

beforeEach(() => {
  vi.mocked(authConfig).mockResolvedValue(cfg({}));
  vi.stubGlobal('location', { assign });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const LINES: [string, string][] = [
  ['email_unverified', "Your identity provider hasn't confirmed your email. Ask your admin to mark it as verified."],
  ['not_invited', "You don't have a Homepad account yet. Ask your admin for an invite."],
  ['account_limit', 'This Homepad has reached its account limit.'],
  ['sso_failed', "Single sign-on didn't work. Try again."],
  ['too_many', 'Too many tries. Wait a minute and try again.'],
  ['something_new', "Single sign-on didn't work. Try again."],
];

describe('the single sign-on message (UX §2)', () => {
  it.each(LINES)('%s shows its line as an alert above Email', async (code, line) => {
    render(<AuthForm onAuthed={() => {}} ssoError={code} />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(line);
    expect(alert).toHaveClass('auth-error');
    // Under the subtitle, above the form fields.
    const email = screen.getByLabelText(/email/i);
    expect(alert.compareDocumentPosition(email) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const subtitle = screen.getByText('Sign in to your dashboard');
    expect(subtitle.compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows nothing without a code', async () => {
    render(<AuthForm onAuthed={() => {}} />);
    await screen.findByRole('button', { name: 'Log in with PocketID' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('stays while typing, and goes on the next Sign in', async () => {
    const user = userEvent.setup();
    vi.mocked(login).mockResolvedValue({ ok: false, status: 401, error: 'invalid email or password' });
    render(<AuthForm onAuthed={() => {}} ssoError="not_invited" />);
    await screen.findByRole('button', { name: 'Log in with PocketID' });
    await user.type(screen.getByLabelText(/email/i), 'pat@example.com');
    await user.type(screen.getByLabelText(/password/i), 'longenough');
    expect(screen.getByText(/You don't have a Homepad account yet/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('invalid email or password')).toBeInTheDocument();
    expect(screen.queryByText(/You don't have a Homepad account yet/)).not.toBeInTheDocument();
  });

  it('goes when PocketID is tapped, and the button stays enabled after a refusal', async () => {
    const user = userEvent.setup();
    render(<AuthForm onAuthed={() => {}} ssoError="email_unverified" />);
    const pocket = await screen.findByRole('button', { name: 'Log in with PocketID' });
    expect(pocket).toBeEnabled();
    await user.click(pocket);
    expect(assign).toHaveBeenCalledWith('/api/auth/oidc/login');
    expect(screen.queryByText(/hasn't confirmed your email/)).not.toBeInTheDocument();
  });

  it('shows on the Set up card too', async () => {
    vi.mocked(authConfig).mockResolvedValue(cfg({ setupNeeded: true }));
    render(<AuthForm onAuthed={() => {}} ssoError="not_invited" />);
    await screen.findByText('Set up Homepad');
    expect(screen.getByRole('alert')).toHaveTextContent("You don't have a Homepad account yet.");
  });

  it('has no axe violations with a message showing', async () => {
    const { container } = render(<AuthForm onAuthed={() => {}} ssoError="email_unverified" />);
    await screen.findByRole('button', { name: 'Log in with PocketID' });
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('the wait line on 429 (UX §3)', () => {
  async function signIn(retryAfter?: number) {
    const user = userEvent.setup();
    vi.mocked(login).mockResolvedValue({ ok: false, status: 429, error: 'too many attempts', retryAfter });
    await screen.findByRole('button', { name: 'Sign in' });
    await user.type(screen.getByLabelText(/email/i), 'jo@example.com');
    await user.type(screen.getByLabelText(/password/i), 'longenough');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    return user;
  }

  it('TC-001 — the 15-minute lock, with single sign-on on', async () => {
    render(<AuthForm onAuthed={() => {}} />);
    await signIn(900);
    const line = await screen.findByRole('alert');
    expect(line).toHaveTextContent('Too many tries. Wait 15 minutes and try again. You can still use PocketID.');
    // Above the button, and the button stays enabled: no countdown (S-6).
    const button = screen.getByRole('button', { name: 'Sign in' });
    expect(line.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(button).toBeEnabled();
  });

  it('"a minute" with single sign-on off, and no PocketID sentence', async () => {
    vi.mocked(authConfig).mockResolvedValue(cfg({ oidcEnabled: false }));
    render(<AuthForm onAuthed={() => {}} />);
    await signIn(undefined);
    expect(await screen.findByRole('alert')).toHaveTextContent(/^Too many tries\. Wait a minute and try again\.$/);
  });

  it('Create account gets the same line', async () => {
    const user = userEvent.setup();
    vi.mocked(authConfig).mockResolvedValue(cfg({ registration: 'open', oidcEnabled: false }));
    vi.mocked(register).mockResolvedValue({ ok: false, status: 429, error: 'too many attempts', retryAfter: 12 });
    render(<AuthForm onAuthed={() => {}} />);
    await user.click(await screen.findByRole('button', { name: 'Create account' }));
    await user.type(screen.getByLabelText(/email/i), 'new@example.com');
    await user.type(screen.getByLabelText(/password/i), 'longenough');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/^Too many tries\. Wait a minute and try again\.$/);
    expect(login).not.toHaveBeenCalled();
  });

  it('Set up gets it without the PocketID sentence (there is no PocketID button)', async () => {
    const user = userEvent.setup();
    vi.mocked(authConfig).mockResolvedValue(cfg({ setupNeeded: true }));
    vi.mocked(register).mockResolvedValue({ ok: false, status: 429, error: 'too many attempts', retryAfter: 300 });
    render(<AuthForm onAuthed={() => {}} />);
    await screen.findByText('Set up Homepad');
    await user.type(screen.getByLabelText(/email/i), 'caleb@example.com');
    await user.type(screen.getByLabelText(/password/i), 'longenough');
    await user.click(screen.getByRole('button', { name: 'Create admin account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/^Too many tries\. Wait 5 minutes and try again\.$/);
  });

  it('clears on the next submit, and every card error is an alert', async () => {
    render(<AuthForm onAuthed={() => {}} />);
    const user = await signIn(900);
    vi.mocked(login).mockResolvedValue({ ok: false, status: 401, error: 'invalid email or password' });
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('invalid email or password');
    expect(screen.queryByText(/Too many tries/)).not.toBeInTheDocument();
  });
});

describe('ssoMessage', () => {
  it('gives no line for a code that is not lower-case letters and underscores', async () => {
    const { ssoMessage } = await import('./ssoMessage');
    for (const bad of ['', 'Not_Invited', '<b>hi</b>', 'not-invited', 'not_invited&x=1']) expect(ssoMessage(bad)).toBe('');
    expect(ssoMessage('not_invited')).toMatch(/^You don't have a Homepad account yet\./);
  });

  it('a module that lands after a try is dropped', async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    vi.doMock('./ssoMessage', async () => {
      await gate;
      return { ssoMessage: () => 'late line' };
    });
    vi.resetModules();
    const { default: LateForm } = await import('./AuthForm');
    render(<LateForm onAuthed={() => {}} ssoError="not_invited" />);
    await user.click(await screen.findByRole('button', { name: 'Log in with PocketID' }));
    release();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText('late line')).not.toBeInTheDocument();
    vi.doUnmock('./ssoMessage');
  });
});
