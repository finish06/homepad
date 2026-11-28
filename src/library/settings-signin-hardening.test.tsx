import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import SettingsPanel from './SettingsPanel';
import { listLibrary } from '../api';
import { adminServerSettings } from './serverSettingsApi';
import { settingsBody } from '../test/serverSettingsFixture';

// SPEC-signin-hardening AC-013, AC-017, UX §4 (S-3) — Admin Panel → System
// shows OIDC_MEMBER_GROUP under Sign-in and HOMEPAD_TRUSTED_PROXIES under
// Server, with a help line while the second is empty. The rows are the
// SPEC-admin-server-settings shared row now.

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

const HELP = 'When this is empty, everyone shares one sign-in limit.';

function body(trusted: string) {
  return settingsBody({
    HOMEPAD_TRUSTED_PROXIES: { value: trusted, envValue: trusted },
    OIDC_MEMBER_GROUP: { value: 'homepad', envValue: 'homepad', source: 'env' },
  });
}

async function system() {
  render(
    <SettingsPanel
      isAdmin
      showUptimeDisplay
      onSaveSettings={vi.fn().mockResolvedValue(undefined)}
      scope="admin"
      showUptimeDisplayPref
      onSetUptimeDisplay={vi.fn()}
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
  it('labels OIDC_MEMBER_GROUP "Member group" under Sign-in, after the admin group', async () => {
    vi.mocked(adminServerSettings).mockResolvedValue(body(''));
    const sys = await system();
    const row = await within(sys).findByTestId('setting-row-OIDC_MEMBER_GROUP');
    expect(within(row).getByText('Member group')).toBeInTheDocument();
    expect(within(row).getByText('homepad')).toBeInTheDocument();
    expect(row.previousElementSibling).toBe(within(sys).getByTestId('setting-row-OIDC_ADMIN_GROUP'));
  });

  it('labels HOMEPAD_TRUSTED_PROXIES "Trusted proxies" under Server, with the help line while empty', async () => {
    vi.mocked(adminServerSettings).mockResolvedValue(body(''));
    const sys = await system();
    const row = await within(sys).findByTestId('setting-row-HOMEPAD_TRUSTED_PROXIES');
    expect(within(row).getByText('Trusted proxies')).toBeInTheDocument();
    expect(within(row).getByText('not set')).toBeInTheDocument();
    expect(within(row).getByText(HELP)).toBeInTheDocument();
    expect(within(sys).getByTestId('settings-group-server')).toContainElement(row);
  });

  it('drops the help line once proxies are set, and shows the list', async () => {
    vi.mocked(adminServerSettings).mockResolvedValue(body('web, 10.0.0.0/8'));
    const sys = await system();
    const row = await within(sys).findByTestId('setting-row-HOMEPAD_TRUSTED_PROXIES');
    expect(within(row).getByText('web, 10.0.0.0/8')).toBeInTheDocument();
    expect(within(sys).queryByText(HELP)).not.toBeInTheDocument();
  });
});
