import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// SPEC-admin-server-settings AC-036, AC-038…AC-040 — the docs say each setting
// can be set in Admin Panel → System, that the UI wins over env, and how to use
// HOMEPAD_SETTINGS_FROM_ENV_ONLY; and the web app no longer calls the
// deprecated env-config route (Q3 A).

const root = process.cwd();
const read = (f: string) => readFileSync(resolve(root, f), 'utf8');
const FLAG = 'HOMEPAD_SETTINGS_FROM_ENV_ONLY';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

describe('AC-036 — the web app no longer calls GET /api/admin/env-config', () => {
  it('no shipped source file names the route in a string', () => {
    const files = sourceFiles(resolve(root, 'src'));
    expect(files.length).toBeGreaterThan(50);
    const offenders = files.filter((f) => /['"`]\/api\/admin\/env-config/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});

describe('AC-038 — the docs say Admin Panel → System and how to use the flag', () => {
  it.each(['README.md', 'docs/single-sign-on.md', 'docs/monitoring.md', 'docs/accounts.md', '.env.example'])('%s', (file) => {
    const md = read(file);
    expect(md).toContain('Admin Panel → System');
    expect(md).toContain(FLAG);
  });
});

describe('AC-039 — docs/single-sign-on.md covers the test sign-in and the member group', () => {
  it('names both', () => {
    const md = read('docs/single-sign-on.md');
    expect(md).toMatch(/test sign-in/i);
    expect(md).toContain('OIDC_MEMBER_GROUP');
  });
});

describe('AC-040 / AC-036 — the superseded specs point here, and env-config is deprecated', () => {
  it.each(['specs/SPEC-v26-admin-env-config.md', 'specs/SPEC-status-degraded-threshold.md'])('%s', (f) => {
    expect(read(f)).toContain('SPEC-admin-server-settings.md');
  });
  it('SPEC-v26 says the route stays deprecated until 19.0.0', () => {
    expect(read('specs/SPEC-v26-admin-env-config.md')).toMatch(/deprecated, until 19\.0\.0/);
  });
});
