import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyHomepageImport,
  applyRestore,
  downloadBackup,
  exportUrl,
  previewHomepageImport,
  previewRestore,
  TransferError,
} from './transferApi';
import { importPlan, mergePlan } from '../../test/transferPlans';

// SPEC-backup-import §8 (TASK-301) — the transfer client. The contract is the
// one fixed in docs/plans/backup-import-plan.md: five admin-only routes, a JSON
// Plan on 200, and a JSON error body {code, message, …} on 4xx so the UI owns the
// words. A 409 carries the fresh plan.

type Call = [RequestInfo | URL, RequestInit | undefined];

function mockFetch(body: unknown, status: number, headers: Record<string, string> = {}) {
  const fn = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(body === null ? null : typeof body === 'string' ? body : JSON.stringify(body), { status, headers }),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

async function caught(p: Promise<unknown>): Promise<TransferError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(TransferError);
    return e as TransferError;
  }
  throw new Error('expected a TransferError');
}

describe('exportUrl (AC-001, AC-003)', () => {
  it('builds the export route with the people flag', () => {
    expect(exportUrl(true)).toBe('/api/admin/export?people=true');
    expect(exportUrl(false)).toBe('/api/admin/export?people=false');
  });
});

describe('downloadBackup (AC-001)', () => {
  it('fetches the export with credentials and takes the filename from Content-Disposition', async () => {
    const fn = mockFetch('{"format":"homepad-backup"}', 200, {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="homepad-backup-2026-11-07.json"',
    });
    const got = await downloadBackup(false);
    const [url, init] = fn.mock.calls[0] as Call;
    expect(url).toBe('/api/admin/export?people=false');
    expect(init?.credentials).toBe('include');
    expect(got.filename).toBe('homepad-backup-2026-11-07.json');
    expect(got.blob.size).toBeGreaterThan(0);
  });

  it('falls back to homepad-backup-YYYY-MM-DD.json when the header is missing', async () => {
    mockFetch('{}', 200);
    const got = await downloadBackup(true);
    expect(got.filename).toMatch(/^homepad-backup-\d{4}-\d{2}-\d{2}\.json$/);
  });

  it('rejects on a non-200 and on a network failure', async () => {
    mockFetch('internal error', 500);
    expect((await caught(downloadBackup(true))).status).toBe(500);
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    expect((await caught(downloadBackup(true))).code).toBe('network');
  });
});

describe('restore preview and apply (AC-007, AC-008)', () => {
  it('previewRestore POSTs the raw file to the preview route with the mode', async () => {
    const fn = mockFetch(mergePlan(), 200);
    const file = new Blob(['{"format":"homepad-backup"}'], { type: 'application/json' });
    const plan = await previewRestore(file, 'replace');
    const [url, init] = fn.mock.calls[0] as Call;
    expect(url).toBe('/api/admin/restore/preview?mode=replace');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(file);
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(plan.planHash).toBe('hash-merge-1');
  });

  it('applyRestore sends the same file with the plan hash', async () => {
    const fn = mockFetch({ ...mergePlan(), applied: true }, 200);
    const file = new Blob(['{}']);
    const res = await applyRestore(file, 'merge', 'abc 123');
    const [url] = fn.mock.calls[0] as Call;
    expect(url).toBe('/api/admin/restore?mode=merge&plan=abc%20123');
    expect(res.applied).toBe(true);
  });

  it('a 409 rejects with plan_changed and carries the new plan', async () => {
    mockFetch({ code: 'plan_changed', message: 'plan changed', plan: mergePlan({ planHash: 'new' }) }, 409);
    const err = await caught(applyRestore(new Blob(['{}']), 'merge', 'old'));
    expect(err.code).toBe('plan_changed');
    expect(err.status).toBe(409);
    expect(err.plan?.planHash).toBe('new');
  });

  it('a 422 carries its code and count fields', async () => {
    mockFetch({ code: 'too_many', message: 'too many apps', count: 1200, limit: 1000, things: 'apps' }, 422);
    const err = await caught(previewRestore(new Blob(['{}']), 'merge'));
    expect(err).toMatchObject({ code: 'too_many', count: 1200, limit: 1000, things: 'apps', status: 422 });
  });

  it('a plain-text 413 from a proxy still maps to too_large', async () => {
    mockFetch('<html>413 Request Entity Too Large</html>', 413);
    expect((await caught(previewRestore(new Blob(['{}']), 'merge'))).code).toBe('too_large');
  });

  it('a plain-text 409 maps to plan_changed with no plan', async () => {
    mockFetch('conflict', 409);
    const err = await caught(applyRestore(new Blob(['{}']), 'merge', 'h'));
    expect(err.code).toBe('plan_changed');
    expect(err.plan).toBeUndefined();
  });

  it('any other plain-text failure is "failed"', async () => {
    mockFetch('admin role required', 403);
    expect((await caught(previewRestore(new Blob(['{}']), 'merge'))).code).toBe('failed');
  });

  it('a 200 that is not a plan rejects', async () => {
    mockFetch('<!doctype html>', 200);
    expect((await caught(previewRestore(new Blob(['{}']), 'merge'))).code).toBe('failed');
  });
});

describe('Homepage import preview and apply (AC-019)', () => {
  it('previewHomepageImport sends the texts as JSON, leaving out empty optional files', async () => {
    const fn = mockFetch(importPlan(), 200);
    await previewHomepageImport({ services: '- Media: []', bookmarks: '', settings: 'target: _self' });
    const [url, init] = fn.mock.calls[0] as Call;
    expect(url).toBe('/api/admin/import/homepage/preview');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ services: '- Media: []', settings: 'target: _self' });
  });

  it('applyHomepageImport sends the plan hash', async () => {
    const fn = mockFetch({ ...importPlan(), applied: true }, 200);
    await applyHomepageImport({ services: 'x' }, 'h1');
    expect((fn.mock.calls[0] as Call)[0]).toBe('/api/admin/import/homepage?plan=h1');
  });

  it('a YAML error carries the file and the line', async () => {
    mockFetch({ code: 'yaml_syntax', message: 'yaml: line 3: did not find expected key', file: 'bookmarks', line: 3 }, 400);
    const err = await caught(previewHomepageImport({ services: 'x', bookmarks: 'y' }));
    expect(err).toMatchObject({ code: 'yaml_syntax', file: 'bookmarks', line: 3, status: 400 });
    expect(err.message).toContain('did not find expected key');
  });

  it('a network failure is "network"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))));
    expect((await caught(applyHomepageImport({ services: 'x' }, 'h'))).code).toBe('network');
  });
});
