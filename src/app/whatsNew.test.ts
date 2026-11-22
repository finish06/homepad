import { beforeEach, describe, expect, it } from 'vitest';
import { isNewerVersion, shouldOpenWhatsNew, WHATS_NEW_KEY } from './whatsNew';

// #590 — What's new opens on its own once, on the first load after an
// upgrade. The v15 changelog spec defines only the footer click, so this is
// the agreed fallback: remember the last version this browser saw it for,
// open once when the running version is newer, and on a browser with no
// record, record the version without opening.

beforeEach(() => localStorage.clear());

describe('isNewerVersion', () => {
  it.each([
    ['18.0.1', '18.0.0', true],
    ['18.1.0', '18.0.9', true],
    ['19.0.0', '18.9.9', true],
    ['18.0.10', '18.0.9', true],
    ['18.0.0', '18.0.0', false],
    ['18.0.0', '18.0.1', false],
    ['17.9.9', '18.0.0', false],
    ['18.0.1-beta', '18.0.0', true],
    ['18.0.0', 'junk', false],
    ['junk', '18.0.0', false],
  ])('%s over %s: %s', (a, b, want) => {
    expect(isNewerVersion(a, b)).toBe(want);
  });
});

describe('shouldOpenWhatsNew', () => {
  it('a brand-new browser: no open, the version recorded', () => {
    expect(shouldOpenWhatsNew('18.0.1')).toBe(false);
    expect(localStorage.getItem(WHATS_NEW_KEY)).toBe('18.0.1');
  });

  it('after an upgrade: opens once, then not again', () => {
    localStorage.setItem(WHATS_NEW_KEY, '18.0.0');
    expect(shouldOpenWhatsNew('18.0.1')).toBe(true);
    expect(localStorage.getItem(WHATS_NEW_KEY)).toBe('18.0.1');
    expect(shouldOpenWhatsNew('18.0.1')).toBe(false);
  });

  it('the same or an older version: no open, the record kept', () => {
    localStorage.setItem(WHATS_NEW_KEY, '18.0.1');
    expect(shouldOpenWhatsNew('18.0.1')).toBe(false);
    expect(shouldOpenWhatsNew('18.0.0')).toBe(false);
    expect(localStorage.getItem(WHATS_NEW_KEY)).toBe('18.0.1');
  });

  it('an unreadable record counts as none', () => {
    localStorage.setItem(WHATS_NEW_KEY, 'garbage');
    expect(shouldOpenWhatsNew('18.0.1')).toBe(false);
    expect(localStorage.getItem(WHATS_NEW_KEY)).toBe('18.0.1');
  });

  it('storage that throws: never opens', () => {
    const get = localStorage.getItem;
    localStorage.getItem = () => {
      throw new Error('blocked');
    };
    try {
      expect(shouldOpenWhatsNew('18.0.1')).toBe(false);
    } finally {
      localStorage.getItem = get;
    }
  });
});
