import { useEffect, useId, useRef, useState } from 'react';
import {
  deleteIcon,
  fetchIcon,
  updateService,
  uploadIcon,
  type Category,
  type IconVariant,
  type Service,
} from './api';
import { iconSrc, initialBadge, validateIconFile } from './icons';

// v21 — Tile Edit Modal (specs/v21-tile-edit-modal.md §6, §8). An admin in edit
// mode taps a tile's pencil to edit that SHARED-CATALOG entry (Option A) without
// leaving the dashboard. Text fields (Title/URL/Description) + Category save in a
// single PATCH; icon PNG upload / Remove / Fetch-favicon fire IMMEDIATELY (§6.3),
// not on Save. Full WAI-ARIA dialog: role=dialog, focus trap, focus-on-Title,
// Esc/backdrop close, inline (never native) discard confirm. The pointer/paint/
// focus-trap behavior jsdom can't see is verified in the CDP browser gate.
export default function TileEditModal({
  service,
  categories,
  theme,
  onClose,
  onPatch,
  onToast,
}: {
  service: Service;
  categories: Category[];
  theme: 'light' | 'dark';
  onClose: () => void;
  // Merge a partial into the grid's shared service so the tile reflects a live
  // icon change (immediate) or the saved text fields (on Save) without a reload.
  onPatch: (partial: Partial<Service>) => void;
  onToast: (message: string, kind: 'success' | 'error') => void;
}) {
  const [title, setTitle] = useState(service.name);
  const [url, setUrl] = useState(service.url);
  const [description, setDescription] = useState(service.description);
  const [iconUrl, setIconUrl] = useState(service.icon);
  const [categoryId, setCategoryId] = useState(service.categoryId ?? '');
  // Local icon presence — flips live as immediate uploads/removes complete, so
  // the preview (and its cache-busting rev) tracks the new state before Save.
  const [iconLight, setIconLight] = useState(service.iconLight);
  const [iconDark, setIconDark] = useState(service.iconDark);
  const [rev, setRev] = useState(0);
  const [busy, setBusy] = useState(false);
  const [iconBusy, setIconBusy] = useState<null | 'upload' | 'fetch'>(null);
  const [iconError, setIconError] = useState('');
  const [error, setError] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const headingId = useId();
  const titleId = useId();
  const urlId = useId();
  const catId = useId();
  const iconUrlId = useId();
  const descId = useId();

  const titleRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLFormElement>(null);
  const lightInputRef = useRef<HTMLInputElement>(null);
  const darkInputRef = useRef<HTMLInputElement>(null);

  // §8.2 note — open focus lands on Title (the field most often edited), not the
  // literal first focusable node (the ✕).
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  // Dirtiness = any text field / category / Icon URL differing from its prefill.
  // Immediate icon PNG upload / Remove are NOT part of dirty tracking (§8.4).
  const dirty =
    title !== service.name ||
    url !== service.url ||
    description !== service.description ||
    iconUrl !== service.icon ||
    categoryId !== (service.categoryId ?? '');

  const previewSvc: Service = { ...service, name: title, icon: iconUrl, iconLight, iconDark };
  const previewSrc = iconSrc(previewSvc, theme, rev);

  function attemptDismiss() {
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      // Esc while the discard strip is up = "Keep editing" (the safe default).
      if (confirmDiscard) {
        setConfirmDiscard(false);
        return;
      }
      attemptDismiss();
      return;
    }
    if (e.key === 'Tab') trapTab(e);
  }

  // Focus trap (AC-012): Tab / Shift+Tab cycle within the modal only.
  function trapTab(e: React.KeyboardEvent) {
    const root = modalRef.current;
    if (!root) return;
    const nodes = root.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
    );
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!title.trim() || !url.trim()) {
      setError('Title and URL are required.');
      return;
    }
    setBusy(true);
    const patch: Partial<Parameters<typeof updateService>[1]> = {};
    if (title.trim() !== service.name) patch.name = title.trim();
    if (url.trim() !== service.url) patch.url = url.trim();
    if (description !== service.description) patch.description = description;
    if (iconUrl !== service.icon) patch.icon = iconUrl;
    if (categoryId !== (service.categoryId ?? '')) patch.categoryId = categoryId || null;

    const r = await updateService(service.id, patch);
    setBusy(false);
    if (!r.ok || !r.service) {
      const msg = r.error ?? 'Could not save changes.';
      setError(msg);
      onToast(msg, 'error');
      return;
    }
    const categoryName = categoryId ? categories.find((c) => c.id === categoryId)?.name ?? null : null;
    onPatch({
      name: title.trim(),
      url: url.trim(),
      description,
      icon: iconUrl,
      categoryId: categoryId || null,
      categoryName,
    });
    onToast('Tile updated.', 'success');
    onClose();
  }

  async function onPickIcon(variant: IconVariant, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // let the same file be re-selected after an error
    if (!file) return;
    setIconError('');
    const verr = await validateIconFile(file);
    if (verr) {
      setIconError(verr);
      return;
    }
    setIconBusy('upload');
    const r = await uploadIcon(service.id, variant, file);
    setIconBusy(null);
    if (!r.ok) {
      setIconError(r.error ?? 'Could not upload the icon.');
      return;
    }
    if (variant === 'light') setIconLight(true);
    else setIconDark(true);
    setRev((v) => v + 1);
    onPatch(variant === 'light' ? { iconLight: true } : { iconDark: true });
  }

  async function doRemove() {
    setConfirmRemove(false);
    setIconError('');
    setIconBusy('upload');
    if (iconLight) await deleteIcon(service.id, 'light');
    if (iconDark) await deleteIcon(service.id, 'dark');
    setIconBusy(null);
    setIconLight(false);
    setIconDark(false);
    setIconUrl('');
    setRev((v) => v + 1);
    onPatch({ iconLight: false, iconDark: false, icon: '' });
  }

  async function doFetch() {
    if (!url.trim() || iconBusy) return;
    setIconError('');
    setIconBusy('fetch');
    const r = await fetchIcon(service.id);
    setIconBusy(null);
    if (!r.ok) {
      setIconError(r.error ?? "Couldn't fetch a favicon from this URL.");
      return;
    }
    setIconLight(true);
    setRev((v) => v + 1);
    onPatch({ iconLight: true });
  }

  return (
    <div
      className="tile-edit-overlay"
      data-testid="tile-edit-overlay"
      onMouseDown={(e) => e.target === e.currentTarget && attemptDismiss()}
      onKeyDown={onKeyDown}
    >
      <form
        ref={modalRef}
        className="tile-edit-modal"
        data-testid="tile-edit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        onSubmit={handleSubmit}
      >
        <header className="tile-edit-header">
          <div className="tile-edit-heading-group">
            <h2 id={headingId} className="tile-edit-title-h">
              Edit tile
            </h2>
            <p className="tile-edit-subtitle" data-testid="tile-edit-subtitle">
              {service.name} · shared catalog
            </p>
          </div>
          <button
            type="button"
            className="tile-edit-close"
            data-testid="tile-edit-close"
            aria-label="Close edit tile"
            onClick={attemptDismiss}
          >
            ✕
          </button>
        </header>

        <div className="tile-edit-body">
          <div className="tile-edit-field">
            <label className="tile-edit-label" htmlFor={titleId}>
              Title
            </label>
            <input
              id={titleId}
              ref={titleRef}
              data-testid="tile-field-title"
              className="tile-edit-input"
              type="text"
              value={title}
              aria-required="true"
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="tile-edit-field">
            <label className="tile-edit-label" htmlFor={urlId}>
              URL
            </label>
            <input
              id={urlId}
              data-testid="tile-field-url"
              className="tile-edit-input"
              type="url"
              value={url}
              aria-required="true"
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          <div className="tile-edit-field">
            <label className="tile-edit-label" htmlFor={catId}>
              Category
            </label>
            <select
              id={catId}
              data-testid="tile-field-category"
              className="tile-edit-input tile-edit-select"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Uncategorized</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Icon compound panel (§8.3) — grouped so its internal complexity reads
              as one unit, set apart from the loose fields above/below it. */}
          <div className="tile-icon-panel" data-testid="tile-icon-panel">
            <div className="tile-icon-row">
              <span
                className={`tile-icon-preview${iconBusy ? ' is-busy' : ''}`}
                data-testid="tile-icon-preview-box"
              >
                <img
                  src={previewSrc}
                  alt=""
                  data-testid="tile-icon-preview"
                  data-fallback={initialBadge(title)}
                  onError={(e) => {
                    const img = e.currentTarget;
                    const fb = img.dataset.fallback;
                    if (fb && img.src !== fb) img.src = fb;
                  }}
                />
                {iconBusy && (
                  <span className="tile-icon-spinner" role="status" aria-live="polite">
                    {iconBusy === 'fetch' ? 'Fetching…' : 'Uploading…'}
                  </span>
                )}
              </span>

              <div className="tile-icon-controls">
                <button
                  type="button"
                  className="tile-edit-btn tile-edit-btn-secondary"
                  data-testid="tile-icon-upload"
                  disabled={iconBusy !== null}
                  onClick={() => lightInputRef.current?.click()}
                >
                  Upload icon
                </button>
                <button
                  type="button"
                  className="tile-edit-btn tile-edit-btn-ghost"
                  data-testid="tile-icon-upload-dark"
                  disabled={iconBusy !== null}
                  onClick={() => darkInputRef.current?.click()}
                >
                  Dark variant
                </button>
                <button
                  type="button"
                  className="tile-edit-btn tile-edit-btn-ghost"
                  data-testid="tile-icon-fetch"
                  disabled={!url.trim() || iconBusy !== null}
                  aria-disabled={!url.trim() || undefined}
                  title={!url.trim() ? 'Enter a URL first' : undefined}
                  onClick={doFetch}
                >
                  ⭳ Fetch from URL
                </button>
              </div>

              {/* CSS-hidden file inputs; the visible buttons above forward the
                  activation, so keyboard users are covered (§6.4). Out of the tab
                  order (tabIndex -1) so Tab never lands on a hidden control. */}
              <input
                ref={lightInputRef}
                data-testid="tile-icon-upload-input"
                className="sr-only"
                type="file"
                accept="image/png"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(e) => onPickIcon('light', e)}
              />
              <input
                ref={darkInputRef}
                data-testid="tile-icon-upload-dark-input"
                className="sr-only"
                type="file"
                accept="image/png"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(e) => onPickIcon('dark', e)}
              />
            </div>

            <div className="tile-edit-field tile-icon-url-field">
              <label className="tile-edit-label" htmlFor={iconUrlId}>
                Icon URL
              </label>
              <input
                id={iconUrlId}
                data-testid="tile-field-icon-url"
                className="tile-edit-input"
                type="url"
                value={iconUrl}
                placeholder="https://cdn.example.com/icon.png"
                onChange={(e) => setIconUrl(e.target.value)}
              />
              <p className="tile-edit-help">Used as a fallback when no PNG is uploaded.</p>
            </div>

            {iconError && (
              <p className="tile-edit-icon-error" role="alert" data-testid="tile-icon-error">
                {iconError}
              </p>
            )}

            {confirmRemove ? (
              <div className="tile-icon-remove-confirm" data-testid="tile-icon-remove-confirm">
                <span className="tile-edit-help">Remove this tile's icon?</span>
                <button
                  type="button"
                  className="tile-edit-btn-text is-danger"
                  data-testid="tile-icon-remove-yes"
                  onClick={doRemove}
                >
                  Remove
                </button>
                <button
                  type="button"
                  className="tile-edit-btn-text"
                  data-testid="tile-icon-remove-no"
                  onClick={() => setConfirmRemove(false)}
                >
                  Keep
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="tile-edit-btn-text is-danger"
                data-testid="tile-icon-remove"
                disabled={iconBusy !== null}
                onClick={() => setConfirmRemove(true)}
              >
                Remove icon
              </button>
            )}
          </div>

          <div className="tile-edit-field">
            <label className="tile-edit-label" htmlFor={descId}>
              Description
            </label>
            <textarea
              id={descId}
              data-testid="tile-field-description"
              className="tile-edit-input tile-edit-textarea"
              value={description}
              rows={3}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {error && (
            <p className="tile-edit-error" role="alert" data-testid="tile-edit-error">
              {error}
            </p>
          )}
        </div>

        {confirmDiscard ? (
          <div key="discard" className="tile-edit-actions tile-edit-discard" data-testid="tile-discard-confirm" role="alert">
            <span className="tile-edit-discard-text">Discard changes?</span>
            <button
              type="button"
              className="tile-edit-btn tile-edit-btn-secondary"
              data-testid="tile-discard-keep"
              autoFocus
              onClick={() => setConfirmDiscard(false)}
            >
              Keep editing
            </button>
            <button
              type="button"
              className="tile-edit-btn tile-edit-btn-danger-outline"
              data-testid="tile-discard-yes"
              onClick={onClose}
            >
              Discard
            </button>
          </div>
        ) : (
          <div key="actions" className="tile-edit-actions">
            <button
              type="button"
              className="tile-edit-btn tile-edit-btn-secondary"
              data-testid="tile-edit-cancel"
              onClick={attemptDismiss}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="tile-edit-btn tile-edit-btn-primary"
              data-testid="tile-edit-save"
              disabled={busy}
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
