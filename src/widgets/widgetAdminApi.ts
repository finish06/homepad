import type { WidgetField, WidgetUnit } from '../api';
import { call } from './widgetsInfo';

// SPEC-status-widgets §7.3 — the admin widget calls. Imported ONLY by the lazy
// editors (the tile editor's Widget section, Admin Panel → Widgets), so none of
// this reaches the entry chunk (AC-033; tests/infra/code-splitting.test.ts).
//
// A key is write-only (AC-003): it appears in WidgetInput.secret and nowhere
// else. The read shape carries `hasSecret` only.

export type AuthType = 'none' | 'api_key' | 'password' | 'user_password' | 'token';
export type FieldSpec = { key: string; label: string; unit: WidgetUnit; default: boolean };
export type WidgetKind = {
  kind: string;
  label: string;
  auth: AuthType;
  fields: FieldSpec[];
  match: string[];
  help: string;
};
export type KindsResponse = { secretKeySet: boolean; kinds: WidgetKind[] };

export type WidgetConfig = {
  kind: string;
  address: string;
  username: string;
  hasSecret: boolean;
  fields: string[];
  intervalS: number;
  insecureTls: boolean;
  enabled: boolean;
  state: 'loading' | 'ok' | 'stale' | 'error';
  error: string;
  lastOkAt: string | null;
  lastCheckAt: string | null;
};

export type WidgetInput = {
  kind: string;
  address: string;
  username?: string;
  // Omitted = keep the saved key, "" = clear it, anything else replaces it.
  secret?: string;
  fields: string[];
  intervalS: number;
  insecureTls: boolean;
  enabled: boolean;
};

export type TestResult =
  | { ok: true; version: string; fields: WidgetField[] }
  | { ok: false; error: string; message?: string };

export type Place = { name: string; region: string; country: string; lat: number; lon: number };

export type WidgetSettings = {
  clockEnabled: boolean;
  clockHour12: boolean | null;
  weatherEnabled: boolean;
  weatherPlace: string;
  weatherUnits: 'c' | 'f';
  webSearchEnabled: boolean;
  webSearchUrl: string;
  kidWebSearch: boolean;
};

export type WidgetSettingsPatch = Partial<WidgetSettings> & { weatherLat?: number; weatherLon?: number };

const widgetPath = (id: string) => `/api/services/${encodeURIComponent(id)}/widget`;

export async function widgetKinds(): Promise<KindsResponse | null> {
  const { status, data } = await call('/api/admin/widgets/kinds');
  const d = data as KindsResponse | null;
  return status === 200 && d && Array.isArray(d.kinds) ? d : null;
}

export async function getWidget(
  id: string,
): Promise<{ status: 'ok'; config: WidgetConfig } | { status: 'none' } | { status: 'error' }> {
  const { status, data } = await call(widgetPath(id));
  if (status === 200 && data) return { status: 'ok', config: data as WidgetConfig };
  return status === 404 ? { status: 'none' } : { status: 'error' };
}

export type PutResult =
  | { ok: true; config: WidgetConfig }
  | { ok: false; status: number; field?: string; message?: string };

export async function putWidget(id: string, input: WidgetInput): Promise<PutResult> {
  const { status, data } = await call(widgetPath(id), 'PUT', input);
  if (status === 200) return { ok: true, config: data as WidgetConfig };
  const d = data as { field?: string; message?: string } | null;
  if (status === 422 && d) return { ok: false, status, field: d.field, message: d.message };
  return { ok: false, status };
}

export async function deleteWidget(id: string): Promise<boolean> {
  return (await call(widgetPath(id), 'DELETE')).status === 204;
}

// A failed test is a successful call (200 {ok:false, error}); 429 and 422 are
// the only other answers the editor words specially.
export async function testWidget(id: string, input: WidgetInput): Promise<TestResult> {
  const { status, data } = await call(`${widgetPath(id)}/test`, 'POST', input);
  if (status === 200 && data) return data as TestResult;
  if (status === 429) return { ok: false, error: 'rate_limited' };
  if (status === 422) return { ok: false, error: 'invalid', message: (data as { message?: string } | null)?.message };
  return { ok: false, error: 'request_failed' };
}

export async function geocode(q: string): Promise<Place[] | 'unreachable'> {
  const { status, data } = await call(`/api/admin/geocode?q=${encodeURIComponent(q)}`);
  return status === 200 && Array.isArray(data) ? (data as Place[]) : 'unreachable';
}

export async function saveWidgetSettings(patch: WidgetSettingsPatch): Promise<WidgetSettings | null> {
  const { status, data } = await call('/api/admin/settings', 'PATCH', patch);
  const w = (data as { widgets?: WidgetSettings } | null)?.widgets;
  return status === 200 && w ? w : null;
}
