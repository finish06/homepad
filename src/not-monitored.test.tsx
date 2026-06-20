import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import Catalog from './Catalog';
import CommandLauncher from './CommandLauncher';
import { LauncherProvider } from './launcher';
import {
  categories,
  getCollapsedCategories,
  services,
  type Service,
} from './api';

// specs/not-monitored-state.md — a service with no gatus_key resolves to the new
// "NOT_MONITORED" status and must render an OUTLINED DASHED RING (not the solid
// gray UNKNOWN dot), with a human-readable "Not monitored" label. UNKNOWN keeps
// its solid gray dot. jsdom can't paint, so these assert the class hooks +
// a11y text; the visual distinction is confirmed browser-real before handoff.

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
    slug: 'proxmox',
    name: 'Proxmox',
    description: '',
    url: 'https://proxmox.example.com',
    icon: 'proxmox',
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
  mockedCategories.mockResolvedValue([]);
  mockedGetCollapsed.mockResolvedValue([]);
  // jsdom lacks scrollIntoView; the launcher calls it to keep selection in view.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.clearAllMocks();
  document.documentElement.classList.remove('dark');
});

describe('AC-001/004 — Catalog tile: NOT_MONITORED shows an outlined dashed ring', () => {
  it('renders a transparent dashed-border ring, not a solid dot', async () => {
    mockedServices.mockResolvedValue([svc({ status: 'NOT_MONITORED' })]);
    render(<Catalog />);
    const badge = await screen.findByTestId('status-badge');
    expect(badge).toHaveAttribute('data-status', 'NOT_MONITORED');
    expect(badge.className).toContain('border-dashed');
    expect(badge.className).toContain('bg-transparent');
    // it must NOT carry the solid gray UNKNOWN fill
    expect(badge.className).not.toContain('bg-neutral-300');
  });

  it('labels the ring "Not monitored" in title + aria-label, not the raw constant', async () => {
    mockedServices.mockResolvedValue([svc({ status: 'NOT_MONITORED' })]);
    render(<Catalog />);
    const badge = await screen.findByTestId('status-badge');
    expect(badge).toHaveAttribute('title', 'Not monitored');
    expect(badge).toHaveAttribute('aria-label', 'status: Not monitored');
  });
});

describe('AC-002 — Catalog tile: UNKNOWN keeps its solid gray dot', () => {
  it('renders the solid bg-neutral-300 dot, not a ring', async () => {
    mockedServices.mockResolvedValue([svc({ status: 'UNKNOWN' })]);
    render(<Catalog />);
    const badge = await screen.findByTestId('status-badge');
    expect(badge).toHaveAttribute('data-status', 'UNKNOWN');
    expect(badge.className).toContain('bg-neutral-300');
    expect(badge.className).not.toContain('border-dashed');
    expect(badge).toHaveAttribute('aria-label', 'status: UNKNOWN');
  });
});

describe('AC-005 — Command Launcher: NOT_MONITORED row shows the dashed ring', () => {
  it('applies the dashed-ring treatment in the launcher row status slot', () => {
    const catalog = [
      svc({ id: 'proxmox', name: 'Proxmox', status: 'NOT_MONITORED' }),
    ];
    render(
      <LauncherProvider>
        <CommandLauncher services={catalog} />
      </LauncherProvider>,
    );
    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    const status = screen.getByTestId('launcher-result-status');
    expect(status).toHaveAttribute('data-status', 'NOT_MONITORED');
    expect(status.className).toContain('border-dashed');
    expect(status.className).not.toContain('bg-neutral-300');
  });
});

// Board finding (release-board PAT): the §4 danger-glow rule was written as
// `.status-dot:not([data-status='UP'])`, so it painted the rose-red danger halo
// on EVERY non-UP dot — including the new NOT_MONITORED ring. "Not monitored" is
// an ABSENCE of monitoring, not a failure, so it must read neutral (dashed ring,
// NO glow). UNKNOWN is a real monitoring-failure signal and MUST keep its glow.
// jsdom can't compute the whole index.css (cssom bails on some modern rules), but
// it DOES resolve a single extracted rule via getComputedStyle — so we pull just
// the real `.status-dot` rules from index.css and assert the painted box-shadow.
describe('board finding — NOT_MONITORED carries no danger glow (neutral, not error)', () => {
  const ROSE = '244, 63, 94'; // the rose-red danger-glow color
  const EMERALD = '16, 185, 129'; // the UP green-glow color

  function boxShadowFor(status: string): string {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
    const rules = css.match(/\.status-dot[^{}]*\{[^{}]*\}/g) ?? [];
    expect(rules.length).toBeGreaterThan(0);
    const style = document.createElement('style');
    style.textContent = rules.join('\n');
    document.head.appendChild(style);
    const dot = document.createElement('span');
    dot.className = 'status-dot';
    dot.setAttribute('data-status', status);
    document.body.appendChild(dot);
    const shadow = getComputedStyle(dot).boxShadow;
    style.remove();
    dot.remove();
    return shadow;
  }

  it('paints NO rose danger glow on a NOT_MONITORED dot', () => {
    expect(boxShadowFor('NOT_MONITORED')).not.toContain(ROSE);
  });

  it('still paints the rose danger glow on UNKNOWN (real monitoring failure)', () => {
    expect(boxShadowFor('UNKNOWN')).toContain(ROSE);
  });

  it('still paints the rose danger glow on DOWN', () => {
    expect(boxShadowFor('DOWN')).toContain(ROSE);
  });

  it('keeps the emerald glow on UP unchanged', () => {
    expect(boxShadowFor('UP')).toContain(EMERALD);
  });
});

// #80 (Walt's 2026-06-19 live UI review): the danger glow was already suppressed
// (f1f8de1), but the dashed neutral-300 ring is so low-contrast that at the 9px dot
// size it reads as a faint, ambiguous gray smudge — still "misleading for
// NOT_MONITORED". Raise the ring to neutral-400 (light) / neutral-500 (dark) so the
// hollow ring is legibly an INTENTIONAL "not monitored" marker, while staying
// neutral (no fill, no glow). UNKNOWN's solid gray dot is untouched.
describe('#80 — NOT_MONITORED ring is legibly muted, not a faint near-invisible dot', () => {
  it('Catalog tile uses the higher-contrast neutral-400/500 ring (not the faint neutral-300)', async () => {
    mockedServices.mockResolvedValue([svc({ status: 'NOT_MONITORED' })]);
    render(<Catalog />);
    const badge = await screen.findByTestId('status-badge');
    expect(badge.className).toContain('border-neutral-400');
    expect(badge.className).toContain('dark:border-neutral-500');
    expect(badge.className).not.toContain('border-neutral-300');
    // unchanged: still a transparent dashed ring with no glow, never a solid dot
    expect(badge.className).toContain('border-dashed');
    expect(badge.className).toContain('bg-transparent');
  });

  it('Command Launcher row uses the same higher-contrast ring', () => {
    const catalog = [svc({ id: 'proxmox', name: 'Proxmox', status: 'NOT_MONITORED' })];
    render(
      <LauncherProvider>
        <CommandLauncher services={catalog} />
      </LauncherProvider>,
    );
    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    const status = screen.getByTestId('launcher-result-status');
    expect(status.className).toContain('border-neutral-400');
    expect(status.className).toContain('dark:border-neutral-500');
    expect(status.className).not.toContain('border-neutral-300');
  });
});
