import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SettingsPanel from './SettingsPanel';
import { adminEnvConfig, listAccounts, listLibrary } from '../api';

// SPEC-backup-import UX §1 / B-1 (TASK-303, TASK-306) — Backup and import is the
// LAST section of the Admin Panel, admin only (AC-032). After an apply, the
// panel reloads its App Library and Accounts lists, and tells the app so the
// dashboard behind refetches too.

vi.mock('./backup/RestoreModal', () => ({
  default: (props: { onClose: () => void; onApplied: () => void }) => (
    <div role="dialog" aria-label="Restore stub">
      <button onClick={props.onApplied}>applied</button>
      <button onClick={props.onClose}>close</button>
    </div>
  ),
}));
vi.mock('../api', () => ({
  listLibrary: vi.fn(),
  createLibraryApp: vi.fn(),
  updateLibraryApp: vi.fn(),
  deleteLibraryApp: vi.fn(),
  setLibraryOrder: vi.fn(),
  adminEnvConfig: vi.fn(),
  listAccounts: vi.fn(),
  downloadBackup: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(listLibrary).mockResolvedValue([]);
  vi.mocked(adminEnvConfig).mockResolvedValue([]);
  vi.mocked(listAccounts).mockResolvedValue([]);
});
afterEach(() => vi.clearAllMocks());

function renderPanel(props: Partial<React.ComponentProps<typeof SettingsPanel>> = {}) {
  return render(
    <SettingsPanel
      isAdmin={props.isAdmin ?? true}
      scope={props.scope}
      currentUserId="a1"
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
      onCatalogChanged={props.onCatalogChanged}
    />,
  );
}

describe('Admin Panel — Backup and import (B-1)', () => {
  it('is the last section', async () => {
    renderPanel();
    await screen.findByTestId('settings-backup');
    const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(titles[titles.length - 1]).toBe('Backup and import');
    expect(titles).toContain('App Library');
  });

  it('is absent for a non-admin and from My settings (AC-032)', () => {
    const { unmount } = renderPanel({ isAdmin: false });
    expect(screen.queryByTestId('settings-backup')).toBeNull();
    unmount();
    renderPanel({ scope: 'personal' });
    expect(screen.queryByTestId('settings-backup')).toBeNull();
  });

  it('after an apply, reloads the App Library and Accounts and tells the app', async () => {
    const onCatalogChanged = vi.fn();
    renderPanel({ onCatalogChanged });
    await waitFor(() => expect(listLibrary).toHaveBeenCalledTimes(1));
    expect(listAccounts).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Restore from file…' }));
    fireEvent.click(await screen.findByRole('button', { name: 'applied' }));
    expect(onCatalogChanged).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(listLibrary).toHaveBeenCalledTimes(2));
    expect(listAccounts).toHaveBeenCalledTimes(2);
  });
});
