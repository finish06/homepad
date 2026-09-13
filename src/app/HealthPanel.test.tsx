import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StatusBar from './StatusBar';
import { useServicesContext } from '../services';
import type { Service, ServiceStatus } from '../api';

// v15 — the health summary panel replaces v14's count strip (StatusBar rebuild,
// design spec §4.2). It derives purely from useServicesContext(); mock the hook
// so each test injects an exact items array + freshness.
vi.mock('../services', () => ({
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

// ---------------------------------------------------------------------------
// SPEC-v24 §12.2 — NOT MONITORED panel state (v16 artboard extension).
//
// The bug this fixes: when no service has monitoring configured, every service
// reports NOT_MONITORED, `attention` is 0, and the panel falls through to the
// operational branch — a green LED over the words "All systems operational"
// with zero evidence behind them. The panel must not assert a verdict it has
// no basis for.
//
// OQ-10 (resolved 2026-09-12): the trigger is the monitored count reaching
// zero, not "any service unmonitored". A fleet with one monitored service is
// still being checked and keeps its normal verdict.
// ---------------------------------------------------------------------------
describe('SPEC-v24 §12.2 — NOT MONITORED panel state', () => {
  // AC-V24-NM1 — trigger + headline + honest neutral LED.
  it('AC-V24-NM1 — renders the not-monitored variant when no service is monitored', () => {
    setCtx([svc('NOT_MONITORED', 'n1'), svc('NOT_MONITORED', 'n2', 'Develop')]);
    render(<StatusBar />);
    expect(screen.getByTestId('health-headline')).toHaveTextContent('Status is not being checked');
    expect(screen.getByTestId('health-led')).toHaveAttribute('data-variant', 'not-monitored');
  });

  // AC-V24-NM1 — the LED must not make a green claim.
  it('AC-V24-NM1 — does not show the operational headline over an unmonitored fleet', () => {
    setCtx([svc('NOT_MONITORED', 'n1'), svc('NOT_MONITORED', 'n2')]);
    render(<StatusBar />);
    expect(screen.getByTestId('health-headline')).not.toHaveTextContent('All systems operational');
  });

  // AC-V24-NM1 — sub-line names the count and says what still works.
  it('AC-V24-NM1 — sub-line reports the count and that tiles still launch', () => {
    setCtx([svc('NOT_MONITORED', 'n1'), svc('NOT_MONITORED', 'n2'), svc('NOT_MONITORED', 'n3')]);
    render(<StatusBar />);
    const sub = screen.getByTestId('health-subline');
    expect(sub).toHaveTextContent('3 services, none of them monitored');
    expect(sub).toHaveTextContent('tiles will launch, but they cannot report');
  });

  // AC-V24-NM1 — singular wording for a one-service fleet.
  it('AC-V24-NM1 — uses singular wording for a single unmonitored service', () => {
    setCtx([svc('NOT_MONITORED', 'only')]);
    render(<StatusBar />);
    expect(screen.getByTestId('health-subline')).toHaveTextContent('1 service, none of them monitored');
  });

  // AC-V24-NM2 — nothing to plot, so no meter.
  it('AC-V24-NM2 — does not render the meter strip', () => {
    setCtx([svc('NOT_MONITORED', 'n1'), svc('NOT_MONITORED', 'n2')]);
    render(<StatusBar />);
    expect(screen.queryByTestId('health-meter')).toBeNull();
  });

  // AC-V24-NM4 — one monitored service is enough to restore the normal verdict.
  it('AC-V24-NM4 — leaves the not-monitored variant when any service is monitored', () => {
    setCtx([svc('NOT_MONITORED', 'n1'), svc('UP', 'u1')]);
    render(<StatusBar />);
    expect(screen.getByTestId('health-headline')).toHaveTextContent('All systems operational');
    expect(screen.getByTestId('health-led')).toHaveAttribute('data-variant', 'operational');
  });

  // AC-V24-NM4 — a down service outranks the unmonitored majority.
  it('AC-V24-NM4 — an attention state still wins over mostly-unmonitored', () => {
    setCtx([svc('NOT_MONITORED', 'n1'), svc('NOT_MONITORED', 'n2'), svc('DOWN', 'd1')]);
    render(<StatusBar />);
    expect(screen.getByTestId('health-headline')).toHaveTextContent('needs attention');
    expect(screen.getByTestId('health-led')).toHaveAttribute('data-variant', 'attention');
  });

  // Guard — an empty catalog is a different state and must not be hijacked.
  it('keeps the empty-catalog state distinct from not-monitored', () => {
    setCtx([]);
    render(<StatusBar />);
    expect(screen.getByTestId('health-headline')).toHaveTextContent('No services yet');
  });

  // Guard — loading must not flash the not-monitored verdict.
  it('does not show not-monitored while still loading', () => {
    setCtx(null);
    render(<StatusBar />);
    expect(screen.getByTestId('health-headline')).toHaveTextContent('Checking services…');
  });
});

// ---------------------------------------------------------------------------
// SPEC-v24 §12.2 — "Not now" dismiss (AC-V24-NM3a).
//
// NM3 is split. The dismiss half is buildable and lives here. The
// "Connect a status source" CTA (NM3b) is deferred: OQ-4 resolved it to "link
// to documentation", but no documentation target exists yet, and shipping a
// dead link is worse than shipping no link.
//
// OQ-4b (resolved 2026-09-12, DEFAULT): the dismiss is session-scoped. It holds
// for the life of the mounted panel and does not persist anywhere, so a user
// who dismisses by accident is never permanently stuck without the warning.
// ---------------------------------------------------------------------------
describe('SPEC-v24 §12.2 — "Not now" dismiss', () => {
  it('AC-V24-NM3a — offers a "Not now" dismiss in the not-monitored state', () => {
    setCtx([svc('NOT_MONITORED', 'n1')]);
    render(<StatusBar />);
    expect(screen.getByTestId('health-dismiss')).toBeInTheDocument();
  });

  // REWRITTEN 2026-09-12. These two tests previously asserted that dismissing
  // returned the panel to the OPERATIONAL variant, which is what the spec draft
  // said. A browser pass showed what that actually looks like: a green light
  // over the words "All systems operational" across a fleet where nothing is
  // monitored — the exact false claim this whole state exists to remove, one
  // click away. Caleb's call: the verdict keeps standing down and only the
  // action row collapses.
  it('AC-V24-NM3a — dismissing collapses the action row only', async () => {
    const user = userEvent.setup();
    setCtx([svc('NOT_MONITORED', 'n1'), svc('NOT_MONITORED', 'n2')]);
    render(<StatusBar />);
    await user.click(screen.getByTestId('health-dismiss'));
    expect(screen.queryByTestId('health-dismiss')).toBeNull();
    expect(screen.getByTestId('health-led')).toHaveAttribute('data-variant', 'not-monitored');
  });

  // The dismissed panel must stay honest — it may never claim all is well.
  it('AC-V24-NM3a — the dismissed panel does not claim the fleet is healthy', async () => {
    const user = userEvent.setup();
    setCtx([svc('NOT_MONITORED', 'n1'), svc('NOT_MONITORED', 'n2')]);
    render(<StatusBar />);
    await user.click(screen.getByTestId('health-dismiss'));
    const headline = screen.getByTestId('health-headline');
    expect(headline).not.toHaveTextContent('All systems operational');
    expect(headline).toHaveTextContent('Status is not being checked');
  });

  // Dismissing must not quietly restore the meter either — every tick would
  // still be gray, so there is still nothing to plot.
  it('AC-V24-NM3a — the meter stays hidden after dismissing', async () => {
    const user = userEvent.setup();
    setCtx([svc('NOT_MONITORED', 'n1'), svc('NOT_MONITORED', 'n2')]);
    render(<StatusBar />);
    await user.click(screen.getByTestId('health-dismiss'));
    expect(screen.queryByTestId('health-meter')).toBeNull();
  });

  it('AC-V24-NM3a — no dismiss button appears when the fleet is monitored', () => {
    setCtx([svc('UP', 'u1')]);
    render(<StatusBar />);
    expect(screen.queryByTestId('health-dismiss')).toBeNull();
  });
});

// Found in a browser pass, not by the unit tests above: with the meter gone the
// three colour swatches were still rendered, explaining a key for something no
// longer on screen. The freshness label stays — when status was last read is
// still meaningful even when nothing is being checked.
describe('SPEC-v24 §12.2 — legend follows the meter', () => {
  it('AC-V24-NM2 — hides the colour legend when the meter is hidden', () => {
    setCtx([svc('NOT_MONITORED', 'n1'), svc('NOT_MONITORED', 'n2')]);
    render(<StatusBar />);
    expect(screen.queryByText('Online')).toBeNull();
    expect(screen.queryByText('Offline')).toBeNull();
  });

  it('AC-V24-NM2 — keeps the freshness label in the not-monitored state', () => {
    setCtx([svc('NOT_MONITORED', 'n1')], Date.now());
    render(<StatusBar />);
    expect(screen.getByTestId('health-updated')).toBeInTheDocument();
  });

  it('keeps the colour legend whenever the meter is shown', () => {
    setCtx([svc('UP', 'u1')]);
    render(<StatusBar />);
    expect(screen.getByTestId('health-meter')).toBeInTheDocument();
    expect(screen.getByText('Online')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// SPEC-v24 §12.3 — STALE panel state (AC-V24-ST1..ST3).
//
// Past the existing red freshness threshold (>15 min since the last successful
// GET /api/services) the verdict stands down: the LED goes neutral, the headline
// reports the age, and the meter is drawn dimmed as last-known rather than
// asserted as current. ST4/ST5 ("Retry now" prodding the backend poller) are
// blocked on the refresh endpoint and are NOT covered here.
// ---------------------------------------------------------------------------
const MIN = 60_000;

describe('SPEC-v24 §12.3 — STALE panel state', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('AC-V24-ST1 — stands the verdict down past 15 minutes: neutral LED + age headline', () => {
    setCtx([svc('UP', 'u1'), svc('UP', 'u2')], Date.now() - 16 * MIN);
    render(<StatusBar />);
    expect(screen.getByTestId('health-led')).toHaveAttribute('data-variant', 'stale');
    expect(screen.getByTestId('health-headline')).toHaveTextContent('Status is 16 minutes old');
    expect(screen.getByTestId('health-headline')).not.toHaveTextContent('All systems operational');
  });

  it('AC-V24-ST1 — an attention verdict stands down too; stale data cannot support it', () => {
    setCtx([svc('DOWN', 'd1'), svc('UP', 'u1')], Date.now() - 20 * MIN);
    render(<StatusBar />);
    expect(screen.getByTestId('health-led')).toHaveAttribute('data-variant', 'stale');
    expect(screen.getByTestId('health-headline')).toHaveTextContent('Status is 20 minutes old');
    expect(screen.getByTestId('health-headline')).not.toHaveTextContent('needs attention');
  });

  it('AC-V24-ST1 — sub-line names the last successful check and that the state is last-known', () => {
    const at = Date.now() - 16 * MIN;
    setCtx([svc('UP', 'u1')], at);
    render(<StatusBar />);
    const sub = screen.getByTestId('health-subline');
    const hhmm = new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    expect(sub).toHaveTextContent(`Last successful check ${hhmm}`);
    expect(sub).toHaveTextContent('showing the last state that was confirmed');
  });

  it('AC-V24-ST1 — does not fire at the amber threshold (5–15 min); only red stands the verdict down', () => {
    setCtx([svc('UP', 'u1')], Date.now() - 10 * MIN);
    render(<StatusBar />);
    expect(screen.getByTestId('health-led')).toHaveAttribute('data-variant', 'operational');
    expect(screen.getByTestId('health-headline')).toHaveTextContent('All systems operational');
  });

  it('AC-V24-ST2 — the age counts up with the existing one-second tick', () => {
    vi.useFakeTimers();
    setCtx([svc('UP', 'u1')], Date.now() - 16 * MIN);
    render(<StatusBar />);
    expect(screen.getByTestId('health-headline')).toHaveTextContent('Status is 16 minutes old');
    act(() => {
      vi.advanceTimersByTime(2 * MIN);
    });
    expect(screen.getByTestId('health-headline')).toHaveTextContent('Status is 18 minutes old');
  });

  it('AC-V24-ST2 — crosses INTO stale on the tick without a new fetch', () => {
    vi.useFakeTimers();
    setCtx([svc('UP', 'u1')], Date.now() - 14 * MIN);
    render(<StatusBar />);
    expect(screen.getByTestId('health-led')).toHaveAttribute('data-variant', 'operational');
    act(() => {
      vi.advanceTimersByTime(2 * MIN);
    });
    expect(screen.getByTestId('health-led')).toHaveAttribute('data-variant', 'stale');
    expect(screen.getByTestId('health-headline')).toHaveTextContent('Status is 16 minutes old');
  });

  it('AC-V24-ST3 — the meter is still rendered, marked dimmed, with the last-known ticks', () => {
    setCtx([svc('UP', 'u1'), svc('DOWN', 'd1'), svc('NOT_MONITORED', 'n1')], Date.now() - 16 * MIN);
    render(<StatusBar />);
    const meter = screen.getByTestId('health-meter');
    expect(meter).toHaveAttribute('data-stale', 'true');
    expect(meter.querySelectorAll('[data-tick]')).toHaveLength(3);
  });

  it('AC-V24-ST3 — the meter is not marked dimmed while the data is fresh', () => {
    setCtx([svc('UP', 'u1')]);
    render(<StatusBar />);
    expect(screen.getByTestId('health-meter')).not.toHaveAttribute('data-stale', 'true');
  });

  it('keeps the not-monitored state when the (absent) evidence is also old', () => {
    // Stale describes an old verdict. With nothing monitored there is no verdict
    // to stand down, so the more specific "not being checked" wording wins.
    setCtx([svc('NOT_MONITORED', 'n1')], Date.now() - 16 * MIN);
    render(<StatusBar />);
    expect(screen.getByTestId('health-led')).toHaveAttribute('data-variant', 'not-monitored');
    expect(screen.getByTestId('health-headline')).toHaveTextContent('Status is not being checked');
  });

  it('never shows stale while loading, even with an old timestamp', () => {
    setCtx(null, Date.now() - 16 * MIN);
    render(<StatusBar />);
    expect(screen.getByTestId('health-headline')).toHaveTextContent('Checking services…');
  });
});

// ---------------------------------------------------------------------------
// SPEC-v24 §12.2 — "Connect a status source" CTA (AC-V24-NM3b).
//
// OQ-4 resolved the target to "link to documentation". The page now exists
// (docs/monitoring.md), so the CTA ships pointing at it. It sits in the same
// action row as "Not now", so the dismiss collapses both.
// ---------------------------------------------------------------------------
describe('SPEC-v24 §12.2 — "Connect a status source" CTA', () => {
  it('AC-V24-NM3b — offers the CTA in the not-monitored state', () => {
    setCtx([svc('NOT_MONITORED', 'n1')]);
    render(<StatusBar />);
    const cta = screen.getByTestId('health-connect-cta');
    expect(cta).toHaveTextContent('Connect a status source');
  });

  it('AC-V24-NM3b — the CTA links to the monitoring setup documentation in a new tab', () => {
    setCtx([svc('NOT_MONITORED', 'n1')]);
    render(<StatusBar />);
    const cta = screen.getByTestId('health-connect-cta');
    expect(cta).toHaveAttribute('href', expect.stringContaining('docs/monitoring.md'));
    expect(cta).toHaveAttribute('target', '_blank');
    expect(cta.getAttribute('rel')).toContain('noopener');
  });

  it('AC-V24-NM3b — the CTA is absent once anything is monitored', () => {
    setCtx([svc('NOT_MONITORED', 'n1'), svc('UP', 'u1')]);
    render(<StatusBar />);
    expect(screen.queryByTestId('health-connect-cta')).toBeNull();
  });

  it('AC-V24-NM3a/b — "Not now" collapses the CTA with the rest of the action row', async () => {
    setCtx([svc('NOT_MONITORED', 'n1')]);
    render(<StatusBar />);
    await userEvent.click(screen.getByTestId('health-dismiss'));
    expect(screen.queryByTestId('health-connect-cta')).toBeNull();
    expect(screen.getByTestId('health-led')).toHaveAttribute('data-variant', 'not-monitored');
  });
});
