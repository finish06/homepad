import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createInvite, type CreatedInvite, type InviteRole } from '../api';
import { accountLimitMessage, isAccountLimit } from '../lib/accountLimit';
import Modal from '../ui/Modal';
import { trapTab } from '../ui/trapTab';
import { endDay } from './inviteFormat';

// SPEC-household-basics UX §3.2–§3.3 (AC-008, AC-019, AC-022, AC-031) — "Add an
// adult". The admin names the adult and picks Member or Admin, and gets a link
// that works once, for 7 days. The link is shown once: the server keeps only a
// hash of it. The same modal shell as the kid editor.

const MAX_NAME = 40;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

function nameProblem(raw: string): string | null {
  const name = raw.trim();
  if (CONTROL.test(name)) return 'Use letters, numbers and spaces.';
  if ([...name].length > MAX_NAME) return `Use ${MAX_NAME} characters or fewer.`;
  return null;
}

export default function AddAdultDialog({
  oidcEnabled,
  onClose,
  onCreated,
}: {
  oidcEnabled: boolean;
  onClose: () => void;
  onCreated: (invite: CreatedInvite) => void;
}) {
  const [created, setCreated] = useState<CreatedInvite | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const uid = useId();
  const title = created ? `Invite for ${created.name}` : 'Add an adult';

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Tab') {
      trapTab(e, dialogRef.current);
      return;
    }
    if (e.key !== 'Escape') return;
    // One press, one layer: the Admin Panel underneath (a window listener)
    // never sees it. Nothing here is unsaved, so closing asks nothing.
    e.stopPropagation();
    onClose();
  }

  return createPortal(
    <Modal
      onDismiss={onClose}
      overlayClassName="launcher-overlay add-offer-overlay kid-editor-overlay"
      overlayTestId="add-adult-overlay"
      escapeDismisses={false}
      restoreFocus
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
        data-testid="add-adult"
        className="kid-editor-panel add-adult-panel"
        onKeyDown={onKeyDown}
      >
        <div className="library-head">
          <h2 id={`${uid}-title`} className="library-title">
            {title}
          </h2>
          <button type="button" aria-label={`Close ${title}`} onClick={onClose} className="launcher-clear library-close">
            ✕
          </button>
        </div>
        {created ? (
          <LinkOnce invite={created} onDone={onClose} />
        ) : (
          <InviteForm
            oidcEnabled={oidcEnabled}
            onCancel={onClose}
            onCreated={(inv) => {
              setCreated(inv);
              onCreated(inv);
            }}
          />
        )}
      </div>
    </Modal>,
    document.body,
  );
}

function InviteForm({
  oidcEnabled,
  onCancel,
  onCreated,
}: {
  oidcEnabled: boolean;
  onCancel: () => void;
  onCreated: (invite: CreatedInvite) => void;
}) {
  const [name, setName] = useState('');
  const [role, setRole] = useState<InviteRole>('user');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const uid = useId();

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const problem = nameProblem(name);
  const valid = name.trim() !== '' && !problem;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const r = await createInvite(name.trim(), role);
    setBusy(false);
    if (r.ok && r.invite) return onCreated(r.invite);
    setError(isAccountLimit(r) ? accountLimitMessage(r.error) : "Couldn't create the invite. Try again.");
  }

  const radio = (value: InviteRole, label: string, help: string) => (
    <div className="add-adult-role">
      <input
        id={`${uid}-${value}`}
        type="radio"
        name={`${uid}-role`}
        value={value}
        checked={role === value}
        onChange={() => setRole(value)}
        aria-describedby={`${uid}-${value}-help`}
      />
      <div>
        <label htmlFor={`${uid}-${value}`} className="add-adult-role-label">
          {label}
        </label>
        <p id={`${uid}-${value}-help`} className="add-adult-help">
          {help}
        </p>
      </div>
    </div>
  );

  return (
    <form className="add-adult-body" onSubmit={submit}>
      <div className="kid-field">
        <label htmlFor={`${uid}-name`} className="add-offer-label">
          Name
        </label>
        <input
          ref={nameRef}
          id={`${uid}-name`}
          className="settings-input"
          value={name}
          autoComplete="off"
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? `${uid}-name-err` : undefined}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
        />
        {problem && (
          <p id={`${uid}-name-err`} className="settings-error kid-name-error">
            {problem}
          </p>
        )}
      </div>

      <div role="radiogroup" aria-labelledby={`${uid}-role-label`} className="add-adult-roles">
        <span id={`${uid}-role-label`} className="add-offer-label">
          Role
        </span>
        {radio('user', 'Member', 'Uses the dashboard. Keeps their own favorites and settings.')}
        {radio('admin', 'Admin', 'Also adds apps, and manages accounts and settings.')}
        {role === 'admin' && (
          <p className="add-adult-warn">Admins can do everything you can, including inviting other admins.</p>
        )}
      </div>

      <p className="settings-section-note">
        You'll get a link to send them. It works once, for 7 days. They pick their own email and password.
      </p>
      {oidcEnabled && (
        <p className="settings-section-note">They use PocketID? They can sign in with it. No invite needed.</p>
      )}

      {error && (
        <p role="alert" className="settings-error">
          {error}
        </p>
      )}

      <div className="kid-editor-foot">
        <span className="kid-foot-spacer" />
        <button type="button" className="settings-ghost-btn kid-btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="library-add kid-btn" disabled={!valid || busy}>
          {busy ? 'Creating…' : 'Create link'}
        </button>
      </div>
    </form>
  );
}

// The page's own address, so the link points wherever the admin uses Homepad.
function inviteLink(token: string): string {
  return `${window.location.origin}/#invite=${encodeURIComponent(token)}`;
}

function canCopy(): boolean {
  return window.isSecureContext === true && typeof navigator.clipboard?.writeText === 'function';
}

function copyHint(): string {
  if (window.matchMedia?.('(pointer: coarse)').matches) return 'Press and hold to copy.';
  return /Mac|iPhone|iPad/.test(navigator.userAgent) ? 'Press ⌘C to copy.' : 'Press Ctrl+C to copy.';
}

function LinkOnce({ invite, onDone }: { invite: CreatedInvite; onDone: () => void }) {
  const link = inviteLink(invite.token);
  // Browsers block the clipboard on plain http (a LAN address): show the link
  // selected instead, with how to copy it (UX §3.3, TC-010).
  const [fallback, setFallback] = useState(!canCopy());
  const [copied, setCopied] = useState(false);
  const fieldRef = useRef<HTMLInputElement>(null);
  const uid = useId();

  useEffect(() => {
    if (!fallback) return;
    fieldRef.current?.focus();
    fieldRef.current?.select();
  }, [fallback]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setFallback(true);
    }
  }

  const share = typeof navigator.share === 'function';

  return (
    <div className="add-adult-body">
      <p>{`Send ${invite.name} this link.`}</p>
      <div className="kid-field">
        <label htmlFor={`${uid}-link`} className="add-offer-label">
          Invite link
        </label>
        <input
          ref={fieldRef}
          id={`${uid}-link`}
          className="settings-input add-adult-link"
          value={link}
          readOnly
          onFocus={(e) => e.currentTarget.select()}
        />
        {fallback && <p className="settings-section-note">{copyHint()}</p>}
      </div>
      {!fallback && (
        <div className="add-adult-actions">
          <button type="button" className="library-add kid-btn" onClick={() => void copy()}>
            {copied ? 'Copied' : 'Copy link'}
          </button>
          {share && (
            <button
              type="button"
              className="settings-ghost-btn kid-btn"
              onClick={() => void navigator.share({ title: 'Homepad invite', url: link }).catch(() => {})}
            >
              Share…
            </button>
          )}
        </div>
      )}
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? 'Copied' : ''}
      </span>
      <p className="settings-section-note">
        {`It works once, until ${endDay(invite.expiresAt)}.`} You won't see this link again.
      </p>
      <div className="kid-editor-foot">
        <span className="kid-foot-spacer" />
        <button type="button" className="library-add kid-btn" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}
