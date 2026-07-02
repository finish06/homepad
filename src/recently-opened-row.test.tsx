import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Catalog from './Catalog';
import {
  categories,
  getCollapsedCategories,
  services,
  type Category,
  type Service,
} from './api';
import { OPEN_LOG_KEY, type OpenEntry } from './recently-opened';

// v14 §2B — the "Recently opened" chip rail rendered inside Catalog. Render-level
// coverage for B-001/B-008 (present/absent + testids + data-service-id),
// B-002 (chip is a name-only glass chip: 44px tall / 28×28 plate — asserted via
// class, jsdom has no layout), B-003 (label color neutral-500 #737373),
// B-004 (click records), B-005/B-007 (edit-mode + clear hide), B-009 (deleted
// ids filtered), B-010-adjacent (empty dashboard).

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

const TWO = [svc({ id: 's1', name: 'Plex', url: 'https://plex.test' }), svc({ id: 's2', name: 'Grafana', url: 'https://grafana.test' })];

// Seed the v14 open log directly (newest-first) — the chip rail reads the 8
// most-recent unique ids from homepad.openLog.
function seed(ids: string[]) {
  const now = Date.now();
  const log: OpenEntry[] = ids.map((id, i) => ({ id, t: now - i }));
  localStorage.setItem(OPEN_LOG_KEY, JSON.stringify(log));
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: false,
    media: '(prefers-color-scheme: dark)',
    addEventListener: () => {},
    removeEventListener: () => {},
  })));
  mockedServices.mockResolvedValue(TWO);
  mockedCategories.mockResolvedValue([] as Category[]);
  mockedGetCollapsed.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

async function renderCatalog(props: { isAdmin?: boolean; editMode?: boolean } = {}) {
  render(<Catalog {...props} />);
  await screen.findAllByTestId('service-tile');
}

describe('RecentlyOpenedRow', () => {
  it('AC-001 — absent when nothing has been opened yet', async () => {
    await renderCatalog();
    expect(screen.queryByTestId('recently-opened-row')).toBeNull();
  });

  it('AC-001/AC-007 — present at top with seeded recents; correct testids + data-service-id', async () => {
    seed(['s2', 's1']);
    await renderCatalog();
    const row = await screen.findByTestId('recently-opened-row');
    const items = within(row).getAllByTestId('recently-opened-item');
    expect(items.map((el) => el.getAttribute('data-service-id'))).toEqual(['s2', 's1']);
    // newest-first: Grafana (s2) before Plex (s1)
    expect(within(items[0]).getByText('Grafana')).toBeInTheDocument();
    expect(within(row).getByTestId('recently-opened-clear')).toBeInTheDocument();
  });

  it('AC-003 — each item links to its service.url in a new tab', async () => {
    seed(['s2']);
    await renderCatalog();
    const item = await screen.findByTestId('recently-opened-item');
    expect(item).toHaveAttribute('href', 'https://grafana.test');
    expect(item).toHaveAttribute('target', '_blank');
    expect(item).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('AC-002 — clicking a service tile records it and the row appears', async () => {
    await renderCatalog();
    expect(screen.queryByTestId('recently-opened-row')).toBeNull();
    const tile = screen.getAllByTestId('service-tile')[0];
    // the tile's navigating <a> wraps the icon
    await userEvent.click(within(tile).getByTestId('service-tile-icon'));
    const row = await screen.findByTestId('recently-opened-row');
    const items = within(row).getAllByTestId('recently-opened-item');
    expect(items.map((el) => el.getAttribute('data-service-id'))).toEqual(['s1']);
  });

  it('AC-006 — ids not present in items are silently filtered out', async () => {
    seed(['ghost', 's1']);
    await renderCatalog();
    const row = await screen.findByTestId('recently-opened-row');
    const items = within(row).getAllByTestId('recently-opened-item');
    expect(items.map((el) => el.getAttribute('data-service-id'))).toEqual(['s1']);
  });

  it('AC-006 — row hidden when every stored id resolves to a deleted service', async () => {
    seed(['ghost-only']);
    await renderCatalog();
    expect(screen.queryByTestId('recently-opened-row')).toBeNull();
  });

  it('AC-008 — hidden in edit mode even with recents', async () => {
    seed(['s1']);
    await renderCatalog({ isAdmin: true, editMode: true });
    expect(screen.queryByTestId('recently-opened-row')).toBeNull();
  });

  it('AC-005 — Clear removes the row immediately', async () => {
    seed(['s1', 's2']);
    await renderCatalog();
    expect(await screen.findByTestId('recently-opened-row')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('recently-opened-clear'));
    await waitFor(() => expect(screen.queryByTestId('recently-opened-row')).toBeNull());
    expect(localStorage.getItem(OPEN_LOG_KEY)).toBeNull();
  });
});

describe('v14 chip rail treatment', () => {
  it('B-003 — the "Recently opened" label is neutral-500 (#737373), not neutral-400', async () => {
    seed(['s1']);
    await renderCatalog();
    const row = await screen.findByTestId('recently-opened-row');
    const label = within(row).getByText('Recently opened');
    expect(label.className).toContain('text-neutral-500');
    expect(label.className).not.toContain('text-neutral-400');
  });

  it('B-002 — each chip is a 44px-tall glass chip with a 28×28 plate (asserted via class)', async () => {
    seed(['s1']);
    await renderCatalog();
    const chip = await screen.findByTestId('recently-opened-item');
    // 44px tap target = h-11; radius 12 = rounded-xl
    expect(chip.className).toContain('h-11');
    expect(chip.className).toContain('rounded-xl');
    // 28×28 plate = h-7 w-7, radius 8 = rounded-lg
    const plate = within(chip).getByTestId('recently-opened-icon');
    expect(plate.className).toContain('h-7');
    expect(plate.className).toContain('w-7');
  });

  it('B-002 — chip is name-only: the service name shows, the url/source line does not', async () => {
    seed(['s2']);
    await renderCatalog();
    const chip = await screen.findByTestId('recently-opened-item');
    expect(within(chip).getByText('Grafana')).toBeInTheDocument();
    // no source/url line (name-only treatment)
    expect(chip.textContent).not.toContain('grafana.test');
  });
});

describe('AC-009 — empty dashboard', () => {
  it('row hidden when items is empty even if recents exist', async () => {
    mockedServices.mockResolvedValue([]);
    seed(['s1']);
    render(<Catalog />);
    await screen.findByTestId('dashboard-empty');
    expect(screen.queryByTestId('recently-opened-row')).toBeNull();
  });
});
