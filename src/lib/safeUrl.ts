// Scheme allowlist for service/offer URLs rendered into anchors.
//
// React does not block `javascript:` hrefs (dev-warning only), and service
// URLs are stored data shared across users — a service saved with a
// `javascript:` URL would execute in the session of ANY user who clicks the
// tile (the ⌘K launcher even .click()s the anchor on Enter). Every render
// site must go through safeHref(); ServiceForm additionally rejects bad
// schemes at input time (UX only — the Go API must enforce the same
// allowlist server-side, the client is not the security boundary).

const SAFE_PROTOCOLS = new Set(['http:', 'https:']);

export function isSafeUrl(url: string): boolean {
  try {
    // Base makes protocol-relative and path-only values parse (and resolve
    // to http/https, which is what the browser would do with them too).
    return SAFE_PROTOCOLS.has(new URL(url, window.location.origin).protocol);
  } catch {
    return false;
  }
}

// For href attributes: pass a safe URL through, neutralize anything else.
export function safeHref(url: string): string {
  return isSafeUrl(url) ? url : '#';
}
