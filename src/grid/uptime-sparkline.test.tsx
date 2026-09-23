import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import AppGrid from './AppGrid';
import type { Category, Service, UptimeCheck } from '../api';
import * as api from '../api';

// SPEC cap4-sparkline-dot-tooltip + specs/uptime-sparkline.md.
//
// HISTORY THIS SUITE EXISTS TO PROTECT (spec cap4 §8): both features shipped in
// June 2026 on Catalog.tsx's ServiceTile — the ≤20-dot strip (PR #46/#47/#51)
// and the hover tooltip over it (PR #145). On 2026-07-02 commit 4c7dce2 reverted
// a data-loss merge and restored the App Grid; Catalog stopped rendering, and the
// sparkline left the product as collateral. Nobody noticed for eleven weeks
// because no test asserted a dot existed on the LIVE grid — the coverage lived
// in Catalog.test.tsx, which was deleted along with its subject.
//
// So these tests render AppGrid, never a sparkline component in isolation. A
// green suite here means the dots are on the tile a user actually sees.

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

const cat = (id: string, name: string, sortIndex: number, gridWidth: number): Category => ({
  id,
  name,
  sortIndex,
  gridWidth,
});

const svc = (id: string, name: string, uptimeChecks?: UptimeCheck[]): Service =>
  ({
    id,
    name,
    categoryId: 'c1',
    slug: id,
    description: '',
    url: `https://${id}.test`,
    icon: '',
    status: uptimeChecks ? 'UP' : 'NOT_MONITORED',
    favorite: false,
    iconLight: false,
    iconDark: false,
    uptimeChecks,
  }) as Service;

// Two passes then a failure then a pass — 75%, and a red dot to hover.
const CHECKS: UptimeCheck[] = [
  { success: true, timestamp: '2026-06-23T04:07:00Z' },
  { success: true, timestamp: '2026-06-23T04:08:00Z' },
  { success: false, timestamp: '2026-06-23T04:09:00Z' },
  { success: true, timestamp: '2026-06-23T04:10:00Z' },
];

// AC-002 — "MMM D, HH:MM" in the viewer's local zone, 24-hour, no UTC offset.
// Asserted as a SHAPE, not a literal: a literal would encode the test runner's
// time zone and fail everywhere else.
const TIME_RE = /^[A-Z][a-z]{2} \d{1,2}, \d{2}:\d{2}$/;

// Hover capability is what AC-004 keys off. jsdom ships no matchMedia, so every
// test states the capability it is testing under rather than inheriting a guess.
function stubHover(canHover: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((q: string) => ({
      matches: q === '(hover: hover)' ? canHover : false,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
}

beforeEach(() => {
  window.innerWidth = 1920;
  stubHover(true);
  vi.mocked(api.categories).mockResolvedValue([cat('c1', 'Media', 0, 8)]);
  vi.mocked(api.services).mockResolvedValue([
    svc('mon', 'Monitored App', CHECKS),
    svc('unmon', 'Unmonitored App'),
  ]);
  vi.mocked(api.saveCategoryWidth).mockResolvedValue(true);
  vi.mocked(api.setFavorite).mockResolvedValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

async function renderGrid(showUptimeDisplay = true) {
  render(<AppGrid isAdmin={false} showUptimeDisplay={showUptimeDisplay} />);
  await screen.findByTestId('app-grid');
}

function tileFor(name: string): HTMLElement {
  const wrap = screen.getByText(name).closest('.app-grid-tool-wrap');
  expect(wrap).not.toBeNull();
  return wrap as HTMLElement;
}

const dots = () => within(tileFor('Monitored App')).getAllByTestId('uptime-dot');

describe('uptime sparkline — the dot strip is back on the live grid', () => {
  it('renders one dot per check, oldest first, colored by result', async () => {
    await renderGrid();
    const d = dots();
    expect(d).toHaveLength(CHECKS.length);
    expect(d.map((x) => x.getAttribute('data-success'))).toEqual([
      'true',
      'true',
      'false',
      'true',
    ]);
  });

  it('renders the rolling percentage label alongside the dots (AC-009)', async () => {
    await renderGrid();
    const label = within(tileFor('Monitored App')).getByTestId('uptime-label');
    expect(label.textContent).toBe('75% / 4 checks');
  });

  it('singularises the label for a lone check', async () => {
    vi.mocked(api.services).mockResolvedValue([
      svc('mon', 'Monitored App', [{ success: true, timestamp: '2026-06-23T04:10:00Z' }]),
    ]);
    await renderGrid();
    expect(within(tileFor('Monitored App')).getByTestId('uptime-label').textContent).toBe(
      '100% / 1 check',
    );
  });

  it('renders NO sparkline for an unmonitored tile, preserving tile height', async () => {
    await renderGrid();
    expect(within(tileFor('Unmonitored App')).queryByTestId('uptime-sparkline')).toBeNull();
  });

  it('is gated by the per-user uptime display preference (cap6)', async () => {
    await renderGrid(false);
    expect(screen.queryByTestId('uptime-sparkline')).toBeNull();
    // The tile itself is untouched — only the uptime block goes.
    expect(within(tileFor('Monitored App')).getByTestId('tile-status')).toBeTruthy();
  });
});

describe('cap4 — hover tooltip', () => {
  it('AC-001/002/003 — hovering a passing dot shows ✓ Passed and the timestamp', async () => {
    await renderGrid();
    fireEvent.mouseEnter(dots()[0]);
    const tip = screen.getByTestId('uptime-tooltip');
    expect(tip).toHaveAttribute('role', 'tooltip');
    expect(tip.textContent).toContain('✓ Passed');
    const time = within(tip).getByTestId('uptime-tooltip-time').textContent ?? '';
    expect(time).toMatch(TIME_RE);
  });

  it('AC-003 — hovering a failing dot shows ✗ Failed', async () => {
    await renderGrid();
    fireEvent.mouseEnter(dots()[2]);
    expect(screen.getByTestId('uptime-tooltip').textContent).toContain('✗ Failed');
  });

  it('AC-007 — leaving the dot dismisses the tooltip immediately', async () => {
    await renderGrid();
    const d = dots()[0];
    fireEvent.mouseEnter(d);
    expect(screen.queryByTestId('uptime-tooltip')).not.toBeNull();
    fireEvent.mouseLeave(d);
    expect(screen.queryByTestId('uptime-tooltip')).toBeNull();
  });

  it('AC-004 — a touch device (no hover capability) never shows the tooltip', async () => {
    stubHover(false);
    await renderGrid();
    fireEvent.mouseEnter(dots()[0]);
    expect(screen.queryByTestId('uptime-tooltip')).toBeNull();
    // The dots themselves still render — the strip is not a hover-only feature.
    expect(dots()).toHaveLength(CHECKS.length);
  });

  it('AC-008 — a check with no timestamp shows the result with no malformed date', async () => {
    vi.mocked(api.services).mockResolvedValue([
      svc('mon', 'Monitored App', [
        { success: false, timestamp: '' },
        { success: false, timestamp: 'not-a-date' },
      ]),
    ]);
    await renderGrid();
    const d = dots();
    // No "Invalid Date" anywhere — neither in the label nor the tooltip.
    expect(d[0].getAttribute('aria-label')).toBe('Failed');
    expect(d[1].getAttribute('aria-label')).toBe('Failed');
    fireEvent.mouseEnter(d[0]);
    const tip = screen.getByTestId('uptime-tooltip');
    expect(tip.textContent).toContain('✗ Failed');
    expect(tip.textContent).not.toMatch(/Invalid/i);
    expect(within(tip).queryByTestId('uptime-tooltip-time')).toBeNull();
  });

  it('AC-011 — each dot carries a role and a label naming result and time', async () => {
    await renderGrid();
    const d = dots();
    // role="img" is what makes the label reachable. A bare <span aria-label> is a
    // generic with no role, and assistive tech is free to ignore its label — the
    // June implementation had exactly that gap. Mirrors the status pip's pattern.
    expect(d[0]).toHaveAttribute('role', 'img');
    const label = d[0].getAttribute('aria-label') ?? '';
    expect(label.startsWith('Passed – ')).toBe(true);
    expect(label.slice('Passed – '.length)).toMatch(TIME_RE);
    expect(d[2].getAttribute('aria-label')).toMatch(/^Failed – /);
  });

  it('the dot row is not hidden from assistive tech (AC-011)', async () => {
    await renderGrid();
    const strip = within(tileFor('Monitored App')).getByTestId('uptime-sparkline');
    expect(strip.querySelector('[aria-hidden="true"]')).toBeNull();
  });
});

describe('cap4 AC-010 — the tooltip surface carries its own colors', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

  it('defines a tooltip surface that does not inherit the tile glass', () => {
    expect(css).toMatch(/\.uptime-tooltip\s*\{/);
    // A dark slab with light text reads on both themes — that is the spec's
    // explicit instruction (§4 "no dark: prefix needed for this element").
    const block = css.slice(css.indexOf('.uptime-tooltip {'));
    expect(block.slice(0, 400)).toMatch(/color:\s*#fff|color:\s*white/i);
  });

  it('keeps the dots at every density and hides only the redundant label (§8 D-5)', () => {
    expect(css).toMatch(/data-density='compact'\]\s+\.uptime-label/);
    expect(css).toMatch(/data-density='list'\]\s+\.uptime-label/);
  });

  // cap6 §8.4 / Joe's review of #475. The v16.4.0 defect was not that the
  // preference was wrong — it round-tripped perfectly — but that the ONLY
  // element it gated was display:none at DEFAULT_DENSITY. Every check anyone
  // ran was about state; none was about what a user sees.
  //
  // So this asserts the property that was actually violated, not the spelling
  // of the rule that violated it: no density rule may hide the visible part of
  // anything `showUptimeDisplay` gates. It walks every `display: none` block
  // keyed on data-density rather than pattern-matching one selector, so a
  // future density change cannot re-break it by writing the rule differently.
  it('no density rule hides the visible part of a showUptimeDisplay-gated element', () => {
    const GATED_VISIBLE = ['.uptime-sparkline', '.uptime-sparkline-dots', '.uptime-dot'];
    const offenders: string[] = [];
    // Each rule: everything up to '{', then the body up to the matching '}'.
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = m[1].trim();
      const body = m[2];
      if (!/data-density=/.test(selector)) continue;
      if (!/display:\s*none/.test(body)) continue;
      for (const sel of GATED_VISIBLE) {
        // Word-boundary guard so `.uptime-label` never counts as `.uptime-l…`
        // and `.uptime-sparkline-dots` is matched on its own, not by its prefix.
        const re = new RegExp(`\\${sel}(?![\\w-])`);
        if (re.test(selector)) offenders.push(`${selector} { display: none }`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('AC-005 — the tooltip is anchored above the dots and does not affect layout', () => {
    const block = css.slice(css.indexOf('.uptime-tooltip {'), css.indexOf('.uptime-tooltip {') + 400);
    expect(block).toMatch(/position:\s*absolute/);
    expect(block).toMatch(/bottom:\s*100%/);
    expect(block).toMatch(/pointer-events:\s*none/);
  });
});
