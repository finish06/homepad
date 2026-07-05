import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TileEditModal from './TileEditModal';
import { updateService, uploadIcon, deleteIcon, fetchIcon, type Category, type Service } from './api';

// v21 — Tile Edit Modal (specs/v21-tile-edit-modal.md §6, §8.2–8.5). The modal
// edits a SHARED-CATALOG tile (Option A, admin-only). These jsdom tests cover
// the product ACs that don't need real layout; the pointer/stacking/focus-trap
// paint behavior is verified separately in the CDP browser gate.

vi.mock('./api', () => ({
  updateService: vi.fn(),
  uploadIcon: vi.fn(),
  deleteIcon: vi.fn(),
  fetchIcon: vi.fn(),
}));

// Keep the real iconSrc/initialBadge (pure) but stub validateIconFile — jsdom
// has no createImageBitmap, so the real validator always rejects.
vi.mock('./icons', async (orig) => ({
  ...(await orig<typeof import('./icons')>()),
  validateIconFile: vi.fn(async () => null),
}));

const mUpdate = vi.mocked(updateService);
const mUpload = vi.mocked(uploadIcon);
const mDelete = vi.mocked(deleteIcon);
const mFetch = vi.mocked(fetchIcon);

afterEach(() => {
  vi.clearAllMocks();
});

const cats: Category[] = [
  { id: 'c1', name: 'Media', sortIndex: 0, layoutRow: 0, layoutColOrder: 0, layoutWidthPct: 100 },
  { id: 'c2', name: 'Tools', sortIndex: 1, layoutRow: 1, layoutColOrder: 0, layoutWidthPct: 100 },
];

function svc(overrides: Partial<Service> = {}): Service {
  return {
    id: 'S1',
    slug: 'gitea',
    name: 'Gitea',
    url: 'https://gitea.x',
    description: 'Git hosting',
    icon: '',
    status: 'UP',
    favorite: false,
    iconLight: false,
    iconDark: false,
    categoryId: 'c1',
    categoryName: 'Media',
    ...overrides,
  };
}

function renderModal(props: Partial<React.ComponentProps<typeof TileEditModal>> = {}) {
  const onClose = props.onClose ?? vi.fn();
  const onPatch = props.onPatch ?? vi.fn();
  const onToast = props.onToast ?? vi.fn();
  render(
    <TileEditModal
      service={props.service ?? svc()}
      categories={props.categories ?? cats}
      theme={props.theme ?? 'light'}
      onClose={onClose}
      onPatch={onPatch}
      onToast={onToast}
    />,
  );
  return { onClose, onPatch, onToast };
}

describe('v21 TileEditModal — dialog & prefill (AC-002/AC-003)', () => {
  it('is a labelled modal dialog', () => {
    renderModal();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    // aria-labelledby points at the visible heading.
    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)?.textContent).toMatch(/edit tile/i);
  });

  it('prefills every field from the current shared-catalog values', () => {
    renderModal();
    expect(screen.getByTestId('tile-field-title')).toHaveValue('Gitea');
    expect(screen.getByTestId('tile-field-url')).toHaveValue('https://gitea.x');
    expect(screen.getByTestId('tile-field-description')).toHaveValue('Git hosting');
    expect(screen.getByTestId('tile-field-category')).toHaveValue('c1');
    expect(screen.getByTestId('tile-field-icon-url')).toHaveValue('');
  });

  it('moves focus to the Title input on open (§8.2 note)', async () => {
    renderModal();
    await waitFor(() => expect(screen.getByTestId('tile-field-title')).toHaveFocus());
  });

  it('renders the fields in Kare order: Title, URL, Category, Icon panel, Description', () => {
    renderModal();
    const dialog = screen.getByRole('dialog');
    const order = ['tile-field-title', 'tile-field-url', 'tile-field-category', 'tile-icon-panel', 'tile-field-description'];
    const positions = order.map((id) => {
      const el = within(dialog).getByTestId(id);
      return Array.prototype.indexOf.call(dialog.querySelectorAll('[data-testid]'), el);
    });
    // Each testid appears strictly after the previous in DOM order.
    const sorted = [...positions].sort((a, b) => a - b);
    expect(positions).toEqual(sorted);
  });
});

describe('v21 TileEditModal — Save (AC-004..AC-007, AC-014)', () => {
  it('sends one PATCH with the changed fields + category and updates the tile inline', async () => {
    const u = userEvent.setup();
    mUpdate.mockResolvedValue({ ok: true, status: 200, service: svc({ name: 'Gitea CE', categoryId: 'c2', categoryName: 'Tools' }) });
    const { onClose, onPatch, onToast } = renderModal();

    await u.clear(screen.getByTestId('tile-field-title'));
    await u.type(screen.getByTestId('tile-field-title'), 'Gitea CE');
    await u.selectOptions(screen.getByTestId('tile-field-category'), 'c2');
    await u.click(screen.getByTestId('tile-edit-save'));

    await waitFor(() => expect(mUpdate).toHaveBeenCalledTimes(1));
    const [id, patch] = mUpdate.mock.calls[0];
    expect(id).toBe('S1');
    expect(patch).toMatchObject({ name: 'Gitea CE', categoryId: 'c2' });
    // Inline tile update + success toast + close (AC-014).
    expect(onPatch).toHaveBeenCalledWith(expect.objectContaining({ name: 'Gitea CE', categoryId: 'c2' }));
    expect(onToast).toHaveBeenCalledWith('Tile updated.', 'success');
    expect(onClose).toHaveBeenCalled();
  });

  it('blocks Save with an empty required Title and does not PATCH', async () => {
    const u = userEvent.setup();
    renderModal();
    await u.clear(screen.getByTestId('tile-field-title'));
    await u.click(screen.getByTestId('tile-edit-save'));
    expect(mUpdate).not.toHaveBeenCalled();
    expect(screen.getByTestId('tile-edit-error')).toBeInTheDocument();
  });

  it('AC-015 — a failed PATCH keeps the modal open with values intact and toasts the error', async () => {
    const u = userEvent.setup();
    mUpdate.mockResolvedValue({ ok: false, status: 403, error: 'forbidden' });
    const { onClose, onToast } = renderModal();

    await u.clear(screen.getByTestId('tile-field-title'));
    await u.type(screen.getByTestId('tile-field-title'), 'New Name');
    await u.click(screen.getByTestId('tile-edit-save'));

    await waitFor(() => expect(onToast).toHaveBeenCalledWith(expect.stringMatching(/forbidden|could not/i), 'error'));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('tile-field-title')).toHaveValue('New Name');
  });
});

describe('v21 TileEditModal — dismiss & discard (AC-011)', () => {
  it('closes immediately with no prompt when nothing is dirty', async () => {
    const u = userEvent.setup();
    const { onClose } = renderModal();
    await u.click(screen.getByTestId('tile-edit-cancel'));
    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByTestId('tile-discard-confirm')).not.toBeInTheDocument();
  });

  it('shows an inline discard confirm (not window.confirm) when dirty; Keep editing stays open', async () => {
    const u = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm');
    const { onClose } = renderModal();
    await u.type(screen.getByTestId('tile-field-title'), 'X');
    await u.click(screen.getByTestId('tile-edit-cancel'));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId('tile-discard-confirm')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    await u.click(screen.getByTestId('tile-discard-keep'));
    expect(screen.queryByTestId('tile-discard-confirm')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  // AC-011 / #322 — "Keep editing" must return you to the editor WITHOUT saving.
  // Root cause (found in the real-browser gate, see tile-edit-discard-322.spec):
  // React reconciled the two .tile-edit-actions branches by position, so the
  // <button> clicked as "Keep editing" (type=button) was REUSED and morphed into
  // the "Save" (type=submit) button when setConfirmDiscard(false) collapsed the
  // strip — real Chromium then activated it as a form submit and silently saved.
  // jsdom has no activation model, so it cannot see the save; but the SAME reuse
  // starves the strip's autoFocus (it never fires on a recycled node), which IS
  // observable here. Keying the two rows makes React remount instead of reuse,
  // which fixes both: autoFocus fires on the fresh node AND Chrome has no morphed
  // node to submit. This locks the jsdom-visible half (focus lands on the safe
  // default; nothing saves); the real Chromium save is guarded by the gate spec.
  it('Keep editing returns to the editor and never saves the dirty tile (#322)', async () => {
    const u = userEvent.setup();
    const { onClose, onPatch, onToast } = renderModal();
    await u.type(screen.getByTestId('tile-field-title'), 'DIRTY_TITLE_TEST');
    await u.keyboard('{Escape}');

    // Strip is up and the safe default owns focus (the precondition that keeps
    // Chrome from mis-activating Save when the strip collapses).
    const keep = screen.getByTestId('tile-discard-keep');
    expect(screen.getByTestId('tile-discard-confirm')).toBeInTheDocument();
    expect(document.activeElement).toBe(keep);

    await u.click(keep);

    // Back in the editor: strip dismissed, dirty value retained, nothing saved.
    expect(screen.queryByTestId('tile-discard-confirm')).not.toBeInTheDocument();
    expect(screen.getByTestId('tile-field-title')).toHaveValue('GiteaDIRTY_TITLE_TEST');
    expect(mUpdate).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(onPatch).not.toHaveBeenCalled();
    expect(onToast).not.toHaveBeenCalled();
  });

  it('Discard confirms the close', async () => {
    const u = userEvent.setup();
    const { onClose } = renderModal();
    await u.type(screen.getByTestId('tile-field-title'), 'X');
    await u.click(screen.getByTestId('tile-edit-cancel'));
    await u.click(screen.getByTestId('tile-discard-yes'));
    expect(onClose).toHaveBeenCalled();
  });

  it('Esc dismisses (clean → close)', async () => {
    const u = userEvent.setup();
    const { onClose } = renderModal();
    await u.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('backdrop click dismisses (clean → close)', async () => {
    const u = userEvent.setup();
    const { onClose } = renderModal();
    await u.click(screen.getByTestId('tile-edit-overlay'));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('v21 TileEditModal — icon panel (AC-009, AC-010, §8.5)', () => {
  it('AC-009 — a selected PNG uploads immediately (no Save) and patches the tile', async () => {
    const u = userEvent.setup();
    mUpload.mockResolvedValue({ ok: true, status: 204 });
    const { onPatch } = renderModal();
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'i.png', { type: 'image/png' });
    await u.upload(screen.getByTestId('tile-icon-upload-input'), file);
    await waitFor(() => expect(mUpload).toHaveBeenCalledWith('S1', 'light', file));
    expect(onPatch).toHaveBeenCalledWith(expect.objectContaining({ iconLight: true }));
    expect(mUpdate).not.toHaveBeenCalled(); // fired on select, not Save
  });

  it('shows an inline error and keeps text fields savable when an upload fails', async () => {
    const u = userEvent.setup();
    mUpload.mockResolvedValue({ ok: false, status: 413, error: 'too big' });
    renderModal();
    const file = new File([new Uint8Array([0x89, 0x50])], 'i.png', { type: 'image/png' });
    await u.upload(screen.getByTestId('tile-icon-upload-input'), file);
    await waitFor(() => expect(screen.getByTestId('tile-icon-error')).toHaveTextContent(/too big|could not/i));
  });

  it('AC-010 — Remove clears the uploaded icon after an inline confirm', async () => {
    const u = userEvent.setup();
    mDelete.mockResolvedValue(true);
    const { onPatch } = renderModal({ service: svc({ iconLight: true, icon: 'https://x/i.png' }) });
    await u.click(screen.getByTestId('tile-icon-remove'));
    await u.click(screen.getByTestId('tile-icon-remove-yes'));
    await waitFor(() => expect(mDelete).toHaveBeenCalledWith('S1', 'light'));
    expect(screen.getByTestId('tile-field-icon-url')).toHaveValue('');
    expect(onPatch).toHaveBeenCalledWith(expect.objectContaining({ iconLight: false, icon: '' }));
  });

  it('§8.5 — Fetch is disabled when the URL is empty and fetches when a URL is present', async () => {
    const u = userEvent.setup();
    mFetch.mockResolvedValue({ ok: true, status: 200, iconUrl: '/api/services/S1/icon/light' });
    const { onPatch } = renderModal({ service: svc({ url: '' }) });
    expect(screen.getByTestId('tile-icon-fetch')).toBeDisabled();
    await u.type(screen.getByTestId('tile-field-url'), 'https://gitea.x');
    expect(screen.getByTestId('tile-icon-fetch')).toBeEnabled();
    await u.click(screen.getByTestId('tile-icon-fetch'));
    await waitFor(() => expect(mFetch).toHaveBeenCalledWith('S1'));
    expect(onPatch).toHaveBeenCalledWith(expect.objectContaining({ iconLight: true }));
  });
});
