// SPEC-status-widgets UX §10 — jest-axe over each new surface: the glance
// strip, the tile editor's Widget section (saved key, no-server-key and test
// result states), Admin Panel → Widgets with place results open, and the ⌘K web
// row. Contrast and 44px targets are layout facts, measured in the browser gate.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import GlanceStrip from '../app/GlanceStrip';
import WidgetSection, { useWidgetEditor } from './WidgetSection';
import WidgetsSettings from './WidgetsSettings';
import CommandLauncher from '../launcher/CommandLauncher';
import { LauncherProvider } from '../launcher/launcher';
import { fetchWidgetsInfo, type WidgetsInfo } from './widgetsInfo';
import { geocode, getWidget, testWidget, widgetKinds } from './widgetAdminApi';
import type { Service } from '../api';

expect.extend(toHaveNoViolations);

vi.mock('./widgetsInfo', async (orig) => ({
  ...(await orig<typeof import('./widgetsInfo')>()),
  fetchWidgetsInfo: vi.fn(),
}));
vi.mock('./widgetAdminApi', () => ({
  widgetKinds: vi.fn(),
  getWidget: vi.fn(),
  putWidget: vi.fn(),
  deleteWidget: vi.fn(),
  testWidget: vi.fn(),
  geocode: vi.fn(),
  saveWidgetSettings: vi.fn(),
}));

const INFO: WidgetsInfo = {
  clock: { enabled: true, hour12: null },
  weather: {
    enabled: true, state: 'stale', asOf: null, place: 'Rotterdam', units: 'c',
    temp: 8, high: 9, low: 3, condition: 'rain', isDay: false,
  },
  search: { enabled: true, name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q={query}', kids: false },
};

const SERVICE: Service = {
  id: 'S1', slug: 'jellyfin', name: 'Jellyfin', url: 'https://jf.example.com', description: '', icon: '',
  status: 'UP', favorite: false, iconLight: false, iconDark: false,
};

const KINDS = {
  secretKeySet: true,
  kinds: [
    {
      kind: 'jellyfin', label: 'Jellyfin', auth: 'api_key' as const, match: ['jellyfin'],
      help: 'In Jellyfin: Dashboard → API Keys → +.',
      fields: ['playing', 'movies', 'series', 'episodes'].map((k, i) => ({ key: k, label: k, unit: 'count' as const, default: i < 3 })),
    },
  ],
};

function Editor() {
  const editor = useWidgetEditor(SERVICE);
  return (
    <form aria-label="Edit tile">
      <WidgetSection editor={editor} tileUrl={SERVICE.url} />
    </form>
  );
}

beforeEach(() => {
  vi.mocked(fetchWidgetsInfo).mockResolvedValue(INFO);
  vi.mocked(widgetKinds).mockResolvedValue(KINDS);
  vi.mocked(getWidget).mockResolvedValue({
    status: 'ok',
    config: {
      kind: 'jellyfin', address: '', username: '', hasSecret: true, fields: ['playing'], intervalS: 60,
      insecureTls: false, enabled: true, state: 'stale', error: 'auth', lastOkAt: null, lastCheckAt: null,
    },
  });
  vi.mocked(testWidget).mockResolvedValue({ ok: false, error: 'redirect' });
  vi.mocked(geocode).mockResolvedValue([
    { name: 'Rotterdam', region: 'South Holland', country: 'Netherlands', lat: 51.92, lon: 4.48 },
  ]);
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => vi.clearAllMocks());

describe('widget surfaces have no axe violations', () => {
  it('the glance strip', async () => {
    const { container } = render(<GlanceStrip info={INFO} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('the Widget section with a saved key, a last error and a test result', async () => {
    const { container } = render(<Editor />);
    const section = await screen.findByTestId('widget-section');
    await within(section).findByText('Key saved');
    await userEvent.click(within(section).getByRole('button', { name: 'Test connection' }));
    await within(section).findByTestId('widget-test-result');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('the Widget section without a server key', async () => {
    vi.mocked(widgetKinds).mockResolvedValue({ ...KINDS, secretKeySet: false });
    vi.mocked(getWidget).mockResolvedValue({ status: 'none' });
    const { container } = render(<Editor />);
    await screen.findByText('To save keys, set HOMEPAD_SECRET_KEY on the server.');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Admin Panel → Widgets with place results open', async () => {
    const { container } = render(<WidgetsSettings />);
    const section = await screen.findByTestId('settings-widgets');
    await userEvent.type(await within(section).findByLabelText('Place'), 'Rotterdam{Enter}');
    await within(section).findByRole('list', { name: 'Places' });
    expect(await axe(container)).toHaveNoViolations();
  });

  it('⌘K with the web row', async () => {
    const { container } = render(
      <LauncherProvider>
        <CommandLauncher services={[SERVICE]} webSearch={INFO.search} />
      </LauncherProvider>,
    );
    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    fireEvent.change(screen.getByTestId('launcher-input'), { target: { value: 'jelly' } });
    await waitFor(() => expect(screen.getByTestId('launcher-web-row')).toBeInTheDocument());
    expect(await axe(container)).toHaveNoViolations();
  });
});
