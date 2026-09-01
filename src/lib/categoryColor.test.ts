// #90 — category chips were all identical indigo, which made a large catalog
// slow to scan. categoryHue maps a category name to a stable, distinct hue.
import { describe, it, expect } from 'vitest';
import { categoryHue } from './categoryColor';

describe('#90 — per-category chip hue', () => {
  it('is deterministic: the same category always gets the same hue', () => {
    expect(categoryHue('Media')).toBe(categoryHue('Media'));
  });

  it('ignores case and surrounding whitespace', () => {
    expect(categoryHue('Media')).toBe(categoryHue('  media '));
  });

  it('returns a valid CSS hue in [0, 360)', () => {
    for (const name of ['Media', 'Tools', 'Network', 'Home', 'Dev', 'Storage']) {
      const h = categoryHue(name);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
    }
  });

  it('spreads distinct categories across more than one hue', () => {
    const names = ['Media', 'Tools', 'Network', 'Home', 'Dev', 'Storage', 'Games', 'Books'];
    const hues = new Set(names.map(categoryHue));
    expect(hues.size).toBeGreaterThan(1);
  });
});
