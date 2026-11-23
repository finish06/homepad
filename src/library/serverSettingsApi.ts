import { request } from '../api';

// SPEC-admin-server-settings §7 / §8 — the client for the admin server-settings
// routes. It lives here, in the lazy SettingsPanel chunk, and not in src/api.ts:
// src/api.ts is in the entry chunk, and AC-037 caps the entry's growth at under
// 100 bytes gzip. Every call goes through api.ts's request(), so the credentials
// and network-failure conventions are the same.

export type SettingSource = 'ui' | 'env' | 'default';
export type SettingValue = string | number | boolean;
export type SettingGroup = 'server' | 'status' | 'accounts' | 'signin';

// One row of GET /api/admin/server-settings (AC-007). Values travel as JSON
// types: booleans as booleans, numbers as numbers, the rest as strings.
export type ServerSetting = {
  key: string;
  group: SettingGroup;
  value?: SettingValue;
  source: SettingSource;
  // null or absent: the env var is not set.
  envValue?: SettingValue | null;
  defaultValue?: SettingValue | null;
  editable: boolean;
  // Present whenever editable is false (spec §7 build notes 0.2.1): `restart`
  // (PORT), `env_only` (every row while the flag is on), `no_secret_key` (the
  // secret row with no HOMEPAD_SECRET_KEY, Q1 A).
  readOnlyReason?: 'restart' | 'env_only' | 'no_secret_key';
  applies?: 'live' | 'restart';
  type?: 'boolean' | 'number' | 'string' | 'list' | 'choice' | 'secret';
  choices?: string[];
  updatedAt?: string | null;
  updatedBy?: { id: string; name: string } | null;
  // The client secret only: never a value, only these flags (§2.4).
  secret?: boolean;
  isSet?: boolean;
  envIsSet?: boolean;
  unreadable?: boolean;
  // A UI value is stored, used or not (env-only ignores it). Reset clears it.
  saved?: boolean;
  // The stored UI value, when it passes today's rule (never for the secret).
  savedValue?: SettingValue;
  // The stored value fails today's rule and is ignored (§3.3).
  savedInvalid?: boolean;
};

// `notes`: the warnings a save that went through came back with
// (gatus_unreachable, proxy_unresolved, oidc_issuer_http). They need no confirm.
export type ServerSettings = { envOnly: boolean; settings: ServerSetting[]; notes?: SettingWarning[] };

// A guard's warning (§2.5). The code goes back in `confirm`; the message, when
// the server sends one, carries the numbers ("Homepad sees you as …").
export type SettingWarning = {
  code: string;
  message?: string;
  // trusted_proxies
  currentAddress?: string;
  newAddress?: string;
  // max_accounts_below_count
  accounts?: number;
  pendingInvites?: number;
  limit?: number;
  // proxy_unresolved
  hosts?: string[];
};

export type SettingsFailure = {
  status: number;
  error: string;
  key?: string;
  message?: string;
  // 400 on OIDC_ENABLED: the keys single sign-on still needs.
  missing?: string[];
  warnings: SettingWarning[];
};

export type SettingsResult = { ok: true; body: ServerSettings } | { ok: false; failure: SettingsFailure };

export type SaveOpts = { confirm?: string[]; oidcTest?: string };

const BASE = '/api/admin/server-settings';

function parseWarnings(raw: unknown): SettingWarning[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((w): SettingWarning[] => {
    if (typeof w === 'string') return [{ code: w }];
    if (!w || typeof w !== 'object' || typeof (w as SettingWarning).code !== 'string') return [];
    const o = w as Record<string, unknown>;
    const out: SettingWarning = { code: o.code as string };
    for (const k of ['message', 'currentAddress', 'newAddress'] as const) if (typeof o[k] === 'string') out[k] = o[k] as string;
    for (const k of ['accounts', 'pendingInvites', 'limit'] as const) if (typeof o[k] === 'number') out[k] = o[k] as number;
    if (Array.isArray(o.hosts)) out.hosts = o.hosts.filter((h): h is string => typeof h === 'string');
    return [out];
  });
}

function parseBody(data: unknown): ServerSettings | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as { envOnly?: unknown; settings?: unknown; warnings?: unknown };
  if (!Array.isArray(d.settings)) return null;
  const body: ServerSettings = { envOnly: d.envOnly === true, settings: d.settings as ServerSetting[] };
  const notes = parseWarnings(d.warnings);
  if (notes.length) body.notes = notes;
  return body;
}

async function readFailure(status: number, res: Response | null): Promise<SettingsFailure> {
  if (!res) return { status: 0, error: 'network', warnings: [] };
  let data: unknown = null;
  try {
    data = JSON.parse(await res.text());
  } catch {
    // A plain-text error has no code.
  }
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const warnings = parseWarnings(d.warnings);
  const failure: SettingsFailure = { status, error: typeof d.error === 'string' ? d.error : 'unknown', warnings };
  if (typeof d.key === 'string') failure.key = d.key;
  if (typeof d.message === 'string') failure.message = d.message;
  if (Array.isArray(d.missing)) failure.missing = d.missing.filter((m): m is string => typeof m === 'string');
  return failure;
}

async function settingsCall(path: string, method: string, json?: unknown): Promise<SettingsResult> {
  const { status, res } = await request(path, json === undefined ? { method } : { method, json });
  if (res && status === 200) {
    let body: ServerSettings | null;
    try {
      body = parseBody(await res.json());
    } catch {
      body = null;
    }
    return body ? { ok: true, body } : { ok: false, failure: { status, error: 'unexpected', warnings: [] } };
  }
  return { ok: false, failure: await readFailure(status, res) };
}

function withOpts<T extends object>(base: T, opts: SaveOpts): T & SaveOpts {
  const out: T & SaveOpts = { ...base };
  if (opts.confirm && opts.confirm.length > 0) out.confirm = opts.confirm;
  if (opts.oidcTest) out.oidcTest = opts.oidcTest;
  return out;
}

// GET — rejects on any failure, so the panel shows its in-place error state.
export async function adminServerSettings(): Promise<ServerSettings> {
  const { status, res } = await request(BASE);
  if (!res) throw new Error('network error');
  if (status !== 200) throw new Error(`request failed (${status})`);
  const body = parseBody(await res.json());
  if (!body) throw new Error('unexpected response');
  return body;
}

// PATCH — every key in `set` saves in one transaction, or none do (AC-008).
export function saveServerSettings(set: Record<string, SettingValue>, opts: SaveOpts = {}): Promise<SettingsResult> {
  return settingsCall(BASE, 'PATCH', withOpts({ set }, opts));
}

// DELETE — resets one key. The guards run as for a save, so confirm codes and
// a test token ride in the query string: ?confirm=a,b&oidcTest=… (0.2.1).
export function resetServerSetting(key: string, opts: SaveOpts = {}): Promise<SettingsResult> {
  const q = new URLSearchParams();
  if (opts.confirm && opts.confirm.length > 0) q.set('confirm', opts.confirm.join(','));
  if (opts.oidcTest) q.set('oidcTest', opts.oidcTest);
  const qs = q.toString();
  return settingsCall(`${BASE}/${encodeURIComponent(key)}${qs ? `?${qs}` : ''}`, 'DELETE');
}

export type OidcTestStart = { ok: true; id: string; authorizeUrl: string } | { ok: false; failure: SettingsFailure };

// POST — starts a test sign-in with the staged Sign-in values (§2.5, AC-023).
export async function startOidcTest(set: Record<string, SettingValue>): Promise<OidcTestStart> {
  const { status, res } = await request(`${BASE}/oidc/test`, { method: 'POST', json: { set } });
  if (res && status === 200) {
    try {
      const d = (await res.json()) as { id?: unknown; authorizeUrl?: unknown };
      if (typeof d.id === 'string' && typeof d.authorizeUrl === 'string') {
        return { ok: true, id: d.id, authorizeUrl: d.authorizeUrl };
      }
    } catch {
      // fall through
    }
    return { ok: false, failure: { status, error: 'unexpected', warnings: [] } };
  }
  return { ok: false, failure: await readFailure(status, res) };
}

export type OidcTestState = { state: 'pending' | 'passed' | 'failed'; token?: string; message?: string };

// GET — the panel polls this while the test tab is open. A network blip is
// "still pending" (try again next tick); any other refusal ends the test.
export async function oidcTestStatus(id: string): Promise<OidcTestState> {
  const { status, res } = await request(`${BASE}/oidc/test/${encodeURIComponent(id)}`);
  if (!res) return { state: 'pending' };
  if (status !== 200) return { state: 'failed' };
  try {
    const d = (await res.json()) as { state?: unknown; token?: unknown; message?: unknown };
    if (d.state === 'passed' && typeof d.token === 'string') return { state: 'passed', token: d.token };
    if (d.state === 'failed') return typeof d.message === 'string' ? { state: 'failed', message: d.message } : { state: 'failed' };
  } catch {
    // fall through
  }
  return { state: 'pending' };
}
