// Large-monitor grid inversion + layout alignment (spec: large-monitor-grid;
// issues #194 / #195 / #196). jsdom has NO layout engine, so it cannot compute
// grid column counts or measure left-edge alignment in pixels — those ACs
// (AC-001..AC-005, AC-008) are verified in a real browser via the CDP sidecar.
// Here we guard the class wiring that ENFORCES each rule: the auto-fill grid
// template (AC-006), the single shared content-width class across the three
// layers (AC-009), and the StatusBar structure (AC-010/AC-011/AC-012). Each
// test is named for the observed symptom.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import StatusBar from './StatusBar';
import { CONTENT_WIDTH } from './layout';
import { useServicesContext } from './services';
import type { Service, ServiceStatus } from './api';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');
const catalog = read('src/Catalog.tsx');
const app = read('src/App.tsx');
const appHeader = read('src/AppHeader.tsx');

// The one shared content-width token. AC-009 forbids divergent max-width
// declarations, so all three layers must consume this exact class string.
describe('shared content width (#196, AC-009)', () => {
  it('is a single ~1440px-class token reused by App, AppHeader, and StatusBar', () => {
    // Must encode one max-width value; AC-001 forces it >=1528px so that a
    // 6-column grid at 2560px is not narrower than the 4-column 1024px grid.
    expect(CONTENT_WIDTH).toContain('max-w-[1536px]');
    expect(CONTENT_WIDTH).toContain('mx-auto');
  });

  it('App.tsx grid section uses the shared class, not a separate max-w-6xl (AC-009)', () => {
    expect(app).toContain('CONTENT_WIDTH');
    expect(app).not.toContain('max-w-6xl');
  });

  it('AppHeader inner div uses the shared class, not a separate max-w-6xl (AC-009)', () => {
    expect(appHeader).toContain('CONTENT_WIDTH');
    expect(appHeader).not.toContain('max-w-6xl');
  });
});

// AC-006: the viewport-keyed 6-column jump is gone; column count is driven by
// container width via auto-fill.
describe('grid template (#194, AC-006)', () => {
  it('drops the fixed 2xl:grid-cols-6 / lg:grid-cols-4 breakpoint columns', () => {
    expect(catalog).not.toContain('2xl:grid-cols-6');
    expect(catalog).not.toContain('lg:grid-cols-4');
  });

  it('uses auto-fill minmax columns at lg+ so columns grow with the container', () => {
    expect(catalog).toContain('lg:grid-cols-[repeat(auto-fill,minmax(220px,1fr))]');
  });

  it('keeps mobile 2-col and sm 3-col layouts unchanged (AC-007)', () => {
    expect(catalog).toContain('grid-cols-2');
    expect(catalog).toContain('sm:grid-cols-3');
  });
});

// StatusBar structure — full-bleed stripe preserved, content constrained.
vi.mock('./services', () => ({ useServicesContext: vi.fn() }));
const mockedCtx = vi.mocked(useServicesContext);

function svc(status: ServiceStatus, id: string): Service {
  return {
    id, slug: id, name: id, description: '', url: 'https://example.com', icon: id,
    status, favorite: false, iconLight: false, iconDark: false,
    categoryId: null, categoryName: null,
  };
}

function setItems(items: Service[]) {
  mockedCtx.mockReturnValue({
    items, setItems: vi.fn(), lastUpdatedAt: null, recentChanges: [], clearRecentChanges: vi.fn(),
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('StatusBar alignment (#196)', () => {
  it('keeps the outer stripe full-bleed (no max-width on it) — AC-010', () => {
    setItems([svc('UP', 'u1'), svc('DOWN', 'd1'), svc('NOT_MONITORED', 'n1')]);
    render(<StatusBar />);
    const bar = screen.getByTestId('status-bar');
    expect(bar.className).toContain('bg-white/50'); // stripe background survives
    expect(bar.className).not.toContain('max-w-'); // outer is NOT constrained
  });

  it('constrains the inner content to the shared width and left-aligns it — AC-008', () => {
    setItems([svc('UP', 'u1'), svc('NOT_MONITORED', 'n1')]);
    render(<StatusBar />);
    const bar = screen.getByTestId('status-bar');
    const inner = bar.querySelector('[data-testid="status-bar-content"]');
    expect(inner).not.toBeNull();
    expect(inner!.className).toContain('max-w-[1536px]');
    expect(inner!.className).toContain('mx-auto');
    // Left-edge alignment with the grid/header requires left-aligned content,
    // not centered — otherwise segments float mid-container at 2560px.
    expect(bar.className).not.toContain('text-center');
  });

  it('keeps the "not monitored" count in the StatusBar — AC-012', () => {
    setItems([svc('NOT_MONITORED', 'n1'), svc('NOT_MONITORED', 'n2')]);
    render(<StatusBar />);
    expect(screen.getByTestId('status-bar-not-monitored')).toHaveTextContent('2 not monitored');
  });
});
