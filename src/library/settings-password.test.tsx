// SPEC-password-reset-link AC-013, AC-014, AC-020, UX §4 — My settings →
// Password: Change password expands in place (R-5), and shows only for an
// adult with a local password.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import SettingsPanel from './SettingsPanel';
import { changePassword } from '../passwordApi';

vi.mock('../passwordApi', () => ({ changePassword: vi.fn() }));
vi.mock('./serverSettingsApi', () => ({
  adminServerSettings: vi.fn(() => Promise.resolve({ envOnly: false, settings: [] })),
  saveServerSettings: vi.fn(),
  resetServerSetting: vi.fn(),
  startOidcTest: vi.fn(),
  oidcTestStatus: vi.fn(),
}));

vi.mock('../api', () => ({
  listLibrary: vi.fn(() => Promise.resolve([])),
  createLibraryApp: vi.fn(),
  updateLibraryApp: vi.fn(),
  deleteLibraryApp: vi.fn(),
  setLibraryOrder: vi.fn(),
  listAccounts: vi.fn(() => Promise.resolve([])),
  listInvites: vi.fn(() => Promise.resolve([])),
  authConfig: vi.fn(() => Promise.resolve({ oidcEnabled: false, registration: 'invite_only', setupNeeded: false })),
}));
vi.mock('../widgets/widgetsInfo', async (orig) => ({
  ...(await orig<typeof import('../widgets/widgetsInfo')>()),
  fetchWidgetsInfo: vi.fn(async () => null),
}));

expect.extend(toHaveNoViolations);

function renderPanel(props: Partial<React.ComponentProps<typeof SettingsPanel>> = {}) {
  return render(
    <SettingsPanel
      isAdmin={false}
      scope="personal"
      showUptimeDisplay
      onSaveSettings={vi.fn().mockResolvedValue(undefined)}
      showHealthBar
      showUptimeDisplayPref
      onSetUptimeDisplay={vi.fn()}
      onSetHealthBar={vi.fn()}
      density="compact"
      onSetDensity={vi.fn()}
      onClose={vi.fn()}
      email="jo@example.com"
      hasPassword
      {...props}
    />,
  );
}

afterEach(() => vi.clearAllMocks());

async function openForm() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Change password' }));
  return user;
}

async function fillAndSave(
  user: ReturnType<typeof userEvent.setup>,
  current: string,
  next: string,
  again = next,
) {
  await user.type(screen.getByLabelText('Current password'), current);
  await user.type(screen.getByLabelText('New password'), next);
  await user.type(screen.getByLabelText('Type it again'), again);
  await user.click(screen.getByRole('button', { name: 'Save password' }));
}

describe('who sees it (AC-020)', () => {
  it('an adult with a password sees PASSWORD under Dashboard', () => {
    renderPanel();
    const section = screen.getByTestId('settings-password');
    expect(section).toHaveTextContent('Change the password you sign in with.');
    expect(screen.getByRole('heading', { name: 'Password' })).toBeInTheDocument();
    const dash = screen.getByTestId('settings-personal');
    expect(dash.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('no section without a password (SSO-only, kids)', () => {
    renderPanel({ hasPassword: false });
    expect(screen.queryByTestId('settings-password')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change password' })).not.toBeInTheDocument();
  });

  it('not in the Admin Panel', async () => {
    renderPanel({ scope: 'admin', isAdmin: true });
    // Let the Admin Panel's sections finish loading.
    await screen.findByTestId('settings-system');
    await waitFor(() => expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument());
    expect(screen.queryByTestId('settings-password')).not.toBeInTheDocument();
  });
});

describe('the form (UX §4.3)', () => {
  it('expands in place, with focus on Current password', async () => {
    const { container } = renderPanel();
    const toggle = screen.getByRole('button', { name: 'Change password' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await openForm();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const form = document.getElementById(toggle.getAttribute('aria-controls')!);
    expect(form).not.toBeNull();
    expect(screen.getByLabelText('Current password')).toHaveFocus();
    expect(screen.getByLabelText('Current password')).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByLabelText('New password')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByLabelText('Type it again')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByLabelText('New password')).toHaveAccessibleDescription('At least 8 characters.');
    expect(screen.getByText('Your other devices will be signed out.')).toBeInTheDocument();
    const username = container.querySelector('input[autocomplete="username"]') as HTMLInputElement;
    expect(username?.value).toBe('jo@example.com');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Cancel closes it, wipes it and returns focus', async () => {
    renderPanel();
    const user = await openForm();
    await user.type(screen.getByLabelText('Current password'), 'half typed');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change password' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(screen.getByLabelText('Current password')).toHaveValue('');
  });

  it('success: saved, the form closes and a line stays', async () => {
    vi.mocked(changePassword).mockResolvedValue({ ok: true, status: 204 });
    renderPanel();
    const user = await openForm();
    await fillAndSave(user, 'my old password', 'my new password');
    expect(changePassword).toHaveBeenCalledWith('my old password', 'my new password');
    expect(await screen.findByRole('status')).toHaveTextContent('✓ Password changed. Your other devices are signed out.');
    expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change password' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(screen.getByLabelText('New password')).toHaveValue('');
  });

  it('Saving… disables every field and button', async () => {
    let resolve!: (v: Awaited<ReturnType<typeof changePassword>>) => void;
    vi.mocked(changePassword).mockReturnValue(new Promise((r) => (resolve = r)));
    renderPanel();
    const user = await openForm();
    await fillAndSave(user, 'my old password', 'my new password');
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByLabelText('Current password')).toBeDisabled();
    expect(screen.getByLabelText('New password')).toBeDisabled();
    expect(screen.getByLabelText('Type it again')).toBeDisabled();
    resolve({ ok: true, status: 204 });
    await screen.findByRole('status');
  });
});

describe('errors (AC-014)', () => {
  it('wrong current password: the line, that field cleared and focused, the new ones kept', async () => {
    vi.mocked(changePassword).mockResolvedValue({ ok: false, status: 403, error: '{"error":"wrong_password"}' });
    renderPanel();
    const user = await openForm();
    await fillAndSave(user, 'not it at all', 'my new password');
    expect(await screen.findByText("That's not your current password.")).toBeInTheDocument();
    const current = screen.getByLabelText('Current password');
    expect(current).toHaveValue('');
    expect(current).toHaveFocus();
    expect(current).toHaveAttribute('aria-invalid', 'true');
    expect(current).toHaveAccessibleDescription("That's not your current password.");
    expect(screen.getByLabelText('New password')).toHaveValue('my new password');
    expect(screen.getByLabelText('Type it again')).toHaveValue('my new password');
  });

  it('too many wrong tries: the wait from Retry-After', async () => {
    vi.mocked(changePassword).mockResolvedValue({ ok: false, status: 429, error: 'too many', retryAfter: 900 });
    renderPanel();
    const user = await openForm();
    await fillAndSave(user, 'my old password', 'my new password');
    expect(await screen.findByText('Too many tries. Wait 15 minutes and try again.')).toBeInTheDocument();
  });

  it('too many wrong tries with a short or missing wait', async () => {
    vi.mocked(changePassword).mockResolvedValueOnce({ ok: false, status: 429, error: 'too many', retryAfter: 30 });
    renderPanel();
    const user = await openForm();
    await fillAndSave(user, 'my old password', 'my new password');
    expect(await screen.findByText('Too many tries. Wait a minute and try again.')).toBeInTheDocument();
    vi.mocked(changePassword).mockResolvedValueOnce({ ok: false, status: 429, error: 'too many' });
    await user.click(screen.getByRole('button', { name: 'Save password' }));
    await waitFor(() => expect(changePassword).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Too many tries. Wait a minute and try again.')).toBeInTheDocument();
  });

  it('the rules, checked on Save', async () => {
    renderPanel();
    const user = await openForm();
    await fillAndSave(user, 'my old password', 'short');
    expect(screen.getByText('Use at least 8 characters.')).toBeInTheDocument();
    expect(screen.getByLabelText('New password')).toHaveFocus();
    await user.clear(screen.getByLabelText('New password'));
    await user.clear(screen.getByLabelText('Type it again'));
    await user.type(screen.getByLabelText('New password'), '😀'.repeat(19));
    await user.type(screen.getByLabelText('Type it again'), '😀'.repeat(19));
    await user.click(screen.getByRole('button', { name: 'Save password' }));
    expect(screen.getByText('That password is too long. Use 72 characters or fewer.')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('New password'));
    await user.type(screen.getByLabelText('New password'), 'my new password');
    await user.click(screen.getByRole('button', { name: 'Save password' }));
    expect(screen.getByText("The two passwords don't match.")).toBeInTheDocument();
    expect(screen.getByLabelText('Type it again')).toHaveFocus();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('409 sso_account (a stale screen)', async () => {
    vi.mocked(changePassword).mockResolvedValue({ ok: false, status: 409, error: '{"error":"sso_account"}' });
    renderPanel();
    const user = await openForm();
    await fillAndSave(user, 'my old password', 'my new password');
    expect(
      await screen.findByText('This account signs in with single sign-on. It has no password to change here.'),
    ).toBeInTheDocument();
  });

  it('network or anything else', async () => {
    vi.mocked(changePassword).mockResolvedValue({ ok: false, status: 0, error: 'network error' });
    renderPanel();
    const user = await openForm();
    await fillAndSave(user, 'my old password', 'my new password');
    expect(await screen.findByText("Couldn't change the password. Try again.")).toBeInTheDocument();
  });
});
