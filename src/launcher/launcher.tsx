// v8 §4 — launcher open-state + the global hotkey. Kept tiny and separate from
// the dialog UI (CommandLauncher) so a single provider owns "is the launcher
// open?", captures the element to restore focus to on close, and installs the
// ⌘K / Ctrl+K / `/` global shortcut exactly once. The on-screen trigger
// (slice 3) and the dialog both read this via useLauncher().

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

type LauncherContextValue = {
  open: boolean;
  // open() captures document.activeElement so close() can restore focus to
  // whatever the user was on (the trigger button in the common case, §4.3).
  openLauncher: () => void;
  closeLauncher: () => void;
};

const LauncherContext = createContext<LauncherContextValue | null>(null);

// A `/` press should NOT open the launcher while the user is typing — only when
// focus is on a non-editable host (§4.1, D4). ⌘K/Ctrl+K is exempt (explicit
// chord, safe mid-form).
function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return el.isContentEditable;
}

export function LauncherProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  // The element to restore focus to when the launcher closes. Captured at open
  // time (whatever had focus then), so Esc/scrim-close land the user back where
  // they were rather than on <body>.
  const restoreRef = useRef<HTMLElement | null>(null);

  const openLauncher = useCallback(() => {
    setOpen((isOpen) => {
      // Only capture the restore target on a real closed→open transition (not on
      // a no-op second ⌘K, §4.1), and before the dialog steals focus.
      if (!isOpen) {
        const active = document.activeElement;
        restoreRef.current = active instanceof HTMLElement ? active : null;
      }
      return true;
    });
  }, []);

  const closeLauncher = useCallback(() => setOpen(false), []);

  // Restore focus to the pre-open element once the dialog has unmounted (§4.3).
  // Doing it in an effect (after the commit that removes the dialog) means focus
  // lands on the trigger/prior element rather than falling through to <body>.
  useEffect(() => {
    if (!open && restoreRef.current) {
      restoreRef.current.focus();
      restoreRef.current = null;
    }
  }, [open]);

  // The single global shortcut listener. ⌘K / Ctrl+K open from anywhere
  // (preventDefault so the browser's own Cmd/Ctrl-K doesn't fire); `/` opens
  // only when not typing. While already open these are a no-op — Esc (owned by
  // the dialog) is the close affordance.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isChord = (e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K');
      if (isChord) {
        e.preventDefault();
        openLauncher();
        return;
      }
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingTarget(e.target)) {
        e.preventDefault();
        openLauncher();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [openLauncher]);

  return (
    <LauncherContext.Provider value={{ open, openLauncher, closeLauncher }}>
      {children}
    </LauncherContext.Provider>
  );
}

export function useLauncher(): LauncherContextValue {
  const ctx = useContext(LauncherContext);
  if (!ctx) throw new Error('useLauncher must be used within a LauncherProvider');
  return ctx;
}
