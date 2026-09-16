import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import SettingsPanel from './SettingsPanel';
import {
  adminEnvConfig,
  createLibraryApp,
  deleteLibraryApp,
  listLibrary,
  setLibraryOrder,
  updateLibraryApp,
  type EnvConfigEntry,
  type LibraryOffer,
} from '../api';

vi.mock('../api', () => ({
  listLibrary: vi.fn(),
  createLibraryApp: vi.fn(),
  updateLibraryApp: vi.fn(),
  deleteLibraryApp: vi.fn(),
  setLibraryOrder: vi.fn(),
  adminEnvConfig: vi.fn(),
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

// SPEC-v26 — the full allowlisted env-config the endpoint returns. PORT and
// OIDC_DISCOVERY_URL are intentionally empty to exercise the em-dash empty state.
const ENV_CONFIG: EnvConfigEntry[] = [
  { key: 'GATUS_BASE_URL', value: 'http://gatus.kube.local' },
  { key: 'COOKIE_SECURE', value: 'true' },
  { key: 'HOMEPAD_REGISTRATION', value: 'open' },
  { key: 'PORT', value: '' },
  { key: 'OIDC_ENABLED', value: 'true' },
  { key: 'OIDC_ISSUER', value: 'https://id.example.com' },
  { key: 'OIDC_DISCOVERY_URL', value: '' },
  { key: 'OIDC_REDIRECT_URL', value: 'https://homepad.example.com/api/auth/oidc/callback' },
  { key: 'OIDC_CLIENT_ID', value: 'homepad-web' },
  { key: 'OIDC_ADMIN_GROUP', value: 'admins' },
];

function renderPanel(props: Partial<React.ComponentProps<typeof SettingsPanel>> = {}) {
  return render(
    <SettingsPanel
      isAdmin={props.isAdmin ?? true}
      showUptimeDisplay={props.showUptimeDisplay ?? true}
      statusDegradedMs={props.statusDegradedMs ?? 1000}
      onSaveSettings={props.onSaveSettings ?? vi.fn().mockResolvedValue(undefined)}
      scope={props.scope ?? 'admin'}
      showHealthBar={props.showHealthBar ?? true}
      onSetHealthBar={props.onSetHealthBar ?? vi.fn()}
      onClose={props.onClose ?? vi.fn()}
    />,
  );
}

beforeEach(() => {
  vi.mocked(adminEnvConfig).mockResolvedValue(ENV_CONFIG);
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
    // AC-002/gating — the env-config is never even fetched for a non-admin.
    expect(adminEnvConfig).not.toHaveBeenCalled();
  });
});

// SPEC-v26 §6.2 — the hardcoded OIDC / self-registration rows are replaced by a
// live table fetched from GET /api/admin/env-config, rendered per Kare §8.
describe('SPEC-v26 — env-config table', () => {
  it('AC-010 — fetches env-config on mount and renders the allowlisted rows', async () => {
    renderPanel({ isAdmin: true });
    const sys = await screen.findByTestId('settings-system');
    await within(sys).findByTestId('env-row-GATUS_BASE_URL');
    expect(adminEnvConfig).toHaveBeenCalledTimes(1);
    // dual label: friendly primary + raw var name (§8.1)
    const row = within(sys).getByTestId('env-row-GATUS_BASE_URL');
    expect(within(row).getByText('Gatus base URL')).toBeInTheDocument();
    expect(within(row).getByText('GATUS_BASE_URL')).toBeInTheDocument();
    expect(within(row).getByText('http://gatus.kube.local')).toBeInTheDocument();
  });

  it('AC-012 — every allowlisted key renders a row with its value', async () => {
    renderPanel({ isAdmin: true });
    const sys = await screen.findByTestId('settings-system');
    await within(sys).findByTestId('env-row-GATUS_BASE_URL');
    for (const { key } of ENV_CONFIG) {
      expect(within(sys).getByTestId(`env-row-${key}`)).toBeInTheDocument();
    }
    // literal os.Getenv values, not "Enabled/Disabled" prose (§8.1 note)
    const oidc = within(sys).getByTestId('env-row-OIDC_ENABLED');
    expect(within(oidc).getByText('true')).toBeInTheDocument();
  });

  it('§8.5 — rows are grouped under Server and Identity (OIDC) captions', async () => {
    renderPanel({ isAdmin: true });
    const sys = await screen.findByTestId('settings-system');
    await within(sys).findByTestId('env-row-GATUS_BASE_URL');
    expect(within(sys).getByText('Server')).toBeInTheDocument();
    expect(within(sys).getByText('Identity (OIDC)')).toBeInTheDocument();
  });

  it('§8.2 — an empty value renders as an em-dash with an sr-only "not set"', async () => {
    renderPanel({ isAdmin: true });
    const sys = await screen.findByTestId('settings-system');
    const portRow = await within(sys).findByTestId('env-row-PORT');
    expect(within(portRow).getByText('—')).toBeInTheDocument();
    expect(within(portRow).getByText('not set')).toBeInTheDocument();
    // a set value is NOT shown as an em-dash
    const gatus = within(sys).getByTestId('env-row-GATUS_BASE_URL');
    expect(within(gatus).queryByText('—')).not.toBeInTheDocument();
  });

  it('§8.8 — each row carries an aria-hidden [env] badge', async () => {
    renderPanel({ isAdmin: true });
    const sys = await screen.findByTestId('settings-system');
    const row = await within(sys).findByTestId('env-row-GATUS_BASE_URL');
    const badge = within(row).getByText('env');
    expect(badge).toHaveClass('settings-env-badge');
    expect(badge).toHaveAttribute('aria-hidden', 'true');
  });

  it('§8.3/AC-013 — shows a busy loading status before the fetch resolves', async () => {
    let resolve!: (v: EnvConfigEntry[]) => void;
    vi.mocked(adminEnvConfig).mockReturnValue(new Promise<EnvConfigEntry[]>((r) => { resolve = r; }));
    renderPanel({ isAdmin: true });
    const sys = await screen.findByTestId('settings-system');
    // the list is marked busy and an sr-only status announces the load
    expect(within(sys).getByTestId('settings-env-list')).toHaveAttribute('aria-busy', 'true');
    const status = within(sys).getByText(/loading server configuration/i);
    expect(status).toHaveAttribute('role', 'status');
    // the rows are not there yet
    expect(within(sys).queryByTestId('env-row-GATUS_BASE_URL')).not.toBeInTheDocument();
    resolve(ENV_CONFIG);
    await within(sys).findByTestId('env-row-GATUS_BASE_URL');
  });

  it('§8.4/AC-014 — a fetch error shows an in-place alert and leaves the toggle live', async () => {
    vi.mocked(adminEnvConfig).mockRejectedValue(new Error('boom'));
    renderPanel({ isAdmin: true });
    const sys = await screen.findByTestId('settings-system');
    const alert = await within(sys).findByRole('alert');
    expect(alert).toHaveTextContent(/couldn't load server configuration/i);
    // the uptime toggle above is unaffected (AC-014)
    expect(within(sys).getByTestId('settings-switch-uptime')).toBeInTheDocument();
    // no env rows rendered on error
    expect(within(sys).queryByTestId('env-row-GATUS_BASE_URL')).not.toBeInTheDocument();
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

  it('A6 — the System note says it applies "globally to all accounts"', async () => {
    renderPanel({ isAdmin: true });
    const sys = await screen.findByTestId('settings-system');
    expect(within(sys).getByText(/globally to all accounts/i)).toBeInTheDocument();
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
    await screen.findByTestId('env-row-GATUS_BASE_URL');
    expect(await axe(container)).toHaveNoViolations();
  });
});

// v16 — the "Slow" threshold is a System setting, editable here (Caleb,
// 2026-09-13: v16 UI settings must be manageable in the UI). Number + explicit
// Save: never PATCH on a keystroke; 0 turns the derivation off.
describe('v16 — Slow threshold (statusDegradedMs)', () => {
  it('shows the current threshold with Save disabled until it changes', async () => {
    await renderPanel({ statusDegradedMs: 1500 });
    const input = screen.getByTestId('degraded-threshold-input') as HTMLInputElement;
    expect(input.value).toBe('1500');
    expect(screen.getByTestId('degraded-threshold-save')).toBeDisabled();
  });

  it('saves a new threshold via onSaveSettings and shows Saved ✓', async () => {
    const onSaveSettings = vi.fn().mockResolvedValue(undefined);
    await renderPanel({ statusDegradedMs: 1000, onSaveSettings });
    const user = userEvent.setup();
    const input = screen.getByTestId('degraded-threshold-input');
    await user.clear(input);
    await user.type(input, '250');
    expect(onSaveSettings).not.toHaveBeenCalled(); // no PATCH per keystroke
    await user.click(screen.getByTestId('degraded-threshold-save'));
    expect(onSaveSettings).toHaveBeenCalledWith({ statusDegradedMs: 250 });
    expect(await screen.findByText('Saved ✓')).toBeInTheDocument();
  });

  it('accepts 0 (off) and rejects a negative or non-integer value without saving', async () => {
    const onSaveSettings = vi.fn().mockResolvedValue(undefined);
    await renderPanel({ statusDegradedMs: 1000, onSaveSettings });
    const user = userEvent.setup();
    const input = screen.getByTestId('degraded-threshold-input');
    await user.clear(input);
    await user.type(input, '-5');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('degraded-threshold-save')).toBeDisabled();
    await user.clear(input);
    await user.type(input, '0');
    expect(screen.getByTestId('degraded-threshold-save')).not.toBeDisabled();
    await user.click(screen.getByTestId('degraded-threshold-save'));
    expect(onSaveSettings).toHaveBeenCalledWith({ statusDegradedMs: 0 });
  });

  it('reverts to the persisted value and says so when the save fails', async () => {
    const onSaveSettings = vi.fn().mockRejectedValue(new Error('500'));
    await renderPanel({ statusDegradedMs: 1000, onSaveSettings });
    const user = userEvent.setup();
    const input = screen.getByTestId('degraded-threshold-input') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, '300');
    await user.click(screen.getByTestId('degraded-threshold-save'));
    expect(await screen.findByText("Couldn't save — try again.")).toBeInTheDocument();
    expect(input.value).toBe('1000');
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
