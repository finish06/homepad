// Copying text where the browser may not let the page use the clipboard.
//
// Browsers give navigator.clipboard only to secure pages (https, localhost).
// Homepad is often reached over plain http on a LAN address, where it is
// missing. Every Copy button uses these helpers, so none of them does nothing
// there (#584, #587):
//
// - canCopy: whether the Clipboard API is there at all. The invite and reset
//   link view (LinkOnce) checks it up front and shows the link selected instead.
// - copyText: tries the Clipboard API, then the older execCommand('copy'),
//   which plain-http pages still allow inside a click. False when neither did.
// - copyHint: what to tell the user when copyText is false and the text is
//   selected for them.

export function canCopy(): boolean {
  return window.isSecureContext === true && typeof navigator.clipboard?.writeText === 'function';
}

export function copyHint(): string {
  if (window.matchMedia?.('(pointer: coarse)').matches) return 'Press and hold to copy.';
  return /Mac|iPhone|iPad/.test(navigator.userAgent) ? 'Press ⌘C to copy.' : 'Press Ctrl+C to copy.';
}

export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator.clipboard?.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Refused (permissions, an insecure frame): try the older way.
    }
  }
  return execCopy(text);
}

// execCommand('copy') copies the selection, so the text goes in a hidden field
// for a moment. The field sits next to the focused button, inside its dialog,
// so a focus trap doesn't pull focus away. Focus goes back afterwards.
function execCopy(text: string): boolean {
  if (typeof document.execCommand !== 'function') return false;
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const field = document.createElement('textarea');
  field.value = text;
  field.readOnly = true;
  field.setAttribute('aria-hidden', 'true');
  field.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;';
  (active?.parentElement ?? document.body).appendChild(field);
  field.focus();
  field.select();
  let ok: boolean;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  field.remove();
  active?.focus();
  return ok;
}
