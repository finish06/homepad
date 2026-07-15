import { useEffect, useRef, useState } from 'react';
import {
  adminEnvConfig,
  createLibraryApp,
  deleteLibraryApp,
  listLibrary,
  setLibraryOrder,
  updateLibraryApp,
  type EnvConfigEntry,
  type LibraryAppInput,
  type LibraryOffer,
  type SystemConfig,
} from './api';

// v9.3 §7.3 — the admin Settings surface. A modal extending the v6/v7 settings
// area with (admin-only) App Library management + a READ-ONLY System settings
// panel (OIDC + self-registration, D7). CLIENT-SIDE only over /api/library*;
// system values are surfaced from what the client can see (authConfig), since
// there is no GET /api/admin/settings yet — the env values are noted as such.

export default function SettingsPanel({
  isAdmin,
  showUptimeDisplay,
  onSaveSettings,
  onClose,
}: {
  isAdmin: boolean;
  showUptimeDisplay: boolean;
  onSaveSettings: (patch: Partial<SystemConfig>) => Promise<void>;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
      opener?.focus?.();
    };
  }, []);

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  }

  return (
    <div
      data-testid="settings-overlay"
      className="launcher-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        data-testid="settings-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Admin Panel"
        className="launcher-panel library-panel"
        onKeyDown={onKeyDown}
      >
        <div className="library-head">
          {/* v11 §4.2 D3 — "Admin Panel" (not "Settings") + a global-scope
              subtitle: the first thing an admin reads on open. */}
          <div className="settings-admin-title-group">
            <h2 className="library-title">Admin Panel</h2>
            <p className="settings-admin-subtitle">
              Changes here are global — they affect all users on this homepad.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            data-testid="settings-close"
            aria-label="Close admin panel"
            onClick={onClose}
            className="launcher-clear library-close"
          >
            ✕
          </button>
        </div>

        <div className="launcher-results settings-body">
          {!isAdmin ? (
            <p className="settings-note">
              Your apps and categories are managed right on your dashboard. Use
              the “Add apps” button to browse the App Library.
            </p>
          ) : (
            <>
              <SystemSettings
                showUptimeDisplay={showUptimeDisplay}
                onSaveSettings={onSaveSettings}
              />
              <LibraryManager />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// SPEC-v26 §8.1 — friendly labels for the allowlisted env vars. The raw var name
// is always shown too (mono sub-label); this is just the human-readable primary.
// A key with no entry falls back to rendering the raw key as its own label.
const ENV_LABELS: Record<string, string> = {
  GATUS_BASE_URL: 'Gatus base URL',
  COOKIE_SECURE: 'Secure cookies',
  HOMEPAD_REGISTRATION: 'Registration mode',
  PORT: 'Server port',
  OIDC_ENABLED: 'OIDC sign-in',
  OIDC_ISSUER: 'OIDC issuer',
  OIDC_DISCOVERY_URL: 'OIDC discovery URL',
  OIDC_REDIRECT_URL: 'OIDC redirect URL',
  OIDC_CLIENT_ID: 'OIDC client ID',
  OIDC_ADMIN_GROUP: 'OIDC admin group',
};

const SERVER_KEYS = new Set(['GATUS_BASE_URL', 'COOKIE_SECURE', 'HOMEPAD_REGISTRATION', 'PORT']);

// SPEC-v26 §8.5 — presentation-only grouping derived by walking the ordered API
// array; a caption is emitted whenever the group changes. Any future allowlisted
// key with no home falls into "Other" rather than crashing or being dropped.
function groupFor(key: string): string {
  if (SERVER_KEYS.has(key)) return 'Server';
  if (key.startsWith('OIDC_')) return 'Identity (OIDC)';
  return 'Other';
}

type EnvLoad = 'loading' | 'ready' | 'error';

// System settings. The first row is the WRITABLE "Show uptime display" toggle
// (cap6); below it, SPEC-v26 replaces the two old hardcoded OIDC/registration
// rows with a live read-only table of the allowlisted runtime env vars fetched
// from GET /api/admin/env-config, grouped into Server / Identity (OIDC) (§8).
function SystemSettings({
  showUptimeDisplay,
  onSaveSettings,
}: {
  showUptimeDisplay: boolean;
  onSaveSettings: (patch: Partial<SystemConfig>) => Promise<void>;
}) {
  const [entries, setEntries] = useState<EnvConfigEntry[]>([]);
  const [state, setState] = useState<EnvLoad>('loading');

  // AC-010/AC-017 — fetch once on mount (i.e. when the admin opens the panel);
  // no polling, no refetch. A page reload is the refresh path (§8.4).
  useEffect(() => {
    let live = true;
    adminEnvConfig()
      .then((rows) => { if (live) { setEntries(rows); setState('ready'); } })
      .catch(() => { if (live) setState('error'); });
    return () => { live = false; };
  }, []);

  return (
    <section data-testid="settings-system" aria-labelledby="settings-system-h" className="settings-section">
      <h3 id="settings-system-h" className="settings-section-title">
        System
      </h3>
      {/* The note no longer claims the whole section is read-only; the [env]
          badges carry that signal per-row, leaving the toggle correctly writable. */}
      <p className="settings-section-note">
        These settings apply globally to all accounts. Rows marked{' '}
        <span className="settings-env-badge" aria-hidden="true">env</span> are
        read-only — set via environment variables and redeploy.
      </p>
      <dl className="settings-kv" data-testid="settings-env-list" aria-busy={state === 'loading'}>
        <UptimeToggleRow value={showUptimeDisplay} onSave={onSaveSettings} />
        {state === 'loading' && <EnvConfigSkeleton />}
        {state === 'error' && <EnvConfigError />}
        {state === 'ready' && <EnvConfigRows entries={entries} />}
      </dl>
    </section>
  );
}

// §8.3 — skeleton rows keep the layout height stable while the fetch is in
// flight; the shimmer is CSS-gated on prefers-reduced-motion. A visually-hidden
// role="status" gives AT the cue the aria-hidden skeletons can't.
function EnvConfigSkeleton() {
  return (
    <>
      <span className="sr-only" role="status">Loading server configuration…</span>
      {[0, 1, 2].map((i) => (
        <div key={i} className="settings-kv-row settings-kv-row--env settings-kv-skeleton" aria-hidden="true">
          <dt><span className="settings-skeleton-bar settings-skeleton-bar--dt" /></dt>
          <dd><span className="settings-skeleton-bar settings-skeleton-bar--dd" /></dd>
        </div>
      ))}
    </>
  );
}

// §8.4 — in-place error where the rows would render; the uptime toggle above
// stays live. Reload-guided copy (no retry button, per AC-017). A bare div child
// of the <dl> (no dt/dd) keeps the list semantics clean.
function EnvConfigError() {
  return (
    <div className="settings-env-error-cell" data-testid="settings-env-error">
      <span className="settings-error" role="alert">Couldn't load server configuration.</span>
      <span className="settings-env-error-hint">Reload the page to try again.</span>
    </div>
  );
}

// §8.1/§8.2/§8.5/§8.8 — the grouped read-only rows. Walks the ordered array,
// emitting a full-width group caption whenever the group changes. Captions and
// rows are flattened as direct children of the parent <dl> to keep the list
// structure valid (div-wrapped dt/dd groups).
function EnvConfigRows({ entries }: { entries: EnvConfigEntry[] }) {
  let lastGroup = '';
  const nodes: React.ReactNode[] = [];
  for (const e of entries) {
    const group = groupFor(e.key);
    if (group !== lastGroup) {
      // A div-wrapped dt/dd group keeps the <dl> structure valid; the caption is
      // the term, the empty dd is a decorative definition (§8.5: captions are
      // presentation-only, the dt/dd rows below carry the real semantics).
      nodes.push(
        <div key={`cap-${group}`} className="settings-kv-group-row">
          <dt className="settings-kv-group-label">{group}</dt>
          <dd className="settings-kv-group-dd" aria-hidden="true" />
        </div>,
      );
      lastGroup = group;
    }
    nodes.push(
      <div key={e.key} className="settings-kv-row settings-kv-row--env" data-testid={`env-row-${e.key}`}>
        <dt>
          <span className="settings-kv-label">{ENV_LABELS[e.key] ?? e.key}</span>
          <code className="settings-kv-var">{e.key}</code>
        </dt>
        <dd>
          {e.value === '' ? (
            <>
              <span className="settings-kv-value settings-kv-value--empty" aria-hidden="true">—</span>
              <span className="sr-only">not set</span>
            </>
          ) : (
            <span className="settings-kv-value">{e.value}</span>
          )}
          <span className="settings-env-badge" aria-hidden="true">env</span>
        </dd>
      </div>,
    );
  }
  return <>{nodes}</>;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

// UptimeToggleRow — the writable pill switch (§9.1). It moves the thumb
// optimistically on click, PATCHes via onSave, then shows a transient "Saved ✓"
// (~1.6s) or reverts to the persisted value on error (§9.2). role="switch" +
// aria-checked keep the state truthful to what is actually persisted.
function UptimeToggleRow({
  value,
  onSave,
}: {
  value: boolean;
  onSave: (patch: Partial<SystemConfig>) => Promise<void>;
}) {
  const [optimistic, setOptimistic] = useState(value);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the control in sync with the persisted prop when it changes elsewhere.
  useEffect(() => setOptimistic(value), [value]);
  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current); }, []);

  async function toggle() {
    if (saveState === 'saving') return;
    const next = !optimistic;
    setOptimistic(next); // optimistic thumb move (§9.6)
    setSaveState('saving');
    try {
      await onSave({ showUptimeDisplay: next });
      setSaveState('saved');
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaveState('idle'), 1600);
    } catch {
      setOptimistic(value); // revert to the last persisted value
      setSaveState('error');
    }
  }

  const flag =
    saveState === 'saving' ? 'Saving…' :
    saveState === 'saved' ? 'Saved ✓' :
    saveState === 'error' ? "Couldn't save — try again." : '';

  return (
    <div className="settings-kv-row settings-kv-row--control">
      <dt id="uptime-toggle-label">Show uptime display</dt>
      <dd>
        <span className="settings-save-flag" role="status" aria-live="polite" data-state={saveState}>
          {flag}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={optimistic}
          aria-labelledby="uptime-toggle-label"
          aria-busy={saveState === 'saving'}
          disabled={saveState === 'saving'}
          className="settings-switch"
          data-testid="settings-switch-uptime"
          onClick={toggle}
        >
          <span className="settings-switch-thumb" aria-hidden="true" />
        </button>
      </dd>
    </div>
  );
}

const EMPTY_INPUT: LibraryAppInput = {
  name: '',
  url: '',
  icon: '',
  description: '',
  suggestedCategory: '',
};

// Admin App Library management — list / create / edit (all fields) / reorder /
// delete offers over /api/library*. Mutations reflect locally without a refetch.
function LibraryManager() {
  const [offers, setOffers] = useState<LibraryOffer[]>([]);
  const [draft, setDraft] = useState<LibraryAppInput>(EMPTY_INPUT);
  const [error, setError] = useState<string | null>(null);
  // #92 — the "Add offer" creation form is no longer inline; it opens in its
  // own modal surface so it isn't cramped at the top of the scrollable panel.
  const [adding, setAdding] = useState(false);
  // The id pending a delete confirmation, and the id being inline-edited.
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<LibraryAppInput>(EMPTY_INPUT);

  useEffect(() => {
    listLibrary().then(setOffers);
  }, []);

  function openAdd() {
    setError(null);
    setDraft(EMPTY_INPUT);
    setAdding(true);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const r = await createLibraryApp(draft);
    if (!r.ok || !r.offer) {
      setError(r.error ?? 'could not add offer');
      return;
    }
    setOffers((prev) => [...prev, r.offer!]);
    setDraft(EMPTY_INPUT);
    setAdding(false);
  }

  function startEdit(o: LibraryOffer) {
    setEditId(o.id);
    setEditDraft({
      name: o.name,
      url: o.url,
      icon: o.icon,
      description: o.description,
      suggestedCategory: o.suggestedCategory,
    });
  }

  async function saveEdit(id: string) {
    setError(null);
    const r = await updateLibraryApp(id, editDraft);
    if (!r.ok || !r.offer) {
      setError(r.error ?? 'could not save offer');
      return;
    }
    setOffers((prev) => prev.map((o) => (o.id === id ? r.offer! : o)));
    setEditId(null);
  }

  async function remove(id: string) {
    setConfirmId(null);
    const prev = offers;
    setOffers((cur) => cur.filter((o) => o.id !== id)); // optimistic
    const ok = await deleteLibraryApp(id);
    if (!ok) setOffers(prev); // roll back
  }

  async function move(id: string, dir: -1 | 1) {
    const i = offers.findIndex((o) => o.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= offers.length) return;
    const next = offers.slice();
    [next[i], next[j]] = [next[j], next[i]];
    const prev = offers;
    setOffers(next); // optimistic
    const ok = await setLibraryOrder(next.map((o) => o.id));
    if (!ok) setOffers(prev); // roll back
  }

  return (
    <section data-testid="settings-library" aria-labelledby="settings-library-h" className="settings-section">
      <h3 id="settings-library-h" className="settings-section-title">
        App Library
      </h3>
      <p className="settings-section-note">
        Shared catalog — all users see these offers in “Add apps.” Editing or
        deleting an offer never touches copies users already added to their
        personal dashboards.
      </p>

      {error && (
        <p data-testid="library-manage-error" role="alert" className="settings-error">
          {error}
        </p>
      )}

      <button
        type="button"
        data-testid="library-add-open"
        onClick={openAdd}
        className="library-add settings-add-offer-trigger"
      >
        + Add offer
      </button>

      {adding && (
        <AddOfferModal
          draft={draft}
          setDraft={setDraft}
          error={error}
          onSubmit={create}
          onClose={() => setAdding(false)}
        />
      )}

      <ul className="settings-list" aria-label="Library offers">
        {offers.map((o, i) => (
          <li key={o.id} data-testid="library-manage-row" data-library-id={o.id} className="settings-row">
            {editId === o.id ? (
              <div className="library-edit">
                <input
                  data-testid={`library-edit-name-${o.id}`}
                  value={editDraft.name}
                  onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                  aria-label="Offer name"
                  className="settings-input"
                />
                <input
                  data-testid={`library-edit-url-${o.id}`}
                  value={editDraft.url}
                  onChange={(e) => setEditDraft({ ...editDraft, url: e.target.value })}
                  aria-label="Offer URL"
                  className="settings-input"
                />
                <input
                  data-testid={`library-edit-category-${o.id}`}
                  value={editDraft.suggestedCategory}
                  onChange={(e) => setEditDraft({ ...editDraft, suggestedCategory: e.target.value })}
                  aria-label="Offer suggested category"
                  className="settings-input"
                />
                <button
                  type="button"
                  data-testid={`library-edit-save-${o.id}`}
                  onClick={() => saveEdit(o.id)}
                  className="library-add"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditId(null)}
                  className="settings-ghost-btn"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <span className="settings-row-name">{o.name}</span>
                {o.suggestedCategory && <span className="library-chip">{o.suggestedCategory}</span>}
                <span className="settings-row-actions">
                  <button
                    type="button"
                    data-testid={`library-move-up-${o.id}`}
                    aria-label={`Move ${o.name} up`}
                    disabled={i === 0}
                    onClick={() => move(o.id, -1)}
                    className="settings-icon-btn"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    data-testid={`library-move-down-${o.id}`}
                    aria-label={`Move ${o.name} down`}
                    disabled={i === offers.length - 1}
                    onClick={() => move(o.id, 1)}
                    className="settings-icon-btn"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    data-testid={`library-edit-${o.id}`}
                    aria-label={`Edit ${o.name}`}
                    onClick={() => startEdit(o)}
                    className="settings-ghost-btn"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    data-testid={`library-delete-${o.id}`}
                    aria-label={`Delete ${o.name}`}
                    onClick={() => setConfirmId(o.id)}
                    className="settings-ghost-btn settings-danger"
                  >
                    Delete
                  </button>
                </span>
              </>
            )}

            {confirmId === o.id && (
              <div data-testid="library-delete-confirm" role="alertdialog" aria-label={`Delete ${o.name}`} className="settings-confirm">
                <p>
                  Delete <strong>{o.name}</strong> from the library? Existing users
                  keep their copies — only the offer is removed.
                </p>
                <div className="settings-confirm-actions">
                  <button
                    type="button"
                    data-testid="library-delete-confirm-yes"
                    onClick={() => remove(o.id)}
                    className="library-add settings-danger-btn"
                  >
                    Delete offer
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmId(null)}
                    className="settings-ghost-btn"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// #92 — the "Add offer" creation form on its own modal surface. Stacked, labeled
// fields with room to breathe, layered above the Admin Panel (own scrim + higher
// z-index). Escape / scrim-click / Cancel dismiss without creating; Escape stops
// propagating so it dismisses only this modal, not the panel beneath it.
function AddOfferModal({
  draft,
  setDraft,
  error,
  onSubmit,
  onClose,
}: {
  draft: LibraryAppInput;
  setDraft: (d: LibraryAppInput) => void;
  error: string | null;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}) {
  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  return (
    <div
      data-testid="add-offer-overlay"
      className="launcher-overlay add-offer-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label="Add offer"
        className="add-offer-panel"
        onSubmit={onSubmit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <h3 className="add-offer-title">Add offer</h3>
        <p className="settings-section-note add-offer-note">
          Adds a new app to the shared library — every user sees it in “Add apps.”
        </p>

        <label className="add-offer-field">
          <span className="add-offer-label">Name</span>
          <input
            ref={firstRef}
            data-testid="library-new-name"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Plex"
            className="settings-input"
          />
        </label>

        <label className="add-offer-field">
          <span className="add-offer-label">URL</span>
          <input
            data-testid="library-new-url"
            value={draft.url}
            onChange={(e) => setDraft({ ...draft, url: e.target.value })}
            placeholder="https://plex.example.com"
            className="settings-input"
          />
        </label>

        <label className="add-offer-field">
          <span className="add-offer-label">
            Suggested category <span className="add-offer-optional">(optional)</span>
          </span>
          <input
            data-testid="library-new-category"
            value={draft.suggestedCategory}
            onChange={(e) => setDraft({ ...draft, suggestedCategory: e.target.value })}
            placeholder="Media"
            className="settings-input"
          />
        </label>

        {error && (
          <p data-testid="add-offer-error" role="alert" className="settings-error">
            {error}
          </p>
        )}

        <div className="add-offer-actions">
          <button type="submit" data-testid="library-new-submit" className="library-add">
            Add offer
          </button>
          <button
            type="button"
            data-testid="library-new-cancel"
            onClick={onClose}
            className="settings-ghost-btn"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
