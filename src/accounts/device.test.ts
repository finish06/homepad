import { describe, expect, it } from 'vitest';
import { describeDevice, formatAgo, formatDay, possessive } from './device';

// UX §3 Devices — each row shows the device from its user agent ("iPad ·
// Safari"), when it signed in, and when it was last used.

const UA = {
  ipad: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  winEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  linuxFirefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
  iosChrome: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1',
};

describe('describeDevice', () => {
  it.each([
    [UA.ipad, 'iPad · Safari'],
    [UA.iphone, 'iPhone · Safari'],
    [UA.macChrome, 'Mac · Chrome'],
    [UA.macSafari, 'Mac · Safari'],
    [UA.winEdge, 'Windows · Edge'],
    [UA.android, 'Android · Chrome'],
    [UA.linuxFirefox, 'Linux · Firefox'],
    [UA.iosChrome, 'iPad · Chrome'],
  ])('%s → %s', (ua, want) => {
    expect(describeDevice(ua)).toBe(want);
  });

  it('falls back to a plain label for an unknown or empty agent', () => {
    expect(describeDevice('')).toBe('Unknown device');
    expect(describeDevice('curl/8.4.0')).toBe('Unknown device');
  });

  it('names just the device when the browser is unknown', () => {
    expect(describeDevice('Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)')).toBe('iPad');
  });
});

describe('formatAgo', () => {
  const now = Date.parse('2026-10-30T12:00:00Z');
  it.each([
    ['2026-10-30T11:59:40Z', 'just now'],
    ['2026-10-30T11:55:00Z', '5m ago'],
    ['2026-10-30T10:00:00Z', '2h ago'],
    ['2026-10-27T12:00:00Z', '3d ago'],
    ['2026-10-30T12:05:00Z', 'just now'], // clock skew never reads as the future
  ])('%s → %s', (iso, want) => {
    expect(formatAgo(iso, now)).toBe(want);
  });

  it('says "never" for an unparseable time', () => {
    expect(formatAgo('not a date', now)).toBe('never');
  });
});

describe('formatDay', () => {
  it('renders a short month and day', () => {
    expect(formatDay('2026-10-22T09:00:00Z')).toMatch(/Oct 22/);
  });
  it('is empty for an unparseable time', () => {
    expect(formatDay('nope')).toBe('');
  });
});

describe('possessive', () => {
  it("adds 's (straight apostrophe, matching the UX §4 copy)", () => {
    expect(possessive('Maya')).toBe("Maya's");
    expect(possessive('James')).toBe("James's");
  });
});
