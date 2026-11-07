// SPEC-status-widgets AC-026 / UX §7 — Admin Panel → Widgets: Clock (on/off;
// device's choice, 12-hour or 24-hour), Weather (on/off; place found by name
// through the server; °C/°F), Web search (a provider or a custom https URL with
// {query}) and "Kids can search the web". Every control saves on change.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WidgetsSettings from './WidgetsSettings';
import { fetchWidgetsInfo, type WidgetsInfo } from './widgetsInfo';
import { geocode, saveWidgetSettings, type WidgetSettings } from './widgetAdminApi';

vi.mock('./widgetsInfo', async (orig) => ({
  ...(await orig<typeof import('./widgetsInfo')>()),
  fetchWidgetsInfo: vi.fn(),
}));
vi.mock('./widgetAdminApi', () => ({ geocode: vi.fn(), saveWidgetSettings: vi.fn() }));

const mInfo = vi.mocked(fetchWidgetsInfo);
const mGeo = vi.mocked(geocode);
const mSave = vi.mocked(saveWidgetSettings);

const DDG = 'https://duckduckgo.com/?q={query}';

const INFO: WidgetsInfo = {
  clock: { enabled: false, hour12: null },
  weather: { enabled: false, state: 'loading', asOf: null, place: '', units: 'c' },
  search: { enabled: false, name: 'DuckDuckGo', url: DDG, kids: false },
};

const SAVED: WidgetSettings = {
  clockEnabled: false,
  clockHour12: null,
  weatherEnabled: false,
  weatherPlace: '',
  weatherUnits: 'c',
  webSearchEnabled: false,
  webSearchUrl: DDG,
  kidWebSearch: false,
};

beforeEach(() => {
  mInfo.mockResolvedValue(INFO);
  mSave.mockImplementation(async (patch) => ({ ...SAVED, ...patch }) as WidgetSettings);
});
afterEach(() => vi.clearAllMocks());

async function setup(info: WidgetsInfo = INFO) {
  mInfo.mockResolvedValue(info);
  const onChanged = vi.fn();
  render(<WidgetsSettings onChanged={onChanged} />);
  const section = await screen.findByTestId('settings-widgets');
  await within(section).findByRole('switch', { name: 'Clock' });
  return { section, onChanged, user: userEvent.setup() };
}

describe('the section', () => {
  it('is headed "Widgets" with one line of context, in the admin styles root', async () => {
    const { section } = await setup();
    expect(within(section).getByRole('heading', { name: 'Widgets' })).toBeInTheDocument();
    expect(within(section).getByText('Shown at the top of everyone’s dashboard.')).toBeInTheDocument();
    expect(section).toHaveClass('widget-config');
  });

  it('says so when the settings can’t be read', async () => {
    mInfo.mockResolvedValue(null);
    render(<WidgetsSettings />);
    expect(await screen.findByText('Couldn’t load the widget settings.')).toBeInTheDocument();
  });
});

describe('Clock', () => {
  it('the switch saves on change and tells the dashboard', async () => {
    const { section, user, onChanged } = await setup();
    const sw = within(section).getByRole('switch', { name: 'Clock' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    await user.click(sw);
    expect(mSave).toHaveBeenCalledWith({ clockEnabled: true });
    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'true'));
    expect(onChanged).toHaveBeenCalled();
    expect(within(section).getByRole('status')).toHaveTextContent('Saved ✓');
  });

  it('the time format: device’s choice, 12-hour or 24-hour', async () => {
    const { section, user } = await setup();
    expect(within(section).getByRole('radio', { name: 'Device’s choice' })).toBeChecked();
    await user.click(within(section).getByRole('radio', { name: '24-hour' }));
    expect(mSave).toHaveBeenLastCalledWith({ clockHour12: false });
    await user.click(within(section).getByRole('radio', { name: '12-hour' }));
    expect(mSave).toHaveBeenLastCalledWith({ clockHour12: true });
    await user.click(within(section).getByRole('radio', { name: 'Device’s choice' }));
    expect(mSave).toHaveBeenLastCalledWith({ clockHour12: null });
  });

  it('a failed save reverts and says so', async () => {
    mSave.mockResolvedValue(null);
    const { section, user } = await setup();
    const sw = within(section).getByRole('switch', { name: 'Clock' });
    await user.click(sw);
    await waitFor(() => expect(within(section).getByRole('status')).toHaveTextContent('Couldn’t save — try again.'));
    expect(sw).toHaveAttribute('aria-checked', 'false');
  });
});

describe('Weather', () => {
  it('can’t be turned on until a place is chosen', async () => {
    const { section } = await setup();
    const sw = within(section).getByRole('switch', { name: 'Weather' });
    expect(sw).toBeDisabled();
    expect(within(section).getByText('Choose a place first.')).toBeInTheDocument();
  });

  it('finds a place through the server, and picking one saves it', async () => {
    mGeo.mockResolvedValue([
      { name: 'Rotterdam', region: 'South Holland', country: 'Netherlands', lat: 51.9225, lon: 4.47917 },
      { name: 'Rotterdam', region: 'New York', country: 'United States', lat: 42.8, lon: -73.97 },
    ]);
    const { section, user, onChanged } = await setup();
    const find = within(section).getByRole('button', { name: 'Find' });
    await user.type(within(section).getByLabelText('Place'), 'R');
    expect(find).toBeDisabled();
    await user.type(within(section).getByLabelText('Place'), 'otter');
    await user.click(find);
    expect(mGeo).toHaveBeenCalledWith('Rotter');
    const list = await within(section).findByRole('list', { name: 'Places' });
    const rows = within(list).getAllByRole('button');
    expect(rows.map((r) => r.textContent)).toEqual([
      'Rotterdam, South Holland, Netherlands',
      'Rotterdam, New York, United States',
    ]);
    await user.click(rows[0]);
    expect(mSave).toHaveBeenCalledWith({ weatherPlace: 'Rotterdam', weatherLat: 51.92, weatherLon: 4.48 });
    expect(await within(section).findByText('Rotterdam, Netherlands ✓')).toBeInTheDocument();
    expect(within(section).queryByRole('list', { name: 'Places' })).not.toBeInTheDocument();
    expect(within(section).getByRole('switch', { name: 'Weather' })).toBeEnabled();
    expect(onChanged).toHaveBeenCalled();
  });

  it('Enter in the field runs the search too', async () => {
    mGeo.mockResolvedValue([]);
    const { section, user } = await setup();
    await user.type(within(section).getByLabelText('Place'), 'Atlantis{Enter}');
    expect(mGeo).toHaveBeenCalledWith('Atlantis');
    expect(await within(section).findByText('No places found. Try a nearby town.')).toBeInTheDocument();
  });

  it('a failed search says the server can’t reach the weather service', async () => {
    mGeo.mockResolvedValue('unreachable');
    const { section, user } = await setup();
    await user.type(within(section).getByLabelText('Place'), 'Rotterdam{Enter}');
    expect(await within(section).findByText('Can’t reach the weather service from the server.')).toBeInTheDocument();
  });

  it('with a place set, the switch works and units save on change', async () => {
    const { section, user } = await setup({ ...INFO, weather: { ...INFO.weather, place: 'Rotterdam' } });
    expect(within(section).getByText('Rotterdam ✓')).toBeInTheDocument();
    await user.click(within(section).getByRole('switch', { name: 'Weather' }));
    expect(mSave).toHaveBeenCalledWith({ weatherEnabled: true });
    expect(within(section).getByRole('radio', { name: '°C' })).toBeChecked();
    await user.click(within(section).getByRole('radio', { name: '°F' }));
    expect(mSave).toHaveBeenLastCalledWith({ weatherUnits: 'f' });
  });

  it('credits Open-Meteo', async () => {
    const { section } = await setup();
    expect(within(section).getByText('Weather data by Open-Meteo.com.')).toBeInTheDocument();
  });
});

describe('Web search', () => {
  it('the switch saves on change', async () => {
    const { section, user } = await setup();
    await user.click(within(section).getByRole('switch', { name: 'Web search' }));
    expect(mSave).toHaveBeenCalledWith({ webSearchEnabled: true });
  });

  it('the provider select names the saved URL and saves a new one on change', async () => {
    const { section, user } = await setup();
    const select = within(section).getByLabelText('Search provider') as HTMLSelectElement;
    expect(select.value).toBe(DDG);
    expect([...select.options].map((o) => o.text)).toEqual([
      'DuckDuckGo',
      'Google',
      'Bing',
      'Kagi',
      'Startpage',
      'Custom',
    ]);
    await user.selectOptions(select, 'Google');
    expect(mSave).toHaveBeenCalledWith({ webSearchUrl: 'https://www.google.com/search?q={query}' });
  });

  it('Custom reveals an address field that needs https:// and {query}', async () => {
    const { section, user } = await setup();
    await user.selectOptions(within(section).getByLabelText('Search provider'), 'Custom');
    const field = within(section).getByLabelText('Custom address');
    const save = within(section).getByRole('button', { name: 'Save address' });
    await user.type(field, 'http://search.example.com/?q={{query}');
    await user.click(save);
    expect(within(section).getByText('The address needs to start with https://.')).toBeInTheDocument();
    await user.clear(field);
    await user.type(field, 'https://search.example.com/');
    await user.click(save);
    expect(within(section).getByText('The address needs {query} where the search words go.')).toBeInTheDocument();
    expect(mSave).not.toHaveBeenCalled();
    await user.clear(field);
    await user.type(field, 'https://search.example.com/?q={{query}');
    await user.click(save);
    expect(mSave).toHaveBeenCalledWith({ webSearchUrl: 'https://search.example.com/?q={query}' });
  });

  it('a saved custom URL opens on Custom with the field filled', async () => {
    const custom = 'https://search.example.com/?q={query}';
    const { section } = await setup({ ...INFO, search: { ...INFO.search, url: custom, name: 'search.example.com' } });
    expect((within(section).getByLabelText('Search provider') as HTMLSelectElement).value).toBe('custom');
    expect(within(section).getByLabelText('Custom address')).toHaveValue(custom);
  });

  it('"Kids can search the web" saves on change', async () => {
    const { section, user } = await setup();
    const box = within(section).getByRole('checkbox', { name: 'Kids can search the web' });
    expect(box).not.toBeChecked();
    await user.click(box);
    expect(mSave).toHaveBeenCalledWith({ kidWebSearch: true });
  });
});
