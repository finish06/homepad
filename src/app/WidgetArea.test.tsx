// SPEC-health-widget §4.5 — the widget area: clock, weather and health in one
// place, one frame each, space held while they load (#745); and AC-022 —
// hiding or turning off health changes nothing else that reports status.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import WidgetArea from './WidgetArea';
import App from './App';
import * as api from '../api';
import { useServicesContext } from '../services';
import type { Category, Service, ServiceStatus, User } from '../api';
import type { Visible } from '../widgets/visibleWidgets';
import type { WidgetsInfo } from '../widgets/widgetsInfo';

expect.extend(toHaveNoViolations);

vi.mock('../services', async (orig) => ({
  ...(await orig<typeof import('../services')>()),
  useServicesContext: vi.fn(),
}));

const INFO: WidgetsInfo = {
  health: { enabled: true },
  clock: { enabled: true, hour12: false },
  weather: {
    enabled: true, state: 'ok', asOf: null, place: 'Rotterdam', units: 'c',
    temp: 8, high: 9, low: 3, condition: 'cloudy', isDay: true,
  },
  search: { enabled: false, name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q={query}' },
};

const ALL: Visible = { clock: true, weather: true, health: true, healthDetails: true, tiles: true };

function svc(status: ServiceStatus, id: string): Service {
  return {
    id, slug: id, name: id, description: '', url: `https://${id}.example.com`, icon: '', status,
    favorite: false, iconLight: false, iconDark: false, categoryId: 'c1', categoryName: 'Media',
  };
}

function setItems(items: Service[] | null) {
  vi.mocked(useServicesContext).mockReturnValue({
    items,
    lastUpdatedAt: items ? Date.now() : null,
    refresh: vi.fn(),
  } as unknown as ReturnType<typeof useServicesContext>);
}

const slotIds = (root: ParentNode) =>
  Array.from(root.querySelectorAll('.widget')).map((el) => el.getAttribute('data-testid'));

describe('WidgetArea (AC-023)', () => {
  beforeEach(() => setItems([svc('UP', 'a'), svc('DOWN', 'b')]));
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('draws clock, weather and health in that order, each in a .widget frame with its own test id', async () => {
    const { container } = render(<WidgetArea visible={ALL} info={INFO} canRetry />);
    await screen.findByTestId('glance-time');
    await screen.findByTestId('glance-weather');
    expect(slotIds(container)).toEqual(['widget-clock', 'widget-weather', 'widget-health']);
    expect(screen.getByTestId('widget-health')).toContainElement(screen.getByTestId('status-bar'));
    expect(screen.getByTestId('widget-area')).toHaveAttribute('data-health', 'on');
  });

  it('with nothing visible, renders no element at all', () => {
    const { container } = render(
      <WidgetArea visible={{ ...ALL, clock: false, weather: false, health: false }} info={INFO} canRetry />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('without health, clock and weather share the row', () => {
    render(<WidgetArea visible={{ ...ALL, health: false, healthDetails: false }} info={INFO} canRetry />);
    expect(screen.getByTestId('widget-area')).toHaveAttribute('data-health', 'off');
    expect(screen.queryByTestId('status-bar')).not.toBeInTheDocument();
  });

  it('only health: one card', () => {
    const { container } = render(<WidgetArea visible={{ ...ALL, clock: false, weather: false }} info={null} canRetry />);
    expect(slotIds(container)).toEqual(['widget-health']);
  });

  it('holds the clock and weather slots before the info read; drops weather only on an error', () => {
    const { container, rerender } = render(<WidgetArea visible={ALL} info={null} canRetry />);
    expect(slotIds(container)).toEqual(['widget-clock', 'widget-weather', 'widget-health']);
    rerender(<WidgetArea visible={ALL} info={{ ...INFO, weather: { ...INFO.weather, state: 'loading', temp: undefined } }} canRetry />);
    expect(slotIds(container)).toEqual(['widget-clock', 'widget-weather', 'widget-health']);
    rerender(<WidgetArea visible={ALL} info={{ ...INFO, weather: { ...INFO.weather, state: 'error', temp: undefined } }} canRetry />);
    expect(slotIds(container)).toEqual(['widget-clock', 'widget-health']);
  });

  it('a first info read that failed drops the empty weather card; the clock stays', () => {
    const { container } = render(<WidgetArea visible={ALL} info={null} infoAnswered canRetry />);
    expect(slotIds(container)).toEqual(['widget-clock', 'widget-health']);
  });

  it('passes the person’s details choice and the kid rule through to health', () => {
    setItems([svc('UP', 'a')]);
    render(<WidgetArea visible={{ ...ALL, clock: false, weather: false, healthDetails: false }} info={null} canRetry={false} />);
    expect(screen.queryByTestId('status-bar-up')).not.toBeInTheDocument();
    expect(screen.getByTestId('health-subline')).toHaveTextContent('1 online');
  });
});

describe('loading holds its space (AC-025, #745)', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('with details: "Checking services…" over an empty, hidden details area', () => {
    setItems(null);
    render(<WidgetArea visible={{ ...ALL, clock: false, weather: false }} info={null} canRetry />);
    expect(screen.getByTestId('health-headline')).toHaveTextContent('Checking services…');
    const reserve = screen.getByTestId('health-reserve');
    expect(reserve).toHaveAttribute('aria-hidden', 'true');
    expect(reserve).toHaveClass('health-metrics', 'health-reserve');
    // Empty: no real chips, no ticks, nothing to click.
    expect(reserve.querySelector('button, [data-tick]')).toBeNull();
  });

  it('without details: the freshness row is held instead', () => {
    setItems(null);
    const { container } = render(
      <WidgetArea visible={{ ...ALL, clock: false, weather: false, healthDetails: false }} info={null} canRetry />,
    );
    expect(screen.queryByTestId('health-reserve')).not.toBeInTheDocument();
    const held = container.querySelector('.health-updated--verdict.health-reserve');
    expect(held).not.toBeNull();
    expect(held).toHaveAttribute('aria-hidden', 'true');
  });

  it('no spinner or shimmer anywhere in the area', () => {
    setItems(null);
    const { container } = render(<WidgetArea visible={ALL} info={null} canRetry />);
    expect(container.querySelector('[class*="animate-"], [class*="skeleton"], [class*="shimmer"], [class*="spinner"]')).toBeNull();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('a load drops the held space for the real details', () => {
    setItems(null);
    const { rerender } = render(<WidgetArea visible={{ ...ALL, clock: false, weather: false }} info={null} canRetry />);
    expect(screen.getByTestId('health-reserve')).toBeInTheDocument();
    setItems([svc('UP', 'a')]);
    rerender(<WidgetArea visible={{ ...ALL, clock: false, weather: false }} info={null} canRetry />);
    expect(screen.queryByTestId('health-reserve')).not.toBeInTheDocument();
    expect(screen.getByTestId('health-meter')).toBeInTheDocument();
  });
});

// AC-026 — jest-axe over each §6 state the area can draw.
describe('a11y (AC-026)', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it.each<[string, Service[] | null, Partial<Visible>, WidgetsInfo | null]>([
    ['first paint, loading', null, {}, null],
    ['loaded, attention', [svc('UP', 'a'), svc('DOWN', 'b')], {}, INFO],
    ['health details hidden', [svc('UP', 'a')], { healthDetails: false }, INFO],
    ['health hidden', [svc('UP', 'a')], { health: false, healthDetails: false }, INFO],
    ['only health, not monitored', [svc('NOT_MONITORED', 'a')], { clock: false, weather: false }, null],
    ['no services yet', [], {}, INFO],
  ])('%s has no violations; health keeps role=status and the clock is no live region', async (_n, items, vis, info) => {
    setItems(items);
    const { container } = render(<WidgetArea visible={{ ...ALL, ...vis }} info={info} canRetry />);
    if (vis.clock !== false) await screen.findByTestId('glance-time');
    expect(await axe(container)).toHaveNoViolations();
    if (vis.health !== false) expect(screen.getByTestId('status-bar')).toHaveAttribute('role', 'status');
    const time = screen.queryByTestId('glance-time');
    if (time) expect(time.closest('[aria-live]')).toBeNull();
  });
});

// AC-022 — hiding health, or turning it off for the household, leaves every
// other status surface alone: the toasts, the bell, the header's "Updated"
// button and the status poll (OQ-1, OQ-4).
describe('health off changes nothing else (AC-022)', () => {
  const CATS: Category[] = [{ id: 'c1', name: 'Media', sortIndex: 0 }];
  const USER: User = { id: 'u1', email: 'nani@example.com', role: 'member', themePref: 'light', densityPref: 'compact' };

  beforeEach(async () => {
    const real = await vi.importActual<typeof import('../services')>('../services');
    vi.mocked(useServicesContext).mockImplementation(real.useServicesContext);
    localStorage.clear();
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it.each([
    ['hidden by the person', { ...USER, hiddenWidgets: ['health'] }, true],
    ['off for the household', { ...USER, hiddenWidgets: [] }, false],
  ])('health %s: toasts, the bell, Updated and the poll still work', async (_n, user, householdOn) => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.spyOn(api, 'me').mockResolvedValue(user as User);
    vi.spyOn(api, 'authConfig').mockResolvedValue({ oidcEnabled: false, registration: 'invite_only', setupNeeded: false });
    vi.spyOn(api, 'systemConfig').mockResolvedValue({ showUptimeDisplay: true, statusDegradedMs: 1000 });
    vi.spyOn(api, 'categories').mockResolvedValue(CATS);
    vi.spyOn(api, 'services').mockResolvedValue([svc('UP', 'jelly')]);
    const poll = vi
      .spyOn(api, 'servicesWithStatus')
      .mockResolvedValueOnce({ status: 200, services: [svc('UP', 'jelly')] })
      .mockResolvedValue({ status: 200, services: [svc('DOWN', 'jelly')] });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url === '/api/widgets/info'
          ? new Response(JSON.stringify({ ...INFO, health: { enabled: householdOn } }), { status: 200 })
          : new Response('{}', { status: 200 }),
      ),
    );

    render(<App />);
    await screen.findAllByTestId('tool-link');
    await waitFor(() => expect(screen.queryByTestId('status-bar')).not.toBeInTheDocument());
    expect(screen.getByTestId('alert-bell')).toBeInTheDocument();
    expect(await screen.findByTestId('status-last-updated')).toBeInTheDocument();

    const before = poll.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(61_000);
    });
    await waitFor(() => expect(poll.mock.calls.length).toBeGreaterThan(before));
    expect(await screen.findByTestId('toast')).toHaveTextContent(/jelly/i);
    expect(screen.getByTestId('alert-bell-badge')).toBeInTheDocument();
  });
});
