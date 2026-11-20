import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { revokeInvite, type Invite } from '../api';
import Modal from '../ui/Modal';
import { trapTab } from '../ui/trapTab';
import { possessive } from './device';
import { endDay, roleLabel } from './inviteFormat';

// SPEC-household-basics UX §3.1 (AC-011, AC-019) — the pending invites, under
// the account list. Shown only when there is one. Revoke asks first (H-2): a
// link might already be in someone's messages, so a slip can't be undone by
// trying again. Used and expired invites drop off on the next load.
export default function PendingInvites({
  invites,
  onRevoked,
}: {
  invites: Invite[];
  onRevoked: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState<Invite | null>(null);
  const [error, setError] = useState(false);
  const headId = useId();

  if (invites.length === 0) return null;

  return (
    <div className="invites" data-testid="pending-invites">
      <h4 id={headId} className="invites-title">
        Pending invites
      </h4>
      <ul className="accounts-list" aria-labelledby={headId}>
        {invites.map((inv) => (
          <li key={inv.id} data-testid="invite-row" className="accounts-item">
            <div className="accounts-row">
              <span className="accounts-name">{inv.name}</span>
              <span className="role-pill accounts-role">{roleLabel(inv.role)}</span>
              <span className="accounts-summary">{`made by ${inv.createdBy.name} · ends ${endDay(inv.expiresAt)}`}</span>
              <button
                type="button"
                className="settings-ghost-btn invites-revoke"
                aria-label={`Revoke ${possessive(inv.name)} invite`}
                onClick={() => {
                  setError(false);
                  setConfirming(inv);
                }}
              >
                Revoke
              </button>
            </div>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="settings-error">
          Couldn't revoke the invite. Try again.
        </p>
      )}
      {confirming && (
        <RevokeConfirm
          invite={confirming}
          onCancel={() => setConfirming(null)}
          onDone={(ok) => {
            setConfirming(null);
            if (ok) onRevoked(confirming.id);
            else setError(true);
          }}
        />
      )}
    </div>
  );
}

function RevokeConfirm({
  invite,
  onCancel,
  onDone,
}: {
  invite: Invite;
  onCancel: () => void;
  onDone: (ok: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const bodyId = useId();

  // The safe default takes focus.
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  async function revoke() {
    setBusy(true);
    onDone(await revokeInvite(invite.id));
  }

  return createPortal(
    <Modal
      onDismiss={onCancel}
      overlayClassName="launcher-overlay add-offer-overlay kid-confirm-overlay"
      overlayTestId="invite-revoke-overlay"
      escapeDismisses={false}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="add-offer-panel kid-confirm-panel"
        onKeyDown={(e) => {
          if (e.key === 'Tab') {
            e.stopPropagation();
            trapTab(e, dialogRef.current);
          } else if (e.key === 'Escape') {
            // One layer: the Admin Panel beneath must not see it.
            e.stopPropagation();
            onCancel();
          }
        }}
      >
        <h3 id={titleId} className="add-offer-title">
          {`Revoke ${possessive(invite.name)} invite?`}
        </h3>
        <p id={bodyId} className="kid-confirm-body">
          The link stops working.
        </p>
        <div className="kid-confirm-actions">
          <button ref={cancelRef} type="button" className="settings-ghost-btn kid-btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="library-add settings-danger-btn kid-btn"
            disabled={busy}
            onClick={() => void revoke()}
          >
            Revoke
          </button>
        </div>
      </div>
    </Modal>,
    document.body,
  );
}
