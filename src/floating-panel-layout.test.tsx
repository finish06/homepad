// v14 §2A — the floating glass panel field. jsdom has NO layout engine, so the
// pixel ACs (A-006 tile=190px, A-002 packing/wrap) are verified in a real
// browser via the CDP sidecar. Here we guard the render wiring that ENFORCES the
// layout: every category renders as a `.category-panel` inside a `.tile-field`,
// panels carry `--panel-cols` = clamp(appCount, 1, fieldCols), tiles live in a
// `.panel-tiles` grid, and Favorites/Uncategorized are panels too (A-005). Tests
// are named for the observed symptom.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Catalog from './Catalog';
import { categories, getCollapsedCategories, services, type Category, type Service } from './api';

vi.mock('./api', () => ({
  services: vi.fn(),
  categories: vi.fn(),
  getCollapsedCategories: vi.fn(),
  setFavorite: vi.fn(),
  setLayout: vi.fn(),
  setCollapsedCategories: vi.fn(),
  setCategoryOrder: vi.fn(),
  assignCategory: vi.fn(),
  createCategory: vi.fn(),
  renameCategory: vi.fn(),
  deleteCategory: vi.fn(),
  deleteService: vi.fn(),
  deleteIcon: vi.fn(),
  uploadIcon: vi.fn(),
}));

const mockedServices = vi.mocked(services);
const mockedCategories = vi.mocked(categories);
const mockedGetCollapsed = vi.mocked(getCollapsedCategories);

function svc(over: Partial<Service> = {}): Service {
  return {
    id: 's1', slug: 's1', name: 'S1', description: '', url: 'https://x.test', icon: 's1',
    status: 'UP', favorite: false, iconLight: false, iconDark: false,
    categoryId: null, categoryName: null, ...over,
  };
}

const CATS: Category[] = [
  { id: 'c1', name: 'Media', sortIndex: 0 },
  { id: 'c2', name: 'Tools', sortIndex: 1 },
];
// c1: 3 apps, c2: 2 apps, one uncategorized, one favorite
const SVCS: Service[] = [
  svc({ id: 'a1', name: 'Plex', categoryId: 'c1' }),
  svc({ id: 'a2', name: 'Jelly', categoryId: 'c1' }),
  svc({ id: 'a3', name: 'Sonarr', categoryId: 'c1' }),
  svc({ id: 'b1', name: 'Grafana', categoryId: 'c2' }),
  svc({ id: 'b2', name: 'Uptime', categoryId: 'c2', favorite: true }),
  svc({ id: 'u1', name: 'Loose', categoryId: null }),
];

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: false, media: '', addEventListener: () => {}, removeEventListener: () => {},
  })));
  mockedServices.mockResolvedValue(SVCS);
  mockedCategories.mockResolvedValue(CATS);
  mockedGetCollapsed.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  window.innerWidth = 1024; // jsdom default; a wide-monitor test may have raised it
});

async function renderCatalog() {
  const view = render(<Catalog />);
  await screen.findAllByTestId('service-tile');
  return view;
}

describe('floating panel field', () => {
  it('A-001 — renders a .tile-field container', async () => {
    const { container } = await renderCatalog();
    expect(container.querySelector('.tile-field')).not.toBeNull();
  });

  it('A-001/A-003 — each category renders as a .category-panel', async () => {
    const { container } = await renderCatalog();
    const panels = container.querySelectorAll('.category-panel');
    // 2 categories + Favorites + Uncategorized = 4 panels
    expect(panels.length).toBe(4);
  });

  it('A-005 — Favorites and Uncategorized also render as .category-panel', async () => {
    await renderCatalog();
    const fav = screen.getByText('Favorites').closest('.category-panel');
    const unc = screen.getByText('Uncategorized').closest('.category-panel');
    expect(fav).not.toBeNull();
    expect(unc).not.toBeNull();
  });

  it('A-001 — a category panel sets --panel-cols = clamp(appCount, 1, fieldCols)', async () => {
    await renderCatalog();
    // jsdom innerWidth defaults to 1024 → fieldCols 4; Media has 3 apps → 3
    const media = screen.getByText('Media').closest('.category-panel') as HTMLElement;
    expect(media.style.getPropertyValue('--panel-cols')).toBe('3');
  });

  it('A-004 — the field caps at 4 columns on a wide monitor (v14.1: was 6-max)', async () => {
    // v14.1 (Caleb+Walt): the ladder tops out at 4 columns, not 6 — 6 read sparse
    // on wide monitors. A large category on a ≥1300 monitor now spans at most 4
    // tiles; the old ladder gave 6 here. Panel span = clamp(appCount, 1, fieldCols).
    mockedCategories.mockResolvedValue([{ id: 'c1', name: 'Media', sortIndex: 0 }]);
    mockedServices.mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => svc({ id: `m${i}`, name: `App${i}`, categoryId: 'c1' })),
    );
    window.innerWidth = 1400; // ≥1300 tier
    await renderCatalog();
    const media = screen.getByText('Media').closest('.category-panel') as HTMLElement;
    expect(media.style.getPropertyValue('--panel-cols')).toBe('4');
  });

  it('A-006-proxy — tiles live in a .panel-tiles grid (fixed 190px slots), not the old auto-fill grid', async () => {
    const { container } = await renderCatalog();
    expect(container.querySelector('.panel-tiles')).not.toBeNull();
    // the old stretch grid class must be gone
    expect(container.querySelector('.lg\\:grid-cols-\\[repeat\\(auto-fill\\,minmax\\(210px\\,1fr\\)\\)\\]')).toBeNull();
  });
});
