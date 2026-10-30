import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { signInHere } from '../api';
import { reloadPage } from '../lib/reload';
import Modal from '../ui/Modal';
import { possessive } from './device';

// SPEC-kid-accounts UX §4 (TASK-404) — "Sign in this device as Maya?". This is
// the one step that can lock the admin out of their own session on this device,
// so it is a full modal confirm with the copy verbatim from §4, and a primary
// button that names the kid (never "Confirm").
//
// The SERVER does the swap: POST …/sign-in-here ends the admin's session and
// sets the kid's cookie in one response. On success the page reloads, so the
// app boots as the kid with nothing of the admin's state left in memory.
export default function SignInHereConfirm({
  kidId,
  kidName,
  onCancel,
}: {
  kidId: string;
  kidName: string;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();

  // The safe default takes focus.
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  async function confirm() {
    setBusy(true);
    setError(false);
    const ok = await signInHere(kidId);
    if (ok) {
      reloadPage();
      return;
    }
    setBusy(false);
    setError(true);
  }

  // Portalled to <body> so no ancestor's backdrop-filter can trap its fixed
  // overlay, and with its own Escape (stopPropagation) so one press closes only
  // this layer, not the kid editor or the Admin Panel beneath it.
  return createPortal(
    <Modal
      onDismiss={onCancel}
      overlayClassName="launcher-overlay add-offer-overlay kid-confirm-overlay"
      overlayTestId="kid-signin-overlay"
      escapeDismisses={false}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="add-offer-panel kid-confirm-panel"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onCancel();
          }
        }}
      >
        <h3 id={titleId} className="add-offer-title">
          Sign in this device as {kidName}?
        </h3>
        <div id={bodyId} className="kid-confirm-body">
          <p>
            {`You'll be signed out here, and this device will show ${possessive(kidName)} dashboard. It stays signed in until you sign it out from Accounts on another device.`}
          </p>
          <p>{`To manage Homepad again on this device, sign out of ${kidName} and sign in as yourself.`}</p>
        </div>
        {error && (
          <p role="alert" className="settings-error">
            Couldn't sign this device in. Try again.
          </p>
        )}
        <div className="kid-confirm-actions">
          <button ref={cancelRef} type="button" className="settings-ghost-btn kid-btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            data-testid="kid-signin-confirm"
            className="library-add kid-btn"
            disabled={busy}
            onClick={() => void confirm()}
          >
            {busy ? 'Signing in…' : `Sign in as ${kidName}`}
          </button>
        </div>
      </div>
    </Modal>,
    document.body,
  );
}
