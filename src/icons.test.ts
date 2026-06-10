import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_ICON,
  MAX_ICON_BYTES,
  iconSrc,
  validateIconFile,
} from './icons';
import type { Service } from './api';

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// Build a File whose bytes start with the PNG signature (unless magic:false).
function makeFile({ magic = true, size = 256 } = {}): File {
  const arr = new Uint8Array(size);
  if (magic) arr.set(PNG_SIG);
  return new File([arr], 'icon.png', { type: 'image/png' });
}

// Stub createImageBitmap so dimension reads are deterministic in jsdom.
function stubBitmap(width: number, height: number) {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width, height, close: () => {} })),
  );
}

function svc(over: Partial<Service> = {}): Service {
  return {
    id: 's1',
    slug: 's1',
    name: 'Svc',
    description: '',
    url: 'https://x',
    icon: '',
    status: 'UP',
    favorite: false,
    iconLight: false,
    iconDark: false,
    ...over,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('validateIconFile (mirrors backend Q2/Q3/Q4)', () => {
  it('accepts a valid ≤512² ≤256KB PNG', async () => {
    stubBitmap(64, 64);
    await expect(validateIconFile(makeFile())).resolves.toBeNull();
  });

  it('rejects a file over 256 KB before reading bytes', async () => {
    stubBitmap(64, 64);
    const err = await validateIconFile(makeFile({ size: MAX_ICON_BYTES + 1 }));
    expect(err).toMatch(/256 KB/);
  });

  it('rejects a non-PNG by magic-byte sniff (not by filename/type)', async () => {
    // Right name + type, wrong bytes — sniff must still reject.
    const err = await validateIconFile(makeFile({ magic: false }));
    expect(err).toMatch(/PNG/);
  });

  it('rejects a PNG larger than 512×512', async () => {
    stubBitmap(600, 480);
    const err = await validateIconFile(makeFile());
    expect(err).toMatch(/512×512/);
  });

  it('rejects bytes that fail to decode as an image', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new Error('decode failed');
      }),
    );
    const err = await validateIconFile(makeFile());
    expect(err).toMatch(/valid PNG/);
  });
});

describe('iconSrc precedence chain', () => {
  it('uses the uploaded variant matching the active theme', () => {
    expect(iconSrc(svc({ iconLight: true, iconDark: true }), 'light', 0)).toBe(
      '/api/services/s1/icon/light',
    );
    expect(iconSrc(svc({ iconLight: true, iconDark: true }), 'dark', 0)).toBe(
      '/api/services/s1/icon/dark',
    );
  });

  it('falls back to the other uploaded variant when only one exists', () => {
    // Only a dark upload, but the active theme is light → use dark anyway.
    expect(iconSrc(svc({ iconDark: true }), 'light', 0)).toBe('/api/services/s1/icon/dark');
  });

  it('falls back to the legacy icon text (selfh.st CDN) when no upload', () => {
    expect(iconSrc(svc({ icon: 'plex' }), 'light', 0)).toBe(
      'https://cdn.jsdelivr.net/gh/selfhst/icons/svg/plex.svg',
    );
  });

  it('falls back to the bundled local default when nothing is set', () => {
    const src = iconSrc(svc({ icon: '' }), 'light', 0);
    expect(src).toBe(DEFAULT_ICON);
    expect(src.startsWith('http')).toBe(false);
  });

  it('appends a cache-busting query once rev > 0', () => {
    expect(iconSrc(svc({ iconLight: true }), 'light', 3)).toBe('/api/services/s1/icon/light?v=3');
  });
});
