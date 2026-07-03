import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONTENT_WIDTH } from './layout';
import { FRAME_FLUID_VW, FRAME_MAX_PX, FRAME_PAD_PX, frameContentPx } from './appGrid';

// SPEC-ultrawide-fluid-frame (Phase 1b) — the shared CONTENT_WIDTH frame stops
// being a fixed 1536px island on big monitors: `max-w-[max(1536px,92vw)]` keeps
// the shipped 1536px cap through standard desktops and grows FLUIDLY as 92vw
// beyond ~1670px viewports, so a 2560/3840 monitor's width is actually used
// (Caleb, 2026-07-02: "modern, efficient, dynamic for mobile phones up to 4k
// monitors"). The pane-fill grow model (Phase 1 R3/R4) fills the wider frame.
//
// jsdom has no layout, so this file guards the two halves of the contract that
// must stay in lock-step: the CSS token (layout.ts) and its JS mirror
// (frameContentPx in appGrid.ts, which the R4 lone-box bin-pack reads).

describe('CONTENT_WIDTH token is the fluid frame (SPEC-ultrawide-fluid-frame)', () => {
  it('keeps the 1536px floor and grows as 92vw — one max() token, still centered', () => {
    expect(CONTENT_WIDTH).toContain('max-w-[max(1536px,92vw)]');
    expect(CONTENT_WIDTH).toContain('mx-auto');
    expect(CONTENT_WIDTH).toContain('px-4');
  });

  it('declares no second max-width that could re-cap the fluid band', () => {
    expect(CONTENT_WIDTH.match(/max-w-/g)).toHaveLength(1);
  });
});

describe('frameContentPx mirrors the CSS token (R4 bin-pack input)', () => {
  it('matches the exported constants it is built from', () => {
    expect(FRAME_MAX_PX).toBe(1536);
    expect(FRAME_FLUID_VW).toBe(0.92);
    expect(FRAME_PAD_PX).toBe(32);
  });

  it('is UNCHANGED from shipped Phase 1 at and below the 1536px cap', () => {
    // Below the cap the viewport itself constrains: content = vw − 32.
    expect(frameContentPx(390)).toBe(358);
    expect(frameContentPx(1024)).toBe(992);
    expect(frameContentPx(1440)).toBe(1408);
    expect(frameContentPx(1536)).toBe(1504);
  });

  it('holds the 1536px cap through the plateau band (1536 < vw ≤ ~1670)', () => {
    // 92vw < 1536 here, so max() still returns the 1536 floor — same as shipped.
    expect(frameContentPx(1600)).toBe(1504);
    expect(frameContentPx(1669)).toBe(1504);
  });

  it('grows fluidly as 92vw beyond the ~1670px crossover — no jump at the seam', () => {
    // The two regimes meet where 92vw == 1536 (vw ≈ 1669.6): continuous width.
    expect(frameContentPx(1670)).toBeCloseTo(1670 * 0.92 - 32, 5);
    expect(frameContentPx(1920)).toBeCloseTo(1734.4, 5);
    expect(frameContentPx(2560)).toBeCloseTo(2323.2, 5);
    // 4K: ~3501px of content instead of the old 1504px island (+2000px usable).
    expect(frameContentPx(3840)).toBeCloseTo(3500.8, 5);
  });

  it('is monotonic — a wider monitor never gets a narrower frame (the #194 inversion, generalized)', () => {
    let prev = -Infinity;
    for (let vw = 320; vw <= 3840; vw += 16) {
      const w = frameContentPx(vw);
      expect(w).toBeGreaterThanOrEqual(prev);
      prev = w;
    }
  });
});

describe('.app-grid residual centering rides only the fluid band (R3 residual rule)', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

  it('the base .app-grid rule stays left-packed (≤1536-frame layouts byte-identical)', () => {
    const base = css.match(/\.app-grid\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(base).not.toMatch(/justify-content/);
  });

  it('a ≥1671px media query centers the packed cluster when every box is at content-max', () => {
    const fluid = css.match(/@media\s*\(min-width:\s*1671px\)\s*\{\s*\.app-grid\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(fluid).toMatch(/justify-content:\s*center/);
  });
});
