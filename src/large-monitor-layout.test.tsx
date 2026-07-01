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
const indexCss = read('src/index.css');

// The base `.app-grid { ... }` rule (page grid), not `.app-grid-box` etc. The
// selector `.app-grid` must be immediately followed by whitespace + `{`.
const appGridRule = indexCss.match(/\.app-grid\s*\{([^}]*)\}/)?.[1] ?? '';

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

// #194 — the App Grid page grid must fill the SAME 1536px content width as the
// header/status bar, not stop 144px short at the v14-carryover 1392px. When it
// caps early, a 2560px monitor's tiles (~216px) match a 1440px monitor's rather
// than growing into the wider canvas — "more screen, same content", the tail of
// the inversion #194 flagged. jsdom can't measure the pixels; this guards the
// max-width that makes the browser-verified growth happen. Named for the symptom.
describe('app grid caps tiles short of the shared content width (#194, AC-001)', () => {
  it('sizes the page grid to the shared 1536px width, not the v14 1392px', () => {
    expect(appGridRule).toMatch(/max-width:\s*1536px/);
    expect(appGridRule).not.toMatch(/max-width:\s*1392px/);
  });

  it('matches the CONTENT_WIDTH token so grid, header, and status bar right-align', () => {
    // CONTENT_WIDTH is `max-w-[1536px]`; the grid's own cap must be the same value.
    const token = CONTENT_WIDTH.match(/max-w-\[(\d+)px\]/)?.[1];
    expect(token).toBe('1536');
    expect(appGridRule).toContain(`max-width: ${token}px`);
  });
});

// v14 supersedes #194/#201: the auto-fill stretch grid (which bloated tiles to
// ~218px at 1440px) is replaced by the floating-panel field — fixed 190px tile
// slots inside `.panel-tiles`, panels packed in a `.tile-field`. The real
// column-count / 190px guarantees live in the CDP browser gate.
describe('floating-panel field replaces the auto-fill grid (v14, A-006)', () => {
  it('drops the auto-fill stretch grid that caused the 218px tile defect', () => {
    expect(catalog).not.toContain('grid-cols-[repeat(auto-fill,minmax(210px,1fr))]');
    expect(catalog).not.toContain('2xl:grid-cols-6');
    expect(catalog).not.toContain('lg:grid-cols-4');
  });

  it('uses the fixed-190px-slot panel-tiles grid inside the tile-field', () => {
    expect(catalog).toContain('tile-field');
    expect(catalog).toContain('panel-tiles');
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
