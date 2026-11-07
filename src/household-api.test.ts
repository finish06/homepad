import { afterEach, describe, expect, it, vi } from 'vitest';
import { accountLimitMessage, isAccountLimit } from './lib/accountLimit';
import {
  acceptInvite,
  authConfig,
  createInvite,
  listInvites,
  lookupInvite,
  revokeInvite,
  type Invite,
} from './api';

// SPEC-household-basics §7/§8 (plan TASK-201) — the client half of the contract
// in docs/plans/household-basics-plan.md: auth config gains the registration
// mode and setupNeeded, the five invite calls, and the cap message helpers.

function mockFetch(body: unknown, status: number, headers?: Record<string, string>) {
  const fn = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(body === null ? null : typeof body === 'string' ? body : JSON.stringify(body), {
        status,
        headers,
      }),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

function networkDown() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const CLOSED = { oidcEnabled: false, registration: 'invite_only', setupNeeded: false };

describe('authConfig — registration mode and setup (AC-004, §8)', () => {
  it('reads registration and setupNeeded alongside oidcEnabled', async () => {
    mockFetch({ oidcEnabled: true, registration: 'open', setupNeeded: true }, 200);
    await expect(authConfig()).resolves.toEqual({ oidcEnabled: true, registration: 'open', setupNeeded: true });
  });

  it('reads invite_only', async () => {
    mockFetch({ oidcEnabled: false, registration: 'invite_only', setupNeeded: false }, 200);
    await expect(authConfig()).resolves.toEqual(CLOSED);
  });

  it('an older API without the fields reads as closed with no setup', async () => {
    mockFetch({ oidcEnabled: false }, 200);
    await expect(authConfig()).resolves.toEqual(CLOSED);
  });

  it('an unknown mode reads as closed', async () => {
    mockFetch({ oidcEnabled: false, registration: 'whatever', setupNeeded: 'yes' }, 200);
    await expect(authConfig()).resolves.toEqual(CLOSED);
  });

  it('a failed call assumes closed and no setup, so "Create account" never shows by accident', async () => {
    mockFetch(null, 500);
    await expect(authConfig()).resolves.toEqual(CLOSED);
    mockFetch('<html>', 200);
    await expect(authConfig()).resolves.toEqual(CLOSED);
    networkDown();
    await expect(authConfig()).resolves.toEqual(CLOSED);
  });
});

const INVITE: Invite = {
  id: 'i1',
  name: 'Jordan',
  role: 'admin',
  createdAt: '2026-11-07T10:00:00Z',
  expiresAt: '2026-11-14T10:00:00Z',
  createdBy: { id: 'u-admin', name: 'Caleb' },
};

describe('admin invite calls (AC-008, AC-011)', () => {
  it('createInvite POSTs {name, role} and returns the one-time token', async () => {
    const created = { ...INVITE, token: 'tok-abc' };
    const fn = mockFetch(created, 201);
    const r = await createInvite('Jordan', 'admin');
    expect(r.ok).toBe(true);
    expect(r.invite).toEqual(created);
    const [url, init] = fn.mock.calls[0];
    expect(url).toBe('/api/admin/invites');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ name: 'Jordan', role: 'admin' });
  });

  it('createInvite passes the cap 409 through', async () => {
    mockFetch('account limit reached (limit 12)', 409);
    const r = await createInvite('Jordan', 'user');
    expect(r).toMatchObject({ ok: false, status: 409, error: 'account limit reached (limit 12)' });
    expect(r.invite).toBeUndefined();
  });

  it('listInvites returns the pending list, and rejects on failure or a non-array', async () => {
    const fn = mockFetch([INVITE], 200);
    await expect(listInvites()).resolves.toEqual([INVITE]);
    expect(fn.mock.calls[0][0]).toBe('/api/admin/invites');
    mockFetch('nope', 500);
    await expect(listInvites()).rejects.toThrow();
    mockFetch({}, 200);
    await expect(listInvites()).rejects.toThrow();
  });

  it('revokeInvite DELETEs by id and is true only on 204', async () => {
    const fn = mockFetch(null, 204);
    await expect(revokeInvite('i/1')).resolves.toBe(true);
    expect(fn.mock.calls[0][0]).toBe('/api/admin/invites/i%2F1');
    expect(fn.mock.calls[0][1]?.method).toBe('DELETE');
    mockFetch('invite not found', 404);
    await expect(revokeInvite('i1')).resolves.toBe(false);
  });
});

describe('public invite calls (AC-012, AC-013)', () => {
  it('lookupInvite POSTs the token in the body, never the URL', async () => {
    const info = { name: 'Alex', role: 'user', inviterName: 'Caleb', expiresAt: '2026-11-14T10:00:00Z' };
    const fn = mockFetch(info, 200);
    const r = await lookupInvite('tok-abc');
    expect(r).toMatchObject({ ok: true, status: 200, invite: info });
    const [url, init] = fn.mock.calls[0];
    expect(url).toBe('/api/invites/lookup');
    expect(String(url)).not.toContain('tok-abc');
    expect(JSON.parse(init?.body as string)).toEqual({ token: 'tok-abc' });
  });

  it('lookupInvite reports a dead link as 404 and a busy server as 429', async () => {
    mockFetch('invite not found', 404);
    await expect(lookupInvite('x')).resolves.toMatchObject({ ok: false, status: 404 });
    mockFetch('too many requests', 429, { 'Retry-After': '2' });
    await expect(lookupInvite('x')).resolves.toMatchObject({ ok: false, status: 429 });
  });

  it('acceptInvite POSTs token, email, password and name, and returns the new account', async () => {
    const user = { id: 'u-alex', email: 'alex@example.com', role: 'user', themePref: 'system' };
    const fn = mockFetch(user, 201);
    const r = await acceptInvite({ token: 'tok', email: 'alex@example.com', password: 'longenough', name: 'Alex' });
    expect(r).toMatchObject({ ok: true, status: 201, user });
    const [url, init] = fn.mock.calls[0];
    expect(url).toBe('/api/invites/accept');
    expect(JSON.parse(init?.body as string)).toEqual({
      token: 'tok',
      email: 'alex@example.com',
      password: 'longenough',
      name: 'Alex',
    });
  });

  it('acceptInvite never sends a role', async () => {
    const fn = mockFetch({}, 201);
    await acceptInvite({ token: 't', email: 'a@b.c', password: 'longenough', name: 'A' });
    expect(JSON.parse(fn.mock.calls[0][1]?.body as string)).not.toHaveProperty('role');
  });

  it('acceptInvite passes 409 and 429 through', async () => {
    mockFetch('email already registered', 409);
    await expect(acceptInvite({ token: 't', email: 'a@b.c', password: 'longenough', name: 'A' })).resolves.toMatchObject({
      ok: false,
      status: 409,
    });
    networkDown();
    await expect(acceptInvite({ token: 't', email: 'a@b.c', password: 'longenough', name: 'A' })).resolves.toMatchObject({
      ok: false,
      status: 0,
    });
  });
});

describe('account cap helpers (AC-029, AC-031)', () => {
  it('a 409 that starts with "account limit reached" is the cap', () => {
    expect(isAccountLimit({ ok: false, status: 409, error: 'account limit reached (limit 12)' })).toBe(true);
    expect(isAccountLimit({ ok: false, status: 409, error: 'Account limit reached' })).toBe(true);
  });

  it('any other 409 keeps its meaning', () => {
    expect(isAccountLimit({ ok: false, status: 409, error: 'a kid with that name already exists' })).toBe(false);
    expect(isAccountLimit({ ok: false, status: 409, error: 'email already registered' })).toBe(false);
    expect(isAccountLimit({ ok: false, status: 400, error: 'account limit reached' })).toBe(false);
    expect(isAccountLimit({ ok: true, status: 201 })).toBe(false);
  });

  it('the message names the number when the API gives one', () => {
    expect(accountLimitMessage('account limit reached (limit 12)')).toBe(
      'This Homepad has reached its limit of 12 accounts.',
    );
    expect(accountLimitMessage('account limit reached (limit 1)')).toBe(
      'This Homepad has reached its limit of 1 account.',
    );
    expect(accountLimitMessage('account limit reached')).toBe('This Homepad has reached its account limit.');
    expect(accountLimitMessage(undefined)).toBe('This Homepad has reached its account limit.');
  });
});
