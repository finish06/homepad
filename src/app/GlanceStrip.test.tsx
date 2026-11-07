// SPEC-status-widgets AC-027, AC-028 / UX §4 — the glance strip: a clock that
// renders in the browser (viewer's time zone, on the minute, no network), and
// the server-fetched weather with the Open-Meteo credit. The strip never shows
// an error to viewers.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import GlanceStrip from './GlanceStrip';
import type { WidgetsInfo } from '../widgets/widgetsInfo';

const BASE: WidgetsInfo = {
  clock: { enabled: true, hour12: false },
  weather: {
    enabled: true,
    state: 'ok',
    asOf: '2026-11-07T14:00:00Z',
    place: 'Rotterdam',
    units: 'c',
    temp: 7.7,
    high: 9.0,
    low: 2.8,
    condition: 'cloudy',
    isDay: false,
  },
  search: { enabled: false, name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q={query}' },
};

function info(over: { clock?: Partial<WidgetsInfo['clock']>; weather?: Partial<WidgetsInfo['weather']> } = {}) {
  return {
    ...BASE,
    clock: { ...BASE.clock, ...over.clock },
    weather: { ...BASE.weather, ...over.weather },
  } as WidgetsInfo;
}

beforeEach(() => {
  vi.useFakeTimers();
  // Local time, so the expected strings don't depend on the runner's zone.
  vi.setSystemTime(new Date(2026, 10, 7, 14, 32, 40));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('clock (AC-027)', () => {
  it('shows hours and minutes, no seconds, in a <time> that is not a live region', () => {
    render(<GlanceStrip info={info()} />);
    const t = screen.getByTestId('glance-time');
    expect(t.tagName).toBe('TIME');
    expect(t).toHaveTextContent(/^14:32$/);
    expect(t).toHaveAttribute('datetime');
    expect(t.closest('[aria-live]')).toBeNull();
  });

  it('shows the long and the short date (CSS picks one per width)', () => {
    render(<GlanceStrip info={info()} />);
    expect(screen.getByTestId('glance-date-long')).toHaveTextContent(/Saturday/);
    expect(screen.getByTestId('glance-date-long')).toHaveTextContent(/November/);
    expect(screen.getByTestId('glance-date-short')).toHaveTextContent(/Sat/);
  });

  it('honours an admin 12-hour choice', () => {
    render(<GlanceStrip info={info({ clock: { hour12: true } })} />);
    expect(screen.getByTestId('glance-time')).toHaveTextContent(/2:32/);
    expect(screen.getByTestId('glance-time').textContent).not.toMatch(/14/);
  });

  it('updates on the minute, not every second', () => {
    render(<GlanceStrip info={info()} />);
    act(() => {
      vi.advanceTimersByTime(19_000); // 14:32:59
    });
    expect(screen.getByTestId('glance-time')).toHaveTextContent('14:32');
    act(() => {
      vi.advanceTimersByTime(1_100); // past 14:33:00
    });
    expect(screen.getByTestId('glance-time')).toHaveTextContent('14:33');
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByTestId('glance-time')).toHaveTextContent('14:34');
  });

  it('makes no network request', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    render(<GlanceStrip info={info()} />);
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('stops its timer when it unmounts', () => {
    const { unmount } = render(<GlanceStrip info={info()} />);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('is absent while the clock is off', () => {
    render(<GlanceStrip info={info({ clock: { enabled: false } })} />);
    expect(screen.queryByTestId('glance-clock')).not.toBeInTheDocument();
    expect(screen.getByTestId('glance-weather')).toBeInTheDocument();
  });
});

describe('weather (AC-028)', () => {
  it('shows the rounded temperature, the place and today’s high and low', () => {
    render(<GlanceStrip info={info()} />);
    const w = screen.getByTestId('glance-weather');
    expect(screen.getByTestId('glance-temp')).toHaveTextContent('8°');
    expect(w).toHaveTextContent('Rotterdam');
    expect(w).toHaveTextContent('H 9°');
    expect(w).toHaveTextContent('L 3°');
  });

  it('has a text alternative and an aria-hidden icon', () => {
    render(<GlanceStrip info={info()} />);
    expect(screen.getByText('Cloudy, 8 degrees. High 9, low 3. Rotterdam.')).toBeInTheDocument();
    const icon = screen.getByTestId('glance-weather-icon');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon).toHaveAttribute('data-condition', 'cloudy');
  });

  it('credits Open-Meteo with a link (CC BY 4.0)', () => {
    render(<GlanceStrip info={info()} />);
    const credit = screen.getByRole('link', { name: 'Open-Meteo' });
    expect(credit).toHaveAttribute('href', 'https://open-meteo.com/');
    expect(credit).toHaveAttribute('target', '_blank');
  });

  it.each([
    ['clear', true],
    ['clear', false],
    ['partly_cloudy', true],
    ['partly_cloudy', false],
    ['cloudy', true],
    ['fog', true],
    ['rain', true],
    ['snow', true],
    ['storm', true],
  ] as const)('draws an inline icon for %s (day %s), no image request', (condition, isDay) => {
    render(<GlanceStrip info={info({ weather: { condition, isDay } })} />);
    const icon = screen.getByTestId('glance-weather-icon');
    expect(icon.tagName.toLowerCase()).toBe('svg');
    expect(icon).toHaveAttribute('data-day', String(isDay));
    expect(document.querySelector('img')).toBeNull();
  });

  it('stale: keeps the last reading with a ◷ mark', () => {
    render(<GlanceStrip info={info({ weather: { state: 'stale' } })} />);
    expect(screen.getByTestId('glance-temp')).toHaveTextContent('◷ 8°');
  });

  it.each(['loading', 'error'] as const)('%s: the weather half is empty, with no error text', (state) => {
    render(
      <GlanceStrip
        info={info({ weather: { state, temp: undefined, high: undefined, low: undefined, condition: undefined } })}
      />,
    );
    expect(screen.queryByTestId('glance-weather')).not.toBeInTheDocument();
    expect(screen.getByTestId('glance-strip').textContent).not.toMatch(/error|fail|can.t/i);
  });

  it('is absent while weather is off', () => {
    render(<GlanceStrip info={info({ weather: { enabled: false } })} />);
    expect(screen.queryByTestId('glance-weather')).not.toBeInTheDocument();
    expect(screen.getByTestId('glance-clock')).toBeInTheDocument();
  });

  it('°F reads as degrees too', () => {
    render(<GlanceStrip info={info({ weather: { units: 'f', temp: 45.9, high: 48.2, low: 37 } })} />);
    expect(screen.getByTestId('glance-temp')).toHaveTextContent('46°');
  });

  it('a reading without high/low shows just the temperature', () => {
    render(<GlanceStrip info={info({ weather: { high: undefined, low: undefined } })} />);
    expect(screen.getByTestId('glance-weather')).not.toHaveTextContent('H ');
    expect(screen.getByText('Cloudy, 8 degrees. Rotterdam.')).toBeInTheDocument();
  });
});
