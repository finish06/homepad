import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import SettingsPanel from './SettingsPanel';
import { adminServerSettings } from './serverSettingsApi';
import {
  createLibraryApp,
  deleteLibraryApp,
  listLibrary,
  setLibraryOrder,
  updateLibraryApp,
  type LibraryOffer,
} from '../api';

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

expect.extend(toHaveNoViolations);

const OFFERS: LibraryOffer[] = [
  {
    id: 'L1', name: 'Jellyfin', url: 'https://jf.x', icon: '', description: 'Media',
    suggestedCategory: 'Media', sortIndex: 0, added: false,
  },
  {
    id: 'L2', name: 'Gitea', url: 'https://gitea.x', icon: '', description: 'Git',
    suggestedCategory: 'Dev', sortIndex: 1, added: false,
  },
];

function renderPanel(props: Partial<React.ComponentProps<typeof SettingsPanel>> = {}) {
  return render(
    <SettingsPanel
      isAdmin={props.isAdmin ?? true}
      showUptimeDisplay={props.showUptimeDisplay ?? true}
      onSaveSettings={props.onSaveSettings ?? vi.fn().mockResolvedValue(undefined)}
      scope={props.scope ?? 'admin'}
      showHealthBar={props.showHealthBar ?? true}
      showUptimeDisplayPref={props.showUptimeDisplayPref ?? true}
      onSetUptimeDisplay={props.onSetUptimeDisplay ?? vi.fn()}
      onSetHealthBar={props.onSetHealthBar ?? vi.fn()}
      density="compact"
      onSetDensity={vi.fn()}
      onClose={props.onClose ?? vi.fn()}
    />,
  );
}

beforeEach(() => {
  vi.mocked(listLibrary).mockResolvedValue(OFFERS);
  vi.mocked(createLibraryApp).mockResolvedValue({
    ok: true, status: 201,
    offer: { id: 'L3', name: 'Plex', url: 'https://plex.x', icon: '', description: '', suggestedCategory: '', sortIndex: 2, added: false },
  });
  vi.mocked(updateLibraryApp).mockResolvedValue({ ok: true, status: 200, offer: { ...OFFERS[0], name: 'JF' } });
  vi.mocked(deleteLibraryApp).mockResolvedValue(true);
  vi.mocked(setLibraryOrder).mockResolvedValue(true);
});

afterEach(() => vi.clearAllMocks());

describe('A17 — admin-only visibility', () => {
  it('an admin sees both the library management and system settings sections', async () => {
    renderPanel({ isAdmin: true });
    expect(await screen.findByTestId('settings-library')).toBeInTheDocument();
    expect(screen.getByTestId('settings-system')).toBeInTheDocument();
  });

  it('a non-admin sees neither admin section', async () => {
    renderPanel({ isAdmin: false });
    // The personal area still renders; the admin sections must not.
    await waitFor(() => expect(listLibrary).not.toHaveBeenCalled());
    expect(screen.queryByTestId('settings-library')).not.toBeInTheDocument();
    expect(screen.queryByTestId('settings-system')).not.toBeInTheDocument();
    // The server settings are never even fetched for a non-admin.
    expect(adminServerSettings).not.toHaveBeenCalled();
  });
});

describe('A17 — library management', () => {
  it('lists the curated offers', async () => {
    renderPanel({ isAdmin: true });
    await screen.findByTestId('settings-library');
    const rows = screen.getAllByTestId('library-manage-row');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('Jellyfin')).toBeInTheDocument();
  });

  it('creates a new offer from the add-offer modal', async () => {
    renderPanel({ isAdmin: true });
    await screen.findByTestId('settings-library');
    await userEvent.click(screen.getByTestId('library-add-open'));
    await userEvent.type(screen.getByTestId('library-new-name'), 'Plex');
    await userEvent.type(screen.getByTestId('library-new-url'), 'https://plex.x');
    await userEvent.click(screen.getByTestId('library-new-submit'));
    await waitFor(() =>
      expect(createLibraryApp).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Plex', url: 'https://plex.x' }),
      ),
    );
  });

  it('deleting an offer confirms that existing copies are kept (C1/OQ5)', async () => {
    renderPanel({ isAdmin: true });
    await screen.findByTestId('settings-library');
    await userEvent.click(screen.getByTestId('library-delete-L1'));
    // The confirm states copies survive before anything is deleted.
    expect(screen.getByTestId('library-delete-confirm')).toHaveTextContent(
      /existing users keep their copies/i,
    );
    await userEvent.click(screen.getByTestId('library-delete-confirm-yes'));
    await waitFor(() => expect(deleteLibraryApp).toHaveBeenCalledWith('L1'));
  });

  it('reorders an offer down via the move control', async () => {
    renderPanel({ isAdmin: true });
    await screen.findByTestId('settings-library');
    await userEvent.click(screen.getByTestId('library-move-down-L1'));
    await waitFor(() => expect(setLibraryOrder).toHaveBeenCalledWith(['L2', 'L1']));
  });

  // #92 (Walt 2026-06-19 live UI review) — the "Add offer" creation form was a
  // cramped inline flex-row at the top of the scrollable Admin Panel. It now
  // lives behind an "Add offer" trigger that opens its own roomy modal surface.
  it('#92 — the add-offer fields are not inline; a trigger button opens them', async () => {
    renderPanel({ isAdmin: true });
    await screen.findByTestId('settings-library');
    // The form fields must NOT be on the panel until the modal is opened.
    expect(screen.queryByTestId('library-new-name')).not.toBeInTheDocument();
    expect(screen.getByTestId('library-add-open')).toBeInTheDocument();
  });

  it('#92 — the trigger opens a dedicated modal dialog holding the create form', async () => {
    renderPanel({ isAdmin: true });
    await screen.findByTestId('settings-library');
    await userEvent.click(screen.getByTestId('library-add-open'));
    const dialog = await screen.findByTestId('add-offer-overlay');
    expect(within(dialog).getByRole('dialog')).toBeInTheDocument();
    expect(within(dialog).getByTestId('library-new-name')).toBeInTheDocument();
    expect(within(dialog).getByTestId('library-new-url')).toBeInTheDocument();
    expect(within(dialog).getByTestId('library-new-category')).toBeInTheDocument();
  });

  it('#92 — the add-offer modal closes after a successful create', async () => {
    renderPanel({ isAdmin: true });
    await screen.findByTestId('settings-library');
    await userEvent.click(screen.getByTestId('library-add-open'));
    await userEvent.type(screen.getByTestId('library-new-name'), 'Plex');
    await userEvent.type(screen.getByTestId('library-new-url'), 'https://plex.x');
    await userEvent.click(screen.getByTestId('library-new-submit'));
    await waitFor(() => expect(screen.queryByTestId('add-offer-overlay')).not.toBeInTheDocument());
  });

  it('#92 — Cancel closes the modal without creating an offer', async () => {
    renderPanel({ isAdmin: true });
    await screen.findByTestId('settings-library');
    await userEvent.click(screen.getByTestId('library-add-open'));
    await userEvent.click(screen.getByTestId('library-new-cancel'));
    expect(screen.queryByTestId('add-offer-overlay')).not.toBeInTheDocument();
    expect(createLibraryApp).not.toHaveBeenCalled();
  });

  it('edits an offer (PATCH) from the row edit control', async () => {
    renderPanel({ isAdmin: true });
    await screen.findByTestId('settings-library');
    await userEvent.click(screen.getByTestId('library-edit-L1'));
    const nameField = screen.getByTestId('library-edit-name-L1');
    await userEvent.clear(nameField);
    await userEvent.type(nameField, 'JF');
    await userEvent.click(screen.getByTestId('library-edit-save-L1'));
    await waitFor(() =>
      expect(updateLibraryApp).toHaveBeenCalledWith('L1', expect.objectContaining({ name: 'JF' })),
    );
  });
});

// v11 §4.2 A4 — the modal title is "Admin Panel" (not "Settings"), with a
// global-scope subtitle and a matching dialog aria-label.
describe('v11 A4 — Admin Panel title + scope subtitle', () => {
  it('titles the panel "Admin Panel" and not "Settings"', async () => {
    renderPanel({ isAdmin: true });
    await screen.findByTestId('settings-library');
    expect(screen.getByRole('heading', { name: 'Admin Panel' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Settings' })).not.toBeInTheDocument();
  });

  it('the dialog aria-label is "Admin Panel"', async () => {
    renderPanel({ isAdmin: true });
    expect(await screen.findByTestId('settings-panel')).toHaveAttribute('aria-label', 'Admin Panel');
  });

  it('shows a subtitle saying changes are global / affect all users', async () => {
    renderPanel({ isAdmin: true });
    const panel = await screen.findByTestId('settings-panel');
    expect(within(panel).getByText(/global.*affect all users/i)).toBeInTheDocument();
  });

  // v11 §4.2 A4/A9 (issue #54) — the close button's accessible name must match
  // the renamed dialog ("Admin Panel"), not the stale "Close settings".
  it('A4 — the close button is labelled "Close admin panel", not "Close settings"', async () => {
    renderPanel({ isAdmin: true });
    await screen.findByTestId('settings-panel');
    const close = screen.getByTestId('settings-close');
    expect(close).toHaveAccessibleName('Close admin panel');
    expect(screen.queryByRole('button', { name: 'Close settings' })).not.toBeInTheDocument();
  });
});

// v11 §4.3 A5/A6 — section scope notes spell out cross-user impact.
describe('v11 A5/A6 — section scope notes', () => {
  it('A5 — the App Library note names "all users" and "personal dashboards"', async () => {
    renderPanel({ isAdmin: true });
    const lib = await screen.findByTestId('settings-library');
    expect(within(lib).getByText(/all users/i)).toBeInTheDocument();
    expect(within(lib).getByText(/personal dashboards/i)).toBeInTheDocument();
  });

  // SPEC-admin-server-settings AC-032 replaced the A6 note: it still says the
  // section applies to everyone, and no longer says "set via environment".
  it('A6 / AC-032 — the System note says it applies to everyone', async () => {
    renderPanel({ isAdmin: true });
    const sys = await screen.findByTestId('settings-system');
    const note = sys.querySelector('.settings-section-note')!;
    expect(note.textContent).toMatch(/apply to everyone/i);
    expect(note.textContent).not.toMatch(/environment variables and redeploy/i);
  });
});

describe('A17/A19 — a11y + dismissal', () => {
  it('Escape closes the panel', async () => {
    const onClose = vi.fn();
    renderPanel({ isAdmin: true, onClose });
    await screen.findByTestId('settings-library');
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('has no axe violations (admin, populated)', async () => {
    const { container } = renderPanel({ isAdmin: true });
    await screen.findByTestId('settings-library');
    await screen.findByTestId('settings-switch-uptime');
    expect(await axe(container)).toHaveNoViolations();
  });
});

// cap6 AC-029 (#295) — the admin "Show uptime display" switch reverts on a failed
// save. §9.2 specified this from the start and the code implements it
// (UptimeToggleRow: `setOptimistic(value)` in the catch), but it had no AC row and
// no test: the 'reverts to the persisted value' test in the Slow-threshold block
// belongs to that row, not this switch. Mirrors it, for the switch.
describe('cap6 AC-029 — the uptime switch reverts when its save fails', () => {
  it('snaps back to the persisted state and says so', async () => {
    const onSaveSettings = vi.fn().mockRejectedValue(new Error('500'));
    await renderPanel({ showUptimeDisplay: true, onSaveSettings });
    const user = userEvent.setup();
    const sw = screen.getByRole('switch', { name: /uptime/i });
    expect(sw).toHaveAttribute('aria-checked', 'true');

    await user.click(sw);

    expect(onSaveSettings).toHaveBeenCalledWith({ showUptimeDisplay: false });
    expect(await screen.findByText("Couldn't save — try again.")).toBeInTheDocument();
    // The optimistic thumb must not be left showing a state the server rejected.
    expect(sw).toHaveAttribute('aria-checked', 'true');
  });

  it('stays at the new state when the save succeeds — the revert is not unconditional', async () => {
    // Without this, a switch that ALWAYS snapped back would pass the test above.
    const onSaveSettings = vi.fn().mockResolvedValue(undefined);
    await renderPanel({ showUptimeDisplay: true, onSaveSettings });
    const user = userEvent.setup();
    const sw = screen.getByRole('switch', { name: /uptime/i });

    await user.click(sw);

    expect(await screen.findByText('Saved ✓')).toBeInTheDocument();
    expect(sw).toHaveAttribute('aria-checked', 'false');
  });
});

// ── SPEC-health-bar-visibility-toggle — personal scope + the toggle ─────────
//
// OQ-1 (a): the panel takes a `scope`. `personal` is reachable by every role
// via UserMenu → My Dashboard → My settings and shows ONLY per-user settings.
// `admin` is unchanged, so the v12 §4.1 boundary holds.
describe('SPEC-health-bar-visibility-toggle — personal scope', () => {
  it('AC-007 — a NON-ADMIN gets the toggle in personal scope', async () => {
    renderPanel({ scope: 'personal', isAdmin: false });
    expect(await screen.findByTestId('setting-health-bar')).toBeInTheDocument();
  });

  it('AC-002 — the control is a boolean whose ON state means visible', async () => {
    renderPanel({ scope: 'personal', isAdmin: false, showHealthBar: true });
    const toggle = await screen.findByTestId('setting-health-bar');
    expect(toggle).toHaveAttribute('role', 'switch');
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(toggle).toHaveAccessibleName(/status bar/i);
  });

  it('AC-002 — reflects a stored false', async () => {
    renderPanel({ scope: 'personal', isAdmin: false, showHealthBar: false });
    expect(await screen.findByTestId('setting-health-bar')).toHaveAttribute('aria-checked', 'false');
  });

  it('AC-002 — toggling asks the owner to persist the inverse', async () => {
    const onSetHealthBar = vi.fn();
    renderPanel({ scope: 'personal', isAdmin: false, showHealthBar: true, onSetHealthBar });
    await userEvent.click(await screen.findByTestId('setting-health-bar'));
    expect(onSetHealthBar).toHaveBeenCalledWith(false);
  });

  it('personal scope shows NO admin sections, even for an admin', async () => {
    renderPanel({ scope: 'personal', isAdmin: true });
    expect(await screen.findByTestId('setting-health-bar')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-system')).toBeNull();
    expect(screen.queryByTestId('settings-library')).toBeNull();
  });

  it('admin scope is unchanged — no personal section leaks into it', async () => {
    renderPanel({ scope: 'admin', isAdmin: true });
    expect(await screen.findByTestId('settings-system')).toBeInTheDocument();
    expect(screen.queryByTestId('setting-health-bar')).toBeNull();
  });

  it('the dialog names itself for the scope it is in', async () => {
    const { unmount } = renderPanel({ scope: 'personal', isAdmin: false });
    expect(await screen.findByTestId('settings-panel')).toHaveAttribute('aria-label', 'My settings');
    unmount();
    renderPanel({ scope: 'admin', isAdmin: true });
    expect(await screen.findByTestId('settings-panel')).toHaveAttribute('aria-label', 'Admin Panel');
  });

  it('AC-014 — the control is a ≥44px target and has no a11y violations', async () => {
    const { container } = renderPanel({ scope: 'personal', isAdmin: false });
    const toggle = await screen.findByTestId('setting-health-bar');
    // The house rule from v19: interactive controls clear 44×44px. jsdom has no
    // layout, so assert the declared minimum the stylesheet is built around.
    expect(toggle.className).toMatch(/settings-switch/);
    expect(await axe(container)).toHaveNoViolations();
  });
});

// ── cap6 v2 — the uptime display becomes a per-user preference ──────────────
describe('cap6 v2 — per-user uptime display', () => {
  it('AC-017 — the control sits in My settings, beside the status-bar toggle', async () => {
    renderPanel({ scope: 'personal', isAdmin: false });
    const toggle = await screen.findByTestId('setting-uptime-display');
    expect(toggle).toHaveAttribute('role', 'switch');
    expect(toggle).toHaveAccessibleName(/uptime display/i);
    expect(screen.getByTestId('setting-health-bar')).toBeInTheDocument();
  });

  // SPEC-decisions-18.4.0 AC-009 (#488) — the row says what it shows at each
  // tile density: the dots everywhere, the 24h/7d/30d line only at Large.
  it('AC-009 (#488) — a hint ties the uptime display to tile density', async () => {
    renderPanel({ scope: 'personal', isAdmin: false });
    const toggle = await screen.findByTestId('setting-uptime-display');
    expect(toggle).toHaveAccessibleDescription(
      'Recent checks on monitored tiles. Large also shows 24h, 7d and 30d uptime.',
    );
  });

  it('AC-016 — reflects the account value and asks for the inverse', async () => {
    const onSetUptimeDisplay = vi.fn();
    renderPanel({
      scope: 'personal', isAdmin: false,
      showUptimeDisplayPref: false, onSetUptimeDisplay,
    });
    const toggle = await screen.findByTestId('setting-uptime-display');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(toggle);
    expect(onSetUptimeDisplay).toHaveBeenCalledWith(true);
  });

  it('AC-028/AC-028a — the ADMIN row is relabelled as a default and explains itself', async () => {
    renderPanel({ scope: 'admin', isAdmin: true });
    const label = await screen.findByText(/new accounts/i);
    expect(label).toBeInTheDocument();
    // The row must say WHY toggling it appears to do nothing, or an admin
    // concludes it is broken. The label alone is not enough (AC-028a).
    expect(
      screen.getByText(/applies to accounts created after this change/i),
    ).toBeInTheDocument();
  });

  it('the per-user control does NOT leak into the admin scope', async () => {
    renderPanel({ scope: 'admin', isAdmin: true });
    expect(await screen.findByTestId('settings-system')).toBeInTheDocument();
    expect(screen.queryByTestId('setting-uptime-display')).toBeNull();
  });
});
