import Modal from '../ui/Modal';
import { useEffect, useRef, useState } from 'react';
import TileDensityToggle from '../grid/TileDensityToggle';
import AccountsSection from '../accounts/AccountsSection';
import ChangePassword from './ChangePassword';
import BackupSection from './backup/BackupSection';
import WidgetsSettings from '../widgets/WidgetsSettings';
import type { TileDensity } from '../grid/tileDensity';
import SystemSettings from './SystemSettings';
import SettingsDialog from './SettingsDialog';
import type { ServerSettings } from './serverSettingsApi';
import {
  createLibraryApp,
  deleteLibraryApp,
  listLibrary,
  setLibraryOrder,
  updateLibraryApp,
  type LibraryAppInput,
  type LibraryOffer,
  type SystemConfig,
} from '../api';

// v9.3 §7.3 — the admin Settings surface. A modal extending the v6/v7 settings
// area with (admin-only) App Library management + a System settings panel.
//
// #378 — the note that used to sit here said system values were inferred from
// `authConfig` "since there is no GET /api/admin/settings yet", and that the
// System panel was READ-ONLY. Both stopped being true and the comment outlived
// them by two releases:
//   - SPEC-admin-server-settings (18.1.0) made System editable: SystemSettings
//     reads GET /api/admin/server-settings and no longer calls the deprecated
//     /api/admin/env-config (Q3 A).
//   - cap6 made the "Show uptime display" row WRITABLE via
//     PATCH /api/admin/settings; it is still saved there.

// SPEC-health-bar-visibility-toggle OQ-1 (a) — the panel now has two scopes.
// `admin` is the v9.3 surface, unchanged, reached from Administration →
// "Admin settings". `personal` carries ONLY the signed-in user's own
// preferences and is reached from My Dashboard → "My settings" by every role.
// Keeping them apart is what preserves the v12 §4.1 boundary: the
// Administration shield still means "global state" and nothing else.
export type SettingsScope = 'personal' | 'admin';

// SPEC-kid-accounts UX §1 — a section the panel opens scrolled to. Only
// Accounts today, reached from Administration → "Accounts".
export type SettingsSection = 'accounts';

export default function SettingsPanel({
  isAdmin,
  scope = 'admin',
  showUptimeDisplay,
  showHealthBar,
  onSetHealthBar,
  showUptimeDisplayPref,
  onSetUptimeDisplay,
  density,
  onSetDensity,
  onSaveSettings,
  onClose,
  onServerSettingsChanged,
  currentUserId,
  initialSection,
  onCatalogChanged,
  showWidgets = true,
  onSetShowWidgets,
  onWidgetsChanged,
  email = '',
  hasPassword = false,
}: {
  isAdmin: boolean;
  scope?: SettingsScope;
  // SPEC-kid-accounts — who is signed in (the Accounts list marks them "you"),
  // and the section to open scrolled to.
  currentUserId?: string;
  initialSection?: SettingsSection;
  // SPEC-backup-import — a restore or an import changed the catalog, so the
  // dashboard behind the panel should refetch.
  onCatalogChanged?: () => void;
  showUptimeDisplay: boolean;
  // SPEC-admin-server-settings §8 — a server setting was saved or reset. App
  // re-reads what it shows from it (the "Slow" threshold on tiles).
  onServerSettingsChanged?: (next: ServerSettings) => void;
  showHealthBar: boolean;
  onSetHealthBar: (show: boolean) => void;
  showUptimeDisplayPref: boolean;
  onSetUptimeDisplay: (show: boolean) => void;
  // SPEC-density-to-my-settings — density joins the per-user preferences here.
  density: TileDensity;
  onSetDensity: (d: TileDensity) => void;
  onSaveSettings: (patch: Partial<SystemConfig>) => Promise<void>;
  onClose: () => void;
  // SPEC-status-widgets AC-031 — My settings → Show widgets. No setter, no row:
  // a kid has no switch. onWidgetsChanged lets the dashboard re-read the info
  // widgets after an Admin Panel change.
  showWidgets?: boolean;
  onSetShowWidgets?: (show: boolean) => void;
  onWidgetsChanged?: () => void;
  // SPEC-password-reset-link AC-020 — My settings → Password shows only for an
  // adult with a local password (GET /api/me hasPassword). The email fills the
  // form's hidden username field for password managers.
  email?: string;
  hasPassword?: boolean;
}) {
  const personal = scope === 'personal';
  // SPEC-backup-import — bumped after a restore or an import, so the App Library
  // and Accounts sections below remount and reload what the apply changed.
  const [catalogVersion, setCatalogVersion] = useState(0);
  // SPEC-admin-server-settings UX §7 — unsaved Sign-in changes make leaving ask.
  const [signinDirty, setSigninDirty] = useState(0);
  const [askDiscard, setAskDiscard] = useState(false);
  // §8 — bumped when Sign-up or Single sign-on changed, so Accounts re-reads
  // the auth config (its open sign-up warning, the PocketID line) in place.
  const [authVersion, setAuthVersion] = useState(0);
  const requestClose = () => {
    if (signinDirty > 0) setAskDiscard(true);
    else onClose();
  };
  const onServerChanged = (next: ServerSettings, prev: ServerSettings | null) => {
    const pick = (b: ServerSettings | null, k: string) => b?.settings.find((x) => x.key === k)?.value;
    if (['HOMEPAD_REGISTRATION', 'OIDC_ENABLED'].some((k) => pick(next, k) !== pick(prev, k))) {
      setAuthVersion((v) => v + 1);
    }
    onServerSettingsChanged?.(next);
  };
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

  // Escape + scrim dismiss live in Modal. The nested AddOfferModal keeps its
  // OWN dialog-level Escape with stopPropagation, so with the inner dialog
  // focused one Escape press closes only the inner layer (the stop prevents
  // this Modal's document listener from seeing the event).
  return (
    <Modal onDismiss={askDiscard ? () => {} : requestClose} overlayClassName="launcher-overlay" overlayTestId="settings-overlay">
      <div
        ref={panelRef}
        data-testid="settings-panel"
        role="dialog"
        aria-modal="true"
        aria-label={personal ? 'My settings' : 'Admin Panel'}
        className="launcher-panel library-panel"
      >
        <div className="library-head">
          {/* v11 §4.2 D3 — "Admin Panel" (not "Settings") + a global-scope
              subtitle: the first thing an admin reads on open. */}
          <div className="settings-admin-title-group">
            <h2 className="library-title">{personal ? 'My settings' : 'Admin Panel'}</h2>
            <p className="settings-admin-subtitle">
              {personal
                ? 'These apply to your dashboard only — nobody else is affected.'
                : 'Changes here are global — they affect all users on this homepad.'}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            data-testid="settings-close"
            aria-label="Close admin panel"
            onClick={requestClose}
            className="launcher-clear library-close"
          >
            ✕
          </button>
        </div>

        <div className="launcher-results settings-body">
          {personal ? (
            <>
              <PersonalSettings
                showHealthBar={showHealthBar}
                onSetHealthBar={onSetHealthBar}
                showUptimeDisplay={showUptimeDisplayPref}
                onSetUptimeDisplay={onSetUptimeDisplay}
                density={density}
                onSetDensity={onSetDensity}
                showWidgets={showWidgets}
                onSetShowWidgets={onSetShowWidgets}
              />
              {hasPassword && <ChangePassword email={email} />}
            </>
          ) : !isAdmin ? (
            <p className="settings-note">
              Your apps and categories are managed right on your dashboard. Use
              the “Add apps” button to browse the App Library.
            </p>
          ) : (
            <>
              {/* SPEC-kid-accounts K-1 — Accounts is the first section, above
                  System: global state, so it lives under the Admin Panel's
                  "affects everyone" heading rather than in a panel of its own. */}
              <AccountsSection
                key={`accounts-${catalogVersion}`}
                currentUserId={currentUserId}
                configVersion={authVersion}
                scrollIntoView={catalogVersion === 0 && initialSection === 'accounts'}
              />
              <SystemSettings
                showUptimeDisplay={showUptimeDisplay}
                onSaveSettings={onSaveSettings}
                onChanged={onServerChanged}
                onSigninDirty={setSigninDirty}
              />
              {/* SPEC-status-widgets W-3 — Widgets sits right after System. */}
              <WidgetsSettings onChanged={onWidgetsChanged} />
              <LibraryManager key={`library-${catalogVersion}`} />
              {/* SPEC-backup-import B-1 — last: used rarely, and it changes the
                  whole catalog, so it sits under the "affects everyone" heading
                  below the sections people use every week. */}
              <BackupSection
                onApplied={() => {
                  setCatalogVersion((v) => v + 1);
                  onCatalogChanged?.();
                }}
              />
            </>
          )}
        </div>
      </div>
      {askDiscard && (
        <SettingsDialog
          testId="signin-discard"
          title={`Discard ${signinDirty} ${signinDirty === 1 ? 'change' : 'changes'} to sign-in settings?`}
          paragraphs={['They are not saved yet.']}
          primary="Discard"
          cancelLabel="Keep editing"
          danger
          onCancel={() => setAskDiscard(false)}
          onConfirm={() => {
            setAskDiscard(false);
            onClose();
          }}
        />
      )}
    </Modal>
  );
}

// SPEC-health-bar-visibility-toggle §4 — the per-user section. Reuses the cap6
// switch markup and styling verbatim (role="switch" + aria-labelledby +
// .settings-switch, already a 44x44 target per v19), so this row behaves and
// measures exactly like the System toggles an admin already knows.
//
// No save flag here: unlike the cap6 System toggle, persistence is owned by the
// caller's useHealthBarPref, which is optimistic and rolls back on failure
// (AC-010). This control reports the value it is given and asks for the inverse.
function PersonalSettings({
  showHealthBar,
  onSetHealthBar,
  showUptimeDisplay,
  onSetUptimeDisplay,
  density,
  onSetDensity,
  showWidgets,
  onSetShowWidgets,
}: {
  showHealthBar: boolean;
  onSetHealthBar: (show: boolean) => void;
  showUptimeDisplay: boolean;
  onSetUptimeDisplay: (show: boolean) => void;
  density: TileDensity;
  onSetDensity: (d: TileDensity) => void;
  showWidgets: boolean;
  onSetShowWidgets?: (show: boolean) => void;
}) {
  return (
    <section
      data-testid="settings-personal"
      aria-labelledby="settings-personal-h"
      className="settings-section"
    >
      <h3 id="settings-personal-h" className="settings-section-title">
        Dashboard
      </h3>
      <p className="settings-section-note">
        These apply to your account on every device you sign in from.
      </p>
      <dl className="settings-kv">
        <div className="settings-kv-row settings-kv-row--control">
          <dt id="health-bar-toggle-label">Show status bar</dt>
          <dd>
            <button
              type="button"
              role="switch"
              aria-checked={showHealthBar}
              aria-labelledby="health-bar-toggle-label"
              className="settings-switch"
              data-testid="setting-health-bar"
              onClick={() => onSetHealthBar(!showHealthBar)}
            >
              <span className="settings-switch-thumb" aria-hidden="true" />
            </button>
          </dd>
        </div>
        {/* cap6 v2 — the per-user uptime display. Was a global admin System
            setting until v2; the admin row now only seeds NEW accounts. */}
        <div className="settings-kv-row settings-kv-row--control">
          <dt id="uptime-display-toggle-label">Show uptime display</dt>
          <dd>
            <button
              type="button"
              role="switch"
              aria-checked={showUptimeDisplay}
              aria-labelledby="uptime-display-toggle-label"
              className="settings-switch"
              data-testid="setting-uptime-display"
              onClick={() => onSetUptimeDisplay(!showUptimeDisplay)}
            >
              <span className="settings-switch-thumb" aria-hidden="true" />
            </button>
          </dd>
        </div>
        {/* SPEC-status-widgets AC-031 / UX §8 — one switch for every widget
            surface this user sees: the tile lines and the clock/weather strip. */}
        {onSetShowWidgets && (
          <div className="settings-kv-row settings-kv-row--control">
            <dt>
              <span id="show-widgets-toggle-label">Show widgets</span>
              <span className="settings-kv-help">Numbers on tiles, and the clock and weather.</span>
            </dt>
            <dd>
              <button
                type="button"
                role="switch"
                aria-checked={showWidgets}
                aria-labelledby="show-widgets-toggle-label"
                className="settings-switch"
                data-testid="setting-show-widgets"
                onClick={() => onSetShowWidgets(!showWidgets)}
              >
                <span className="settings-switch-thumb" aria-hidden="true" />
              </button>
            </dd>
          </div>
        )}
        {/* SPEC-density-to-my-settings AC-001/AC-005 — density moves here from
            the dashboard toolbar. It is the first row in this list that is NOT
            a switch: three options, so the control stays a radiogroup and is
            reused as-is rather than restyled into something binary. The <dt>
            is decorative here (aria-hidden) because TileDensityToggle already
            carries aria-label="Tile density" — labelling it twice would make a
            screen reader announce the group name and then repeat it. */}
        <div className="settings-kv-row settings-kv-row--control">
          <dt aria-hidden="true">Tile density</dt>
          <dd>
            <TileDensityToggle density={density} onChange={onSetDensity} />
          </dd>
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

  // escapeDismisses=false: the form's own Escape (with stopPropagation) owns
  // key dismissal so the OUTER Admin Panel's document listener stays blind to
  // it — one press, one layer.
  return (
    <Modal
      onDismiss={onClose}
      overlayClassName="launcher-overlay add-offer-overlay"
      overlayTestId="add-offer-overlay"
      escapeDismisses={false}
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
    </Modal>
  );
}
