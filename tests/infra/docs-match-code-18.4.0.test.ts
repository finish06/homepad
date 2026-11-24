// SPEC-decisions-18.4.0 §5 (AC-010…AC-014) — the docs say what the code does.
// Source contract: reads the files off disk.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (f: string) => readFileSync(resolve(process.cwd(), f), 'utf8');

// The lines of compose `api.environment` comments directly above `NAME:`.
function commentAbove(text: string, name: string): string {
  const lines = text.split('\n');
  const at = lines.findIndex((l) => new RegExp(`^\\s+${name}:`).test(l));
  expect(at, `${name} is in the file`).toBeGreaterThan(0);
  const out: string[] = [];
  for (let i = at - 1; i >= 0 && lines[i].trim().startsWith('#'); i--) out.unshift(lines[i]);
  return out.join('\n');
}

describe('AC-010 — Reset falls back to env or the default', () => {
  // The CHANGELOG and the in-app changelog are history and keep their words.
  it.each([
    'README.md',
    '.env.example',
    'docs/accounts.md',
    'docs/monitoring.md',
    'specs/ux/admin-server-settings-ux.md',
    'src/library/SystemSettings.tsx',
  ])('%s', (f) => {
    const text = read(f).replace(/\s+/g, ' ');
    // "goes back to `.env`" / "goes back to it" leave out the built-in default.
    const bad = /Reset(\*\*|<\/strong>)?( in the panel)?(\{' '\})? goes back to (`\.env`|\.env|it\b)/.exec(text);
    expect(bad?.[0]).toBeUndefined();
  });
});

describe.each(['compose.yaml', 'compose.build.yaml'])('%s', (f) => {
  it('AC-011 — COOKIE_SECURE says false is for plain http and the API defaults to true', () => {
    const c = commentAbove(read(f), 'COOKIE_SECURE');
    expect(c).toMatch(/http/i);
    expect(c).toMatch(/defaults? to true/i);
  });

  it('AC-012 — HOMEPAD_SECRET_KEY mentions the single sign-on client secret', () => {
    expect(commentAbove(read(f), 'HOMEPAD_SECRET_KEY')).toMatch(/single sign-on client secret/i);
  });

  it('AC-013 — the Gatus image uses GATUS_VERSION', () => {
    expect(read(f)).toMatch(/image: ghcr\.io\/twin\/gatus:\$\{GATUS_VERSION:-v[\d.]+\}/);
    expect(read(f)).not.toMatch(/GATUS_IMAGE/);
  });
});

describe('.env.example', () => {
  it('AC-011 — COOKIE_SECURE says the API defaults to true', () => {
    expect(read('.env.example')).toMatch(/COOKIE_SECURE[^\n]*\n(#[^\n]*\n)*?#[^\n]*defaults? to true/i);
  });

  it('AC-013 — offers GATUS_VERSION, the tag both compose files pin', () => {
    const env = read('.env.example');
    expect(env).not.toMatch(/GATUS_IMAGE/);
    const pinned = read('compose.yaml').match(/GATUS_VERSION:-(v[\d.]+)/)?.[1];
    expect(pinned).toBeTruthy();
    expect(env).toContain(`GATUS_VERSION=${pinned}`);
    expect(read('compose.build.yaml')).toContain(`GATUS_VERSION:-${pinned}`);
  });
});

describe('AC-014 — the settings reload is 25 seconds', () => {
  it('matches SettingsReloadEvery', () => {
    expect(read('api/internal/api/live_config.go')).toMatch(/SettingsReloadEvery = 25 \* time\.Second/);
    const spec = read('specs/SPEC-admin-server-settings.md');
    expect(spec).not.toMatch(/reloads `server_settings` every 30 seconds/);
    expect(spec).toMatch(/reloads `server_settings` every 25 seconds/);
  });
});
