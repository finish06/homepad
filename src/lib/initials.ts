// v7 §6.2 — derive the avatar's real initials from the user's display name:
// first letter of the first word + first letter of the last word (e.g.
// "Caleb Dunn" → "CD"); a single name word uses its first two letters
// ("Caleb" → "CA"); with no usable name, fall back to the email's first letter.
// Always uppercased. Kept as a standalone util so the rule is unit-tested
// independently of the menu UI that renders it.
export function userInitials(user: { name?: string; email: string }): string {
  const name = (user.name ?? '').trim();
  if (name) {
    const words = name.split(/\s+/);
    const first = words[0];
    const last = words[words.length - 1];
    const initials = words.length === 1 ? first.slice(0, 2) : first[0] + last[0];
    return initials.toUpperCase();
  }
  return (user.email[0] ?? '?').toUpperCase();
}
