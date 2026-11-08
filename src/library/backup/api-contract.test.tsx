import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import HomepageImportModal from './HomepageImportModal';
import RestoreModal from './RestoreModal';
import { previewHomepageImport, previewRestore, TransferError, type Plan } from './transferApi';
import { errorCopy } from '../importCopy';
import restoreMerge from '../../test/api-plans/restore-merge.json';
import restoreReplace from '../../test/api-plans/restore-replace.json';
import importFixtures from '../../test/api-plans/import-fixtures.json';
import importAgain from '../../test/api-plans/import-again-status.json';
import yamlError from '../../test/api-plans/error-yaml.json';

// SPEC-backup-import — the UI against plans exactly as homepad-api writes
// them. The other tests use hand-made plans (src/test/transferPlans.ts); these
// JSON files are the real engine's output (internal/transfer, PlanRestore and
// PlanImport over its own testdata: the v1 backup fixture and the Homepage
// services/bookmarks/settings fixtures). If the API's shape moves, regenerate
// them from homepad-api and this suite says what the UI no longer reads.

vi.mock('./transferApi', async (orig) => {
  const real = await orig<typeof import('./transferApi')>();
  return { ...real, previewRestore: vi.fn(), previewHomepageImport: vi.fn() };
});

beforeEach(() => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const BACKUP = JSON.stringify({ format: 'homepad-backup', schemaVersion: 1, exportedAt: '2026-11-07T18:04:11Z' });

async function restorePreview(plan: unknown, mode: 'Merge' | 'Replace') {
  vi.mocked(previewRestore).mockResolvedValue(plan as Plan);
  render(<RestoreModal onClose={vi.fn()} onApplied={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Backup file'), {
    target: { files: [new File([BACKUP], 'homepad-backup-2026-11-07.json', { type: 'application/json' })] },
  });
  await screen.findByTestId('restore-file-meta');
  if (mode === 'Replace') fireEvent.click(screen.getByRole('radio', { name: /Replace/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
  await screen.findByRole('heading', { name: /step 2 of 3/ });
}

async function importPreview(plan: unknown) {
  vi.mocked(previewHomepageImport).mockResolvedValue(plan as Plan);
  render(<HomepageImportModal onClose={vi.fn()} onApplied={vi.fn()} />);
  fireEvent.change(screen.getByRole('textbox', { name: 'services.yaml' }), { target: { value: '- Media: []\n' } });
  fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
  await screen.findByRole('heading', { name: 'Import from Homepage, step 2 of 3' });
}

describe('the UI reads the API’s real plans', () => {
  it('restore, Merge, onto a fresh install (TC-003)', async () => {
    await restorePreview(restoreMerge, 'Merge');
    const summary = screen.getByTestId('plan-summary');
    expect(summary).toHaveTextContent('Add 3 sections');
    expect(summary).toHaveTextContent('Add 5 apps');
    expect(summary).toHaveTextContent('Add 3 icons');
    expect(summary).toHaveTextContent('Add 1 kid');
    expect(summary).toHaveTextContent('1 skipped');
    expect(screen.getByText('Skipped: no account with this email.')).toBeInTheDocument();
    expect(screen.getByText(/Sign their device in again from Accounts\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore' })).toBeEnabled();
  });

  it('restore, Replace: the Delete group and the typed confirm (TC-005)', async () => {
    await restorePreview(restoreReplace, 'Replace');
    expect(screen.getByText('Old thing')).toBeInTheDocument();
    const replace = screen.getByRole('button', { name: 'Replace' });
    expect(replace).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Type REPLACE to confirm/), { target: { value: 'REPLACE' } });
    expect(replace).toBeEnabled();
  });

  it('Homepage import of the fixture set: sections, skips, warnings, status checks', async () => {
    await importPreview(importFixtures);
    expect(screen.getByTestId('plan-summary')).toHaveTextContent('Add 4 sections · Add 9 apps · 3 skipped');
    const toggles = screen.getAllByTestId('plan-group-toggle').map((b) => b.textContent);
    expect(toggles.slice(0, 4)).toEqual([
      'Network (new section)',
      'Network / DNS (new section)',
      'Media (new section)',
      'Developer (new section)',
    ]);
    expect(screen.getByTestId('plan-row-app-Grafana')).toHaveTextContent('Link uses a Homepage variable. Add it by hand.');
    expect(screen.getByTestId('plan-row-app-Uptime Kuma')).toHaveTextContent("Link isn't http or https.");
    expect(screen.getByTestId('plan-row-app-AdGuard')).toHaveTextContent("Local icon files can't be copied. Upload it on the app.");
    expect(screen.getByTestId('plan-row-app-Jellyfin')).toHaveTextContent('Widget not imported.');
    expect(screen.getByText(/3 apps had siteMonitor or ping\./)).toBeInTheDocument();
    expect((screen.getByRole('textbox', { name: 'Gatus endpoints' }) as HTMLTextAreaElement).value).toContain('name: Pi-hole');
    expect(screen.getByRole('button', { name: 'Import 9 apps' })).toBeEnabled();
  });

  it('Homepage re-import after Gatus learns the keys (TC-009)', async () => {
    await importPreview(importAgain);
    expect(screen.getByTestId('plan-row-app-Sonarr')).toHaveTextContent('Status turned on.');
    expect(screen.getByRole('button', { name: 'Turn on status for 2 apps' })).toBeEnabled();
  });

  it('a YAML syntax error reads as one sentence with the right line (AC-028)', () => {
    const e = yamlError as { code: string; message: string; line: number; detail: string; file: 'services' };
    const err = new TransferError(e.code, 400, e.message, { file: e.file, line: e.line, detail: e.detail });
    expect(errorCopy(err)).toBe("There's a problem on line 3: did not find expected ',' or ']'.");
  });
});
