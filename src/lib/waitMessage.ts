// SPEC-signin-hardening UX §3.1 — the one 429 line. `seconds` is the server's
// Retry-After: missing, unreadable or a minute or less reads "a minute";
// longer reads whole minutes, rounded up. The sign-in card (entry chunk) and
// the lazy Join, reset and Change password screens all use it, so it stays
// this small.
export function waitMessage(seconds?: number): string {
  const minutes = Math.ceil((seconds ?? 0) / 60);
  return `Too many tries. Wait ${minutes > 1 ? `${minutes} minutes` : 'a minute'} and try again.`;
}
