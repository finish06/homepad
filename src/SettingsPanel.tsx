import { useEffect, useRef, useState } from 'react';
import {
  createLibraryApp,
  deleteLibraryApp,
  listLibrary,
  setLibraryOrder,
  updateLibraryApp,
  type LibraryAppInput,
  type LibraryOffer,
} from './api';

// v9.3 §7.3 — the admin Settings surface. A modal extending the v6/v7 settings
// area with (admin-only) App Library management + a READ-ONLY System settings
// panel (OIDC + self-registration, D7). CLIENT-SIDE only over /api/library*;
// system values are surfaced from what the client can see (authConfig), since
// there is no GET /api/admin/settings yet — the env values are noted as such.

export default function SettingsPanel({
  isAdmin,
  oidcEnabled,
  onClose,
}: {
  isAdmin: boolean;
  oidcEnabled: boolean;
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
            aria-label="Close settings"
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
              <SystemSettings oidcEnabled={oidcEnabled} />
              <LibraryManager />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Read-only system settings (D7). OIDC comes from the client-visible auth config;
// self-registration is env-driven and not exposed to the client, so it is shown
// as env-managed. Both carry the "set via environment / redeploy" note.
function SystemSettings({ oidcEnabled }: { oidcEnabled: boolean }) {
  return (
    <section data-testid="settings-system" aria-labelledby="settings-system-h" className="settings-section">
      <h3 id="settings-system-h" className="settings-section-title">
        System
      </h3>
      <p className="settings-section-note">
        Read-only — set via environment variables and redeploy. These settings
        apply globally to all accounts.
      </p>
      <dl className="settings-kv">
        <div className="settings-kv-row">
          <dt>OIDC sign-in</dt>
          <dd>{oidcEnabled ? 'Enabled' : 'Disabled'}</dd>
        </div>
        <div className="settings-kv-row">
          <dt>Self-registration</dt>
          <dd>Managed via environment (HOMEPAD_REGISTRATION)</dd>
        </div>
      </dl>
    </section>
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
  // The id pending a delete confirmation, and the id being inline-edited.
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<LibraryAppInput>(EMPTY_INPUT);

  useEffect(() => {
    listLibrary().then(setOffers);
  }, []);

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

      <form onSubmit={create} className="library-new">
        <input
          data-testid="library-new-name"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="Name"
          aria-label="New offer name"
          className="settings-input"
        />
        <input
          data-testid="library-new-url"
          value={draft.url}
          onChange={(e) => setDraft({ ...draft, url: e.target.value })}
          placeholder="URL"
          aria-label="New offer URL"
          className="settings-input"
        />
        <input
          data-testid="library-new-category"
          value={draft.suggestedCategory}
          onChange={(e) => setDraft({ ...draft, suggestedCategory: e.target.value })}
          placeholder="Suggested category (optional)"
          aria-label="New offer suggested category"
          className="settings-input"
        />
        <button type="submit" data-testid="library-new-submit" className="library-add">
          Add offer
        </button>
      </form>

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
