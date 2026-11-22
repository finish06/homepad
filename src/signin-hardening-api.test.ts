import { afterEach, describe, expect, it, vi } from 'vitest';
import { acceptInvite, login, lookupInvite, register } from './api';
import { acceptReset, lookupReset } from './passwordApi';

// SPEC-signin-hardening §8, UX §3.2 — a 429 carries the server's
// Retry-After as `retryAfter` (seconds), so the wait line can say how long.

function mockFetch(body: string, status: number, headers?: Record<string, string>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(body, { status, headers })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const CALLS: [string, () => Promise<{ ok: boolean; status: number; retryAfter?: number }>][] = [
  ['login', () => login('jo@example.com', 'longenough')],
  ['register', () => register('jo@example.com', 'longenough')],
  ['lookupInvite', () => lookupInvite('tok')],
  ['acceptInvite', () => acceptInvite({ token: 'tok', email: 'jo@example.com', password: 'longenough', name: 'Jo' })],
  ['lookupReset', () => lookupReset('tok')],
  ['acceptReset', () => acceptReset('tok', 'longenough')],
];

describe('retryAfter on 429', () => {
  it.each(CALLS)('%s reads Retry-After in seconds', async (_name, call) => {
    mockFetch('too many attempts', 429, { 'Retry-After': '900' });
    await expect(call()).resolves.toMatchObject({ ok: false, status: 429, retryAfter: 900 });
  });

  it.each(CALLS)('%s has none without a usable Retry-After', async (_name, call) => {
    mockFetch('too many attempts', 429, { 'Retry-After': 'soon' });
    const r = await call();
    expect(r.status).toBe(429);
    expect(r.retryAfter).toBeUndefined();
  });

  it('a plain failure has none', async () => {
    mockFetch('invalid email or password', 401);
    expect((await login('jo@example.com', 'longenough')).retryAfter).toBeUndefined();
  });
});
