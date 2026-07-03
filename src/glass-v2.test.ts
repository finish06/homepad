import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// SPEC-glass-v2-accent — source-guards for the glass v2 material pass. jsdom
// can't paint backdrop-filter or composite the blobs, so (per the
// dark-tile-shadow.test.tsx precedent) these assert the CSS source encodes the
// v2 contract; the pixels ride the browser gate + Kare's live review.
const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
const lightSurface = css.match(/(?:^|\n)\s*\.app-surface\s*\{([^}]*)\}/)?.[1] ?? '';
const darkSurface = css.match(/\.dark\s+\.app-surface\s*\{([^}]*)\}/)?.[1] ?? '';
const lightBox = css.match(/(?:^|\n)\s*\.app-grid-box\s*\{([^}]*)\}/)?.[1] ?? '';
const darkBox = css.match(/\.dark\s+\.app-grid-box\s*\{([^}]*)\}/)?.[1] ?? '';

describe('backdrop atmosphere (the thing the blur blurs)', () => {
  it('distributes blobs down the page — four radial layers per mode, not just the two top-corner ones', () => {
    expect(lightSurface.match(/radial-gradient/g)?.length).toBe(4);
    expect(darkSurface.match(/radial-gradient/g)?.length).toBe(4);
  });

  it('lays feTurbulence grain over the gradients to stop banding on large monitors', () => {
    expect(lightSurface).toContain('feTurbulence');
    expect(darkSurface).toContain('feTurbulence');
  });

  it('keeps every blob a whisper (alpha ≤ 0.14) so the contrast floors cannot move', () => {
    for (const rule of [lightSurface, darkSurface]) {
      const alphas = [...rule.matchAll(/rgb\(var\(--accent-\d\) \/ (0\.\d+)\)/g)].map((m) =>
        parseFloat(m[1]),
      );
      expect(alphas.length).toBeGreaterThanOrEqual(4);
      for (const a of alphas) expect(a).toBeLessThanOrEqual(0.14);
    }
  });
});

describe('the glass material (.app-grid-box)', () => {
  it('pairs saturate() with the blur — material, not gray wash (both engines)', () => {
    expect(lightBox).toMatch(/backdrop-filter:\s*blur\(\d+px\)\s*saturate\(/);
    expect(lightBox).toMatch(/-webkit-backdrop-filter:\s*blur\(\d+px\)\s*saturate\(/);
  });

  it('keeps the blur radius modest (≤16px) — five boxes × 3800px is a lot of GPU at 4K', () => {
    const r = parseInt(lightBox.match(/backdrop-filter:\s*blur\((\d+)px\)/)?.[1] ?? '99', 10);
    expect(r).toBeLessThanOrEqual(16);
  });

  it('adds the top-edge bevel as a SECOND inset shadow, keeping the 1px structural ring', () => {
    // Ring first (the content-box-width-preserving edge)…
    expect(lightBox).toMatch(/inset 0 0 0 1px rgba\(255, 255, 255/);
    expect(darkBox).toMatch(/inset 0 0 0 1px rgba\(255, 255, 255/);
    // …then the bevel highlight along the top edge only.
    expect(lightBox).toMatch(/inset 0 1px 0 rgba\(255, 255, 255/);
    expect(darkBox).toMatch(/inset 0 1px 0 rgba\(255, 255, 255/);
  });

  it('holds the glass alpha at or above the contrast floor (≥0.65 light / ≥0.60 dark)', () => {
    const light = parseFloat(lightBox.match(/rgba\(255, 255, 255, (0\.\d+)\)\s*;/)?.[1] ?? '0');
    const dark = parseFloat(darkBox.match(/rgba\(30, 30, 40, (0\.\d+)\)/)?.[1] ?? '0');
    expect(light).toBeGreaterThanOrEqual(0.65);
    expect(dark).toBeGreaterThanOrEqual(0.6);
  });
});

describe('a11y fallback', () => {
  it('prefers-reduced-transparency gets near-solid boxes and no backdrop-filter', () => {
    const block =
      css.match(/@media\s*\(prefers-reduced-transparency:\s*reduce\)\s*\{([\s\S]*?)\n  \}/)?.[1] ??
      '';
    expect(block).toMatch(/\.app-grid-box\s*\{[^}]*backdrop-filter:\s*none/);
    expect(block).toMatch(/rgba\(255, 255, 255, 0\.9\d\)/);
    expect(block).toMatch(/\.dark \.app-grid-box\s*\{[^}]*rgba\(30, 30, 40, 0\.9\d\)/);
  });
});
