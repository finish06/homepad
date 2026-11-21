import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import ResetLinkDialog from './ResetLinkDialog';
import { createResetLink, type CreatedResetLink } from '../passwordApi';
import { reloadPage } from '../lib/reload';

// SPEC-password-reset-link AC-001, AC-004, AC-005, AC-018, UX §2.2 — the
// reset-link dialog: it makes the link at once (R-2), shows it once with Copy
// and the clipboard fallback, says when it ends (R-4), and names each refusal.

vi.mock('../passwordApi', () => ({ createResetLink: vi.fn() }));
vi.mock('../lib/reload', () => ({ reloadPage: vi.fn() }));

expect.extend(toHaveNoViolations);

const LINK: CreatedResetLink = { id: 'r1', expiresAt: '2026-11-21T21:40:00Z', token: 'tok/secret' };
const JO = { id: 'u-jo', name: 'Jo' };
const ENDS = (() => {
  const d = new Date(LINK.expiresAt);
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

function secureClipboard() {
  const writeText = vi.fn(() => Promise.resolve());
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  return writeText;
}

function noClipboard() {
  Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
  Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
}

function renderDialog() {
  const props = { onClose: vi.fn(), onGone: vi.fn() };
  const utils = render(<ResetLinkDialog account={JO} {...props} />);
  return { ...utils, ...props };
}

beforeEach(() => {
  vi.mocked(createResetLink).mockResolvedValue({ ok: true, status: 201, link: LINK });
});

afterEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
});

describe('making the link (R-2)', () => {
  it('makes it at once, with a polite Making a link…', async () => {
    secureClipboard();
    const d = deferred<Awaited<ReturnType<typeof createResetLink>>>();
    vi.mocked(createResetLink).mockReturnValue(d.promise);
    renderDialog();
    expect(screen.getByRole('dialog', { name: 'Reset link for Jo' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Making a link…');
    expect(createResetLink).toHaveBeenCalledWith('u-jo');
    d.resolve({ ok: true, status: 201, link: LINK });
    expect(await screen.findByLabelText('Reset link')).toBeInTheDocument();
    expect(createResetLink).toHaveBeenCalledTimes(1);
  });
});

describe('the link, once (AC-018)', () => {
  it('shows {origin}/#reset={token}, the end time and both footer lines', async () => {
    secureClipboard();
    const { container } = renderDialog();
    const field = await screen.findByLabelText('Reset link');
    expect(field).toHaveValue(`${window.location.origin}/#reset=${encodeURIComponent(LINK.token)}`);
    expect(field).toHaveAttribute('readonly');
    expect(screen.getByText('Send Jo this link.')).toBeInTheDocument();
    expect(screen.getByText(`It works once, until ${ENDS}. You won't see this link again.`)).toBeInTheDocument();
    expect(
      screen.getByText("Jo's password stays the same until they use it. A new link replaces this one."),
    ).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('focus goes to Copy link; Copy reads Copied for 2 seconds', async () => {
    const writeText = secureClipboard();
    renderDialog();
    const copy = await screen.findByRole('button', { name: 'Copy link' });
    await waitFor(() => expect(copy).toHaveFocus());
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      fireEvent.click(copy);
      await waitFor(() => expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument());
      expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/#reset=${encodeURIComponent(LINK.token)}`);
      act(() => {
        vi.advanceTimersByTime(2100);
      });
      await waitFor(() => expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument());
    } finally {
      vi.useRealTimers();
    }
  });

  it('Share… shows only with a share sheet, titled Homepad password reset', async () => {
    secureClipboard();
    const share = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    renderDialog();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Share…' }));
    expect(share).toHaveBeenCalledWith({
      title: 'Homepad password reset',
      url: `${window.location.origin}/#reset=${encodeURIComponent(LINK.token)}`,
    });
  });

  it('no Share… without a share sheet', async () => {
    secureClipboard();
    renderDialog();
    await screen.findByRole('button', { name: 'Copy link' });
    expect(screen.queryByRole('button', { name: 'Share…' })).not.toBeInTheDocument();
  });

  it('plain http: the field is selected, with how to copy it', async () => {
    noClipboard();
    renderDialog();
    const field = (await screen.findByLabelText('Reset link')) as HTMLInputElement;
    await waitFor(() => expect(field).toHaveFocus());
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(field.value.length);
    expect(screen.getByText(/Press (⌘C|Ctrl\+C) to copy\.|Press and hold to copy\./)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy link' })).not.toBeInTheDocument();
  });

  it('Done closes', async () => {
    secureClipboard();
    const { onClose } = renderDialog();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('Escape closes and stops there', async () => {
    secureClipboard();
    const { onClose } = renderDialog();
    await screen.findByRole('button', { name: 'Copy link' });
    const outer = vi.fn();
    window.addEventListener('keydown', outer);
    try {
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(outer).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', outer);
    }
  });

  it('✕ closes', async () => {
    secureClipboard();
    const { onClose } = renderDialog();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Close Reset link for Jo' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('errors (UX §2.2)', () => {
  it('409 sso_account', async () => {
    vi.mocked(createResetLink).mockResolvedValue({ ok: false, status: 409, error: '{"error":"sso_account"}' });
    const { onClose } = renderDialog();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Jo signs in with single sign-on only, so there's no password to reset.",
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('409 self', async () => {
    vi.mocked(createResetLink).mockResolvedValue({ ok: false, status: 409, error: '{"error":"self"}' });
    renderDialog();
    expect(await screen.findByRole('alert')).toHaveTextContent('To change your own password, use My settings.');
  });

  it('404: they are gone, and Close reloads the list', async () => {
    vi.mocked(createResetLink).mockResolvedValue({ ok: false, status: 404, error: 'no such adult account' });
    const { onClose, onGone } = renderDialog();
    expect(await screen.findByRole('alert')).toHaveTextContent("Jo isn't in Homepad anymore.");
    await userEvent.setup().click(screen.getByRole('button', { name: 'Close' }));
    expect(onGone).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('401: Reload', async () => {
    vi.mocked(createResetLink).mockResolvedValue({ ok: false, status: 401, error: 'unauthorized' });
    renderDialog();
    expect(await screen.findByRole('alert')).toHaveTextContent('You were signed out. Reload the page to sign in again.');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reload' }));
    expect(reloadPage).toHaveBeenCalled();
  });

  it('anything else: Try again makes a new link', async () => {
    secureClipboard();
    vi.mocked(createResetLink).mockResolvedValueOnce({ ok: false, status: 0, error: 'network error' });
    const { container } = renderDialog();
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't make the link. Try again.");
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByLabelText('Reset link')).toBeInTheDocument();
    expect(createResetLink).toHaveBeenCalledTimes(2);
  });
});
