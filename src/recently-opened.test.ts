import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RECENT_KEY, MAX_RECENT, recordOpen, loadRecent, clearRecent } from './recently-opened';

// Cap #3 — the localStorage-backed "Recently opened" core. These are pure unit
// tests (no DOM render): recordOpen/loadRecent/clearRecent operate on the
// `homepad.recentlyOpened` key. Covers AC-002 (prepend + dedup + cap), AC-004
// (re-open moves to position 0), AC-005 (clear), AC-010 (storage unavailable),
// and AC-012 (record/dedup/cap explicitly tested).

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('recordOpen + loadRecent', () => {
  it('AC-002 — recordOpen prepends a fresh id and persists it', () => {
    recordOpen('a');
    expect(loadRecent()).toEqual(['a']);
    expect(JSON.parse(localStorage.getItem(RECENT_KEY)!)).toEqual(['a']);
  });

  it('AC-002 — newest id lands at position 0', () => {
    recordOpen('a');
    recordOpen('b');
    expect(loadRecent()).toEqual(['b', 'a']);
  });

  it('AC-002/AC-004 — re-opening an existing id dedups and moves it to position 0', () => {
    recordOpen('a');
    recordOpen('b');
    recordOpen('a');
    expect(loadRecent()).toEqual(['a', 'b']);
  });

  it('AC-002 — the list is capped at MAX_RECENT (8); opening a 9th drops the oldest', () => {
    for (const id of ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8']) recordOpen(id);
    expect(loadRecent()).toHaveLength(MAX_RECENT);
    recordOpen('s9');
    const list = loadRecent();
    expect(list).toHaveLength(MAX_RECENT);
    expect(list[0]).toBe('s9');
    expect(list).not.toContain('s1'); // the oldest fell off
  });

  it('recordOpen dispatches the homepad:opened event so the row can refresh', () => {
    const handler = vi.fn();
    window.addEventListener('homepad:opened', handler);
    recordOpen('a');
    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener('homepad:opened', handler);
  });
});

describe('loadRecent — resilient reads', () => {
  it('returns [] when nothing is stored', () => {
    expect(loadRecent()).toEqual([]);
  });

  it('returns [] when the stored value is not a JSON array', () => {
    localStorage.setItem(RECENT_KEY, '{"not":"an array"}');
    expect(loadRecent()).toEqual([]);
  });

  it('returns [] on malformed JSON', () => {
    localStorage.setItem(RECENT_KEY, 'not json at all');
    expect(loadRecent()).toEqual([]);
  });
});

describe('clearRecent', () => {
  it('AC-005 — removes the key so loadRecent returns []', () => {
    recordOpen('a');
    recordOpen('b');
    clearRecent();
    expect(loadRecent()).toEqual([]);
    expect(localStorage.getItem(RECENT_KEY)).toBeNull();
  });

  it('AC-005 — dispatches homepad:opened so a mounted row hides immediately', () => {
    const handler = vi.fn();
    window.addEventListener('homepad:opened', handler);
    clearRecent();
    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener('homepad:opened', handler);
  });
});

describe('AC-010 — localStorage unavailable', () => {
  it('loadRecent returns [] when getItem throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    expect(loadRecent()).toEqual([]);
  });

  it('recordOpen fails silently when setItem throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    expect(() => recordOpen('a')).not.toThrow();
  });

  it('clearRecent fails silently when removeItem throws', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    expect(() => clearRecent()).not.toThrow();
  });
});
