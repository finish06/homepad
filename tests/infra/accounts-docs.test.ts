import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// SPEC-household-manage-adults §8, §10 and UX §9 — the docs home for managing
// adults is a new docs/accounts.md with an "Adults" section, linked from the
// kid accounts doc, and the release note is in the CHANGELOG.

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

function section(md: string, heading: string): string {
  const parts = md.split(new RegExp(`^## ${heading}$`, 'm'));
  expect(parts.length, `no "## ${heading}" section`).toBe(2);
  return parts[1].split(/^## /m)[0];
}

describe('docs/accounts.md — Adults (UX §9)', () => {
  it('exists, with an Adults section', () => {
    expect(existsSync(resolve(process.cwd(), 'docs/accounts.md'))).toBe(true);
    expect(read('docs/accounts.md')).toMatch(/^# Accounts$/m);
  });

  it('says where the actions are and who can use them', () => {
    const s = section(read('docs/accounts.md'), 'Adults');
    expect(s).toContain('Administration → Accounts');
    expect(s).toContain('**Manage**');
    expect(s).toContain('**Make admin**');
    expect(s).toContain('**Make member**');
    expect(s).toContain('**Remove');
  });

  it('states the one-admin rule and the own-account rule', () => {
    const s = section(read('docs/accounts.md'), 'Adults');
    expect(s).toMatch(/at least one admin/);
    expect(s).toMatch(/your own account/);
  });

  it('says what a removal deletes and what it leaves', () => {
    const s = section(read('docs/accounts.md'), 'Adults');
    expect(s).toMatch(/favorites/);
    expect(s).toMatch(/signed out/);
    expect(s).toMatch(/invites/);
    expect(s).toMatch(/kids/i);
  });

  it('carries the single sign-on caveat', () => {
    const s = section(read('docs/accounts.md'), 'Adults');
    expect(s).toMatch(/single sign-on/);
    expect(s).toMatch(/identity provider/);
  });

  it('is linked from the kid accounts doc', () => {
    expect(read('docs/kid-accounts.md')).toMatch(/\]\((\.\/)?accounts\.md(#[a-z-]+)?\)/);
  });
});

describe('CHANGELOG — the 18.0.0 line for managing adults (§10)', () => {
  it('is under [18.0.0], in the spec\'s words', () => {
    const md = read('CHANGELOG.md');
    const at = md.search(/^## \[18\.0\.0\]/m);
    expect(at, 'no [18.0.0] section').toBeGreaterThanOrEqual(0);
    const body = md.slice(at + 3).split(/^## \[/m)[0];
    expect(body).toContain(
      'Admins can now remove an adult, or make someone an admin or a member, in Administration → Accounts. Homepad always keeps at least one admin.',
    );
  });
});
