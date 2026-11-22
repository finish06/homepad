import { accountLimitMessage } from '../lib/accountLimit';
import { waitMessage } from '../lib/waitMessage';

// SPEC-signin-hardening UX §2.3 — the line for each /#signin-error= code the
// API sends a failed single sign-on back with. A code is lower-case letters
// and underscores; anything else gets no line at all. An unknown code reads as
// sso_failed. AuthForm loads this module only when a code is present, so the
// copy stays out of the entry chunk (AC-020, UX S-1).
const SSO: Record<string, string> = {
  email_unverified: "Your identity provider hasn't confirmed your email. Ask your admin to mark it as verified.",
  not_invited: "You don't have a Homepad account yet. Ask your admin for an invite.",
  account_limit: accountLimitMessage(undefined),
  too_many: waitMessage(),
};

export function ssoMessage(code: string): string {
  if (!/^[a-z_]+$/.test(code)) return '';
  return SSO[code] ?? "Single sign-on didn't work. Try again.";
}
