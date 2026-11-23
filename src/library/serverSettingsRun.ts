import type { CommitOutcome } from './ServerSettingRow';
import type { ServerSetting, SettingsFailure, SettingsResult, SettingValue, SettingWarning } from './serverSettingsApi';

// SPEC-admin-server-settings — what SystemSettings and the Sign-in group share:
// the save runner's type, the plain words for a refusal, and the row order.

export type RunOutcome = { ok: true; notes?: SettingWarning[] } | { ok: false; failure?: SettingsFailure; cancelled?: boolean };

// Run one save or reset through the server's guards: a 409 confirm_required
// opens the dialog with its warnings, and Confirm resends with those codes.
export type RunSave = (
  call: (confirm: string[]) => Promise<SettingsResult>,
  set: Record<string, SettingValue>,
  pre?: SettingWarning[],
) => Promise<RunOutcome>;

// Plain words for a refusal that came with no message of its own.
export function failureMessage(f: SettingsFailure | undefined): string {
  if (!f) return "Couldn't save. Try again.";
  // The server's no_secret_key message doesn't name the env var (0.2.1); §2.4's does.
  if (f.error === 'no_secret_key') return NO_SECRET_KEY;
  if (f.message) return f.message;
  switch (f.error) {
    case 'env_only':
      return 'Server settings come from the environment only right now.';
    case 'would_lock_out':
      return 'No admin has a password, so a mistake here could lock everyone out. Test sign-in with the new settings first.';
    case 'read_only':
      return 'This is set on the server.';
    case 'discovery_failed':
      return "Couldn't read the sign-in settings from that address.";
    case 'confirm_required':
      return 'This change needs a confirm. Try again.';
  }
  if (f.status === 0) return "Couldn't reach Homepad. Try again.";
  if (f.status === 401) return 'You were signed out. Reload the page to sign in again.';
  return "Couldn't save. Try again.";
}

export const NO_SECRET_KEY = 'To save the secret here, add HOMEPAD_SECRET_KEY on the server. The env secret still works.';

// The notes a save that went through came back with, as one line.
export function noteText(notes: SettingWarning[] | undefined): string | undefined {
  const t = (notes ?? []).map((n) => n.message ?? '').filter(Boolean).join(' ');
  return t || undefined;
}

export const toOutcome = (r: RunOutcome): CommitOutcome => {
  if (r.ok) {
    const note = noteText(r.notes);
    return note ? { ok: true, note } : { ok: true };
  }
  return r.cancelled ? { ok: false, cancelled: true } : { ok: false, message: failureMessage(r.failure) };
};

// The catalog's order inside a group; keys this build doesn't know go last.
export function sortRows(rows: ServerSetting[]): ServerSetting[] {
  const order = (s: ServerSetting) => {
    const i = ORDER.indexOf(s.key);
    return i < 0 ? ORDER.length : i;
  };
  return [...rows].sort((a, b) => order(a) - order(b));
}

const ORDER = [
  'COOKIE_SECURE',
  'HOMEPAD_TRUSTED_PROXIES',
  'PORT',
  'GATUS_BASE_URL',
  'GATUS_DEGRADED_MS',
  'HOMEPAD_REGISTRATION',
  'HOMEPAD_MAX_ACCOUNTS',
  'OIDC_ENABLED',
  'OIDC_ISSUER',
  'OIDC_DISCOVERY_URL',
  'OIDC_REDIRECT_URL',
  'OIDC_CLIENT_ID',
  'OIDC_CLIENT_SECRET',
  'OIDC_ADMIN_GROUP',
  'OIDC_MEMBER_GROUP',
];
