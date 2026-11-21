import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createResetLink, type CreatedResetLink } from '../passwordApi';
import { endTime } from '../lib/passwordCopy';
import { reloadPage } from '../lib/reload';
import Modal from '../ui/Modal';
import { trapTab } from '../ui/trapTab';
import LinkOnce from './LinkOnce';
import './household.css';

// SPEC-password-reset-link AC-001, AC-018, UX §2.2 — the reset-link dialog,
// opened from an adult's row menu ("Make a reset link"). It makes the link at
// once: making one changes nothing until it's used, and replaces the earlier
// one, so there's no "are you sure" step (R-2). The link shows once, with Copy
// and the plain-http fallback (LinkOnce). Closing asks nothing.
//
// The row menu loads this with lazy(), inside the Admin Panel chunk.

type State =
  | { kind: 'making' }
  | { kind: 'ready'; link: CreatedResetLink }
  | { kind: 'error'; status: number; error?: string };

// The page's own address, so the link points wherever the admin uses Homepad.
function resetLink(token: string): string {
  return `${window.location.origin}/#reset=${encodeURIComponent(token)}`;
}

export default function ResetLinkDialog({
  account,
  onClose,
  onGone,
}: {
  account: { id: string; name: string };
  onClose: () => void;
  // The account isn't there any more (404): the Accounts list reloads.
  onGone?: () => void;
}) {
  const [state, setState] = useState<State>({ kind: 'making' });
  const dialogRef = useRef<HTMLDivElement>(null);
  const uid = useId();
  const name = account.name;
  const title = `Reset link for ${name}`;

  const make = useCallback(() => {
    let live = true;
    setState({ kind: 'making' });
    createResetLink(account.id).then((r) => {
      if (!live) return;
      setState(r.ok && r.link ? { kind: 'ready', link: r.link } : { kind: 'error', status: r.status, error: r.error });
    });
    return () => {
      live = false;
    };
  }, [account.id]);

  useEffect(() => make(), [make]);

  // Every way out (Done, Close, ✕, Escape, the backdrop) asks nothing. After a
  // 404 the account is gone, so any of them reloads the Accounts list.
  const gone = state.kind === 'error' && state.status === 404;
  const close = () => {
    if (gone) onGone?.();
    onClose();
  };

  // While the link is being made, focus sits on the dialog so Escape and Tab
  // work; LinkOnce then moves it to Copy link (or the selected field).
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Tab') {
      trapTab(e, dialogRef.current);
      return;
    }
    if (e.key !== 'Escape') return;
    // One press, one layer: the Admin Panel underneath never sees it.
    e.stopPropagation();
    close();
  }

  return createPortal(
    <Modal
      onDismiss={close}
      overlayClassName="launcher-overlay add-offer-overlay kid-editor-overlay"
      overlayTestId="reset-link-overlay"
      escapeDismisses={false}
      restoreFocus
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
        data-testid="reset-link"
        className="kid-editor-panel add-adult-panel"
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <div className="library-head">
          <h2 id={`${uid}-title`} className="library-title">
            {title}
          </h2>
          <button type="button" aria-label={`Close ${title}`} onClick={close} className="launcher-clear library-close">
            ✕
          </button>
        </div>
        {state.kind === 'making' && (
          <div role="status" className="add-adult-body">
            <span className="auth-spin" aria-hidden="true" />
            <p>Making a link…</p>
          </div>
        )}
        {state.kind === 'ready' && (
          <LinkOnce
            link={resetLink(state.link.token)}
            intro={`Send ${name} this link.`}
            label="Reset link"
            shareTitle="Homepad password reset"
            footer={[
              `It works once, until ${endTime(state.link.expiresAt)}. You won't see this link again.`,
              `${name}'s password stays the same until they use it. A new link replaces this one.`,
            ]}
            focusCopy
            onDone={onClose}
          />
        )}
        {state.kind === 'error' && (
          <ResetLinkError
            name={name}
            status={state.status}
            error={state.error}
            onRetry={make}
            onClose={close}
          />
        )}
      </div>
    </Modal>,
    document.body,
  );
}

function ResetLinkError({
  name,
  status,
  error = '',
  onRetry,
  onClose,
}: {
  name: string;
  status: number;
  error?: string;
  onRetry: () => void;
  onClose: () => void;
}) {
  const close = (
    <button type="button" className="library-add kid-btn" onClick={onClose}>
      Close
    </button>
  );
  let line = "Couldn't make the link. Try again.";
  let buttons = (
    <>
      <button type="button" className="settings-ghost-btn kid-btn" onClick={onRetry}>
        Try again
      </button>
      {close}
    </>
  );
  if (status === 409 && error.includes('sso_account')) {
    line = `${name} signs in with single sign-on only, so there's no password to reset.`;
    buttons = close;
  } else if (status === 409 && error.includes('self')) {
    line = 'To change your own password, use My settings.';
    buttons = close;
  } else if (status === 404) {
    line = `${name} isn't in Homepad anymore.`;
    buttons = close;
  } else if (status === 401) {
    line = 'You were signed out. Reload the page to sign in again.';
    buttons = (
      <button type="button" className="library-add kid-btn" onClick={reloadPage}>
        Reload
      </button>
    );
  }
  return (
    <div className="add-adult-body">
      <p role="alert" className="settings-error">
        {line}
      </p>
      <div className="kid-editor-foot">
        <span className="kid-foot-spacer" />
        {buttons}
      </div>
    </div>
  );
}
