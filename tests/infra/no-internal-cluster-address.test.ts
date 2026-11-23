// The repo is mirrored to a public GitHub repo, so the internal cluster address
// must not appear in any tracked file. Real addresses live in
// docs/environments.local.md, which is gitignored (*.local.md).
//
// The ALLOWED list below is the to-do list: each entry is a file that still
// carries the address because removing it needs something outside this repo
// (a CI variable). Clear an entry by removing the address, then delete it here.
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

// Built from parts so this file does not match itself.
const NEEDLE = ['10', '17', ''].join('.');

// History or generated files that are never rewritten.
const EXEMPT = new Set([
  'CHANGELOG.md', // release history, kept as written
  'package-lock.json', // only version strings that happen to contain the digits
]);

// Files that still carry the address, each with the reason it stays for now.
const ALLOWED = new Map<string, string>([]);

const root = process.cwd();
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);

function hits(): string[] {
  const out: string[] = [];
  for (const rel of tracked) {
    const base = rel.split('/').pop() ?? rel;
    if (EXEMPT.has(rel) || EXEMPT.has(base)) continue;
    const abs = resolve(root, rel);
    let isFile: boolean;
    try {
      isFile = lstatSync(abs).isFile();
    } catch {
      continue; // deleted in the working tree
    }
    if (!isFile) continue;
    if (readFileSync(abs).includes(NEEDLE)) out.push(rel);
  }
  return out;
}

describe('internal cluster address stays out of tracked files', () => {
  it('git ls-files returns the tree', () => {
    expect(tracked.length).toBeGreaterThan(100);
  });

  it('appears only in exempt or allowlisted files', () => {
    expect(hits().filter((f) => !ALLOWED.has(f))).toEqual([]);
  });

  it('every allowlisted file still needs its entry', () => {
    // A stale entry would let the address creep back into that file unnoticed.
    const found = new Set(hits());
    expect([...ALLOWED.keys()].filter((f) => !found.has(f))).toEqual([]);
  });
});
