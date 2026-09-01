// Modal — the ONE modal scrim + dismiss-behavior owner (P2.2 in
// docs/reviews/2026-08-30-maintainability-review.md: the scrim/Escape/focus
// dance was hand-rolled eight-plus times with subtle drift — some restored
// opener focus, some didn't; one used onMouseDown, the rest onClick; only one
// locked body scroll).
//
// Deliberately a SHELL, not a dialog factory: the caller renders its own
// dialog element as children (a <div> or a <form>, with its own ref, testids,
// aria-label and key handling), so every existing DOM contract and test
// selector survives verbatim. What Modal unifies:
//   - the scrim div (className/testid from props) and scrim-dismiss: the
//     handler fires only when the event lands on the scrim itself, never
//     bubbling out of the panel;
//   - Escape → onDismiss via a document-level listener (works regardless of
//     where focus sits; components with conditional dismiss — e.g. a dirty
//     form's confirm step — pass that logic AS their onDismiss);
//   - optional focus-restore to the previously-focused element on unmount;
//   - optional body-scroll lock while open.
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';

export default function Modal({
  onDismiss,
  overlayClassName,
  overlayTestId,
  dismissOn = 'click',
  escapeDismisses = true,
  restoreFocus = false,
  lockScroll = false,
  overlayKeyDown,
  children,
}: {
  onDismiss: () => void;
  overlayClassName: string;
  overlayTestId?: string;
  // TileEditModal-style overlays dismiss on mousedown so a drag that ENDS on
  // the scrim (text selection out of an input) doesn't count as a click-away.
  dismissOn?: 'click' | 'mousedown';
  escapeDismisses?: boolean;
  restoreFocus?: boolean;
  lockScroll?: boolean;
  overlayKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
  children: ReactNode;
}) {
  // Latest onDismiss without re-binding the document listener every render.
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    if (!escapeDismisses) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') dismissRef.current();
    };
    // window, not document: document-dispatched events bubble up to window,
    // so this catches both, and one existing suite fires Escape on window.
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [escapeDismisses]);

  useEffect(() => {
    if (!restoreFocus) return;
    const opener = document.activeElement as HTMLElement | null;
    return () => opener?.focus?.();
  }, [restoreFocus]);

  useEffect(() => {
    if (!lockScroll) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [lockScroll]);

  const scrimHandler = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onDismiss();
  };

  return (
    <div
      className={overlayClassName}
      data-testid={overlayTestId}
      onClick={dismissOn === 'click' ? scrimHandler : undefined}
      onMouseDown={dismissOn === 'mousedown' ? scrimHandler : undefined}
      onKeyDown={overlayKeyDown}
    >
      {children}
    </div>
  );
}
