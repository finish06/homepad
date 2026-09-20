import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AppGrid from './AppGrid';
import * as api from '../api';
import { RECENT_KEY } from '../lib/recentlyOpened';
import type { Category, Service } from '../api';

// cap3 — the "Recently opened" row, rendered above the grid.
//
// NOTE the spec's §2/§6 guidance targets `src/Catalog.tsx` / `ServiceTile`, which
// the v16 AppGrid rewrite deleted. The ACs are behavioural and unchanged; only the
// mount point moved. Recorded in the spec.

vi.mock('../api', () => ({
  categories: vi.fn(),
  services: vi.fn(),
  saveCategoryWidth: vi.fn(),
  createCategory: vi.fn(),
  setFavorite: vi.fn(),
  renameCategory: vi.fn(),
  deleteCategory: vi.fn(),
  setCategoryOrder: vi.fn(),
  setTileOrder: vi.fn(),
  updateService: vi.fn(),
  safeHref: (u: string) => u,
}));
vi.mock('./IframeOverlay', () => ({ default: () => null }));
vi.mock('./TileEditModal', () => ({ default: () => null }));

function svc(id: string, name: string, categoryId: string | null): Service {
  return {
    id, slug: id, name, description: '', url: `https://${id}.test`, icon: '',
    status: 'UP', favorite: false, iconLight: false, iconDark: false,
    categoryId, categoryName: categoryId,
  };
}
function cat(id: string, name: string, sortIndex: number): Category {
  return { id, name, sortIndex, gridWidth: 6, layoutRow: sortIndex, layoutColOrder: 0, layoutWidthPct: 100 };
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(api.categories).mockResolvedValue([cat('c1', 'Media', 0)]);
  vi.mocked(api.services).mockResolvedValue([svc('s1', 'Plex', 'c1'), svc('s2', 'Grafana', 'c1')]);
  vi.mocked(api.setFavorite).mockResolvedValue(true);
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});

const seed = (ids: string[]) => localStorage.setItem(RECENT_KEY, JSON.stringify(ids));

describe('cap3 — recently opened row', () => {
  it('AC-001 — absent when nothing has been opened', async () => {
    render(<AppGrid isAdmin={false} />);
    await waitFor(() => expect(screen.getByTestId('app-grid')).toBeInTheDocument());
    expect(screen.queryByTestId('recently-opened-row')).toBeNull();
  });

  it('AC-001/AC-007 — renders newest-first with the specified test hooks', async () => {
    seed(['s2', 's1']);
    render(<AppGrid isAdmin={false} />);
    const row = await screen.findByTestId('recently-opened-row');
    const items = within(row).getAllByTestId('recently-opened-item');
    expect(items.map((i) => i.getAttribute('data-service-id'))).toEqual(['s2', 's1']);
    expect(within(row).getByTestId('recently-opened-clear')).toBeInTheDocument();
  });

  it('AC-003 — each item shows the service name and is a link to its URL', async () => {
    seed(['s1']);
    render(<AppGrid isAdmin={false} />);
    const item = await screen.findByTestId('recently-opened-item');
    expect(item).toHaveTextContent('Plex');
    expect(item).toHaveAttribute('href', 'https://s1.test');
  });

  it('AC-002/AC-004 — clicking a tile records it, and it appears in the row', async () => {
    render(<AppGrid isAdmin={false} />);
    await waitFor(() => expect(screen.getByTestId('app-grid')).toBeInTheDocument());
    expect(screen.queryByTestId('recently-opened-row')).toBeNull();

    const tiles = screen.getAllByTestId('tool-link');
    await userEvent.click(tiles[0]);

    const row = await screen.findByTestId('recently-opened-row');
    expect(within(row).getAllByTestId('recently-opened-item')).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(RECENT_KEY)!)).toHaveLength(1);
  });

  it('AC-005 — Clear empties the list and hides the row immediately', async () => {
    seed(['s1', 's2']);
    render(<AppGrid isAdmin={false} />);
    const row = await screen.findByTestId('recently-opened-row');
    await userEvent.click(within(row).getByTestId('recently-opened-clear'));
    await waitFor(() => expect(screen.queryByTestId('recently-opened-row')).toBeNull());
    expect(localStorage.getItem(RECENT_KEY)).toBeNull();
  });

  it('AC-006 — ids for services no longer in the catalog are dropped', async () => {
    seed(['deleted-service', 's1']);
    render(<AppGrid isAdmin={false} />);
    const row = await screen.findByTestId('recently-opened-row');
    const items = within(row).getAllByTestId('recently-opened-item');
    expect(items.map((i) => i.getAttribute('data-service-id'))).toEqual(['s1']);
  });

  it('AC-006 — the row hides entirely when every stored id is stale', async () => {
    seed(['gone-1', 'gone-2']);
    render(<AppGrid isAdmin={false} />);
    await waitFor(() => expect(screen.getByTestId('app-grid')).toBeInTheDocument());
    expect(screen.queryByTestId('recently-opened-row')).toBeNull();
  });

  it('AC-008 — hidden in edit mode', async () => {
    seed(['s1']);
    render(<AppGrid isAdmin={true} editMode={true} />);
    await waitFor(() => expect(screen.getByTestId('app-grid')).toBeInTheDocument());
    expect(screen.queryByTestId('recently-opened-row')).toBeNull();
  });

  it('AC-009 — hidden when the catalog is empty', async () => {
    vi.mocked(api.services).mockResolvedValue([]);
    seed(['s1']);
    render(<AppGrid isAdmin={false} />);
    await waitFor(() => expect(screen.getByTestId('app-grid')).toBeInTheDocument());
    expect(screen.queryByTestId('recently-opened-row')).toBeNull();
  });
});
