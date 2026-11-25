import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

// SPEC-dashboard-empty-loading AC-014, AC-015, AC-017 (#724) — the retired v7
// and v14 selectors stay deleted. A rule for one of them in src/index.css, or a
// class use of one in src/** or index.html, fails here. The live rules that
// share a prefix with them (the cap3 Recently opened row, .cat-count, the
// spinner) are checked to still be there, so this can't pass by deleting them.

const root = process.cwd();
const css = readFileSync(resolve(root, 'src/index.css'), 'utf8');

// Class names whose rules (and every compound/pseudo/.dark variant) are gone.
const RETIRED = [
  'tile',
  'tile-icon',
  'cat-head',
  'dashboard-empty',
  'dashboard-empty-art',
  'dashboard-empty-title',
  'dashboard-empty-sub',
  'dashboard-empty-cta',
  'recently-opened-rail',
  'recently-opened-chips',
  'recently-opened-chip',
  'tile-field',
  'category-panel',
  'panel-tiles',
];

// `.name` as a whole class token in a selector: not followed by more of a
// class name (so `.tile` does not match `.tile-edit-input`).
const selectorRe = (name: string) => new RegExp(`\\.${name}(?![\\w-])`);

// Selectors only — comments may still name a retired rule in prose.
function selectors(text: string): string[] {
  const noComments = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: string[] = [];
  for (const m of noComments.matchAll(/([^{}]+)\{/g)) out.push(m[1].trim());
  return out;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (/\.(tsx?|html)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

// A class use: the name as a whole token inside a className / class string.
function usesClass(text: string, name: string): boolean {
  const re = new RegExp(`class(?:Name)?=[{"'\`][^"'\`]*?(?<![\\w-])${name}(?![\\w-])`);
  return re.test(text);
}

describe('retired CSS stays deleted (AC-015, AC-017)', () => {
  const sels = selectors(css);

  it.each(RETIRED)('no rule in src/index.css targets .%s', (name) => {
    const hits = sels.filter((s) => selectorRe(name).test(s));
    expect(hits).toEqual([]);
  });

  it.each(RETIRED)('nothing in src/** or index.html uses the class %s', (name) => {
    const files = [...sourceFiles(resolve(root, 'src')), resolve(root, 'index.html')];
    const users = files.filter((f) => usesClass(readFileSync(f, 'utf8'), name));
    expect(users).toEqual([]);
  });

  it('the detector would catch one (it is not vacuous)', () => {
    expect(selectors('.dark .tile:hover { color: red }').some((s) => selectorRe('tile').test(s))).toBe(true);
    expect(selectors('.tile-edit-input { color: red }').some((s) => selectorRe('tile').test(s))).toBe(false);
    expect(usesClass('<div className="tile p-2">', 'tile')).toBe(true);
    expect(usesClass('<div className="tile-edit-input">', 'tile')).toBe(false);
  });
});

describe('the live rules that share those prefixes stay (AC-015)', () => {
  const sels = selectors(css);
  it.each([
    'recently-opened',
    'recently-opened-label',
    'recently-opened-list',
    'recently-opened-item',
    'recently-opened-icon',
    'recently-opened-name',
    'recently-opened-clear',
    'cat-count',
    'app-spinner',
    'user-avatar',
  ])('.%s keeps its rule', (name) => {
    expect(sels.some((s) => selectorRe(name).test(s))).toBe(true);
  });
});

describe('empty states share .kid-empty (AC-014)', () => {
  it('the .kid-empty rule is there for kid-, admin- and member-empty', () => {
    expect(selectors(css).some((s) => selectorRe('kid-empty').test(s))).toBe(true);
    const app = readFileSync(resolve(root, 'src/app/App.tsx'), 'utf8');
    for (const id of ['kid-empty', 'admin-empty', 'member-empty']) {
      expect(app).toMatch(new RegExp(`data-testid="${id}"[^>]*className="kid-empty"`));
    }
  });
});
