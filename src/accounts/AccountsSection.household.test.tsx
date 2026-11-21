import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import AccountsSection from './AccountsSection';
import { authConfig, createInvite, listAccounts, listInvites, revokeInvite, type Account, type Invite } from '../api';

// SPEC-household-basics UX §3.1 (plan TASK-204) — the Accounts section gains
// "+ Add an adult" next to "+ Add a kid" (AC-019), the open-sign-up warning
// (AC-006), the "member" label for the user role (AC-021), and Pending invites
// with a Revoke that asks first (AC-011, H-2).

vi.mock('../api', () => ({
  authConfig: vi.fn(),
  listAccounts: vi.fn(),
  listInvites: vi.fn(),
  createInvite: vi.fn(),
  revokeInvite: vi.fn(),
  services: vi.fn(() => Promise.resolve([])),
  categories: vi.fn(() => Promise.resolve([])),
  kidServices: vi.fn(() => Promise.resolve([])),
  kidSessions: vi.fn(() => Promise.resolve([])),
  createKid: vi.fn(),
  updateKid: vi.fn(),
  deleteKid: vi.fn(),
  setKidServices: vi.fn(),
  revokeKidSession: vi.fn(),
  signInHere: vi.fn(),
}));

expect.extend(toHaveNoViolations);

const ADMIN: Account = {
  id: 'u-admin', name: 'Caleb', role: 'admin', lastSeenAt: null, email: 'caleb@home.lan', avatarColor: 'blue',
};
const ALEX: Account = { id: 'u-alex', name: 'Alex', role: 'user', lastSeenAt: null, email: 'alex@example.com', avatarColor: '' };
const MAYA: Account = { id: 'k-maya', name: 'Maya', role: 'kid', lastSeenAt: null, avatarColor: 'teal', appCount: 3, deviceCount: 1 };
const JORDAN: Invite = {
  id: 'i-jordan',
  name: 'Jordan',
  role: 'admin',
  createdAt: '2026-11-07T10:00:00Z',
  expiresAt: '2026-11-14T12:00:00Z',
  createdBy: { id: 'u-admin', name: 'Caleb' },
};
const DAY = new Date(JORDAN.expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function mode(registration: 'open' | 'invite_only', oidcEnabled = false) {
  vi.mocked(authConfig).mockResolvedValue({ oidcEnabled, registration, setupNeeded: false });
}

beforeEach(() => {
  mode('invite_only');
  vi.mocked(listAccounts).mockResolvedValue([ADMIN, ALEX]);
  vi.mocked(listInvites).mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
});

async function ready() {
  await screen.findAllByTestId('account-row');
}

describe('the section head (UX §3.1)', () => {
  it('has "+ Add an adult" next to "+ Add a kid"', async () => {
    render(<AccountsSection currentUserId="u-admin" />);
    await ready();
    const adult = screen.getByRole('button', { name: '+ Add an adult' });
    const kid = screen.getByRole('button', { name: '+ Add a kid' });
    expect(adult.compareDocumentPosition(kid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('drops the old footnote', async () => {
    render(<AccountsSection currentUserId="u-admin" />);
    await ready();
    expect(screen.queryByText('Adults are listed only. Kids are managed here.')).not.toBeInTheDocument();
  });

  it('AC-021 — the user role reads "member"; admin and kid are unchanged', async () => {
    vi.mocked(listAccounts).mockResolvedValue([ADMIN, ALEX, MAYA]);
    render(<AccountsSection currentUserId="u-admin" />);
    const rows = await screen.findAllByTestId('account-row');
    expect(within(rows[0]).getByText('admin')).toHaveClass('role-pill');
    expect(within(rows[1]).getByText('member')).toHaveClass('role-pill');
    expect(within(rows[2]).getByText('kid')).toHaveClass('role-pill');
    expect(screen.queryByText('user')).not.toBeInTheDocument();
  });
});

describe('open sign-up warning (AC-006)', () => {
  it('shows while sign-up is open, as a note, with the kid line when a kid exists', async () => {
    mode('open');
    vi.mocked(listAccounts).mockResolvedValue([ADMIN, MAYA]);
    render(<AccountsSection currentUserId="u-admin" />);
    const note = await screen.findByRole('note');
    expect(note).toHaveTextContent('Anyone who can open Homepad can create an account.');
    expect(note).toHaveTextContent('A kid who signs out could make an adult account.');
    expect(note).toHaveTextContent('To stop this, set HOMEPAD_REGISTRATION=invite_only.');
    const how = within(note).getByRole('link', { name: /How/ });
    expect(how.getAttribute('href')).toMatch(/#registration$/);
  });

  it('leaves out the kid line when there are no kids', async () => {
    mode('open');
    render(<AccountsSection currentUserId="u-admin" />);
    const note = await screen.findByRole('note');
    expect(note).not.toHaveTextContent('A kid who signs out');
  });

  it('is gone when sign-up is closed', async () => {
    vi.mocked(listAccounts).mockResolvedValue([ADMIN, MAYA]);
    render(<AccountsSection currentUserId="u-admin" />);
    await ready();
    await waitFor(() => expect(authConfig).toHaveBeenCalled());
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
});

describe('Pending invites (AC-011, AC-019)', () => {
  it('shows only when there is one', async () => {
    render(<AccountsSection currentUserId="u-admin" />);
    await ready();
    expect(screen.queryByText('Pending invites')).not.toBeInTheDocument();
  });

  it('lists name, role, who made it and when it ends, with Revoke', async () => {
    vi.mocked(listInvites).mockResolvedValue([JORDAN, { ...JORDAN, id: 'i-sky', name: 'Sky', role: 'user' }]);
    render(<AccountsSection currentUserId="u-admin" />);
    const list = await screen.findByRole('list', { name: 'Pending invites' });
    const rows = within(list).getAllByTestId('invite-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Jordan');
    expect(within(rows[0]).getByText('admin')).toHaveClass('role-pill');
    expect(rows[0]).toHaveTextContent(`made by Caleb · ends ${DAY}`);
    expect(within(rows[1]).getByText('member')).toHaveClass('role-pill');
    expect(within(rows[0]).getByRole('button', { name: "Revoke Jordan's invite" })).toBeInTheDocument();
  });

  it('Revoke asks first; Cancel keeps the invite', async () => {
    const user = userEvent.setup();
    vi.mocked(listInvites).mockResolvedValue([JORDAN]);
    render(<AccountsSection currentUserId="u-admin" />);
    await user.click(await screen.findByRole('button', { name: "Revoke Jordan's invite" }));
    const confirm = screen.getByRole('alertdialog', { name: "Revoke Jordan's invite?" });
    expect(confirm).toHaveTextContent('The link stops working.');
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(revokeInvite).not.toHaveBeenCalled();
    expect(screen.getAllByTestId('invite-row')).toHaveLength(1);
  });

  it('confirmed Revoke removes the row', async () => {
    const user = userEvent.setup();
    vi.mocked(listInvites).mockResolvedValue([JORDAN]);
    vi.mocked(revokeInvite).mockResolvedValue(true);
    render(<AccountsSection currentUserId="u-admin" />);
    await user.click(await screen.findByRole('button', { name: "Revoke Jordan's invite" }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Revoke' }));
    expect(revokeInvite).toHaveBeenCalledWith('i-jordan');
    await waitFor(() => expect(screen.queryByTestId('invite-row')).not.toBeInTheDocument());
    expect(screen.queryByText('Pending invites')).not.toBeInTheDocument();
  });

  it('a failed Revoke keeps the row and says so', async () => {
    const user = userEvent.setup();
    vi.mocked(listInvites).mockResolvedValue([JORDAN]);
    vi.mocked(revokeInvite).mockResolvedValue(false);
    render(<AccountsSection currentUserId="u-admin" />);
    await user.click(await screen.findByRole('button', { name: "Revoke Jordan's invite" }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Revoke' }));
    expect(await screen.findByText("Couldn't revoke the invite. Try again.")).toBeInTheDocument();
    expect(screen.getAllByTestId('invite-row')).toHaveLength(1);
  });

  it('Escape closes only the confirm', async () => {
    const user = userEvent.setup();
    const outer = vi.fn();
    window.addEventListener('keydown', outer);
    vi.mocked(listInvites).mockResolvedValue([JORDAN]);
    render(<AccountsSection currentUserId="u-admin" />);
    await user.click(await screen.findByRole('button', { name: "Revoke Jordan's invite" }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(outer).not.toHaveBeenCalled();
    window.removeEventListener('keydown', outer);
  });

  it('loads with the account list and shares its error', async () => {
    vi.mocked(listInvites).mockRejectedValue(new Error('boom'));
    render(<AccountsSection currentUserId="u-admin" />);
    expect(await screen.findByTestId('accounts-error')).toHaveTextContent("Couldn't load accounts.");
    vi.mocked(listInvites).mockResolvedValue([JORDAN]);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findAllByTestId('invite-row')).toHaveLength(1);
  });

  it('a new invite from the dialog lands in Pending invites', async () => {
    const user = userEvent.setup();
    vi.mocked(createInvite).mockResolvedValue({
      ok: true,
      status: 201,
      invite: { id: 'i-new', name: 'Alexis', role: 'user', createdAt: JORDAN.createdAt, expiresAt: JORDAN.expiresAt, token: 'tok' },
    });
    render(<AccountsSection currentUserId="u-admin" />);
    await ready();
    await user.click(screen.getByRole('button', { name: '+ Add an adult' }));
    const dialog = screen.getByRole('dialog', { name: 'Add an adult' });
    await user.type(within(dialog).getByLabelText('Name'), 'Alexis');
    await user.click(within(dialog).getByRole('button', { name: 'Create link' }));
    await user.click(await screen.findByRole('button', { name: 'Done' }));
    const row = await screen.findByTestId('invite-row');
    expect(row).toHaveTextContent('Alexis');
    // The new row names the admin who made it (the signed-in admin).
    expect(row).toHaveTextContent('made by Caleb');
  });

  it('has no axe violations with the warning, a member, a kid and a pending invite', async () => {
    mode('open');
    vi.mocked(listAccounts).mockResolvedValue([ADMIN, ALEX, MAYA]);
    vi.mocked(listInvites).mockResolvedValue([JORDAN]);
    const { container } = render(<AccountsSection currentUserId="u-admin" />);
    await screen.findAllByTestId('invite-row');
    await screen.findByRole('note');
    expect(await axe(container)).toHaveNoViolations();
  });
});
