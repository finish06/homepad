// Build-cache regression guard (#73). The #18->#72 chain shipped a correct
// nginx.conf + a `RUN grep 'types { }'` guard, yet staging KEPT serving
// manifest.webmanifest as application/octet-stream: the release build resolved
// the entire runtime (`FROM nginx`) stage from a stale BuildKit/daemon cache,
// so the COPY of the real nginx.conf — and the guard that depends on it — never
// re-ran, and the pre-fix conf reshipped under each new tag (manifest
// Last-Modified frozen at 20:04:40 UTC across releases).
//
// The fix is a per-commit cache-bust: declare `ARG GIT_SHA` in the runtime
// stage and USE it (a Docker ARG only invalidates cache from its first usage,
// not its declaration) BEFORE both runtime COPYs. ci-shared passes
// `--build-arg GIT_SHA=<sha>`, which changes every commit, forcing the dist
// COPY (so Last-Modified advances) and the nginx.conf COPY + guard to rebuild.
//
// Named for the observed symptom (stale runtime layer reshipped), not a cache
// mechanism theory, so it survives a wrong root-cause guess.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const dockerfile = readFileSync(resolve(process.cwd(), 'Dockerfile'), 'utf8');

// Lines of the runtime stage only: from the last `FROM ... nginx` to EOF.
const lines = dockerfile.split('\n');
const runtimeStart = lines.reduce(
  (acc, l, i) => (/^FROM\s+nginx/i.test(l) ? i : acc),
  -1,
);
const runtime = lines.slice(runtimeStart);
const indexOfMatch = (re: RegExp) => runtime.findIndex((l) => re.test(l));

describe('Dockerfile runtime stage is cache-busted so a stale nginx.conf cannot reship (#73)', () => {
  it('has a runtime (FROM nginx) stage', () => {
    expect(runtimeStart).toBeGreaterThanOrEqual(0);
  });

  it('declares ARG GIT_SHA in the runtime stage', () => {
    expect(indexOfMatch(/^\s*ARG\s+GIT_SHA\b/)).toBeGreaterThanOrEqual(0);
  });

  it('USES GIT_SHA before the nginx.conf COPY (declaration alone does not bust cache)', () => {
    const usage = indexOfMatch(/\$\{?GIT_SHA\}?/);
    const copyConf = indexOfMatch(/^\s*COPY\s+nginx\.conf\b/);
    expect(usage).toBeGreaterThanOrEqual(0);
    expect(copyConf).toBeGreaterThanOrEqual(0);
    expect(usage).toBeLessThan(copyConf);
  });

  it('USES GIT_SHA before the dist COPY so manifest Last-Modified advances each build', () => {
    const usage = indexOfMatch(/\$\{?GIT_SHA\}?/);
    const copyDist = indexOfMatch(/^\s*COPY\s+--from=build\b/);
    expect(usage).toBeGreaterThanOrEqual(0);
    expect(copyDist).toBeGreaterThanOrEqual(0);
    expect(usage).toBeLessThan(copyDist);
  });
});
