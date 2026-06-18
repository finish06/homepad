import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import SettingsPanel from './SettingsPanel';
import {
  createLibraryApp,
  deleteLibraryApp,
  listLibrary,
  setLibraryOrder,
  updateLibraryApp,
  type LibraryOffer,
} from './api';

vi.mock('./api', () => ({
  listLibrary: vi.fn(),
  createLibraryApp: vi.fn(),
  updateLibraryApp: vi.fn(),
  deleteLibraryApp: vi.fn(),
  setLibraryOrder: vi.fn(),
}));

expect.extend(toHaveNoViolations);

const OFFERS: LibraryOffer[] = [
  {
    id: 'L1', name: 'Jellyfin', url: 'https://jf.x', icon: '', description: 'Media',
    suggestedCategory: 'Media', sortIndex: 0, added: false,
  },
  {
    id: 'L2', name: 'Gitea', url: 'https://gitea.x', icon: '', description: 'Git',
    suggestedCategory: 'Dev', sortIndex: 1, added: false,
  },
];

function renderPanel(props: Partial<React.ComponentProps<typeof SettingsPanel>> = {}) {
  return render(
    <SettingsPanel
      isAdmin={props.isAdmin ?? true}
      oidcEnabled={props.oidcEnabled ?? false}
      onClose={props.onClose ?? vi.fn()}
    />,
  );
}

beforeEach(() => {
  vi.mocked(listLibrary).mockResolvedValue(OFFERS);
  vi.mocked(createLibraryApp).mockResolvedValue({
    ok: true, status: 201,
    offer: { id: 'L3', name: 'Plex', url: 'https://plex.x', icon: '', description: '', suggestedCategory: '', sortIndex: 2, added: false },
  });
  vi.mocked(updateLibraryApp).mockResolvedValue({ ok: true, status: 200, offer: { ...OFFERS[0], name: 'JF' } });
  vi.mocked(deleteLibraryApp).mockResolvedValue(true);
  vi.mocked(setLibraryOrder).mockResolvedValue(true);
});

afterEach(() => vi.clearAllMocks());

describe('A17 — admin-only visibility', () => {
  it('an admin sees both the library management and system settings sections', async () => {
    renderPanel({ isAdmin: true });
    expect(await screen.findByTestId('settings-library')).toBeInTheDocument();
    expect(screen.getByTestId('settings-system')).toBeInTheDocument();
  });

  it('a non-admin sees neither admin section', async () => {
    renderPanel({ isAdmin: false });
    // The personal area still renders; the admin sections must not.
    await waitFor(() => expect(listLibrary).not.toHaveBeenCalled());
    expect(screen.queryByTestId('settings-library')).not.toBeInTheDocument();
    expect(screen.queryByTestId('settings-system')).not.toBeInTheDocument();
  });
});

describe('A17/A15 — read-only system settings', () => {
  it('shows OIDC enabled and notes it is env-managed', async () => {
    renderPanel({ isAdmin: true, oidcEnabled: true });
    const sys = await screen.findByTestId('settings-system');
    expect(within(sys).getByText(/oidc/i)).toBeInTheDocument();
    expect(within(sys).getByText(/enabled/i)).toBeInTheDocument();
    expect(within(sys).getAllByText(/environment|redeploy/i).length).toBeGreaterThan(0);
  });

  it('shows OIDC disabled when off', async () => {
    renderPanel({ isAdmin: true, oidcEnabled: false });
    const sys = await screen.findByTestId('settings-system');
    expect(within(sys).getByText(/disabled/i)).toBeInTheDocument();
  });
});

describe('A17 — library management', () => {
  it('lists the curated offers', async () => {
    renderPanel({ isAdmin: true });
    await screen.findByTestId('settings-library');
    const rows = screen.getAllByTestId('library-manage-row');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('Jellyfin')).toBeInTheDocument();
  });

  it('creates a new offer from the add form', async () => {
    renderPanel({ isAdmin: true });
    await screen.findByTestId('settings-library');
    await userEvent.type(screen.getByTestId('library-new-name'), 'Plex');
    await userEvent.type(screen.getByTestId('library-new-url'), 'https://plex.x');
    await userEvent.click(screen.getByTestId('library-new-submit'));
    await waitFor(() =>
      expect(createLibraryApp).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Plex', url: 'https://plex.x' }),
      ),
    );
  });

  it('deleting an offer confirms that existing copies are kept (C1/OQ5)', async () => {
    renderPanel({ isAdmin: true });
    await screen.findByTestId('settings-library');
    await userEvent.click(screen.getByTestId('library-delete-L1'));
    // The confirm states copies survive before anything is deleted.
    expect(screen.getByTestId('library-delete-confirm')).toHaveTextContent(
      /existing users keep their copies/i,
    );
    await userEvent.click(screen.getByTestId('library-delete-confirm-yes'));
    await waitFor(() => expect(deleteLibraryApp).toHaveBeenCalledWith('L1'));
  });

  it('reorders an offer down via the move control', async () => {
    renderPanel({ isAdmin: true });
    await screen.findByTestId('settings-library');
    await userEvent.click(screen.getByTestId('library-move-down-L1'));
    await waitFor(() => expect(setLibraryOrder).toHaveBeenCalledWith(['L2', 'L1']));
  });

  it('edits an offer (PATCH) from the row edit control', async () => {
    renderPanel({ isAdmin: true });
    await screen.findByTestId('settings-library');
    await userEvent.click(screen.getByTestId('library-edit-L1'));
    const nameField = screen.getByTestId('library-edit-name-L1');
    await userEvent.clear(nameField);
    await userEvent.type(nameField, 'JF');
    await userEvent.click(screen.getByTestId('library-edit-save-L1'));
    await waitFor(() =>
      expect(updateLibraryApp).toHaveBeenCalledWith('L1', expect.objectContaining({ name: 'JF' })),
    );
  });
});

// v11 §4.2 A4 — the modal title is "Admin Panel" (not "Settings"), with a
// global-scope subtitle and a matching dialog aria-label.
describe('v11 A4 — Admin Panel title + scope subtitle', () => {
  it('titles the panel "Admin Panel" and not "Settings"', async () => {
    renderPanel({ isAdmin: true });
    await screen.findByTestId('settings-library');
    expect(screen.getByRole('heading', { name: 'Admin Panel' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Settings' })).not.toBeInTheDocument();
  });

  it('the dialog aria-label is "Admin Panel"', async () => {
    renderPanel({ isAdmin: true });
    expect(await screen.findByTestId('settings-panel')).toHaveAttribute('aria-label', 'Admin Panel');
  });

  it('shows a subtitle saying changes are global / affect all users', async () => {
    renderPanel({ isAdmin: true });
    const panel = await screen.findByTestId('settings-panel');
    expect(within(panel).getByText(/global.*affect all users/i)).toBeInTheDocument();
  });
});

// v11 §4.3 A5/A6 — section scope notes spell out cross-user impact.
describe('v11 A5/A6 — section scope notes', () => {
  it('A5 — the App Library note names "all users" and "personal dashboards"', async () => {
    renderPanel({ isAdmin: true });
    const lib = await screen.findByTestId('settings-library');
    expect(within(lib).getByText(/all users/i)).toBeInTheDocument();
    expect(within(lib).getByText(/personal dashboards/i)).toBeInTheDocument();
  });

  it('A6 — the System note says it applies "globally to all accounts"', async () => {
    renderPanel({ isAdmin: true });
    const sys = await screen.findByTestId('settings-system');
    expect(within(sys).getByText(/globally to all accounts/i)).toBeInTheDocument();
  });
});

describe('A17/A19 — a11y + dismissal', () => {
  it('Escape closes the panel', async () => {
    const onClose = vi.fn();
    renderPanel({ isAdmin: true, onClose });
    await screen.findByTestId('settings-library');
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('has no axe violations (admin, populated)', async () => {
    const { container } = renderPanel({ isAdmin: true, oidcEnabled: true });
    await screen.findByTestId('settings-library');
    expect(await axe(container)).toHaveNoViolations();
  });
});
