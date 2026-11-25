import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { categories, me, servicesWithStatus, type Service, type User } from '../api';

// SPEC-backup-import UX §5 / B-2 (TASK-306) — an admin with no apps sees "Coming
// from Homepage? Import your services.yaml", which opens the import over the
// dashboard. Users and kids see no change (AC-032). After an import, the
// dashboard reloads its services and sections.

const appGridMounts = vi.fn();
// The stub shows the dashboardEmpty and userId props App threads in
// (SPEC-dashboard-empty-loading §3.5).
vi.mock('../grid/AppGrid', () => ({
  default: (props: { dashboardEmpty?: boolean; userId?: string }) => {
    appGridMounts();
    return (
      <div
        data-testid="app-grid-stub"
        data-dashboard-empty={String(!!props.dashboardEmpty)}
        data-user-id={props.userId ?? ''}
      />
    );
  },
}));
vi.mock('../library/backup/HomepageImportModal', () => ({
  default: (props: { onClose: () => void; onApplied: () => void }) => (
    <div role="dialog" aria-label="Import from Homepage, step 1 of 3" data-testid="import-stub">
      <button onClick={props.onApplied}>applied</button>
      <button onClick={props.onClose}>close</button>
    </div>
  ),
}));
vi.mock('../library/LibraryBrowse', () => ({
  default: (props: { onClose: () => void }) => (
    <div data-testid="library-stub">
      <button onClick={props.onClose}>close library</button>
    </div>
  ),
}));
vi.mock('../library/ServiceForm', () => ({
  default: (props: { onClose: () => void }) => (
    <div data-testid="service-form-stub">
      <button onClick={props.onClose}>close form</button>
    </div>
  ),
}));
vi.mock('../api', () => ({
  authConfig: vi.fn(() => Promise.resolve({ oidcEnabled: false })),
  systemConfig: vi.fn(() => Promise.resolve({ showUptimeDisplay: true, statusDegradedMs: 1000 })),
  saveSystemSettings: vi.fn(),
  me: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  setThemePref: vi.fn(),
  refreshStatus: vi.fn(),
  categories: vi.fn(() => Promise.resolve([])),
  services: vi.fn(() => Promise.resolve([])),
  servicesWithStatus: vi.fn(() => Promise.resolve({ status: 200, services: [] })),
}));

const user = (role: User['role']): User => ({ id: 'u1', email: role === 'kid' ? '' : 'lilo@ohana.io', role, themePref: 'system' });

beforeEach(() => {
  vi.mocked(servicesWithStatus).mockResolvedValue({ status: 200, services: [] });
});
afterEach(() => vi.clearAllMocks());

describe('Empty dashboard — the Homepage import link (B-2)', () => {
  it('an admin with no apps sees the link, and it opens the import', async () => {
    vi.mocked(me).mockResolvedValue(user('admin'));
    const u = userEvent.setup();
    render(<App />);
    const empty = await screen.findByTestId('admin-empty');
    expect(empty).toHaveTextContent('No apps yet.');
    expect(empty).toHaveTextContent('Coming from Homepage?');
    await u.click(screen.getByRole('button', { name: 'Import your services.yaml' }));
    expect(await screen.findByTestId('import-stub')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'close' }));
    expect(screen.queryByTestId('import-stub')).toBeNull();
  });

  it('the two other buttons open Add an app and the App Library', async () => {
    vi.mocked(me).mockResolvedValue(user('admin'));
    const u = userEvent.setup();
    render(<App />);
    await screen.findByTestId('admin-empty');
    await u.click(screen.getByRole('button', { name: '+ Add an app' }));
    expect(await screen.findByTestId('service-form-stub')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'close form' }));
    await u.click(screen.getByRole('button', { name: 'Browse the App Library' }));
    expect(await screen.findByTestId('library-stub')).toBeInTheDocument();
  });

  it('after an import the dashboard reloads its apps and sections', async () => {
    vi.mocked(me).mockResolvedValue(user('admin'));
    const u = userEvent.setup();
    render(<App />);
    await screen.findByTestId('admin-empty');
    const svcCalls = vi.mocked(servicesWithStatus).mock.calls.length;
    const catCalls = vi.mocked(categories).mock.calls.length;
    const mounts = appGridMounts.mock.calls.length;
    const svc = { id: 's1', slug: 'sonarr', name: 'Sonarr' } as Service;
    vi.mocked(servicesWithStatus).mockResolvedValue({ status: 200, services: [svc] });
    await u.click(screen.getByRole('button', { name: 'Import your services.yaml' }));
    await u.click(await screen.findByRole('button', { name: 'applied' }));
    await waitFor(() => expect(vi.mocked(servicesWithStatus).mock.calls.length).toBeGreaterThan(svcCalls));
    expect(vi.mocked(categories).mock.calls.length).toBeGreaterThan(catCalls);
    await waitFor(() => expect(appGridMounts.mock.calls.length).toBeGreaterThan(mounts));
    await waitFor(() => expect(screen.queryByTestId('admin-empty')).toBeNull());
  });

  it('the link goes away once there is one app', async () => {
    vi.mocked(me).mockResolvedValue(user('admin'));
    vi.mocked(servicesWithStatus).mockResolvedValue({ status: 200, services: [{ id: 's1' } as Service] });
    render(<App />);
    await screen.findByTestId('app-grid-stub');
    await waitFor(() => expect(servicesWithStatus).toHaveBeenCalled());
    expect(screen.queryByTestId('admin-empty')).toBeNull();
  });

  it('a user sees no link (AC-032)', async () => {
    vi.mocked(me).mockResolvedValue(user('member'));
    render(<App />);
    await screen.findByTestId('app-grid-stub');
    await waitFor(() => expect(servicesWithStatus).toHaveBeenCalled());
    expect(screen.queryByTestId('admin-empty')).toBeNull();
    expect(screen.queryByText(/Coming from Homepage/)).toBeNull();
  });

  it('a kid keeps their own empty state (AC-032)', async () => {
    vi.mocked(me).mockResolvedValue(user('kid'));
    render(<App />);
    expect(await screen.findByTestId('kid-empty')).toHaveTextContent('No apps yet. Ask a grown-up to add some.');
    expect(screen.queryByTestId('admin-empty')).toBeNull();
  });
});

// SPEC-dashboard-empty-loading AC-012, AC-013, AC-021, AC-022 — the member's
// empty dashboard, and one dashboardEmpty value for the blocks and the grid.
describe('Empty dashboard — member-empty and the dashboardEmpty prop', () => {
  it('a member with no apps sees member-empty, with no button, in the kid-empty look', async () => {
    vi.mocked(me).mockResolvedValue(user('member'));
    render(<App />);
    const empty = await screen.findByTestId('member-empty');
    expect(empty).toHaveTextContent(/^No apps yet\. Ask an admin to add some\.$/);
    expect(empty).toHaveClass('kid-empty');
    expect(empty.querySelector('button, a')).toBeNull();
    expect(screen.queryByTestId('admin-empty')).toBeNull();
    expect(screen.getByTestId('app-grid-stub')).toHaveAttribute('data-dashboard-empty', 'true');
  });

  it('a member with apps sees no member-empty, and the grid gets dashboardEmpty false', async () => {
    vi.mocked(me).mockResolvedValue(user('member'));
    vi.mocked(servicesWithStatus).mockResolvedValue({ status: 200, services: [{ id: 's1' } as Service] });
    render(<App />);
    await waitFor(() =>
      expect(screen.getByTestId('app-grid-stub')).toHaveAttribute('data-dashboard-empty', 'false'),
    );
    await waitFor(() => expect(servicesWithStatus).toHaveBeenCalled());
    expect(screen.queryByTestId('member-empty')).toBeNull();
  });

  it('dashboardEmpty reaches the grid true exactly while admin-empty shows', async () => {
    vi.mocked(me).mockResolvedValue(user('admin'));
    render(<App />);
    await screen.findByTestId('admin-empty');
    expect(screen.getByTestId('app-grid-stub')).toHaveAttribute('data-dashboard-empty', 'true');
    expect(screen.queryByTestId('member-empty')).toBeNull();
  });

  it('the grid is not told the dashboard is empty while services are still loading', async () => {
    vi.mocked(me).mockResolvedValue(user('member'));
    vi.mocked(servicesWithStatus).mockReturnValue(new Promise(() => {}));
    render(<App />);
    const stub = await screen.findByTestId('app-grid-stub');
    expect(stub).toHaveAttribute('data-dashboard-empty', 'false');
    expect(screen.queryByTestId('member-empty')).toBeNull();
  });

  it('the grid gets the user id for its skeleton cache', async () => {
    vi.mocked(me).mockResolvedValue(user('member'));
    render(<App />);
    expect(await screen.findByTestId('app-grid-stub')).toHaveAttribute('data-user-id', 'u1');
  });

  it('a kid with no apps gets kid-empty and no grid at all', async () => {
    vi.mocked(me).mockResolvedValue(user('kid'));
    render(<App />);
    await screen.findByTestId('kid-empty');
    expect(screen.queryByTestId('app-grid-stub')).toBeNull();
    expect(screen.queryByTestId('member-empty')).toBeNull();
  });
});
