import { request, type Result, type User } from './api';

// ---------------------------------------------------------------------------
// SPEC-password-reset-link §7 — passwords. An admin makes a one-time reset link
// for another adult (admin-only); the adult opens it and sets a new password
// (public, rate limited); an adult changes their own. The token is returned
// once, by createResetLink, and travels only in POST bodies and the link's URL
// fragment — never a path or a query string.
//
// These calls live outside api.ts on purpose: api.ts is in the entry chunk, and
// only lazy chunks (the reset screen, the reset-link dialog, My settings) call
// these, so here they cost the first paint nothing (tests/infra/
// code-splitting.test.ts keeps it that way). They go through api.ts's
// request(), so credentials and the network-failure convention are the same.
// ---------------------------------------------------------------------------

export type CreatedResetLink = { id: string; expiresAt: string; token: string };
export type ResetInfo = { email: string; name: string; expiresAt: string };

// post — the Result convention for these four calls: { ok, status, error? }
// plus `data`, the parsed success body. A refusal's `error` is the raw body,
// e.g. {"error":"sso_account"}. Network failure → { ok: false, status: 0 }.
async function post(path: string, success: number, json?: unknown) {
  const { status, res } = await request(path, { method: 'POST', json });
  const ok = res !== null && status === success;
  return {
    ok,
    status,
    res,
    data: ok && status !== 204 ? ((await res.json()) as unknown) : undefined,
    error: ok ? undefined : res ? (await res.text()).trim() || `request failed (${status})` : 'network error',
  };
}

// result keeps { ok, status, error? }, plus retryAfter (seconds) on a refusal
// that sent a usable Retry-After (SPEC-signin-hardening §8).
function result({ ok, status, error, res }: Result & { res: Response | null }): Result {
  const out: Result = error === undefined ? { ok, status } : { ok, status, error };
  const wait = Number(res?.headers.get('Retry-After'));
  if (!ok && wait > 0) out.retryAfter = wait;
  return out;
}

// createResetLink — 201 with the token; 404 when the account isn't an adult
// any more; 409 with {"error":"self"|"sso_account"}.
export async function createResetLink(id: string): Promise<Result & { link?: CreatedResetLink }> {
  const r = await post(`/api/admin/accounts/${encodeURIComponent(id)}/reset-link`, 201);
  return r.ok ? { ...result(r), link: r.data as CreatedResetLink } : result(r);
}

// lookupReset — 200 for a live link; every dead link is the same 404; 429
// when rate limited, with retryAfter.
export async function lookupReset(token: string): Promise<Result & { info?: ResetInfo }> {
  const r = await post('/api/password-resets/lookup', 200, { token });
  return r.ok ? { ...result(r), info: r.data as ResetInfo } : result(r);
}

// acceptReset — sets the password, ends every session of the account and
// signs this device in: 200 with the /api/me body.
export async function acceptReset(token: string, password: string): Promise<Result & { user?: User }> {
  const r = await post('/api/password-resets/accept', 200, { token, password });
  return r.ok ? { ...result(r), user: r.data as User } : result(r);
}

// changePassword — 204; 403 wrong_password; 409 sso_account; 429 with the
// wait in `retryAfter` (seconds) after too many wrong current passwords.
export async function changePassword(currentPassword: string, newPassword: string): Promise<Result> {
  return result(await post('/api/me/password', 204, { currentPassword, newPassword }));
}
