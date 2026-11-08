import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import BackupSection from './BackupSection';
import { downloadBackup, previewHomepageImport, previewRestore, TransferError } from './transferApi';

expect.extend(toHaveNoViolations);

// SPEC-backup-import UX §2 (TASK-303) — the Backup and import section.

vi.mock('./transferApi', async (orig) => {
  const real = await orig<typeof import('./transferApi')>();
  return {
    ...real,
    downloadBackup: vi.fn(),
    previewRestore: vi.fn(),
    applyRestore: vi.fn(),
    previewHomepageImport: vi.fn(),
    applyHomepageImport: vi.fn(),
  };
});

let created: { href: string; download: string }[] = [];

beforeEach(() => {
  created = [];
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }));
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    created.push({ href: this.href, download: this.download });
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('BackupSection — the three rows (UX §2)', () => {
  it('has the title, the three actions, and Include people ticked by default', () => {
    render(<BackupSection />);
    expect(screen.getByRole('heading', { level: 3, name: 'Backup and import' })).toBeInTheDocument();
    expect(screen.getByText('One file with your sections, apps, icons, App Library and settings.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Include people/ })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Download backup' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Restore from file…' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Import…' })).toBeEnabled();
  });

  it('the hint says what is in the file, ticked and unticked (AC-003)', () => {
    render(<BackupSection />);
    expect(screen.getByText('The file will include email addresses. Keep it private.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /Include people/ }));
    expect(screen.getByText('No emails or personal settings.')).toBeInTheDocument();
    expect(screen.queryByText(/Keep it private/)).toBeNull();
  });
});

describe('BackupSection — Download backup (AC-001, AC-003)', () => {
  it('downloads with people=true by default, under the server filename', async () => {
    vi.mocked(downloadBackup).mockResolvedValue({ blob: new Blob(['{}']), filename: 'homepad-backup-2026-11-07.json' });
    render(<BackupSection />);
    fireEvent.click(screen.getByRole('button', { name: 'Download backup' }));
    expect(screen.getByRole('button', { name: 'Preparing…' })).toBeDisabled();
    await waitFor(() => expect(created).toHaveLength(1));
    expect(downloadBackup).toHaveBeenCalledWith(true);
    expect(created[0].download).toBe('homepad-backup-2026-11-07.json');
    expect(await screen.findByRole('button', { name: 'Download backup' })).toBeEnabled();
  });

  it('sends people=false when the box is unticked', async () => {
    vi.mocked(downloadBackup).mockResolvedValue({ blob: new Blob(['{}']), filename: 'b.json' });
    render(<BackupSection />);
    fireEvent.click(screen.getByRole('checkbox', { name: /Include people/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Download backup' }));
    await waitFor(() => expect(downloadBackup).toHaveBeenCalledWith(false));
  });

  it('shows the inline error when the backup fails, and the rest still works', async () => {
    vi.mocked(downloadBackup).mockRejectedValue(new TransferError('failed', 500, 'internal error'));
    render(<BackupSection />);
    fireEvent.click(screen.getByRole('button', { name: 'Download backup' }));
    expect(await screen.findByText("Couldn't make the backup. Try again.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download backup' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Import…' })).toBeEnabled();
  });
});

describe('BackupSection — opens the two flows', () => {
  it('Restore from file… opens the restore modal', async () => {
    render(<BackupSection />);
    fireEvent.click(screen.getByRole('button', { name: 'Restore from file…' }));
    expect(await screen.findByRole('dialog', { name: 'Restore from backup, step 1 of 3' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(previewRestore).not.toHaveBeenCalled();
  });

  it('Import… opens the Homepage import modal', async () => {
    render(<BackupSection />);
    fireEvent.click(screen.getByRole('button', { name: 'Import…' }));
    expect(await screen.findByRole('dialog', { name: 'Import from Homepage, step 1 of 3' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(previewHomepageImport).not.toHaveBeenCalled();
  });

  it('has no axe violations', async () => {
    const { container } = render(<BackupSection />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
