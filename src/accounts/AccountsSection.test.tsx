import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import AccountsSection from './AccountsSection';
import { categories, createKid, kidServices, kidSessions, listAccounts, services, type Account } from '../api';

// SPEC-kid-accounts UX §2 (TASK-402) — the Accounts section of the Admin Panel:
// every account listed; adults listed only (spec §10), kids with "N apps · N
// devices" and an Edit affordance on the whole row; empty, loading (skeleton)
// and error-with-retry states.

vi.mock('../api', () => ({
  listAccounts: vi.fn(),
  services: vi.fn(),
  categories: vi.fn(),
  kidServices: vi.fn(),
  kidSessions: vi.fn(),
  createKid: vi.fn(),
  updateKid: vi.fn(),
  deleteKid: vi.fn(),
  setKidServices: vi.fn(),
  revokeKidSession: vi.fn(),
  signInHere: vi.fn(),
}));

expect.extend(toHaveNoViolations);

const ADMIN: Account = {
  id: 'u-admin', name: 'Caleb', role: 'admin', lastSeenAt: '2026-10-30T08:00:00Z',
  email: 'caleb@ohana.test', avatarColor: 'blue',
};
const ADULT: Account = {
  id: 'u-alex', name: 'Alex', role: 'user', lastSeenAt: null, email: 'alex@example.com', avatarColor: '',
};
const MAYA: Account = {
  id: 'k-maya', name: 'Maya', role: 'kid', lastSeenAt: null, avatarColor: 'teal', appCount: 12, deviceCount: 1,
};
const LEO: Account = {
  id: 'k-leo', name: 'Leo', role: 'kid', lastSeenAt: null, avatarColor: 'orange', appCount: 6, deviceCount: 0,
};
const SAM: Account = {
  id: 'k-sam', name: 'Sam', role: 'kid', lastSeenAt: null, avatarColor: 'pink', appCount: 1, deviceCount: 2,
};

beforeEach(() => {
  vi.mocked(services).mockResolvedValue([]);
  vi.mocked(categories).mockResolvedValue([]);
  vi.mocked(kidServices).mockResolvedValue([]);
  vi.mocked(kidSessions).mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('Accounts list (UX §2)', () => {
  it('lists every account: adults with their email, kids with an app and device summary', async () => {
    vi.mocked(listAccounts).mockResolvedValue([ADMIN, ADULT, MAYA, LEO, SAM]);
    render(<AccountsSection currentUserId="u-admin" />);

    const rows = await screen.findAllByTestId('account-row');
    expect(rows).toHaveLength(5);

    // The signed-in admin reads "you" rather than their own email.
    expect(rows[0]).toHaveTextContent('Caleb');
    expect(within(rows[0]).getByText('admin')).toHaveClass('role-pill');
    expect(rows[0]).toHaveTextContent('you');
    expect(rows[0]).not.toHaveTextContent('caleb@ohana.test');

    expect(rows[1]).toHaveTextContent('Alex');
    expect(rows[1]).toHaveTextContent('alex@example.com');
    expect(within(rows[1]).getByText('user')).toHaveClass('role-pill');

    expect(rows[2]).toHaveTextContent('12 apps · 1 device');
    expect(rows[3]).toHaveTextContent('6 apps · no devices');
    expect(rows[4]).toHaveTextContent('1 app · 2 devices');
  });

  it('adults have no action (listing only); every kid row is one button', async () => {
    vi.mocked(listAccounts).mockResolvedValue([ADMIN, ADULT, MAYA]);
    render(<AccountsSection currentUserId="u-admin" />);
    const rows = await screen.findAllByTestId('account-row');
    expect(within(rows[0]).queryByRole('button')).toBeNull();
    expect(within(rows[1]).queryByRole('button')).toBeNull();
    const edit = within(rows[2]).getByRole('button', { name: /edit maya/i });
    expect(edit).toHaveTextContent('Edit');
  });

  it('paints each account’s avatar dot in its color, defaulting to blue', async () => {
    vi.mocked(listAccounts).mockResolvedValue([ADULT, MAYA]);
    render(<AccountsSection currentUserId="u-admin" />);
    const dots = await screen.findAllByTestId('account-dot');
    expect(dots[0]).toHaveAttribute('data-color', 'blue');
    expect(dots[1]).toHaveAttribute('data-color', 'teal');
  });

  it('says that adults are listed only, and kids are managed here', async () => {
    vi.mocked(listAccounts).mockResolvedValue([ADMIN, MAYA]);
    render(<AccountsSection currentUserId="u-admin" />);
    await screen.findAllByTestId('account-row');
    expect(screen.getByText('Adults are listed only. Kids are managed here.')).toBeInTheDocument();
  });

  it('has a section heading and an "Add a kid" button', async () => {
    vi.mocked(listAccounts).mockResolvedValue([ADMIN]);
    render(<AccountsSection currentUserId="u-admin" />);
    expect(screen.getByRole('heading', { name: 'Accounts' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Add a kid' })).toBeInTheDocument();
  });
});

describe('Accounts — empty, loading and error states', () => {
  it('empty state: with no kids, one explanatory line and the Add button', async () => {
    vi.mocked(listAccounts).mockResolvedValue([ADMIN, ADULT]);
    render(<AccountsSection currentUserId="u-admin" />);
    expect(
      await screen.findByText('Kids get a dashboard with only the apps you choose, signed in on their own device.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Add a kid' })).toBeInTheDocument();
  });

  it('no empty-state line once a kid exists', async () => {
    vi.mocked(listAccounts).mockResolvedValue([ADMIN, MAYA]);
    render(<AccountsSection currentUserId="u-admin" />);
    await screen.findAllByTestId('account-row');
    expect(screen.queryByTestId('accounts-empty')).toBeNull();
  });

  it('loading: fixed-height skeleton rows with an announced status', async () => {
    const d = deferred<Account[]>();
    vi.mocked(listAccounts).mockReturnValue(d.promise);
    render(<AccountsSection currentUserId="u-admin" />);
    expect(screen.getAllByTestId('account-skeleton')).toHaveLength(3);
    expect(screen.getByRole('status')).toHaveTextContent('Loading accounts…');
    d.resolve([ADMIN]);
    await screen.findAllByTestId('account-row');
    expect(screen.queryByTestId('account-skeleton')).toBeNull();
  });

  it('error: inline "Couldn’t load accounts." with a Retry that refetches', async () => {
    vi.mocked(listAccounts).mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce([ADMIN, MAYA]);
    render(<AccountsSection currentUserId="u-admin" />);
    expect(await screen.findByText("Couldn't load accounts.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findAllByTestId('account-row')).toHaveLength(2);
    expect(listAccounts).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Couldn't load accounts.")).toBeNull();
  });
});

describe('Accounts — opening the kid editor', () => {
  it('"+ Add a kid" opens the editor titled "Add a kid"', async () => {
    vi.mocked(listAccounts).mockResolvedValue([ADMIN]);
    render(<AccountsSection currentUserId="u-admin" />);
    await userEvent.click(screen.getByRole('button', { name: '+ Add a kid' }));
    expect(await screen.findByRole('dialog', { name: 'Add a kid' })).toBeInTheDocument();
  });

  it('a kid row opens the editor titled with the kid’s name', async () => {
    vi.mocked(listAccounts).mockResolvedValue([ADMIN, MAYA]);
    render(<AccountsSection currentUserId="u-admin" />);
    await userEvent.click(await screen.findByRole('button', { name: /edit maya/i }));
    expect(await screen.findByRole('dialog', { name: 'Maya' })).toBeInTheDocument();
  });

  it('a kid created in the editor joins the list without a refetch', async () => {
    vi.mocked(listAccounts).mockResolvedValue([ADMIN]);
    vi.mocked(createKid).mockResolvedValue({ ok: true, status: 201, account: { ...LEO, id: 'k-new', appCount: 0 } });
    render(<AccountsSection currentUserId="u-admin" />);
    await userEvent.click(screen.getByRole('button', { name: '+ Add a kid' }));
    await screen.findByRole('dialog', { name: 'Add a kid' });
    await userEvent.type(screen.getByLabelText('Name'), 'Leo');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const rows = screen.getAllByTestId('account-row');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toHaveTextContent('Leo');
    expect(listAccounts).toHaveBeenCalledTimes(1);
  });
});

describe('Accounts — scroll target (UX §1)', () => {
  it('scrolls itself into view when it is the requested section', async () => {
    vi.mocked(listAccounts).mockResolvedValue([ADMIN]);
    const spy = vi.fn();
    Element.prototype.scrollIntoView = spy;
    render(<AccountsSection currentUserId="u-admin" scrollIntoView />);
    await screen.findAllByTestId('account-row');
    expect(spy).toHaveBeenCalled();
    // @ts-expect-error — jsdom has no scrollIntoView; remove the stub again.
    delete Element.prototype.scrollIntoView;
  });

  it('does not throw where scrollIntoView is missing (jsdom)', async () => {
    vi.mocked(listAccounts).mockResolvedValue([ADMIN]);
    render(<AccountsSection currentUserId="u-admin" scrollIntoView />);
    expect(await screen.findAllByTestId('account-row')).toHaveLength(1);
  });
});

describe('Accounts — accessibility (UX §6)', () => {
  it('the list has no axe violations', async () => {
    vi.mocked(listAccounts).mockResolvedValue([ADMIN, ADULT, MAYA, LEO]);
    const { container } = render(<AccountsSection currentUserId="u-admin" />);
    await screen.findAllByTestId('account-row');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('the empty and error states have no axe violations', async () => {
    vi.mocked(listAccounts).mockResolvedValue([ADMIN]);
    const { container, unmount } = render(<AccountsSection currentUserId="u-admin" />);
    await screen.findByTestId('accounts-empty');
    expect(await axe(container)).toHaveNoViolations();
    unmount();
    vi.mocked(listAccounts).mockRejectedValue(new Error('x'));
    const r = render(<AccountsSection currentUserId="u-admin" />);
    await screen.findByText("Couldn't load accounts.");
    expect(await axe(r.container)).toHaveNoViolations();
  });
});
