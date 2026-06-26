// @vitest-environment node
// This file is pure fs/grep + a real import of vite.config (which pulls in
// @vitejs/plugin-react -> esbuild). esbuild's startup invariant fails under
// jsdom's patched TextEncoder, so run this suite in the node environment.
//
// #157: the prod footer showed "homepad vN (dev)" instead of the build's short
// commit sha. Root cause (Ada): the Docker BUILD stage only COPYs the source
// tree — no .git — so vite.config.ts's `git rev-parse --short HEAD` always threw
// and __GIT_SHA__ fell back to 'dev'. CI knows the sha; the fix threads it into
// the build as the GIT_SHA env var (Dockerfile build-stage ARG -> ENV, fed by
// ci-shared's --build-arg) and has vite.config read process.env.GIT_SHA first.
//
// jsdom can't run a Docker build, but it CAN read the two files and assert the
// wiring is present. Named for the observed symptom (footer shows '(dev)', not
// the build sha), not a cache/env mechanism theory, so it survives a wrong guess.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, it, expect, vi } from 'vitest';

const dockerfile = readFileSync(resolve(process.cwd(), 'Dockerfile'), 'utf8');
const viteConfig = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8');

// The build stage: from the first `FROM ... AS build` up to the runtime
// `FROM nginx`. The GIT_SHA must reach `npm run build`, which runs here.
const lines = dockerfile.split('\n');
const buildStart = lines.findIndex((l) => /^FROM\s+\S+\s+AS\s+build/i.test(l));
const runtimeStart = lines.reduce((acc, l, i) => (/^FROM\s+nginx/i.test(l) ? i : acc), -1);
const buildStage = lines.slice(buildStart, runtimeStart);
const idx = (re: RegExp) => buildStage.findIndex((l) => re.test(l));

describe('#157 — footer shows the build sha, not (dev): GIT_SHA is threaded into the web build', () => {
  it('the Docker build stage declares ARG GIT_SHA', () => {
    expect(buildStart).toBeGreaterThanOrEqual(0);
    expect(idx(/^\s*ARG\s+GIT_SHA\b/)).toBeGreaterThanOrEqual(0);
  });

  it('exposes GIT_SHA as an ENV before `npm run build` so vite can read it', () => {
    const env = idx(/^\s*ENV\s+GIT_SHA\b/);
    const build = idx(/^\s*RUN\s+npm\s+run\s+build\b/);
    expect(env).toBeGreaterThanOrEqual(0);
    expect(build).toBeGreaterThanOrEqual(0);
    expect(env).toBeLessThan(build);
  });

  it('vite.config.ts reads process.env.GIT_SHA (the CI-provided sha) as the source', () => {
    expect(viteConfig).toMatch(/process\.env\.GIT_SHA/);
  });
});

// ci-shared passes the FULL 40-char `${{ github.sha }}` as --build-arg GIT_SHA,
// but the footer badge should read like `git rev-parse --short` (7 chars), not a
// 40-char wall. Assert the baked __GIT_SHA__ is condensed to its first 7 chars.
describe('#157 — the baked GIT_SHA is condensed to a 7-char short sha', () => {
  const realEnv = process.env.GIT_SHA;
  afterEach(() => {
    if (realEnv === undefined) delete process.env.GIT_SHA;
    else process.env.GIT_SHA = realEnv;
    vi.resetModules();
  });

  it('truncates a full 40-char CI sha to its first 7 chars', async () => {
    const full = 'abcdef0123456789abcdef0123456789abcdef01';
    process.env.GIT_SHA = full;
    vi.resetModules();
    const config = (await import('../vite.config')).default as {
      define: Record<string, string>;
    };
    expect(config.define.__GIT_SHA__).toBe(JSON.stringify(full.slice(0, 7)));
    expect(config.define.__GIT_SHA__).toBe(JSON.stringify('abcdef0'));
  });
});
