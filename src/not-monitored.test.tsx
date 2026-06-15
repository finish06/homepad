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
