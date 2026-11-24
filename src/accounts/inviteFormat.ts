// SPEC-household-basics UX §3 — invite copy helpers shared by the Accounts list
// and the Add-an-adult dialog.

// endDay — "Nov 14": when a link stops working.
export function endDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// roleLabel — the UI never says "user": that role reads "member" (AC-021).
// The API says `member` since 18.4.0; `user` is still read as it (#599).
export function roleLabel(role: string): string {
  return role === 'user' ? 'member' : role;
}
