import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// SPEC-category-pane-width-layout AC5 — the Home content section must drop the
// max-w-6xl cap so content fills the viewport (minus D1 responsive padding that
// tops out at 64px / px-16). Source-guard: jsdom has no layout, so we assert the
// container class instead of a measured width.
const app = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');

describe('Home container (AC5)', () => {
  it('AC5 no max-w-6xl content cap remains', () => {
    expect(app).not.toMatch(/max-w-6xl/);
  });

  it('AC5 uses full-width responsive padding capped at px-16 (D1)', () => {
    expect(app).toMatch(/w-full/);
    expect(app).toMatch(/px-4\b/);
    expect(app).toMatch(/sm:px-6/);
    expect(app).toMatch(/lg:px-8/);
    expect(app).toMatch(/xl:px-12/);
    expect(app).toMatch(/2xl:px-16/);
  });
});
