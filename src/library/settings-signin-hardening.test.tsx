import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import SettingsPanel from './SettingsPanel';
import { adminEnvConfig, listLibrary, type EnvConfigEntry } from '../api';

// SPEC-signin-hardening AC-013, AC-017, UX §4 (S-3) — Admin Panel → System
// shows OIDC_MEMBER_GROUP under Identity (OIDC) and HOMEPAD_TRUSTED_PROXIES
// under Server, with a help line while the second is empty.

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

const HELP = 'When this is empty, everyone shares one sign-in limit.';

function rows(trusted: string): EnvConfigEntry[] {
  return [
    { key: 'HOMEPAD_REGISTRATION', value: 'invite_only' },
    { key: 'HOMEPAD_MAX_ACCOUNTS', value: '' },
    { key: 'HOMEPAD_TRUSTED_PROXIES', value: trusted },
    { key: 'PORT', value: '8080' },
    { key: 'OIDC_ENABLED', value: 'true' },
    { key: 'OIDC_ADMIN_GROUP', value: 'homepad-admins' },
    { key: 'OIDC_MEMBER_GROUP', value: 'homepad' },
  ];
}

async function system() {
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
  return screen.findByTestId('settings-system');
}

beforeEach(() => {
  vi.mocked(listLibrary).mockResolvedValue([]);
});
afterEach(() => vi.clearAllMocks());

describe('System → the sign-in rows', () => {
  it('labels OIDC_MEMBER_GROUP and keeps it under Identity (OIDC), after the admin group', async () => {
    vi.mocked(adminEnvConfig).mockResolvedValue(rows(''));
    const sys = await system();
    const row = await within(sys).findByTestId('env-row-OIDC_MEMBER_GROUP');
    expect(within(row).getByText('OIDC member group')).toBeInTheDocument();
    expect(within(row).getByText('homepad')).toBeInTheDocument();
    expect(row.previousElementSibling).toBe(within(sys).getByTestId('env-row-OIDC_ADMIN_GROUP'));
  });

  it('labels HOMEPAD_TRUSTED_PROXIES "Trusted proxies" under Server, with the help line while empty', async () => {
    vi.mocked(adminEnvConfig).mockResolvedValue(rows(''));
    const sys = await system();
    const row = await within(sys).findByTestId('env-row-HOMEPAD_TRUSTED_PROXIES');
    expect(within(row).getByText('Trusted proxies')).toBeInTheDocument();
    expect(within(row).getByText('not set')).toBeInTheDocument();
    expect(within(row).getByText(HELP)).toHaveClass('settings-kv-help');
    // Server group: no caption between it and the account limit, nothing in "Other".
    expect(row.previousElementSibling).toBe(within(sys).getByTestId('env-row-HOMEPAD_MAX_ACCOUNTS'));
    expect(within(sys).queryByText('Other')).not.toBeInTheDocument();
  });

  it('drops the help line once proxies are set, and shows the list', async () => {
    vi.mocked(adminEnvConfig).mockResolvedValue(rows('web, 10.0.0.0/8'));
    const sys = await system();
    const row = await within(sys).findByTestId('env-row-HOMEPAD_TRUSTED_PROXIES');
    expect(within(row).getByText('web, 10.0.0.0/8')).toBeInTheDocument();
    expect(within(sys).queryByText(HELP)).not.toBeInTheDocument();
  });
});
