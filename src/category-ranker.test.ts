import { describe, expect, it } from 'vitest';
import { rankCategories } from './category-ranker';
import type { OpenEntry } from './recently-opened';
import type { Category } from './api';

// v14 §6.2 — the pure usage-priority category ranker. No DOM, no storage: given
// the admin category list, the raw open log, a catId→serviceIds map, and the
// previously-displayed order (for hysteresis), it returns the ranked category id
// order. Covers C-001 (cold start), C-002/C-003 (usage ordering + zero-scored
// tail), the 30-day window, and C-005 (hysteresis margin).

const DAY = 86_400_000;
const NOW = 1_700_000_000_000;

function cat(id: string, sortIndex: number): Category {
  return { id, name: id, sortIndex };
}

// Build an open log by repeating each service id `count` times, all within the
// 30-day window unless an explicit `t` is given.
function log(...entries: Array<[string, number] | OpenEntry>): OpenEntry[] {
  const out: OpenEntry[] = [];
  for (const e of entries) {
    if (Array.isArray(e)) {
      const [id, count] = e;
      for (let i = 0; i < count; i++) out.push({ id, t: NOW - i * 1000 });
    } else {
      out.push(e);
    }
  }
  return out;
}

describe('rankCategories', () => {
  it('C-001 — cold start (empty log) falls back to admin sort_index order', () => {
    const cats = [cat('a', 0), cat('b', 1), cat('c', 2)];
    const svc = new Map([
      ['a', ['s1']],
      ['b', ['s2']],
      ['c', ['s3']],
    ]);
    expect(rankCategories(cats, [], svc, ['a', 'b', 'c'], NOW)).toEqual(['a', 'b', 'c']);
  });

  it('C-002 — categories sort by descending 30-day open count', () => {
    // admin order a,b; b opened 10x, a opened 2x → b first
    const cats = [cat('a', 0), cat('b', 1)];
    const svc = new Map([
      ['a', ['s1']],
      ['b', ['s2']],
    ]);
    const openLog = log(['s2', 10], ['s1', 2]);
    expect(rankCategories(cats, openLog, svc, ['a', 'b'], NOW)).toEqual(['b', 'a']);
  });

  it('C-003 — a category score sums its member services; zero-scored sort to the end in admin order', () => {
    const cats = [cat('a', 0), cat('b', 1), cat('c', 2)];
    const svc = new Map([
      ['a', ['s1', 's2']], // 3 + 2 = 5
      ['b', ['s3']], // 8
      ['c', ['s4']], // 0
    ]);
    const openLog = log(['s1', 3], ['s2', 2], ['s3', 8]);
    // b(8) > a(5) > c(0, appended last in admin order)
    expect(rankCategories(cats, openLog, svc, ['a', 'b', 'c'], NOW)).toEqual(['b', 'a', 'c']);
  });

  it('zero-scored categories keep admin sort_index order among themselves', () => {
    const cats = [cat('a', 2), cat('b', 0), cat('c', 1)];
    const svc = new Map([
      ['a', ['s1']],
      ['b', ['s2']],
      ['c', ['s3']],
    ]);
    // no opens at all → all zero → admin sortIndex order: b(0), c(1), a(2)
    expect(rankCategories(cats, [], svc, ['a', 'b', 'c'], NOW)).toEqual(['b', 'c', 'a']);
  });

  it('excludes opens older than 30 days from the window', () => {
    const cats = [cat('a', 0), cat('b', 1)];
    const svc = new Map([
      ['a', ['s1']],
      ['b', ['s2']],
    ]);
    // s2 opened 10x but all 31 days ago (excluded); s1 opened 1x now → a first
    const openLog: OpenEntry[] = [
      ...Array.from({ length: 10 }, () => ({ id: 's2', t: NOW - 31 * DAY })),
      { id: 's1', t: NOW },
    ];
    expect(rankCategories(cats, openLog, svc, ['a', 'b'], NOW)).toEqual(['a', 'b']);
  });

  it('C-005 — hysteresis: a below-threshold margin does NOT swap the prior order', () => {
    // prevOrder [a, b]. Now b scores 12, a scores 10 → b would edge ahead by 2,
    // but margin 2 < max(3, ceil(0.15*12)=2) → 2 < 3, keep [a, b].
    const cats = [cat('a', 0), cat('b', 1)];
    const svc = new Map([
      ['a', ['s1']],
      ['b', ['s2']],
    ]);
    const openLog = log(['s2', 12], ['s1', 10]);
    expect(rankCategories(cats, openLog, svc, ['a', 'b'], NOW)).toEqual(['a', 'b']);
  });

  it('C-005 — hysteresis: an above-threshold margin DOES swap', () => {
    // prevOrder [a, b]. b scores 20, a scores 10 → margin 10 >= max(3, ceil(3))=3
    // → swap to [b, a].
    const cats = [cat('a', 0), cat('b', 1)];
    const svc = new Map([
      ['a', ['s1']],
      ['b', ['s2']],
    ]);
    const openLog = log(['s2', 20], ['s1', 10]);
    expect(rankCategories(cats, openLog, svc, ['a', 'b'], NOW)).toEqual(['b', 'a']);
  });

  it('handles categories with no entry in servicesByCatId (treated as zero-scored)', () => {
    const cats = [cat('a', 0), cat('b', 1)];
    const svc = new Map([['a', ['s1']]]); // b missing
    const openLog = log(['s1', 5]);
    expect(rankCategories(cats, openLog, svc, ['a', 'b'], NOW)).toEqual(['a', 'b']);
  });
});
