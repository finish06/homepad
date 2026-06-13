import { describe, expect, it } from 'vitest';
import { rankServices } from './ranker';
import type { Service } from './api';

// v8 §6 — the launcher's pure fuzzy-match + rank core. These are isolated unit
// tests (no DOM): the ranker takes a query + the already-loaded Service[] and
// returns the matching services in deterministic ranked order. Weights: name
// 1.0 (primary) > category 0.6 > description 0.4; matching is fuzzy subsequence;
// order is stable so the same query always yields the same ids (A7).

function svc(over: Partial<Service> = {}): Service {
  return {
    id: over.id ?? over.name ?? 's',
    slug: 'slug',
    name: 'Service',
    description: '',
    url: 'https://example.com',
    icon: '',
    status: 'UP',
    favorite: false,
    iconLight: false,
    iconDark: false,
    categoryId: null,
    categoryName: null,
    ...over,
  };
}

const ids = (list: Service[]) => list.map((s) => s.id);

describe('A6 — fuzzy subsequence matching over name/category/description', () => {
  const jellyfin = svc({ id: 'jellyfin', name: 'Jellyfin', categoryName: 'Media' });
  const jellyseerr = svc({ id: 'jellyseerr', name: 'Jellyseerr', categoryName: 'Media' });
  const gitea = svc({ id: 'gitea', name: 'Gitea', categoryName: 'Dev' });

  it('matches a fuzzy subsequence in the name (jly → Jellyfin)', () => {
    const out = rankServices('jly', [gitea, jellyfin, jellyseerr]);
    expect(ids(out)).toContain('jellyfin');
    // jly is NOT a subsequence of Gitea — excluded entirely.
    expect(ids(out)).not.toContain('gitea');
  });

  it('matches a scattered subsequence (jf → Jellyfin, not Jellyseerr)', () => {
    const out = rankServices('jf', [jellyfin, jellyseerr]);
    expect(ids(out)).toEqual(['jellyfin']);
  });

  it('surfaces a service by its category at lower weight (media → Media-category svc)', () => {
    const plex = svc({ id: 'plex', name: 'Plex', categoryName: 'Media', description: '' });
    const out = rankServices('media', [gitea, plex]);
    expect(ids(out)).toContain('plex');
    expect(ids(out)).not.toContain('gitea');
  });

  it('surfaces a service by its description at the lowest weight', () => {
    const backup = svc({
      id: 'restic',
      name: 'Restic',
      categoryName: 'Tools',
      description: 'encrypted snapshot backups',
    });
    const out = rankServices('snapshot', [backup, gitea]);
    expect(ids(out)).toEqual(['restic']);
  });

  it('excludes services that match no field', () => {
    const out = rankServices('zzzzz', [jellyfin, gitea, jellyseerr]);
    expect(out).toEqual([]);
  });

  it('returns nothing for an empty / whitespace query (default list is the component’s job)', () => {
    expect(rankServices('', [jellyfin, gitea])).toEqual([]);
    expect(rankServices('   ', [jellyfin, gitea])).toEqual([]);
  });

  it('is case-insensitive and trims the query', () => {
    const out = rankServices('  JELLY  ', [gitea, jellyfin]);
    expect(ids(out)).toContain('jellyfin');
  });
});

describe('A6 — name hits outrank category/description hits', () => {
  it('ranks a name match above a category-only match for the same query', () => {
    // "Mediawiki" matches by NAME (tier: name); "Plex" matches only by its
    // "Media" CATEGORY. The name hit must sort ahead regardless of quality.
    const mediawiki = svc({ id: 'mediawiki', name: 'Mediawiki', categoryName: 'Wiki' });
    const plex = svc({ id: 'plex', name: 'Plex', categoryName: 'Media' });
    const out = rankServices('media', [plex, mediawiki]);
    expect(ids(out)).toEqual(['mediawiki', 'plex']);
  });

  it('ranks a category match above a description-only match', () => {
    const inCategory = svc({ id: 'cat', name: 'Sonarr', categoryName: 'Media' });
    const inDescription = svc({
      id: 'desc',
      name: 'Notes',
      categoryName: 'Tools',
      description: 'media library notes',
    });
    const out = rankServices('media', [inDescription, inCategory]);
    expect(ids(out)).toEqual(['cat', 'desc']);
  });
});

describe('A6 — match quality within a field (prefix beats mid-string beats scattered)', () => {
  it('ranks a prefix match ahead of a mid-string match', () => {
    const gitea = svc({ id: 'gitea', name: 'Gitea' });
    const digit = svc({ id: 'digit', name: 'Digit' }); // contains "git" mid-string
    const out = rankServices('git', [digit, gitea]);
    expect(ids(out)).toEqual(['gitea', 'digit']);
  });

  it('ranks a contiguous match ahead of a scattered subsequence', () => {
    const contig = svc({ id: 'contig', name: 'Cabin' }); // "cab" contiguous
    const scattered = svc({ id: 'scattered', name: 'Caltrabox' }); // c..a..b scattered
    const out = rankServices('cab', [scattered, contig]);
    expect(ids(out)).toEqual(['contig', 'scattered']);
  });
});

describe('A7 — deterministic, stable ordering with documented tie-breaks', () => {
  it('produces identical ordered ids for the same query every call', () => {
    const list = [
      svc({ id: 'gitea', name: 'Gitea' }),
      svc({ id: 'gitea-actions', name: 'Gitea Actions' }),
      svc({ id: 'grafana', name: 'Grafana' }),
    ];
    const a = ids(rankServices('git', list));
    const b = ids(rankServices('git', [...list].reverse()));
    expect(a).toEqual(b);
  });

  it('breaks ties: favorites ahead of non-favorites', () => {
    // Both prefix-match "gra" with identical quality and field (name). The
    // favorite must sort ahead even though it loses the alphabetical tie-break.
    const grafana = svc({ id: 'grafana', name: 'Grafana', favorite: false });
    const graphite = svc({ id: 'graphite', name: 'Graphite', favorite: true });
    const out = rankServices('gra', [grafana, graphite]);
    expect(ids(out)).toEqual(['graphite', 'grafana']);
  });

  it('breaks remaining ties alphabetically by name', () => {
    const b = svc({ id: 'b', name: 'Bookstack' });
    const a = svc({ id: 'a', name: 'Baikal' });
    // both prefix-match "ba", neither favorite → alphabetical: Baikal < Bookstack
    const out = rankServices('ba', [b, a]);
    expect(ids(out)).toEqual(['a', 'b']);
  });
});
