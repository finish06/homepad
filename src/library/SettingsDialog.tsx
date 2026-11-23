import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Modal from '../ui/Modal';
import { trapTab } from '../ui/trapTab';
import type { SettingValue, SettingWarning } from './serverSettingsApi';

// SPEC-admin-server-settings UX §8 — the confirm dialogs. One small
// alertdialog card, as the Accounts confirms: title, one or two short
// paragraphs, [Cancel] [primary]. The primary names the action, never "OK".
// Focus starts on Cancel, Tab stays inside, Escape is Cancel and stops there
// (one layer), and focus goes back to the control that opened it.

export default function SettingsDialog({
  title,
  paragraphs,
  primary,
  busy = false,
  busyLabel = 'Saving…',
  error,
  danger = false,
  cancelLabel = 'Cancel',
  onCancel,
  onConfirm,
  children,
  testId = 'server-setting-dialog',
}: {
  title: string;
  paragraphs: string[];
  primary: string;
  busy?: boolean;
  busyLabel?: string;
  error?: string | null;
  danger?: boolean;
  cancelLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
  children?: ReactNode;
  testId?: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => opener?.focus?.();
  }, []);

  const dismiss = () => {
    if (!busy) onCancel();
  };

  return createPortal(
    <Modal
      onDismiss={dismiss}
      overlayClassName="launcher-overlay add-offer-overlay kid-confirm-overlay"
      overlayTestId={`${testId}-overlay`}
      escapeDismisses={false}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        data-testid={testId}
        className="add-offer-panel kid-confirm-panel server-setting-dialog"
        onKeyDown={(e) => {
          if (e.key === 'Tab') {
            e.stopPropagation();
            trapTab(e, dialogRef.current);
          } else if (e.key === 'Escape') {
            e.stopPropagation();
            dismiss();
          }
        }}
      >
        <h3 id={titleId} className="add-offer-title">
          {title}
        </h3>
        <div className="kid-confirm-body" id={bodyId}>
          {paragraphs.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
        {children}
        {error && (
          <p role="alert" className="settings-error">
            {error}
          </p>
        )}
        <div className="kid-confirm-actions">
          <button ref={cancelRef} type="button" className="settings-ghost-btn kid-btn" disabled={busy} onClick={dismiss}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`library-add kid-btn${danger ? ' settings-danger-btn' : ''}`}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? busyLabel : primary}
          </button>
        </div>
      </div>
    </Modal>,
    document.body,
  );
}

// The copy for a guard's warnings (UX §8). The client writes the words it can
// know (it knows this page's protocol); the server's message carries the
// numbers it alone knows (addresses, account counts).
export function confirmCopy(
  warnings: SettingWarning[],
  set: Record<string, SettingValue>,
  protocol: string = window.location.protocol,
): { title: string; paragraphs: string[]; primary: string } {
  const parts = warnings.map((w) => copyFor(w, set, protocol));
  const first = parts[0];
  return {
    title: first.title,
    paragraphs: parts.flatMap((p) => p.paragraphs),
    primary: parts.length === 1 ? first.primary : 'Save',
  };
}

function copyFor(w: SettingWarning, set: Record<string, SettingValue>, protocol: string) {
  switch (w.code) {
    case 'cookie_secure_on':
      return {
        title: 'Turn on secure cookies?',
        paragraphs: [
          protocol === 'http:'
            ? "This page is on http://. After this, nobody can sign in here until it's on https://. People already signed in stay signed in until their sign-in runs out or they sign out."
            : 'On plain http://, nobody can sign in after this. People already signed in stay signed in until their sign-in runs out or they sign out.',
          'If you get locked out, see "Recovery" in the docs.',
        ],
        primary: 'Turn on',
      };
    case 'cookie_secure_off':
      return {
        title: 'Turn off secure cookies?',
        paragraphs: ['Only do this on plain http://. On https:// it makes sign-in cookies less safe.'],
        primary: 'Turn off',
      };
    case 'trusted_proxies': {
      const RISK = 'A wrong list makes everyone share one sign-in limit, or lets people fake their address.';
      return {
        title: 'Save trusted proxies?',
        paragraphs:
          w.currentAddress && w.newAddress
            ? [`Homepad sees you as ${w.currentAddress} now. With this list it would see ${w.newAddress}.`, RISK]
            : [w.message ?? RISK],
        primary: 'Save',
      };
    }
    case 'max_accounts_below_count': {
      const n = w.limit ?? set.HOMEPAD_MAX_ACCOUNTS;
      const counted = w.accounts !== undefined && w.pendingInvites !== undefined && w.limit !== undefined;
      return {
        title: 'Lower the account limit?',
        paragraphs: [
          counted
            ? `There are ${w.accounts} ${w.accounts === 1 ? 'account' : 'accounts'} and ${w.pendingInvites} pending ${w.pendingInvites === 1 ? 'invite' : 'invites'}. Nobody is removed. New accounts and invites are refused until there are fewer than ${w.limit}.`
            : (w.message ??
              'There are more accounts and pending invites than that. Nobody is removed. New accounts and invites are refused until there are fewer.'),
        ],
        primary: n !== undefined ? `Set limit to ${n}` : 'Set limit',
      };
    }
    case 'registration_open':
      return {
        title: 'Open sign-up?',
        paragraphs: ['Anyone who can open Homepad can make an account, including a kid who signs out.'],
        primary: 'Open sign-up',
      };
    default:
      return { title: 'Save this change?', paragraphs: [w.message ?? 'The server asks you to confirm this change.'], primary: 'Save' };
  }
}
