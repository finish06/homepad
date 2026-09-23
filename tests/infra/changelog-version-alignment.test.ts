// The in-app changelog overlay reads `src/changelog.json` — a SEPARATE,
// hand-maintained file from `CHANGELOG.md`. Nothing enforced that they agree.
//
// `prod-release.yml` validates tag == CHANGELOG.md top == package.json and
// deliberately does NOT regenerate changelog.json (ci-shared's parser speaks
// Keep-a-Changelog; homepad's CHANGELOG.md is prose, and the v16.1.0 run failed
// on exactly that). Its comment says the file "is hand-maintained per release
// (the release PR checks it)" — a convention with no gate behind it.
//
// It was missed for 16.5.0 and 16.5.1 in a row, so users on 16.5.1 opened the
// changelog and were told the newest release was 16.4.0. The version badge was
// right and the overlay beside it was two releases stale.
//
// This converts the convention into a check. It is a source-contract test: it
// reads the files off disk, needs no build, and fails in CI before a release
// can ship with a stale overlay.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

const pkgVersion: string = JSON.parse(read('package.json')).version;

type Change = { type: string; text: string };
type Version = { version: string; date: string; changes: Change[] };
const overlay: { pending: Change[]; versions: Version[] } = JSON.parse(read('src/changelog.json'));

// `## [16.5.1] — 2026-09-23 — Search box sits centred again`
const mdVersions = Array.from(read('CHANGELOG.md').matchAll(/^##\s*\[([0-9]+\.[0-9]+\.[0-9]+)\]/gm)).map(
  (m) => m[1],
);

describe('changelog.json stays in step with the release', () => {
  it('the overlay names the version this build ships', () => {
    // The whole user-visible defect in one assertion: the badge says X, so the
    // overlay's newest entry must also say X.
    expect(overlay.versions[0]?.version).toBe(pkgVersion);
  });

  it('CHANGELOG.md names the same version at its top', () => {
    expect(mdVersions[0]).toBe(pkgVersion);
  });

  it('every version in the overlay exists in CHANGELOG.md', () => {
    // Catches a typo'd or invented version in the hand-maintained file.
    const md = new Set(mdVersions);
    const orphans = overlay.versions.map((v) => v.version).filter((v) => !md.has(v));
    expect(orphans).toEqual([]);
  });

  it('the overlay is ordered newest-first', () => {
    const cmp = (a: string, b: string) => {
      const pa = a.split('.').map(Number);
      const pb = b.split('.').map(Number);
      for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pb[i] - pa[i];
      return 0;
    };
    const got = overlay.versions.map((v) => v.version);
    expect(got).toEqual([...got].sort(cmp));
  });

  it('no entry is empty or undated — an entry with no changes renders a blank panel', () => {
    const bad = overlay.versions
      .filter((v) => !v.date || !Array.isArray(v.changes) || v.changes.length === 0)
      .map((v) => v.version);
    expect(bad).toEqual([]);
  });

  it('every change has a type and non-empty text', () => {
    const bad: string[] = [];
    for (const v of overlay.versions)
      for (const c of v.changes)
        if (!c.type || !c.text?.trim()) bad.push(`${v.version}: ${JSON.stringify(c)}`);
    expect(bad).toEqual([]);
  });
});
