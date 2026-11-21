// SPEC-password-reset-link UX §3.3 and §4.3 — the copy the reset screen, My
// settings → Password and the reset-link dialog share. Only lazy chunks import
// this module, so none of it lands in the entry.

export const PW_HINT = 'At least 8 characters.';
export const PW_MISMATCH = "The two passwords don't match.";

// newPasswordProblem — the line for a new password that breaks the rules, or
// null. It counts bytes, as the server does (bcrypt's 72-byte limit), so a
// password with emoji hits the maximum sooner. The copy says characters
// because that's what people count.
export function newPasswordProblem(pw: string): string | null {
  const bytes = new TextEncoder().encode(pw).length;
  if (bytes < 8) return 'Use at least 8 characters.';
  if (bytes > 72) return 'That password is too long. Use 72 characters or fewer.';
  return null;
}

// tooManyTries — the 429 line. `seconds` is Retry-After when the server sent
// one; under two minutes (or none) it reads "a minute".
export function tooManyTries(seconds?: number): string {
  const minutes = Math.ceil((seconds ?? 0) / 60);
  return `Too many tries. Wait ${minutes > 1 ? `${minutes} minutes` : 'a minute'} and try again.`;
}

// endTime — "Nov 21 at 3:40 PM", in the device's locale and 12/24-hour
// choice. A day alone is too vague for a link that works for 24 hours (R-4).
export function endTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at ${d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}
