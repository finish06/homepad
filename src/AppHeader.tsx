import { useEffect, useState } from 'react';
import type { User } from './api';
import LauncherTrigger from './LauncherTrigger';
import { useServicesContext } from './services';
import UserMenu from './UserMenu';

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
export default function AppHeader({
  user,
  onToggleEdit,
  onOpenAdminSettings,
  onGoToDashboard,
  onLogout,
}: {
  user: User;
  onToggleEdit: () => void;
  onOpenAdminSettings: () => void;
  onGoToDashboard: () => void;
  onLogout: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-neutral-200/70 bg-white/70 backdrop-blur dark:border-neutral-800/70 dark:bg-neutral-900/70">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <span className="wordmark">homepad</span>
        <LauncherTrigger />
        <div className="flex items-center gap-3">
          <LastUpdated />
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
