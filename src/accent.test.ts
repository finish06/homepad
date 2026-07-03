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

// SPEC-glass-v2-accent — the accent module. The contract has two halves that
// must not drift: the ROYGBIV accent list (what the picker offers / what the
// vars can hold) and the :root defaults in index.css (what a user who never
// chose renders). jsdom applies inline custom properties fine, so the module
// side is fully testable here; the painted blobs are the browser's job.

const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

// Self-contained in-memory localStorage: some jsdom builds expose a partial
// Storage (theme.test.tsx trips on the same thing locally), so the suite brings
// its own rather than depending on the host's.
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
  document.documentElement.style.removeProperty('--accent-1');
  document.documentElement.style.removeProperty('--accent-2');
});

describe('the ROYGBIV accent list', () => {
  it('offers exactly the seven spectrum accents, in spectrum order', () => {
    expect(ACCENTS.map((a) => a.id)).toEqual([
      'red',
      'orange',
      'yellow',
      'green',
      'blue',
      'indigo',
      'violet',
    ]);
  });

  it('defaults to indigo — the brand pair', () => {
    expect(DEFAULT_ACCENT).toBe('indigo');
  });

  it('every accent is a pair of space-separated RGB triplets plus a hex swatch', () => {
    for (const a of ACCENTS) {
      expect(a.a).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
      expect(a.b).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
      expect(a.swatch).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe('the CSS :root defaults stay paired with the module', () => {
  it(':root declares the indigo pair verbatim (never-chose === brand atmosphere)', () => {
    const indigo = ACCENTS.find((a) => a.id === 'indigo')!;
    const root = css.match(/:root\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(root).toContain(`--accent-1: ${indigo.a}`);
    expect(root).toContain(`--accent-2: ${indigo.b}`);
  });

  it('.app-surface paints its blobs from the accent vars (both modes)', () => {
    const light = css.match(/(?:^|\n)\s*\.app-surface\s*\{([^}]*)\}/)?.[1] ?? '';
    const dark = css.match(/\.dark\s+\.app-surface\s*\{([^}]*)\}/)?.[1] ?? '';
    for (const rule of [light, dark]) {
      expect(rule).toContain('rgb(var(--accent-1)');
      expect(rule).toContain('rgb(var(--accent-2)');
    }
  });
});

describe('resolve / apply / persist', () => {
  it('resolveAccent accepts any listed id and degrades junk to the default', () => {
    expect(resolveAccent('green')).toBe('green');
    expect(resolveAccent('mauve')).toBe(DEFAULT_ACCENT);
    expect(resolveAccent(null)).toBe(DEFAULT_ACCENT);
    expect(isAccentId('violet')).toBe(true);
    expect(isAccentId('')).toBe(false);
  });

  it('applyAccent mirrors a non-default pair onto <html> as inline vars', () => {
    applyAccent('red');
    const red = ACCENTS.find((a) => a.id === 'red')!;
    expect(document.documentElement.style.getPropertyValue('--accent-1')).toBe(red.a);
    expect(document.documentElement.style.getPropertyValue('--accent-2')).toBe(red.b);
  });

  it('applyAccent(default) CLEARS the inline override — the stylesheet owns the brand values', () => {
    applyAccent('blue');
    applyAccent(DEFAULT_ACCENT);
    expect(document.documentElement.style.getPropertyValue('--accent-1')).toBe('');
    expect(document.documentElement.style.getPropertyValue('--accent-2')).toBe('');
  });

  it('setAccent persists and initAccent re-applies it on the next boot', () => {
    setAccent('violet');
    expect(window.localStorage.getItem(ACCENT_CACHE_KEY)).toBe('violet');
    document.documentElement.style.removeProperty('--accent-1');
    expect(initAccent()).toBe('violet');
    const violet = ACCENTS.find((a) => a.id === 'violet')!;
    expect(document.documentElement.style.getPropertyValue('--accent-1')).toBe(violet.a);
  });

  it('initAccent degrades a corrupted cache to the default', () => {
    window.localStorage.setItem(ACCENT_CACHE_KEY, 'not-a-color');
    expect(initAccent()).toBe(DEFAULT_ACCENT);
    expect(document.documentElement.style.getPropertyValue('--accent-1')).toBe('');
  });
});
