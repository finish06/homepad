import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  acceptInvite,
  createInvite,
  listAccounts,
  listInvites,
  login,
  lookupInvite,
  me,
  setAccountRole,
} from './api';
import { acceptReset } from './passwordApi';

// SPEC-decisions-18.4.0 AC-007 (#599) — the API now says `member`. The web
// sends `member`, and reads an older API's `user` as `member` too, so the rest
// of the app only ever sees admin, member or kid.

function mockFetch(body: unknown, status = 200) {
  const fn = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const sentRole = (fn: ReturnType<typeof mockFetch>) => JSON.parse(fn.mock.calls[0][1]?.body as string).role;

describe('the member role (AC-007)', () => {
  it('createInvite and setAccountRole send member', async () => {
    let fn = mockFetch({ id: 'i1', name: 'Pat', role: 'member', token: 't', createdAt: '', expiresAt: '' }, 201);
    await createInvite('Pat', 'member');
    expect(sentRole(fn)).toBe('member');

    fn = mockFetch({ id: 'u1', name: 'Pat', role: 'member', lastSeenAt: null, avatarColor: '' });
    await setAccountRole('u1', 'member');
    expect(sentRole(fn)).toBe('member');
  });

  it.each(['member', 'user'])('reads %s as member everywhere', async (wire) => {
    mockFetch({ id: 'u1', email: 'a@example.com', role: wire, themePref: 'system' });
    expect((await me())?.role).toBe('member');

    mockFetch({ id: 'u1', email: 'a@example.com', role: wire, themePref: 'system' });
    expect((await login('a@example.com', 'pw')).user?.role).toBe('member');

    mockFetch({ id: 'u1', email: 'a@example.com', role: wire, themePref: 'system' }, 201);
    expect((await acceptInvite({ token: 't', email: 'a@example.com', password: 'pw', name: '' })).user?.role).toBe(
      'member',
    );

    mockFetch([
      { id: 'u1', name: 'A', role: wire, lastSeenAt: null, avatarColor: '' },
      { id: 'u2', name: 'B', role: 'admin', lastSeenAt: null, avatarColor: '' },
      { id: 'k1', name: 'K', role: 'kid', lastSeenAt: null, avatarColor: 'blue' },
    ]);
    expect((await listAccounts()).map((a) => a.role)).toEqual(['member', 'admin', 'kid']);

    mockFetch({ id: 'u1', name: 'A', role: wire, lastSeenAt: null, avatarColor: '' });
    expect((await setAccountRole('u1', 'member')).account?.role).toBe('member');

    mockFetch({ id: 'i1', name: 'Pat', role: wire, token: 't', createdAt: '', expiresAt: '' }, 201);
    expect((await createInvite('Pat', 'member')).invite?.role).toBe('member');

    mockFetch([{ id: 'i1', name: 'Pat', role: wire, createdAt: '', expiresAt: '', createdBy: { id: 'a', name: 'C' } }]);
    expect((await listInvites()).map((i) => i.role)).toEqual(['member']);

    mockFetch({ name: 'Pat', role: wire, inviterName: 'C', expiresAt: '' });
    expect((await lookupInvite('t')).invite?.role).toBe('member');
  });

  it('a reset-link sign-in reads user as member', async () => {
    mockFetch({ id: 'u1', email: 'a@example.com', role: 'user', themePref: 'system' });
    const r = await acceptReset('tok', 'a long enough password');
    expect(r.user?.role).toBe('member');
  });
});
