import type { Result } from '../api';

// SPEC-household-basics AC-029/AC-031 — HOMEPAD_MAX_ACCOUNTS. At the cap the API
// answers 409 with "account limit reached (limit N)". Any other 409 keeps its
// own meaning (a taken kid name, a taken email), so the text decides.
const CAP = /^account limit reached/i;

export function isAccountLimit(r: Pick<Result, 'ok' | 'status' | 'error'>): boolean {
  return !r.ok && r.status === 409 && CAP.test((r.error ?? '').trim());
}

// accountLimitMessage — the inline copy (UX §3.2). It names the number when
// the API gives one.
export function accountLimitMessage(error: string | undefined): string {
  const n = /limit (\d+)/i.exec(error ?? '')?.[1];
  if (!n) return 'This Homepad has reached its account limit.';
  return `This Homepad has reached its limit of ${n} ${n === '1' ? 'account' : 'accounts'}.`;
}
