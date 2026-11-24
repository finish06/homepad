import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import AccountsSection from './AccountsSection';
import {
  authConfig,
  listAccounts,
  listInvites,
  removeAccount,
  setAccountRole,
  type Account,
  type Invite,
} from '../api';

// SPEC-household-manage-adults UX §2–§6 — each other adult's row gets a
// "Manage ▾" menu (AC-010) with Make admin / Make member and Remove; every
// item asks first in a confirm (§3), whose errors follow §3.4. Your own row
// and kid rows don't change (AC-005, AC-015).

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

expect.extend(toHaveNoViolations);

const CALEB: Account = { id: 'u-caleb', name: 'Caleb', role: 'admin', lastSeenAt: null, email: 'caleb@home.lan', avatarColor: 'blue' };
const ALEX: Account = { id: 'u-alex', name: 'Alex', role: 'admin', lastSeenAt: null, email: 'alex@example.com', avatarColor: '' };
const JO: Account = { id: 'u-jo', name: 'Jo', role: 'member', lastSeenAt: null, email: 'jo@example.com', avatarColor: '' };
const SAM: Account = { id: 'k-sam', name: 'Sam', role: 'kid', lastSeenAt: null, avatarColor: 'teal', appCount: 12, deviceCount: 1 };

function invite(id: string, name: string, by: Account): Invite {
  return {
    id,
    name,
    role: 'member',
    createdAt: '2026-11-19T10:00:00Z',
    expiresAt: '2026-11-26T10:00:00Z',
    createdBy: { id: by.id, name: by.name },
  };
}

function sso(on: boolean) {
  vi.mocked(authConfig).mockResolvedValue({ oidcEnabled: on, registration: 'invite_only', setupNeeded: false });
}

beforeEach(() => {
  sso(false);
  vi.mocked(listAccounts).mockResolvedValue([CALEB, ALEX, JO, SAM]);
  vi.mocked(listInvites).mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

async function renderReady() {
  const r = render(<AccountsSection currentUserId="u-caleb" />);
  await screen.findAllByTestId('account-row');
  return r;
}

function row(name: string) {
  const r = screen.getAllByTestId('account-row').find((el) => within(el).queryByText(name, { selector: '.accounts-name' }));
  if (!r) throw new Error(`no row for ${name}`);
  return r;
}

const manage = (name: string) => screen.getByRole('button', { name: `Manage ${name}` });

async function openMenu(name: string) {
  const u = userEvent.setup();
  await u.click(manage(name));
  return { u, menu: await screen.findByRole('menu') };
}

async function openConfirm(name: string, item: RegExp | string) {
  const { u, menu } = await openMenu(name);
  await u.click(within(menu).getByRole('menuitem', { name: item }));
  const dialog = await screen.findByRole('alertdialog');
  return { u, dialog };
}

describe('the adult row menu (UX §2, AC-010)', () => {
  it('every adult row but your own has "Manage ▾"; kid rows keep "Edit ›"', async () => {
    await renderReady();
    expect(within(row('Caleb')).queryByRole('button')).toBeNull();
    expect(within(row('Caleb')).getByText('you')).toBeInTheDocument();
    for (const name of ['Alex', 'Jo']) {
      const btn = within(row(name)).getByRole('button', { name: `Manage ${name}` });
      expect(btn).toHaveAttribute('aria-haspopup', 'menu');
      expect(btn).toHaveAttribute('aria-expanded', 'false');
      expect(btn.textContent).toMatch(/^Manage/);
      expect(btn).toHaveTextContent('Manage ▾');
    }
    expect(within(row('Sam')).getByRole('button', { name: /^Edit Sam/ })).toHaveTextContent('Edit ›');
    expect(within(row('Sam')).queryByRole('button', { name: /^Manage/ })).toBeNull();
  });

  it('only you and kids: no menus at all', async () => {
    vi.mocked(listAccounts).mockResolvedValue([CALEB, SAM]);
    await renderReady();
    expect(screen.queryByRole('button', { name: /^Manage/ })).toBeNull();
  });

  it('no menus while loading', async () => {
    vi.mocked(authConfig).mockReturnValue(new Promise(() => {}));
    vi.mocked(listAccounts).mockReturnValue(new Promise(() => {}));
    render(<AccountsSection currentUserId="u-caleb" />);
    expect(screen.getAllByTestId('account-skeleton')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: /^Manage/ })).toBeNull();
  });

  it('on a member: Make admin, a divider, then "Remove Jo…" in the danger colour', async () => {
    await renderReady();
    const { menu } = await openMenu('Jo');
    expect(manage('Jo')).toHaveAttribute('aria-expanded', 'true');
    expect(manage('Jo')).toHaveTextContent('Manage ▴');
    expect(menu).toHaveAccessibleName('Manage Jo');
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual(['Make admin', 'Remove Jo…']);
    expect(within(menu).getByRole('separator')).toBeInTheDocument();
    expect(items[1]).toHaveClass('menu-item-danger');
  });

  it('on an admin: Make member', async () => {
    await renderReady();
    const { menu } = await openMenu('Alex');
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Make member', 'Remove Alex…']);
  });

  it('nothing happens straight from the menu: every item opens a confirm', async () => {
    await renderReady();
    await openConfirm('Jo', 'Make admin');
    expect(setAccountRole).not.toHaveBeenCalled();
    expect(removeAccount).not.toHaveBeenCalled();
  });
});

describe('where the menu opens (UX §2.2)', () => {
  it('under the button by default', async () => {
    await renderReady();
    const { menu } = await openMenu('Jo');
    expect(menu).toHaveClass('adult-menu');
    expect(menu).not.toHaveClass('adult-menu--up');
  });

  it('above the button when there is no room below its scrolling panel', async () => {
    await renderReady();
    // The Admin Panel body scrolls; the menu must fit inside it.
    document.body.style.overflowY = 'auto';
    const rect = (top: number, height: number) =>
      ({ top, bottom: top + height, height, left: 0, right: 200, width: 200, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
    const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this.getAttribute('role') === 'menu') return rect(window.innerHeight - 40, 140);
      if (this.getAttribute('aria-haspopup') === 'menu') return rect(window.innerHeight - 90, 44);
      return rect(0, window.innerHeight);
    });
    try {
      const { menu } = await openMenu('Jo');
      expect(menu).toHaveClass('adult-menu--up');
    } finally {
      spy.mockRestore();
      document.body.style.overflowY = '';
    }
  });
});

describe('the menu keyboard model (UX §6)', () => {
  it('Enter opens with focus on the first item; ↓/↑ wrap; Home/End jump', async () => {
    await renderReady();
    const u = userEvent.setup();
    manage('Alex').focus();
    await u.keyboard('{Enter}');
    const items = within(await screen.findByRole('menu')).getAllByRole('menuitem');
    await waitFor(() => expect(items[0]).toHaveFocus());
    await u.keyboard('{ArrowDown}');
    expect(items[1]).toHaveFocus();
    await u.keyboard('{ArrowDown}');
    expect(items[0]).toHaveFocus();
    await u.keyboard('{ArrowUp}');
    expect(items[1]).toHaveFocus();
    await u.keyboard('{Home}');
    expect(items[0]).toHaveFocus();
    await u.keyboard('{End}');
    expect(items[1]).toHaveFocus();
  });

  it('Space and ↓ open on the first item, ↑ on the last', async () => {
    await renderReady();
    const u = userEvent.setup();
    for (const [key, which] of [['{ }', 0], ['{ArrowDown}', 0], ['{ArrowUp}', 1]] as const) {
      manage('Jo').focus();
      await u.keyboard(key);
      const items = within(await screen.findByRole('menu')).getAllByRole('menuitem');
      await waitFor(() => expect(items[which]).toHaveFocus());
      await u.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    }
  });

  it('Escape closes the menu, returns focus to the button, and stops there', async () => {
    await renderReady();
    const outer = vi.fn();
    window.addEventListener('keydown', outer);
    try {
      const { u } = await openMenu('Jo');
      await u.keyboard('{Escape}');
      expect(screen.queryByRole('menu')).toBeNull();
      expect(manage('Jo')).toHaveFocus();
      expect(manage('Jo')).toHaveAttribute('aria-expanded', 'false');
      expect(outer).not.toHaveBeenCalledWith(expect.objectContaining({ key: 'Escape' }));
    } finally {
      window.removeEventListener('keydown', outer);
    }
  });

  it('Tab closes the menu', async () => {
    await renderReady();
    const { u } = await openMenu('Alex');
    await u.tab();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('a click outside closes it; clicking the button again closes it', async () => {
    await renderReady();
    const { u } = await openMenu('Alex');
    await u.click(screen.getByText('Accounts'));
    expect(screen.queryByRole('menu')).toBeNull();
    await u.click(manage('Alex'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await u.click(manage('Alex'));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('one menu at a time', async () => {
    await renderReady();
    const { u } = await openMenu('Alex');
    await u.click(manage('Jo'));
    expect(screen.getAllByRole('menu')).toHaveLength(1);
    expect(screen.getByRole('menu')).toHaveAccessibleName('Manage Jo');
  });
});

describe('Remove (UX §3.1)', () => {
  it('names the person, says what goes, and starts on Cancel', async () => {
    await renderReady();
    const { dialog } = await openConfirm('Alex', 'Remove Alex…');
    expect(dialog).toHaveAccessibleName('Remove Alex?');
    expect(dialog).toHaveAccessibleDescription(
      'Alex will be signed out everywhere. Their favorites and settings will be deleted. The apps everyone shares stay as they are.',
    );
    expect(within(dialog).queryByText(/pending invite/)).toBeNull();
    expect(within(dialog).queryByText(/single sign-on/)).toBeNull();
    const buttons = within(dialog).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['Cancel', 'Remove Alex']);
    expect(buttons[1]).toHaveClass('settings-danger-btn');
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus());
  });

  it('AC-004 — one pending invite they made: the singular line', async () => {
    vi.mocked(listInvites).mockResolvedValue([invite('i-1', 'Pat', ALEX), invite('i-2', 'Lee', CALEB)]);
    await renderReady();
    const { dialog } = await openConfirm('Alex', 'Remove Alex…');
    expect(within(dialog).getByText("Alex's 1 pending invite will stop working.")).toBeInTheDocument();
  });

  it('AC-004 — several: the plural line', async () => {
    vi.mocked(listInvites).mockResolvedValue([invite('i-1', 'Pat', ALEX), invite('i-2', 'Lee', ALEX), invite('i-3', 'Kim', ALEX)]);
    await renderReady();
    const { dialog } = await openConfirm('Alex', 'Remove Alex…');
    expect(within(dialog).getByText("Alex's 3 pending invites will stop working.")).toBeInTheDocument();
  });

  it('AC-012 — with single sign-on on, the SSO line shows for every adult (A-4)', async () => {
    sso(true);
    await renderReady();
    const { u, dialog } = await openConfirm('Jo', 'Remove Jo…');
    expect(
      within(dialog).getByText(
        'If Jo uses single sign-on, they can sign in again that way. To stop that, remove them in your identity provider too.',
      ),
    ).toBeInTheDocument();
    await u.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    const again = await openConfirm('Alex', 'Remove Alex…');
    expect(within(again.dialog).getByText(/If Alex uses single sign-on/)).toBeInTheDocument();
  });

  it('removes: busy "Removing…", then the row and their invites leave, and the status says so', async () => {
    vi.mocked(listInvites).mockResolvedValue([invite('i-1', 'Pat', ALEX), invite('i-2', 'Lee', CALEB)]);
    let finish: (v: { ok: boolean; status: number }) => void = () => {};
    vi.mocked(removeAccount).mockReturnValue(new Promise((res) => (finish = res)));
    await renderReady();
    const { u, dialog } = await openConfirm('Alex', 'Remove Alex…');
    await u.click(within(dialog).getByRole('button', { name: 'Remove Alex' }));
    expect(removeAccount).toHaveBeenCalledWith('u-alex');
    expect(within(dialog).getByRole('button', { name: 'Removing…' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();

    finish({ ok: true, status: 204 });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.queryByText('alex@example.com')).toBeNull();
    const invites = screen.getAllByTestId('invite-row');
    expect(invites).toHaveLength(1);
    expect(invites[0]).toHaveTextContent('Lee');
    expect(screen.getByRole('status')).toHaveTextContent('Alex was removed.');
  });

  it('focus after a removal goes to the next Manage button', async () => {
    vi.mocked(removeAccount).mockResolvedValue({ ok: true, status: 204 });
    await renderReady();
    const { u, dialog } = await openConfirm('Alex', 'Remove Alex…');
    await u.click(within(dialog).getByRole('button', { name: 'Remove Alex' }));
    await waitFor(() => expect(manage('Jo')).toHaveFocus());
  });

  it('…to the previous one when it was the last', async () => {
    vi.mocked(removeAccount).mockResolvedValue({ ok: true, status: 204 });
    await renderReady();
    const { u, dialog } = await openConfirm('Jo', 'Remove Jo…');
    await u.click(within(dialog).getByRole('button', { name: 'Remove Jo' }));
    await waitFor(() => expect(manage('Alex')).toHaveFocus());
  });

  it('…and to "+ Add an adult" when no adult row is left', async () => {
    vi.mocked(listAccounts).mockResolvedValue([CALEB, JO, SAM]);
    vi.mocked(removeAccount).mockResolvedValue({ ok: true, status: 204 });
    await renderReady();
    const { u, dialog } = await openConfirm('Jo', 'Remove Jo…');
    await u.click(within(dialog).getByRole('button', { name: 'Remove Jo' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '+ Add an adult' })).toHaveFocus());
  });

  it('Cancel changes nothing and returns focus to that row\'s Manage button', async () => {
    await renderReady();
    const { u, dialog } = await openConfirm('Jo', 'Remove Jo…');
    await u.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(removeAccount).not.toHaveBeenCalled();
    await waitFor(() => expect(manage('Jo')).toHaveFocus());
  });

  it('Escape is Cancel, and it stops there', async () => {
    await renderReady();
    const outer = vi.fn();
    const { u } = await openConfirm('Jo', 'Remove Jo…');
    window.addEventListener('keydown', outer);
    try {
      await u.keyboard('{Escape}');
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(outer).not.toHaveBeenCalledWith(expect.objectContaining({ key: 'Escape' }));
      await waitFor(() => expect(manage('Jo')).toHaveFocus());
    } finally {
      window.removeEventListener('keydown', outer);
    }
  });

  it('Tab stays inside the confirm', async () => {
    await renderReady();
    const { u, dialog } = await openConfirm('Jo', 'Remove Jo…');
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus());
    await u.tab();
    expect(within(dialog).getByRole('button', { name: 'Remove Jo' })).toHaveFocus();
    await u.tab();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });
});

describe('Make member and Make admin (UX §3.2, §3.3)', () => {
  it('Make member: the copy, primary style, "Saving…", then the pill changes in place', async () => {
    let finish: (v: unknown) => void = () => {};
    vi.mocked(setAccountRole).mockReturnValue(new Promise((res) => (finish = res)) as never);
    await renderReady();
    const { u, dialog } = await openConfirm('Alex', 'Make member');
    expect(dialog).toHaveAccessibleName('Make Alex a member?');
    expect(dialog).toHaveAccessibleDescription(
      "Alex will be signed out on every device. After that, Alex can't change apps, settings or accounts.",
    );
    expect(within(dialog).queryByText(/Admins can do everything/)).toBeNull();
    const primary = within(dialog).getByRole('button', { name: 'Make member' });
    expect(primary).not.toHaveClass('settings-danger-btn');
    await u.click(primary);
    expect(setAccountRole).toHaveBeenCalledWith('u-alex', 'member');
    expect(within(dialog).getByRole('button', { name: 'Saving…' })).toBeDisabled();

    finish({ ok: true, status: 200, account: { ...ALEX, role: 'member' } });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(within(row('Alex')).getByText('member')).toHaveClass('role-pill');
    expect(screen.getAllByTestId('account-row').map((r) => r.querySelector('.accounts-name')?.textContent)).toEqual([
      'Caleb',
      'Alex',
      'Jo',
      'Sam',
    ]);
    expect(screen.getByRole('status')).toHaveTextContent('Alex is now a member.');
    await waitFor(() => expect(manage('Alex')).toHaveFocus());
    const { menu } = await openMenu('Alex');
    expect(within(menu).getAllByRole('menuitem')[0]).toHaveTextContent('Make admin');
  });

  it('Make admin: the copy and the amber line; success reads "Jo is now an admin."', async () => {
    vi.mocked(setAccountRole).mockResolvedValue({ ok: true, status: 200, account: { ...JO, role: 'admin' } });
    await renderReady();
    const { u, dialog } = await openConfirm('Jo', 'Make admin');
    expect(dialog).toHaveAccessibleName('Make Jo an admin?');
    expect(dialog).toHaveAccessibleDescription(
      'Jo will be signed out on every device. After signing in again, Jo can change apps, settings and accounts.',
    );
    expect(within(dialog).getByText('Admins can do everything you can, including inviting other admins.')).toHaveClass(
      'add-adult-warn',
    );
    expect(within(dialog).getAllByRole('button').map((b) => b.textContent)).toEqual(['Cancel', 'Make admin']);
    await u.click(within(dialog).getByRole('button', { name: 'Make admin' }));
    expect(setAccountRole).toHaveBeenCalledWith('u-jo', 'admin');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(within(row('Jo')).getByText('admin')).toHaveClass('role-pill');
    expect(screen.getByRole('status')).toHaveTextContent('Jo is now an admin.');
  });
});

describe('errors inside a confirm (UX §3.4)', () => {
  it.each([
    ['last_admin', { ok: false, status: 409, code: 'last_admin' }, 'Homepad needs at least one admin.'],
    ['self', { ok: false, status: 409, code: 'self' }, "You can't change your own account here. Ask another admin."],
    ['404', { ok: false, status: 404 }, "Alex isn't in Homepad anymore."],
  ] as const)('%s: the line, the primary disabled, Cancel reads Close, closing reloads', async (_n, answer, line) => {
    vi.mocked(removeAccount).mockResolvedValue(answer);
    await renderReady();
    expect(listAccounts).toHaveBeenCalledTimes(1);
    const { u, dialog } = await openConfirm('Alex', 'Remove Alex…');
    await u.click(within(dialog).getByRole('button', { name: 'Remove Alex' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(line);
    expect(within(dialog).getByRole('button', { name: 'Remove Alex' })).toBeDisabled();
    expect(within(dialog).queryByRole('button', { name: 'Cancel' })).toBeNull();
    await u.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await waitFor(() => expect(listAccounts).toHaveBeenCalledTimes(2));
  });

  it('the same lines for a role change', async () => {
    vi.mocked(setAccountRole).mockResolvedValue({ ok: false, status: 409, code: 'last_admin' });
    await renderReady();
    const { u, dialog } = await openConfirm('Alex', 'Make member');
    await u.click(within(dialog).getByRole('button', { name: 'Make member' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Homepad needs at least one admin.');
    expect(within(dialog).getByRole('button', { name: 'Make member' })).toBeDisabled();
    await u.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await waitFor(() => expect(listAccounts).toHaveBeenCalledTimes(2));
  });

  it('401: "You were signed out…" with one button, Reload', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    vi.mocked(setAccountRole).mockResolvedValue({ ok: false, status: 401, error: 'unauthorized' });
    await renderReady();
    const { u, dialog } = await openConfirm('Jo', 'Make admin');
    await u.click(within(dialog).getByRole('button', { name: 'Make admin' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'You were signed out. Reload the page to sign in again.',
    );
    const buttons = within(dialog).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['Reload']);
    await u.click(buttons[0]);
    expect(reload).toHaveBeenCalled();
  });

  it('network or anything else on Remove: try again, both buttons enabled', async () => {
    vi.mocked(removeAccount).mockResolvedValueOnce({ ok: false, status: 0, error: 'network error' });
    vi.mocked(removeAccount).mockResolvedValueOnce({ ok: true, status: 204 });
    await renderReady();
    const { u, dialog } = await openConfirm('Alex', 'Remove Alex…');
    await u.click(within(dialog).getByRole('button', { name: 'Remove Alex' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent("Couldn't remove Alex. Try again.");
    expect(within(dialog).getByRole('button', { name: 'Remove Alex' })).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeEnabled();
    await u.click(within(dialog).getByRole('button', { name: 'Remove Alex' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.queryByText('alex@example.com')).toBeNull();
  });

  it('anything else on a role change: "Couldn\'t change Jo\'s role. Try again."', async () => {
    vi.mocked(setAccountRole).mockResolvedValue({ ok: false, status: 500, error: 'internal error' });
    await renderReady();
    const { u, dialog } = await openConfirm('Jo', 'Make admin');
    await u.click(within(dialog).getByRole('button', { name: 'Make admin' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent("Couldn't change Jo's role. Try again.");
    expect(within(dialog).getByRole('button', { name: 'Make admin' })).toBeEnabled();
    await u.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(listAccounts).toHaveBeenCalledTimes(1);
  });

  it('a 200 without a row still updates the pill from the role asked for', async () => {
    vi.mocked(setAccountRole).mockResolvedValue({ ok: true, status: 200 });
    await renderReady();
    const { u, dialog } = await openConfirm('Jo', 'Make admin');
    await u.click(within(dialog).getByRole('button', { name: 'Make admin' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(within(row('Jo')).getByText('admin')).toHaveClass('role-pill');
  });
});

describe('accessibility', () => {
  it('the section with a menu open has no axe violations', async () => {
    const { container } = await renderReady();
    await openMenu('Jo');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('each confirm has no axe violations', async () => {
    sso(true);
    vi.mocked(listInvites).mockResolvedValue([invite('i-1', 'Pat', ALEX)]);
    await renderReady();
    for (const [name, item] of [['Alex', 'Remove Alex…'], ['Alex', 'Make member'], ['Jo', 'Make admin']] as const) {
      const { u, dialog } = await openConfirm(name, item);
      expect(await axe(dialog)).toHaveNoViolations();
      await u.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    }
  });
});
