import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import AppGrid from './AppGrid';
import type { Category, Service } from './api';
import * as api from './api';

// SPEC cap6-uptime-display-toggle §8 — the frontend render gate. AppGrid takes a
// `showUptimeDisplay` prop (threaded from App, fed by GET /api/system/config).
// When true (default), monitored tiles render their uptime line exactly as today
// (AC-001); when false, the uptime block is omitted on every tile regardless of
// data present (AC-002) and nothing else about the tile changes — the status pip
// and name stay (AC-014, part of AC-003's "renders as if uptime were absent").

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
  ]);
  vi.mocked(api.saveCategoryWidth).mockResolvedValue(true);
  vi.mocked(api.setFavorite).mockResolvedValue(true);
});

afterEach(() => vi.clearAllMocks());

async function renderGrid(showUptimeDisplay: boolean) {
  render(<AppGrid isAdmin={false} showUptimeDisplay={showUptimeDisplay} />);
  await screen.findByTestId('app-grid');
}

function tileFor(name: string): HTMLElement {
  const wrap = screen.getByText(name).closest('.app-grid-tool-wrap');
  expect(wrap).not.toBeNull();
  return wrap as HTMLElement;
}

describe('AppGrid uptime-display toggle (cap6)', () => {
  it('renders the uptime line when showUptimeDisplay is true (AC-001)', async () => {
    await renderGrid(true);
    const uptime = within(tileFor('Monitored App')).queryByTestId('tile-uptime');
    expect(uptime).not.toBeNull();
    expect(uptime?.textContent ?? '').toContain('24h');
  });

  it('omits the uptime line on every tile when showUptimeDisplay is false (AC-002)', async () => {
    await renderGrid(false);
    expect(screen.queryByTestId('tile-uptime')).toBeNull();
    expect(within(tileFor('Monitored App')).queryByTestId('tile-uptime')).toBeNull();
  });

  it('leaves the status pip untouched when the uptime display is off (AC-014)', async () => {
    await renderGrid(false);
    // The status indicator is independent of the uptime toggle.
    expect(within(tileFor('Monitored App')).getByTestId('tile-status')).toBeInTheDocument();
  });
});
