import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Issue #93 (Walt's 2026-06-19 live UI review): dark-mode tiles read FLAT
// against the background, because the dark tile inherited a shadow tuned for
// light backgrounds that the dark canvas swallows whole.
//
// The guard first pinned the v7 `.tile` rules. That tile was retired with the
// v14 layout and its dead rules removed in #724 (SPEC-dashboard-empty-loading
// AC-016), so the guard now watches the tile people see: `.app-grid-tool`. Its
// shadow is drawn from `--v-shadow-tile`, so the #93 promise is two facts:
// `.dark .app-grid-tool` sets its own box-shadow, and the token it reads is
// re-tuned under `.dark` (a deeper drop than light mode's).
//
// jsdom can't compute the full index.css cascade, but it DOES resolve a single
// extracted rule's box-shadow (same trick as not-monitored.test.tsx).
const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

function ruleBody(selectorRegex: RegExp): string {
  const match = css.match(selectorRegex);
  expect(match, `expected a CSS rule matching ${selectorRegex}`).toBeTruthy();
  return match![1];
}

function boxShadowOf(body: string): string {
  const style = document.createElement('style');
  style.textContent = `.dark-tile-probe { ${body} }`;
  document.head.appendChild(style);
  const el = document.createElement('div');
  el.className = 'dark-tile-probe';
  document.body.appendChild(el);
  const shadow = getComputedStyle(el).boxShadow;
  style.remove();
  el.remove();
  return shadow;
}

function tokenIn(blockRegex: RegExp, name: string): string {
  const body = ruleBody(blockRegex);
  const m = body.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
  expect(m, `expected ${name} in ${blockRegex}`).toBeTruthy();
  return m![1].trim();
}

const alpha = (rgba: string) => Number(/rgba\([^)]*,\s*([\d.]+)\s*\)/.exec(rgba)?.[1]);

describe('issue #93 — dark tiles read flat (missing dark-mode box-shadow)', () => {
  const DARK_TILE = /\.dark\s+\.app-grid-tool\s*\{([^}]*)\}/;
  const ROOT = /(?:^|\n):root\s*\{([^}]*)\}/;
  const DARK = /(?:^|\n)\.dark\s*\{([^}]*)\}/;

  it('.dark .app-grid-tool sets its own box-shadow', () => {
    const shadow = boxShadowOf(ruleBody(DARK_TILE));
    expect(shadow).not.toBe('none');
    expect(shadow.trim()).not.toBe('');
    expect(ruleBody(DARK_TILE)).toMatch(/box-shadow\s*:[^;]*var\(--v-shadow-tile\)/);
  });

  it('--v-shadow-tile is re-tuned under .dark: a different, deeper drop than light mode', () => {
    const light = tokenIn(ROOT, '--v-shadow-tile');
    const dark = tokenIn(DARK, '--v-shadow-tile');
    expect(dark).not.toBe(light);
    expect(alpha(dark)).toBeGreaterThan(alpha(light));
  });
});
