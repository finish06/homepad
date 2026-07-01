// v14 §6.2 — the pure usage-priority category ranker. Given the admin category
// list, the raw open log, a catId→serviceIds map, and the previously-displayed
// order, it returns the ranked category id order. No DOM, no storage, no clock
// unless `now` is defaulted — so it's unit-tested in isolation.
//
// Algorithm:
//   1. Count opens per service inside the rolling 30-day window.
//   2. Score each category = sum of its services' counts.
//   3. Order the SCORED categories (score > 0) by descending score, ties broken
//      by admin sort_index; apply hysteresis vs the previous order so small
//      score deltas don't churn the layout (C-005).
//   4. Append the ZERO-scored categories in admin sort_index order (C-003) — they
//      are NOT subject to hysteresis; the cold-start / no-data fallback is always
//      the familiar admin order (C-001).
//   Favorites and Uncategorized are render buckets, never passed in here.

import type { Category } from './api';
import type { OpenEntry } from './recently-opened';
import { WINDOW_MS } from './recently-opened';

export function rankCategories(
  cats: Category[],
  openLog: OpenEntry[],
  servicesByCatId: Map<string, string[]>,
  prevOrder: string[],
  now: number = Date.now(),
): string[] {
  const cutoff = now - WINDOW_MS;

  // 1. per-service open counts within the window
  const counts = new Map<string, number>();
  for (const e of openLog) {
    if (e.t >= cutoff) counts.set(e.id, (counts.get(e.id) ?? 0) + 1);
  }

  // 2. per-category score
  const score = new Map<string, number>();
  const sortIndexOf = new Map<string, number>();
  for (const c of cats) {
    sortIndexOf.set(c.id, c.sortIndex);
    let s = 0;
    for (const sid of servicesByCatId.get(c.id) ?? []) s += counts.get(sid) ?? 0;
    score.set(c.id, s);
  }

  const byAdmin = (a: string, b: string) => (sortIndexOf.get(a) ?? 0) - (sortIndexOf.get(b) ?? 0);

  // 4-first: the zero-scored tail, in admin sort_index order (bypasses hysteresis)
  const zero = cats
    .filter((c) => (score.get(c.id) ?? 0) === 0)
    .map((c) => c.id)
    .sort(byAdmin);

  // 3. the scored head: score desc, ties by admin sort_index asc
  const scored = cats
    .filter((c) => (score.get(c.id) ?? 0) > 0)
    .map((c) => c.id)
    .sort((a, b) => {
      const d = (score.get(b) ?? 0) - (score.get(a) ?? 0);
      return d !== 0 ? d : byAdmin(a, b);
    });

  // Hysteresis: an adjacent pair only keeps its score-sorted (swapped) order if
  // it swapped a pair that was reversed in prevOrder AND the margin clears
  // max(3, ceil(0.15 * higherScore)). Otherwise revert to the previous relative
  // order. Repeated passes until stable so a chain of tiny deltas fully settles.
  const prevIndex = new Map(prevOrder.map((id, i) => [id, i]));
  const marginOf = (id: string) => Math.max(3, Math.ceil(0.15 * (score.get(id) ?? 0)));
  for (let guard = 0; guard <= scored.length; guard++) {
    let changed = false;
    for (let i = 0; i < scored.length - 1; i++) {
      const hi = scored[i];
      const lo = scored[i + 1];
      const pHi = prevIndex.get(hi);
      const pLo = prevIndex.get(lo);
      // this pair is a swap vs prevOrder only if `hi` sat BELOW `lo` before
      const swappedVsPrev = pHi != null && pLo != null && pHi > pLo;
      if (swappedVsPrev && (score.get(hi) ?? 0) - (score.get(lo) ?? 0) < marginOf(hi)) {
        scored[i] = lo;
        scored[i + 1] = hi;
        changed = true;
      }
    }
    if (!changed) break;
  }

  return [...scored, ...zero];
}
