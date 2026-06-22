// #29 (v9.3 a11y fast-follow) — the `.library-chip` uppercase label was
// #4f46e5 on rgba(99,102,241,0.1), which composited to ~2.73:1 in dark mode
// (failing WCAG-AA) with NO `.dark .library-chip` override. jest-axe/jsdom
// can't compute contrast (no compositing engine), so we guard the stylesheet
// directly.
//
// #90 reworked chips to per-category color via the `--chip-hue` custom property
// with FIXED saturation/lightness — so contrast now rides on the lightness gap,
// not a single hardcoded color. The #29 guarantee survives that change: assert
// the dark override exists AND keeps a high text lightness (so a regression that
// re-darkens dark-mode chip text is still caught). Light/dark text lightnesses
// (28% on a near-white chip; 80% on the dark panel) were verified AA across all
// palette hues by hand (min ~4.9:1 light, ~7.3:1 dark).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

describe('#29/#90 — .library-chip dark-mode contrast', () => {
  it('defines a .dark .library-chip override', () => {
    expect(css).toMatch(/\.dark\s+\.library-chip\s*\{/);
  });

  it('keeps dark-mode chip text light enough for AA (HSL lightness >= 70%)', () => {
    const rule = css.match(/\.dark\s+\.library-chip\s*\{([^}]*)\}/);
    expect(rule).not.toBeNull();
    const color = rule![1].match(/color:\s*hsl\(var\(--chip-hue\)\s+\d+%\s+(\d+)%/);
    expect(color).not.toBeNull();
    expect(Number(color![1])).toBeGreaterThanOrEqual(70);
  });
});
