import type { ServerSetting, SettingGroup, SettingSource, SettingValue } from './serverSettingsApi';

// SPEC-admin-server-settings §2.2 and UX §9 — what the web app knows about each
// server setting: its label, its help line, which editor it gets, and the
// client check that runs before Save. The server checks again and its message
// wins (UX §4 "Refused").

export type SettingKind = 'boolean' | 'number' | 'text' | 'url' | 'list' | 'choice' | 'secret' | 'readonly';

export type SettingSpec = {
  key: string;
  group: SettingGroup;
  label: string;
  help: string;
  kind: SettingKind;
  min?: number;
  max?: number;
  unit?: string;
  choices?: { value: string; label: string }[];
  // Extra client rule for text-like kinds; returns the line to show, or null.
  check?: (raw: string) => string | null;
};

export const GROUPS: { id: SettingGroup; label: string }[] = [
  { id: 'server', label: 'Server' },
  { id: 'status', label: 'Status' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'signin', label: 'Sign-in' },
];

const isHttpUrl = (raw: string) => {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
};

const URL_LINE = 'Enter an address that starts with http:// or https://.';

const optionalUrl = (raw: string) => (raw === '' || isHttpUrl(raw) ? null : URL_LINE);

const maxLen = (n: number) => (raw: string) => (raw.length > n ? `Use at most ${n} characters.` : null);

const TRUST_ALL = 'That trusts every address. Anyone could pick their own address, and the sign-in limits would stop working.';

export const SPECS: SettingSpec[] = [
  {
    key: 'COOKIE_SECURE',
    group: 'server',
    label: 'Secure cookies',
    help: 'On for https://. Off only for plain http://.',
    kind: 'boolean',
  },
  {
    key: 'HOMEPAD_TRUSTED_PROXIES',
    group: 'server',
    label: 'Trusted proxies',
    help: 'Addresses, ranges or names of proxies in front of Homepad, separated by commas. Empty: everyone shares one sign-in limit.',
    kind: 'list',
    check: (raw) => {
      const items = raw.split(',').map((s) => s.trim()).filter(Boolean);
      if (items.some((s) => s === '0.0.0.0/0' || s === '::/0')) return TRUST_ALL;
      if (items.length > 64) return 'Use at most 64 entries.';
      return null;
    },
  },
  { key: 'PORT', group: 'server', label: 'Server port', help: '', kind: 'readonly' },
  {
    key: 'GATUS_BASE_URL',
    group: 'status',
    label: 'Gatus address',
    help: 'The address of your Gatus server. Leave empty to turn status off.',
    kind: 'url',
    check: optionalUrl,
  },
  {
    key: 'GATUS_DEGRADED_MS',
    group: 'status',
    label: '"Slow" threshold',
    help: 'A check slower than this, in milliseconds, shows as Slow. 0 turns it off.',
    kind: 'number',
    min: 0,
    max: 600000,
    unit: 'ms',
  },
  {
    key: 'HOMEPAD_REGISTRATION',
    group: 'accounts',
    label: 'Sign-up',
    help: 'Invite only: people join by invite. Open: anyone can make an account.',
    kind: 'choice',
    choices: [
      { value: 'open', label: 'Open' },
      { value: 'invite_only', label: 'Invite only' },
    ],
  },
  {
    key: 'HOMEPAD_MAX_ACCOUNTS',
    group: 'accounts',
    label: 'Account limit',
    help: 'Accounts plus pending invites. 0 is no limit.',
    kind: 'number',
    min: 0,
    max: 10000,
  },
  {
    key: 'OIDC_ENABLED',
    group: 'signin',
    label: 'Single sign-on',
    help: 'Let people sign in with your identity provider.',
    kind: 'boolean',
  },
  {
    key: 'OIDC_ISSUER',
    group: 'signin',
    label: 'Issuer',
    help: "Your provider's address, like https://id.example.com.",
    kind: 'url',
    check: optionalUrl,
  },
  {
    key: 'OIDC_DISCOVERY_URL',
    group: 'signin',
    label: 'Discovery URL',
    help: 'Leave empty unless your provider says otherwise.',
    kind: 'url',
    check: optionalUrl,
  },
  {
    key: 'OIDC_REDIRECT_URL',
    group: 'signin',
    label: 'Redirect URL',
    help: "Homepad's address followed by /api/auth/oidc/callback. Register it with your provider.",
    kind: 'url',
    check: (raw) => {
      if (raw === '') return null;
      if (!isHttpUrl(raw)) return URL_LINE;
      return new URL(raw).pathname.endsWith('/api/auth/oidc/callback') ? null : 'The address must end in /api/auth/oidc/callback.';
    },
  },
  {
    key: 'OIDC_CLIENT_ID',
    group: 'signin',
    label: 'Client ID',
    help: 'From your provider.',
    kind: 'text',
    check: (raw) => (/\s/.test(raw) ? "A client ID can't have spaces." : maxLen(255)(raw)),
  },
  {
    key: 'OIDC_CLIENT_SECRET',
    group: 'signin',
    label: 'Client secret',
    help: "Paste the new secret. It can't be shown again after you save.",
    kind: 'secret',
    check: maxLen(1024),
  },
  {
    key: 'OIDC_ADMIN_GROUP',
    group: 'signin',
    label: 'Admin group',
    help: 'People in this group get an admin account.',
    kind: 'text',
    check: maxLen(255),
  },
  {
    key: 'OIDC_MEMBER_GROUP',
    group: 'signin',
    label: 'Member group',
    help: 'With invite-only sign-up, people in this group get a member account.',
    kind: 'text',
    check: maxLen(255),
  },
];

const BY_KEY = new Map(SPECS.map((s) => [s.key, s]));

// A key the server lists that this build doesn't know (a newer API): shown as
// a plain text row under its key, so nothing is hidden.
export function specFor(setting: Pick<ServerSetting, 'key' | 'group' | 'secret'>): SettingSpec {
  return (
    BY_KEY.get(setting.key) ?? {
      key: setting.key,
      group: setting.group,
      label: setting.key,
      help: '',
      kind: setting.secret ? 'secret' : 'text',
    }
  );
}

// Values in words where it helps (UX §2.1). '' means "show the empty dash".
export function formatValue(spec: SettingSpec, v: SettingValue | null | undefined): string {
  if (v === null || v === undefined || v === '') return '';
  if (spec.kind === 'boolean') return v === true || v === 'true' ? 'On' : 'Off';
  if (spec.kind === 'choice') return spec.choices?.find((c) => c.value === String(v))?.label ?? String(v);
  if (spec.key === 'HOMEPAD_MAX_ACCOUNTS' && Number(v) === 0) return 'No limit';
  if (spec.key === 'GATUS_DEGRADED_MS') return Number(v) === 0 ? 'Off' : `${v} ms`;
  return String(v);
}

// The raw string an editor starts with.
export function rawValue(v: SettingValue | null | undefined): string {
  return v === null || v === undefined ? '' : String(v);
}

// The client check. Returns the line to show under the field, or null.
export function checkDraft(spec: SettingSpec, raw: string): string | null {
  if (spec.kind === 'number') {
    const n = Number(raw);
    const ok = raw.trim() !== '' && /^\d+$/.test(raw.trim()) && n >= (spec.min ?? 0) && n <= (spec.max ?? Infinity);
    return ok ? null : `Enter a whole number from ${spec.min ?? 0} to ${spec.max}.`;
  }
  if (spec.kind === 'secret' && raw === '') return null; // Save stays off; no red line for an empty field
  return spec.check ? spec.check(spec.kind === 'secret' ? raw : raw.trim()) : null;
}

// The JSON value a draft saves as.
export function parseDraft(spec: SettingSpec, raw: string): SettingValue {
  if (spec.kind === 'number') return Number(raw.trim());
  if (spec.kind === 'secret') return raw;
  let s = raw.trim();
  if (spec.kind === 'url' && s.length > 1) s = s.replace(/\/+$/, '');
  if (spec.kind === 'list') s = s.split(',').map((x) => x.trim()).filter(Boolean).join(', ');
  return s;
}

export function envIsSet(setting: ServerSetting): boolean {
  if (setting.secret) return setting.envIsSet === true;
  return setting.envValue !== null && setting.envValue !== undefined && setting.envValue !== '';
}

// Where Reset goes: env when it is set, else the default (§2.1).
export function resetTarget(setting: ServerSetting): Exclude<SettingSource, 'ui'> {
  return envIsSet(setting) ? 'env' : 'default';
}

export const BADGE_TEXT: Record<SettingSource, { short: string; long: string }> = {
  ui: { short: 'UI', long: 'Set in the UI' },
  env: { short: 'env', long: 'From the environment' },
  default: { short: 'default', long: 'Default' },
};

// "Nov 23" — short, local, no year (UX §2.1).
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
