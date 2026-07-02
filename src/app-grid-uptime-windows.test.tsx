import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import AppGrid from './AppGrid';
import type { Category, Service } from './api';
import * as api from './api';

// SPEC uptime-windows §6 — long-window availability (24h/7d/30d) on the AppGrid
// tile. jsdom has no layout, so containment/no-overflow is browser-gate territory;
// these cover the DOM contract: a monitored tile renders the three window
// percentages, an unmonitored tile renders NO uptime element (height parity), and
// fractions format per AC-U07.

vi.mock('./api', () => ({
  categories: vi.fn(),
  services: vi.fn(),
  saveCategoryWidth: vi.fn(),
  setCategoryOrder: vi.fn(),
  createCategory: vi.fn(),
  setFavorite: vi.fn(),
  renameCategory: vi.fn(),
  deleteCategory: vi.fn(),
}));

const cat = (id: string, name: string, sortIndex: number, gridWidth: number): Category => ({
  id,
  name,
  sortIndex,
  gridWidth,
});

const svc = (id: string, name: string, uptimeWindows?: Record<string, number>): Service =>
  ({
    id,
    name,
    categoryId: 'c1',
    slug: id,
    description: '',
    url: `https://${id}.test`,
    icon: '',
    status: uptimeWindows ? 'UP' : 'NOT_MONITORED',
    favorite: false,
    iconLight: false,
    iconDark: false,
    uptimeWindows,
  }) as Service;

beforeEach(() => {
  window.innerWidth = 1920;
  vi.mocked(api.categories).mockResolvedValue([cat('c1', 'Media', 0, 8)]);
  vi.mocked(api.services).mockResolvedValue([
    svc('mon', 'Monitored App', { '24h': 1, '7d': 0.945815, '30d': 0.9981 }),
    svc('unmon', 'Unmonitored App'),
    svc('empty', 'Empty Windows App', {}),
  ]);
  vi.mocked(api.saveCategoryWidth).mockResolvedValue(true);
  vi.mocked(api.setFavorite).mockResolvedValue(true);
});

afterEach(() => vi.clearAllMocks());

async function renderGrid() {
  render(<AppGrid isAdmin={false} />);
  await screen.findByTestId('app-grid');
}

function tileFor(name: string): HTMLElement {
  const wrap = screen.getByText(name).closest('.app-grid-tool-wrap');
  expect(wrap).not.toBeNull();
  return wrap as HTMLElement;
}

describe('AppGrid long-window uptime', () => {
  it('renders the 24h/7d/30d percentages for a monitored service (AC-U01/U04/U07)', async () => {
    await renderGrid();
    const uptime = within(tileFor('Monitored App')).getByTestId('tile-uptime');
    const txt = uptime.textContent ?? '';
    // AC-U07: exact 100% has no decimal; others one decimal, nearest.
    expect(txt).toContain('24h');
    expect(txt).toContain('100%');
    expect(txt).toContain('7d');
    expect(txt).toContain('94.6%');
    expect(txt).toContain('30d');
    expect(txt).toContain('99.8%');
  });

  it('drops the decimal when a fraction rounds up to exactly 100% (AC-U07)', async () => {
    vi.mocked(api.services).mockResolvedValue([
      // 0.9995 -> 99.95%, which rounds to the 100% boundary: must render "100%",
      // not "100.0%". 0.999 -> 99.9% keeps its one decimal.
      svc('boundary', 'Boundary App', { '24h': 0.9995, '7d': 0.999 }),
    ]);
    await renderGrid();
    const txt =
      within(tileFor('Boundary App')).getByTestId('tile-uptime').textContent ?? '';
    expect(txt).toContain('100%');
    expect(txt).not.toContain('100.0');
    expect(txt).toContain('99.9%');
  });

  it('renders NO uptime element for an unmonitored service (AC-U06 height parity)', async () => {
    await renderGrid();
    expect(
      within(tileFor('Unmonitored App')).queryByTestId('tile-uptime'),
    ).toBeNull();
  });

  it('renders NO uptime element when uptimeWindows is empty (AC-U03/U06)', async () => {
    await renderGrid();
    expect(
      within(tileFor('Empty Windows App')).queryByTestId('tile-uptime'),
    ).toBeNull();
  });
});
