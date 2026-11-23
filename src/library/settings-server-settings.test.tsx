import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import SystemSettings from './SystemSettings';
import SettingsPanel from './SettingsPanel';
import { authConfig, listLibrary } from '../api';
import {
  adminServerSettings,
  oidcTestStatus,
  resetServerSetting,
  saveServerSettings,
  startOidcTest,
  type ServerSettings,
  type SettingsResult,
} from './serverSettingsApi';
import { savedInUi, settingsBody } from '../test/serverSettingsFixture';

// SPEC-admin-server-settings AC-032…AC-035 (and the UI side of AC-025…AC-027,
// AC-036) — Admin Panel → System with the API mocked. One describe per AC; the
// UX section each case checks is named in it.

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

expect.extend(toHaveNoViolations);

const ok = (body: ServerSettings): SettingsResult => ({ ok: true, body });
const fail = (status: number, error: string, extra: Record<string, unknown> = {}): SettingsResult => ({
  ok: false,
  failure: { status, error, warnings: [], ...extra },
});

function renderSystem(body: ServerSettings = settingsBody(), props: Partial<React.ComponentProps<typeof SystemSettings>> = {}) {
  vi.mocked(adminServerSettings).mockResolvedValue(body);
  const onSaveSettings = props.onSaveSettings ?? vi.fn().mockResolvedValue(undefined);
  const utils = render(
    <SystemSettings showUptimeDisplay onSaveSettings={onSaveSettings} onChanged={props.onChanged} onSigninDirty={props.onSigninDirty} />,
  );
  return { ...utils, onSaveSettings };
}

const row = (key: string) => screen.findByTestId(`setting-row-${key}`);
const badge = (r: HTMLElement) => r.querySelector('.settings-src-badge') as HTMLElement | null;

beforeEach(() => {
  vi.mocked(listLibrary).mockResolvedValue([]);
});
afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

// ── AC-032 ──────────────────────────────────────────────────────────────────
describe('AC-032 — every setting, one shared row, four groups', () => {
  it('renders Server, Status, Accounts, Sign-in in that order with every key', async () => {
    renderSystem();
    await row('GATUS_BASE_URL');
    const captions = screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent);
    expect(captions).toEqual(['Server', 'Status', 'Accounts', 'Sign-in']);
    for (const s of settingsBody().settings) {
      expect(screen.getByTestId(`setting-row-${s.key}`)).toHaveClass('settings-setting');
    }
    // The uptime toggle joins Status, through the same row.
    expect(within(screen.getByTestId('settings-group-status')).getByTestId('setting-row-showUptimeDisplay')).toHaveClass(
      'settings-setting',
    );
  });

  it('shows labels in plain words with the env name as the mono sub-label', async () => {
    renderSystem();
    const r = await row('GATUS_BASE_URL');
    expect(within(r).getByText('Gatus address')).toBeInTheDocument();
    expect(within(r).getByText('GATUS_BASE_URL').tagName).toBe('CODE');
    const sso = await row('OIDC_ENABLED');
    expect(within(sso).getByText('Single sign-on')).toBeInTheDocument();
    expect(screen.queryByText(/OIDC sign-in/)).not.toBeInTheDocument();
  });

  it('the old Environment Configuration list and its note are gone', async () => {
    renderSystem();
    await row('GATUS_BASE_URL');
    expect(screen.queryByTestId('settings-env-list')).not.toBeInTheDocument();
    expect(screen.queryByText(/redeploy/i)).not.toBeInTheDocument();
    expect(screen.getByText(/A value saved here wins over the server's environment/)).toBeInTheDocument();
  });

  it('a key this build does not know still shows, under its own name', async () => {
    const b = settingsBody();
    b.settings.push({ key: 'NEW_THING', group: 'server', value: 'x', source: 'env', editable: true, applies: 'live' });
    renderSystem(b);
    const r = await row('NEW_THING');
    expect(within(r).getAllByText('NEW_THING').length).toBeGreaterThan(0);
  });

  it('has no axe violations, populated', async () => {
    const { container } = renderSystem(savedInUi('GATUS_BASE_URL', 'https://status.example.com'));
    await row('GATUS_BASE_URL');
    expect(await axe(container)).toHaveNoViolations();
  });
});

// ── AC-033 ──────────────────────────────────────────────────────────────────
describe('AC-033 — source badges and Reset', () => {
  it('each row shows UI, env or default as text with an accessible name', async () => {
    renderSystem(savedInUi('GATUS_BASE_URL', 'https://status.example.com'));
    const ui = await row('GATUS_BASE_URL');
    expect(badge(ui)).toHaveTextContent('UI');
    expect(within(ui).getByText('Set in the UI')).toHaveClass('sr-only');
    expect(badge(await row('COOKIE_SECURE'))).toHaveTextContent('From the environment');
    expect(badge(await row('PORT'))).toHaveTextContent('Default');
  });

  it('Reset shows only on UI rows, names where it goes, and the "Saved by" line is only there (A-6)', async () => {
    renderSystem(savedInUi('GATUS_BASE_URL', 'https://status.example.com'));
    const ui = await row('GATUS_BASE_URL');
    expect(within(ui).getByRole('button', { name: 'Reset Gatus address to env' })).toHaveTextContent('Reset to env');
    expect(within(ui).getByText('Saved by Caleb, Nov 23')).toBeInTheDocument();
    expect(within(ui).getByText('Env: http://gatus.example.com:8080')).toBeInTheDocument();
    const env = await row('OIDC_ISSUER');
    expect(within(env).queryByRole('button', { name: /Reset/ })).not.toBeInTheDocument();
    expect(within(env).queryByText(/Saved by/)).not.toBeInTheDocument();
  });

  it('with no env value, Reset goes to the default', async () => {
    renderSystem(savedInUi('HOMEPAD_MAX_ACCOUNTS', 5));
    const r = await row('HOMEPAD_MAX_ACCOUNTS');
    expect(within(r).getByRole('button', { name: 'Reset Account limit to default' })).toBeInTheDocument();
  });

  it('a save turns the badge to UI and says so; a reset turns it back', async () => {
    const user = userEvent.setup();
    const saved = savedInUi('GATUS_BASE_URL', 'https://status.example.com');
    vi.mocked(saveServerSettings).mockResolvedValue(ok(saved));
    vi.mocked(resetServerSetting).mockResolvedValue(ok(settingsBody()));
    renderSystem();
    const r = await row('GATUS_BASE_URL');
    expect(badge(r)).toHaveTextContent('env');
    await user.click(within(r).getByRole('button', { name: 'Edit Gatus address' }));
    const field = within(r).getByRole('textbox', { name: 'Gatus address' });
    await user.clear(field);
    await user.type(field, 'https://status.example.com{Enter}');
    expect(saveServerSettings).toHaveBeenCalledWith({ GATUS_BASE_URL: 'https://status.example.com' }, { confirm: [] });
    await waitFor(() => expect(badge(r)).toHaveTextContent('UI'));
    expect(within(r).getByText('Saved ✓')).toBeInTheDocument();
    expect(within(r).getByText('Saved. Now set in the UI.')).toBeInTheDocument();

    // TC-001 — Reset → "Reset to env: http://…?" → Reset.
    await user.click(within(r).getByRole('button', { name: 'Reset Gatus address to env' }));
    expect(within(r).getByText('Reset to env: http://gatus.example.com:8080?')).toBeInTheDocument();
    await user.click(within(r).getByRole('button', { name: 'Reset' }));
    expect(resetServerSetting).toHaveBeenCalledWith('GATUS_BASE_URL', { confirm: [] });
    await waitFor(() => expect(badge(r)).toHaveTextContent('env'));
    expect(within(r).getByText('Reset ✓')).toBeInTheDocument();
    expect(within(r).getByText('Reset. Now from the environment.')).toBeInTheDocument();
  });

  it('Cancel on the reset question sends nothing', async () => {
    const user = userEvent.setup();
    renderSystem(savedInUi('GATUS_BASE_URL', 'https://status.example.com'));
    const r = await row('GATUS_BASE_URL');
    await user.click(within(r).getByRole('button', { name: 'Reset Gatus address to env' }));
    await user.click(within(r).getByRole('button', { name: 'Cancel' }));
    expect(resetServerSetting).not.toHaveBeenCalled();
    expect(within(r).queryByText(/\?$/)).not.toBeInTheDocument();
  });

  it('a refused reset says why and keeps the UI value', async () => {
    const user = userEvent.setup();
    vi.mocked(resetServerSetting).mockResolvedValue(fail(500, 'unknown'));
    renderSystem(savedInUi('HOMEPAD_MAX_ACCOUNTS', 5));
    const r = await row('HOMEPAD_MAX_ACCOUNTS');
    await user.click(within(r).getByRole('button', { name: /Reset Account limit/ }));
    expect(within(r).getByText('Reset to default: No limit?')).toBeInTheDocument();
    await user.click(within(r).getByRole('button', { name: 'Reset' }));
    expect(await within(r).findByRole('alert')).toHaveTextContent("Couldn't save. Try again.");
    expect(badge(r)).toHaveTextContent('UI');
  });
});

// ── AC-034 ──────────────────────────────────────────────────────────────────
describe('AC-034 — row states', () => {
  it('loading: busy list, skeleton rows, an sr-only status; the uptime switch stays live', async () => {
    let resolve!: (b: ServerSettings) => void;
    vi.mocked(adminServerSettings).mockReturnValue(new Promise((r) => (resolve = r)));
    render(<SystemSettings showUptimeDisplay onSaveSettings={vi.fn()} />);
    expect(screen.getByTestId('server-settings-list')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Loading server settings…')).toHaveClass('sr-only');
    expect(document.querySelectorAll('.settings-kv-skeleton').length).toBe(12);
    expect(screen.getByTestId('settings-switch-uptime')).toBeEnabled();
    await act(async () => resolve(settingsBody()));
    expect(screen.getByTestId('server-settings-list')).toHaveAttribute('aria-busy', 'false');
    expect(document.querySelectorAll('.settings-kv-skeleton').length).toBe(0);
  });

  it('load failed: the in-place error; the uptime switch still works', async () => {
    vi.mocked(adminServerSettings).mockRejectedValue(new Error('boom'));
    render(<SystemSettings showUptimeDisplay onSaveSettings={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load server settings.");
    expect(screen.getByText('Reload the page to try again.')).toBeInTheDocument();
    expect(screen.getByTestId('settings-switch-uptime')).toBeEnabled();
    expect(screen.queryByTestId('setting-row-GATUS_BASE_URL')).not.toBeInTheDocument();
  });

  it('editing: Edit focuses the field, shows the help line, Save is off until it changes; Esc cancels back to Edit', async () => {
    const user = userEvent.setup();
    renderSystem();
    const r = await row('GATUS_BASE_URL');
    const edit = within(r).getByRole('button', { name: 'Edit Gatus address' });
    await user.click(edit);
    const field = within(r).getByRole('textbox', { name: 'Gatus address' });
    expect(field).toHaveFocus();
    expect(field).toHaveValue('http://gatus.example.com:8080');
    expect(within(r).getByText('The address of your Gatus server. Leave empty to turn status off.')).toBeInTheDocument();
    expect(within(r).getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(within(r).queryByRole('textbox')).not.toBeInTheDocument();
    expect(within(r).getByRole('button', { name: 'Edit Gatus address' })).toHaveFocus();
    expect(saveServerSettings).not.toHaveBeenCalled();
  });

  it('Cancel also returns focus to Edit', async () => {
    const user = userEvent.setup();
    renderSystem();
    const r = await row('OIDC_ISSUER');
    await user.click(within(r).getByRole('button', { name: 'Edit Issuer' }));
    await user.click(within(r).getByRole('button', { name: 'Cancel' }));
    expect(within(r).getByRole('button', { name: 'Edit Issuer' })).toHaveFocus();
  });

  it.each([
    ['-3', 'Enter a whole number from 0 to 10000.'],
    ['lots', 'Enter a whole number from 0 to 10000.'],
    ['10001', 'Enter a whole number from 0 to 10000.'],
  ])('invalid (client): account limit %s shows the line, and Save is off (TC-002)', async (typed, line) => {
    const user = userEvent.setup();
    renderSystem();
    const r = await row('HOMEPAD_MAX_ACCOUNTS');
    await user.click(within(r).getByRole('button', { name: 'Edit Account limit' }));
    const field = within(r).getByRole('textbox', { name: 'Account limit' });
    await user.clear(field);
    await user.type(field, typed);
    expect(within(r).getByText(line)).toBeInTheDocument();
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(within(r).getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.keyboard('{Enter}');
    expect(saveServerSettings).not.toHaveBeenCalled();
  });

  it.each([
    ['HOMEPAD_TRUSTED_PROXIES', 'Trusted proxies', 'web, 0.0.0.0/0', 'That trusts every address.'],
    ['GATUS_BASE_URL', 'Gatus address', 'gatus', 'Enter an address that starts with http:// or https://.'],
    ['OIDC_REDIRECT_URL', 'Redirect URL', 'https://homepad.example.com/cb', 'The address must end in /api/auth/oidc/callback.'],
    ['OIDC_CLIENT_ID', 'Client ID', 'home pad', "A client ID can't have spaces."],
  ])('invalid (client): %s', async (key, label, typed, line) => {
    const user = userEvent.setup();
    renderSystem();
    const r = await row(key);
    await user.click(within(r).getByRole('button', { name: `Edit ${label}` }));
    const field = within(r).getByRole('textbox', { name: label });
    await user.clear(field);
    await user.type(field, typed);
    expect(within(r).getByText(new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument();
    expect(within(r).getByRole('button', { name: key.startsWith('OIDC') ? 'Done' : 'Save' })).toBeDisabled();
  });

  it('saving: Save reads "Saving…" and the field is off; then the row is back at rest', async () => {
    const user = userEvent.setup();
    let resolve!: (r: SettingsResult) => void;
    vi.mocked(saveServerSettings).mockReturnValue(new Promise((r) => (resolve = r)));
    renderSystem();
    const r = await row('GATUS_DEGRADED_MS');
    await user.click(within(r).getByRole('button', { name: 'Edit "Slow" threshold' }));
    const field = within(r).getByRole('textbox', { name: '"Slow" threshold' });
    await user.clear(field);
    await user.type(field, '2500');
    await user.click(within(r).getByRole('button', { name: 'Save' }));
    expect(within(r).getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(field).toBeDisabled();
    expect(saveServerSettings).toHaveBeenCalledWith({ GATUS_DEGRADED_MS: 2500 }, { confirm: [] });
    await act(async () => resolve(ok(savedInUi('GATUS_DEGRADED_MS', 2500))));
    expect(within(r).getByText('2500 ms')).toBeInTheDocument();
    expect(within(r).getByRole('button', { name: 'Edit "Slow" threshold' })).toHaveFocus();
  });

  it('0 shows as "Off" for the Slow threshold', async () => {
    renderSystem(savedInUi('GATUS_DEGRADED_MS', 0));
    expect(within(await row('GATUS_DEGRADED_MS')).getByText('Off')).toBeInTheDocument();
  });

  it('refused (server): the server message under the field as an alert; the draft stays', async () => {
    const user = userEvent.setup();
    vi.mocked(saveServerSettings).mockResolvedValue(
      fail(400, 'invalid', { key: 'GATUS_BASE_URL', message: 'That address has a query string. Remove it.' }),
    );
    renderSystem();
    const r = await row('GATUS_BASE_URL');
    await user.click(within(r).getByRole('button', { name: 'Edit Gatus address' }));
    const field = within(r).getByRole('textbox', { name: 'Gatus address' });
    await user.clear(field);
    await user.type(field, 'https://status.example.com/?x=1{Enter}');
    expect(await within(r).findByRole('alert')).toHaveTextContent('That address has a query string. Remove it.');
    expect(field).toHaveValue('https://status.example.com/?x=1');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    // Typing again clears the server line.
    await user.type(field, '2');
    expect(within(r).queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    [fail(0, 'network'), "Couldn't reach Homepad. Try again."],
    [fail(401, 'unknown'), 'You were signed out. Reload the page to sign in again.'],
    [fail(409, 'env_only'), 'Server settings come from the environment only right now.'],
    [fail(400, 'read_only'), 'This is set on the server.'],
    [fail(409, 'confirm_required'), 'This change needs a confirm. Try again.'],
  ])('a refusal with no message gets plain words (%#)', async (result, line) => {
    const user = userEvent.setup();
    vi.mocked(saveServerSettings).mockResolvedValue(result);
    renderSystem();
    const lim = await row('HOMEPAD_MAX_ACCOUNTS');
    await user.click(within(lim).getByRole('button', { name: 'Edit Account limit' }));
    const field = within(lim).getByRole('textbox', { name: 'Account limit' });
    await user.clear(field);
    await user.type(field, '9{Enter}');
    expect(await within(lim).findByRole('alert')).toHaveTextContent(line);
  });

  it('has no axe violations while editing with an error', async () => {
    const user = userEvent.setup();
    vi.mocked(saveServerSettings).mockResolvedValue(fail(400, 'invalid', { message: 'No.' }));
    const { container } = renderSystem();
    const r = await row('GATUS_BASE_URL');
    await user.click(within(r).getByRole('button', { name: 'Edit Gatus address' }));
    await user.type(within(r).getByRole('textbox'), '/x{Enter}');
    await within(r).findByRole('alert');
    expect(await axe(container)).toHaveNoViolations();
  });
});

// ── §8 confirm dialogs (UI side of AC-025…AC-027) ──────────────────────────
describe('§8 — confirm dialogs send the confirm codes', () => {
  it('Secure cookies off: the dialog opens before anything is sent; Cancel sends nothing (A-1)', async () => {
    const user = userEvent.setup();
    renderSystem();
    const r = await row('COOKIE_SECURE');
    const sw = within(r).getByRole('switch', { name: 'Secure cookies' });
    expect(sw).toHaveAttribute('aria-checked', 'true');
    await user.click(sw);
    const dialog = screen.getByRole('alertdialog', { name: 'Turn off secure cookies?' });
    expect(saveServerSettings).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(saveServerSettings).not.toHaveBeenCalled();
    expect(sw).toHaveAttribute('aria-checked', 'true');
    expect(sw).toHaveFocus();
  });

  it('Secure cookies on, on an http:// page: leads with "This page is on http://" and sends cookie_secure_on (TC-005)', async () => {
    const user = userEvent.setup();
    const off = settingsBody({ COOKIE_SECURE: { value: false, envValue: false } });
    vi.mocked(saveServerSettings).mockResolvedValue(ok(savedInUi('COOKIE_SECURE', true, off)));
    renderSystem(off);
    const r = await row('COOKIE_SECURE');
    await user.click(within(r).getByRole('switch', { name: 'Secure cookies' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Turn on secure cookies?' });
    expect(dialog).toHaveTextContent(/^Turn on secure cookies\?This page is on http:\/\//);
    expect(dialog).toHaveTextContent('If you get locked out, see "Recovery" in the docs.');
    await user.click(within(dialog).getByRole('button', { name: 'Turn on' }));
    expect(saveServerSettings).toHaveBeenCalledWith({ COOKIE_SECURE: true }, { confirm: ['cookie_secure_on'] });
    await waitFor(() => expect(badge(r)).toHaveTextContent('UI'));
    expect(within(r).getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('Trusted proxies: the server warning with both addresses; Save resends with trusted_proxies', async () => {
    const user = userEvent.setup();
    vi.mocked(saveServerSettings)
      .mockResolvedValueOnce({
        ok: false,
        failure: {
          status: 409,
          error: 'confirm_required',
          warnings: [{ code: 'trusted_proxies', message: 'server words', currentAddress: '192.0.2.10', newAddress: '198.51.100.7' }],
        },
      })
      .mockResolvedValueOnce(ok(savedInUi('HOMEPAD_TRUSTED_PROXIES', 'web')));
    renderSystem();
    const r = await row('HOMEPAD_TRUSTED_PROXIES');
    await user.click(within(r).getByRole('button', { name: 'Edit Trusted proxies' }));
    await user.type(within(r).getByRole('textbox', { name: 'Trusted proxies' }), 'web{Enter}');
    const dialog = await screen.findByRole('alertdialog', { name: 'Save trusted proxies?' });
    expect(dialog).toHaveTextContent('Homepad sees you as 192.0.2.10 now. With this list it would see 198.51.100.7.');
    expect(dialog).toHaveTextContent('A wrong list makes everyone share one sign-in limit');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(saveServerSettings).toHaveBeenLastCalledWith({ HOMEPAD_TRUSTED_PROXIES: 'web' }, { confirm: ['trusted_proxies'] });
    await waitFor(() => expect(badge(r)).toHaveTextContent('UI'));
  });

  it('Cancel on a server confirm keeps the draft open (UX §4 "Needs confirm")', async () => {
    const user = userEvent.setup();
    vi.mocked(saveServerSettings).mockResolvedValue({
      ok: false,
      failure: { status: 409, error: 'confirm_required', warnings: [{ code: 'trusted_proxies' }] },
    });
    renderSystem();
    const r = await row('HOMEPAD_TRUSTED_PROXIES');
    await user.click(within(r).getByRole('button', { name: 'Edit Trusted proxies' }));
    await user.type(within(r).getByRole('textbox'), 'web{Enter}');
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
    expect(within(r).getByRole('textbox')).toHaveValue('web');
    expect(within(r).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('Account limit below the count: the numbers from the server, and "Set limit to 5" (AC-027, TC-003)', async () => {
    const user = userEvent.setup();
    const msg = 'There are 7 accounts and 2 pending invites. Nobody is removed. New accounts and invites are refused until there are fewer than 5.';
    vi.mocked(saveServerSettings)
      .mockResolvedValueOnce({
        ok: false,
        failure: {
          status: 409,
          error: 'confirm_required',
          warnings: [{ code: 'max_accounts_below_count', message: 'server words', accounts: 7, pendingInvites: 2, limit: 5 }],
        },
      })
      .mockResolvedValueOnce(ok(savedInUi('HOMEPAD_MAX_ACCOUNTS', 5)));
    renderSystem();
    const r = await row('HOMEPAD_MAX_ACCOUNTS');
    await user.click(within(r).getByRole('button', { name: 'Edit Account limit' }));
    const field = within(r).getByRole('textbox');
    await user.clear(field);
    await user.type(field, '5{Enter}');
    const dialog = await screen.findByRole('alertdialog', { name: 'Lower the account limit?' });
    expect(dialog).toHaveTextContent(msg);
    await user.click(within(dialog).getByRole('button', { name: 'Set limit to 5' }));
    expect(saveServerSettings).toHaveBeenLastCalledWith({ HOMEPAD_MAX_ACCOUNTS: 5 }, { confirm: ['max_accounts_below_count'] });
  });

  it('Sign-up to Open: a two-option control, then the dialog, then registration_open', async () => {
    const user = userEvent.setup();
    vi.mocked(saveServerSettings).mockResolvedValue(ok(savedInUi('HOMEPAD_REGISTRATION', 'open')));
    const onChanged = vi.fn();
    renderSystem(settingsBody(), { onChanged });
    const r = await row('HOMEPAD_REGISTRATION');
    expect(within(r).getByText('Invite only')).toBeInTheDocument();
    await user.click(within(r).getByRole('button', { name: 'Edit Sign-up' }));
    const group = within(r).getByRole('radiogroup', { name: 'Sign-up' });
    expect(within(group).getByRole('radio', { name: 'Invite only' })).toHaveFocus();
    await user.click(within(group).getByRole('radio', { name: 'Open' }));
    expect(within(group).getByRole('radio', { name: 'Open' })).toHaveAttribute('aria-checked', 'true');
    await user.click(within(r).getByRole('button', { name: 'Save' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Open sign-up?' });
    expect(dialog).toHaveTextContent('including a kid who signs out');
    await user.click(within(dialog).getByRole('button', { name: 'Open sign-up' }));
    expect(saveServerSettings).toHaveBeenCalledWith({ HOMEPAD_REGISTRATION: 'open' }, { confirm: ['registration_open'] });
    await waitFor(() => expect(within(r).getByText('Open')).toBeInTheDocument());
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('Sign-up back to Invite only needs no confirm', async () => {
    const user = userEvent.setup();
    const open = savedInUi('HOMEPAD_REGISTRATION', 'open');
    vi.mocked(saveServerSettings).mockResolvedValue(ok(settingsBody()));
    renderSystem(open);
    const r = await row('HOMEPAD_REGISTRATION');
    await user.click(within(r).getByRole('button', { name: 'Edit Sign-up' }));
    await user.click(within(r).getByRole('radio', { name: 'Invite only' }));
    await user.click(within(r).getByRole('button', { name: 'Save' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(saveServerSettings).toHaveBeenCalledWith({ HOMEPAD_REGISTRATION: 'invite_only' }, { confirm: [] });
  });

  it('a reset that needs a confirm asks, then resends the DELETE with the code', async () => {
    const user = userEvent.setup();
    vi.mocked(resetServerSetting)
      .mockResolvedValueOnce({ ok: false, failure: { status: 409, error: 'confirm_required', warnings: ['cookie_secure_on'].map((code) => ({ code })) } })
      .mockResolvedValueOnce(ok(settingsBody()));
    renderSystem(savedInUi('COOKIE_SECURE', false));
    const r = await row('COOKIE_SECURE');
    await user.click(within(r).getByRole('button', { name: 'Reset Secure cookies to env' }));
    await user.click(within(r).getByRole('button', { name: 'Reset' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Turn on secure cookies?' });
    await user.click(within(dialog).getByRole('button', { name: 'Turn on' }));
    expect(resetServerSetting).toHaveBeenLastCalledWith('COOKIE_SECURE', { confirm: ['cookie_secure_on'] });
    await waitFor(() => expect(badge(r)).toHaveTextContent('env'));
  });

  it('an unknown warning code still gets a dialog with the server words', async () => {
    const user = userEvent.setup();
    vi.mocked(saveServerSettings)
      .mockResolvedValueOnce({ ok: false, failure: { status: 409, error: 'confirm_required', warnings: [{ code: 'gatus_down', message: 'Gatus did not answer.' }] } })
      .mockResolvedValueOnce(ok(settingsBody()));
    renderSystem();
    const r = await row('GATUS_BASE_URL');
    await user.click(within(r).getByRole('button', { name: 'Edit Gatus address' }));
    await user.type(within(r).getByRole('textbox'), '/x{Enter}');
    const dialog = await screen.findByRole('alertdialog', { name: 'Save this change?' });
    expect(dialog).toHaveTextContent('Gatus did not answer.');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(saveServerSettings).toHaveBeenLastCalledWith(expect.anything(), { confirm: ['gatus_down'] });
  });

  it('a repeated confirm_required for codes already sent stops and says so', async () => {
    const user = userEvent.setup();
    vi.mocked(saveServerSettings).mockResolvedValue({
      ok: false,
      failure: { status: 409, error: 'confirm_required', warnings: [{ code: 'trusted_proxies' }] },
    });
    renderSystem();
    const r = await row('HOMEPAD_TRUSTED_PROXIES');
    await user.click(within(r).getByRole('button', { name: 'Edit Trusted proxies' }));
    await user.type(within(r).getByRole('textbox'), 'web{Enter}');
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Save' }));
    expect(await within(r).findByRole('alert')).toHaveTextContent('This change needs a confirm. Try again.');
  });

  it('dialogs trap Tab, close on Escape (one layer), and have no axe violations', async () => {
    const user = userEvent.setup();
    const { container } = renderSystem();
    const r = await row('COOKIE_SECURE');
    await user.click(within(r).getByRole('switch'));
    const dialog = screen.getByRole('alertdialog');
    const [cancel, primary] = within(dialog).getAllByRole('button');
    expect(cancel).toHaveFocus();
    await user.tab();
    expect(primary).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.tab({ shift: true });
    expect(primary).toHaveFocus();
    expect(await axe(container.ownerDocument.body)).toHaveNoViolations();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(saveServerSettings).not.toHaveBeenCalled();
  });

  it('the scrim click is Cancel', async () => {
    const user = userEvent.setup();
    renderSystem();
    await user.click(within(await row('COOKIE_SECURE')).getByRole('switch'));
    await user.click(screen.getByTestId('server-setting-dialog-overlay'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

// ── AC-035 — the secret row, PORT, the banner ───────────────────────────────
describe('AC-035 — the secret row (UX §3)', () => {
  it('shows only Set / Not set; Replace opens an empty password field with no autocomplete and no show toggle', async () => {
    const user = userEvent.setup();
    renderSystem();
    const r = await row('OIDC_CLIENT_SECRET');
    expect(within(r).getByText('Set')).toBeInTheDocument();
    await user.click(within(r).getByRole('button', { name: 'Replace Client secret' }));
    const field = r.querySelector('input')!;
    expect(field).toHaveAttribute('type', 'password');
    expect(field).toHaveAttribute('autocomplete', 'off');
    expect(field).toHaveValue('');
    expect(field).toHaveFocus();
    expect(within(r).getByText("Paste the new secret. It can't be shown again after you save.")).toBeInTheDocument();
    expect(within(r).queryByRole('button', { name: /show/i })).not.toBeInTheDocument();
    expect(within(r).getByRole('button', { name: 'Done' })).toBeDisabled();
  });

  it('Not set, and the env line when saved in the UI, with "Remove saved secret"', async () => {
    renderSystem(savedInUi('OIDC_CLIENT_SECRET', undefined, settingsBody({ OIDC_CLIENT_SECRET: { envIsSet: false, isSet: false } })));
    const r = await row('OIDC_CLIENT_SECRET');
    expect(within(r).getByText('Set')).toBeInTheDocument();
    expect(within(r).getByText('Env: not set')).toBeInTheDocument();
    expect(within(r).getByRole('button', { name: 'Remove saved Client secret' })).toHaveTextContent('Remove saved secret');
  });

  it('Not set when nothing holds a secret', async () => {
    renderSystem(settingsBody({ OIDC_CLIENT_SECRET: { envIsSet: false, isSet: false, source: 'default' } }));
    expect(within(await row('OIDC_CLIENT_SECRET')).getByText('Not set')).toBeInTheDocument();
  });

  it('Remove saved secret asks, then DELETEs', async () => {
    const user = userEvent.setup();
    vi.mocked(resetServerSetting).mockResolvedValue(ok(settingsBody()));
    renderSystem(savedInUi('OIDC_CLIENT_SECRET', undefined));
    const r = await row('OIDC_CLIENT_SECRET');
    await user.click(within(r).getByRole('button', { name: 'Remove saved Client secret' }));
    expect(within(r).getByText('Remove the saved secret?')).toBeInTheDocument();
    expect(within(r).getByText('The env secret applies again.')).toBeInTheDocument();
    await user.click(within(r).getByRole('button', { name: 'Remove' }));
    expect(resetServerSetting).toHaveBeenCalledWith('OIDC_CLIENT_SECRET', { confirm: [], oidcTest: undefined });
  });

  it('with no server key, Replace is off and the row says why (Q1 A, TC-010)', async () => {
    renderSystem(settingsBody({ OIDC_CLIENT_SECRET: { editable: false, readOnlyReason: 'no_secret_key' } }));
    const r = await row('OIDC_CLIENT_SECRET');
    expect(within(r).getByRole('button', { name: 'Replace Client secret' })).toBeDisabled();
    expect(r).toHaveTextContent('To save the secret here, add HOMEPAD_SECRET_KEY on the server. The env secret still works.');
  });

  it('unreadable: "Can\'t be read" and what to do', async () => {
    renderSystem(savedInUi('OIDC_CLIENT_SECRET', undefined, settingsBody({ OIDC_CLIENT_SECRET: { unreadable: true } })));
    const r = await row('OIDC_CLIENT_SECRET');
    expect(within(r).getByText("Can't be read")).toHaveClass('settings-kv-value--warn');
    expect(within(r).getByText('The server key changed. Replace the secret.')).toBeInTheDocument();
  });

  it('a replaced secret is staged as "Replaced", never echoed', async () => {
    const user = userEvent.setup();
    renderSystem();
    const r = await row('OIDC_CLIENT_SECRET');
    await user.click(within(r).getByRole('button', { name: 'Replace Client secret' }));
    await user.type(r.querySelector('input')!, 'sup3r-s3cret{Enter}');
    expect(within(r).getByText('Replaced')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('sup3r-s3cret');
  });
});

describe('AC-035 / AC-012 — the PORT row (UX §5)', () => {
  it('no Edit, no Reset, and the restart line (TC-011)', async () => {
    renderSystem();
    const r = await row('PORT');
    expect(within(r).getByText('8080')).toBeInTheDocument();
    expect(badge(r)).toHaveTextContent('default');
    expect(within(r).queryByRole('button')).not.toBeInTheDocument();
    expect(within(r).getByText('Set on the server. Applies after restart.')).toBeInTheDocument();
  });
});

describe('AC-035 / AC-031 — the env-only banner (UX §6)', () => {
  const envOnly = () => {
    const b = settingsBody({}, true);
    b.settings = b.settings.map((s) =>
      s.key === 'COOKIE_SECURE'
        ? { ...s, saved: true, savedValue: false }
        : s.key === 'OIDC_CLIENT_SECRET'
          ? { ...s, saved: true }
          : s.key === 'GATUS_BASE_URL'
            ? { ...s, saved: true }
            : s,
    );
    return b;
  };

  it('shows the banner; every Edit and switch is off; Reset stays for saved rows', async () => {
    renderSystem(envOnly());
    const banner = await screen.findByTestId('settings-envonly-banner');
    expect(banner).toHaveAttribute('role', 'status');
    expect(banner).toHaveTextContent('Server settings come from the environment only.');
    expect(banner).toHaveTextContent('HOMEPAD_SETTINGS_FROM_ENV_ONLY');
    expect(within(await row('GATUS_BASE_URL')).getByRole('button', { name: 'Edit Gatus address' })).toBeDisabled();
    const cookie = await row('COOKIE_SECURE');
    expect(within(cookie).getByRole('switch')).toBeDisabled();
    expect(within(cookie).getByText('Saved value ignored: Off')).toBeInTheDocument();
    expect(within(cookie).getByRole('button', { name: 'Reset Secure cookies to env' })).toBeEnabled();
    const secret = await row('OIDC_CLIENT_SECRET');
    expect(within(secret).getByText('Saved secret ignored.')).toBeInTheDocument();
    expect(within(secret).getByRole('button', { name: 'Remove saved Client secret' })).toBeEnabled();
    // A saved value with no savedValue (or one that fails today's rule) still
    // offers Reset.
    const gatus = await row('GATUS_BASE_URL');
    expect(within(gatus).getByText('Saved value ignored.')).toBeInTheDocument();
    expect(within(await row('OIDC_ISSUER')).queryByRole('button', { name: /Reset/ })).not.toBeInTheDocument();
  });

  it('a stored value that fails today\'s rule says so and can be reset', async () => {
    renderSystem(settingsBody({ HOMEPAD_MAX_ACCOUNTS: { saved: true, savedInvalid: true } }));
    const r = await row('HOMEPAD_MAX_ACCOUNTS');
    expect(within(r).getByText("The saved value no longer passes the rules, so it's ignored. Reset clears it.")).toBeInTheDocument();
    expect(within(r).getByRole('button', { name: 'Reset Account limit to default' })).toBeInTheDocument();
  });

  it('no banner without the flag', async () => {
    renderSystem();
    await row('GATUS_BASE_URL');
    expect(screen.queryByTestId('settings-envonly-banner')).not.toBeInTheDocument();
  });
});

// ── AC-035 / AC-021…AC-023 — the Sign-in group (UX §7) ──────────────────────
describe('AC-035 — the Sign-in group has one Save', () => {
  async function stageMemberGroup(user: ReturnType<typeof userEvent.setup>, value = 'homepad') {
    const r = await row('OIDC_MEMBER_GROUP');
    await user.click(within(r).getByRole('button', { name: 'Edit Member group' }));
    await user.type(within(r).getByRole('textbox', { name: 'Member group' }), value);
    await user.click(within(r).getByRole('button', { name: 'Done' }));
    return r;
  }

  it('Done holds the change: nothing is sent, the row says "changed, not saved", the footer counts it', async () => {
    const user = userEvent.setup();
    const onSigninDirty = vi.fn();
    renderSystem(settingsBody(), { onSigninDirty });
    const r = await stageMemberGroup(user);
    expect(saveServerSettings).not.toHaveBeenCalled();
    expect(within(r).getByText('changed, not saved')).toBeInTheDocument();
    expect(within(r).getByText('homepad')).toBeInTheDocument();
    expect(screen.getByTestId('signin-footer')).toHaveTextContent('1 change not saved.');
    expect(onSigninDirty).toHaveBeenLastCalledWith(1);
  });

  it('TC-007 — Review and save lists old → new, reminds about the redirect URL, and saves the group in one PATCH', async () => {
    const user = userEvent.setup();
    vi.mocked(saveServerSettings).mockResolvedValue(ok(savedInUi('OIDC_MEMBER_GROUP', 'homepad')));
    renderSystem();
    await stageMemberGroup(user);
    await user.click(screen.getByRole('button', { name: 'Review and save' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Save sign-in settings?' });
    expect(within(dialog).getByRole('listitem')).toHaveTextContent('Member group: — → homepad');
    expect(dialog).toHaveTextContent('The redirect URL must be registered with your provider first.');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(saveServerSettings).toHaveBeenCalledWith({ OIDC_MEMBER_GROUP: 'homepad' }, { confirm: [], oidcTest: undefined });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.getByTestId('signin-footer')).toHaveTextContent('Sign-in settings saved ✓');
    expect(badge(await row('OIDC_MEMBER_GROUP'))).toHaveTextContent('UI');
  });

  it('setting a value back to what it was drops the change', async () => {
    const user = userEvent.setup();
    renderSystem();
    const r = await row('OIDC_ADMIN_GROUP');
    await user.click(within(r).getByRole('button', { name: 'Edit Admin group' }));
    await user.type(within(r).getByRole('textbox'), 'x');
    await user.click(within(r).getByRole('button', { name: 'Done' }));
    expect(screen.getByTestId('signin-footer')).toHaveTextContent('1 change not saved.');
    await user.click(within(r).getByRole('button', { name: 'Edit Admin group' }));
    await user.type(within(r).getByRole('textbox'), '{Backspace}');
    await user.click(within(r).getByRole('button', { name: 'Done' }));
    expect(screen.queryByTestId('signin-footer')).not.toBeInTheDocument();
  });

  it('Discard drops every held change', async () => {
    const user = userEvent.setup();
    renderSystem();
    const r = await stageMemberGroup(user);
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(within(r).queryByText('changed, not saved')).not.toBeInTheDocument();
    expect(screen.queryByTestId('signin-footer')).not.toBeInTheDocument();
  });

  it('the single sign-on switch is held too, and turning it off warns in the review', async () => {
    const user = userEvent.setup();
    renderSystem();
    const r = await row('OIDC_ENABLED');
    await user.click(within(r).getByRole('switch', { name: 'Single sign-on' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(saveServerSettings).not.toHaveBeenCalled();
    expect(within(r).getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    await user.click(screen.getByRole('button', { name: 'Review and save' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Single sign-on: On → Off');
    expect(dialog).toHaveTextContent("People who only use single sign-on can't sign in until it's back on.");
  });

  it('changing the client ID suggests replacing the secret too', async () => {
    const user = userEvent.setup();
    renderSystem();
    const r = await row('OIDC_CLIENT_ID');
    await user.click(within(r).getByRole('button', { name: 'Edit Client ID' }));
    await user.type(within(r).getByRole('textbox'), '2');
    await user.click(within(r).getByRole('button', { name: 'Done' }));
    expect(await row('OIDC_CLIENT_SECRET')).toHaveTextContent('Replace the secret too if the provider gave you a new one.');
  });

  it('AC-022 — would_lock_out: the dialog says why and offers Test sign-in; nothing is lost', async () => {
    const user = userEvent.setup();
    vi.mocked(saveServerSettings).mockResolvedValue(fail(409, 'would_lock_out'));
    renderSystem();
    await stageMemberGroup(user);
    await user.click(screen.getByRole('button', { name: 'Review and save' }));
    const dialog = screen.getByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(
      await within(dialog).findByText('No admin has a password, so a mistake here could lock everyone out. Test sign-in with the new settings first.'),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Test sign-in' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByTestId('signin-footer')).toHaveTextContent('1 change not saved.');
  });

  it('AC-021 — discovery_failed: the server message in the dialog, nothing saved (TC-009)', async () => {
    const user = userEvent.setup();
    const msg = "Couldn't read the sign-in settings at https://id.example.com/wrong/.well-known/openid-configuration.";
    vi.mocked(saveServerSettings).mockResolvedValue(fail(422, 'discovery_failed', { message: msg }));
    renderSystem();
    const r = await row('OIDC_ISSUER');
    await user.click(within(r).getByRole('button', { name: 'Edit Issuer' }));
    await user.type(within(r).getByRole('textbox'), '/wrong');
    await user.click(within(r).getByRole('button', { name: 'Done' }));
    await user.click(screen.getByRole('button', { name: 'Review and save' }));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByRole('listitem')).toHaveTextContent('Issuer: https://id.example.com → https://id.example.com/wrong');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(msg);
    expect(within(r).getByText('changed, not saved')).toBeInTheDocument();
  });

  it('a confirm asked during the group save is answered, then sent with the codes', async () => {
    const user = userEvent.setup();
    vi.mocked(saveServerSettings)
      .mockResolvedValueOnce({ ok: false, failure: { status: 409, error: 'confirm_required', warnings: [{ code: 'sso_note', message: 'Heads up.' }] } })
      .mockResolvedValueOnce(ok(savedInUi('OIDC_MEMBER_GROUP', 'homepad')));
    renderSystem();
    await stageMemberGroup(user);
    await user.click(screen.getByRole('button', { name: 'Review and save' }));
    await user.click(within(screen.getByRole('alertdialog', { name: 'Save sign-in settings?' })).getByRole('button', { name: 'Save' }));
    const ask = await screen.findByRole('alertdialog', { name: 'Save this change?' });
    await user.click(within(ask).getByRole('button', { name: 'Cancel' }));
    // Cancelled: the review stays, nothing saved.
    expect(screen.getByRole('alertdialog', { name: 'Save sign-in settings?' })).toBeInTheDocument();
    await user.click(within(screen.getByRole('alertdialog', { name: 'Save sign-in settings?' })).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(saveServerSettings).toHaveBeenCalledTimes(2);
  });

  it('a reset in the Sign-in group sends DELETE and drops any held change for that key', async () => {
    const user = userEvent.setup();
    vi.mocked(resetServerSetting).mockResolvedValue(ok(settingsBody()));
    renderSystem(savedInUi('OIDC_ADMIN_GROUP', 'admins'));
    const r = await row('OIDC_ADMIN_GROUP');
    await user.click(within(r).getByRole('button', { name: 'Reset Admin group to env' }));
    await user.click(within(r).getByRole('button', { name: 'Reset' }));
    expect(resetServerSetting).toHaveBeenCalledWith('OIDC_ADMIN_GROUP', { confirm: [], oidcTest: undefined });
    await waitFor(() => expect(badge(r)).toHaveTextContent('env'));
  });
});

describe('AC-023 — Test sign-in (TC-008)', () => {
  function fakeTab() {
    const tab = { opener: {} as unknown, location: { href: '' }, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    return tab;
  }

  async function stageClientId(user: ReturnType<typeof userEvent.setup>) {
    const r = await row('OIDC_CLIENT_ID');
    await user.click(within(r).getByRole('button', { name: 'Edit Client ID' }));
    await user.type(within(r).getByRole('textbox'), '-new');
    await user.click(within(r).getByRole('button', { name: 'Done' }));
    return r;
  }

  it('opens the provider in a new tab, waits, passes, and the save carries the token', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const tab = fakeTab();
    vi.mocked(startOidcTest).mockResolvedValue({ ok: true, id: 't1', authorizeUrl: 'https://id.example.com/authorize?state=t1' });
    vi.mocked(oidcTestStatus).mockResolvedValueOnce({ state: 'pending' }).mockResolvedValue({ state: 'passed', token: 'tok-1' });
    vi.mocked(saveServerSettings).mockResolvedValue(ok(savedInUi('OIDC_CLIENT_ID', 'homepad-new')));
    renderSystem();
    await stageClientId(user);
    await user.click(screen.getByRole('button', { name: 'Test sign-in' }));
    expect(window.open).toHaveBeenCalledWith('', '_blank');
    expect(startOidcTest).toHaveBeenCalledWith({ OIDC_CLIENT_ID: 'homepad-new' });
    const foot = screen.getByTestId('signin-footer');
    await waitFor(() => expect(foot).toHaveTextContent('Waiting for the test sign-in…'));
    expect(tab.location.href).toBe('https://id.example.com/authorize?state=t1');
    expect(tab.opener).toBeNull();
    expect(within(foot).getByRole('link', { name: 'Open the test sign-in page' })).toHaveAttribute('rel', 'noopener noreferrer');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(foot).toHaveTextContent('Waiting for the test sign-in…');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(foot).toHaveTextContent('Test passed ✓');
    expect(oidcTestStatus).toHaveBeenCalledWith('t1');
    await user.click(screen.getByRole('button', { name: 'Review and save' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Save' }));
    expect(saveServerSettings).toHaveBeenCalledWith({ OIDC_CLIENT_ID: 'homepad-new' }, { confirm: [], oidcTest: 'tok-1' });
  });

  it('a pass runs out after 10 minutes, and changing a value needs a new test', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    fakeTab();
    vi.mocked(startOidcTest).mockResolvedValue({ ok: true, id: 't1', authorizeUrl: 'https://id.example.com/a' });
    vi.mocked(oidcTestStatus).mockResolvedValue({ state: 'passed', token: 'tok-1' });
    renderSystem();
    const r = await stageClientId(user);
    await user.click(screen.getByRole('button', { name: 'Test sign-in' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    const foot = screen.getByTestId('signin-footer');
    expect(foot).toHaveTextContent('Test passed ✓');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    });
    expect(foot).toHaveTextContent('The test ran out after 10 minutes. Test sign-in again.');

    // Pass again, then edit: the pass is gone.
    await user.click(screen.getByRole('button', { name: 'Test sign-in' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByTestId('signin-footer')).toHaveTextContent('Test passed ✓');
    await user.click(within(r).getByRole('button', { name: 'Edit Client ID' }));
    await user.type(within(r).getByRole('textbox'), '2');
    await user.click(within(r).getByRole('button', { name: 'Done' }));
    expect(screen.getByTestId('signin-footer')).not.toHaveTextContent('Test passed');
  });

  it('a failed test says why', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    fakeTab();
    vi.mocked(startOidcTest).mockResolvedValue({ ok: true, id: 't1', authorizeUrl: 'https://id.example.com/a' });
    vi.mocked(oidcTestStatus).mockResolvedValue({ state: 'failed', message: 'That account is not an admin here.' });
    renderSystem();
    await stageClientId(user);
    await user.click(screen.getByRole('button', { name: 'Test sign-in' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByTestId('signin-footer')).toHaveTextContent('That account is not an admin here.');
  });

  it('a failure with no message, and a test that never ends, both get plain words', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    fakeTab();
    vi.mocked(startOidcTest).mockResolvedValue({ ok: true, id: 't1', authorizeUrl: 'https://id.example.com/a' });
    vi.mocked(oidcTestStatus).mockResolvedValueOnce({ state: 'failed' }).mockResolvedValue({ state: 'pending' });
    renderSystem();
    await stageClientId(user);
    await user.click(screen.getByRole('button', { name: 'Test sign-in' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByTestId('signin-footer')).toHaveTextContent('The test sign-in failed. Check the values and try again.');
    await user.click(screen.getByRole('button', { name: 'Test sign-in' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000 * 150);
    });
    expect(screen.getByTestId('signin-footer')).toHaveTextContent('The test sign-in timed out. Try again.');
  });

  it('a refused start closes the blank tab and shows the reason', async () => {
    const user = userEvent.setup();
    const tab = fakeTab();
    vi.mocked(startOidcTest).mockResolvedValue({
      ok: false,
      failure: { status: 422, error: 'discovery_failed', warnings: [] },
    });
    renderSystem();
    await stageClientId(user);
    await user.click(screen.getByRole('button', { name: 'Test sign-in' }));
    await waitFor(() =>
      expect(screen.getByTestId('signin-footer')).toHaveTextContent("Couldn't read the sign-in settings from that address."),
    );
    expect(tab.close).toHaveBeenCalled();
  });

  it('a blocked popup still leaves the link to open', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'open').mockReturnValue(null);
    vi.mocked(startOidcTest).mockResolvedValue({ ok: true, id: 't1', authorizeUrl: 'https://id.example.com/a' });
    vi.mocked(oidcTestStatus).mockResolvedValue({ state: 'pending' });
    renderSystem();
    await stageClientId(user);
    await user.click(screen.getByRole('button', { name: 'Test sign-in' }));
    expect(await screen.findByRole('link', { name: 'Open the test sign-in page' })).toHaveAttribute('href', 'https://id.example.com/a');
  });

  it('Test sign-in from the lockout dialog starts the test', async () => {
    const user = userEvent.setup();
    fakeTab();
    vi.mocked(saveServerSettings).mockResolvedValue(fail(409, 'would_lock_out'));
    vi.mocked(startOidcTest).mockResolvedValue({ ok: true, id: 't1', authorizeUrl: 'https://id.example.com/a' });
    vi.mocked(oidcTestStatus).mockResolvedValue({ state: 'pending' });
    renderSystem();
    await stageClientId(user);
    await user.click(screen.getByRole('button', { name: 'Review and save' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Save' }));
    await user.click(await within(screen.getByRole('alertdialog')).findByRole('button', { name: 'Test sign-in' }));
    expect(startOidcTest).toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

// ── API PR 0.2.1 contract details ─────────────────────────────────────────
describe('0.2.1 — notes, missing values, refusals', () => {
  it('a save that went through with a note shows it without blocking', async () => {
    const user = userEvent.setup();
    const body = savedInUi('GATUS_BASE_URL', 'https://status.example.com');
    body.notes = [{ code: 'gatus_unreachable', message: "Saved, but Homepad couldn't reach Gatus just now." }];
    vi.mocked(saveServerSettings).mockResolvedValue(ok(body));
    renderSystem();
    const r = await row('GATUS_BASE_URL');
    await user.click(within(r).getByRole('button', { name: 'Edit Gatus address' }));
    await user.type(within(r).getByRole('textbox'), '/x{Enter}');
    expect(await within(r).findByTestId('setting-note')).toHaveTextContent("Saved, but Homepad couldn't reach Gatus just now.");
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(badge(r)).toHaveTextContent('UI');
  });

  it('a reset with a note shows it too', async () => {
    const user = userEvent.setup();
    const body = settingsBody();
    body.notes = [{ code: 'gatus_unreachable', message: 'Gatus is quiet.' }];
    vi.mocked(resetServerSetting).mockResolvedValue(ok(body));
    renderSystem(savedInUi('GATUS_BASE_URL', 'https://status.example.com'));
    const r = await row('GATUS_BASE_URL');
    await user.click(within(r).getByRole('button', { name: 'Reset Gatus address to env' }));
    await user.click(within(r).getByRole('button', { name: 'Reset' }));
    expect(await within(r).findByTestId('setting-note')).toHaveTextContent('Gatus is quiet.');
  });

  it('turning single sign-on on with values missing: inline on the group, the rows marked', async () => {
    const user = userEvent.setup();
    vi.mocked(saveServerSettings).mockResolvedValue(
      fail(400, 'invalid', {
        key: 'OIDC_ENABLED',
        message: 'Single sign-on needs these first: Client ID, Client secret.',
        missing: ['OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET'],
      }),
    );
    renderSystem(settingsBody({ OIDC_ENABLED: { value: false, envValue: false } }));
    await user.click(within(await row('OIDC_ENABLED')).getByRole('switch'));
    await user.click(screen.getByRole('button', { name: 'Review and save' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(within(screen.getByTestId('signin-footer')).getByRole('alert')).toHaveTextContent(
      'Single sign-on needs these first: Client ID, Client secret.',
    );
    expect(await row('OIDC_CLIENT_ID')).toHaveTextContent('Needed to turn on single sign-on.');
    expect(await row('OIDC_CLIENT_SECRET')).toHaveTextContent('Needed to turn on single sign-on.');
    expect(await row('OIDC_ISSUER')).not.toHaveTextContent('Needed to turn on');
    // Changing a value clears it.
    await user.click(within(await row('OIDC_ENABLED')).getByRole('switch'));
    expect(screen.queryByTestId('signin-footer')).not.toBeInTheDocument();
  });

  it('a bad value in the group is shown on its row', async () => {
    const user = userEvent.setup();
    vi.mocked(saveServerSettings).mockResolvedValue(fail(400, 'invalid', { key: 'OIDC_ISSUER', message: 'The issuer needs a host.' }));
    renderSystem();
    const r = await row('OIDC_ISSUER');
    await user.click(within(r).getByRole('button', { name: 'Edit Issuer' }));
    await user.type(within(r).getByRole('textbox'), '/x');
    await user.click(within(r).getByRole('button', { name: 'Done' }));
    await user.click(screen.getByRole('button', { name: 'Review and save' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(r).toHaveTextContent('The issuer needs a host.');
  });

  it('turning single sign-on off with no admin password: the server words, and no test offered', async () => {
    const user = userEvent.setup();
    const msg = 'No admin has a password, so turning single sign-on off would lock everyone out. Set a password on an admin account first.';
    vi.mocked(saveServerSettings).mockResolvedValue(fail(409, 'would_lock_out', { message: msg }));
    renderSystem();
    await user.click(within(await row('OIDC_ENABLED')).getByRole('switch'));
    await user.click(screen.getByRole('button', { name: 'Review and save' }));
    const dialog = screen.getByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText(msg)).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Test sign-in' })).not.toBeInTheDocument();
  });

  it('409 no_secret_key gets the line naming HOMEPAD_SECRET_KEY, not the server words', async () => {
    const user = userEvent.setup();
    vi.mocked(saveServerSettings).mockResolvedValue(fail(409, 'no_secret_key', { message: 'add a server key' }));
    renderSystem();
    const r = await row('OIDC_CLIENT_SECRET');
    await user.click(within(r).getByRole('button', { name: 'Replace Client secret' }));
    await user.type(r.querySelector('input')!, 's3cret{Enter}');
    await user.click(screen.getByRole('button', { name: 'Review and save' }));
    const dialog = screen.getByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'To save the secret here, add HOMEPAD_SECRET_KEY on the server. The env secret still works.',
    );
  });

  it('a group save with a note keeps the note in the footer', async () => {
    const user = userEvent.setup();
    const body = savedInUi('OIDC_ISSUER', 'http://id.example.com');
    body.notes = [{ code: 'oidc_issuer_http', message: 'The issuer is on plain http://.' }];
    vi.mocked(saveServerSettings).mockResolvedValue(ok(body));
    renderSystem();
    const r = await row('OIDC_ISSUER');
    await user.click(within(r).getByRole('button', { name: 'Edit Issuer' }));
    const field = within(r).getByRole('textbox');
    await user.clear(field);
    await user.type(field, 'http://id.example.com');
    await user.click(within(r).getByRole('button', { name: 'Done' }));
    await user.click(screen.getByRole('button', { name: 'Review and save' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Save' }));
    const foot = await screen.findByTestId('signin-footer');
    await waitFor(() => expect(foot).toHaveTextContent('Sign-in settings saved ✓'));
    expect(foot).toHaveTextContent('The issuer is on plain http://.');
  });
});

// ── SettingsPanel wiring (UX §7 leaving, spec §8) ───────────────────────────
describe('SettingsPanel — leaving with held sign-in changes, and telling the app', () => {
  function renderPanel(onClose = vi.fn(), onServerSettingsChanged = vi.fn()) {
    vi.mocked(adminServerSettings).mockResolvedValue(settingsBody());
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
        onClose={onClose}
        onServerSettingsChanged={onServerSettingsChanged}
      />,
    );
    return { onClose, onServerSettingsChanged };
  }

  async function stage(user: ReturnType<typeof userEvent.setup>) {
    const r = await row('OIDC_MEMBER_GROUP');
    await user.click(within(r).getByRole('button', { name: 'Edit Member group' }));
    await user.type(within(r).getByRole('textbox'), 'homepad');
    await user.click(within(r).getByRole('button', { name: 'Done' }));
  }

  it('closing asks "Discard 1 change to sign-in settings?"; Keep editing stays', async () => {
    const user = userEvent.setup();
    const { onClose } = renderPanel();
    await stage(user);
    await user.click(screen.getByRole('button', { name: 'Close admin panel' }));
    const ask = screen.getByRole('alertdialog', { name: 'Discard 1 change to sign-in settings?' });
    await user.click(within(ask).getByRole('button', { name: 'Keep editing' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('signin-footer')).toHaveTextContent('1 change not saved.');
    // Escape on the panel asks too; Discard closes.
    await user.keyboard('{Escape}');
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Discard' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes at once with nothing held', async () => {
    const user = userEvent.setup();
    const { onClose } = renderPanel();
    await row('OIDC_MEMBER_GROUP');
    await user.click(screen.getByRole('button', { name: 'Close admin panel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a Sign-up change re-reads the auth config for Accounts and tells the app (spec §8)', async () => {
    const user = userEvent.setup();
    vi.mocked(saveServerSettings).mockResolvedValue(ok(settingsBody({ HOMEPAD_MAX_ACCOUNTS: { value: 9, source: 'ui' } })));
    const { onServerSettingsChanged } = renderPanel();
    const lim = await row('HOMEPAD_MAX_ACCOUNTS');
    await waitFor(() => expect(authConfig).toHaveBeenCalledTimes(1));
    await user.click(within(lim).getByRole('button', { name: 'Edit Account limit' }));
    await user.type(within(lim).getByRole('textbox'), '9{Enter}');
    await waitFor(() => expect(onServerSettingsChanged).toHaveBeenCalledTimes(1));
    expect(authConfig).toHaveBeenCalledTimes(1); // the limit is not part of the auth config

    vi.mocked(saveServerSettings).mockResolvedValue(ok(savedInUi('HOMEPAD_REGISTRATION', 'open')));
    const reg = await row('HOMEPAD_REGISTRATION');
    await user.click(within(reg).getByRole('button', { name: 'Edit Sign-up' }));
    await user.click(within(reg).getByRole('radio', { name: 'Open' }));
    await user.click(within(reg).getByRole('button', { name: 'Save' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Open sign-up' }));
    await waitFor(() => expect(authConfig).toHaveBeenCalledTimes(2));
  });
});
