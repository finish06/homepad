import { useCallback, type KeyboardEvent, type RefObject } from 'react';

// SPEC-ui-quick-wins §3.4 / AC-010 — the one arrow-key model for the app's
// dropdown menus (the user menu and the Gear menu).
//
// It walks every menuitem AND menuitemcheckbox: the Gear's "Arrange apps" is a
// checkbox item, and a menuitem-only walk skipped it. Anything else inside the
// menu (the user menu's Appearance controls, a role="group" reached by Tab) is
// left out of the arrow order on purpose.
//
// ArrowDown / ArrowUp move and wrap at the ends; Home / End jump to the first
// and last item. Escape is not handled here: each menu already closes on it
// and returns focus to its own trigger.
export const MENU_ITEM_SELECTOR = '[role="menuitem"], [role="menuitemcheckbox"]';

export function menuItems(menu: HTMLElement | null): HTMLElement[] {
  return Array.from(menu?.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR) ?? []);
}

// Focus the first item: where keyboard users land when a menu opens.
export function focusFirstMenuItem(menu: HTMLElement | null): void {
  menuItems(menu)[0]?.focus();
}

export function useMenuKeys(menuRef: RefObject<HTMLElement>) {
  return useCallback(
    (e: KeyboardEvent) => {
      const { key } = e;
      if (key !== 'ArrowDown' && key !== 'ArrowUp' && key !== 'Home' && key !== 'End') return;
      const items = menuItems(menuRef.current);
      if (items.length === 0) return;
      e.preventDefault();
      const idx = items.indexOf(document.activeElement as HTMLElement);
      let next: number;
      if (key === 'Home') next = 0;
      else if (key === 'End') next = items.length - 1;
      // From outside the item list (e.g. the theme group), ArrowDown starts at
      // the top and ArrowUp at the bottom.
      else if (idx === -1) next = key === 'ArrowDown' ? 0 : items.length - 1;
      else next = (idx + (key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next].focus();
    },
    [menuRef],
  );
}
