import type { User } from './api';
import LauncherTrigger from './LauncherTrigger';
import UserMenu from './UserMenu';

// v7 §6.1 — the decluttered top bar: a gradient "homepad" wordmark on the left
// and the single avatar UserMenu on the right. v8 §4.2 slots the launcher
// trigger between them (wordmark · search · avatar). The sticky/blur bar chrome
// is retained; everything else that used to live here moved into the menu.
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
        <UserMenu
          user={user}
          onToggleEdit={onToggleEdit}
          onOpenAdminSettings={onOpenAdminSettings}
          onGoToDashboard={onGoToDashboard}
          onLogout={onLogout}
        />
      </div>
    </header>
  );
}
