// SPEC-tile-density — AppGrid density wiring (DOM contract; layout/paint is the
// browser gate, tests/browser-gate/tile-density.spec.ts). RED tests: the grid tags
// itself with the active density, and the compact/list tile renders the status line
// (AC-DEN-005/009) while the large tile does not (it stays the legacy name-only
// tile). The status pip element is present in every density (its right-rail move is
// pure CSS — proven in the gate).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import AppGrid from './AppGrid';
import type { Category, Service } from '../api';
import * as api from '../api';

vi.mock('../api', () => ({
  categories: vi.fn(),
  services: vi.fn(),
  saveCategoryWidth: vi.fn(),
  setCategoryOrder: vi.fn(),
  createCategory: vi.fn(),
  setFavorite: vi.fn(),
  renameCategory: vi.fn(),
  deleteCategory: vi.fn(),
}));

const cat: Category = { id: 'c1', name: 'Media', sortIndex: 0, gridWidth: 8 };
const svc = (over: Partial<Service>): Service =>
  ({
    id: 'g',
    name: 'Grafana',
    categoryId: 'c1',
    slug: 'g',
    description: '',
    url: 'https://g.test',
    icon: '',
    status: 'UP',
    favorite: false,
    iconLight: false,
    iconDark: false,
    ...over,
  }) as Service;

beforeEach(() => {
  window.innerWidth = 1920;
  vi.mocked(api.saveCategoryWidth).mockResolvedValue(true);
  vi.mocked(api.setFavorite).mockResolvedValue(true);
  vi.mocked(api.categories).mockResolvedValue([cat]);
});

afterEach(() => vi.clearAllMocks());

async function renderGrid(density: 'large' | 'compact' | 'list', service: Service) {
  vi.mocked(api.services).mockResolvedValue([service]);
  render(<AppGrid isAdmin={false} density={density} />);
  return screen.findByTestId('app-grid');
}

describe('SPEC-tile-density — AppGrid density wiring', () => {
  it('AC-DEN-001 — tags the grid with the active density', async () => {
    const grid = await renderGrid('compact', svc({ status: 'UP', responseTimeMs: 41 }));
    expect(grid).toHaveAttribute('data-density', 'compact');
  });

  it('AC-DEN-005/009 — the compact tile renders the graceful status line', async () => {
    await renderGrid('compact', svc({ status: 'UP' }));
    const wrap = screen.getByText('Grafana').closest('.app-grid-tool-wrap') as HTMLElement;
    // No response time in the payload → state word alone, no fabricated placeholder.
    const line = within(wrap).getByTestId('tile-statusline');
    expect(line).toHaveTextContent('Online');
    expect(line.textContent).not.toContain('ms');
    // The pip is still present (it moves to the right rail via CSS).
    expect(within(wrap).getByTestId('tile-status')).toBeInTheDocument();
  });

  it('AC-DEN-010 — the compact status line shows the latency once the field arrives', async () => {
    await renderGrid('compact', svc({ status: 'UP', responseTimeMs: 41 }));
    expect(screen.getByTestId('tile-statusline')).toHaveTextContent('Online · 41 ms');
  });

  it('Large stays the legacy name-only tile — no status line', async () => {
    await renderGrid('large', svc({ status: 'UP', responseTimeMs: 41 }));
    expect(screen.queryByTestId('tile-statusline')).not.toBeInTheDocument();
  });
});
