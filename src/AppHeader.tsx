import { useEffect, useRef, useState } from 'react';
import type { User } from './api';
import LauncherTrigger from './LauncherTrigger';
import { useServicesContext } from './services';
import UserMenu from './UserMenu';
import { CONTENT_WIDTH } from './layout';

// v13 — render the elapsed-since-last-refresh label. Seconds for the first
// minute, then whole minutes, capped at "5m+" so the text can never grow without
// bound (AC-004/AC-005). `seconds` is clamped at 0 so a tiny clock skew can't
// produce a negative.
export function formatUpdatedAgo(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m >= 5) return '5m+ ago';
  return `${m}m ago`;
}

// v13 — the "Updated X ago" freshness indicator. Reads the provider's
// lastUpdatedAt and self-ticks once a second (≤2s granularity, AC-004) so the
// label counts up in real time without any new fetch. Renders nothing until the
// first successful load (or when no provider is present — isolated tests).
function LastUpdated() {
  const ctx = useServicesContext();
  const lastUpdatedAt = ctx?.lastUpdatedAt ?? null;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (lastUpdatedAt == null) return;
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [lastUpdatedAt]);

  if (lastUpdatedAt == null) return null;
  const seconds = (now - lastUpdatedAt) / 1000;
  return (
    <span
      data-testid="status-last-updated"
      className="hidden whitespace-nowrap text-xs text-neutral-500 sm:inline dark:text-neutral-400"
    >
      Updated {formatUpdatedAgo(seconds)}
    </span>
  );
}

// v7 §6.1 — the decluttered top bar: a gradient "homepad" wordmark on the left
// and the single avatar UserMenu on the right. v8 §4.2 slots the launcher
// trigger between them (wordmark · search · avatar). v13 adds a small "Updated X
// ago" freshness label next to the avatar. The sticky/blur bar chrome is
// retained; everything else that used to live here moved into the menu.
// v17 — the header alert bell. Quiet at rest (no badge at 0 unread); a numeric
// bubble appears at ≥1, capped at "99+". Sits between the ⌘K trigger and the
// avatar (AC-001). aria-label carries the unread count for screen readers
// (AC-002). `bellRef` lets Home restore focus here when the panel closes.
function AlertBell({
  count,
  onClick,
  bellRef,
}: {
  count: number;
  onClick: () => void;
  bellRef?: React.Ref<HTMLButtonElement>;
}) {
  const label = count > 0 ? `Alert history, ${count} unread` : 'Alert history';
  return (
    <button
      ref={bellRef}
      type="button"
      data-testid="alert-bell"
      aria-label={label}
      onClick={onClick}
      className="alert-bell"
    >
      <svg aria-hidden="true" viewBox="0 0 20 20" className="alert-bell-glyph">
        <path
          d="M10 2a5 5 0 00-5 5v2.6l-1.1 2.2A1 1 0 004.8 14h10.4a1 1 0 00.9-1.4L15 9.6V7a5 5 0 00-5-5zm0 16a2.5 2.5 0 002.45-2h-4.9A2.5 2.5 0 0010 18z"
          fill="currentColor"
        />
      </svg>
      {count > 0 && (
        <span data-testid="alert-bell-badge" aria-hidden="true" className="alert-bell-badge">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}

// v18 — the Gear menu trigger. Opens a dropdown with all edit-dashboard actions
// for the current user's role (replacing #166's bare Arrange toggle). The icon
// highlights whenever any edit mode is active (arrange OR editMode), so the
// ambient "editing is on" signal survives the menu being closed (D7). The
// `aria-haspopup="menu"` here replaces the old `aria-pressed` toggle (D1).
function GearMenuTrigger({
  anyModeActive,
  open,
  triggerRef,
  onClick,
}: {
  anyModeActive: boolean;
  open: boolean;
  triggerRef: React.Ref<HTMLButtonElement>;
  onClick: () => void;
}) {
  return (
    <button
      ref={triggerRef}
      type="button"
      data-testid="settings-gear"
      aria-label="Edit dashboard"
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={onClick}
      className={`flex h-11 w-11 items-center justify-center rounded-full outline-none transition hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-neutral-800 ${
        anyModeActive
          ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400'
          : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
      }`}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
        <circle cx="12" cy="12" r="3" />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
        />
      </svg>
    </button>
  );
}

// v18 — the Gear dropdown. Carries every edit-dashboard action, grouped into an
// unlabeled personal section (all users) and an amber "Admin editing" section
// (admins only), reusing the UserMenu shield/amber visual language (D2). Toggle
// items (Arrange tiles, Edit tiles) show a trailing checkmark when active and,
// like the direct actions, close the menu on click (D9 revised). `onClose` fires
// on outside click and Escape.
function GearMenu({
  isAdmin,
  arrange,
  editMode,
  triggerRef,
  onToggleArrange,
  onToggleEditMode,
  onAddApps,
  onAddCustomApp,
  onClose,
}: {
  isAdmin: boolean;
  arrange: boolean;
  editMode: boolean;
  triggerRef: React.RefObject<HTMLButtonElement>;
  onToggleArrange: () => void;
  onToggleEditMode: () => void;
  onAddApps: () => void;
  onAddCustomApp: () => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click + Escape (same pattern as UserMenu). The trigger is
  // excluded from the outside-click check so a click on the gear to dismiss the
  // menu doesn't close-then-immediately-reopen via the trigger's own toggle.
  // Escape additionally restores focus to the gear (A9); an outside click does
  // not steal focus from wherever the user clicked.
  useEffect(() => {
    function onDocPointer(e: MouseEvent) {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !triggerRef.current?.contains(t)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', onDocPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose, triggerRef]);

  // On open, move focus into the menu (first item) so keyboard users land inside
  // the popup — standard menu pattern, mirrors UserMenu.
  useEffect(() => {
    const first = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
    first?.focus();
  }, []);

  function act(fn: () => void) {
    fn();
    onClose();
  }

  return (
    <div ref={menuRef} data-testid="gear-menu" role="menu" aria-label="Edit dashboard" className="gear-menu">
      {/* Personal section — all users. */}
      <div data-testid="gear-menu-section-personal" className="menu-section-label">
        My Dashboard
      </div>

      <button
        type="button"
        role="menuitem"
        data-testid="gear-arrange"
        onClick={() => act(onToggleArrange)}
        className="menu-item"
      >
        <ArrangeIcon />
        Arrange tiles
        {arrange && <CheckIcon testid="gear-arrange-check" />}
      </button>

      <button
        type="button"
        role="menuitem"
        data-testid="gear-add-apps"
        onClick={() => act(onAddApps)}
        className="menu-item"
      >
        <PlusIcon />
        Add apps
      </button>

      {/* Admin editing section — admins only, amber/shield (D2/D5/D6). */}
      {isAdmin && (
        <>
          <div className="menu-sep" />
          <div data-testid="gear-menu-section-admin" className="menu-administration-section">
            <ShieldIcon />
            Admin editing
          </div>

          <button
            type="button"
            role="menuitem"
            data-testid="gear-edit-tiles"
            onClick={() => act(onToggleEditMode)}
            className="menu-item"
          >
            <PencilIcon />
            Edit tiles
            {editMode && <CheckIcon testid="gear-edit-tiles-check" />}
          </button>

          <button
            type="button"
            role="menuitem"
            data-testid="gear-add-custom-app"
            onClick={() => act(onAddCustomApp)}
            className="menu-item"
          >
            <PlusIcon />
            Add custom app
          </button>
        </>
      )}
    </div>
  );
}

// v18 menu icons — inline SVGs, aria-hidden; the item text carries the meaning.
function ArrangeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="menu-icon">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

// Trailing checkmark — pushed to the right edge (.menu-check) to signal a toggle
// item is active. `testid` lets a test assert the active state per item.
function CheckIcon({ testid }: { testid?: string }) {
  return (
    <svg data-testid={testid} aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="menu-icon menu-check">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12l4.5 4.5L19 6" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="menu-icon">
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v8M8 12h8" />
    </svg>
  );
}

// Copied from UserMenu.tsx (spec §4.1 allows copy-or-share); kept local so the
// Gear menu is self-contained.
function PencilIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="menu-icon">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="menu-icon" style={{ opacity: 1 }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
    </svg>
  );
}

export default function AppHeader({
  user,
  arrange = false,
  editMode = false,
  onToggleArrange = () => {},
  onToggleEditMode = () => {},
  onOpenLibrary = () => {},
  onOpenCustomAppForm = () => {},
  onOpenAdminSettings,
  onGoToDashboard,
  onLogout,
  alertCount,
  onAlertClick,
  bellRef,
}: {
  user: User;
  arrange?: boolean;
  editMode?: boolean;
  onToggleArrange?: () => void;
  onToggleEditMode?: () => void;
  onOpenLibrary?: () => void;
  onOpenCustomAppForm?: () => void;
  onOpenAdminSettings: () => void;
  onGoToDashboard: () => void;
  onLogout: () => void;
  alertCount: number;
  onAlertClick: () => void;
  bellRef?: React.Ref<HTMLButtonElement>;
}) {
  // v18 — the Gear owns its own dropdown open-state here. Escape restores focus
  // to the trigger (gearRef); every action closes the menu via onClose.
  const [gearOpen, setGearOpen] = useState(false);
  const gearRef = useRef<HTMLButtonElement>(null);
  const isAdmin = user.role === 'admin';
  const anyModeActive = arrange || editMode;

  // Escape's focus-restore is handled inside GearMenu; closing here just drops
  // the open-state so an outside click doesn't yank focus back to the gear.
  function closeGear() {
    setGearOpen(false);
  }

  return (
    <header className="sticky top-0 z-20 border-b border-neutral-200/70 bg-white/70 backdrop-blur dark:border-neutral-800/70 dark:bg-neutral-900/70">
      <div className={`${CONTENT_WIDTH} flex items-center justify-between gap-3 py-3`}>
        <span className="wordmark">homepad</span>
        <LauncherTrigger />
        <div className="flex items-center gap-3">
          <LastUpdated />
          <div className="relative">
            <GearMenuTrigger
              anyModeActive={anyModeActive}
              open={gearOpen}
              triggerRef={gearRef}
              onClick={() => setGearOpen((o) => !o)}
            />
            {gearOpen && (
              <GearMenu
                isAdmin={isAdmin}
                arrange={arrange}
                editMode={editMode}
                triggerRef={gearRef}
                onToggleArrange={onToggleArrange}
                onToggleEditMode={onToggleEditMode}
                onAddApps={onOpenLibrary}
                onAddCustomApp={onOpenCustomAppForm}
                onClose={closeGear}
              />
            )}
          </div>
          <AlertBell count={alertCount} onClick={onAlertClick} bellRef={bellRef} />
          <UserMenu
            user={user}
            onOpenAdminSettings={onOpenAdminSettings}
            onGoToDashboard={onGoToDashboard}
            onLogout={onLogout}
          />
        </div>
      </div>
    </header>
  );
}
