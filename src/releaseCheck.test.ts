import { describe, expect, it, vi, afterEach } from 'vitest';
import { fetchVersionInfo, isNewRelease, parseVersionInfo } from './releaseCheck';

describe('parseVersionInfo', () => {
  it('accepts a well-formed payload', () => {
    expect(parseVersionInfo({ version: '13.4.0', sha: 'abc1234', builtAt: '2026-08-30T00:00:00Z' }))
      .toEqual({ version: '13.4.0', sha: 'abc1234', builtAt: '2026-08-30T00:00:00Z' });
  });

  it('tolerates a missing builtAt', () => {
    expect(parseVersionInfo({ version: '13.4.0', sha: 'abc1234' }))
      .toEqual({ version: '13.4.0', sha: 'abc1234', builtAt: undefined });
  });

  it('rejects malformed payloads instead of throwing', () => {
    expect(parseVersionInfo(null)).toBeNull();
    expect(parseVersionInfo('html error page')).toBeNull();
    expect(parseVersionInfo({ version: 1, sha: 'abc' })).toBeNull();
    expect(parseVersionInfo({ version: '13.4.0' })).toBeNull();
  });
});

describe('isNewRelease', () => {
  const info = { version: '13.4.0', sha: 'bbbbbbb' };

  it('is true when the deployed sha differs from the running sha', () => {
    expect(isNewRelease('aaaaaaa', info)).toBe(true);
  });

  it('is false when shas match', () => {
    expect(isNewRelease('bbbbbbb', info)).toBe(false);
  });

  it('never fires for dev builds on either side', () => {
    expect(isNewRelease('dev', info)).toBe(false);
    expect(isNewRelease('aaaaaaa', { version: '13.4.0', sha: 'dev' })).toBe(false);
  });

  it('is false when the fetch produced nothing', () => {
    expect(isNewRelease('aaaaaaa', null)).toBe(false);
  });
});

describe('fetchVersionInfo', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fetches /version.json with no-store and parses it', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: '13.4.0', sha: 'bbbbbbb' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchVersionInfo()).resolves.toEqual({
      version: '13.4.0',
      sha: 'bbbbbbb',
      builtAt: undefined,
    });
    expect(fetchMock).toHaveBeenCalledWith('/version.json', { cache: 'no-store' });
  });

  it('returns null on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    await expect(fetchVersionInfo()).resolves.toBeNull();
  });

  it('returns null when fetch rejects or the body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')));
    await expect(fetchVersionInfo()).resolves.toBeNull();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError('SPA fallback HTML');
      },
    }));
    await expect(fetchVersionInfo()).resolves.toBeNull();
  });
});
