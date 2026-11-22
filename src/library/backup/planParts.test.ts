import { describe, expect, it } from 'vitest';
import { itemNote } from './planParts';
import type { PlanItem } from './transferApi';
import { fieldWords } from '../importCopy';

// homepad#585 — restore skips an icon that isn't a URL. An app or offer that
// is already here keeps the icon it has; a new one (Merge create, every row in
// Replace, a Homepage import) gets none and shows initials. The row's action
// tells the two apart, so each reads true.
describe('itemNote — icon_unsupported', () => {
  const row = (action: PlanItem['action'], extra: Partial<PlanItem> = {}): PlanItem => ({
    kind: 'app',
    name: 'Gitea',
    action,
    warnings: ['icon_unsupported'],
    ...extra,
  });

  it.each(['unchanged', 'update'] as const)('an existing item (%s) keeps its icon', (action) => {
    expect(itemNote(row(action))).toBe("This icon can't be restored. The current icon is kept.");
  });

  it('an update lists its fields first', () => {
    expect(itemNote(row('update', { fields: ['description'] }))).toBe(
      `${fieldWords(['description'])} This icon can't be restored. The current icon is kept.`,
    );
  });

  it('a new item shows initials', () => {
    expect(itemNote(row('create'))).toBe("This icon can't be used. Shows initials.");
    expect(itemNote(row('create', { kind: 'offer' }))).toBe("This icon can't be used. Shows initials.");
  });

  it('other warnings are untouched', () => {
    expect(itemNote(row('unchanged', { warnings: ['icon_glyph'], detail: 'mdi-plex' }))).toBe('Shows initials (mdi-plex).');
  });
});
