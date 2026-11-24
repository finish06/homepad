import { existsSync, readFileSync } from 'node:fs';
import { posix, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// #678 (SPEC-test-infra-18.3.0 AC-008). compose.build.yaml builds the API from
// ${HOMEPAD_API_CONTEXT:-./api}. Running `docker compose build` in CI would cost
// two image builds per PR, and the same images are already built on every merge
// (staging-release.yml) and every tag (ghcr-release.yml). So instead of building
// a third time, this pins compose to the SAME context and Dockerfile those builds
// use. If compose drifts from them, this fails; if those builds break, they fail.

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');
const norm = (p: string) => posix.normalize(p).replace(/\/$/, '');

// The `build:` block of one compose service (two-space service indent).
function buildBlock(compose: string, service: string): string {
  const svc = compose.match(new RegExp(`^ {2}${service}:\\n((?: {4}.*\\n|\\s*\\n)+)`, 'm'));
  expect(svc, `no \`${service}:\` service in compose.build.yaml`).not.toBeNull();
  const build = svc![1].match(/^ {4}build:\n((?: {6}.*\n)+)/m);
  expect(build, `\`${service}\` has no build: block`).not.toBeNull();
  return build![1];
}

// Every `context:` value in a workflow step that builds the named image.
function contextsFor(workflow: string, marker: RegExp): string[] {
  return workflow
    .split(/\n\s*- (?:name|uses): /)
    .filter((step) => marker.test(step))
    .flatMap((step) => [...step.matchAll(/^\s+context: (\S+)/gm)].map((m) => norm(m[1])));
}

describe('compose.build.yaml builds what the release workflows build (#678)', () => {
  const compose = read('compose.build.yaml');

  it('api: the default context is ./api, it has a Dockerfile, and no other Dockerfile is named', () => {
    const block = buildBlock(compose, 'api');
    const m = block.match(/context: \$\{HOMEPAD_API_CONTEXT:-([^}]+)\}/);
    expect(m, 'api build context is not ${HOMEPAD_API_CONTEXT:-<default>}').not.toBeNull();
    expect(norm(m![1])).toBe('api');
    expect(block).not.toMatch(/dockerfile:/);
    expect(existsSync(resolve(process.cwd(), m![1], 'Dockerfile'))).toBe(true);
  });

  it('api: staging-release builds homepad-api from that same context and Dockerfile', () => {
    const wf = read('.gitea/workflows/staging-release.yml');
    const step = wf.split(/\n\s*- uses: /).find((s) => /image-name: homepad-api\b/.test(s));
    expect(step, 'no homepad-api build step in staging-release.yml').toBeDefined();
    expect(step).toMatch(/^\s+context: api$/m);
    expect(step).toMatch(/^\s+dockerfile: Dockerfile$/m);
  });

  it('api: ghcr-release builds the public API image from that same context', () => {
    const ctx = contextsFor(read('.github/workflows/ghcr-release.yml'), /docker\/build-push-action/);
    expect(ctx).toContain('api');
  });

  it('web: compose builds the root Dockerfile, the context ghcr-release builds the web image from', () => {
    const block = buildBlock(compose, 'web');
    expect(block).toMatch(/^\s+context: \.$/m);
    expect(block).toMatch(/^\s+dockerfile: Dockerfile$/m);
    expect(contextsFor(read('.github/workflows/ghcr-release.yml'), /docker\/build-push-action/)).toContain('.');
  });
});
