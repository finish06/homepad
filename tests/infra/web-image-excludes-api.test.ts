// SPEC-monorepo-api: the Go API was imported under api/. The web Dockerfile
// does `COPY . .` in its build stage, so without an ignore rule every API
// change would ship into the web build context and bust its cache. The API
// builds its own image with api/ as the context, which reads api/.dockerignore,
// not this file.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const rules = readFileSync(resolve(process.cwd(), '.dockerignore'), 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'));

describe('web image build context', () => {
  it('excludes the api/ tree', () => {
    expect(rules.some((r) => /^\/?api\/?(\*\*)?$/.test(r))).toBe(true);
  });

  it('does not re-include anything under api/', () => {
    expect(rules.filter((r) => /^!\/?api(\/|$)/.test(r))).toEqual([]);
  });
});
