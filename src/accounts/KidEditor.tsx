import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  categories as fetchCategories,
  createKid,
  deleteKid,
  kidServices,
  kidSessions,
  revokeKidSession,
  services as fetchServices,
  setKidServices,
  updateKid,
  type Account,
  type Category,
  type KidDevice,
  type Result,
  type Service,
} from '../api';
import { iconSrc } from '../lib/icons';
import { useResolvedTheme } from '../theme/theme';
import { ACCENTS, type AccentId } from '../theme/accent';
import { avatarColorId } from '../lib/avatarColor';
import Modal from '../ui/Modal';
import { trapTab } from '../ui/trapTab';
import { describeDevice, formatAgo, formatDay, possessive } from './device';
import SignInHereConfirm from './SignInHereConfirm';

// SPEC-kid-accounts UX §3 (TASK-403) — the kid editor, for both "Add a kid" and
// "Edit". Name and color; the app checklist grouped by the catalog's sections,
// with a tri-state "select all" per section, search, and the running "N of M";
// the devices list with Sign out (edit only); "Sign in this device as …" (§4);
// delete with a confirm; and the dirty-form discard confirm.
//
// Copy follows UX §6: "kid", and "apps Maya can see" — hiding, not blocking.

const MAX_NAME = 40; // characters, matching the server's rune count

// UX §3 — "six swatches from the existing accent tokens". Yellow and red are
// left out: yellow is the weakest dot on a light surface, and red reads as an
// error state next to a name. The server accepts all eight, so a kid already
// set to one of those keeps it (see colorChoices).
const SWATCHES: AccentId[] = ['blue', 'teal', 'green', 'orange', 'pink', 'purple'];

type Section = { key: string; name: string; apps: Service[] };
type Load = 'loading' | 'ready' | 'error';
type Strip = 'discard' | 'delete' | null;

// Catalog order: categories by sortIndex, apps in the order the catalog lists
// them, empty sections dropped, Uncategorized last (as on the dashboard).
function buildSections(cats: Category[], svcs: Service[]): Section[] {
  const known = new Set(cats.map((c) => c.id));
  const byCat = new Map<string, Service[]>();
  const uncategorized: Service[] = [];
  for (const s of svcs) {
    if (s.categoryId && known.has(s.categoryId)) {
      byCat.set(s.categoryId, [...(byCat.get(s.categoryId) ?? []), s]);
    } else {
      uncategorized.push(s);
    }
  }
  const out: Section[] = [...cats]
    .sort((a, b) => a.sortIndex - b.sortIndex)
    .map((c) => ({ key: c.id, name: c.name, apps: byCat.get(c.id) ?? [] }))
    .filter((s) => s.apps.length > 0);
  if (uncategorized.length > 0) out.push({ key: '__uncategorized__', name: 'Uncategorized', apps: uncategorized });
  return out;
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

export default function KidEditor({
  kid,
  onClose,
  onSaved,
  onDeleted,
}: {
  // Absent → "Add a kid".
  kid?: Account;
  onClose: () => void;
  // Every successful write reports the account as it now stands, so the list
  // can update in place (create appends, anything else replaces).
  onSaved: (account: Account) => void;
  onDeleted: (id: string) => void;
}) {
  const theme = useResolvedTheme();
  const uid = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);

  // The kid as saved. null until an "Add a kid" has been created — after that
  // the editor IS an edit (title, devices, delete, sign-in-here all appear).
  const [saved, setSaved] = useState<Account | null>(kid ?? null);
  const [baseName, setBaseName] = useState(kid?.name ?? '');
  const [baseColor, setBaseColor] = useState<string>(kid ? avatarColorId(kid.avatarColor) : 'blue');
  const [name, setName] = useState(kid?.name ?? '');
  const [color, setColor] = useState<string>(baseColor);

  const [catalog, setCatalog] = useState<{ services: Service[]; sections: Section[] } | null>(null);
  const [allowState, setAllowState] = useState<Load>('loading');
  const [baseIds, setBaseIds] = useState<Set<string>>(new Set());
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  const [devices, setDevices] = useState<KidDevice[]>([]);
  const [devState, setDevState] = useState<Load>('loading');
  const [deviceError, setDeviceError] = useState<string | null>(null);

  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [strip, setStrip] = useState<Strip>(null);
  const [signInOpen, setSignInOpen] = useState(false);

  // The catalog, and (editing) the kid's allow-list, load together so the
  // checklist first renders with the right boxes ticked and the right sections
  // open. A failed allow-list read must never look like "no apps": the editor
  // then refuses to save, so it cannot overwrite the real list with an empty one.
  const kidAtOpen = kid?.id;
  useEffect(() => {
    let live = true;
    const allow = kidAtOpen
      ? kidServices(kidAtOpen).then(
          (list) => ({ ok: true as const, list }),
          () => ({ ok: false as const, list: [] as string[] }),
        )
      : Promise.resolve({ ok: true as const, list: [] as string[] });
    Promise.all([fetchServices(), fetchCategories(), allow])
      .then(([svcs, cats, a]) => {
        if (!live) return;
        const sections = buildSections(cats, svcs);
        setCatalog({ services: svcs, sections });
        if (!a.ok) {
          setAllowState('error');
          return;
        }
        const set = new Set(a.list);
        setBaseIds(set);
        setIds(new Set(set));
        // UX §3 — sections with a ticked app start open; the rest collapsed.
        setExpanded(new Set(sections.filter((s) => s.apps.some((x) => set.has(x.id))).map((s) => s.key)));
        setAllowState('ready');
      })
      .catch(() => {
        if (live) setAllowState('error');
      });
    return () => {
      live = false;
    };
  }, [kidAtOpen]);

  // Devices: only once the kid exists (edit, or right after a create).
  const savedId = saved?.id;
  useEffect(() => {
    if (!savedId) return;
    let live = true;
    setDevState('loading');
    kidSessions(savedId)
      .then((d) => {
        if (!live) return;
        setDevices(d);
        setDevState('ready');
      })
      .catch(() => {
        if (live) setDevState('error');
      });
    return () => {
      live = false;
    };
  }, [savedId]);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  useEffect(() => {
    if (strip === 'discard') keepRef.current?.focus();
  }, [strip]);

  const trimmed = name.trim();
  const who = trimmed || (saved ? baseName : 'this kid');
  const title = saved ? baseName : 'Add a kid';
  const total = catalog?.services.length ?? 0;
  const tickedInCatalog = useMemo(
    () => (catalog ? catalog.services.filter((s) => ids.has(s.id)).map((s) => s.id) : []),
    [catalog, ids],
  );
  const dirty = trimmed !== baseName || color !== baseColor || !sameSet(ids, baseIds);
  const loaded = catalog !== null && allowState === 'ready';
  const canSave = loaded && dirty && !busy;

  // Search filters the chips and force-opens any section with a match, without
  // touching what the admin had opened by hand.
  const q = query.trim().toLowerCase();
  const visible = (catalog?.sections ?? [])
    .map((s) => ({ section: s, apps: q ? s.apps.filter((a) => a.name.toLowerCase().includes(q)) : s.apps }))
    .filter((v) => v.apps.length > 0);

  function toggleApp(id: string) {
    setIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSection(s: Section) {
    const all = s.apps.every((a) => ids.has(a.id));
    setIds((cur) => {
      const next = new Set(cur);
      for (const a of s.apps) {
        if (all) next.delete(a.id);
        else next.add(a.id);
      }
      return next;
    });
  }

  function toggleExpanded(key: string) {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function attemptClose() {
    if (dirty) {
      setStrip('discard');
      return;
    }
    onClose();
  }

  // A name write failed: a 409 or 400 is about the name, so it shows under the
  // field (UX §3); anything else is a general error.
  function nameFailure(r: Result) {
    if (r.status === 409) setNameError('Another kid already has this name.');
    else if (r.status === 400) setNameError('Use 1–40 characters, with no special control characters.');
    else setFormError("Couldn't save. Try again.");
  }

  async function save() {
    if (!canSave) return;
    setNameError(null);
    setFormError(null);
    if (!trimmed) {
      setNameError('Enter a name.');
      return;
    }
    if ([...trimmed].length > MAX_NAME) {
      setNameError(`Use ${MAX_NAME} characters or fewer.`);
      return;
    }
    setBusy(true);
    try {
      let acct = saved;
      let createdNow = false;
      if (!acct) {
        const r = await createKid(trimmed, color);
        if (!r.ok || !r.account) return nameFailure(r);
        acct = r.account;
        createdNow = true;
      } else if (trimmed !== baseName || color !== baseColor) {
        const patch: { name?: string; avatarColor?: string } = {};
        if (trimmed !== baseName) patch.name = trimmed;
        if (color !== baseColor) patch.avatarColor = color;
        const r = await updateKid(acct.id, patch);
        if (!r.ok || !r.account) return nameFailure(r);
        acct = { ...acct, ...r.account };
      }
      if (acct !== saved) {
        setSaved(acct);
        setBaseName(acct.name);
        setName(acct.name);
        setBaseColor(color);
        onSaved(acct);
      }
      if (!sameSet(ids, baseIds)) {
        const ok = await setKidServices(acct.id, tickedInCatalog);
        if (!ok) {
          setFormError(
            createdNow
              ? `Saved ${acct.name}, but couldn't save their apps. Try again.`
              : `Couldn't save ${possessive(acct.name)} apps. Try again.`,
          );
          return;
        }
        setBaseIds(new Set(ids));
        acct = { ...acct, appCount: tickedInCatalog.length };
        setSaved(acct);
        onSaved(acct);
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!saved) return;
    setStrip(null);
    setFormError(null);
    const ok = await deleteKid(saved.id);
    if (!ok) {
      setFormError(`Couldn't delete ${baseName}. Try again.`);
      return;
    }
    onDeleted(saved.id);
    onClose();
  }

  async function signOutDevice(d: KidDevice) {
    if (!saved) return;
    setDeviceError(null);
    const ok = await revokeKidSession(saved.id, d.id);
    if (!ok) {
      setDeviceError("Couldn't sign that device out. Try again.");
      return;
    }
    const next = devices.filter((x) => x.id !== d.id);
    setDevices(next);
    const acct = { ...saved, deviceCount: next.length };
    setSaved(acct);
    onSaved(acct);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Tab') {
      trapTab(e, dialogRef.current);
      return;
    }
    if (e.key !== 'Escape') return;
    // Stop here so the Admin Panel underneath (a window listener) never sees it:
    // one press, one layer.
    e.stopPropagation();
    if (strip) {
      setStrip(null);
      return;
    }
    attemptClose();
  }

  const colorChoices: AccentId[] = SWATCHES.includes(color as AccentId)
    ? SWATCHES
    : [...SWATCHES, color as AccentId];
  const nameErrId = `${uid}-name-err`;
  const signInHintId = `${uid}-signin-hint`;

  return createPortal(
    <Modal
      onDismiss={attemptClose}
      overlayClassName="launcher-overlay add-offer-overlay kid-editor-overlay"
      overlayTestId="kid-editor-overlay"
      escapeDismisses={false}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
        data-testid="kid-editor"
        className="kid-editor-panel"
        onKeyDown={onKeyDown}
      >
        <form
          className="kid-editor-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="library-head">
            <h2 id={`${uid}-title`} className="library-title">
              {title}
            </h2>
            <button
              type="button"
              aria-label={`Close ${title}`}
              onClick={attemptClose}
              className="launcher-clear library-close"
            >
              ✕
            </button>
          </div>

          <div className="kid-editor-body">
            <div className="kid-identity">
              <div className="kid-field">
                <label htmlFor={`${uid}-name`} className="add-offer-label">
                  Name
                </label>
                <input
                  ref={nameRef}
                  id={`${uid}-name`}
                  data-testid="kid-name"
                  className="settings-input"
                  value={name}
                  autoComplete="off"
                  aria-invalid={nameError ? true : undefined}
                  aria-describedby={nameError ? nameErrId : undefined}
                  onChange={(e) => {
                    setName(e.target.value);
                    setNameError(null);
                  }}
                />
                {nameError && (
                  <p id={nameErrId} className="settings-error kid-name-error">
                    {nameError}
                  </p>
                )}
              </div>
              <div className="kid-field">
                <span id={`${uid}-color`} className="add-offer-label">
                  Color
                </span>
                <div role="radiogroup" aria-labelledby={`${uid}-color`} className="kid-swatches">
                  {colorChoices.map((id) => {
                    const a = ACCENTS.find((x) => x.id === id)!;
                    return (
                      <label key={id} className="kid-swatch" title={a.label}>
                        <input
                          type="radio"
                          name={`${uid}-color`}
                          value={id}
                          checked={color === id}
                          onChange={() => setColor(id)}
                          className="sr-only"
                        />
                        <span className="kid-swatch-dot" style={{ backgroundColor: a.swatch }} aria-hidden="true" />
                        <span className="sr-only">{a.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="kid-apps">
              <div className="kid-apps-head">
                <h3 className="settings-section-title">Apps {who} can see</h3>
                <span data-testid="kid-app-count" className="kid-count" aria-live="polite">
                  {tickedInCatalog.length} of {total}
                </span>
                <input
                  type="search"
                  aria-label="Search apps"
                  placeholder="Search apps"
                  className="settings-input kid-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              {loaded && tickedInCatalog.length === 0 && (
                <p data-testid="kid-zero-warning" className="kid-warning">
                  {who === 'this kid' ? 'This kid' : who} will see an empty dashboard.
                </p>
              )}

              {allowState === 'loading' && (
                <p className="kid-hint" role="status">
                  Loading apps…
                </p>
              )}
              {allowState === 'error' && (
                <p className="settings-error">
                  {saved
                    ? `Couldn't load ${possessive(baseName)} apps. Close this and try again.`
                    : "Couldn't load the apps. Close this and try again."}
                </p>
              )}
              {loaded && (
                <div data-testid="kid-checklist" className="kid-checklist">
                  {total === 0 && <p className="kid-hint">The catalog has no apps yet.</p>}
                  {total > 0 && visible.length === 0 && <p className="kid-hint">No apps match “{query.trim()}”.</p>}
                  {visible.map(({ section, apps }) => (
                    <ChecklistSection
                      key={section.key}
                      section={section}
                      apps={apps}
                      ids={ids}
                      open={q !== '' || expanded.has(section.key)}
                      theme={theme}
                      onToggleApp={toggleApp}
                      onToggleSection={() => toggleSection(section)}
                      onToggleOpen={() => toggleExpanded(section.key)}
                    />
                  ))}
                </div>
              )}
              <p className="settings-section-note">New apps you add later stay hidden until you tick them.</p>
            </div>

            {saved && (
              <section data-testid="kid-devices" aria-labelledby={`${uid}-devices`} className="kid-devices">
                <h3 id={`${uid}-devices`} className="settings-section-title">
                  Devices
                </h3>
                {devState === 'loading' && <p className="kid-hint">Loading devices…</p>}
                {devState === 'error' && <p className="settings-error">Couldn't load devices.</p>}
                {devState === 'ready' && devices.length === 0 && <p className="kid-hint">No devices yet</p>}
                {devState === 'ready' && devices.length > 0 && (
                  <ul className="kid-device-list">
                    {devices.map((d) => {
                      const label = describeDevice(d.userAgent);
                      return (
                        <li key={d.id} data-testid="kid-device-row" className="kid-device-row">
                          <span>
                            {label} · signed in {formatDay(d.createdAt)} · last used {formatAgo(d.lastSeenAt)}
                          </span>
                          <button
                            type="button"
                            className="settings-ghost-btn kid-btn"
                            aria-label={`Sign out ${label}`}
                            onClick={() => void signOutDevice(d)}
                          >
                            Sign out
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {deviceError && <p className="settings-error">{deviceError}</p>}
                <div className="kid-signin">
                  <button
                    type="button"
                    data-testid="kid-signin-here"
                    className="settings-ghost-btn kid-btn"
                    disabled={dirty || busy}
                    aria-describedby={dirty ? signInHintId : undefined}
                    onClick={() => setSignInOpen(true)}
                  >
                    Sign in this device as {baseName}
                  </button>
                  {dirty && (
                    <span id={signInHintId} className="kid-hint">
                      Save first
                    </span>
                  )}
                </div>
              </section>
            )}

            {formError && (
              <p role="alert" className="settings-error">
                {formError}
              </p>
            )}
          </div>

          {strip === 'discard' ? (
            <div className="kid-editor-foot kid-strip" role="group" aria-label="Unsaved changes" data-testid="kid-discard-confirm">
              <span className="kid-strip-text">
                {saved ? `Discard changes to ${baseName}?` : 'Discard this new kid?'}
              </span>
              <button ref={keepRef} type="button" className="settings-ghost-btn kid-btn" onClick={() => setStrip(null)}>
                Keep editing
              </button>
              <button type="button" className="library-add settings-danger-btn kid-btn" onClick={onClose}>
                Discard
              </button>
            </div>
          ) : strip === 'delete' ? (
            <div className="kid-editor-foot kid-strip" role="group" aria-label={`Delete ${baseName}`} data-testid="kid-delete-confirm">
              <span className="kid-strip-text">
                Delete {baseName}? Their devices are signed out and their favorites are removed.
              </span>
              <button type="button" className="settings-ghost-btn kid-btn" onClick={() => setStrip(null)}>
                Cancel
              </button>
              <button type="button" className="library-add settings-danger-btn kid-btn" onClick={() => void remove()}>
                Delete {baseName}
              </button>
            </div>
          ) : (
            <div className="kid-editor-foot">
              {saved && (
                <button
                  type="button"
                  data-testid="kid-delete"
                  className="settings-ghost-btn settings-danger kid-btn kid-delete"
                  onClick={() => setStrip('delete')}
                >
                  Delete {baseName}
                </button>
              )}
              <span className="kid-foot-spacer" />
              <button type="button" className="settings-ghost-btn kid-btn" onClick={attemptClose}>
                Cancel
              </button>
              <button type="submit" data-testid="kid-save" className="library-add kid-btn" disabled={!canSave}>
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}

        </form>
        {signInOpen && saved && (
          <SignInHereConfirm kidId={saved.id} kidName={baseName} onCancel={() => setSignInOpen(false)} />
        )}
      </div>
    </Modal>,
    document.body,
  );
}

function ChecklistSection({
  section,
  apps,
  ids,
  open,
  theme,
  onToggleApp,
  onToggleSection,
  onToggleOpen,
}: {
  section: Section;
  apps: Service[];
  ids: Set<string>;
  open: boolean;
  theme: 'light' | 'dark';
  onToggleApp: (id: string) => void;
  onToggleSection: () => void;
  onToggleOpen: () => void;
}) {
  const chipsId = useId();
  const n = section.apps.length;
  const ticked = section.apps.filter((a) => ids.has(a.id)).length;
  const state = ticked === 0 ? 'false' : ticked === n ? 'true' : 'mixed';
  const summary = state === 'true' ? `all (${n})` : state === 'false' ? `none (${n})` : `some (${ticked} of ${n})`;
  return (
    <div data-testid={`kid-section-${section.name}`} className="kid-section">
      <div className="kid-section-head">
        <button
          type="button"
          className="kid-section-toggle"
          aria-expanded={open}
          aria-controls={chipsId}
          onClick={onToggleOpen}
        >
          <span aria-hidden="true" className="kid-caret">
            {open ? '▾' : '▸'}
          </span>
          {section.name}
        </button>
        <button
          type="button"
          role="checkbox"
          aria-checked={state}
          aria-label={`Select all in ${section.name}`}
          className="kid-tristate"
          data-state={state}
          onClick={onToggleSection}
        >
          <span aria-hidden="true" className="kid-tristate-box" />
          <span aria-hidden="true">{summary}</span>
        </button>
      </div>
      <div id={chipsId} className="kid-chips" hidden={!open}>
        {apps.map((a) => (
          <label key={a.id} className="kid-chip">
            <input type="checkbox" checked={ids.has(a.id)} onChange={() => onToggleApp(a.id)} />
            <img src={iconSrc(a, theme, 0)} alt="" className="kid-chip-icon" />
            <span>{a.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
