// SPEC-status-widgets §2.2 / UX §2–3 — the widget line on a tile.
//
// Compact and List reuse the status line element (only its text changes); Large
// adds one line under the name, reserved on a widget tile in every state. An
// outage wins the line, loading and error fall back to today's status line, the
// status dot never changes, and the line is the link's accessible description
// (AC-007…AC-010, AC-012, AC-031). Layout (row heights, 320px truncation) is
// the browser gate's job: tests/browser-gate/status-widgets.spec.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import AppGrid from './AppGrid';
import type { Category, Service, TileWidget } from '../api';
import * as api from '../api';
import { ShowWidgetsContext } from '../widgets/context';

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

function widget(over: Partial<TileWidget> = {}): TileWidget {
  return {
    kind: 'sonarr',
    state: 'ok',
    asOf: new Date(Date.now() - 30_000).toISOString(),
    fields: [
      { key: 'upcoming', label: 'this week', unit: 'count', value: 3 },
      { key: 'queued', label: 'in queue', unit: 'count', value: 1 },
      { key: 'missing', label: 'missing', unit: 'count', value: 12 },
    ],
    ...over,
  };
}

const svc = (over: Partial<Service>): Service =>
  ({
    id: 's',
    name: 'Sonarr',
    categoryId: 'c1',
    slug: 's',
    description: '',
    url: 'https://sonarr.example.com',
    icon: '',
    status: 'UP',
    favorite: false,
    iconLight: false,
    iconDark: false,
    responseTimeMs: 41,
    ...over,
  }) as Service;

beforeEach(() => {
  window.innerWidth = 1920;
  vi.mocked(api.saveCategoryWidth).mockResolvedValue(true);
  vi.mocked(api.setFavorite).mockResolvedValue(true);
  vi.mocked(api.categories).mockResolvedValue([cat]);
});

afterEach(() => vi.clearAllMocks());

async function renderGrid(
  density: 'large' | 'compact' | 'list',
  services: Service[],
  showWidgets = true,
) {
  vi.mocked(api.services).mockResolvedValue(services);
  render(
    <ShowWidgetsContext.Provider value={showWidgets}>
      <AppGrid isAdmin={false} density={density} />
    </ShowWidgetsContext.Provider>,
  );
  await screen.findByTestId('app-grid');
  await screen.findAllByTestId('tool-link');
}

const wrapOf = (name: string) => screen.getByText(name).closest('.app-grid-tool-wrap') as HTMLElement;

describe('Compact and List — the widget values take the status line (AC-007)', () => {
  it('Compact shows up to 2 fields in the status line element', async () => {
    await renderGrid('compact', [svc({ widget: widget() })]);
    const line = within(wrapOf('Sonarr')).getByTestId('tile-statusline');
    expect(line).toHaveTextContent('3 this week · 1 in queue');
    expect(line).not.toHaveTextContent('missing');
    expect(line).toHaveAttribute('data-widget', 'ok');
    // No second line: Compact keeps its height.
    expect(within(wrapOf('Sonarr')).queryByTestId('tile-widget')).not.toBeInTheDocument();
  });

  it('List shows up to 3 fields (AC-009)', async () => {
    await renderGrid('list', [svc({ widget: widget() })]);
    expect(screen.getByTestId('tile-statusline')).toHaveTextContent('3 this week · 1 in queue · 12 missing');
  });

  it('the first field sits in its own span so it never truncates (AC-009)', async () => {
    await renderGrid('list', [svc({ widget: widget() })]);
    const line = screen.getByTestId('tile-statusline');
    expect(line.querySelector('.tile-widget-first')).toHaveTextContent('3 this week');
    expect(line.querySelector('.tile-widget-rest')).toHaveTextContent('· 1 in queue · 12 missing');
  });

  it('an outage wins: DOWN shows the status words, not the widget', async () => {
    await renderGrid('compact', [svc({ status: 'DOWN', widget: widget() })]);
    const line = screen.getByTestId('tile-statusline');
    expect(line).toHaveTextContent(/^Offline/);
    expect(line).not.toHaveAttribute('data-widget');
    expect(screen.getByTestId('tool-link')).not.toHaveAttribute('aria-describedby');
  });

  it('Slow (DEGRADED) keeps the widget line; the dot shows amber', async () => {
    await renderGrid('compact', [svc({ status: 'DEGRADED', widget: widget() })]);
    expect(screen.getByTestId('tile-statusline')).toHaveTextContent('3 this week · 1 in queue');
    expect(screen.getByTestId('tile-status')).toHaveAttribute('data-status', 'DEGRADED');
  });

  it.each(['loading', 'error'] as const)('%s: the status line is exactly today’s', async (state) => {
    await renderGrid('compact', [svc({ widget: widget({ state, fields: [] }) })]);
    const line = screen.getByTestId('tile-statusline');
    expect(line).toHaveTextContent('Online · 41 ms');
    expect(line).not.toHaveAttribute('data-widget');
  });

  it('a tile without a widget renders exactly as today', async () => {
    await renderGrid('compact', [svc({})]);
    expect(screen.getByTestId('tile-statusline')).toHaveTextContent('Online · 41 ms');
    expect(screen.getByTestId('tool-link')).not.toHaveAttribute('aria-describedby');
  });

  it('the status dot never changes', async () => {
    await renderGrid('list', [svc({ widget: widget() })]);
    const pip = screen.getByTestId('tile-status');
    expect(pip).toHaveAttribute('data-status', 'UP');
    expect(pip).toHaveAttribute('aria-label', expect.stringMatching(/^status: /));
  });
});

describe('Large — one widget line under the name (AC-008)', () => {
  it('shows up to 2 fields, and no status line', async () => {
    await renderGrid('large', [svc({ widget: widget() })]);
    const line = within(wrapOf('Sonarr')).getByTestId('tile-widget');
    expect(line).toHaveTextContent('3 this week · 1 in queue');
    expect(line).not.toHaveTextContent('missing');
    expect(screen.queryByTestId('tile-statusline')).not.toBeInTheDocument();
  });

  it.each([
    ['loading', { state: 'loading' as const, fields: [] }, 'UP'],
    ['error', { state: 'error' as const, fields: [] }, 'UP'],
    ['offline', {}, 'DOWN'],
  ])('%s: the line is reserved and empty, so the tile never jumps', async (_n, over, status) => {
    await renderGrid('large', [svc({ status: status as Service['status'], widget: widget(over) })]);
    const line = screen.getByTestId('tile-widget');
    expect(line).toBeEmptyDOMElement();
  });

  it('a tile without a widget has no widget line', async () => {
    await renderGrid('large', [svc({})]);
    expect(screen.queryByTestId('tile-widget')).not.toBeInTheDocument();
  });
});

describe('Accessible description (AC-010) and stale (AC-012)', () => {
  it('the link name stays the service name; the line is its description', async () => {
    await renderGrid('compact', [svc({ widget: widget() })]);
    const link = screen.getByTestId('tool-link');
    expect(link).toHaveAccessibleName('Sonarr');
    expect(link).toHaveAccessibleDescription('3 this week, 1 in queue');
  });

  it('Large carries the same description', async () => {
    await renderGrid('large', [svc({ widget: widget() })]);
    expect(screen.getByTestId('tool-link')).toHaveAccessibleDescription('3 this week, 1 in queue');
  });

  it('stale: a leading ◷ mark, not faded, and "Updated N min ago" in the description', async () => {
    const asOf = new Date(Date.now() - 12 * 60_000 - 5_000).toISOString();
    await renderGrid('compact', [svc({ widget: widget({ state: 'stale', asOf }) })]);
    const line = screen.getByTestId('tile-statusline');
    expect(line).toHaveTextContent('◷ 3 this week · 1 in queue');
    expect(line).toHaveAttribute('data-widget', 'stale');
    expect(screen.getByTestId('tool-link')).toHaveAccessibleDescription(
      '3 this week, 1 in queue. Updated 12 min ago',
    );
  });

  it('two widget tiles get distinct description ids', async () => {
    await renderGrid('compact', [
      svc({ id: 'a', name: 'Sonarr', widget: widget() }),
      svc({ id: 'b', slug: 'b', name: 'Radarr', widget: widget({ kind: 'radarr' }) }),
    ]);
    const [a, b] = screen.getAllByTestId('tool-link');
    expect(a.getAttribute('aria-describedby')).toBeTruthy();
    expect(a.getAttribute('aria-describedby')).not.toBe(b.getAttribute('aria-describedby'));
  });
});

describe('Show widgets off (AC-031)', () => {
  it.each(['large', 'compact', 'list'] as const)('%s: renders as if there were no widget', async (density) => {
    await renderGrid(density, [svc({ widget: widget() })], false);
    expect(screen.queryByTestId('tile-widget')).not.toBeInTheDocument();
    expect(screen.getByTestId('tool-link')).not.toHaveAttribute('aria-describedby');
    if (density !== 'large') {
      expect(screen.getByTestId('tile-statusline')).toHaveTextContent('Online · 41 ms');
    }
  });
});
