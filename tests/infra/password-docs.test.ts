import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// SPEC-password-reset-link §8, §10 and the 18.0.0 plan §5 item 4 — the docs
// tell a household how to recover a forgotten password, including the lone
// admin's CLI line, and the changelog carries the release copy.

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');
const CLI = 'docker compose exec api /homepad-api reset-link you@example.com';

describe('docs/accounts.md — Forgotten passwords', () => {
  const doc = read('docs/accounts.md');
  const section = doc.slice(doc.indexOf('## Forgotten passwords')).replace(/\s+/g, ' ');

  it('has the section', () => {
    expect(doc).toMatch(/^## Forgotten passwords$/m);
  });

  it('covers the reset link, Change password and the lone admin', () => {
    expect(section).toContain('Make a reset link');
    expect(section).toContain('24 hours');
    expect(section).toContain('Change password');
    expect(section).toContain(CLI);
  });
});

describe('CHANGELOG — the 18.0.0 passwords line (plan §5 item 4)', () => {
  it('is under Unreleased — 18.0.0', () => {
    const md = read('CHANGELOG.md');
    const start = md.indexOf('## [Unreleased — 18.0.0]');
    expect(start).toBeGreaterThan(-1);
    const next = md.indexOf('\n## [', start + 1);
    const block = md.slice(start, next === -1 ? undefined : next).replace(/\s+/g, ' ');
    expect(block).toContain(
      'An admin can make a one-time reset link for an adult. It works for 24 hours. ' +
        'You can change your own password in My settings. If you are the only admin and forget your password, run ' +
        '`' + CLI + '` on the server.',
    );
  });
});
