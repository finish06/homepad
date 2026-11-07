// SPEC-status-widgets — how Home wires the widgets together:
//   - the glance strip shows only while the clock or the weather is on, and the
//     viewer's "Show widgets" is on (AC-031, AC-035); a kid always gets it (UX
//     §2.5) but never a tile line, even if a payload carried one (Q3 a);
//   - ⌘K gets the web row from the same /api/widgets/info read (AC-030);
//   - an install with nothing configured looks exactly as today (AC-035).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import * as api from '../api';
import type { Category, Service, TileWidget, User } from '../api';
import type { WidgetsInfo } from '../widgets/widgetsInfo';

vi.mock('../api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api')>();
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(real)) out[k] = typeof v === 'function' ? vi.fn() : v;
  return out;
});

const ADULT: User = { id: 'u1', email: 'nani@example.com', role: 'user', themePref: 'light', densityPref: 'compact' };
const KID: User = {
  id: 'k1',
  email: '',
  role: 'kid',
  themePref: 'light',
  name: 'Maya',
  displayName: 'Maya',
  densityPref: 'large',
  showHealthBar: false,
};

const W: TileWidget = {
  kind: 'sonarr',
  state: 'ok',
  asOf: new Date().toISOString(),
  fields: [{ key: 'upcoming', label: 'this week', unit: 'count', value: 3 }],
};

const SONARR: Service = {
  id: 'sonarr', slug: 'sonarr', name: 'Sonarr', description: '', url: 'https://sonarr.example.com', icon: '',
  status: 'UP', favorite: false, iconLight: false, iconDark: false, categoryId: 'c1', categoryName: 'Media',
  widget: W,
};
const CATS: Category[] = [{ id: 'c1', name: 'Media', sortIndex: 0 }];

const OFF: WidgetsInfo = {
  clock: { enabled: false, hour12: null },
  weather: { enabled: false, state: 'loading', asOf: null, place: '', units: 'c' },
  search: { enabled: false, name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q={query}' },
};
const ON: WidgetsInfo = {
  clock: { enabled: true, hour12: false },
  weather: {
    enabled: true, state: 'ok', asOf: null, place: 'Rotterdam', units: 'c',
    temp: 8, high: 9, low: 3, condition: 'cloudy', isDay: true,
  },
  search: { enabled: true, name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q={query}' },
};

let infoCalls = 0;
function serve(user: User, info: WidgetsInfo | null, services: Service[] = [SONARR]) {
  vi.mocked(api.me).mockResolvedValue(user);
  vi.mocked(api.authConfig).mockResolvedValue({ oidcEnabled: false });
  vi.mocked(api.systemConfig).mockResolvedValue({ showUptimeDisplay: true, statusDegradedMs: 1000 });
  vi.mocked(api.categories).mockResolvedValue(CATS);
  vi.mocked(api.services).mockResolvedValue(services);
  vi.mocked(api.servicesWithStatus).mockResolvedValue({ status: 200, services });
  infoCalls = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/widgets/info') {
        infoCalls++;
        return info ? new Response(JSON.stringify(info), { status: 200 }) : new Response('', { status: 500 });
      }
      return new Response('{}', { status: 200 });
    }),
  );
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function boot() {
  render(<App />);
  await screen.findAllByTestId('tool-link');
}

describe('glance strip wiring', () => {
  it('nothing configured: no strip, and tiles as today (AC-035)', async () => {
    serve({ ...ADULT, showWidgets: true }, OFF, [{ ...SONARR, widget: undefined }]);
    await boot();
    await waitFor(() => expect(infoCalls).toBe(1));
    expect(screen.queryByTestId('glance-strip')).not.toBeInTheDocument();
  });

  it('clock or weather on: the strip shows above the health bar', async () => {
    serve({ ...ADULT, showWidgets: true }, ON);
    await boot();
    const strip = await screen.findByTestId('glance-strip');
    const bar = screen.getByTestId('status-bar-content');
    expect(strip.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('the info read failing is the same as all off', async () => {
    serve({ ...ADULT, showWidgets: true }, null);
    await boot();
    await waitFor(() => expect(infoCalls).toBe(1));
    expect(screen.queryByTestId('glance-strip')).not.toBeInTheDocument();
  });

  it('Show widgets off: no strip and no tile lines (AC-031)', async () => {
    serve({ ...ADULT, showWidgets: false }, ON);
    await boot();
    await waitFor(() => expect(infoCalls).toBe(1));
    expect(screen.queryByTestId('glance-strip')).not.toBeInTheDocument();
    expect(screen.getByTestId('tile-statusline')).not.toHaveTextContent('this week');
  });

  it('Show widgets on: the tile line shows', async () => {
    serve({ ...ADULT, showWidgets: true }, OFF);
    await boot();
    expect(screen.getByTestId('tile-statusline')).toHaveTextContent('3 this week');
  });

  it('a kid gets the strip but never a tile line (Q3 a, UX §2.5)', async () => {
    serve(KID, ON);
    await boot();
    expect(await screen.findByTestId('glance-strip')).toBeInTheDocument();
    // Large density for a kid: a line would be the tile-widget element.
    expect(screen.queryByTestId('tile-widget')).not.toBeInTheDocument();
  });

  it('re-reads the info every 5 minutes while the tab is visible', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      serve({ ...ADULT, showWidgets: true }, OFF);
      await boot();
      await waitFor(() => expect(infoCalls).toBe(1));
      await act(async () => {
        vi.advanceTimersByTime(5 * 60_000);
      });
      await waitFor(() => expect(infoCalls).toBe(2));
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      await act(async () => {
        vi.advanceTimersByTime(5 * 60_000);
      });
      expect(infoCalls).toBe(2);
    } finally {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      vi.useRealTimers();
    }
  });
});

describe('web search wiring (AC-030)', () => {
  it('⌘K gets the web row when the server says it is on', async () => {
    serve({ ...ADULT, showWidgets: true }, ON);
    await boot();
    await waitFor(() => expect(infoCalls).toBe(1));
    await act(async () => {
      fireEvent.keyDown(document, { key: 'k', metaKey: true });
    });
    fireEvent.change(screen.getByTestId('launcher-input'), { target: { value: 'subtitles' } });
    expect(await screen.findByTestId('launcher-web-row')).toHaveTextContent('DuckDuckGo');
  });

  it('no web row while it is off', async () => {
    serve({ ...ADULT, showWidgets: true }, OFF);
    await boot();
    await waitFor(() => expect(infoCalls).toBe(1));
    await act(async () => {
      fireEvent.keyDown(document, { key: 'k', metaKey: true });
    });
    fireEvent.change(screen.getByTestId('launcher-input'), { target: { value: 'subtitles' } });
    expect(screen.queryByTestId('launcher-web-row')).not.toBeInTheDocument();
  });
});
