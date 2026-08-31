import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ACCENTS,
  ACCENT_CACHE_KEY,
  DEFAULT_ACCENT,
  applyAccent,
  initAccent,
  isAccentId,
  resolveAccent,
  setAccent,
} from './accent';

// SPEC-v15-design-system §2/§3.6 — the v15 accent module. v15 has TWO halves that
// must not drift: the eight-accent list (what the picker offers / what data-theme
// can hold) and the `[data-theme="…"]` token blocks in index.css (what each accent
// actually paints). The accent is applied by setting `data-theme` on <html>; the
// stylesheet owns every colour value (accent chrome + the ambient field vars the
// .app-surface blobs read). jsdom sets the attribute fine; the pixels are the
// browser gate + Kare's live review.

const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

// Self-contained in-memory localStorage: some jsdom builds expose a partial
// Storage, so the suite brings its own rather than depending on the host's.
function stubStorage(): void {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
  });
}

beforeEach(() => {
  stubStorage();
});

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
});

describe('the v15 eight-accent list', () => {
  it('offers exactly the eight v15 accents, in spec order', () => {
    expect(ACCENTS.map((a) => a.id)).toEqual([
      'blue',
      'teal',
      'green',
      'yellow',
      'orange',
      'red',
      'pink',
      'purple',
    ]);
  });

  it('defaults to blue', () => {
    expect(DEFAULT_ACCENT).toBe('blue');
  });

  it('every accent has a label and a hex swatch', () => {
    for (const a of ACCENTS) {
      expect(a.label.length).toBeGreaterThan(0);
      expect(a.swatch).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('index.css declares a token block per accent', () => {
  it('has a [data-theme="…"] block for each accent with accent + field vars', () => {
    for (const a of ACCENTS) {
      const block = css.match(new RegExp(`\\[data-theme="${a.id}"\\][^{]*\\{([^}]*)\\}`))?.[1] ?? '';
      expect(block, `expected a [data-theme="${a.id}"] block`).toContain('--accent:');
      expect(block).toContain('--accent-3:');
      // The ambient-field blob triplets the .app-surface reads (glass-v2 contract).
      expect(block).toContain('--accent-1:');
      expect(block).toContain('--accent-2:');
    }
  });

  it('.app-surface still paints its blobs from the accent vars (both modes)', () => {
    const light = css.match(/(?:^|\n)\s*\.app-surface\s*\{([^}]*)\}/)?.[1] ?? '';
    const dark = css.match(/\.dark\s+\.app-surface\s*\{([^}]*)\}/)?.[1] ?? '';
    for (const rule of [light, dark]) {
      expect(rule).toContain('rgb(var(--accent-1)');
      expect(rule).toContain('rgb(var(--accent-2)');
    }
  });
});

describe('resolve / migrate / apply / persist', () => {
  it('resolveAccent accepts any listed id and degrades junk to blue', () => {
    expect(resolveAccent('teal')).toBe('teal');
    expect(resolveAccent('purple')).toBe('purple');
    expect(resolveAccent('mauve')).toBe(DEFAULT_ACCENT);
    expect(resolveAccent(null)).toBe(DEFAULT_ACCENT);
    expect(isAccentId('pink')).toBe(true);
    expect(isAccentId('')).toBe(false);
    // v14 accents that no longer exist are NOT valid ids…
    expect(isAccentId('indigo')).toBe(false);
    expect(isAccentId('violet')).toBe(false);
  });

  it('migrates the retired v14 indigo/violet accents to purple', () => {
    // 7→8 migration (§3.6): indigo+violet consolidate into purple.
    expect(resolveAccent('indigo')).toBe('purple');
    expect(resolveAccent('violet')).toBe('purple');
  });

  it('applyAccent sets data-theme on <html>', () => {
    applyAccent('purple');
    expect(document.documentElement.getAttribute('data-theme')).toBe('purple');
    applyAccent('teal');
    expect(document.documentElement.getAttribute('data-theme')).toBe('teal');
  });

  it('setAccent persists and initAccent re-applies it on the next boot', () => {
    setAccent('green');
    expect(window.localStorage.getItem(ACCENT_CACHE_KEY)).toBe('green');
    document.documentElement.removeAttribute('data-theme');
    expect(initAccent()).toBe('green');
    expect(document.documentElement.getAttribute('data-theme')).toBe('green');
  });

  it('initAccent degrades a corrupted cache to blue', () => {
    window.localStorage.setItem(ACCENT_CACHE_KEY, 'not-a-color');
    expect(initAccent()).toBe(DEFAULT_ACCENT);
    expect(document.documentElement.getAttribute('data-theme')).toBe('blue');
  });

  it('initAccent migrates a stored v14 indigo preference to purple', () => {
    window.localStorage.setItem(ACCENT_CACHE_KEY, 'indigo');
    expect(initAccent()).toBe('purple');
    expect(document.documentElement.getAttribute('data-theme')).toBe('purple');
  });
});
