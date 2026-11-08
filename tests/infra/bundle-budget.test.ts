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
// The headroom is DERIVED. Entry JS and CSS gzip at every 16.x release tag, each
// built from its own tag in a clean worktree (2026-09-28):
//
//   tag       entry JS          entry CSS
//   v16.0.0     93,738             16,898
//   v16.1.0     95,794 (+2,056)    17,698   (+800)
//   v16.2.0     96,684   (+890)    17,713    (+15)
//   v16.3.0     97,374   (+690)    17,725    (+12)
//   v16.4.0     97,595   (+221)    17,747    (+22)
//   v16.5.0     98,644 (+1,049)    18,174   (+427)
//   v16.5.1     98,652     (+8)    18,191    (+17)
//   v16.5.2     98,948   (+296)    18,191     (+0)
//   v16.6.0     98,850    (-98)    18,165    (-26)
//
// Worst single release +2,056 B JS / +800 B CSS; medians ~+490 / ~+16; the whole
// 16.x line added 5,112 B JS (+5.5%). Budgets are ~3x the worst observed release:
// 105,000 leaves 6,150 B (about a dozen typical releases), 20,500 leaves 2,335 B.
//
// WHY NOT LOOSER — this budget shipped at 115,000 (~16%) and was reviewed twice,
// which is worth recording because the reviewers split and the argument matters.
//
// The case for 115,000 (gracie, PR #500): growth is ~852 B/version, so 16 kB is
// ~19 versions of runway; a budget that trips on routine growth trains people to
// raise it without thinking, and the structural case (chunks collapsing into the
// entry) is already caught by the LAZY_CHUNKS assertions below — so the byte
// budget's job is only genuine cumulative growth.
//
// That division of labour is right, and the number still does not follow from it.
// LAZY_CHUNKS only checks that these five KNOWN overlays stay separate. A new
// dependency statically imported into the entry chunk leaves all five intact and
// shows up ONLY as bytes — which is precisely the job assigned to this budget. At
// 115,000 anything up to +16 kB passed silently.
//
// Read the two controls carefully, because they do NOT prove the same thing and
// the stronger-looking one is the weaker evidence (gracie's reading on #501, which
// is sharper than the argument it corrected):
//
//   manualChunks: () => 'index'  → entry 98,850 → 108,175 B. Passes at 115,000,
//     fails SIX assertions at 105,000. But it collapses the chunk structure, so
//     all five LAZY_CHUNKS fire too — this case was already covered, and it
//     OVERSTATES what the byte budget adds.
//
//   a static import that does NOT collapse the lazy chunks (verified by appending
//     a 7.2 kB incompressible payload to src/main.tsx) → entry 106,767 B, all five
//     lazy chunks still emitted, LAZY_CHUNKS all GREEN, and exactly ONE assertion
//     fails: this budget. THAT is the real-world regression class, and the byte
//     budget is the only thing standing in front of it.
//
// So the second control is the one that justifies the number. The first proves the
// underlying point about coverage, but via a case both guards catch.
//
// Runway is also not a virtue here. Headroom is not a budget for future spending;
// it is how much unnoticed regression the guard tolerates. Growth that is expected
// gets the number raised deliberately, which is what the policy below is for.
//
// The rubber-stamp risk is real, and 3x is the answer to it: at a ~490 B median
// this is ~12 releases between raises, not one per release.
//
// CSS keeps a proportionally larger share than JS on purpose, and deliberately
// stays at 3x rather than the 2x suggested in review. Its failure mode is not a
// dependency creeping in, it is a Tailwind purge/content-glob regression — an
// order-of-magnitude event. Every candidate budget in this range catches that
// equally, so tightening buys no detection and only adds false-positive risk on
// legitimate design-token work (one observed release already moved +800 B).
// Asymmetric multiples are correct when the failure modes are asymmetric.
//
// Raising a budget is a legitimate, deliberate act; a feature can cost bytes. Do
// it in the same commit that spends them, with the new measurement, so the number
// always reflects a decision someone made rather than drift nobody noticed.
//
// SPEC-status-widgets Phase 1 (2026-11-07), measured before (gitea/main 9c7ce48,
// 17.0.0) and after on the feature branch, same method:
//   entry JS   100,958 → 102,826 B gzip (+1,868): the tile widget line and its
//              formatting, the live-poll merge, the ⌘K web row, the
//              /api/widgets/info read and the Show widgets preference
//   entry CSS   19,430 →  19,690 B gzip (+260): the Large widget line (shares
//              the status-line rule) and the glance strip
//   lazy, new  GlanceStrip 1,467 · widget-admin.css 696 · widget-admin.js 545
//              (the admin widget code shared by the two editors)
//   lazy, grew TileEditModal 3,854 → 7,470 · SettingsPanel 9,920 → 11,907
// Budgets unchanged: 2,174 B JS and 810 B CSS of headroom remain. The strip's
// JS and every admin-only widget module are lazy on purpose (AC-033), and the
// admin styles are asserted out of the entry below (AC-032).
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
  // SPEC-status-widgets — the clock/weather strip renders only once an admin
  // turns one of them on, so its JS stays out of the entry.
  'GlanceStrip',
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

  // SPEC-status-widgets AC-032 / Q10 (a) — the admin widget forms (tile editor
  // Widget section, Admin Panel → Widgets) ship in a lazy CSS chunk that loads
  // with those editors. Every viewer downloads the entry stylesheet on first
  // paint; none of them needs these rules. `.widget-config` is the root class of
  // both admin surfaces, so its presence is the signal.
  it('the admin widget styles stay out of the entry stylesheet', () => {
    const entry = readdirSync(assets).find((f) => /^index-[A-Za-z0-9_-]+\.css$/.test(f));
    expect(entry, 'no entry stylesheet in dist/assets').toBeDefined();
    expect(readFileSync(resolve(assets, entry!), 'utf8')).not.toContain('.widget-config');
  });

  it('a lazy CSS chunk carries the admin widget styles', () => {
    const lazyCss = readdirSync(assets).filter((f) => f.endsWith('.css') && !/^index-/.test(f));
    const holders = lazyCss.filter((f) => readFileSync(resolve(assets, f), 'utf8').includes('.widget-config'));
    expect(
      holders.length,
      `expected a non-entry CSS chunk with .widget-config (src/widgets/widget-admin.css, imported by the ` +
        `lazy editors). Found CSS: ${lazyCss.join(', ') || 'none'}`,
    ).toBeGreaterThan(0);
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
