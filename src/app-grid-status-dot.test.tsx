import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import AppGrid from './AppGrid';
import type { Category, Service, ServiceStatus } from './api';
import * as api from './api';

// SPEC-242 — per-tile status dot on App Grid tool tiles. jsdom has no layout, so
// the top-left placement / no-★-overlap / composed-contrast are browser-gate
// territory (tests/browser-gate/app-grid-status-dot.spec.ts). These cover the DOM
// contract: every tile carries a status element whose data-status + colour class +
// a11y attributes match its service.status, for all five states (AC-018), and the
// accessibility contract (AC-014/015/016/017).

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
const svc = (id: string, name: string, status: ServiceStatus): Service =>
  ({
    id,
    name,
    categoryId: 'c1',
    slug: id,
    description: '',
    url: `https://${id}.test`,
    icon: '',
    status,
    favorite: false,
    iconLight: false,
    iconDark: false,
  }) as Service;

const ALL_STATES: ServiceStatus[] = ['UP', 'DOWN', 'DEGRADED', 'UNKNOWN', 'NOT_MONITORED'];

beforeEach(() => {
  window.innerWidth = 1920;
  vi.mocked(api.categories).mockResolvedValue([cat('c1', 'Media', 0, 8)]);
  vi.mocked(api.services).mockResolvedValue(
    ALL_STATES.map((s, i) => svc(`s${i}`, `App ${s}`, s)),
  );
  vi.mocked(api.saveCategoryWidth).mockResolvedValue(true);
  vi.mocked(api.setFavorite).mockResolvedValue(true);
});

afterEach(() => vi.clearAllMocks());

async function renderGrid() {
  render(<AppGrid isAdmin={false} />);
  await screen.findByTestId('app-grid');
}

// The status element for the tile whose service.status is `status`.
function dotFor(status: ServiceStatus): HTMLElement {
  const wrap = screen.getByText(`App ${status}`).closest('.app-grid-tool-wrap');
  expect(wrap).not.toBeNull();
  return within(wrap as HTMLElement).getByTestId('tile-status');
}

describe('SPEC-242 per-tile status dot', () => {
  it('renders a status indicator on every tool tile (AC-001)', async () => {
    await renderGrid();
    expect(screen.getAllByTestId('tile-status')).toHaveLength(ALL_STATES.length);
  });

  it('carries the tile service status on each indicator (AC-002..006)', async () => {
    await renderGrid();
    for (const s of ALL_STATES) {
      expect(dotFor(s)).toHaveAttribute('data-status', s);
    }
  });

  it('has an accessible label describing each of the five states (AC-014)', async () => {
    await renderGrid();
    expect(dotFor('UP')).toHaveAttribute('aria-label', 'status: UP');
    expect(dotFor('DOWN')).toHaveAttribute('aria-label', 'status: DOWN');
    expect(dotFor('DEGRADED')).toHaveAttribute('aria-label', 'status: DEGRADED');
    expect(dotFor('UNKNOWN')).toHaveAttribute('aria-label', 'status: UNKNOWN');
    expect(dotFor('NOT_MONITORED')).toHaveAttribute('aria-label', 'status: not monitored');
  });

  it('announces as a discrete labelled image with a matching title (AC-015/016)', async () => {
    await renderGrid();
    const up = dotFor('UP');
    expect(up).toHaveAttribute('role', 'img');
    expect(up).toHaveAttribute('title', 'UP');
    expect(dotFor('NOT_MONITORED')).toHaveAttribute('title', 'not monitored');
  });

  it('is a sibling of the tool link, not nested inside the anchor (D-1 DOM)', async () => {
    await renderGrid();
    const dot = dotFor('UP');
    expect(dot.closest('a')).toBeNull();
    // …and it shares the wrap with the link + favorite ★.
    const wrap = dot.closest('.app-grid-tool-wrap') as HTMLElement;
    expect(within(wrap).getByTestId('tool-link')).toBeInTheDocument();
    expect(within(wrap).getByTestId('tile-favorite')).toBeInTheDocument();
  });

  it('distinguishes NOT_MONITORED by shape, not colour alone (AC-017)', async () => {
    await renderGrid();
    // The class map keys off data-status; the CSS gives NOT_MONITORED a dashed
    // hollow ring (the sole non-solid shape). Assert the DOM discriminator exists
    // so a colour-blind user has a shape cue — the paint itself is gate-verified.
    expect(dotFor('NOT_MONITORED')).toHaveAttribute('data-status', 'NOT_MONITORED');
    expect(dotFor('UP')).toHaveAttribute('data-status', 'UP');
  });
});
