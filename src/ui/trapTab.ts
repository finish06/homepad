import type { KeyboardEvent } from 'react';

// Keep Tab / Shift+Tab inside an aria-modal layer: from the last focusable
// control Tab wraps to the first, and Shift+Tab from the first wraps to the
// last. The same rule TileEditModal applies (its AC-012), shared here for the
// SPEC-kid-accounts editor and confirm. Call it from the layer's onKeyDown for
// key === 'Tab'.
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function trapTab(e: KeyboardEvent, root: HTMLElement | null): void {
  if (!root) return;
  const nodes = root.querySelectorAll<HTMLElement>(FOCUSABLE);
  if (nodes.length === 0) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}
