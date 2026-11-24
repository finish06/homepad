import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import AccountsSection from './AccountsSection';
import { authConfig, listAccounts, listInvites, type Account } from '../api';
import { createResetLink, type CreatedResetLink } from '../passwordApi';

// SPEC-password-reset-link UX §2.1, §5 — "Make a reset link" sits second in an
// adult's Manage menu, after the role item and before the divider. It shows
// only on adults with a password (AC-018, AC-021, R-1): never on your own row
// or a kid's (they have no menu), nor on an SSO-only account (TC-005). It opens
// the reset-link dialog; closing it returns focus to that row's Manage button.

vi.mock('../api', () => ({
  authConfig: vi.fn(),
  listAccounts: vi.fn(),
  listInvites: vi.fn(),
  createInvite: vi.fn(),
  revokeInvite: vi.fn(),
  setAccountRole: vi.fn(),
  removeAccount: vi.fn(),
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
vi.mock('../passwordApi', () => ({ createResetLink: vi.fn() }));

expect.extend(toHaveNoViolations);

const CALEB: Account = {
  id: 'u-caleb',
  name: 'Caleb',
  role: 'admin',
  lastSeenAt: null,
  email: 'caleb@home.lan',
  avatarColor: 'blue',
  hasPassword: true,
};
const ALEX: Account = { id: 'u-alex', name: 'Alex', role: 'admin', lastSeenAt: null, email: 'alex@example.com', avatarColor: '', hasPassword: true };
const JO: Account = { id: 'u-jo', name: 'Jo', role: 'member', lastSeenAt: null, email: 'jo@example.com', avatarColor: '', hasPassword: true };
// Signs in with single sign-on only (TC-005).
const PAT: Account = { id: 'u-pat', name: 'Pat', role: 'member', lastSeenAt: null, email: 'pat@example.com', avatarColor: '', hasPassword: false };
const SAM: Account = { id: 'k-sam', name: 'Sam', role: 'kid', lastSeenAt: null, avatarColor: 'teal', appCount: 2, deviceCount: 0, hasPassword: false };

const LINK: CreatedResetLink = { id: 'r1', expiresAt: '2026-11-21T21:40:00Z', token: 'tok-jo' };

beforeEach(() => {
  vi.mocked(authConfig).mockResolvedValue({ oidcEnabled: false, registration: 'invite_only', setupNeeded: false });
  vi.mocked(listAccounts).mockResolvedValue([CALEB, ALEX, JO, PAT, SAM]);
  vi.mocked(listInvites).mockResolvedValue([]);
  vi.mocked(createResetLink).mockResolvedValue({ ok: true, status: 201, link: LINK });
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(() => Promise.resolve()) }, configurable: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

async function renderReady() {
  const r = render(<AccountsSection currentUserId="u-caleb" />);
  await screen.findAllByTestId('account-row');
  return r;
}

const manage = (name: string) => screen.getByRole('button', { name: `Manage ${name}` });

async function openMenu(name: string) {
  const u = userEvent.setup();
  await u.click(manage(name));
  return { u, menu: await screen.findByRole('menu') };
}

async function openDialog(name: string) {
  const { u, menu } = await openMenu(name);
  await u.click(within(menu).getByRole('menuitem', { name: 'Make a reset link' }));
  const dialog = await screen.findByRole('dialog', { name: `Reset link for ${name}` });
  return { u, dialog };
}

describe('the menu item (UX §2.1)', () => {
  it('sits second: the role item, Make a reset link, the divider, then Remove', async () => {
    await renderReady();
    const { menu } = await openMenu('Jo');
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual(['Make admin', 'Make a reset link', 'Remove Jo…']);
    // The divider comes after the reset item, before Remove.
    const kids = Array.from(menu.children);
    expect(kids.indexOf(within(menu).getByRole('separator'))).toBe(kids.indexOf(items[1]) + 1);
    expect(items[1]).not.toHaveClass('menu-item-danger');
  });

  it('shows on an admin with a password too', async () => {
    await renderReady();
    const { menu } = await openMenu('Alex');
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      'Make member',
      'Make a reset link',
      'Remove Alex…',
    ]);
  });

  it('TC-005 / AC-021 — an SSO-only adult has no reset item', async () => {
    await renderReady();
    const { menu } = await openMenu('Pat');
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Make admin', 'Remove Pat…']);
  });

  it('an older API without hasPassword: no reset item', async () => {
    const { hasPassword: _drop, ...old } = JO;
    vi.mocked(listAccounts).mockResolvedValue([CALEB, old]);
    await renderReady();
    const { menu } = await openMenu('Jo');
    expect(within(menu).queryByRole('menuitem', { name: 'Make a reset link' })).toBeNull();
  });

  it('AC-003 — your own row and kid rows have no menu at all', async () => {
    await renderReady();
    expect(screen.queryByRole('button', { name: 'Manage Caleb' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Manage Sam' })).toBeNull();
  });

  it('the keyboard reaches it: ↓ from the role item', async () => {
    await renderReady();
    const u = userEvent.setup();
    manage('Jo').focus();
    await u.keyboard('{Enter}');
    expect(screen.getByRole('menuitem', { name: 'Make admin' })).toHaveFocus();
    await u.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Make a reset link' })).toHaveFocus();
  });
});

describe('the dialog from the menu (UX §2.2, §5)', () => {
  it('opens at once and makes the link for that adult (R-2)', async () => {
    await renderReady();
    const { dialog } = await openDialog('Jo');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(createResetLink).toHaveBeenCalledWith('u-jo');
    const field = await within(dialog).findByLabelText('Reset link');
    expect(field).toHaveValue(`${window.location.origin}/#reset=tok-jo`);
  });

  it('Done closes it and returns focus to that row\'s Manage button', async () => {
    await renderReady();
    const { u, dialog } = await openDialog('Jo');
    await u.click(await within(dialog).findByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(manage('Jo')).toHaveFocus();
  });

  it('Escape closes it, returns focus, and leaves the menu closed', async () => {
    await renderReady();
    const { u, dialog } = await openDialog('Jo');
    await within(dialog).findByLabelText('Reset link');
    await u.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByRole('menu')).toBeNull();
    expect(manage('Jo')).toHaveFocus();
  });

  it('404: Close reloads the Accounts list', async () => {
    vi.mocked(createResetLink).mockResolvedValue({ ok: false, status: 404, error: 'no such adult account' });
    await renderReady();
    expect(listAccounts).toHaveBeenCalledTimes(1);
    const { u, dialog } = await openDialog('Jo');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent("Jo isn't in Homepad anymore.");
    await u.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(listAccounts).toHaveBeenCalledTimes(2));
  });

  it('404: closing with ✕ reloads the list too', async () => {
    vi.mocked(createResetLink).mockResolvedValue({ ok: false, status: 404, error: 'no such adult account' });
    await renderReady();
    const { u, dialog } = await openDialog('Jo');
    await within(dialog).findByRole('alert');
    await u.click(within(dialog).getByRole('button', { name: 'Close Reset link for Jo' }));
    await waitFor(() => expect(listAccounts).toHaveBeenCalledTimes(2));
  });

  it('the menu with the reset item has no axe violations', async () => {
    const { container } = await renderReady();
    await openMenu('Jo');
    expect(await axe(container)).toHaveNoViolations();
  });
});
