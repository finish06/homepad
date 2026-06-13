// v8 §6 — the launcher's pure fuzzy-match + rank core. CLIENT-SIDE ONLY: this
// takes the Service[] the catalog already loaded and returns the matching
// services in deterministic ranked order. No DOM, no network — so A6/A7 are
// unit-tested in isolation (specs/v8-command-launcher.md §11).

import type { Service } from './api';

// Per-field weights (§6.2). A service is scored against three fields and takes
// its STRONGEST field hit; the field's weight sets the primary rank tier.
const FIELD_WEIGHT = { name: 1.0, category: 0.6, description: 0.4 } as const;

type FieldKey = keyof typeof FIELD_WEIGHT;

// A field match: whether the query is a fuzzy subsequence of the field, plus a
// 0..1 quality so prefix > contiguous > scattered, earlier position > later.
type FieldMatch = { matched: boolean; quality: number };

// quality bands keep the ordering clean and total:
//   exact  = 1.0
//   prefix = 0.9
//   contiguous (mid-string) = 0.7..0.8  (earlier start → higher)
//   scattered subsequence   = <0.6      (more compact + earlier → higher)
function matchField(query: string, text: string): FieldMatch {
  const t = text.toLowerCase();
  if (query.length === 0 || t.length === 0) return { matched: false, quality: 0 };

  if (t === query) return { matched: true, quality: 1 };
  if (t.startsWith(query)) return { matched: true, quality: 0.9 };

  const idx = t.indexOf(query);
  if (idx >= 0) {
    // Contiguous but not a prefix: 0.8 down toward 0.7 as the match starts later.
    return { matched: true, quality: 0.8 - (idx / t.length) * 0.1 };
  }

  const sub = subsequence(query, t);
  if (!sub.matched) return { matched: false, quality: 0 };
  // Scattered: reward compactness (few gaps) and an earlier first hit, capped
  // below the contiguous band so a real substring always wins.
  const span = sub.lastIndex - sub.firstIndex + 1;
  const compactness = query.length / span; // (0,1]
  const earliness = 1 - sub.firstIndex / t.length; // [0,1)
  return { matched: true, quality: 0.5 * compactness + 0.1 * earliness };
}

// Greedy in-order subsequence scan, tracking the first/last matched positions so
// the caller can score compactness and earliness.
function subsequence(query: string, text: string): {
  matched: boolean;
  firstIndex: number;
  lastIndex: number;
} {
  let qi = 0;
  let firstIndex = -1;
  let lastIndex = -1;
  for (let ti = 0; ti < text.length && qi < query.length; ti++) {
    if (text[ti] === query[qi]) {
      if (firstIndex < 0) firstIndex = ti;
      lastIndex = ti;
      qi++;
    }
  }
  return { matched: qi === query.length, firstIndex, lastIndex };
}

// A service's resolved hit: the strongest field it matched on, with that field's
// weight (the rank tier) and the in-field match quality.
type Hit = { service: Service; weight: number; quality: number };

// Evaluate every field, keep the highest-weight one that matched (§6.2 "takes
// its strongest"). Returns null when the service matches no field at all.
function bestHit(query: string, service: Service): Hit | null {
  const fields: Record<FieldKey, string> = {
    name: service.name ?? '',
    category: service.categoryName ?? '',
    description: service.description ?? '',
  };
  let best: Hit | null = null;
  for (const key of ['name', 'category', 'description'] as FieldKey[]) {
    const m = matchField(query, fields[key].toLowerCase());
    if (!m.matched) continue;
    const weight = FIELD_WEIGHT[key];
    // Strongest = highest field weight; fields are visited high→low so the first
    // match is already the strongest, but compare defensively.
    if (!best || weight > best.weight) best = { service, weight, quality: m.quality };
  }
  return best;
}

// rankServices filters the catalog to fuzzy matches and orders them
// deterministically (§6.3): field weight → in-field quality → favorite →
// alphabetical by name. An empty/whitespace query returns [] — the empty-query
// default list (Favorites → All, §7) is the component's concern, not the
// ranker's.
export function rankServices(query: string, services: Service[]): Service[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [];

  const hits: Hit[] = [];
  for (const service of services) {
    const hit = bestHit(q, service);
    if (hit) hits.push(hit);
  }

  hits.sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight; // 1. field weight
    if (b.quality !== a.quality) return b.quality - a.quality; // 2. match quality
    const favA = a.service.favorite ? 1 : 0;
    const favB = b.service.favorite ? 1 : 0;
    if (favB !== favA) return favB - favA; // 3. favorites break ties ahead
    return a.service.name.localeCompare(b.service.name); // 4. alphabetical
  });

  return hits.map((h) => h.service);
}
