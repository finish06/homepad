import { afterEach, describe, expect, it, vi } from 'vitest';
import { systemConfig, saveSystemSettings } from './api';

// SPEC cap6-uptime-display-toggle §8 — the client for the two System settings
// endpoints. systemConfig() reads GET /api/system/config and, like authConfig(),
// falls back to the safe default (ON) on any non-200/network error so the grid
// never hides uptime just because the config fetch hiccuped. saveSystemSettings()
// PATCHes /api/admin/settings and returns the persisted config.

function mockFetch(body: BodyInit | null, status: number) {
  const fn = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    new Response(body, { status }),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('systemConfig', () => {
  it('reads showUptimeDisplay:false from /api/system/config', async () => {
    const fn = mockFetch(JSON.stringify({ showUptimeDisplay: false }), 200);
    await expect(systemConfig()).resolves.toEqual({ showUptimeDisplay: false });
    expect(fn).toHaveBeenCalledWith('/api/system/config', { credentials: 'include' });
  });

  it('reads showUptimeDisplay:true', async () => {
    mockFetch(JSON.stringify({ showUptimeDisplay: true }), 200);
    await expect(systemConfig()).resolves.toEqual({ showUptimeDisplay: true });
  });

  it('defaults to ON on a non-200 response (AC-008 safe default)', async () => {
    mockFetch('nope', 500);
    await expect(systemConfig()).resolves.toEqual({ showUptimeDisplay: true });
  });

  it('defaults to ON when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network'); }));
    await expect(systemConfig()).resolves.toEqual({ showUptimeDisplay: true });
  });
});

describe('saveSystemSettings', () => {
  it('PATCHes the patch body and returns the persisted config', async () => {
    const fn = mockFetch(JSON.stringify({ showUptimeDisplay: false }), 200);
    await expect(saveSystemSettings({ showUptimeDisplay: false })).resolves.toEqual({
      showUptimeDisplay: false,
    });
    expect(fn).toHaveBeenCalledWith('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ showUptimeDisplay: false }),
    });
  });

  it('rejects on a non-200 so the caller can revert (error state)', async () => {
    mockFetch('forbidden', 403);
    await expect(saveSystemSettings({ showUptimeDisplay: false })).rejects.toThrow();
  });
});
