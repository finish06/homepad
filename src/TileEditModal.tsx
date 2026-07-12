import { useEffect, useId, useRef, useState } from 'react';
import {
  deleteIcon,
  fetchIcon,
  updateService,
  uploadIcon,
  type Category,
  type ClickAction,
  type IconVariant,
  type Service,
} from './api';
import { iconSrc, initialBadge, validateIconFile } from './icons';

// v23 §4.2 — the per-option hint shown under the click-action selector.
const CLICK_ACTION_HINT: Record<ClickAction, string> = {
  new_tab: 'Opens in a new browser tab (default).',
  same_tab: 'Navigates this tab to the service.',
  iframe: 'Embeds the service in an overlay panel.',
};

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
  onClose,
  onPatch,
  onToast,
}: {
  service: Service;
  categories: Category[];
  // v22 — the icon preview now resolves the ACTIVE TAB's variant, not the app
  // theme, so `theme` is no longer read here; kept on the props for callers.
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
  // v23 — the tile's click behavior. Absent on a pre-migration service reads as
  // 'new_tab' (AC-002/014), so the control opens on New tab for those too.
  const [clickAction, setClickAction] = useState<ClickAction>(service.clickAction ?? 'new_tab');
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
  // v22 §5.1 — the active icon theme tab. ALWAYS opens on 'light' (AC-007),
  // regardless of the app theme or which variant(s) exist.
  const [activeTab, setActiveTab] = useState<IconVariant>('light');

  const headingId = useId();
  const titleId = useId();
  const urlId = useId();
  const clickActionId = useId();
  const catId = useId();
  const iconUrlId = useId();
  const descId = useId();
  const lightTabId = useId();
  const darkTabId = useId();
  const iconPanelId = useId();

  const titleRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLFormElement>(null);
  // One hidden file input, retargeted to the active tab's variant (§5.2).
  const iconInputRef = useRef<HTMLInputElement>(null);
  const lightTabRef = useRef<HTMLButtonElement>(null);
  const darkTabRef = useRef<HTMLButtonElement>(null);
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  const removeKeepRef = useRef<HTMLButtonElement>(null);

  // §8.2 note — open focus lands on Title (the field most often edited), not the
  // literal first focusable node (the ✕).
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  // #321 (§8.4) — when the discard strip appears, focus its safe default ("Keep
  // editing") imperatively rather than via declarative autoFocus. The distinct
  // row keys (below) already remount the strip so the save-bug morph (#322) can't
  // happen; focusing by ref keeps focus management explicit and off the
  // autoFocus-on-remount timing the #322 issue implicated.
  useEffect(() => {
    if (confirmDiscard) keepEditingRef.current?.focus();
  }, [confirmDiscard]);

  // §8.5 — the remove confirm strip focuses its safe default ("Keep"), matching
  // the discard-strip pattern above (imperative, not autoFocus — the #322 morph).
  useEffect(() => {
    if (confirmRemove) removeKeepRef.current?.focus();
  }, [confirmRemove]);

  // Dirtiness = any text field / category / Icon URL differing from its prefill.
  // Immediate icon PNG upload / Remove are NOT part of dirty tracking (§8.4).
  const dirty =
    title !== service.name ||
    url !== service.url ||
    description !== service.description ||
    iconUrl !== service.icon ||
    categoryId !== (service.categoryId ?? '') ||
    clickAction !== (service.clickAction ?? 'new_tab');

  const previewSvc: Service = { ...service, name: title, icon: iconUrl, iconLight, iconDark };
  // v22 §5.4 — the preview resolves the ACTIVE TAB's variant, not the app theme;
  // switching tabs shows that variant's icon (or its honest fallback).
  const previewSrc = iconSrc(previewSvc, activeTab, rev);

  // Per-tab icon state (§8.3) — which of the three designed states this tab is in.
  const hasVariant = activeTab === 'light' ? iconLight : iconDark;
  const otherVariant = activeTab === 'light' ? iconDark : iconLight;
  const hasUrl = iconUrl.trim() !== '';
  // State 3 (§8.3): truly empty — no PNG for this variant, no other variant, no
  // URL. Shows the explicit "No icon set" affordance instead of an initials badge
  // that would misleadingly read as "an icon is configured".
  const iconEmpty = !hasVariant && !otherVariant && !hasUrl;
  // State 2 (§8.3): this variant has no PNG but something else resolves — show the
  // resolved fallback at reduced emphasis with an honest note about what renders.
  const inheritNote = !hasVariant
    ? otherVariant
      ? `No ${activeTab} PNG — showing the ${activeTab === 'light' ? 'dark' : 'light'} icon.`
      : hasUrl
        ? 'No PNG for this mode — showing the URL fallback.'
        : ''
    : '';

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
    // v23 — include click_action only when it changed (no-op patches avoided, §4.3).
    if (clickAction !== (service.clickAction ?? 'new_tab')) patch.clickAction = clickAction;

    const r = await updateService(service.id, patch);
    setBusy(false);
    if (!r.ok || !r.service) {
      const msg = r.error ?? 'Could not save changes.';
      setError(msg);
      onToast(msg, 'error');
      return;
    }
    const categoryName = categoryId ? categories.find((c) => c.id === categoryId)?.name ?? null : null;
    // #342 — reflect the click_action the SERVER actually persisted, not the
    // optimistic local selection. If a backend silently drops it (e.g. one that
    // predates the click_action column), the tile shows the un-persisted value
    // immediately instead of a false success that reverts on the next reload.
    onPatch({
      name: title.trim(),
      url: url.trim(),
      description,
      icon: iconUrl,
      categoryId: categoryId || null,
      categoryName,
      clickAction: r.service.clickAction,
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

  // v22 §5.2 / AC-004 — remove ONLY the active tab's variant. The other variant
  // and the shared URL are left intact; iconSrc() naturally falls back to them.
  async function doRemove(variant: IconVariant) {
    setConfirmRemove(false);
    setIconError('');
    setIconBusy('upload');
    await deleteIcon(service.id, variant);
    setIconBusy(null);
    if (variant === 'light') setIconLight(false);
    else setIconDark(false);
    setRev((v) => v + 1);
    onPatch(variant === 'light' ? { iconLight: false } : { iconDark: false });
  }

  // v22 §6.4 / §8.6 — fetch the favicon into the ACTIVE tab's variant. The
  // backend downloads from the service's own registered URL and stores under
  // ?variant=. NOTE: the per-variant store depends on the backend honouring the
  // variant param (companion homepad-api change); a pre-v22 backend defaults to
  // 'light' (see api.fetchIcon).
  async function doFetch(variant: IconVariant) {
    if (!url.trim() || iconBusy) return;
    setIconError('');
    setIconBusy('fetch');
    const r = await fetchIcon(service.id, variant);
    setIconBusy(null);
    if (!r.ok) {
      setIconError(r.error ?? "Couldn't fetch a favicon from this URL.");
      return;
    }
    if (variant === 'light') setIconLight(true);
    else setIconDark(true);
    setRev((v) => v + 1);
    onPatch(variant === 'light' ? { iconLight: true } : { iconDark: true });
  }

  // Switching tabs is a pure UI state change (AC-006) — it fires no network and
  // discards no pending edits. It resets the per-tab confirm/error so a strip
  // opened on one variant never bleeds into the other (§5.4).
  function selectTab(variant: IconVariant) {
    setActiveTab(variant);
    setConfirmRemove(false);
    setIconError('');
  }

  // §6.2 — automatic-activation tabs: ← / → move focus AND activate. With two
  // mutually-exclusive tabs both arrows just toggle to the other (wrap both ways).
  function onTabKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next: IconVariant = activeTab === 'light' ? 'dark' : 'light';
    selectTab(next);
    (next === 'light' ? lightTabRef : darkTabRef).current?.focus();
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

          {/* v23 §4 — click-action selector, URL-adjacent because it controls how
              the URL is navigated. A <select> (Kare §8 pending; matches the
              Category control already here). The selected option's hint shows
              below, plus the honest embed caveat when Inline overlay is chosen. */}
          <div className="tile-edit-field">
            <label className="tile-edit-label" htmlFor={clickActionId}>
              Click action
            </label>
            <select
              id={clickActionId}
              data-testid="tile-field-click-action"
              className="tile-edit-input tile-edit-select"
              value={clickAction}
              onChange={(e) => setClickAction(e.target.value as ClickAction)}
            >
              <option value="new_tab">New tab</option>
              <option value="same_tab">Same tab</option>
              <option value="iframe">Inline overlay</option>
            </select>
            <p className="tile-edit-help" data-testid="tile-click-action-hint">
              {CLICK_ACTION_HINT[clickAction]}
            </p>
            {clickAction === 'iframe' && (
              <p className="tile-edit-help tile-click-action-caveat" data-testid="tile-click-action-caveat">
                Some sites block embedding — a fallback link appears if that happens.
              </p>
            )}
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

          {/* Icon compound panel (v22 §8). The flat v21 panel is reorganised into
              a two-tab ARIA tablist (Light/Dark) → per-variant tabpanel → shared
              URL fallback below a divider. Same variant-specific endpoints, no
              schema change. Layout/44px/paint are re-verified in the CDP gate. */}
          <div className="tile-icon-panel" data-testid="tile-icon-panel">
            {/* §8.1 — a segmented control that is still a WAI-ARIA tablist: the
                roles are independent of the visual treatment (automatic-activation,
                arrow-key nav). */}
            <div
              className="tile-icon-tabs"
              role="tablist"
              aria-label="Icon theme"
              data-testid="tile-icon-tablist"
              onKeyDown={onTabKeyDown}
            >
              <button
                ref={lightTabRef}
                type="button"
                role="tab"
                id={lightTabId}
                aria-selected={activeTab === 'light'}
                aria-controls={iconPanelId}
                tabIndex={activeTab === 'light' ? 0 : -1}
                className={`tile-icon-tab${activeTab === 'light' ? ' is-active' : ''}`}
                data-testid="tile-icon-tab-light"
                onClick={() => selectTab('light')}
              >
                <span className="tile-icon-tab-dot" aria-hidden="true" />
                Light Mode
              </button>
              <button
                ref={darkTabRef}
                type="button"
                role="tab"
                id={darkTabId}
                aria-selected={activeTab === 'dark'}
                aria-controls={iconPanelId}
                tabIndex={activeTab === 'dark' ? 0 : -1}
                className={`tile-icon-tab${activeTab === 'dark' ? ' is-active' : ''}`}
                data-testid="tile-icon-tab-dark"
                onClick={() => selectTab('dark')}
              >
                <span className="tile-icon-tab-dot" aria-hidden="true" />
                Dark Mode
              </button>
            </div>

            {/* §8.2–8.3 — one tabpanel that swaps to the active variant. */}
            <div
              className="tile-icon-tabpanel"
              role="tabpanel"
              id={iconPanelId}
              aria-labelledby={activeTab === 'light' ? lightTabId : darkTabId}
              data-testid="tile-icon-tabpanel"
            >
              <div className="tile-icon-row">
                {iconEmpty ? (
                  // §8.3 state 3 — explicit empty state, NOT a bare initials badge.
                  <span className="tile-icon-preview is-empty" data-testid="tile-icon-empty">
                    <span className="tile-icon-empty-glyph" aria-hidden="true">
                      ▢
                    </span>
                    <span className="tile-icon-empty-label">No icon set</span>
                  </span>
                ) : (
                  <span
                    className={`tile-icon-preview${iconBusy ? ' is-busy' : ''}${inheritNote ? ' is-inherited' : ''}`}
                    data-testid="tile-icon-preview-box"
                  >
                    <img
                      src={previewSrc}
                      alt={activeTab === 'light' ? 'Light-mode icon preview' : 'Dark-mode icon preview'}
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
                )}

                <div className="tile-icon-controls">
                  <button
                    type="button"
                    className="tile-edit-btn tile-edit-btn-secondary"
                    data-testid="tile-icon-upload"
                    disabled={iconBusy !== null}
                    onClick={() => iconInputRef.current?.click()}
                  >
                    Upload PNG
                  </button>
                  <button
                    type="button"
                    className="tile-edit-btn tile-edit-btn-ghost"
                    data-testid="tile-icon-fetch"
                    disabled={!url.trim() || iconBusy !== null}
                    aria-disabled={!url.trim() || undefined}
                    title={!url.trim() ? 'Enter a URL first' : undefined}
                    onClick={() => doFetch(activeTab)}
                  >
                    ⭳ Fetch from URL
                  </button>
                  {confirmRemove ? (
                    // §8.5 — inline, variant-specific confirm; Keep is the focused
                    // safe default. Never native confirm().
                    <div
                      className="tile-icon-remove-confirm"
                      role="alert"
                      data-testid="tile-icon-remove-confirm"
                    >
                      <span className="tile-edit-help">Remove {activeTab} icon?</span>
                      <button
                        ref={removeKeepRef}
                        type="button"
                        className="tile-edit-btn-text"
                        data-testid="tile-icon-remove-no"
                        onClick={() => setConfirmRemove(false)}
                      >
                        Keep
                      </button>
                      <button
                        type="button"
                        className="tile-edit-btn-text is-danger"
                        data-testid="tile-icon-remove-yes"
                        onClick={() => doRemove(activeTab)}
                      >
                        Remove
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
                      Remove {activeTab} icon
                    </button>
                  )}
                </div>

                {/* One CSS-hidden file input, retargeted to the active tab's
                    variant; the visible Upload PNG button forwards activation so
                    keyboard users are covered (§6.4). Out of the tab order. */}
                <input
                  ref={iconInputRef}
                  data-testid="tile-icon-upload-input"
                  className="sr-only"
                  type="file"
                  accept="image/png"
                  tabIndex={-1}
                  aria-hidden="true"
                  onChange={(e) => onPickIcon(activeTab, e)}
                />
              </div>

              {inheritNote && (
                <p className="tile-icon-inherit" data-testid="tile-icon-inherit-note">
                  {inheritNote}
                </p>
              )}
              {iconEmpty && (
                <p className="tile-edit-help tile-icon-empty-hint">
                  Tile will show its initials badge in {activeTab} theme.
                </p>
              )}
              {iconError && (
                <p className="tile-edit-icon-error" role="alert" data-testid="tile-icon-error">
                  {iconError}
                </p>
              )}
            </div>

            {/* §8.4 — the shared services.icon URL, OUTSIDE the tabpanel and below
                a divider so it reads as applying to BOTH modes, not to the tab. */}
            <div className="tile-edit-field tile-icon-url-field">
              <div className="tile-icon-url-labelrow">
                <label className="tile-edit-label" htmlFor={iconUrlId}>
                  URL fallback
                </label>
                <span className="tile-icon-scope-pill">both modes</span>
              </div>
              <input
                id={iconUrlId}
                data-testid="tile-field-icon-url"
                className="tile-edit-input"
                type="url"
                value={iconUrl}
                placeholder="https://cdn.example.com/icon.png"
                onChange={(e) => setIconUrl(e.target.value)}
              />
              <p className="tile-edit-help">Used when no PNG is uploaded for a mode.</p>
            </div>
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
              ref={keepEditingRef}
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
