import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// #498 — the DETERMINISTIC half of load-performance regression cover.
//
// tests/e2e/perf.spec.ts measures wall-clock in a browser. On a shared CI runner
// its bounds have to be loose enough to never flake, which makes them useless for
// catching a 20% regression. Bytes do not have that problem: the numbers below are
// identical on every machine, so this is where a real budget belongs.
//
// It is also the BUILT-OUTPUT counterpart to tests/infra/code-splitting.test.ts,
// which greps src/ for `lazy(() => import(...))`. That proves the source expresses
// the intent; it cannot prove Rollup honoured it. A `build.rollupOptions.output`
// change — `manualChunks`, or `inlineDynamicImports: true` — would fold every
// overlay back into the entry chunk and leave that suite perfectly green. This
// suite reads dist/ and would fail.
//
// Baseline measured 2026-09-28 at b117931 (`npm run build`, vite 5.4.21):
//   entry JS   98,849 B gzip  (305,864 raw)
//   entry CSS  18,165 B gzip  ( 93,910 raw)
//   lazy       SettingsPanel 4,752 · TileEditModal 3,596 · LibraryBrowse 1,858
//              ServiceForm 1,399 · IframeOverlay 827  (all gzip)
//
// The headroom is DERIVED, not chosen by feel. Entry-chunk gzip at every 16.x
// release tag, each built from its own tag in a clean worktree (2026-09-28):
//
//   tag       entry JS        entry CSS
//   v16.0.0     93,738           16,898
//   v16.1.0     95,794 (+2,056)  17,698   (+800)
//   v16.2.0     96,684   (+890)  17,713    (+15)
//   v16.3.0     97,374   (+690)  17,725    (+12)
//   v16.4.0     97,595   (+221)  17,747    (+22)
//   v16.5.0     98,644 (+1,049)  18,174   (+427)
//   v16.5.1     98,652     (+8)  18,191    (+17)
//   v16.5.2     98,948   (+296)  18,191     (+0)
//   v16.6.0     98,850    (-98)  18,165    (-26)
//
// JS: worst single release +2,056 B, median ~+490 B, whole 16.x line +5,112 B
// (+5.5%). 105,000 leaves 6,150 B — about 3x the worst release observed, or a
// dozen typical ones. Quiet enough not to be raised reflexively, tight enough to
// trip on the failure this exists to catch: any single addition over that 6,150 B
// of headroom — the weight of a mid-sized dependency landing in the entry chunk.
//
// CSS: worst single release +800 B, median ~+16 B, whole line +1,267 B (+7.5%).
// 20,500 leaves 2,335 B, again ~3x the worst release. That is a proportionally
// LARGER share than the JS budget on purpose — the CSS failure mode is not a
// dependency creeping in, it is a Tailwind purge/content-glob regression, which
// is an order-of-magnitude event (tens to hundreds of kB). A budget that catches
// that does not need to be tight, and a tight one would only trip on legitimate
// token work.
//
// Two earlier drafts of these numbers were picked by feel — 115,000 (~16%, room
// for two mid-weight dependencies to hide in) and then 19,500 for CSS (only 1.7x
// the worst observed release, so normal token work would have breached it). Both
// were challenged in review, measured, and corrected. Measure before you pick.
//
// Raising a budget is a legitimate, deliberate act; a feature can cost bytes. Do
// it in the same commit that spends them, with the new measurement, so the number
// always reflects a decision someone made rather than drift nobody noticed.
const ENTRY_JS_GZIP_BUDGET = 105_000;
const ENTRY_CSS_GZIP_BUDGET = 20_500;

// Every overlay that must stay OUT of the entry chunk. Same list as
// code-splitting.test.ts, asserted against the build instead of the source.
const LAZY_CHUNKS = [
  'SettingsPanel',
  'TileEditModal',
  'LibraryBrowse',
  'ServiceForm',
  'IframeOverlay',
] as const;

const dist = resolve(process.cwd(), 'dist');
const assets = resolve(dist, 'assets');
const gz = (p: string) => gzipSync(readFileSync(p)).length;
const kb = (n: number) => `${(n / 1000).toFixed(1)} kB`;

describe('bundle budget — the built artifact stays within its byte budget', () => {
  // House convention (cf. pwa-icons.test.ts): assert dist/ exists rather than
  // skipping without it. A budget that opts out when the build is missing is a
  // budget that passes vacuously, which is the failure mode #498 was about.
  it('built dist/ exists (run `npm run build` first)', () => {
    expect(existsSync(dist)).toBe(true);
    expect(existsSync(assets)).toBe(true);
  });

  it('index.html loads exactly one hashed entry chunk', () => {
    const html = readFileSync(resolve(dist, 'index.html'), 'utf8');
    const entries = [...html.matchAll(/src="(\/assets\/index-[A-Za-z0-9_-]+\.js)"/g)].map(
      (m) => m[1],
    );
    expect(entries, `expected one /assets/index-<hash>.js in dist/index.html`).toHaveLength(1);
  });

  it('the entry JS chunk is within budget', () => {
    const file = readdirSync(assets).find((f) => /^index-[A-Za-z0-9_-]+\.js$/.test(f));
    expect(file, `no entry chunk in dist/assets — found: ${readdirSync(assets).join(', ')}`)
      .toBeDefined();

    const size = gz(resolve(assets, file!));
    expect(
      size,
      `entry JS is ${kb(size)} gzip, over the ${kb(ENTRY_JS_GZIP_BUDGET)} budget. ` +
        `Either trim it, lazy-load the new code (see code-splitting.test.ts), or raise ` +
        `ENTRY_JS_GZIP_BUDGET in this file with the new measurement and a reason.`,
    ).toBeLessThanOrEqual(ENTRY_JS_GZIP_BUDGET);
  });

  it('the entry CSS is within budget', () => {
    const file = readdirSync(assets).find((f) => /^index-[A-Za-z0-9_-]+\.css$/.test(f));
    expect(file, `no entry stylesheet in dist/assets`).toBeDefined();

    const size = gz(resolve(assets, file!));
    expect(
      size,
      `entry CSS is ${kb(size)} gzip, over the ${kb(ENTRY_CSS_GZIP_BUDGET)} budget. ` +
        `Raise ENTRY_CSS_GZIP_BUDGET with the new measurement if the bytes are intended.`,
    ).toBeLessThanOrEqual(ENTRY_CSS_GZIP_BUDGET);
  });

  it.each(LAZY_CHUNKS)('%s ships as its own async chunk, not inside the entry', (name) => {
    const found = readdirSync(assets).filter((f) =>
      new RegExp(`^${name}-[A-Za-z0-9_-]+\\.js$`).test(f),
    );
    expect(
      found,
      `expected dist/assets/${name}-<hash>.js. Absent means Rollup inlined it into the ` +
        `entry chunk — check build.rollupOptions.output (manualChunks / inlineDynamicImports) ` +
        `and that the lazy(() => import()) in src/ survived. Found: ${readdirSync(assets).join(', ')}`,
    ).toHaveLength(1);

    // Non-empty: an inlined module can still leave a stub behind.
    expect(gz(resolve(assets, found[0]))).toBeGreaterThan(100);
  });
});
