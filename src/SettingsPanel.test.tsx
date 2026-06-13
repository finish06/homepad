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
