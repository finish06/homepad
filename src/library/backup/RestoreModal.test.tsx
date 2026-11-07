import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import RestoreModal from './RestoreModal';
import { applyRestore, downloadBackup, previewRestore, TransferError, type Plan } from '../../api';
import { asResult, emptyPlan, mergePlan, replacePlan } from '../../test/transferPlans';

expect.extend(toHaveNoViolations);

// SPEC-backup-import UX §3 (TASK-304) — Restore from backup: Choose → Preview →
// Done, the Replace confirm, the stale-preview 409 and the failure state.

vi.mock('../../api', async (orig) => {
  const real = await orig<typeof import('../../api')>();
  return { ...real, previewRestore: vi.fn(), applyRestore: vi.fn(), downloadBackup: vi.fn() };
});

const BACKUP = JSON.stringify({ format: 'homepad-backup', schemaVersion: 1, exportedAt: '2026-11-07T18:04:11Z' });

function backupFile(text = BACKUP, name = 'homepad-backup-2026-11-07.json') {
  return new File([text], name, { type: 'application/json' });
}

function setup(props: Partial<React.ComponentProps<typeof RestoreModal>> = {}) {
  const onClose = vi.fn();
  const onApplied = vi.fn();
  render(<RestoreModal onClose={onClose} onApplied={onApplied} {...props} />);
  return { onClose, onApplied };
}

async function pick(file = backupFile()) {
  fireEvent.change(screen.getByLabelText('Backup file'), { target: { files: [file] } });
  await screen.findByTestId('restore-file-meta');
}

async function toPreview(plan: Plan, mode: 'Merge' | 'Replace' = 'Merge') {
  vi.mocked(previewRestore).mockResolvedValue(plan);
  await pick();
  if (mode === 'Replace') fireEvent.click(screen.getByRole('radio', { name: /Replace/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
  await screen.findByRole('heading', { name: /step 2 of 3/ });
}

beforeEach(() => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }));
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('Restore — step 1, Choose (UX §3.1)', () => {
  it('names the dialog with its step and focuses the heading', () => {
    setup();
    const h = screen.getByRole('heading', { name: 'Restore from backup, step 1 of 3' });
    expect(h).toHaveFocus();
    expect(screen.getByRole('dialog', { name: 'Restore from backup, step 1 of 3' })).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();
  });

  it('Preview is disabled until a file is picked; Merge is the default mode', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Preview' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /Merge/ })).toBeChecked();
    expect(screen.getByText(/add new items and update matching ones\. Nothing is deleted\./)).toBeInTheDocument();
  });

  it('shows the picked file name, size and exportedAt date', async () => {
    setup();
    await pick();
    const meta = screen.getByTestId('restore-file-meta');
    expect(meta).toHaveTextContent('homepad-backup-2026-11-07.json');
    expect(meta).toHaveTextContent(/\d+ (B|KB)/);
    expect(meta).toHaveTextContent('7 Nov 2026');
    expect(screen.getByRole('button', { name: 'Preview' })).toBeEnabled();
  });

  it('a file that is not JSON gets an inline error before any upload', async () => {
    setup();
    fireEvent.change(screen.getByLabelText('Backup file'), { target: { files: [backupFile('not json', 'notes.txt')] } });
    expect(await screen.findByText("This isn't a Homepad backup file.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preview' })).toBeDisabled();
    expect(previewRestore).not.toHaveBeenCalled();
  });

  it('accepts a dropped file', async () => {
    setup();
    fireEvent.drop(screen.getByTestId('restore-drop'), { dataTransfer: { files: [backupFile()] } });
    expect(await screen.findByTestId('restore-file-meta')).toHaveTextContent('homepad-backup-2026-11-07.json');
  });

  it('a server error shows inline and keeps the file picked (AC-016)', async () => {
    vi.mocked(previewRestore).mockRejectedValue(new TransferError('schema_newer', 422, 'newer'));
    setup();
    await pick();
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This backup is from a newer Homepad. Update Homepad, then try again.',
    );
    expect(screen.getByTestId('restore-file-meta')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preview' })).toBeEnabled();
  });

  it('says Checking… while the server works, and sends the chosen mode', async () => {
    let resolve!: (p: Plan) => void;
    vi.mocked(previewRestore).mockReturnValue(new Promise((r) => (resolve = r)));
    setup();
    await pick();
    fireEvent.click(screen.getByRole('radio', { name: /Replace/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(screen.getByRole('button', { name: 'Checking…' })).toBeDisabled();
    expect(vi.mocked(previewRestore).mock.calls[0][1]).toBe('replace');
    await act(async () => resolve(replacePlan()));
  });
});

describe('Restore — step 2, Preview (UX §3.2, AC-007)', () => {
  it('leads with the summary, zero counts left out', async () => {
    setup();
    await toPreview(mergePlan());
    expect(screen.getByTestId('plan-summary')).toHaveTextContent(
      'Add 2 sections · Add 2 apps · Update 1 app · Add 1 icon · Add 1 kid · Update 1 person · 1 skipped',
    );
    expect(screen.getByText("3 fields this version doesn't use were ignored.")).toBeInTheDocument();
    expect(screen.getByText('Step 2 of 3 · Merge')).toBeInTheDocument();
  });

  it('groups rows with marks paired with words; Unchanged starts collapsed', async () => {
    setup();
    await toPreview(mergePlan());
    const sections = screen.getByRole('button', { name: /Sections \(2 to add\)/ });
    expect(sections).toHaveAttribute('aria-expanded', 'true');
    const apps = screen.getByRole('button', { name: /Apps \(2 to add, 1 to update, 1 unchanged\)/ });
    expect(apps).toHaveAttribute('aria-expanded', 'true');
    const grafana = screen.getByTestId('plan-row-app-Grafana');
    expect(grafana).toHaveTextContent('Update');
    expect(grafana).toHaveTextContent('name, icon');
    expect(screen.getByTestId('plan-row-adult-sam@example.com')).toHaveTextContent('Skipped: no account with this email.');
    expect(screen.getByTestId('plan-row-kid-Maya')).toHaveTextContent('Sign their device in again from Accounts.');
    const unchanged = screen.getByRole('button', { name: /Unchanged \(1\)/ });
    expect(unchanged).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('plan-row-app-Sonarr')).toBeNull();
    fireEvent.click(unchanged);
    expect(screen.getByTestId('plan-row-app-Sonarr')).toBeInTheDocument();
    fireEvent.click(sections);
    expect(sections).toHaveAttribute('aria-expanded', 'false');
  });

  it('long groups show the first 20 rows, then Show all (B-3)', async () => {
    const items = Array.from({ length: 60 }, (_, i) => ({
      kind: 'app' as const,
      name: `App ${i + 1}`,
      section: null,
      action: 'create' as const,
    }));
    const p = mergePlan({ items });
    p.summary = { ...p.summary, create: { ...p.summary.create, apps: 60 } };
    setup();
    await toPreview(p);
    expect(screen.getAllByTestId(/^plan-row-app-/)).toHaveLength(20);
    fireEvent.click(screen.getByRole('button', { name: 'Show all 60' }));
    expect(screen.getAllByTestId(/^plan-row-app-/)).toHaveLength(60);
  });

  it('Nothing to change: one message and a Close button (TC-004)', async () => {
    const p = emptyPlan('merge');
    p.summary.unchanged = 12;
    const { onClose } = setup();
    await toPreview(p);
    expect(screen.getByText('Nothing to change. Your dashboard already matches this backup.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('Back returns to Choose with the file and mode kept', async () => {
    setup();
    await toPreview(replacePlan(), 'Replace');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { name: 'Restore from backup, step 1 of 3' })).toHaveFocus();
    expect(screen.getByTestId('restore-file-meta')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Replace/ })).toBeChecked();
  });

  it('changes nothing until Restore is selected (AC-007)', async () => {
    setup();
    await toPreview(mergePlan());
    expect(screen.getByText('Nothing changes until you select Restore.')).toBeInTheDocument();
    expect(applyRestore).not.toHaveBeenCalled();
  });
});

describe('Restore — Replace confirm (UX §3.3, AC-011)', () => {
  it('lists the Delete group first and expanded', async () => {
    setup();
    await toPreview(replacePlan(), 'Replace');
    const groups = screen.getAllByTestId('plan-group-toggle');
    expect(groups[0]).toHaveAccessibleName(/Delete \(1 app, 1 section\)/);
    expect(groups[0]).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('plan-row-app-Old thing')).toHaveTextContent('Delete');
  });

  it('Replace stays disabled until REPLACE is typed, case-sensitive', async () => {
    vi.mocked(applyRestore).mockResolvedValue(asResult(replacePlan()));
    setup();
    await toPreview(replacePlan(), 'Replace');
    const field = screen.getByLabelText('Type REPLACE to confirm');
    expect(field).toHaveAttribute('aria-describedby');
    const warning = document.getElementById(field.getAttribute('aria-describedby')!);
    expect(warning).toHaveTextContent('This deletes everything listed above');
    const btn = screen.getByRole('button', { name: 'Replace' });
    expect(btn).toBeDisabled();
    fireEvent.change(field, { target: { value: 'replace' } });
    expect(btn).toBeDisabled();
    fireEvent.change(field, { target: { value: 'REPLACE' } });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    await screen.findByText('Restored.');
    expect(vi.mocked(applyRestore).mock.calls[0].slice(1)).toEqual(['replace', 'hash-replace-1']);
  });

  it('offers a safety Download backup inside the confirm', async () => {
    vi.mocked(downloadBackup).mockResolvedValue({ blob: new Blob(['{}']), filename: 'b.json' });
    setup();
    await toPreview(replacePlan(), 'Replace');
    fireEvent.click(screen.getByRole('button', { name: 'Download backup' }));
    await waitFor(() => expect(downloadBackup).toHaveBeenCalledWith(true));
  });

  it('says so when the safety download fails', async () => {
    vi.mocked(downloadBackup).mockRejectedValue(new TransferError('failed', 500, 'x'));
    setup();
    await toPreview(replacePlan(), 'Replace');
    fireEvent.click(screen.getByRole('button', { name: 'Download backup' }));
    expect(await screen.findByText("Couldn't make the backup. Try again.")).toBeInTheDocument();
  });
});

describe('Restore — apply and Done (UX §3.4, AC-008)', () => {
  it('applies with the preview hash, shows the past-tense result and the kid follow-up', async () => {
    vi.mocked(applyRestore).mockResolvedValue(asResult(mergePlan()));
    const { onApplied, onClose } = setup();
    await toPreview(mergePlan());
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(await screen.findByRole('heading', { name: 'Restore from backup, step 3 of 3' })).toHaveFocus();
    expect(vi.mocked(applyRestore).mock.calls[0].slice(1)).toEqual(['merge', 'hash-merge-1']);
    expect(screen.getByText('Restored.')).toBeInTheDocument();
    expect(screen.getByTestId('restore-result')).toHaveTextContent('Added 2 sections, 2 apps, 1 icon and 1 kid.');
    expect(screen.getByTestId('restore-result')).toHaveTextContent('Updated 1 app and 1 person.');
    expect(screen.getByText('Added 1 kid: Maya. Sign their device in from Accounts.')).toBeInTheDocument();
    expect(screen.getByText('Skipped 1 person: no account with this email.')).toBeInTheDocument();
    expect(onApplied).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('a stale preview (409) returns to step 2 with the new plan loaded (TC-006)', async () => {
    const fresh = mergePlan({ planHash: 'hash-merge-2' });
    vi.mocked(applyRestore)
      .mockRejectedValueOnce(new TransferError('plan_changed', 409, 'changed', { plan: fresh }))
      .mockResolvedValueOnce(asResult(fresh));
    const { onApplied } = setup();
    await toPreview(mergePlan());
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(await screen.findByText("Your dashboard changed since the preview. Here's the new one.")).toBeInTheDocument();
    expect(onApplied).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await screen.findByText('Restored.');
    expect(vi.mocked(applyRestore).mock.calls[1][2]).toBe('hash-merge-2');
  });

  it('a 409 with no plan re-runs the preview', async () => {
    vi.mocked(applyRestore).mockRejectedValueOnce(new TransferError('plan_changed', 409, 'changed'));
    setup();
    await toPreview(mergePlan());
    vi.mocked(previewRestore).mockResolvedValue(mergePlan({ planHash: 'again' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(await screen.findByText("Your dashboard changed since the preview. Here's the new one.")).toBeInTheDocument();
    expect(previewRestore).toHaveBeenCalledTimes(2);
  });

  it('a failure says nothing was changed, with Back and Try again', async () => {
    vi.mocked(applyRestore)
      .mockRejectedValueOnce(new TransferError('network', 0, 'offline'))
      .mockResolvedValueOnce(asResult(mergePlan()));
    setup();
    await toPreview(mergePlan());
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Restore didn't finish. Nothing was changed.");
    expect(alert).toHaveTextContent("Couldn't reach Homepad. Check your connection and try again.");
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('Restored.');
  });
});

describe('Restore — closing (UX §7)', () => {
  it('Escape with nothing picked closes at once', () => {
    const { onClose } = setup();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('Escape with a file picked asks first; Keep stays, Discard closes', async () => {
    const { onClose } = setup();
    await pick();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    const strip = screen.getByRole('group', { name: 'Discard this restore?' });
    fireEvent.click(within(strip).getByRole('button', { name: 'Keep' }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close Restore from backup' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Discard this restore?' })).getByRole('button', { name: 'Discard' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('has no axe violations on Choose, Preview (Replace) and Done', async () => {
    vi.mocked(applyRestore).mockResolvedValue(asResult(replacePlan()));
    setup();
    expect(await axe(document.body)).toHaveNoViolations();
    await toPreview(replacePlan(), 'Replace');
    expect(await axe(document.body)).toHaveNoViolations();
    fireEvent.change(screen.getByLabelText('Type REPLACE to confirm'), { target: { value: 'REPLACE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
    await screen.findByText('Restored.');
    expect(await axe(document.body)).toHaveNoViolations();
  });
});
