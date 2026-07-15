import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminEnvConfig } from './api';

// SPEC-v26 §6.2 AC-015 — the client for GET /api/admin/env-config. Unlike the
// tolerant reads (systemConfig/authConfig), this REJECTS on a non-200 so the
// SystemSettings panel can catch and show its in-place error state (§8.4). On
// 200 it resolves the typed {key,value}[] array verbatim.

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

describe('adminEnvConfig', () => {
  it('resolves the typed {key,value}[] array on 200', async () => {
    const rows = [
      { key: 'GATUS_BASE_URL', value: 'http://gatus.kube.local' },
      { key: 'PORT', value: '' },
    ];
    const fn = mockFetch(JSON.stringify(rows), 200);
    await expect(adminEnvConfig()).resolves.toEqual(rows);
    expect(fn).toHaveBeenCalledWith('/api/admin/env-config', { credentials: 'include' });
  });

  it('rejects on a 403 (non-admin) so the caller can show the error state', async () => {
    mockFetch('forbidden', 403);
    await expect(adminEnvConfig()).rejects.toThrow();
  });

  it('rejects on a 500', async () => {
    mockFetch('boom', 500);
    await expect(adminEnvConfig()).rejects.toThrow();
  });

  it('rejects when the network throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network'); }));
    await expect(adminEnvConfig()).rejects.toThrow();
  });
});
