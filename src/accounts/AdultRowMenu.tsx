import { lazy, Suspense, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { Account } from '../api';
import ChunkErrorBoundary from '../ui/ChunkErrorBoundary';

// SPEC-household-manage-adults UX §2 — the "Manage ▾" menu on every other
// adult's row (AC-010). It holds every adult action: the role change, Make a
// reset link and Remove. Nothing happens straight from the menu: the role and
// Remove items open a confirm, and Make a reset link opens its dialog.
//
// SPEC-password-reset-link UX §2.1 — "Make a reset link" sits second, after
// the role item and before the divider. It shows only on an adult with a
// password (AC-018, AC-021): an SSO-only account has nothing to reset, and an
// older API that omits hasPassword reads as no password. Your own row and kid
// rows have no menu, so they never show it (AC-003).
//
// The keyboard model is the user menu's (UX §6): Enter, Space or ↓ opens on
// the first item, ↑ on the last; ↑/↓ wrap; Home/End jump; Escape closes and
// returns focus here, and stops there so the Admin Panel stays open; Tab
// (focus leaving the menu) and a click outside close it.
//
// The confirm loads on demand, like BackupSection's RestoreModal, so this
// module adds nothing to the entry chunk (UX §1). So does the reset-link
// dialog (SPEC-password-reset-link UX §1).
const AdultConfirm = lazy(() => import('./AdultConfirm'));
const ResetLinkDialog = lazy(() => import('./ResetLinkDialog'));

export type AdultAction = 'admin' | 'member' | 'remove';

type OpenAt = 'first' | 'last';

// clipBounds — the visible vertical band the menu must fit in: the viewport,
// narrowed by every ancestor that clips or scrolls (the Admin Panel body).
function clipBounds(el: HTMLElement): { top: number; bottom: number } {
  let top = 0;
  let bottom = window.innerHeight;
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (/(auto|scroll|hidden)/.test(getComputedStyle(p).overflowY)) {
      const r = p.getBoundingClientRect();
      top = Math.max(top, r.top);
      bottom = Math.min(bottom, r.bottom);
    }
  }
  return { top, bottom };
}

export default function AdultRowMenu({
  account,
  pendingInvites,
  oidcEnabled,
  buttonRef,
  onRoleChanged,
  onRemoved,
  onStale,
}: {
  account: Account;
  // The pending invites this adult made, for the Remove confirm (Q3).
  pendingInvites: number;
  oidcEnabled: boolean;
  // AccountsSection keeps every Manage button, to move focus after a removal.
  buttonRef: (el: HTMLButtonElement | null) => void;
  onRoleChanged: (a: Account) => void;
  onRemoved: (a: Account) => void;
  // A confirm closed after a stale answer (last_admin, self, 404): reload.
  onStale: () => void;
}) {
  const [openAt, setOpenAt] = useState<OpenAt | null>(null);
  const [up, setUp] = useState(false);
  const [action, setAction] = useState<AdultAction | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const btnId = useId();
  const open = openAt !== null;

  function close(refocus: boolean) {
    setOpenAt(null);
    if (refocus) btnRef.current?.focus();
  }

  // A click outside closes it. The button toggles on its own click.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !btnRef.current?.contains(t)) setOpenAt(null);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // Under the button, right-aligned; above it when there's no room below.
  useLayoutEffect(() => {
    if (!open || !menuRef.current || !btnRef.current) return;
    const m = menuRef.current.getBoundingClientRect();
    const b = btnRef.current.getBoundingClientRect();
    const bounds = clipBounds(btnRef.current);
    const below = bounds.bottom - b.bottom;
    const above = b.top - bounds.top;
    setUp(m.height > below && above > below);
  }, [open]);

  useEffect(() => {
    if (!openAt) return;
    const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    if (items?.length) items[openAt === 'last' ? items.length - 1 : 0].focus();
  }, [openAt]);

  function onButtonKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpenAt(e.key === 'ArrowUp' ? 'last' : 'first');
    }
  }

  function onMenuKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      // One press, one layer: the Admin Panel beneath must not see it.
      e.preventDefault();
      e.stopPropagation();
      close(true);
      return;
    }
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const at = items.indexOf(document.activeElement as HTMLElement);
    let next: number | null = null;
    if (e.key === 'ArrowDown') next = (at + 1) % items.length;
    else if (e.key === 'ArrowUp') next = (at - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    if (next === null) return;
    e.preventDefault();
    items[next].focus();
  }

  function choose(a: AdultAction) {
    setOpenAt(null);
    setAction(a);
  }

  const isAdmin = account.role === 'admin';
  const canReset = account.hasPassword === true;

  return (
    <div className="adult-menu-wrap">
      <button
        ref={(el) => {
          btnRef.current = el;
          buttonRef(el);
        }}
        id={btnId}
        type="button"
        className="settings-ghost-btn adult-menu-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Manage ${account.name}`}
        onClick={() => (open ? close(false) : setOpenAt('first'))}
        onKeyDown={onButtonKeyDown}
      >
        Manage <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-labelledby={btnId}
          className={`user-menu adult-menu${up ? ' adult-menu--up' : ''}`}
          onKeyDown={onMenuKeyDown}
          // Items are reached with the arrow keys (tabIndex -1), so Tab leaves
          // the menu, and focus moving out closes it. Focus moving to
          // the button is left to the button's own click, which toggles.
          onBlur={(e) => {
            const to = e.relatedTarget as Node | null;
            if (!menuRef.current?.contains(to) && !btnRef.current?.contains(to)) setOpenAt(null);
          }}
        >
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            className="menu-item"
            onClick={() => choose(isAdmin ? 'member' : 'admin')}
          >
            {isAdmin ? 'Make member' : 'Make admin'}
          </button>
          {canReset && (
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              className="menu-item"
              onClick={() => {
                setOpenAt(null);
                setResetOpen(true);
              }}
            >
              Make a reset link
            </button>
          )}
          <div role="separator" className="menu-sep" />
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            className="menu-item menu-item-danger"
            onClick={() => choose('remove')}
          >
            {`Remove ${account.name}…`}
          </button>
        </div>
      )}

      {action && (
        <ChunkErrorBoundary
          onClose={() => {
            setAction(null);
            btnRef.current?.focus();
          }}
        >
        <Suspense fallback={null}>
          <AdultConfirm
            action={action}
            account={account}
            pendingInvites={pendingInvites}
            oidcEnabled={oidcEnabled}
            onCancel={() => {
              setAction(null);
              btnRef.current?.focus();
            }}
            onStale={() => {
              setAction(null);
              onStale();
            }}
            onDone={(updated) => {
              setAction(null);
              if (action === 'remove') {
                onRemoved(account);
              } else {
                onRoleChanged(updated);
                btnRef.current?.focus();
              }
            }}
          />
        </Suspense>
        </ChunkErrorBoundary>
      )}

      {resetOpen && (
        <ChunkErrorBoundary
          onClose={() => {
            setResetOpen(false);
            btnRef.current?.focus();
          }}
        >
        <Suspense fallback={null}>
          <ResetLinkDialog
            account={account}
            // UX §5 — on close, focus returns to this row's Manage button.
            onClose={() => {
              setResetOpen(false);
              btnRef.current?.focus();
            }}
            onGone={onStale}
          />
        </Suspense>
        </ChunkErrorBoundary>
      )}
    </div>
  );
}
