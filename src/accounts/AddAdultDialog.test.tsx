import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import AddAdultDialog from './AddAdultDialog';
import { createInvite, type CreatedInvite } from '../api';

// SPEC-household-basics UX §3.2–§3.3 (plan TASK-204) — the Add-an-adult dialog:
// the form (AC-008, AC-019, AC-022, AC-031) and the link-once view with Copy,
// Share and the clipboard fallback for plain-http LANs (AC-019, TC-010).

vi.mock('../api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api')>();
  return { ...real, createInvite: vi.fn() };
});

expect.extend(toHaveNoViolations);

const CREATED: CreatedInvite = {
  id: 'i-alex',
  name: 'Alex',
  role: 'user',
  createdAt: '2026-11-07T10:00:00Z',
  expiresAt: '2026-11-14T12:00:00Z',
  token: 'Qm9tok',
};
const DAY = new Date(CREATED.expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const LINK = `${window.location.origin}/#invite=Qm9tok`;

function setSecure(secure: boolean, clipboard = secure) {
  Object.defineProperty(window, 'isSecureContext', { value: secure, configurable: true });
  Object.defineProperty(navigator, 'clipboard', {
    value: clipboard ? { writeText: vi.fn(() => Promise.resolve()) } : undefined,
    configurable: true,
  });
}

function setTouch(coarse: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (q: string) => ({
      matches: coarse && q.includes('coarse'),
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }),
  });
}

function renderDialog(props: Partial<React.ComponentProps<typeof AddAdultDialog>> = {}) {
  const onClose = vi.fn();
  const onCreated = vi.fn();
  const utils = render(<AddAdultDialog oidcEnabled={false} onClose={onClose} onCreated={onCreated} {...props} />);
  return { ...utils, onClose, onCreated, dialog: screen.getByRole('dialog', { name: 'Add an adult' }) };
}

let uaSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  uaSpy = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
  setSecure(true);
  setTouch(false);
  Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
});

afterEach(() => {
  uaSpy.mockRestore();
  vi.clearAllMocks();
  vi.useRealTimers();
});

async function createAs(name: string, role?: 'Admin') {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Name'), name);
  if (role) await user.click(screen.getByRole('radio', { name: 'Admin' }));
  await user.click(screen.getByRole('button', { name: 'Create link' }));
  return user;
}

describe('the form (UX §3.2)', () => {
  it('has a name, a Member/Admin radio group (Member by default) and the 7-day line', () => {
    renderDialog();
    expect(screen.getByLabelText('Name')).toHaveValue('');
    const group = screen.getByRole('radiogroup', { name: 'Role' });
    const member = within(group).getByRole('radio', { name: 'Member' });
    const admin = within(group).getByRole('radio', { name: 'Admin' });
    expect(member).toBeChecked();
    expect(admin).not.toBeChecked();
    expect(member).toHaveAccessibleDescription('Uses the dashboard. Keeps their own favorites and settings.');
    expect(admin).toHaveAccessibleDescription('Also adds apps, and manages accounts and settings.');
    expect(
      screen.getByText("You'll get a link to send them. It works once, for 7 days. They pick their own email and password."),
    ).toBeInTheDocument();
  });

  it('Create link is disabled until the name is valid', async () => {
    const user = userEvent.setup();
    renderDialog();
    const create = screen.getByRole('button', { name: 'Create link' });
    expect(create).toBeDisabled();
    await user.type(screen.getByLabelText('Name'), '   ');
    expect(create).toBeDisabled();
    await user.type(screen.getByLabelText('Name'), 'Alex');
    expect(create).toBeEnabled();
  });

  it('a name over 40 characters shows the rule under the field', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.type(screen.getByLabelText('Name'), 'x'.repeat(41));
    expect(screen.getByText('Use 40 characters or fewer.')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'Create link' })).toBeDisabled();
  });

  it('a control character is refused too', () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Al\u0007ex' } });
    expect(screen.getByText('Use letters, numbers and spaces.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create link' })).toBeDisabled();
  });

  it('picking Admin adds the amber line', async () => {
    const user = userEvent.setup();
    renderDialog();
    expect(screen.queryByText(/Admins can do everything you can/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Admin' }));
    expect(screen.getByText('Admins can do everything you can, including inviting other admins.')).toBeInTheDocument();
  });

  it('AC-022 — the PocketID line shows only when single sign-on is on', () => {
    const { unmount } = renderDialog();
    expect(screen.queryByText(/PocketID/)).not.toBeInTheDocument();
    unmount();
    renderDialog({ oidcEnabled: true });
    expect(screen.getByText('They use PocketID? They can sign in with it. No invite needed.')).toBeInTheDocument();
  });

  it('sends the trimmed name and the API role ("user" for Member, "admin" for Admin)', async () => {
    vi.mocked(createInvite).mockResolvedValue({ ok: true, status: 201, invite: CREATED });
    const { unmount } = renderDialog();
    await createAs('  Alex ');
    expect(createInvite).toHaveBeenCalledWith('Alex', 'user');
    unmount();
    vi.mocked(createInvite).mockClear();
    renderDialog();
    await createAs('Jordan', 'Admin');
    expect(createInvite).toHaveBeenCalledWith('Jordan', 'admin');
  });

  it('reads "Creating…" while the call is in flight', async () => {
    let resolve!: (v: Awaited<ReturnType<typeof createInvite>>) => void;
    vi.mocked(createInvite).mockReturnValue(new Promise((r) => (resolve = r)));
    renderDialog();
    await createAs('Alex');
    expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled();
    await act(async () => resolve({ ok: true, status: 201, invite: CREATED }));
  });

  it('AC-031 — at the cap, says so above the buttons and keeps what was typed', async () => {
    vi.mocked(createInvite).mockResolvedValue({ ok: false, status: 409, error: 'account limit reached (limit 12)' });
    const { onCreated } = renderDialog();
    await createAs('Alex', 'Admin');
    expect(await screen.findByText('This Homepad has reached its limit of 12 accounts.')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Alex');
    expect(screen.getByRole('radio', { name: 'Admin' })).toBeChecked();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('any other failure: "Couldn\'t create the invite. Try again."', async () => {
    vi.mocked(createInvite).mockResolvedValue({ ok: false, status: 500, error: 'internal error' });
    renderDialog();
    await createAs('Alex');
    expect(await screen.findByText("Couldn't create the invite. Try again.")).toBeInTheDocument();
  });

  it('Cancel, ✕ and Escape close it, and Escape stops at this layer', async () => {
    const user = userEvent.setup();
    const outer = vi.fn();
    window.addEventListener('keydown', outer);
    const { onClose } = renderDialog();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Close Add an adult' }));
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(3);
    expect(outer).not.toHaveBeenCalled();
    window.removeEventListener('keydown', outer);
  });

  it('has no axe violations (Admin picked, PocketID line on)', async () => {
    const user = userEvent.setup();
    renderDialog({ oidcEnabled: true });
    await user.click(screen.getByRole('radio', { name: 'Admin' }));
    expect(await axe(document.body)).toHaveNoViolations();
  });
});

describe('the link, once (UX §3.3)', () => {
  it('shows the link built from this page, the end date and the one-time warning', async () => {
    vi.mocked(createInvite).mockResolvedValue({ ok: true, status: 201, invite: CREATED });
    const { onCreated } = renderDialog();
    await createAs('Alex');
    const dialog = await screen.findByRole('dialog', { name: 'Invite for Alex' });
    expect(dialog).toHaveTextContent('Send Alex this link.');
    expect(within(dialog).getByLabelText('Invite link')).toHaveValue(LINK);
    expect(within(dialog).getByLabelText('Invite link')).toHaveAttribute('readonly');
    expect(dialog).toHaveTextContent(`It works once, until ${DAY}.`);
    expect(dialog).toHaveTextContent("You won't see this link again.");
    expect(onCreated).toHaveBeenCalledWith(CREATED);
    expect(dialog).not.toHaveTextContent(/token/i);
  });

  it('Copy link writes the link and reads "Copied" for 2 seconds, announced politely', async () => {
    vi.mocked(createInvite).mockResolvedValue({ ok: true, status: 201, invite: CREATED });
    renderDialog();
    await createAs('Alex');
    const copy = await screen.findByRole('button', { name: 'Copy link' });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await act(async () => {
      fireEvent.click(copy);
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(LINK);
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Copied');
    await act(async () => {
      vi.advanceTimersByTime(2100);
    });
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
  });

  it('a failed copy falls back to selecting the field', async () => {
    vi.mocked(createInvite).mockResolvedValue({ ok: true, status: 201, invite: CREATED });
    renderDialog();
    vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error('denied'));
    await createAs('Alex');
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Copy link' }));
    expect(await screen.findByText('Press ⌘C to copy.')).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByLabelText('Invite link'));
  });

  it('Share… shows only where the browser offers a share sheet', async () => {
    const share = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    vi.mocked(createInvite).mockResolvedValue({ ok: true, status: 201, invite: CREATED });
    renderDialog();
    await createAs('Alex');
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Share…' }));
    expect(share).toHaveBeenCalledWith({ title: 'Homepad invite', url: LINK });
  });

  it('no Share… without a share sheet', async () => {
    vi.mocked(createInvite).mockResolvedValue({ ok: true, status: 201, invite: CREATED });
    renderDialog();
    await createAs('Alex');
    await screen.findByRole('button', { name: 'Copy link' });
    expect(screen.queryByRole('button', { name: 'Share…' })).not.toBeInTheDocument();
  });

  it('TC-010 — on plain http the field is selected on open, with the keyboard hint', async () => {
    setSecure(false);
    vi.mocked(createInvite).mockResolvedValue({ ok: true, status: 201, invite: CREATED });
    renderDialog();
    await createAs('Alex');
    const field = await screen.findByLabelText('Invite link');
    expect(screen.queryByRole('button', { name: 'Copy link' })).not.toBeInTheDocument();
    expect(screen.getByText('Press ⌘C to copy.')).toBeInTheDocument();
    expect(document.activeElement).toBe(field);
    const input = field as HTMLInputElement;
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(LINK.length);
  });

  it('on a touch device without a clipboard the hint is "Press and hold to copy."', async () => {
    setSecure(false);
    setTouch(true);
    vi.mocked(createInvite).mockResolvedValue({ ok: true, status: 201, invite: CREATED });
    renderDialog();
    await createAs('Alex');
    expect(await screen.findByText('Press and hold to copy.')).toBeInTheDocument();
  });

  it('a non-Mac keyboard reads Ctrl+C', async () => {
    setSecure(false);
    uaSpy.mockReturnValue('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    vi.mocked(createInvite).mockResolvedValue({ ok: true, status: 201, invite: CREATED });
    renderDialog();
    await createAs('Alex');
    expect(await screen.findByText('Press Ctrl+C to copy.')).toBeInTheDocument();
  });

  it('Done closes it, and so does Escape, with nothing to confirm', async () => {
    vi.mocked(createInvite).mockResolvedValue({ ok: true, status: 201, invite: CREATED });
    const { onClose } = renderDialog();
    const user = await createAs('Alex');
    await user.click(await screen.findByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('has no axe violations', async () => {
    vi.mocked(createInvite).mockResolvedValue({ ok: true, status: 201, invite: CREATED });
    renderDialog();
    await createAs('Alex');
    await screen.findByRole('dialog', { name: 'Invite for Alex' });
    expect(await axe(document.body)).toHaveNoViolations();
  });
});
