import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import StatusBar from './StatusBar';
import { useServicesContext } from './services';
import type { Service, ServiceStatus } from './api';

// v15 — the health summary panel replaces v14's count strip (StatusBar rebuild,
// design spec §4.2). It derives purely from useServicesContext(); mock the hook
// so each test injects an exact items array + freshness.
vi.mock('./services', () => ({
  useServicesContext: vi.fn(),
}));

const mockedCtx = vi.mocked(useServicesContext);

function svc(status: ServiceStatus, id: string, categoryName: string | null = 'Media'): Service {
  return {
    id,
    slug: id,
    name: id,
    description: '',
    url: 'https://example.com',
    icon: id,
    status,
    favorite: false,
    iconLight: false,
    iconDark: false,
    categoryId: categoryName,
    categoryName,
  };
}

function setCtx(items: Service[] | null, lastUpdatedAt: number | null = Date.now()) {
  mockedCtx.mockReturnValue({
    items,
    setItems: vi.fn(),
    lastUpdatedAt,
    recentChanges: [],
    clearRecentChanges: vi.fn(),
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('v15 health summary panel', () => {
  // AC-V15-011 — all up/idle/unknown → green LED + "All systems operational".
  it('shows operational headline + green LED when all services are up', () => {
    setCtx([svc('UP', 'u1'), svc('UP', 'u2', 'Develop')]);
    render(<StatusBar />);
    expect(screen.getByTestId('health-headline')).toHaveTextContent('All systems operational');
    expect(screen.getByTestId('health-led')).toHaveAttribute('data-variant', 'operational');
  });

  // AC-V15-011 — sub-line "{N} services across {G} groups · {M} monitored".
  it('shows the service/group/monitored sub-line in operational state', () => {
    setCtx([svc('UP', 'u1', 'Media'), svc('UP', 'u2', 'Develop'), svc('NOT_MONITORED', 'n1', 'Media')]);
    render(<StatusBar />);
    const sub = screen.getByTestId('health-subline').textContent ?? '';
    expect(sub).toContain('3 services');
    expect(sub).toContain('2 groups');
    expect(sub).toContain('2 monitored');
  });

  // AC-V15-018 — idle/unknown never promote the LED to amber/red.
  it('stays operational (green) when the only non-up states are idle/unknown', () => {
    setCtx([svc('UP', 'u1'), svc('UNKNOWN', 'k1'), svc('NOT_MONITORED', 'n1')]);
    render(<StatusBar />);
    expect(screen.getByTestId('health-led')).toHaveAttribute('data-variant', 'operational');
    expect(screen.getByTestId('health-headline')).toHaveTextContent('All systems operational');
  });

  // AC-V15-012 — any down → red LED + "N services need attention" (N = down+degraded).
  it('shows a red attention LED and count when a service is down', () => {
    setCtx([svc('UP', 'u1'), svc('DOWN', 'd1'), svc('DEGRADED', 'g1')]);
    render(<StatusBar />);
    const led = screen.getByTestId('health-led');
    expect(led).toHaveAttribute('data-variant', 'attention');
    expect(led).toHaveAttribute('data-severity', 'down');
    // N = 1 down + 1 degraded = 2
    expect(screen.getByTestId('health-headline')).toHaveTextContent('2 services need attention');
  });

  // AC-V15-013 — degraded only (no down) → amber LED, same headline pattern.
  it('shows an amber attention LED when only degraded (no down)', () => {
    setCtx([svc('UP', 'u1'), svc('DEGRADED', 'g1')]);
    render(<StatusBar />);
    const led = screen.getByTestId('health-led');
    expect(led).toHaveAttribute('data-variant', 'attention');
    expect(led).toHaveAttribute('data-severity', 'degraded');
    expect(screen.getByTestId('health-headline')).toHaveTextContent('1 service needs attention');
  });

  // AC-V15-014 — loading (items null) → pulsing neutral LED + "Checking services…".
  it('shows the loading state when items are null', () => {
    setCtx(null, null);
    render(<StatusBar />);
    expect(screen.getByTestId('health-led')).toHaveAttribute('data-variant', 'loading');
    expect(screen.getByTestId('health-headline')).toHaveTextContent('Checking services');
  });

  // AC-V15-015 — empty (no services) → "No services yet" + add-first sub-line, no meter.
  it('shows the empty state when there are no services', () => {
    setCtx([]);
    render(<StatusBar />);
    expect(screen.getByTestId('health-headline')).toHaveTextContent('No services yet');
    expect(screen.getByTestId('health-subline')).toHaveTextContent('Add your first service to get started');
    expect(screen.queryByTestId('health-meter')).toBeNull();
  });

  // AC-V15-010 — the meter (one tick per service) renders in a populated panel and is aria-hidden.
  it('renders an aria-hidden meter with one tick per service', () => {
    setCtx([svc('UP', 'u1'), svc('DOWN', 'd1'), svc('NOT_MONITORED', 'n1')]);
    render(<StatusBar />);
    const meter = screen.getByTestId('health-meter');
    expect(meter).toHaveAttribute('aria-hidden', 'true');
    expect(meter.querySelectorAll('[data-tick]')).toHaveLength(3);
  });

  // AC-V15-016 — freshness label present; turns amber >5 min, red >15 min stale.
  it('marks the freshness label stale (amber) past 5 minutes', () => {
    setCtx([svc('UP', 'u1')], Date.now() - 6 * 60 * 1000);
    render(<StatusBar />);
    expect(screen.getByTestId('health-updated')).toHaveAttribute('data-stale', 'amber');
  });
});

// v24 (SPEC-v24-health-meter-banding) — the meter groups its ticks into three
// contiguous status bands, healthy-first: GREEN (UP) → GRAY (NOT_MONITORED +
// UNKNOWN) → RED (DOWN + DEGRADED). Caleb's resolved decision: 3 bands, no amber
// band (DEGRADED folds into RED). Within a band, ticks keep the user's layout
// order. The strip is still aria-hidden decorative; the chips carry the numbers.
describe('v24 health-meter status banding', () => {
  const bandOf = (el: Element): 'green' | 'gray' | 'red' | 'other' => {
    if (el.classList.contains('health-tick-up')) return 'green';
    if (el.classList.contains('health-tick-idle')) return 'gray';
    if (el.classList.contains('health-tick-down')) return 'red';
    return 'other';
  };

  // AC-V24-001 — interleaved statuses render as three contiguous bands
  // GREEN → GRAY → RED; ticks never interleave across bands. DEGRADED is red
  // (3-band decision — no amber tick survives in the meter).
  it('groups ticks into contiguous GREEN → GRAY → RED bands (no amber)', () => {
    // Layout order deliberately interleaves all bands.
    setCtx([
      svc('UP', 'u1'),
      svc('DOWN', 'd1'),
      svc('NOT_MONITORED', 'n1'),
      svc('UP', 'u2'),
      svc('DEGRADED', 'g1'),
      svc('UNKNOWN', 'k1'),
    ]);
    render(<StatusBar />);
    const ticks = [...screen.getByTestId('health-meter').querySelectorAll('[data-tick]')];
    expect(ticks.map(bandOf)).toEqual(['green', 'green', 'gray', 'gray', 'red', 'red']);
    // No tick keeps the standalone amber degraded color — degraded folds into red.
    expect(screen.getByTestId('health-meter').querySelector('.health-tick-degraded')).toBeNull();
  });

  // AC-V24-002 — within a band, ticks preserve the user's layout order. A
  // NOT_MONITORED at layout index 1 precedes an UNKNOWN at index 2 inside the
  // GRAY band (they are NOT sub-sorted by status within the band).
  it('preserves layout order within a band, including UNKNOWN among NOT_MONITORED', () => {
    setCtx([
      svc('UP', 'u1'), // idx 0 → green
      svc('NOT_MONITORED', 'n1'), // idx 1 → gray
      svc('UNKNOWN', 'k1'), // idx 2 → gray
      svc('UP', 'u2'), // idx 3 → green
      svc('DOWN', 'd1'), // idx 4 → red
    ]);
    render(<StatusBar />);
    const statuses = [...screen.getByTestId('health-meter').querySelectorAll('[data-tick]')].map(
      (el) => el.getAttribute('data-status'),
    );
    expect(statuses).toEqual(['UP', 'UP', 'NOT_MONITORED', 'UNKNOWN', 'DOWN']);
  });

  // AC-V24-004 — an all-UP fleet is a single unbroken green strip.
  it('renders an all-UP fleet as a single green band', () => {
    setCtx([svc('UP', 'u1'), svc('UP', 'u2'), svc('UP', 'u3')]);
    render(<StatusBar />);
    const ticks = [...screen.getByTestId('health-meter').querySelectorAll('[data-tick]')];
    expect(ticks.map(bandOf)).toEqual(['green', 'green', 'green']);
  });
});
