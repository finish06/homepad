import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import SettingsPanel from './SettingsPanel';
import { adminEnvConfig, listLibrary } from '../api';

// SPEC-household-basics AC-030 (plan TASK-208) — HOMEPAD_MAX_ACCOUNTS shows in
// Admin Panel → System with a friendly label, in the Server group next to the
// registration mode.

vi.mock('../api', () => ({
  listLibrary: vi.fn(),
  createLibraryApp: vi.fn(),
  updateLibraryApp: vi.fn(),
  deleteLibraryApp: vi.fn(),
  setLibraryOrder: vi.fn(),
  adminEnvConfig: vi.fn(),
  listAccounts: vi.fn(() => Promise.resolve([])),
  listInvites: vi.fn(() => Promise.resolve([])),
  authConfig: vi.fn(() => Promise.resolve({ oidcEnabled: false, registration: 'invite_only', setupNeeded: false })),
}));

beforeEach(() => {
  vi.mocked(listLibrary).mockResolvedValue([]);
  vi.mocked(adminEnvConfig).mockResolvedValue([
    { key: 'HOMEPAD_REGISTRATION', value: 'invite_only' },
    { key: 'HOMEPAD_MAX_ACCOUNTS', value: '12' },
    { key: 'OIDC_ENABLED', value: 'false' },
  ]);
});
afterEach(() => vi.clearAllMocks());

describe('System → Account limit (AC-030)', () => {
  it('labels HOMEPAD_MAX_ACCOUNTS "Account limit" and keeps it in the Server group', async () => {
    render(
      <SettingsPanel
        isAdmin
        showUptimeDisplay
        statusDegradedMs={1000}
        onSaveSettings={vi.fn().mockResolvedValue(undefined)}
        scope="admin"
        showHealthBar
        showUptimeDisplayPref
        onSetUptimeDisplay={vi.fn()}
        onSetHealthBar={vi.fn()}
        density="compact"
        onSetDensity={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const sys = await screen.findByTestId('settings-system');
    const row = await within(sys).findByTestId('env-row-HOMEPAD_MAX_ACCOUNTS');
    expect(within(row).getByText('Account limit')).toBeInTheDocument();
    expect(within(row).getByText('12')).toBeInTheDocument();
    // Same group as the registration mode: no new caption between them.
    expect(row.previousElementSibling).toBe(within(sys).getByTestId('env-row-HOMEPAD_REGISTRATION'));
    expect(within(sys).queryByText('Other')).not.toBeInTheDocument();
  });
});
