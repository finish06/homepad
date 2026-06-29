import { useEffect, useState } from 'react';
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
      className="hidden whitespace-nowrap text-xs text-neutral-400 sm:inline dark:text-neutral-500"
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

// #166 — the per-user settings gear, the non-admin settings/controls entry point
// (v1 A5.1 / DECISIONS.md 2026-06-11). Shown to EVERY logged-in user (not
// admin-gated); distinct from the admin Edit toggle in the avatar menu. It hosts
// personal Arrange mode — `aria-pressed` reflects whether Arrange is on;
// activating it reveals the per-tile reorder grips so tiles can be dragged into
// a new order. (Favoriting + remove stay in each tile's always-on "⋯" menu.)
function SettingsGear({ arrange, onToggle }: { arrange: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      data-testid="settings-gear"
      aria-label="Personal settings"
      aria-pressed={arrange}
      onClick={onToggle}
      className={`flex h-9 w-9 items-center justify-center rounded-full outline-none transition hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-neutral-800 ${
        arrange
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

export default function AppHeader({
  user,
  arrange = false,
  onToggleArrange = () => {},
  onToggleEdit,
  onOpenAdminSettings,
  onGoToDashboard,
  onLogout,
  alertCount,
  onAlertClick,
  bellRef,
}: {
  user: User;
  arrange?: boolean;
  onToggleArrange?: () => void;
  onToggleEdit: () => void;
  onOpenAdminSettings: () => void;
  onGoToDashboard: () => void;
  onLogout: () => void;
  alertCount: number;
  onAlertClick: () => void;
  bellRef?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-neutral-200/70 bg-white/70 backdrop-blur dark:border-neutral-800/70 dark:bg-neutral-900/70">
      <div className={`${CONTENT_WIDTH} flex items-center justify-between gap-3 py-3`}>
        <span className="wordmark">homepad</span>
        <LauncherTrigger />
        <div className="flex items-center gap-3">
          <LastUpdated />
          <SettingsGear arrange={arrange} onToggle={onToggleArrange} />
          <AlertBell count={alertCount} onClick={onAlertClick} bellRef={bellRef} />
          <UserMenu
            user={user}
            onToggleEdit={onToggleEdit}
            onOpenAdminSettings={onOpenAdminSettings}
            onGoToDashboard={onGoToDashboard}
            onLogout={onLogout}
          />
        </div>
      </div>
    </header>
  );
}
