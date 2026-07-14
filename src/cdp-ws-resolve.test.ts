// #344 — playwright-core connectOverCDP(<http url>) intermittently times out on
// the Chrome 148 sidecar: passing an http:// endpoint makes playwright do its
// own /json/version discovery + http→ws upgrade, and that path hangs on the
// updated Chrome build (148.0.7778.97) even though a raw ws:// connect works.
//
// The robust fix: resolve the sidecar's `webSocketDebuggerUrl` ourselves and
// hand connectOverCDP the ws:// URL directly, bypassing playwright's flaky
// http→ws auto-resolution. These tests lock that behavior in.
//
// Named for the observed symptom (connect must reach the sidecar via a ws:// URL,
// not a bare http endpoint), not a theorized root cause — per the retro lesson.
// Dependency-injected (fetchImpl / connectImpl) so the unit suite is hermetic:
// it never touches a real sidecar or spawns a browser.
import { describe, it, expect, vi, beforeEach } from 'vitest';

// cdp.js is CommonJS (qa-kit is scoped to CJS) and ships no .d.ts; import it
// through the module namespace so we get its module.exports regardless of
// interop shape.
// @ts-ignore — untyped CJS helper, shape asserted below.
import * as cdpNs from '../qa-kit/cdp.js';
const cdp = (cdpNs as any).default ?? cdpNs;
const { resolveWsEndpoint, connect } = cdp as {
  resolveWsEndpoint: (url: string, opts?: { fetchImpl?: typeof fetch }) => Promise<string>;
  connect: (opts?: any) => Promise<any>;
};

const WS = 'ws://127.0.0.1:9222/devtools/browser/abc-123';

function fakeFetch(ok: boolean, body: unknown) {
  return vi.fn(async () => ({ ok, json: async () => body })) as unknown as typeof fetch;
}

describe('resolveWsEndpoint — bypass playwright http→ws auto-resolution (#344)', () => {
  it('resolves an http CDP endpoint to the sidecar webSocketDebuggerUrl', async () => {
    const fetchImpl = fakeFetch(true, { webSocketDebuggerUrl: WS });
    const out = await resolveWsEndpoint('http://127.0.0.1:9222', { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith('http://127.0.0.1:9222/json/version');
    expect(out).toBe(WS);
  });

  it('passes a ws:// endpoint straight through (no discovery fetch)', async () => {
    const fetchImpl = fakeFetch(true, {});
    const out = await resolveWsEndpoint(WS, { fetchImpl });
    expect(out).toBe(WS);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('falls back to the original url when discovery fails (never worse than before)', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch;
    const out = await resolveWsEndpoint('http://127.0.0.1:9222', { fetchImpl });
    expect(out).toBe('http://127.0.0.1:9222');
  });

  it('falls back to the original url when /json/version lacks a webSocketDebuggerUrl', async () => {
    const fetchImpl = fakeFetch(true, { Browser: 'Chrome/148' });
    const out = await resolveWsEndpoint('http://127.0.0.1:9222', { fetchImpl });
    expect(out).toBe('http://127.0.0.1:9222');
  });
});

describe('connect() hands connectOverCDP the ws:// URL, not the bare http endpoint (#344)', () => {
  const fakeBrowser = { contexts: () => [{ addCookies: vi.fn() }], newContext: vi.fn(async () => ({ addCookies: vi.fn() })) };
  let connectImpl: ReturnType<typeof vi.fn>;
  beforeEach(() => { connectImpl = vi.fn(async () => fakeBrowser); });

  it('connectOverCDP receives the resolved ws:// debugger URL', async () => {
    const fetchImpl = fakeFetch(true, { webSocketDebuggerUrl: WS });
    await connect({ cdpUrl: 'http://127.0.0.1:9222', fetchImpl, connectImpl });
    expect(connectImpl).toHaveBeenCalledTimes(1);
    expect(connectImpl).toHaveBeenCalledWith(WS);
  });
});
