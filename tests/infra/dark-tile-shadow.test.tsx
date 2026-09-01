import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Issue #93 (Walt's 2026-06-19 live UI review): dark-mode tiles read FLAT
// against the background. Root cause: `.tile` defines a soft box-shadow tuned
// for light backgrounds (near-black `rgba(16,24,40,...)` drops), but
// `.dark .tile` only overrode `background` + `border-color` — never the
// box-shadow. So dark tiles inherited a shadow the dark canvas swallows whole.
//
// jsdom can't compute the full index.css cascade, but it DOES resolve a single
// extracted rule's box-shadow (same trick as not-monitored.test.tsx). So we
// pull the real `.tile` and `.dark .tile` blocks out of index.css and assert
// the dark variant paints its OWN shadow, distinct from the light default.
describe('issue #93 — dark tiles read flat (missing dark-mode box-shadow)', () => {
  function boxShadowOfRule(selectorRegex: RegExp): string {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
    const match = css.match(selectorRegex);
    expect(match, `expected a CSS rule matching ${selectorRegex}`).toBeTruthy();
    const body = match![1];
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

  const LIGHT = /(?:^|\n)\s*\.tile\s*\{([^}]*)\}/;
  const DARK = /\.dark\s+\.tile\s*\{([^}]*)\}/;

  it('the light .tile keeps its soft elevation shadow', () => {
    const light = boxShadowOfRule(LIGHT);
    expect(light).not.toBe('none');
    expect(light.trim()).not.toBe('');
  });

  it('.dark .tile defines its own box-shadow so the tile is not flat', () => {
    const dark = boxShadowOfRule(DARK);
    expect(dark).not.toBe('none');
    expect(dark.trim()).not.toBe('');
  });

  it('the dark shadow differs from the light one (re-tuned for the dark canvas)', () => {
    expect(boxShadowOfRule(DARK)).not.toBe(boxShadowOfRule(LIGHT));
  });
});
