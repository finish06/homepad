import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { removeAccount, setAccountRole, type Account, type AdultChange } from '../api';
import Modal from '../ui/Modal';
import { trapTab } from '../ui/trapTab';
import { possessive } from './device';
import type { AdultAction } from './AdultRowMenu';

// SPEC-household-manage-adults UX §3 — the three confirms: Remove, Make
// member, Make admin. Each is a small alertdialog card, the same as "Revoke
// Jordan's invite?". Focus starts on Cancel; the primary button names the
// action. Escape is Cancel and stops there (one layer). Errors stay inside the
// dialog (§3.4). Every string here is the UX artifact's final copy.
//
// Loaded on demand from AdultRowMenu, so it is its own chunk (UX §1).

// What a failed answer leaves the dialog showing.
// stale:   the list on screen is out of date (last_admin, self, 404). The
//          primary is disabled, Cancel reads Close, and closing reloads.
// signout: this admin's own session ended. One button, Reload.
// retry:   anything else. Both buttons stay enabled.
type Failure = { kind: 'stale' | 'signout' | 'retry'; line: string };

function failureOf(r: AdultChange, action: AdultAction, name: string): Failure {
  if (r.status === 409 && r.code === 'last_admin') return { kind: 'stale', line: 'Homepad needs at least one admin.' };
  if (r.status === 409 && r.code === 'self') {
    return { kind: 'stale', line: "You can't change your own account here. Ask another admin." };
  }
  if (r.status === 404) return { kind: 'stale', line: `${name} isn't in Homepad anymore.` };
  if (r.status === 401) return { kind: 'signout', line: 'You were signed out. Reload the page to sign in again.' };
  return {
    kind: 'retry',
    line: action === 'remove' ? `Couldn't remove ${name}. Try again.` : `Couldn't change ${possessive(name)} role. Try again.`,
  };
}

export default function AdultConfirm({
  action,
  account,
  pendingInvites,
  oidcEnabled,
  onCancel,
  onStale,
  onDone,
}: {
  action: AdultAction;
  account: Account;
  pendingInvites: number;
  oidcEnabled: boolean;
  onCancel: () => void;
  onStale: () => void;
  // Called on success; for a role change, with the updated row.
  onDone: (updated: Account) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const reloadRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const name = account.name;
  const remove = action === 'remove';

  // The safe choice takes focus; after an error, the way out does.
  useEffect(() => {
    if (failure?.kind === 'signout') reloadRef.current?.focus();
    else if (!failure || failure.kind === 'stale') cancelRef.current?.focus();
  }, [failure]);

  const stale = failure?.kind === 'stale';
  const dismiss = () => {
    if (busy || failure?.kind === 'signout') return;
    if (stale) onStale();
    else onCancel();
  };

  async function run() {
    setBusy(true);
    setFailure(null);
    const role = action === 'admin' ? 'admin' : 'user';
    const r: AdultChange & { account?: Account } = remove
      ? await removeAccount(account.id)
      : await setAccountRole(account.id, role);
    if (r.ok) {
      onDone(remove ? account : (r.account ?? { ...account, role }));
      return;
    }
    setBusy(false);
    setFailure(failureOf(r, action, name));
  }

  const title = remove ? `Remove ${name}?` : action === 'member' ? `Make ${name} a member?` : `Make ${name} an admin?`;
  const body = remove
    ? `${name} will be signed out everywhere. Their favorites and settings will be deleted. The apps everyone shares stay as they are.`
    : action === 'member'
      ? `${name} will be signed out on every device. After that, ${name} can't change apps, settings or accounts.`
      : `${name} will be signed out on every device. After signing in again, ${name} can change apps, settings and accounts.`;
  const primary = remove ? `Remove ${name}` : action === 'member' ? 'Make member' : 'Make admin';
  const busyLabel = remove ? 'Removing…' : 'Saving…';

  return createPortal(
    <Modal
      onDismiss={dismiss}
      overlayClassName="launcher-overlay add-offer-overlay kid-confirm-overlay"
      overlayTestId="adult-confirm-overlay"
      escapeDismisses={false}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="add-offer-panel kid-confirm-panel adult-confirm"
        onKeyDown={(e) => {
          if (e.key === 'Tab') {
            e.stopPropagation();
            trapTab(e, dialogRef.current);
          } else if (e.key === 'Escape') {
            // One layer: the Admin Panel beneath must not see it.
            e.stopPropagation();
            dismiss();
          }
        }}
      >
        <h3 id={titleId} className="add-offer-title">
          {title}
        </h3>
        <div className="kid-confirm-body">
          <p id={bodyId}>{body}</p>
          {remove && pendingInvites > 0 && (
            <p>{`${possessive(name)} ${pendingInvites} pending ${pendingInvites === 1 ? 'invite' : 'invites'} will stop working.`}</p>
          )}
          {remove && oidcEnabled && (
            <p>{`If ${name} uses single sign-on, they can sign in again that way. To stop that, remove them in your identity provider too.`}</p>
          )}
          {action === 'admin' && <p className="add-adult-warn">Admins can do everything you can, including inviting other admins.</p>}
        </div>
        {failure && (
          <p role="alert" className="settings-error">
            {failure.line}
          </p>
        )}
        <div className="kid-confirm-actions">
          {failure?.kind === 'signout' ? (
            <button
              ref={reloadRef}
              type="button"
              className="library-add kid-btn"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          ) : (
            <>
              <button ref={cancelRef} type="button" className="settings-ghost-btn kid-btn" disabled={busy} onClick={dismiss}>
                {stale ? 'Close' : 'Cancel'}
              </button>
              <button
                type="button"
                className={`library-add kid-btn${remove ? ' settings-danger-btn' : ''}`}
                disabled={busy || stale}
                onClick={() => void run()}
              >
                {busy ? busyLabel : primary}
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>,
    document.body,
  );
}
