import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OPEN_LOG_KEY,
  LEGACY_RECENT_KEY,
  SORT_MODE_KEY,
  SORT_RANK_AT_KEY,
  CATEGORY_ORDER_KEY,
  MAX_RECENT,
  MAX_LOG,
  recordOpen,
  loadOpenLog,
  loadRecent,
  clearRecent,
  loadSortMode,
  setSortMode,
  clearSortMode,
  loadSortRankAt,
  setSortRankAt,
  loadCategoryOrder,
  saveCategoryOrder,
} from './recently-opened';

// v14 §6.1 — the localStorage core migrated from a string[] `recentlyOpened`
// list to a timestamped `openLog` ({id,t}[]). These are pure unit tests (no DOM
// render): recordOpen/loadOpenLog/loadRecent/clearRecent operate on
// `homepad.openLog`; plus the new sortMode / sortRankAt / categoryOrder keys the
// usage-priority ranker uses. Covers C-schema (open log dedup/prune/cap),
// migration, B-004 (recency), and B-010 (storage unavailable).

const DAY = 86_400_000;
const NOW = 1_700_000_000_000; // fixed clock for deterministic pruning tests

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('recordOpen + loadOpenLog (v14 openLog schema)', () => {
  it('recordOpen prepends a timestamped entry newest-first', () => {
    recordOpen('a');
    expect(loadOpenLog()).toEqual([{ id: 'a', t: NOW }]);
  });

  it('newest entry lands at position 0', () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(NOW - 1000).mockReturnValue(NOW);
    recordOpen('a');
    recordOpen('b');
    const log = loadOpenLog();
    expect(log.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('re-opening an existing id dedups (drops the prior occurrence, re-adds at 0)', () => {
    recordOpen('a');
    recordOpen('b');
    recordOpen('a');
    expect(loadOpenLog().map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('prunes entries older than 30 days on write', () => {
    localStorage.setItem(
      OPEN_LOG_KEY,
      JSON.stringify([{ id: 'old', t: NOW - 31 * DAY }, { id: 'fresh', t: NOW - 1 * DAY }]),
    );
    recordOpen('new');
    expect(loadOpenLog().map((e) => e.id)).toEqual(['new', 'fresh']);
  });

  it('caps the log at MAX_LOG (500) entries', () => {
    const big = Array.from({ length: MAX_LOG }, (_, i) => ({ id: `s${i}`, t: NOW - i }));
    localStorage.setItem(OPEN_LOG_KEY, JSON.stringify(big));
    recordOpen('newest');
    const log = loadOpenLog();
    expect(log).toHaveLength(MAX_LOG);
    expect(log[0].id).toBe('newest');
  });

  it('dispatches homepad:opened so a mounted row refreshes', () => {
    const handler = vi.fn();
    window.addEventListener('homepad:opened', handler);
    recordOpen('a');
    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener('homepad:opened', handler);
  });
});

describe('loadRecent — 8 most-recent unique ids for the chip rail', () => {
  it('returns [] when nothing is stored', () => {
    expect(loadRecent()).toEqual([]);
  });

  it('returns the ids newest-first, capped at MAX_RECENT (8)', () => {
    for (let i = 0; i < 12; i++) {
      vi.spyOn(Date, 'now').mockReturnValue(NOW + i);
      recordOpen(`s${i}`);
    }
    const recent = loadRecent();
    expect(recent).toHaveLength(MAX_RECENT);
    expect(recent[0]).toBe('s11');
    expect(recent).not.toContain('s0');
  });

  it('returns [] on malformed JSON', () => {
    localStorage.setItem(OPEN_LOG_KEY, 'not json at all');
    expect(loadRecent()).toEqual([]);
  });

  it('ignores malformed entries (missing id/t)', () => {
    localStorage.setItem(OPEN_LOG_KEY, JSON.stringify([{ id: 'a', t: NOW }, { bogus: 1 }, 'x']));
    expect(loadRecent()).toEqual(['a']);
  });
});

describe('migration from legacy homepad.recentlyOpened', () => {
  it('converts a legacy string[] to openLog entries with t=now and removes the old key', () => {
    localStorage.setItem(LEGACY_RECENT_KEY, JSON.stringify(['a', 'b', 'c']));
    const log = loadOpenLog();
    expect(log).toEqual([
      { id: 'a', t: NOW },
      { id: 'b', t: NOW },
      { id: 'c', t: NOW },
    ]);
    expect(localStorage.getItem(LEGACY_RECENT_KEY)).toBeNull();
    // and it persisted under the new key
    expect(JSON.parse(localStorage.getItem(OPEN_LOG_KEY)!)).toHaveLength(3);
  });

  it('does NOT migrate when openLog already exists', () => {
    localStorage.setItem(OPEN_LOG_KEY, JSON.stringify([{ id: 'x', t: NOW }]));
    localStorage.setItem(LEGACY_RECENT_KEY, JSON.stringify(['a']));
    expect(loadOpenLog().map((e) => e.id)).toEqual(['x']);
    // legacy key untouched (not our data)
    expect(localStorage.getItem(LEGACY_RECENT_KEY)).not.toBeNull();
  });
});

describe('clearRecent', () => {
  it('removes the open log so loadRecent returns []', () => {
    recordOpen('a');
    clearRecent();
    expect(loadRecent()).toEqual([]);
    expect(localStorage.getItem(OPEN_LOG_KEY)).toBeNull();
  });

  it('dispatches homepad:opened so a mounted row hides immediately', () => {
    const handler = vi.fn();
    window.addEventListener('homepad:opened', handler);
    clearRecent();
    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener('homepad:opened', handler);
  });
});

describe('sortMode / sortRankAt / categoryOrder keys', () => {
  it('loadSortMode defaults to auto when absent', () => {
    expect(loadSortMode()).toBe('auto');
  });

  it('setSortMode persists custom, clearSortMode returns to auto', () => {
    setSortMode('custom');
    expect(localStorage.getItem(SORT_MODE_KEY)).toBe('custom');
    expect(loadSortMode()).toBe('custom');
    clearSortMode();
    expect(loadSortMode()).toBe('auto');
    expect(localStorage.getItem(SORT_MODE_KEY)).toBeNull();
  });

  it('loadSortRankAt defaults to 0; setSortRankAt round-trips', () => {
    expect(loadSortRankAt()).toBe(0);
    setSortRankAt(NOW);
    expect(loadSortRankAt()).toBe(NOW);
    expect(localStorage.getItem(SORT_RANK_AT_KEY)).toBe(String(NOW));
  });

  it('loadCategoryOrder defaults to []; saveCategoryOrder round-trips', () => {
    expect(loadCategoryOrder()).toEqual([]);
    saveCategoryOrder(['c2', 'c1']);
    expect(loadCategoryOrder()).toEqual(['c2', 'c1']);
    expect(JSON.parse(localStorage.getItem(CATEGORY_ORDER_KEY)!)).toEqual(['c2', 'c1']);
  });
});

describe('B-010 — localStorage unavailable', () => {
  it('loadOpenLog returns [] when getItem throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    expect(loadOpenLog()).toEqual([]);
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
