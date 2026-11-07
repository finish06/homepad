import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// SPEC-backup-import AC-027 — the compose install must accept a 16 MB restore.
// nginx's default client_max_body_size is 1 MB, which 413s a backup with a few
// uploaded icons before homepad-api ever sees it. Both compose nginx configs set
// it inside `location /api/`, where the restore route lives. (The production
// ingress is configured in Code/homelab and checked at release.)

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

// The body of the first `location /api/ { … }` block (no nested braces inside).
function apiLocation(conf: string): string {
  const m = conf.match(/location \/api\/ \{([^}]*)\}/);
  expect(m, 'no `location /api/ { … }` block found').not.toBeNull();
  return m![1];
}

describe('compose nginx accepts a 16 MB restore (AC-027)', () => {
  it.each([
    ['compose.yaml nginx-config', 'compose.yaml'],
    ['deploy/compose/nginx.conf', 'deploy/compose/nginx.conf'],
  ])('%s sets client_max_body_size 16m on /api/', (_label, file) => {
    expect(apiLocation(read(file))).toMatch(/^\s*client_max_body_size 16m;\s*$/m);
  });

  it('compose.yaml sets it inside the nginx-config block, not somewhere else', () => {
    const src = read('compose.yaml');
    const start = src.indexOf('nginx-config:');
    expect(start).toBeGreaterThan(-1);
    expect(apiLocation(src.slice(start))).toContain('client_max_body_size 16m;');
  });
});
