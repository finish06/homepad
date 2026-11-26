// Guard: the e2e `mobile` project is an iPhone 13 rasterized at 1x.
//
// On the GPU-less CI runner WebKit paints in software, and the app's
// backdrop-filter glass at the iPhone 13's 3x scale made each frame take
// seconds. Playwright's "stable" check waits on requestAnimationFrame, so
// kid-accounts TC-001 timed out at a different step on every retry. 1x keeps
// frames at ~16 ms there. See the comment on the project in playwright.config.ts.
//
// The test also pins the rest of the device so the fix cannot drift into
// "not really a phone any more": same CSS viewport, touch, mobile and WebKit.
//
// #739: 1x was not enough under full-suite load. tests/e2e/fixtures.ts also
// turns backdrop-filter off in WebKit, and only specs that take `test` from
// that file get it, so the blocks below fail a spec that gets a page or a
// context any other way. tests/e2e/fixtures.spec.ts checks, on the built app,
// that the style really applies. The worker count (playwright.config.ts) is
// the other half of #739.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, it, expect } from 'vitest';
import { devices } from '@playwright/test';
import config, { cgroupCpus, workersFor } from '../../playwright.config';

const mobile = config.projects?.find((p) => p.name === 'mobile');
const iPhone13 = devices['iPhone 13'];

describe('e2e mobile project (kid-accounts TC-001 CI flake)', () => {
  it('exists', () => {
    expect(mobile, 'playwright.config.ts must define a "mobile" project').toBeTruthy();
  });

  it('rasterizes at 1x', () => {
    expect(mobile?.use?.deviceScaleFactor).toBe(1);
  });

  it('keeps the iPhone 13 layout, touch, UA and WebKit', () => {
    expect(mobile?.use?.viewport).toEqual(iPhone13.viewport);
    expect(mobile?.use?.isMobile).toBe(true);
    expect(mobile?.use?.hasTouch).toBe(true);
    expect(mobile?.use?.userAgent).toBe(iPhone13.userAgent);
    expect(mobile?.use?.defaultBrowserType).toBe('webkit');
  });
});

// fixtureProblems lists the ways a tests/e2e file could get a page or a
// context without the shared fixture: Playwright's runtime `test` by any
// import or re-export (static, renamed, multi-line, namespace, default,
// dynamic, require), and a context or page made from the browser directly.
// It parses the file rather than matching text.
function fixtureProblems(source: string, isSpec: boolean): string[] {
  const sf = ts.createSourceFile('spec.ts', source, ts.ScriptTarget.Latest, true);
  const problems: string[] = [];
  let testFromFixtures = false;
  const isPlaywright = (m: string) => /^@?playwright(\/|-core|$)/.test(m);
  for (const stmt of sf.statements) {
    if (ts.isExportDeclaration(stmt) && stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)) {
      const from = stmt.moduleSpecifier.text;
      if (!isPlaywright(from) || stmt.isTypeOnly) continue;
      const clause = stmt.exportClause;
      if (!clause || !ts.isNamedExports(clause)) problems.push(`re-export * from ${from}`);
      else if (clause.elements.some((e) => !e.isTypeOnly && (e.propertyName ?? e.name).text === 'test')) {
        problems.push(`re-export of test from ${from}`);
      }
      continue;
    }
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    const from = stmt.moduleSpecifier.text;
    const clause = stmt.importClause;
    if (!clause || clause.isTypeOnly) continue;
    const named = clause.namedBindings && ts.isNamedImports(clause.namedBindings) ? clause.namedBindings.elements : [];
    if (from === './fixtures') {
      if (named.some((s) => (s.propertyName ?? s.name).text === 'test' && !s.isTypeOnly)) testFromFixtures = true;
      continue;
    }
    if (!isPlaywright(from)) continue;
    if (clause.name) problems.push(`default import from ${from}`);
    if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) problems.push(`namespace import from ${from}`);
    for (const s of named) {
      if (!s.isTypeOnly && (s.propertyName ?? s.name).text === 'test') problems.push(`runtime test from ${from}`);
    }
  }
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isIdentifier(callee) && callee.text === 'require') problems.push('require()');
      if (callee.kind === ts.SyntaxKind.ImportKeyword) problems.push('dynamic import()');
      if (ts.isPropertyAccessExpression(callee)) {
        const name = callee.name.text;
        // newPage() is fine on a context (it shares the context's scripts) but
        // not on the browser, which makes a fresh context for it.
        const onBrowser = name === 'newPage' && /(^|\.)browser$/i.test(callee.expression.getText(sf));
        if (onBrowser || ['newContext', 'launchPersistentContext', 'launch', 'connect', 'connectOverCDP'].includes(name)) {
          problems.push(`${callee.getText(sf)}()`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (isSpec && !testFromFixtures) problems.push('no test import from ./fixtures');
  return problems;
}

describe('the guard below catches each way around the fixture', () => {
  const ok = "import { test, expect } from './fixtures';\n";
  it.each([
    ['a renamed import', `${ok}import { test as pwTest } from "@playwright/test";`, 'runtime test from @playwright/test'],
    ['a multi-line import', `${ok}import {\n  expect,\n  test,\n} from '@playwright/test';`, 'runtime test from @playwright/test'],
    ['a namespace import', `${ok}import * as pw from '@playwright/test';`, 'namespace import from @playwright/test'],
    ['a default import', `${ok}import pw from '@playwright/test';`, 'default import from @playwright/test'],
    ['browser.newContext()', `${ok}async function f(browser) { await browser.newContext(); }`, 'browser.newContext()'],
    ['webkit.launch()', `${ok}async function f() { await webkit.launch(); }`, 'webkit.launch()'],
    ['browser.newPage()', `${ok}async function f(browser) { await browser.newPage(); }`, 'browser.newPage()'],
    ['a dynamic import', `${ok}async function f() { const { test: t } = await import('@playwright/test'); }`, 'dynamic import()'],
    ['a re-export of test', "export { test } from '@playwright/test';", 're-export of test from @playwright/test'],
    ['a re-export of everything', "export * from '@playwright/test';", 're-export * from @playwright/test'],
    ['no fixture import', "import { expect } from './fixtures';", 'no test import from ./fixtures'],
  ])('%s', (_name, src, problem) => {
    expect(fixtureProblems(src, true)).toContain(problem);
  });

  it('allows types and devices from @playwright/test, and only `test` from ./fixtures', () => {
    const src = [
      "import { devices, type Page } from '@playwright/test';",
      "import type { Browser } from '@playwright/test';",
      "import { newContext, test } from './fixtures';",
      'async function f(browser: Browser) { const c = await newContext(browser); await c.newPage(); }',
      "export type { Page } from '@playwright/test';",
    ].join('\n');
    expect(fixtureProblems(src, true)).toEqual([]);
  });
});

describe('e2e specs use the shared fixture (#739)', () => {
  const dir = join(__dirname, '..', 'e2e');
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && f !== 'fixtures.ts');
  const specs = files.filter((f) => f.endsWith('.spec.ts'));

  it('finds the specs', () => {
    expect(specs.length).toBeGreaterThan(5);
  });

  it.each(files)('%s gets every page and context through ./fixtures', (file) => {
    const src = readFileSync(join(dir, file), 'utf8');
    expect(fixtureProblems(src, file.endsWith('.spec.ts'))).toEqual([]);
  });
});

// #739: Playwright's default worker count reads os.cpus(), which in a
// container is the host's cores, not the CPU limit.
describe('e2e worker count follows the CPU limit (#739)', () => {
  it('reads a cgroup v2 cpu.max line', () => {
    expect(cgroupCpus('200000 100000\n')).toBe(2);
    expect(cgroupCpus('150000 100000')).toBe(1.5);
    expect(cgroupCpus('max 100000')).toBeNull();
    expect(cgroupCpus('')).toBeNull();
    expect(cgroupCpus(null)).toBeNull();
    expect(cgroupCpus('garbage')).toBeNull();
  });

  it('halves the smaller of the CPU limit and availableParallelism(), at least 1', () => {
    // The 8-core host, 2-CPU job from #739, where Node 20 still reports 8.
    expect(workersFor(8, '200000 100000')).toBe(1);
    expect(workersFor(2, '200000 100000')).toBe(1);
    expect(workersFor(8, '400000 100000')).toBe(2);
    expect(workersFor(8, 'max 100000')).toBe(4);
    expect(workersFor(8, null)).toBe(4);
    expect(workersFor(1, null)).toBe(1);
    expect(workersFor(16, '50000 100000')).toBe(1);
  });

  // The web image's Docker build typechecks playwright.config.ts, and
  // .dockerignore leaves tests/ out of it. An import from tests/ broke that
  // build on this PR's second commit.
  it('playwright.config.ts imports nothing from tests/', () => {
    const src = readFileSync(join(__dirname, '..', '..', 'playwright.config.ts'), 'utf8');
    const sf = ts.createSourceFile('playwright.config.ts', src, ts.ScriptTarget.Latest, true);
    const from = sf.statements
      .filter(ts.isImportDeclaration)
      .map((d) => (d.moduleSpecifier as ts.StringLiteral).text);
    expect(from.filter((m) => m.startsWith('.'))).toEqual([]);
  });
});
