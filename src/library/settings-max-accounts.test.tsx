import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import SettingsPanel from './SettingsPanel';
import { listLibrary } from '../api';
import { adminServerSettings } from './serverSettingsApi';
import { settingsBody } from '../test/serverSettingsFixture';

// SPEC-household-basics AC-030 — HOMEPAD_MAX_ACCOUNTS shows in Admin Panel →
// System with a friendly label. SPEC-admin-server-settings moved it into the
// Accounts group, next to Sign-up, and words 0 as "No limit".

vi.mock('./serverSettingsApi', () => ({
  adminServerSettings: vi.fn(),
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
  listInvites: vi.fn(() => Promise.resolve([])),
  authConfig: vi.fn(() => Promise.resolve({ oidcEnabled: false, registration: 'invite_only', setupNeeded: false })),
}));

beforeEach(() => {
  vi.mocked(listLibrary).mockResolvedValue([]);
});
afterEach(() => vi.clearAllMocks());

function renderPanel() {
  render(
    <SettingsPanel
      isAdmin
      showUptimeDisplay
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
}

describe('System → Account limit (AC-030)', () => {
  it('labels HOMEPAD_MAX_ACCOUNTS "Account limit" in the Accounts group, after Sign-up', async () => {
    vi.mocked(adminServerSettings).mockResolvedValue(settingsBody({ HOMEPAD_MAX_ACCOUNTS: { value: 12, envValue: 12, source: 'env' } }));
    renderPanel();
    const row = await screen.findByTestId('setting-row-HOMEPAD_MAX_ACCOUNTS');
    expect(within(row).getByText('Account limit')).toBeInTheDocument();
    expect(within(row).getByText('12')).toBeInTheDocument();
    expect(row.previousElementSibling).toBe(screen.getByTestId('setting-row-HOMEPAD_REGISTRATION'));
    expect(within(screen.getByTestId('settings-group-accounts')).getByText('Accounts')).toBeInTheDocument();
  });

  it('shows 0 as "No limit"', async () => {
    vi.mocked(adminServerSettings).mockResolvedValue(settingsBody());
    renderPanel();
    const row = await screen.findByTestId('setting-row-HOMEPAD_MAX_ACCOUNTS');
    expect(within(row).getByText('No limit')).toBeInTheDocument();
  });
});
