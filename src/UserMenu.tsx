import { useEffect, useRef, useState } from 'react';
import type { User } from './api';
import ThemeControl from './ThemeControl';
import { userInitials } from './initials';

// v7 §6 — the single account affordance that replaces the old six-control bar.
// Avatar trigger toggles a dropdown carrying identity, role, the theme control
// (reusing the existing ThemeControl/useTheme — no duplicated state), admin-only
// Edit dashboard, Personal settings, and Log out. A11y per §8: aria-haspopup/
// expanded on the trigger, role=menu/menuitem in the dropdown, Esc closes and
// restores focus, arrow keys move between items, and motion respects the OS.
export default function UserMenu({
  user,
  onToggleEdit,
  onToggleSettings,
  onOpenAdminSettings,
  onLogout,
}: {
  user: User;
  onToggleEdit: () => void;
  onToggleSettings: () => void;
  onOpenAdminSettings: () => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const isAdmin = user.role === 'admin';

  // Close on outside click; Esc closes and returns focus to the trigger (§8).
  useEffect(() => {
    if (!open) return;
    function onDocPointer(e: MouseEvent) {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !triggerRef.current?.contains(t)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', onDocPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // On open, move focus into the menu (first item) so keyboard users land inside
  // the popup — standard menu pattern.
  useEffect(() => {
    if (!open) return;
    const first = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
    first?.focus();
  }, [open]);

  // Arrow keys cycle focus between the menu items (§8). The theme control is a
  // separate role=group reached by Tab, so it's intentionally excluded here.
  function onMenuKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    if (items.length === 0) return;
    e.preventDefault();
    const idx = items.indexOf(document.activeElement as HTMLElement);
    const delta = e.key === 'ArrowDown' ? 1 : -1;
    const next = items[(idx + delta + items.length) % items.length] ?? items[0];
    next.focus();
  }

  // Each action closes the menu after firing (the theme control stays open so a
  // user can A/B themes — it isn't a menuitem).
  function choose(fn: () => void) {
    fn();
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        data-testid="user-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        title={user.email}
        onClick={() => setOpen((o) => !o)}
        className="user-avatar"
      >
        {userInitials(user)}
      </button>

      {open && (
        <div
          ref={menuRef}
          data-testid="user-menu"
          role="menu"
          aria-label="Account"
          onKeyDown={onMenuKeyDown}
          className="user-menu"
        >
          {/* 1. Identity header */}
          <div className="px-3 pb-2.5 pt-2.5">
            <div data-testid="user-menu-email" className="user-menu-email">
              {user.email}
            </div>
            <span data-testid="user-menu-role" className="role-pill">
              {user.role}
            </span>
          </div>

          <div className="menu-sep" />

          {/* 3. Appearance — reuse the existing theme control + state */}
          <div className="menu-label">Appearance</div>
          <div className="px-2 pb-1">
            <ThemeControl />
          </div>

          <div className="menu-sep" />

          {/* 5. Edit dashboard — admin only (rendered, not disabled, for users) */}
          {isAdmin && (
            <button
              type="button"
              role="menuitem"
              data-testid="menu-edit"
              onClick={() => choose(onToggleEdit)}
              className="menu-item"
            >
              <PencilIcon />
              Edit dashboard
            </button>
          )}

          {/* 6. Personal settings */}
          <button
            type="button"
            role="menuitem"
            data-testid="menu-settings"
            onClick={() => choose(onToggleSettings)}
            className="menu-item"
          >
            <GearIcon />
            Personal settings
          </button>

          {/* 6b. Admin settings — v9.3 §7.3 App Library mgmt + read-only system.
              Admin only (rendered, not disabled, for non-admins). */}
          {isAdmin && (
            <button
              type="button"
              role="menuitem"
              data-testid="menu-admin-settings"
              onClick={() => choose(onOpenAdminSettings)}
              className="menu-item"
            >
              <LibraryIcon />
              Admin settings
            </button>
          )}

          <div className="menu-sep" />

          {/* 8. Log out — danger style */}
          <button
            type="button"
            role="menuitem"
            data-testid="menu-logout"
            onClick={() => choose(onLogout)}
            className="menu-item menu-item-danger"
          >
            <LogoutIcon />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

// 16×16 leading icons (opacity handled by .menu-item). aria-hidden — the menu
// item's text label carries the meaning.
function PencilIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="menu-icon">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="menu-icon">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 0 1 1.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 0 1-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 0 1-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 0 1 .12-1.45l.773-.773a1.125 1.125 0 0 1 1.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}

function LibraryIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="menu-icon">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h6v14H4zM10 7l5-1 4 14-5 1z" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="menu-icon">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12H4m0 0 3.5-3.5M4 12l3.5 3.5M14 5h4a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-4" />
    </svg>
  );
}
