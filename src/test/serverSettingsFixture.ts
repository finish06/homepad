import type { ServerSetting, ServerSettings } from '../library/serverSettingsApi';

// SPEC-admin-server-settings §7 — a GET /api/admin/server-settings body for the
// unit suites. Every key, env-sourced unless overridden. Hostnames are
// example.com only.

type Over = Partial<ServerSetting>;

const TYPES: Record<string, ServerSetting['type']> = {
  COOKIE_SECURE: 'boolean',
  OIDC_ENABLED: 'boolean',
  PORT: 'number',
  GATUS_DEGRADED_MS: 'number',
  HOMEPAD_MAX_ACCOUNTS: 'number',
  HOMEPAD_TRUSTED_PROXIES: 'list',
  HOMEPAD_REGISTRATION: 'choice',
};

// The shape of the API PR's GET body (spec §7 build notes 0.2.1).
const base = (key: string, group: ServerSetting['group'], value: ServerSetting['value'], defaultValue: ServerSetting['defaultValue']): ServerSetting => ({
  key,
  group,
  type: TYPES[key] ?? 'string',
  ...(key === 'HOMEPAD_REGISTRATION' ? { choices: ['invite_only', 'open'] } : {}),
  saved: false,
  value,
  source: 'env',
  envValue: value,
  defaultValue,
  editable: true,
  applies: 'live',
  updatedAt: null,
  updatedBy: null,
});

export function settingsBody(over: Record<string, Over> = {}, envOnly = false): ServerSettings {
  const rows: ServerSetting[] = [
    base('COOKIE_SECURE', 'server', true, true),
    base('HOMEPAD_TRUSTED_PROXIES', 'server', '', ''),
    { ...base('PORT', 'server', 8080, 8080), source: 'default', envValue: null, editable: false, readOnlyReason: 'restart', applies: 'restart' },
    base('GATUS_BASE_URL', 'status', 'http://gatus.example.com:8080', ''),
    { ...base('GATUS_DEGRADED_MS', 'status', 1000, 1000), source: 'default', envValue: null },
    base('HOMEPAD_REGISTRATION', 'accounts', 'invite_only', 'invite_only'),
    { ...base('HOMEPAD_MAX_ACCOUNTS', 'accounts', 0, 0), source: 'default', envValue: null },
    base('OIDC_ENABLED', 'signin', true, false),
    base('OIDC_ISSUER', 'signin', 'https://id.example.com', ''),
    { ...base('OIDC_DISCOVERY_URL', 'signin', '', ''), source: 'default', envValue: null },
    base('OIDC_REDIRECT_URL', 'signin', 'https://homepad.example.com/api/auth/oidc/callback', ''),
    base('OIDC_CLIENT_ID', 'signin', 'homepad', ''),
    {
      key: 'OIDC_CLIENT_SECRET',
      group: 'signin',
      type: 'secret',
      saved: false,
      secret: true,
      isSet: true,
      envIsSet: true,
      unreadable: false,
      source: 'env',
      editable: true,
      applies: 'live',
      updatedAt: null,
      updatedBy: null,
    },
    base('OIDC_ADMIN_GROUP', 'signin', 'homepad-admins', ''),
    { ...base('OIDC_MEMBER_GROUP', 'signin', '', ''), source: 'default', envValue: null },
  ];
  return {
    envOnly,
    settings: rows.map((r) => ({
      ...r,
      ...(envOnly && r.editable ? { editable: false, readOnlyReason: 'env_only' as const } : {}),
      ...(over[r.key] ?? {}),
    })),
  };
}

// The same body with one key saved in the UI by Caleb.
export function savedInUi(key: string, value: ServerSetting['value'], body = settingsBody()): ServerSettings {
  return {
    ...body,
    settings: body.settings.map((s) =>
      s.key === key
        ? {
            ...s,
            ...(s.secret ? {} : { value, savedValue: value }),
            saved: true,
            source: 'ui' as const,
            updatedAt: '2026-11-23T18:04:00Z',
            updatedBy: { id: 'u1', name: 'Caleb' },
            ...(s.secret ? { isSet: true } : {}),
          }
        : s,
    ),
  };
}
