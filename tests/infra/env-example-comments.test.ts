// SPEC-signin-hardening AC-014 — `.env.example` lists OIDC_MEMBER_GROUP and
// HOMEPAD_TRUSTED_PROXIES with one-line comments (#609). Source contract: it
// reads the file off disk.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const lines = readFileSync(resolve(process.cwd(), '.env.example'), 'utf8').split('\n');

// The comment lines directly above `NAME=` or `# NAME=`, stopping at a blank
// line or a `# --- Section ---` heading.
function commentAbove(name: string): string[] {
  const at = lines.findIndex((l) => new RegExp(`^(# )?${name}=`).test(l));
  expect(at, `${name} is in .env.example`).toBeGreaterThan(0);
  const out: string[] = [];
  for (let i = at - 1; i >= 0; i--) {
    const l = lines[i];
    if (!l.startsWith('#') || l.startsWith('# ---')) break;
    out.unshift(l);
  }
  return out;
}

describe('AC-014 — one-line comments in .env.example', () => {
  it.each(['OIDC_MEMBER_GROUP', 'HOMEPAD_TRUSTED_PROXIES'])('%s', (name) => {
    expect(commentAbove(name)).toHaveLength(1);
  });
});

// #533 — homepad-api has never read SESSION_SECRET: since 17.0.0 a sign-in
// is a Postgres row keyed by a hash of its token, with no signing secret.
// Listing it told self-hosters to set, and fear rotating, a value that does
// nothing.
describe('SESSION_SECRET is not offered as a setting', () => {
  it.each(['.env.example', 'compose.yaml', 'compose.build.yaml', 'README.md'])('%s', (file) => {
    expect(readFileSync(resolve(process.cwd(), file), 'utf8')).not.toMatch(/SESSION_SECRET/);
  });
});
