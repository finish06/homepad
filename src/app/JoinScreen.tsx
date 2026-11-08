import { useEffect, useId, useState, type ReactNode } from 'react';
import { acceptInvite, logout, lookupInvite, type InviteInfo, type User } from '../api';

// SPEC-household-basics AC-020, UX §4 — the Join screen, opened from an invite
// link (/#invite=…). It is the sign-in card again, in one of four states:
// already signed in (ask first), loading, live (the join form) and dead. The
// API gives one 404 for every dead link, so the card gives one message too.
// App reads the token from the fragment and removes it from the address bar
// before this mounts; the token is sent only in POST bodies.

type Phase =
  | { kind: 'ask' }
  | { kind: 'loading' }
  | { kind: 'live'; invite: InviteInfo }
  | { kind: 'dead' }
  | { kind: 'retry' };

const TOO_MANY = 'Too many tries. Wait a minute and try again.';

function endDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function JoinScreen({
  token,
  user,
  onJoined,
  onLeave,
  onSignedOut,
}: {
  token: string;
  // The account already signed in on this browser, if any.
  user: User | null;
  // Joined: the new adult is signed in.
  onJoined: (u: User) => void;
  // Drop the invite: back to the dashboard, or to the sign-in card.
  onLeave: () => void;
  // "Sign out and continue" ended the existing session.
  onSignedOut: () => void;
}) {
  const [phase, setPhase] = useState<Phase>(user ? { kind: 'ask' } : { kind: 'loading' });

  useEffect(() => {
    if (phase.kind !== 'loading') return;
    let live = true;
    lookupInvite(token).then((r) => {
      if (!live) return;
      if (r.ok && r.invite) setPhase({ kind: 'live', invite: r.invite });
      else if (r.status === 404) setPhase({ kind: 'dead' });
      else setPhase({ kind: 'retry' });
    });
    return () => {
      live = false;
    };
  }, [phase.kind, token]);

  async function signOutAndContinue() {
    await logout();
    onSignedOut();
    setPhase({ kind: 'loading' });
  }

  let body: ReactNode;
  switch (phase.kind) {
    case 'ask':
      body = (
        <Card title="Join Homepad">
          <p className="auth-subtitle mt-1 text-sm">
            {`You're signed in as ${user?.name || user?.email}. Sign out to use this invite.`}
          </p>
          <button
            type="button"
            onClick={() => void signOutAndContinue()}
            className="auth-cta mt-5 flex min-h-[44px] w-full items-center justify-center py-2 text-sm font-semibold"
          >
            Sign out and continue
          </button>
          <button
            type="button"
            onClick={onLeave}
            className="auth-secondary mt-3 flex min-h-[44px] w-full items-center justify-center text-sm"
          >
            Keep me here
          </button>
        </Card>
      );
      break;
    case 'loading':
      // The card keeps the live form's height, so nothing jumps when it lands.
      body = (
        <Card title="Join Homepad" minHeight>
          <div role="status" className="mt-8 flex justify-center">
            <span className="auth-spin" aria-hidden="true" />
            <span className="sr-only">Checking your invite…</span>
          </div>
        </Card>
      );
      break;
    case 'dead':
      body = (
        <Card title="This invite link doesn't work anymore.">
          <p className="auth-subtitle mt-2 text-sm">Ask for a new one.</p>
          <button
            type="button"
            onClick={onLeave}
            className="auth-cta mt-5 flex min-h-[44px] w-full items-center justify-center py-2 text-sm font-semibold"
          >
            Go to sign in
          </button>
        </Card>
      );
      break;
    case 'retry':
      body = (
        <Card title="Join Homepad">
          <p className="auth-error mt-3 text-sm">{TOO_MANY}</p>
          <button
            type="button"
            onClick={() => setPhase({ kind: 'loading' })}
            className="auth-cta mt-5 flex min-h-[44px] w-full items-center justify-center py-2 text-sm font-semibold"
          >
            Try again
          </button>
        </Card>
      );
      break;
    case 'live':
      body = (
        <JoinForm
          token={token}
          invite={phase.invite}
          onJoined={onJoined}
          onLeave={onLeave}
          onDead={() => setPhase({ kind: 'dead' })}
        />
      );
      break;
  }

  return (
    <main className="app-surface auth-main font-sans">
      {body}
      <p className="auth-footer" data-testid="auth-footer">
        homepad v{__APP_VERSION__}
      </p>
    </main>
  );
}

function Logo() {
  return (
    <div className="auth-logo mb-4 inline-flex">
      <img src="/icon-192.png" alt="homepad" className="h-11 w-11 rounded-xl" />
    </div>
  );
}

function Card({ title, minHeight = false, children }: { title: string; minHeight?: boolean; children: ReactNode }) {
  return (
    <div className="auth-card" style={minHeight ? { minHeight: 420 } : undefined}>
      <Logo />
      <h1 className="auth-title text-xl font-semibold">{title}</h1>
      {children}
    </div>
  );
}

function JoinForm({
  token,
  invite,
  onJoined,
  onLeave,
  onDead,
}: {
  token: string;
  invite: InviteInfo;
  onJoined: (u: User) => void;
  onLeave: () => void;
  onDead: () => void;
}) {
  const [name, setName] = useState(invite.name);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [emailTaken, setEmailTaken] = useState(false);
  const [error, setError] = useState('');
  const hintId = useId();
  const takenId = useId();

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setEmailTaken(false);
    const r = await acceptInvite({ token, email, password, name: name.trim() || invite.name });
    setBusy(false);
    if (r.ok && r.user) return onJoined(r.user);
    if (r.status === 404) return onDead();
    if (r.status === 409) return setEmailTaken(true);
    if (r.status === 429) return setError(TOO_MANY);
    if (r.status === 400 && r.error) return setError(r.error);
    setError("Couldn't join. Try again.");
  }

  return (
    <form onSubmit={join} className="auth-card">
      <Logo />
      <h1 className="auth-title text-xl font-semibold">Join Homepad</h1>
      <p className="auth-subtitle mt-1 text-sm">{`${invite.inviterName} invited you.`}</p>
      <p className="auth-subtitle text-sm">{invite.role === 'admin' ? "You'll be an admin." : "You'll be a member."}</p>

      <label className="auth-label mt-5 block text-[13px] font-medium">
        Name
        <input
          required
          autoComplete="name"
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="auth-field mt-1.5 min-h-[44px] w-full"
        />
      </label>

      <label className="auth-label mt-4 block text-[13px] font-medium">
        Email
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="you@home.lan"
          value={email}
          aria-invalid={emailTaken || undefined}
          aria-describedby={emailTaken ? takenId : undefined}
          onChange={(e) => {
            setEmail(e.target.value);
            setEmailTaken(false);
          }}
          className="auth-field mt-1.5 min-h-[44px] w-full"
        />
      </label>
      {emailTaken && (
        <p id={takenId} className="auth-error mt-1.5 text-sm">
          That email already has an account. Sign in instead.{' '}
          <button type="button" onClick={onLeave} className="auth-link underline">
            Sign in
          </button>
        </p>
      )}

      <label className="auth-label mt-4 block text-[13px] font-medium">
        Password
        <input
          type="password"
          required
          autoComplete="new-password"
          placeholder="••••••••"
          value={password}
          aria-describedby={hintId}
          onChange={(e) => setPassword(e.target.value)}
          className="auth-field mt-1.5 min-h-[44px] w-full"
        />
      </label>
      <p id={hintId} className="auth-subtitle mt-1.5 text-xs">
        At least 8 characters.
      </p>

      {error && <p className="auth-error mt-3 text-sm">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="auth-cta mt-5 flex min-h-[44px] w-full items-center justify-center gap-2 py-2 text-sm font-semibold"
      >
        {busy ? (
          <>
            <span className="auth-spin" aria-hidden="true" />
            Joining…
          </>
        ) : (
          'Join'
        )}
      </button>
      <p className="auth-subtitle mt-3 text-xs">{`The link ends ${endDay(invite.expiresAt)}.`}</p>
    </form>
  );
}
