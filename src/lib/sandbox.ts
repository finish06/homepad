import type { Service } from '../api';
import { safeHref } from './safeUrl';

// SPEC-iframe-sandbox-optin §2 — the overlay's sandbox, and the one origin
// check the overlay and the tile editor share (UX §2.4 "one shared function").
//
// allow-scripts + allow-same-origin on a page from Homepad's own origin lets
// that page's scripts act as Homepad (spec §3.1). So the frame keeps the app's
// own origin only when an admin opted the app in ("Let this app keep its
// sign-in") AND the app is on another origin. Nothing here ever adds
// allow-top-navigation or allow-popups-to-escape-sandbox (AC-003).
//
// Imported only by the lazy IframeOverlay and TileEditModal chunks: the entry
// chunk must not import it (UX §1 "Bundle").

const STRICT = 'allow-scripts allow-forms allow-popups';
const KEEP_ORIGIN = 'allow-scripts allow-same-origin allow-forms allow-popups';

// 'other' — another origin than this Homepad page; 'same' — this Homepad's
// own scheme, host and port; 'unparseable' — not a full http(s) address.
export type AddressKind = 'other' | 'same' | 'unparseable';

// §2.3 — compared after safeHref and new URL(...), with no base: a bare path
// or a half-typed address is not a full address, so it fails closed.
export function addressKind(url: string, pageOrigin: string = window.location.origin): AddressKind {
  let origin: string;
  try {
    origin = new URL(safeHref(url)).origin;
  } catch {
    return 'unparseable';
  }
  return origin === pageOrigin ? 'same' : 'other';
}

export function sandboxFor(
  service: Pick<Service, 'url' | 'iframeSameOrigin'>,
  pageOrigin: string = window.location.origin,
): string {
  return service.iframeSameOrigin === true && addressKind(service.url, pageOrigin) === 'other' ? KEEP_ORIGIN : STRICT;
}
