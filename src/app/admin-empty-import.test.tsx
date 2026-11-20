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
vi.mock('../grid/AppGrid', () => ({
  default: () => {
    appGridMounts();
    return <div data-testid="app-grid-stub" />;
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
    vi.mocked(me).mockResolvedValue(user('user'));
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
