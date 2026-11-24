import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// #254 (SPEC-test-infra-18.3.0 AC-009). On a QA pod the browser gate attaches to
// a shared Chromium sidecar. The sidecar's DEFAULT context, browser.contexts()[0],
// keeps its HTTP cache across QA tasks, so a page loaded there can be the
// previous build (#254: a v12.9.0 index.html served to v13.0.0's gate). A context
// made with browser.newContext() has its own empty cache. Checked against a real
// Chromium over CDP on 2026-11-23: after the server switched build A -> B, the
// default context and a reused context still showed A; a new context showed B.
//
// Playwright's `page` fixture gives every test a new context, so the gate is
// safe as long as nothing reaches for the shared one. This keeps it that way.

const GATE = join(__dirname, '..', 'browser-gate');
const QA_KIT = join(__dirname, '..', '..', 'qa-kit');
const gateFiles = readdirSync(GATE).filter((f) => f.endsWith('.ts'));

describe('the gate never loads pages in the sidecar’s shared context (#254)', () => {
  it('finds the gate files (guards against a vacuous pass)', () => {
    expect(gateFiles.length).toBeGreaterThanOrEqual(20);
  });

  it.each(gateFiles)('%s does not use browser.contexts()', (file) => {
    expect(readFileSync(join(GATE, file), 'utf8')).not.toMatch(/\.contexts\(\)/);
  });

  // qa-kit/cdp.js reuses contexts()[0] unless asked for `fresh`. cdp-smoke only
  // reads the browser version, so reuse is fine there. Anything that opens a
  // page must ask for a fresh context.
  it.each(['preflight.js', 'demo-gridscan.js'])('qa-kit/%s connects with fresh: true', (file) => {
    const src = readFileSync(join(QA_KIT, file), 'utf8');
    const calls = [...src.matchAll(/\bconnect\(\{([^}]*)\}/g)].map((m) => m[1]);
    expect(calls.length).toBeGreaterThan(0);
    for (const args of calls) expect(args).toMatch(/fresh:\s*true/);
  });

  it('qa-kit/cdp-smoke.js opens no page in the shared context', () => {
    expect(readFileSync(join(QA_KIT, 'cdp-smoke.js'), 'utf8')).not.toMatch(/\.newPage\(|\.goto\(/);
  });
});
