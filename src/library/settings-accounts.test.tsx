import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SettingsPanel from './SettingsPanel';
import { adminEnvConfig, listAccounts, listLibrary } from '../api';

// SPEC-kid-accounts UX §1 / K-1 (TASK-402) — Accounts is a section of the Admin
// Panel, placed FIRST (above System), and only in the admin scope.

vi.mock('../api', () => ({
  listLibrary: vi.fn(),
  createLibraryApp: vi.fn(),
  updateLibraryApp: vi.fn(),
  deleteLibraryApp: vi.fn(),
  setLibraryOrder: vi.fn(),
  adminEnvConfig: vi.fn(),
  listAccounts: vi.fn(),
  services: vi.fn(),
  categories: vi.fn(),
  kidServices: vi.fn(),
  kidSessions: vi.fn(),
  createKid: vi.fn(),
  updateKid: vi.fn(),
  deleteKid: vi.fn(),
  setKidServices: vi.fn(),
  revokeKidSession: vi.fn(),
  signInHere: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(listLibrary).mockResolvedValue([]);
  vi.mocked(adminEnvConfig).mockResolvedValue([]);
  vi.mocked(listAccounts).mockResolvedValue([
    { id: 'a1', name: 'Caleb', role: 'admin', lastSeenAt: null, email: 'c@x.test', avatarColor: 'blue' },
  ]);
});
afterEach(() => vi.clearAllMocks());

function renderPanel(props: Partial<React.ComponentProps<typeof SettingsPanel>> = {}) {
  return render(
    <SettingsPanel
      isAdmin={props.isAdmin ?? true}
      scope={props.scope}
      currentUserId="a1"
      initialSection={props.initialSection}
      showUptimeDisplay
      statusDegradedMs={1000}
      onSaveSettings={vi.fn().mockResolvedValue(undefined)}
      showHealthBar
      onSetHealthBar={vi.fn()}
      showUptimeDisplayPref
      onSetUptimeDisplay={vi.fn()}
      density="compact"
      onSetDensity={vi.fn()}
      onClose={vi.fn()}
    />,
  );
}

describe('Admin Panel — Accounts section (K-1)', () => {
  it('is the first section, above System and the App Library', async () => {
    renderPanel();
    await screen.findAllByTestId('account-row');
    const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(titles.slice(0, 3)).toEqual(['Accounts', 'System', 'App Library']);
  });

  it('marks the signed-in admin as "you"', async () => {
    renderPanel();
    expect(await screen.findByTestId('account-row')).toHaveTextContent('you');
  });

  it('is absent from My settings, and for a non-admin', async () => {
    const { unmount } = renderPanel({ scope: 'personal' });
    expect(screen.queryByTestId('settings-accounts')).toBeNull();
    unmount();
    renderPanel({ isAdmin: false });
    expect(screen.queryByTestId('settings-accounts')).toBeNull();
    expect(listAccounts).not.toHaveBeenCalled();
  });

  it('scrolls to Accounts when opened from the "Accounts" menu item', async () => {
    const spy = vi.fn();
    Element.prototype.scrollIntoView = spy;
    renderPanel({ initialSection: 'accounts' });
    await screen.findAllByTestId('account-row');
    expect(spy).toHaveBeenCalled();
    // @ts-expect-error — jsdom has no scrollIntoView; remove the stub again.
    delete Element.prototype.scrollIntoView;
  });
});
