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
// SPEC-status-widgets Phase 1, re-measured 2026-11-20 against gitea/main 066b3cf
// (household-basics and backup-import merged), same method:
//   entry JS   102,152 → 103,929 B gzip (+1,777): the tile widget line and its
//              formatting, the live-poll merge, the ⌘K web row, the
//              /api/widgets/info read and the Show widgets preference
//   entry CSS   19,448 →  19,707 B gzip (+259): the Large widget line (shares
//              the status-line rule) and the glance strip
//   lazy, new  GlanceStrip 1,473 · widget-admin.css 696 · widget-admin.js 544
//              (the admin widget code shared by the two editors)
//   lazy, grew TileEditModal 3,854 → 7,473 · SettingsPanel 12,765 → 14,693
// Budgets unchanged: 1,071 B JS and 793 B CSS of headroom remain. The strip's
// JS and every admin-only widget module are lazy on purpose (AC-033), and the
// admin styles are asserted out of the entry below (AC-032).
//
// Lazy changelog, re-measured 2026-11-20 against gitea/main 714f52b, same method:
//   entry JS   104,301 →  89,279 B gzip (-15,022): ChangelogOverlay and
//              src/changelog.json left the entry chunk
//   entry CSS   19,707 →  19,707 B gzip (unchanged; the .changelog-* rules stay
//              in src/index.css)
//   lazy, new  ChangelogOverlay 14,927 (41,585 raw), almost all of it the JSON
// Budgets unchanged: 15,721 B JS and 793 B CSS of headroom remain. The
// changelog grows every release, so it now grows a lazy chunk, not the entry.
//
// SPEC-iframe-sandbox-optin, re-measured 2026-11-20 against gitea/main
// 76d0d07 (lazy changelog merged), same method:
//   entry JS    89,277 →  89,320 B gzip (+43): no sandbox code. It is Vite's
//              preload map naming the new shared chunk (sandbox-<hash>.js,
//              used by the two lazy surfaces) and IframeOverlay's deps on it
//   entry CSS   19,707 →  19,707 B gzip (+0): the switch row uses classes the
//              entry already has
//   lazy, new  sandbox 255 · lazy, grew TileEditModal → 7,925
// Budgets unchanged: 15,680 B JS and 793 B CSS of headroom remain.
//
// SPEC-password-reset-link, re-measured 2026-11-21 against gitea/main b43d80f
// (manage-adults and iframe sandbox merged), same method:
//   entry JS    89,428 →  89,572 B gzip (+144): App.tsx's one fragment
//              reader for #invite= and #reset=, the lazy stub, hasPassword
//   entry CSS   19,707 →  19,707 B gzip (+0)
//   lazy, new  ResetPasswordScreen 1,901 · ResetLinkDialog 1,499
//   lazy, grew SettingsPanel → 17,101 (Change password)
// Budgets unchanged: 15,428 B JS and 793 B CSS of headroom remain.
//
// SPEC-signin-hardening AC-020, re-measured 2026-11-21 on feat/password-reset-link
// f4c333c (gitea/main b43d80f plus SPEC-password-reset-link), same method:
//   entry JS    89,570 →  89,813 B gzip (+243): reading /#signin-error=, the
//              429 wait line and its formatter, Result.retryAfter, role="alert"
//              on the card's errors
//   entry CSS   19,707 →  19,707 B gzip (+0): no new CSS
//   lazy, new  ssoMessage 304: the single sign-on lines, loaded only when a
//              code is present (UX S-1; inline they cost about 75 B more)
// Budgets unchanged: 15,187 B JS and 793 B CSS of headroom remain.
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
  // SPEC-backup-import — the restore and Homepage-import flows. Each loads on
  // demand from the Admin Panel (and the import from the admin empty state).
  'RestoreModal',
  'HomepageImportModal',
  // SPEC-status-widgets — the clock/weather strip renders only once an admin
  // turns one of them on, so its JS stays out of the entry.
  'GlanceStrip',
  // The changelog overlay and its data (src/changelog.json) load only when the
  // footer version badge is clicked.
  'ChangelogOverlay',
  // SPEC-household-manage-adults UX §1 — the remove and role confirms load
  // from the adult row menu, inside the lazy Admin Panel.
  'AdultConfirm',
  // SPEC-password-reset-link UX §1 — and the reset-link dialog, the same way.
  'ResetLinkDialog',
  // SPEC-household-basics / SPEC-password-reset-link UX §1 — the Join screen
  // and the reset screen mount only from a /#invite= or /#reset= link. Both
  // hang off App.tsx, so a stray static import there would land in the entry.
  'JoinScreen',
  'ResetPasswordScreen',
  // SPEC-signin-hardening AC-020 — the single sign-on lines load only when the
  // sign-in card has a /#signin-error= code.
  'ssoMessage',
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

  // SPEC-backup-import — the Backup and import styles ship in a lazy stylesheet,
  // never in the entry. Tailwind scans all of src/ into the entry CSS, so these
  // surfaces use their own bi-* classes from src/library/backup/backup-import.css.
  it('the Backup and import styles stay out of the entry stylesheet', () => {
    const entry = readdirSync(assets).find((f) => /^index-[A-Za-z0-9_-]+\.css$/.test(f))!;
    expect(readFileSync(resolve(assets, entry), 'utf8')).not.toMatch(/\.bi-/);
    const lazy = readdirSync(assets)
      .filter((f) => f.endsWith('.css') && f !== entry)
      .map((f) => readFileSync(resolve(assets, f), 'utf8'));
    expect(lazy.some((css) => /\.bi-plan-row\b/.test(css)), 'no lazy stylesheet carries the bi-* rules').toBe(true);
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

  // SPEC-household-manage-adults UX §1 — the adult row menu's styles live in
  // household.css, which rides in the lazy admin chunk. index.css gets nothing.
  it('the adult row menu styles stay out of the entry stylesheet', () => {
    const entry = readdirSync(assets).find((f) => /^index-[A-Za-z0-9_-]+\.css$/.test(f))!;
    expect(readFileSync(resolve(assets, entry), 'utf8')).not.toMatch(/\.adult-menu/);
    const lazy = readdirSync(assets)
      .filter((f) => f.endsWith('.css') && f !== entry)
      .map((f) => readFileSync(resolve(assets, f), 'utf8'));
    expect(lazy.some((css) => /\.adult-menu\b/.test(css)), 'no lazy stylesheet carries the .adult-menu rules').toBe(true);
  });

  it('the adult row menu and its confirms are not in the entry chunk', () => {
    const entry = readdirSync(assets).find((f) => /^index-[A-Za-z0-9_-]+\.js$/.test(f))!;
    const src = readFileSync(resolve(assets, entry), 'utf8');
    for (const copy of ['pending invite will stop working', 'Homepad needs at least one admin', 'adult-menu']) {
      expect(src, `the entry chunk carries "${copy}"`).not.toContain(copy);
    }
  });

  // SPEC-admin-server-settings AC-037 — the editable System settings ride in
  // the lazy SettingsPanel chunk: their client, copy and styles never reach the
  // entry. Measured against the spec commit (gzip -9 of dist/assets): entry JS
  // 89,924 -> 89,947 B (+23: the env-config client left api.ts, and main.tsx
  // gained the lazy /#oidc-test= landing), entry CSS 19,753 -> 19,678 B (-75;
  // the old env-list rules left index.css, the new rules are in
  // src/library/server-settings.css). Budgets unchanged.
  it('the server settings code and styles are not in the entry chunk', () => {
    const files = readdirSync(assets);
    const entryJs = readFileSync(resolve(assets, files.find((f) => /^index-[A-Za-z0-9_-]+\.js$/.test(f))!), 'utf8');
    for (const probe of ['/api/admin/server-settings', 'HOMEPAD_SETTINGS_FROM_ENV_ONLY', 'Review and save']) {
      expect(entryJs, `the entry chunk carries "${probe}"`).not.toContain(probe);
    }
    const panel = files.find((f) => /^SettingsPanel-[A-Za-z0-9_-]+\.js$/.test(f))!;
    expect(readFileSync(resolve(assets, panel), 'utf8')).toContain('/api/admin/server-settings');
    const entryCss = files.find((f) => /^index-[A-Za-z0-9_-]+\.css$/.test(f))!;
    expect(readFileSync(resolve(assets, entryCss), 'utf8')).not.toContain('.settings-setting');
    const lazy = files.filter((f) => f.endsWith('.css') && f !== entryCss).map((f) => readFileSync(resolve(assets, f), 'utf8'));
    expect(lazy.some((css) => css.includes('.settings-setting-head')), 'no lazy stylesheet carries the row rules').toBe(true);
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

  // The changelog data is the largest single thing a viewer never needs on first
  // paint. A chunk named ChangelogOverlay can exist while the JSON still sits in
  // the entry (a second static importer would do it), so check the bytes.
  it('the changelog data ships with the lazy overlay, not in the entry chunk', () => {
    const data: { versions: { changes: { text: string }[] }[] } = JSON.parse(
      readFileSync(resolve(process.cwd(), 'src', 'changelog.json'), 'utf8'),
    );
    // Plain-ASCII entries only, so the probe is not defeated by string escaping.
    const probes = data.versions
      .flatMap((v) => v.changes.map((c) => c.text))
      .filter((t) => t.length > 30 && /^[A-Za-z0-9 ,.()-]+$/.test(t))
      .slice(0, 3);
    expect(probes.length, 'no plain-ASCII changelog entry to probe for').toBeGreaterThan(0);

    const files = readdirSync(assets);
    const entry = readFileSync(resolve(assets, files.find((f) => /^index-[A-Za-z0-9_-]+\.js$/.test(f))!), 'utf8');
    const overlayFile = files.find((f) => /^ChangelogOverlay-[A-Za-z0-9_-]+\.js$/.test(f));
    expect(overlayFile, 'no ChangelogOverlay-<hash>.js chunk').toBeDefined();
    const overlay = readFileSync(resolve(assets, overlayFile!), 'utf8');
    for (const text of probes) {
      expect(entry.includes(text), `entry chunk contains changelog text: ${text}`).toBe(false);
      expect(overlay.includes(text), `overlay chunk is missing changelog text: ${text}`).toBe(true);
    }
  });

  // SPEC-iframe-sandbox-optin (UX §1 "Bundle") — the sandbox rule lives in
  // src/lib/sandbox.ts and is imported only by the lazy overlay and tile
  // editor. Its token string is the signal: in a lazy chunk, never the entry.
  it('the overlay sandbox rule stays out of the entry chunk', () => {
    const entry = readdirSync(assets).find((f) => /^index-[A-Za-z0-9_-]+\.js$/.test(f))!;
    expect(readFileSync(resolve(assets, entry), 'utf8')).not.toContain('allow-forms allow-popups');
    const lazy = readdirSync(assets).filter((f) => f.endsWith('.js') && f !== entry);
    expect(
      lazy.some((f) => readFileSync(resolve(assets, f), 'utf8').includes('allow-scripts allow-forms allow-popups')),
      'no lazy chunk carries the strict sandbox',
    ).toBe(true);
  });

  // SPEC-signin-hardening AC-020 — the SSO copy is not in the entry, and the
  // wait line (which every 429 on the card needs) is.
  it('the single sign-on lines stay out of the entry chunk', () => {
    const entry = readdirSync(assets).find((f) => /^index-[A-Za-z0-9_-]+\.js$/.test(f))!;
    const js = readFileSync(resolve(assets, entry), 'utf8');
    expect(js).not.toContain("hasn't confirmed your email");
    expect(js).not.toContain("Single sign-on didn't work");
    expect(js).toContain('Too many tries. Wait');
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
