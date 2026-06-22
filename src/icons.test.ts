import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_ICON,
  MAX_ICON_BYTES,
  appInitials,
  iconSrc,
  initialBadge,
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

  it('returns the icon field verbatim as a full URL when no upload', () => {
    expect(iconSrc(svc({ icon: 'https://example.com/icon.png' }), 'light', 0)).toBe(
      'https://example.com/icon.png',
    );
  });

  it('falls back to a colored initials badge (not the gray square) when nothing is set', () => {
    // issue #85: the no-icon default is a name-hashed colored badge, so the
    // catalog stays scannable without real icons. It is purely local (a data
    // URI) and carries the app's initials.
    const src = iconSrc(svc({ name: 'Plex', icon: '' }), 'light', 0);
    expect(src).toBe(initialBadge('Plex'));
    expect(src).not.toBe(DEFAULT_ICON);
    expect(src.startsWith('data:image/svg+xml,')).toBe(true);
    expect(decodeURIComponent(src)).toContain('PL');
  });

  it('appends a cache-busting query once rev > 0', () => {
    expect(iconSrc(svc({ iconLight: true }), 'light', 3)).toBe('/api/services/s1/icon/light?v=3');
  });
});

describe('appInitials (mirrors the userInitials rule for app names)', () => {
  it('takes the first letter of the first and last words for multi-word names', () => {
    expect(appInitials('Home Assistant')).toBe('HA');
    expect(appInitials('Pi hole Admin')).toBe('PA');
  });

  it('takes the first two letters of a single-word name', () => {
    expect(appInitials('Plex')).toBe('PL');
    expect(appInitials('Pi-hole')).toBe('PI');
  });

  it('uppercases and falls back to ? for an empty/blank name', () => {
    expect(appInitials('sonarr')).toBe('SO');
    expect(appInitials('')).toBe('?');
    expect(appInitials('   ')).toBe('?');
  });
});

describe('initialBadge (issue #85 colored name badge)', () => {
  it('is a local SVG data URI carrying the initials', () => {
    const badge = initialBadge('Plex');
    expect(badge.startsWith('data:image/svg+xml,')).toBe(true);
    expect(badge.startsWith('http')).toBe(false);
    expect(decodeURIComponent(badge)).toContain('>PL<');
  });

  it('is deterministic for the same name', () => {
    expect(initialBadge('Plex')).toBe(initialBadge('Plex'));
  });

  it('hashes the name to different background colors for different names', () => {
    expect(initialBadge('Plex')).not.toBe(initialBadge('Radarr'));
  });

  it('escapes XML special chars so a name like "<script>" cannot break the SVG (A1)', () => {
    // appInitials('<script>') → '<S'; left raw it would inject a tag and
    // produce malformed SVG. The text content must be entity-escaped.
    const decoded = decodeURIComponent(initialBadge('<script>'));
    expect(decoded).toContain('&lt;S');
    expect(decoded).not.toContain('><S');
  });
});
