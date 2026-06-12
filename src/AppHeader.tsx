import type { User } from './api';
import UserMenu from './UserMenu';

// v7 §6.1 — the decluttered top bar: a gradient "homepad" wordmark on the left
// and the single avatar UserMenu on the right. The sticky/blur bar chrome is
// retained; everything else that used to live here moved into the menu.
export default function AppHeader({
  user,
  onToggleEdit,
  onToggleSettings,
  onLogout,
}: {
  user: User;
  onToggleEdit: () => void;
  onToggleSettings: () => void;
  onLogout: () => void;
}) {
  return (
    <header className="sticky top-0 z-10 border-b border-neutral-200/70 bg-white/70 backdrop-blur dark:border-neutral-800/70 dark:bg-neutral-900/70">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <span className="wordmark">homepad</span>
        <UserMenu
          user={user}
          onToggleEdit={onToggleEdit}
          onToggleSettings={onToggleSettings}
          onLogout={onLogout}
        />
      </div>
    </header>
  );
}
