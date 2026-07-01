// Thin client over the homepad-api endpoints. Same-domain deploy means the
// session cookie is sent automatically; credentials:'include' keeps that
// working through the Vite dev proxy too.

// The per-user theme preference (v3). `system` follows the OS; `light`/`dark`
// pin a surface. Stored server-side on the user row, surfaced on every auth
// touchpoint (`me`/`login`/`register`) so the client never needs an extra read.
export type ThemePref = 'system' | 'light' | 'dark';

// v7 §6.2: `name` is the optional display name surfaced by /api/me (empty when
// unset). The avatar derives real initials from it, falling back to the email's
// first letter. Optional so older payloads / fixtures read as "no name".
export type User = { id: string; email: string; role: string; themePref: ThemePref; name?: string };

export type ServiceStatus = 'UP' | 'DOWN' | 'DEGRADED' | 'UNKNOWN' | 'NOT_MONITORED';

export type IconVariant = 'light' | 'dark';

// One historical Gatus check backing the tile uptime sparkline. `success` drives
// the dot color; `timestamp` is reserved for a future hover/tooltip detail.
export type UptimeCheck = { success: boolean; timestamp: string };

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
  // v4: the tile's category (null/absent → Uncategorized). Denormalized
  // `categoryName` rides along so the client can render section headers without
  // a second lookup. Optional so older payloads (and test fixtures) read as
  // Uncategorized without churn.
  categoryId?: string | null;
  categoryName?: string | null;
  // The recent Gatus check history (≤20, oldest-first) backing the tile uptime
  // sparkline. Optional/absent → no monitoring; the tile shows no sparkline.
  uptimeChecks?: UptimeCheck[];
};

// A v4 category: admin-managed shared-catalog metadata. `sortIndex` is the
// admin-controlled order (not alphabetical). The layout fields (SPEC category
// pane width) place the category in a 2D grid: `layoutRow` groups side-by-side
// panes, `layoutColOrder` orders within a row, `layoutWidthPct` (10–100) is the
// pane's share of screen width. Defaults (row=sortIndex, col=0, width=100)
// reproduce the pre-feature stacked full-width layout.
export type Category = {
  id: string;
  name: string;
  sortIndex: number;
  // Optional on the type: a pre-migration server omits them and hand-built
  // Category literals (tests, fixtures) needn't set them. `categories()` always
  // backfills the defaults below, so objects that flow from the API have them;
  // layout consumers normalize with the same defaults for any that don't.
  layoutRow?: number;
  layoutColOrder?: number;
  layoutWidthPct?: number;
};

// A single category's layout assignment, the wire shape for the atomic bulk save.
export type CategoryLayout = {
  id: string;
  layoutRow: number;
  layoutColOrder: number;
  layoutWidthPct: number;
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

// v9.2/v9.3: a library offer — admin-curated catalog metadata any user can browse
// (`GET /api/library`) and copy onto their own dashboard. `added` is the per-user
// hint (do I already hold a copy — D6, non-blocking). `suggestedCategory` is a
// free-text hint, not a category id (D5).
export type LibraryOffer = {
  id: string;
  name: string;
  url: string;
  icon: string;
  description: string;
  suggestedCategory: string;
  sortIndex: number;
  added: boolean;
};

// The admin-editable library fields for create/update (A8). No `sortIndex` —
// order is managed via setLibraryOrder, and a create appends at the end.
export type LibraryAppInput = {
  name: string;
  url: string;
  icon: string;
  description: string;
  suggestedCategory: string;
};

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

// servicesWithStatus is the richer form used by the v13 auto-refresh poll: it
// surfaces the HTTP status alongside the list so the poller can tell a transient
// failure (keep the old data — AC-008) from a 401 session expiry (stop polling —
// AC-011). `status: 0` signals a network/throw. A non-200 yields an empty list,
// which the poller never applies — it only merges on a 200.
export async function servicesWithStatus(): Promise<{ status: number; services: Service[] }> {
  try {
    const res = await fetch('/api/services', { credentials: 'include' });
    if (res.status !== 200) return { status: res.status, services: [] };
    const data = (await res.json()) as { services: Service[] };
    return { status: 200, services: data.services ?? [] };
  } catch {
    return { status: 0, services: [] };
  }
}

export async function services(): Promise<Service[]> {
  return (await servicesWithStatus()).services;
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

// deleteService removes one of the caller's OWN dashboard services (v9 owner-
// scoped — any authenticated user may remove a service they own; another user's
// id 404s). Its uploaded icons cascade away server-side. Returns true on success
// so the caller can roll back an optimistic removal.
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

// categories lists the shared catalog's categories in admin sort_index order
// (v4). Session-gated server-side; a non-200 yields [] so the catalog falls back
// to the flat v1 render rather than erroring.
export async function categories(): Promise<Category[]> {
  const res = await fetch('/api/categories', { credentials: 'include' });
  if (res.status !== 200) return [];
  const data = (await res.json()) as { categories: Partial<Category>[] };
  // Default the layout fields so a pre-migration server (no layout columns)
  // renders identically to before: each category on its own row (row=sortIndex),
  // first column, full width (AC9).
  return (data.categories ?? []).map((c) => ({
    id: c.id!,
    name: c.name!,
    sortIndex: c.sortIndex!,
    layoutRow: c.layoutRow ?? c.sortIndex!,
    layoutColOrder: c.layoutColOrder ?? 0,
    layoutWidthPct: c.layoutWidthPct ?? 100,
  }));
}

// saveCategoryLayout persists a batch of category layout assignments via the
// atomic bulk endpoint (all-or-nothing server-side — AC10). Returns true on 200
// so the caller can roll back an optimistic drag/resize on failure.
export async function saveCategoryLayout(layout: CategoryLayout[]): Promise<boolean> {
  const res = await fetch('/api/categories/layout', {
    method: 'PUT',
    headers: jsonHeaders,
    credentials: 'include',
    body: JSON.stringify({ layout }),
  });
  return res.status === 200;
}

// createCategory adds a category to the shared catalog (v4; admin-only — the
// server 403s a non-admin, 409s a duplicate name, 400s an empty name). On
// success it returns the created category (appended last) so the caller can add
// it without a refetch; on failure it surfaces the server message inline.
export async function createCategory(
  name: string,
): Promise<Result & { category?: Category }> {
  const res = await fetch('/api/categories', {
    method: 'POST',
    headers: jsonHeaders,
    credentials: 'include',
    body: JSON.stringify({ name }),
  });
  if (res.status === 201) return { ok: true, status: 201, category: (await res.json()) as Category };
  return { ok: false, status: res.status, error: await errorText(res) };
}

// renameCategory changes a category's name (v4; admin-only — 403 non-admin, 409
// duplicate name, 404 unknown id). Returns the updated category on 200 so the
// caller can reflect it inline.
export async function renameCategory(
  id: string,
  name: string,
): Promise<Result & { category?: Category }> {
  const res = await fetch(`/api/categories/${id}`, {
    method: 'PATCH',
    headers: jsonHeaders,
    credentials: 'include',
    body: JSON.stringify({ name }),
  });
  if (res.status === 200) return { ok: true, status: 200, category: (await res.json()) as Category };
  return { ok: false, status: res.status, error: await errorText(res) };
}

// deleteCategory removes a category (v4; admin-only; idempotent 204). The FK is
// ON DELETE SET NULL, so its apps fall back to Uncategorized — none are deleted.
// Returns true on success so the caller can roll back an optimistic removal.
export async function deleteCategory(id: string): Promise<boolean> {
  const res = await fetch(`/api/categories/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  return res.status === 204;
}

// setCategoryOrder persists the admin category order (v4) — the same whole-array
// contract as setLayout. `order` is the list of category ids, position 0 first;
// the server rewrites each `sort_index`. Returns true on 204 so the caller can
// roll back an optimistic reorder.
export async function setCategoryOrder(order: string[]): Promise<boolean> {
  const res = await fetch('/api/categories/order', {
    method: 'PUT',
    headers: jsonHeaders,
    credentials: 'include',
    body: JSON.stringify({ order }),
  });
  return res.status === 204;
}

// assignCategory sets (or clears) a service's category via the v4-extended
// PATCH /api/services/{id} (admin-only). `categoryId` is the target category, or
// `null` to clear to Uncategorized — always sent, so the change is explicit (a
// bogus id → 400). Returns the updated service on 200 so the caller can reflect
// the new categoryId/categoryName inline.
export async function assignCategory(
  serviceId: string,
  categoryId: string | null,
): Promise<Result & { service?: Service }> {
  const res = await fetch(`/api/services/${serviceId}`, {
    method: 'PATCH',
    headers: jsonHeaders,
    credentials: 'include',
    body: JSON.stringify({ categoryId }),
  });
  if (res.status === 200) return { ok: true, status: 200, service: (await res.json()) as Service };
  return { ok: false, status: res.status, error: await errorText(res) };
}

// getCollapsedCategories reads the current user's collapsed category-id set (v5;
// session-gated server-side). A row means "this user folded this category";
// absence = expanded, the default. Any non-200 (incl. 401) or a parse failure
// yields [] so the catalog renders fully expanded — identical to v4 — rather
// than erroring. This is also the first-paint fallback when no backend answers.
export async function getCollapsedCategories(): Promise<string[]> {
  try {
    const res = await fetch('/api/me/collapsed-categories', { credentials: 'include' });
    if (res.status !== 200) return [];
    const data = (await res.json()) as { collapsed?: string[] };
    return data.collapsed ?? [];
  } catch {
    return [];
  }
}

// setCollapsedCategories replaces the user's collapsed set with exactly `ids`
// (v5; whole-set PUT, same contract as setLayout/setCategoryOrder). The server
// silently drops unknown/stale ids (a category deleted between read and write),
// so this only fails on a real error. Returns true on 204 so the caller can roll
// back an optimistic toggle.
export async function setCollapsedCategories(ids: string[]): Promise<boolean> {
  const res = await fetch('/api/me/collapsed-categories', {
    method: 'PUT',
    headers: jsonHeaders,
    credentials: 'include',
    body: JSON.stringify({ collapsed: ids }),
  });
  return res.status === 204;
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

// listLibrary browses the App Library — every offer in sort_index order, each
// tagged with the caller's `added` hint (A9). Any authenticated user; a non-200
// yields [] so the browse surface shows the empty state rather than erroring.
export async function listLibrary(): Promise<LibraryOffer[]> {
  const res = await fetch('/api/library', { credentials: 'include' });
  if (res.status !== 200) return [];
  const data = (await res.json()) as { library?: LibraryOffer[] };
  return data.library ?? [];
}

// addFromLibrary copies an offer onto the CALLER's own dashboard (A10) and returns
// the new service so the caller can append it without a refetch. An optional
// `categoryId` files the copy (must be the caller's own — a foreign/bogus id 400s,
// A11); omitted → no body, lands Uncategorized (D4). 404 on an unknown offer.
export async function addFromLibrary(
  id: string,
  categoryId?: string,
): Promise<Result & { service?: Service }> {
  const res = await fetch(`/api/library/${id}/add`, {
    method: 'POST',
    credentials: 'include',
    ...(categoryId !== undefined
      ? { headers: jsonHeaders, body: JSON.stringify({ categoryId }) }
      : {}),
  });
  if (res.status === 201) return { ok: true, status: 201, service: (await res.json()) as Service };
  return { ok: false, status: res.status, error: await errorText(res) };
}

// createLibraryApp adds a new offer to the App Library (admin only — 403 non-admin,
// 400 missing name/url). Appends at the end of the browse order. Returns the
// created offer on 201 so the manager can reflect it without a refetch.
export async function createLibraryApp(
  input: LibraryAppInput,
): Promise<Result & { offer?: LibraryOffer }> {
  const res = await fetch('/api/library', {
    method: 'POST',
    headers: jsonHeaders,
    credentials: 'include',
    body: JSON.stringify(input),
  });
  if (res.status === 201) return { ok: true, status: 201, offer: (await res.json()) as LibraryOffer };
  return { ok: false, status: res.status, error: await errorText(res) };
}

// updateLibraryApp edits an offer (admin only — 403 non-admin, 404 unknown id).
// Only the fields present in `patch` change; editing does NOT propagate to copies
// users already hold (C1). Returns the updated offer on 200.
export async function updateLibraryApp(
  id: string,
  patch: Partial<LibraryAppInput>,
): Promise<Result & { offer?: LibraryOffer }> {
  const res = await fetch(`/api/library/${id}`, {
    method: 'PATCH',
    headers: jsonHeaders,
    credentials: 'include',
    body: JSON.stringify(patch),
  });
  if (res.status === 200) return { ok: true, status: 200, offer: (await res.json()) as LibraryOffer };
  return { ok: false, status: res.status, error: await errorText(res) };
}

// deleteLibraryApp removes an offer (admin only; idempotent 204). Existing copies
// are untouched — their source_library_id goes NULL via the FK (C1/OQ5). Returns
// true on 204 so the manager can roll back an optimistic removal.
export async function deleteLibraryApp(id: string): Promise<boolean> {
  const res = await fetch(`/api/library/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  return res.status === 204;
}

// setLibraryOrder persists the admin browse order (admin only) — the same
// whole-array contract as setCategoryOrder/setLayout. `order` is the list of offer
// ids, position 0 first. Returns true on 204 so the manager can roll back.
export async function setLibraryOrder(order: string[]): Promise<boolean> {
  const res = await fetch('/api/library/order', {
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
