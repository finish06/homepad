// SPEC-status-widgets AC-031 / UX §8 — My settings → "Show widgets", and
// W-3 — the Admin Panel's Widgets section sits after System.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsPanel from './SettingsPanel';
import { adminEnvConfig, listLibrary } from '../api';

vi.mock('../api', () => ({
  listLibrary: vi.fn(),
  createLibraryApp: vi.fn(),
  updateLibraryApp: vi.fn(),
  deleteLibraryApp: vi.fn(),
  setLibraryOrder: vi.fn(),
  adminEnvConfig: vi.fn(),
  listAccounts: vi.fn(() => Promise.resolve([])),
}));
vi.mock('../widgets/widgetsInfo', async (orig) => ({
  ...(await orig<typeof import('../widgets/widgetsInfo')>()),
  fetchWidgetsInfo: vi.fn(async () => null),
}));

function renderPanel(props: Partial<React.ComponentProps<typeof SettingsPanel>> = {}) {
  return render(
    <SettingsPanel
      isAdmin={props.isAdmin ?? true}
      scope={props.scope ?? 'personal'}
      showUptimeDisplay
      statusDegradedMs={1000}
      onSaveSettings={vi.fn().mockResolvedValue(undefined)}
      showHealthBar
      showUptimeDisplayPref
      onSetUptimeDisplay={vi.fn()}
      onSetHealthBar={vi.fn()}
      density="compact"
      onSetDensity={vi.fn()}
      onClose={vi.fn()}
      {...props}
    />,
  );
}

beforeEach(() => {
  vi.mocked(listLibrary).mockResolvedValue([]);
  vi.mocked(adminEnvConfig).mockResolvedValue([]);
});
afterEach(() => vi.clearAllMocks());

describe('My settings → Show widgets (AC-031)', () => {
  it('is a switch with one line of help, reflecting the value', () => {
    renderPanel({ showWidgets: true, onSetShowWidgets: vi.fn() });
    const sw = screen.getByRole('switch', { name: 'Show widgets' });
    expect(sw).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Numbers on tiles, and the clock and weather.')).toBeInTheDocument();
  });

  it('asks for the inverse on click', async () => {
    const onSet = vi.fn();
    renderPanel({ showWidgets: true, onSetShowWidgets: onSet });
    await userEvent.click(screen.getByRole('switch', { name: 'Show widgets' }));
    expect(onSet).toHaveBeenCalledWith(false);
  });

  it('is not offered without a setter (a kid has no switch)', () => {
    renderPanel({ showWidgets: true });
    expect(screen.queryByRole('switch', { name: 'Show widgets' })).not.toBeInTheDocument();
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
    renderPanel({ scope: 'personal', showWidgets: true, onSetShowWidgets: vi.fn() });
    expect(screen.queryByTestId('settings-widgets')).not.toBeInTheDocument();
  });
});
