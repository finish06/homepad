// Thin client over the homepad-api endpoints. Same-domain deploy means the
// session cookie is sent automatically; credentials:'include' keeps that
// working through the Vite dev proxy too.

// The per-user theme preference (v3). `system` follows the OS; `light`/`dark`
// pin a surface. Stored server-side on the user row, surfaced on every auth
// touchpoint (`me`/`login`/`register`) so the client never needs an extra read.
export type ThemePref = 'system' | 'light' | 'dark';

export type User = { id: string; email: string; role: string; themePref: ThemePref };

export type ServiceStatus = 'UP' | 'DOWN' | 'DEGRADED' | 'UNKNOWN';

export type IconVariant = 'light' | 'dark';

export type Service = {
  id: string;
  slug: string;
  name: string;
  description: string;
  url: string;
  icon: string;
  status: ServiceStatus;
  favorite: boolean;
  // Whether an admin-uploaded PNG exists for each variant (bytes are never in
  // the list response — only these flags). Default false for older payloads.
  iconLight: boolean;
  iconDark: boolean;
};

export type Result = { ok: boolean; status: number; error?: string };

// The admin-editable catalog fields for create/update (A6), keyed by their
// snake_case wire names. The server never returns `gatus_key` (it stays
// server-side, resolved into `status`), so the edit form can't prefill it —
// see ServiceForm for how a blank key is omitted from a PATCH.
export type ServiceInput = {
  slug: string;
  name: string;
  description: string;
  url: string;
  icon: string;
  gatus_key: string;
};

export type AuthConfig = { oidcEnabled: boolean };

const jsonHeaders = { 'Content-Type': 'application/json' };

async function errorText(res: Response): Promise<string> {
  const text = (await res.text()).trim();
  return text || `request failed (${res.status})`;
}

// authConfig reports which login methods the API offers. A non-200 or failed
// request is treated as "OIDC off" so the PocketID button stays hidden.
export async function authConfig(): Promise<AuthConfig> {
  try {
    const res = await fetch('/api/auth/config', { credentials: 'include' });
    if (res.status !== 200) return { oidcEnabled: false };
    const data = (await res.json()) as { oidcEnabled?: boolean };
    return { oidcEnabled: data.oidcEnabled === true };
  } catch {
    return { oidcEnabled: false };
  }
}

export async function me(): Promise<User | null> {
  const res = await fetch('/api/me', { credentials: 'include' });
  return res.status === 200 ? ((await res.json()) as User) : null;
}

export async function login(email: string, password: string): Promise<Result & { user?: User }> {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: jsonHeaders,
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });
  if (res.status === 200) return { ok: true, status: 200, user: (await res.json()) as User };
  return { ok: false, status: res.status, error: await errorText(res) };
}

export async function register(email: string, password: string): Promise<Result> {
  const res = await fetch('/api/register', {
    method: 'POST',
    headers: jsonHeaders,
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });
  if (res.status === 201) return { ok: true, status: 201 };
  return { ok: false, status: res.status, error: await errorText(res) };
}

export async function logout(): Promise<void> {
  await fetch('/api/logout', { method: 'POST', credentials: 'include' });
}

export async function services(): Promise<Service[]> {
  const res = await fetch('/api/services', { credentials: 'include' });
  if (res.status !== 200) return [];
  const data = (await res.json()) as { services: Service[] };
  return data.services ?? [];
}

// setFavorite marks (on) or unmarks (off) a service for the current user.
// Returns true on success so the caller can roll back an optimistic update.
export async function setFavorite(id: string, on: boolean): Promise<boolean> {
  const res = await fetch(`/api/favorites/${id}`, {
    method: on ? 'POST' : 'DELETE',
    credentials: 'include',
  });
  return res.status === 204;
}

// uploadIcon PUTs a raw PNG for a service's light/dark variant (admin-only;
// the server 403s a non-admin). The bytes ARE the body — no multipart, no
// base64. Same idempotent upsert covers first upload and replace. Returns the
// Result so the caller can surface the server's validation error inline.
export async function uploadIcon(id: string, variant: IconVariant, png: Blob): Promise<Result> {
  const res = await fetch(`/api/services/${id}/icon/${variant}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/png' },
    credentials: 'include',
    body: png,
  });
  if (res.status === 204) return { ok: true, status: 204 };
  return { ok: false, status: res.status, error: await errorText(res) };
}

// deleteIcon removes a service's uploaded variant (admin-only; idempotent 204).
// The tile then falls back per the precedence chain. Returns true on success.
export async function deleteIcon(id: string, variant: IconVariant): Promise<boolean> {
  const res = await fetch(`/api/services/${id}/icon/${variant}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  return res.status === 204;
}

// deleteService removes a service from the shared catalog (admin-only; the
// server 403s a non-admin). Its uploaded icons cascade away server-side.
// Returns true on success so the caller can roll back an optimistic removal.
export async function deleteService(id: string): Promise<boolean> {
  const res = await fetch(`/api/services/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  return res.status === 204;
}

// createService adds a new entry to the shared catalog (admin-only; the server
// 403s a non-admin, 409s a slug collision, 400s missing required fields). On
// success it returns the created service so the caller can append it without a
// refetch; on failure it surfaces the server's message inline, like uploadIcon.
export async function createService(input: ServiceInput): Promise<Result & { service?: Service }> {
  const res = await fetch('/api/services', {
    method: 'POST',
    headers: jsonHeaders,
    credentials: 'include',
    body: JSON.stringify(input),
  });
  if (res.status === 201) return { ok: true, status: 201, service: (await res.json()) as Service };
  return { ok: false, status: res.status, error: await errorText(res) };
}

// updateService patches an existing catalog entry (admin-only; same 403/409 as
// create, plus 404 for an unknown id). Only the fields present in `patch` are
// changed server-side. Returns the updated service on success so the caller can
// reflect the change inline.
export async function updateService(
  id: string,
  patch: Partial<ServiceInput>,
): Promise<Result & { service?: Service }> {
  const res = await fetch(`/api/services/${id}`, {
    method: 'PATCH',
    headers: jsonHeaders,
    credentials: 'include',
    body: JSON.stringify(patch),
  });
  if (res.status === 200) return { ok: true, status: 200, service: (await res.json()) as Service };
  return { ok: false, status: res.status, error: await errorText(res) };
}

// setLayout persists the current user's personal tile order (A5). `order` is the
// list of service ids, position 0 first. Returns true on success so the caller
// can roll back an optimistic reorder.
export async function setLayout(order: string[]): Promise<boolean> {
  const res = await fetch('/api/layout', {
    method: 'PUT',
    headers: jsonHeaders,
    credentials: 'include',
    body: JSON.stringify({ order }),
  });
  return res.status === 204;
}

// setThemePref persists the current user's theme choice (v3) via PATCH /api/me.
// Session-gated server-side (a user sets only their own theme); an invalid value
// is rejected 400. Returns true on 200 so the caller can roll back an optimistic
// update — same shape as setFavorite/setLayout.
export async function setThemePref(pref: ThemePref): Promise<boolean> {
  const res = await fetch('/api/me', {
    method: 'PATCH',
    headers: jsonHeaders,
    credentials: 'include',
    body: JSON.stringify({ themePref: pref }),
  });
  return res.status === 200;
}
