// SPEC-health-widget §4.6 / AC-028, AC-029 — My settings → Widgets, which
// replaces "Show status bar" and "Show widgets"; and W-3 — the Admin Panel's
// Widgets section sits after System.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import SettingsPanel from './SettingsPanel';
import { listLibrary } from '../api';

expect.extend(toHaveNoViolations);

vi.mock('./serverSettingsApi', () => ({
  adminServerSettings: vi.fn(() => Promise.resolve({ envOnly: false, settings: [] })),
  saveServerSettings: vi.fn(),
  resetServerSetting: vi.fn(),
  startOidcTest: vi.fn(),
  oidcTestStatus: vi.fn(),
}));

vi.mock('../api', () => ({
  listLibrary: vi.fn(),
  createLibraryApp: vi.fn(),
  updateLibraryApp: vi.fn(),
  deleteLibraryApp: vi.fn(),
  setLibraryOrder: vi.fn(),
  listAccounts: vi.fn(() => Promise.resolve([])),
  // SPEC-household-basics — the Accounts section also loads invites and the
  // auth config (as settings-accounts.test.tsx mocks them).
  listInvites: vi.fn(() => Promise.resolve([])),
  authConfig: vi.fn(() => Promise.resolve({ oidcEnabled: false, registration: 'invite_only', setupNeeded: false })),
}));
vi.mock('../widgets/widgetsInfo', async (orig) => ({
  ...(await orig<typeof import('../widgets/widgetsInfo')>()),
  fetchWidgetsInfo: vi.fn(async () => null),
}));

const ALL_ON = { clock: true, weather: true, health: true };

function renderPanel(props: Partial<React.ComponentProps<typeof SettingsPanel>> = {}) {
  return render(
    <SettingsPanel
      isAdmin={props.isAdmin ?? true}
      scope={props.scope ?? 'personal'}
      showUptimeDisplay
      onSaveSettings={vi.fn().mockResolvedValue(undefined)}
      showUptimeDisplayPref
      onSetUptimeDisplay={vi.fn()}
      density="compact"
      onSetDensity={vi.fn()}
      onClose={vi.fn()}
      household={ALL_ON}
      {...props}
    />,
  );
}

const ROWS: [string, string, string][] = [
  ['setting-widget-clock', 'Clock', 'clock'],
  ['setting-widget-weather', 'Weather', 'weather'],
  ['setting-widget-health', 'Health', 'health'],
  ['setting-health-bar', 'Counts and meter', 'healthDetails'],
  ['setting-widget-tiles', 'Numbers on tiles', 'tiles'],
];

beforeEach(() => {
  vi.mocked(listLibrary).mockResolvedValue([]);
});
afterEach(() => vi.clearAllMocks());

describe('My settings → Widgets (AC-028)', () => {
  it('has one switch per widget and part, in order, each on when not hidden', () => {
    renderPanel({ hiddenWidgets: ['weather', 'tiles'], onSetHiddenWidgets: vi.fn() });
    const group = screen.getByTestId('settings-widget-prefs');
    expect(within(group).getByRole('heading', { name: 'Widgets' })).toBeInTheDocument();
    const switches = within(group).getAllByRole('switch');
    expect(switches.map((s) => s.getAttribute('data-testid'))).toEqual(ROWS.map(([id]) => id));
    for (const [id, name, key] of ROWS) {
      const sw = screen.getByTestId(id);
      expect(sw).toHaveAccessibleName(name);
      expect(sw).toHaveAttribute('aria-checked', String(!['weather', 'tiles'].includes(key)));
    }
  });

  it.each(ROWS)('%s saves the whole list once per change', async (id, _name, key) => {
    const onSet = vi.fn();
    renderPanel({ hiddenWidgets: ['clock'], onSetHiddenWidgets: onSet });
    await userEvent.click(screen.getByTestId(id));
    expect(onSet).toHaveBeenCalledTimes(1);
    const want = key === 'clock' ? [] : ['clock', key];
    expect(onSet).toHaveBeenCalledWith(want);
  });

  it('a widget the household has off keeps its row, disabled, with the reason', async () => {
    const onSet = vi.fn();
    renderPanel({
      household: { clock: false, weather: true, health: true },
      hiddenWidgets: [],
      onSetHiddenWidgets: onSet,
    });
    const clock = screen.getByTestId('setting-widget-clock');
    expect(clock).toBeDisabled();
    expect(clock).toHaveAttribute('aria-checked', 'true'); // the person's own choice is kept
    expect(clock).toHaveAccessibleDescription('Off for everyone. An admin can turn it on.');
    await userEvent.click(clock);
    expect(onSet).not.toHaveBeenCalled();
    expect(screen.getByTestId('setting-widget-weather')).toBeEnabled();
    expect(screen.getAllByText('Off for everyone. An admin can turn it on.')).toHaveLength(1);
  });

  it('"Counts and meter" is disabled while Health is hidden or off', () => {
    const { unmount } = renderPanel({ hiddenWidgets: ['health'], onSetHiddenWidgets: vi.fn() });
    expect(screen.getByTestId('setting-health-bar')).toBeDisabled();
    unmount();
    renderPanel({ household: { ...ALL_ON, health: false }, hiddenWidgets: [], onSetHiddenWidgets: vi.fn() });
    expect(screen.getByTestId('setting-health-bar')).toBeDisabled();
    expect(screen.getByTestId('setting-widget-health')).toBeDisabled();
  });

  it('numbers on tiles have no household switch', () => {
    renderPanel({ household: { clock: false, weather: false, health: false }, onSetHiddenWidgets: vi.fn() });
    expect(screen.getByTestId('setting-widget-tiles')).toBeEnabled();
  });

  it('is not offered without a setter (a kid has no widget settings)', () => {
    renderPanel({ hiddenWidgets: [] });
    expect(screen.queryByTestId('settings-widget-prefs')).not.toBeInTheDocument();
  });

  it('AC-029 — the old rows are gone', () => {
    renderPanel({ onSetHiddenWidgets: vi.fn() });
    expect(screen.queryByRole('switch', { name: 'Show widgets' })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Show status bar' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('setting-show-widgets')).not.toBeInTheDocument();
  });

  it('AC-029 — every switch uses the 44×44 settings switch, and the group passes axe', async () => {
    const { container } = renderPanel({
      household: { clock: false, weather: true, health: true },
      hiddenWidgets: ['health'],
      onSetHiddenWidgets: vi.fn(),
    });
    for (const [id] of ROWS) expect(screen.getByTestId(id)).toHaveClass('settings-switch');
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('Admin Panel → Widgets (W-3)', () => {
  it('comes right after System', async () => {
    renderPanel({ scope: 'admin' });
    const widgets = await screen.findByTestId('settings-widgets');
    const system = screen.getByTestId('settings-system');
    expect(system.nextElementSibling).toBe(widgets);
    expect(within(widgets).getByRole('heading', { name: 'Widgets' })).toBeInTheDocument();
  });

  it('is not in My settings', () => {
    renderPanel({ scope: 'personal', onSetHiddenWidgets: vi.fn() });
    expect(screen.queryByTestId('settings-widgets')).not.toBeInTheDocument();
  });
});
