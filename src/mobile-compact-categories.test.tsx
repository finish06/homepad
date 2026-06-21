import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// #126 — On a 390-wide (phone) viewport the four collapsed category headers ate
// ~40% of the screen, burying every app tile below the fold. The fix is purely
// presentational: the category-list wrappers go from a flat `space-y-8` (32px)
// gap to `space-y-2 sm:space-y-8` (8px on phones, 32px from `sm` up), and the
// `.cat-head` divider drops its bottom margin/padding below 640px. jsdom has no
// layout/paint, so we can't measure the y-positions here (that's the browser-real
// QA pass) — instead we assert the source HOOKS that produce the tighter mobile
// rhythm, the same way the v7-visual / day-header regression tests do.

const catalogSrc = readFileSync(resolve(process.cwd(), 'src/Catalog.tsx'), 'utf8');
const cssSrc = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

describe('#126 — collapsed category spacing is tight on mobile, unchanged on desktop', () => {
  it('the category-list wrappers gap tightly on phones but keep desktop breathing room', () => {
    // Both `space-y-8` wrappers (outer categories block + inner sortable list)
    // must switch to the responsive `space-y-2 sm:space-y-8`.
    const responsive = catalogSrc.match(/className="space-y-2 sm:space-y-8"/g) ?? [];
    expect(responsive.length).toBe(2);
    // And no bare `space-y-8` (without the phone override) survives.
    expect(catalogSrc).not.toMatch(/className="space-y-8"/);
  });

  it('suppresses the .cat-head bottom margin/padding below the sm (640px) breakpoint', () => {
    // A max-width:639px media query tightening .cat-head must exist.
    const mq = cssSrc.match(/@media\s*\(max-width:\s*639px\)\s*\{[^@]*?\.cat-head\s*\{[^}]*\}/s);
    expect(mq, 'expected a (max-width: 639px) .cat-head rule').not.toBeNull();
    const block = mq![0];
    expect(block).toMatch(/margin-bottom:\s*0\.25rem/);
    expect(block).toMatch(/padding-bottom:\s*0\.25rem/);
  });

  it('leaves the desktop .cat-head spacing (1rem margin, 0.7rem padding) intact', () => {
    // The base rule the mobile query overrides is still present untouched.
    const base = cssSrc.match(/\.cat-head\s*\{[^}]*\}/);
    expect(base).not.toBeNull();
    expect(base![0]).toMatch(/margin-bottom:\s*1rem/);
    expect(base![0]).toMatch(/padding-bottom:\s*0\.7rem/);
  });
});

// #126 (caret fold, Walt 2026-06-21) — the collapse chevron must sit at the
// trailing (right) edge of the header row, matching the iOS/Material disclosure
// standard, and the header must be a >= 44px tap target on phones (WCAG 2.5.5 /
// Apple HIG). jsdom has no layout, so — like the spacing tests above — we assert
// the source hooks that produce the behaviour, not measured pixels.
describe('#126 caret — chevron is right-aligned and the header is a 44px mobile tap target', () => {
  it('pins the disclosure chevron to the trailing edge with ml-auto', () => {
    // The chevron <svg> (data-testid="disclosure-chevron") carries `ml-auto` so
    // it is pushed to the far right of the flex header, past the title + count.
    const chevron = catalogSrc.match(
      /data-testid="disclosure-chevron"[\s\S]*?className=\{`([^`]*)`/,
    );
    expect(chevron, 'expected a disclosure-chevron svg with a className').not.toBeNull();
    expect(chevron![1]).toMatch(/\bml-auto\b/);
  });

  it('gives .cat-head a 44px minimum height below the sm (640px) breakpoint', () => {
    const mq = cssSrc.match(/@media\s*\(max-width:\s*639px\)\s*\{[^@]*?\.cat-head\s*\{[^}]*\}/s);
    expect(mq, 'expected a (max-width: 639px) .cat-head rule').not.toBeNull();
    expect(mq![0]).toMatch(/min-height:\s*44px/);
  });
});
