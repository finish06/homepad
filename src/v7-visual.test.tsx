import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Catalog from './Catalog';
import { categories, getCollapsedCategories, services, type Category, type Service } from './api';

// v7 ux-redesign §2–5 — the visual refresh applies a small set of @layer
// component classes (.tile, .tile-icon, .status-dot, .cat-head) carrying the
// exact tokens (radius, gradients, shadows, glow, accent chip + hairline). The
// gradients/shadows themselves are CSS that jsdom can't compute, so these tests
// assert the class HOOKS are present on the right elements while every existing
// data-testid is preserved (the styling is verified visually against the
// reference mockups in specs/screenshots/).

vi.mock('./api', () => ({
  services: vi.fn(),
  categories: vi.fn(),
  getCollapsedCategories: vi.fn(),
  setCollapsedCategories: vi.fn(),
  setFavorite: vi.fn(),
  setLayout: vi.fn(),
}));

vi.mock('./icons', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./icons')>();
  return { ...actual, validateIconFile: vi.fn() };
});

const mockedServices = vi.mocked(services);
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
  mockedServices.mockResolvedValue([svc()]);
  mockedCategories.mockResolvedValue([]);
  mockedGetCollapsed.mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
  document.documentElement.classList.remove('dark');
});

describe('v7 §4 — service tile visual refresh', () => {
  it('tags the tile with the .tile component class (radius/gradient/shadow/hover-lift)', async () => {
    render(<Catalog />);
    const tile = await screen.findByTestId('service-tile');
    expect(tile.className).toContain('tile');
  });

  it('tags the icon with the .tile-icon plate class and keeps its testid', async () => {
    render(<Catalog />);
    const icon = await screen.findByTestId('service-tile-icon');
    expect(icon.className).toContain('tile-icon');
  });

  it('tags the status badge with .status-dot and preserves data-status + aria-label', async () => {
    mockedServices.mockResolvedValue([svc({ status: 'UP' })]);
    render(<Catalog />);
    const badge = await screen.findByTestId('status-badge');
    expect(badge.className).toContain('status-dot');
    expect(badge).toHaveAttribute('data-status', 'UP');
    expect(badge).toHaveAttribute('aria-label', 'status: UP');
  });

  it('preserves every existing tile data-testid', async () => {
    render(<Catalog />);
    await screen.findByTestId('service-tile');
    expect(screen.getByTestId('service-tile-icon')).toBeInTheDocument();
    expect(screen.getByTestId('service-tile-name')).toBeInTheDocument();
    expect(screen.getByTestId('service-tile-description')).toBeInTheDocument();
    expect(screen.getByTestId('status-badge')).toBeInTheDocument();
  });
});

describe('v7 §5 — category section header', () => {
  function withCategory(): Category {
    return { id: 'c1', name: 'Media', sortIndex: 0, layoutRow: 0, layoutColOrder: 0, layoutWidthPct: 100 };
  }

  it('tags the category header with .cat-head (accent chip + hairline)', async () => {
    mockedCategories.mockResolvedValue([withCategory()]);
    mockedServices.mockResolvedValue([svc({ categoryId: 'c1', categoryName: 'Media' })]);
    render(<Catalog />);
    const header = await screen.findByTestId('category-header');
    expect(header.className).toContain('cat-head');
  });
});
