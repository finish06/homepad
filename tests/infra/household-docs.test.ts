import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// SPEC-household-basics AC-001 / AC-007 (plan TASK-211) — a source-contract
// suite over the install files and docs. Sign-up is closed by default, the
// install docs no longer tell anyone to close it by hand afterwards, and the
// account cap is there to set.

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('AC-001 — invite_only is the default everywhere the web repo sets it', () => {
  it.each(['compose.yaml', 'compose.build.yaml'])('%s passes invite_only when .env says nothing', (file) => {
    const src = read(file);
    expect(src).toContain('HOMEPAD_REGISTRATION: ${HOMEPAD_REGISTRATION:-invite_only}');
    expect(src).not.toContain('${HOMEPAD_REGISTRATION:-open}');
  });

  it('.env.example sets invite_only', () => {
    const env = read('.env.example');
    expect(env).toMatch(/^HOMEPAD_REGISTRATION=invite_only$/m);
    expect(env).not.toMatch(/^HOMEPAD_REGISTRATION=open$/m);
  });
});

describe('AC-028 — HOMEPAD_MAX_ACCOUNTS can be set from .env', () => {
  it.each(['compose.yaml', 'compose.build.yaml'])('%s passes it to the API, empty by default', (file) => {
    expect(read(file)).toContain('HOMEPAD_MAX_ACCOUNTS: ${HOMEPAD_MAX_ACCOUNTS:-}');
  });

  it('.env.example documents it, commented out (unset means no limit)', () => {
    const env = read('.env.example');
    expect(env).toMatch(/^# HOMEPAD_MAX_ACCOUNTS=\d+$/m);
    expect(env).not.toMatch(/^HOMEPAD_MAX_ACCOUNTS=/m);
  });
});

// The step this spec removes, in every wording the docs used for it.
// (Telling an install that is still `open` how to close it is fine, and the
// README and kid docs do; the step was "register, THEN switch".)
const MANUAL_SWITCH = [
  /then set `?HOMEPAD_REGISTRATION=invite_only/i,
  /switch to invite_only/i,
  /\*\*Set `HOMEPAD_REGISTRATION=invite_only`\*\*/,
  /once your own admin account exists/i,
];

describe('AC-007 — no "switch to invite_only afterwards" step', () => {
  it.each(['README.md', 'compose.yaml', 'compose.build.yaml', '.env.example', 'docs/kid-accounts.md', 'docs/development.md'])(
    '%s',
    (file) => {
      const src = read(file);
      for (const re of MANUAL_SWITCH) expect(src, `${file} still matches ${re}`).not.toMatch(re);
    },
  );

  it('README has a Registration section (the Accounts warning links to #registration)', () => {
    const readme = read('README.md');
    expect(readme).toMatch(/^## Registration$/m);
    const section = readme.split(/^## Registration$/m)[1].split(/^## /m)[0];
    expect(section).toContain('invite_only');
    expect(section).toContain('HOMEPAD_REGISTRATION=open');
    expect(section).toMatch(/Add an adult/);
    expect(section).toContain('HOMEPAD_MAX_ACCOUNTS');
  });

  it('the CHANGELOG says how to check the mode, and calls out installs with no setting', () => {
    const md = read('CHANGELOG.md');
    expect(md).toMatch(/^## \[Unreleased\]/m);
    const unreleased = md.split(/^## \[Unreleased\].*$/m)[1].split(/^## \[/m)[0];
    expect(unreleased).toContain('Admin Panel → System → Registration mode');
    expect(unreleased).toMatch(/no `HOMEPAD_REGISTRATION`/);
    // The release heading stays below it, so the version contract is untouched.
    expect(md.indexOf('## [Unreleased]')).toBeLessThan(md.search(/^## \[\d+\.\d+\.\d+\]/m));
  });
});
