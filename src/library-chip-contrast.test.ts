// #29 (v9.3 a11y fast-follow) — the `.library-chip` uppercase label is
// #4f46e5 on rgba(99,102,241,0.1). In dark mode that composites to ~2.73:1,
// failing WCAG-AA (small text needs >=4.5:1) — and there is NO
// `.dark .library-chip` override to lighten it. jest-axe/jsdom can't compute
// contrast (no layout/compositing engine), which is why the existing a11y
// suite missed it; so we assert the dark override RULE + lightened TOKEN exist
// in the stylesheet. The chosen pair (#a5b4fc on rgba(99,102,241,0.18) over
// the #0e1117 panel) computes ~7.9:1 — verified by hand at fix time.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

describe('#29 — .library-chip dark-mode contrast', () => {
  it('defines a .dark .library-chip override', () => {
    expect(css).toMatch(/\.dark\s+\.library-chip\s*\{/);
  });

  it('lightens the chip text to the AA-passing indigo (#a5b4fc)', () => {
    const rule = css.match(/\.dark\s+\.library-chip\s*\{([^}]*)\}/);
    expect(rule).not.toBeNull();
    expect(rule![1]).toMatch(/color:\s*#a5b4fc/i);
  });
});
