import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AppGrid from './AppGrid';
import type { Category, Service } from './api';
import * as api from './api';

// v21 — the per-tile pencil edit affordance on AppGrid (spec §5, §8.1, AC-001,
// AC-002). Admin + edit-mode only; opens the TileEditModal for that tile. jsdom
// covers the DOM contract (presence/absence, aria-label, opens the dialog); the
// 44×44 hit geometry + no-★-collision are the CSS a11y gate + CDP browser gate.

vi.mock('./api', () => ({
  categories: vi.fn(),
  services: vi.fn(),
  setFavorite: vi.fn(),
  saveCategoryWidth: vi.fn(),
  setCategoryOrder: vi.fn(),
  createCategory: vi.fn(),
  renameCategory: vi.fn(),
  deleteCategory: vi.fn(),
  updateService: vi.fn(),
  uploadIcon: vi.fn(),
  deleteIcon: vi.fn(),
  fetchIcon: vi.fn(),
}));

const cat = (id: string, name: string, sortIndex: number, gridWidth: number): Category => ({ id, name, sortIndex, gridWidth });
const svc = (id: string, name: string, categoryId: string | null): Service =>
  ({ id, name, categoryId, slug: id, description: '', url: `https://${id}.test`, icon: '', status: 'UNKNOWN', favorite: false, iconLight: false, iconDark: false }) as Service;

beforeEach(() => {
  window.innerWidth = 1920;
  vi.mocked(api.categories).mockResolvedValue([cat('c1', 'Media', 0, 4)]);
  vi.mocked(api.services).mockResolvedValue([svc('s1', 'Plex', 'c1'), svc('s2', 'Grafana', 'c1')]);
  vi.mocked(api.setFavorite).mockResolvedValue(true);
  vi.mocked(api.saveCategoryWidth).mockResolvedValue(true);
});

afterEach(() => vi.clearAllMocks());

async function renderGrid(isAdmin: boolean, editMode: boolean) {
  render(<AppGrid isAdmin={isAdmin} editMode={editMode} />);
  await screen.findByTestId('app-grid');
}

describe('v21 — pencil edit affordance (AC-001/AC-002)', () => {
  it('renders a pencil per tile with aria-label "Edit <name>" for an admin in edit mode', async () => {
    await renderGrid(true, true);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Plex' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Edit Grafana' })).toBeInTheDocument();
  });

  it('shows NO pencil for an admin with edit mode off (element absent, not hidden)', async () => {
    await renderGrid(true, false);
    await waitFor(() => expect(screen.getByTestId('app-grid')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Edit Plex' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('tile-edit')).not.toBeInTheDocument();
  });

  it('shows NO pencil for a non-admin even in edit mode', async () => {
    await renderGrid(false, true);
    await waitFor(() => expect(screen.getByTestId('app-grid')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Edit Plex' })).not.toBeInTheDocument();
  });

  it('AC-002 — tapping the pencil opens the labelled edit dialog for that tile', async () => {
    const u = userEvent.setup();
    await renderGrid(true, true);
    await u.click(await screen.findByRole('button', { name: 'Edit Plex' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('heading', { name: /edit tile/i })).toBeInTheDocument();
    // The subtitle names the tile being edited (no ambiguity — §8.2).
    expect(screen.getByTestId('tile-edit-subtitle')).toHaveTextContent('Plex');
  });
});
