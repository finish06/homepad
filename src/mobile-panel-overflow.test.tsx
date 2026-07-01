// PROD hotfix #212 — v14 floating panels overflow the viewport on mobile.
// Symptom: on a ~390px phone the category panels (e.g. DEVELOP, 3 apps) extend
// past the right edge and the whole PAGE scrolls sideways, clipping the panel.
//
// Cause: `.panel-tiles` uses fixed 190px tile slots and `.category-panel` a
// fixed 190px-derived width, plus a 48px `.tile-field` anchor. On mobile a
// 2-col panel is 2×190+16+32=428px + 48px = ~476px > a 390px viewport.
//
// jsdom has NO layout engine, so it cannot measure real horizontal overflow in
// pixels — that is verified at 375/390/768px in the CDP browser gate. Here we
// guard the CSS rules that ENFORCE the fix: a mobile media query where tiles go
// fluid (shrink below 190px) and the anchor shrinks. Each test is named for the
// observed symptom, not a theorized cause.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

// Pull out the mobile block so the assertions can't be satisfied by desktop
// rules that happen to appear elsewhere in the file.
const mobileBlock = (() => {
  const m = css.match(/@media\s*\(max-width:\s*767px\)\s*\{[\s\S]*?\n {2}\}/);
  return m ? m[0] : '';
})();

describe('mobile panels no longer overflow the viewport (#212)', () => {
  it('has a <768px media query that overrides the desktop panel layout', () => {
    expect(mobileBlock).not.toBe('');
  });

  it('lets tiles shrink to fit instead of staying a fixed 190px (fluid columns)', () => {
    // The desktop grid is `repeat(var(--panel-cols), 190px)`; on mobile it must
    // become fluid so N columns fit the phone width — capped at 190px so they
    // never grow past the desktop size.
    expect(mobileBlock).toMatch(/grid-template-columns:\s*repeat\(var\(--panel-cols[^)]*\),\s*minmax\(0,\s*190px\)\)/);
  });

  it('makes the panel span the field instead of the fixed 190px-derived width', () => {
    // The fixed `width: calc(... * 190px ...)` is what pushed the panel past the
    // screen edge; on mobile the panel fills the field (100%) and stacks.
    expect(mobileBlock).toMatch(/\.category-panel\s*\{[^}]*width:\s*100%/);
  });

  it('shrinks the 48px left anchor on the field and the recently-opened rail', () => {
    // 48px eats too much of a phone; the section px-4 already supplies the inset.
    expect(mobileBlock).toMatch(/\.tile-field\s*\{[^}]*margin-left:\s*0/);
    expect(mobileBlock).toMatch(/\.recently-opened-rail\s*\{[^}]*margin-left:\s*0/);
  });
});

describe('recently-opened rail scrolls internally, never the page (#212, B-006)', () => {
  it('keeps overflow-x scrolling on the chip rail itself', () => {
    // The rail's chips carry `overflow-x-auto` (Tailwind) in the markup so a long
    // rail scrolls WITHIN itself rather than widening the page.
    const catalog = readFileSync(resolve(process.cwd(), 'src/Catalog.tsx'), 'utf8');
    expect(catalog).toMatch(/recently-opened-chips[^"]*overflow-x-auto/);
  });
});
