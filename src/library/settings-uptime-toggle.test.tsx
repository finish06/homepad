import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsPanel from './SettingsPanel';
import { listLibrary } from '../api';

// SPEC cap6-uptime-display-toggle §8/§9 — the writable admin System row.
// As of cap6 v2 this row sets the DEFAULT FOR NEW ACCOUNTS; the per-user
// preference it used to control lives in My settings (see SettingsPanel.test).
// Originally: the writable "Show uptime display"
// toggle in the admin System settings section. It is a role="switch" whose
// aria-checked reflects the persisted value (AC-004), calls onSaveSettings with
// the flipped value on click (AC-005), and renders only for admins (AC-007). The
// section note no longer claims the whole section is read-only (D6).

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
  // SPEC-kid-accounts — the admin scope now opens with the Accounts section,
  // which lists accounts on mount. An empty list keeps these suites about what
  // they test.
  listAccounts: vi.fn(() => Promise.resolve([])),
  listInvites: vi.fn(() => Promise.resolve([])),
  authConfig: vi.fn(() => Promise.resolve({ oidcEnabled: false, registration: 'invite_only', setupNeeded: false })),
}));

function renderPanel(props: Partial<React.ComponentProps<typeof SettingsPanel>> = {}) {
  return render(
    <SettingsPanel
      isAdmin={props.isAdmin ?? true}
      showUptimeDisplay={props.showUptimeDisplay ?? true}
      onSaveSettings={props.onSaveSettings ?? vi.fn().mockResolvedValue(undefined)}
      showHealthBar={true}
      showUptimeDisplayPref={true}
      onSetUptimeDisplay={vi.fn()}
      onSetHealthBar={vi.fn()}
      density="compact"
      onSetDensity={vi.fn()}
      onClose={props.onClose ?? vi.fn()}
    />,
  );
}

beforeEach(() => {
  vi.mocked(listLibrary).mockResolvedValue([]);
});

afterEach(() => vi.clearAllMocks());

describe('System settings — uptime display toggle (cap6)', () => {
  it('renders a labeled switch reflecting the ON state (AC-004)', async () => {
    renderPanel({ isAdmin: true, showUptimeDisplay: true });
    const sw = await screen.findByTestId('settings-switch-uptime');
    expect(sw).toHaveAttribute('role', 'switch');
    expect(sw).toHaveAttribute('aria-checked', 'true');
    // The accessible name comes from the row's dt label.
    // cap6 v2 relabelled this row: it is the DEFAULT FOR NEW ACCOUNTS now, not a
    // global override (AC-004 superseded by AC-028). The switch itself, its wiring
    // and its save semantics — everything else this suite covers — are unchanged.
    expect(screen.getByText(/new accounts/i)).toBeInTheDocument();
  });

  it('reflects the OFF state via aria-checked=false', async () => {
    renderPanel({ isAdmin: true, showUptimeDisplay: false });
    const sw = await screen.findByTestId('settings-switch-uptime');
    expect(sw).toHaveAttribute('aria-checked', 'false');
  });

  it('calls onSaveSettings with the flipped value when clicked (AC-005)', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderPanel({ isAdmin: true, showUptimeDisplay: true, onSaveSettings: onSave });
    const sw = await screen.findByTestId('settings-switch-uptime');
    await userEvent.click(sw);
    expect(onSave).toHaveBeenCalledWith({ showUptimeDisplay: false });
  });

  it('does not render the toggle for a non-admin (AC-007)', async () => {
    renderPanel({ isAdmin: false });
    await waitFor(() => expect(listLibrary).not.toHaveBeenCalled());
    expect(screen.queryByTestId('settings-switch-uptime')).toBeNull();
  });

  it('drops the whole-section read-only claim from the note (D6, AC-032)', async () => {
    renderPanel({ isAdmin: true });
    await screen.findByTestId('settings-switch-uptime');
    const note = screen.getByTestId('settings-system').querySelector('.settings-section-note');
    expect(note?.textContent ?? '').not.toMatch(/read-only/i);
    // SPEC-admin-server-settings §2.3 — the uptime row has no source badge.
    const row = screen.getByTestId('setting-row-showUptimeDisplay');
    expect(row.querySelector('.settings-src-badge')).toBeNull();
  });
});
