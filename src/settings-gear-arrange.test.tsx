import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Catalog from './Catalog';
import { services, setFavorite, categories, getCollapsedCategories, type Service } from './api';

// #166 (reconciled with #174) — per-user Arrange mode (v1 A5.1 + DECISIONS.md
// 2026-06-11). The settings gear in the header toggles Arrange. Arrange gates
// ONLY the per-tile reorder grip: hidden in the normal (decluttered) launcher
// view, revealed when Arrange is on so a user can drag tiles into a new order.
//
// Crucially this does NOT touch the per-tile "⋯" overflow menu shipped in
// v12.2.0 (#174): the menu (Favorite ★ + Remove from dashboard) stays ALWAYS
// present, in both the normal and the Arrange view. Favoriting lives in the
// menu, not behind Arrange. So the end state is: menu always on + Arrange-gated
// reorder grip.

vi.mock('./api', () => ({
  services: vi.fn(),
  setFavorite: vi.fn(),
  setLayout: vi.fn(),
  uploadIcon: vi.fn(),
  deleteIcon: vi.fn(),
  deleteService: vi.fn(),
  createService: vi.fn(),
  updateService: vi.fn(),
  setThemePref: vi.fn(),
  categories: vi.fn(),
  createCategory: vi.fn(),
  renameCategory: vi.fn(),
  deleteCategory: vi.fn(),
  setCategoryOrder: vi.fn(),
  assignCategory: vi.fn(),
  getCollapsedCategories: vi.fn(),
  setCollapsedCategories: vi.fn(),
  listLibrary: vi.fn(),
  addFromLibrary: vi.fn(),
}));

const mockedServices = vi.mocked(services);
const mockedSetFavorite = vi.mocked(setFavorite);
const mockedCategories = vi.mocked(categories);
const mockedGetCollapsed = vi.mocked(getCollapsedCategories);

function svc(over: Partial<Service> = {}): Service {
  return {
    id: 's1',
    slug: 'plex',
    name: 'Plex',
    description: 'Media server',
    url: 'https://plex.example.com',
    icon: 'plex',
    status: 'UP',
    favorite: false,
    iconLight: false,
    iconDark: false,
    categoryId: null,
    categoryName: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedServices.mockResolvedValue([svc({ id: 'a', name: 'Plex' }), svc({ id: 'b', name: 'Grafana' })]);
  mockedSetFavorite.mockResolvedValue(true);
  mockedCategories.mockResolvedValue([]);
  mockedGetCollapsed.mockResolvedValue([]);
});

describe('#166 A166 — Arrange-gated reorder grip (combined with #174 menu)', () => {
  it('A166-1 — drag grip is hidden in the normal (Arrange off) view', async () => {
    render(<Catalog />);
    await screen.findAllByTestId('service-tile');
    expect(screen.queryByTestId('drag-handle')).not.toBeInTheDocument();
  });

  it('A166-2 — drag grip is revealed on every tile when Arrange is on', async () => {
    render(<Catalog arrange />);
    const handles = await screen.findAllByTestId('drag-handle');
    expect(handles).toHaveLength(2);
  });

  it('A166-3 — the "⋯" overflow menu stays present in the normal (Arrange off) view', async () => {
    render(<Catalog />);
    const menus = await screen.findAllByTestId('tile-menu');
    expect(menus).toHaveLength(2);
  });

  it('A166-4 — the "⋯" overflow menu stays present when Arrange is on (menu + grip coexist)', async () => {
    render(<Catalog arrange />);
    const menus = await screen.findAllByTestId('tile-menu');
    expect(menus).toHaveLength(2);
    const handles = await screen.findAllByTestId('drag-handle');
    expect(handles).toHaveLength(2);
  });

  it('A166-5 — favorite still lives in the "⋯" menu, NOT behind Arrange', async () => {
    // No favorite control on the tile surface until the menu is opened — it is
    // not an Arrange-gated direct control.
    render(<Catalog arrange />);
    await screen.findAllByTestId('tile-menu');
    expect(screen.queryByTestId('favorite-toggle')).not.toBeInTheDocument();
  });

  it('A166-6 — opening the menu and clicking Favorite persists via setFavorite (Arrange off)', async () => {
    const user = userEvent.setup();
    mockedServices.mockResolvedValue([svc({ id: 'fav-me', name: 'Plex', favorite: false })]);
    render(<Catalog />);
    const trigger = await screen.findByTestId('tile-menu');
    await user.click(trigger);
    const toggle = await screen.findByTestId('favorite-toggle');
    await user.click(toggle);
    expect(mockedSetFavorite).toHaveBeenCalledWith('fav-me', true);
  });

  it('A166-7 — favorited tiles still pin to the top Favorites section in the normal view', async () => {
    mockedCategories.mockResolvedValue([{ id: 'c1', name: 'Media', sortIndex: 0 }]);
    mockedServices.mockResolvedValue([
      svc({ id: 'a', name: 'Plex', favorite: true, categoryId: 'c1', categoryName: 'Media' }),
      svc({ id: 'b', name: 'Grafana', favorite: false, categoryId: 'c1', categoryName: 'Media' }),
    ]);
    render(<Catalog />);
    await screen.findAllByTestId('service-tile');
    expect(screen.getByText('Favorites')).toBeInTheDocument();
  });
});
