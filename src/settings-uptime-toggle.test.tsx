import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsPanel from './SettingsPanel';
import { listLibrary } from './api';

// SPEC cap6-uptime-display-toggle §8/§9 — the writable "Show uptime display"
// toggle in the admin System settings section. It is a role="switch" whose
// aria-checked reflects the persisted value (AC-004), calls onSaveSettings with
// the flipped value on click (AC-005), and renders only for admins (AC-007). The
// section note no longer claims the whole section is read-only (D6).

vi.mock('./api', () => ({
  listLibrary: vi.fn(),
  createLibraryApp: vi.fn(),
  updateLibraryApp: vi.fn(),
  deleteLibraryApp: vi.fn(),
  setLibraryOrder: vi.fn(),
}));

function renderPanel(props: Partial<React.ComponentProps<typeof SettingsPanel>> = {}) {
  return render(
    <SettingsPanel
      isAdmin={props.isAdmin ?? true}
      oidcEnabled={props.oidcEnabled ?? false}
      showUptimeDisplay={props.showUptimeDisplay ?? true}
      onSaveSettings={props.onSaveSettings ?? vi.fn().mockResolvedValue(undefined)}
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
    expect(screen.getByText('Show uptime display')).toBeInTheDocument();
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

  it('drops the whole-section read-only claim from the note (D6)', async () => {
    renderPanel({ isAdmin: true });
    await screen.findByTestId('settings-switch-uptime');
    const note = screen.getByTestId('settings-system').querySelector('.settings-section-note');
    // The old copy opened by declaring the WHOLE section read-only; D6 drops that.
    expect(note?.textContent ?? '').not.toMatch(/^Read-only — set via environment/);
    // The read-only signal now rides on the per-row [env] badge, referenced in the note.
    expect(note?.querySelector('.settings-env-badge')).not.toBeNull();
  });
});
