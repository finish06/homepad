import { Component, useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Modal from './Modal';
import { trapTab } from './trapTab';
import { reloadPage } from '../lib/reload';

// SPEC-ui-cleanup-18.3.0 AC-004 (#341) — the boundary around each lazy chunk.
//
// Every overlay and link screen is a React.lazy chunk behind <Suspense>. If the
// chunk fails to load (network drop, a deploy swapped the asset names mid
// session), the import rejects and React throws to the nearest error boundary.
// Without one, the whole app unmounts. This boundary catches it and shows a
// small dialog instead, so the dashboard behind it keeps working.
//
// Retry means a reload: React.lazy caches the rejected promise, so rendering
// the same lazy component again would fail again without a new fetch.
//
//   onClose  — an overlay: the dialog offers Close (the overlay's own exit) and Reload.
//   (none)   — a full screen (Join, reset link): the message and Reload only.
//   silent   — decoration (the glance strip): render nothing.

type Props = { children: ReactNode; onClose?: () => void; silent?: boolean };

export default class ChunkErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.silent) return null;
    if (this.props.onClose) return <LoadFailedDialog onClose={this.props.onClose} />;
    return (
      <main className="app-surface auth-main font-sans">
        <div className="auth-card" role="alert" data-testid="chunk-error">
          <p className="auth-title text-base font-semibold">{TITLE}</p>
          <p className="auth-subtitle mt-1 text-sm">{BODY}</p>
          <button
            type="button"
            className="auth-cta mt-5 flex min-h-[44px] w-full items-center justify-center py-2 text-sm font-semibold"
            onClick={reloadPage}
          >
            Reload
          </button>
        </div>
      </main>
    );
  }
}

const TITLE = "Couldn't load this";
const BODY = 'Check your connection, then reload the page.';

// The same small alertdialog card as the settings confirms (SettingsDialog):
// focus starts on Close, Tab stays inside, Escape closes.
function LoadFailedDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  return createPortal(
    <Modal onDismiss={onClose} overlayClassName="launcher-overlay add-offer-overlay kid-confirm-overlay">
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        data-testid="chunk-error"
        className="add-offer-panel kid-confirm-panel"
        onKeyDown={(e) => {
          if (e.key === 'Tab') {
            e.stopPropagation();
            trapTab(e, dialogRef.current);
          }
        }}
      >
        <h3 id={titleId} className="add-offer-title">
          {TITLE}
        </h3>
        <div className="kid-confirm-body" id={bodyId}>
          <p>{BODY}</p>
        </div>
        <div className="kid-confirm-actions">
          <button ref={closeRef} type="button" className="settings-ghost-btn kid-btn" onClick={onClose}>
            Close
          </button>
          <button type="button" className="library-add kid-btn" onClick={reloadPage}>
            Reload
          </button>
        </div>
      </div>
    </Modal>,
    document.body,
  );
}
