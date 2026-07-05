import { useEffect, useRef, useState } from 'react';
import type { User } from './api';
import ThemeControl from './ThemeControl';
import AccentControl from './AccentControl';
import { userInitials } from './initials';

// v7 §6 — the single account affordance that replaces the old six-control bar.
// Avatar trigger toggles a dropdown carrying identity, role, the theme control
// (reusing the existing ThemeControl/useTheme — no duplicated state), admin-only
// Edit dashboard, Personal settings, and Log out. A11y per §8: aria-haspopup/
// expanded on the trigger, role=menu/menuitem in the dropdown, Esc closes and
// restores focus, arrow keys move between items, and motion respects the OS.
export default function UserMenu({
  user,
  onOpenAdminSettings,
  onGoToDashboard,
  onLogout,
}: {
  user: User;
  onOpenAdminSettings: () => void;
  onGoToDashboard?: () => void;
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
        // #182 — the trigger box carries the >=44px touch target; the §6.2
        // 34×34 gradient disc lives on the inner span so the visual token is
        // unchanged while the hit area meets the design-system minimum.
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <span className="user-avatar user-avatar-disc">{userInitials(user)}</span>
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
          {/* Glass v2 — the ROYGBIV accent picker re-hues the backdrop blobs.
              Client-only (localStorage), applies instantly; see accent.ts. */}
          <div className="px-2 pb-1">
            <AccentControl />
          </div>

          <div className="menu-sep" />

          {/* v18 §4.3 — My Dashboard: a PERSONAL, purely navigational section,
              now SYMMETRIC for all roles. The admin "Edit dashboard" toggle moved
              to the Gear menu ("Edit tiles"), so this section carries only
              "Go to my dashboard" for both admins and non-admins. Non-admins keep
              the explanatory note beneath it. */}
          <div data-testid="menu-my-dashboard-section" className="menu-section-label">
            My Dashboard
          </div>
          {/* #96 — a real action, not a dead label: "Go to my dashboard" closes
              the menu and returns the user to the home screen (where favorites,
              reorder, and "+ Add apps" live). */}
          <button
            type="button"
            role="menuitem"
            data-testid="menu-go-dashboard"
            onClick={() => choose(onGoToDashboard ?? (() => {}))}
            className="menu-item"
          >
            <GridIcon />
            Go to my dashboard
            <span className="menu-scope-tag">personal</span>
          </button>
          {!isAdmin && (
            <p data-testid="menu-dashboard-note" className="menu-dashboard-note">
              These tiles and categories are the shared homelab catalog, managed
              by your admin. Favorite the ones you use most and arrange them on
              your home screen.
            </p>
          )}

          {/* v12 §4.1 D3/D4 — Administration: GLOBAL, admin-only. The shield +
              amber label now means exactly one thing — global state — and
              carries only "Admin settings." */}
          {isAdmin && (
            <>
              <div className="menu-sep" />
              <div data-testid="menu-administration-section" className="menu-administration-section">
                <ShieldIcon />
                Administration
              </div>
              {/* Admin settings — v9.3 §7.3 App Library mgmt + read-only system.
                  Controls global, cross-user state. */}
              <button
                type="button"
                role="menuitem"
                data-testid="menu-admin-settings"
                onClick={() => choose(onOpenAdminSettings)}
                className="menu-item"
              >
                <LibraryIcon />
                Admin settings
                <span className="menu-scope-tag menu-scope-tag--global">global</span>
              </button>
            </>
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
function GridIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="menu-icon">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />
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
