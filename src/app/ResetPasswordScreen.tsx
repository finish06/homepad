import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { logout, type User } from '../api';
import { acceptReset, lookupReset, type ResetInfo } from '../passwordApi';
import { endTime, newPasswordProblem, PW_HINT, PW_MISMATCH, tooManyTries } from '../lib/passwordCopy';

// SPEC-password-reset-link AC-006…AC-009, AC-019, UX §3 — the reset screen,
// opened from a reset link (/#reset=…). It is the sign-in card again. App reads
// the token from the fragment and removes it from the address bar before this
// mounts; the token is sent only in POST bodies.
//
// The link is looked up first (looking up doesn't use it). Then: no session, or
// signed in as the same email, shows the form; signed in as someone else asks
// first (R-3). The API gives one 404 for every dead link, so the card gives one
// message too.

type Phase =
  | { kind: 'loading' }
  | { kind: 'ask'; info: ResetInfo }
  | { kind: 'live'; info: ResetInfo }
  | { kind: 'dead' }
  | { kind: 'retry' };

const TITLE = 'Set a new password';

export default function ResetPasswordScreen({
  token,
  user,
  onDone,
  onLeave,
  onSignedOut,
}: {
  token: string;
  // The account already signed in on this browser, if any.
  user: User | null;
  // Saved: this device is signed in as the account.
  onDone: (u: User) => void;
  // Drop the link: back to the dashboard, or to the sign-in card.
  onLeave: () => void;
  // "Sign out and continue" ended the existing session.
  onSignedOut: () => void;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [signedIn, setSignedIn] = useState(user !== null);

  useEffect(() => {
    if (phase.kind !== 'loading') return;
    let live = true;
    lookupReset(token).then((r) => {
      if (!live) return;
      if (r.ok && r.info) setPhase({ kind: user && user.email !== r.info.email ? 'ask' : 'live', info: r.info });
      else setPhase({ kind: r.status === 404 ? 'dead' : 'retry' });
    });
    return () => {
      live = false;
    };
    // `user` is read once per lookup: signing out moves to the form directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.kind, token]);

  async function signOutAndContinue(info: ResetInfo) {
    await logout();
    setSignedIn(false);
    onSignedOut();
    setPhase({ kind: 'live', info });
  }

  let body: ReactNode;
  switch (phase.kind) {
    case 'loading':
      // The card keeps the live form's height, so nothing jumps when it lands.
      body = (
        <Card title={TITLE} minHeight>
          <div role="status" className="mt-8 flex justify-center">
            <span className="auth-spin" aria-hidden="true" />
            <span className="sr-only">Checking your link…</span>
          </div>
        </Card>
      );
      break;
    case 'ask': {
      const info = phase.info;
      body = (
        <Card title={TITLE}>
          <p className="auth-subtitle mt-1 text-sm">
            {`You're signed in as ${user?.name || user?.email}. Sign out to use this reset link.`}
          </p>
          <button
            type="button"
            onClick={() => void signOutAndContinue(info)}
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
    }
    case 'dead':
      body = (
        <Card title="This reset link doesn't work anymore.">
          <p className="auth-subtitle mt-2 text-sm">Ask for a new one.</p>
          <button
            type="button"
            onClick={onLeave}
            className="auth-cta mt-5 flex min-h-[44px] w-full items-center justify-center py-2 text-sm font-semibold"
          >
            {signedIn ? 'Go to my dashboard' : 'Go to sign in'}
          </button>
        </Card>
      );
      break;
    case 'retry':
      body = (
        <Card title={TITLE}>
          <p className="auth-error mt-3 text-sm">{tooManyTries()}</p>
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
      body = <ResetForm token={token} info={phase.info} onDone={onDone} onDead={() => setPhase({ kind: 'dead' })} />;
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
    <div className="auth-card" style={minHeight ? { minHeight: 460 } : undefined}>
      <Logo />
      <h1 className="auth-title text-xl font-semibold">{title}</h1>
      {children}
    </div>
  );
}

type FieldErrors = { next?: string; again?: string; form?: string };

function ResetForm({
  token,
  info,
  onDone,
  onDead,
}: {
  token: string;
  info: ResetInfo;
  onDone: (u: User) => void;
  onDead: () => void;
}) {
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const nextRef = useRef<HTMLInputElement>(null);
  const againRef = useRef<HTMLInputElement>(null);
  const uid = useId();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    // The two client checks run on Save, never while typing.
    const problem = newPasswordProblem(next);
    if (problem) {
      setErrors({ next: problem });
      nextRef.current?.focus();
      return;
    }
    if (again !== next) {
      setErrors({ again: PW_MISMATCH });
      againRef.current?.focus();
      return;
    }
    setErrors({});
    setBusy(true);
    const r = await acceptReset(token, next);
    setBusy(false);
    if (r.ok && r.user) return onDone(r.user);
    if (r.status === 404) return onDead();
    setErrors({ form: r.status === 429 ? tooManyTries() : "Couldn't save the password. Try again." });
  }

  const describe = (...ids: (string | false | undefined)[]) => ids.filter(Boolean).join(' ') || undefined;

  return (
    <form onSubmit={save} className="auth-card" noValidate>
      <Logo />
      <h1 className="auth-title text-xl font-semibold">
        {TITLE}{' '}
        <span className="auth-subtitle mt-1 block text-sm font-medium" style={{ overflowWrap: 'anywhere' }}>
          {`for ${info.email}.`}
        </span>
      </h1>
      {/* Password managers save the new password against this account. */}
      <input type="email" autoComplete="username" value={info.email} readOnly hidden />

      <label className="auth-label mt-5 block text-[13px] font-medium">
        New password
        <input
          ref={nextRef}
          type="password"
          autoComplete="new-password"
          value={next}
          disabled={busy}
          aria-invalid={errors.next ? true : undefined}
          aria-describedby={describe(errors.next && `${uid}-next-err`, `${uid}-hint`)}
          onChange={(e) => setNext(e.target.value)}
          className="auth-field mt-1.5 min-h-[44px] w-full"
        />
      </label>
      {errors.next && (
        <p id={`${uid}-next-err`} className="auth-error mt-1.5 text-sm">
          {errors.next}
        </p>
      )}
      <p id={`${uid}-hint`} className="auth-subtitle mt-1.5 text-xs">
        {PW_HINT}
      </p>

      <label className="auth-label mt-4 block text-[13px] font-medium">
        Type it again
        <input
          ref={againRef}
          type="password"
          autoComplete="new-password"
          value={again}
          disabled={busy}
          aria-invalid={errors.again ? true : undefined}
          aria-describedby={errors.again ? `${uid}-again-err` : undefined}
          onChange={(e) => setAgain(e.target.value)}
          className="auth-field mt-1.5 min-h-[44px] w-full"
        />
      </label>
      {errors.again && (
        <p id={`${uid}-again-err`} className="auth-error mt-1.5 text-sm">
          {errors.again}
        </p>
      )}

      <p className="auth-subtitle mt-4 text-sm">Saving signs you out on your other devices.</p>
      {errors.form && (
        <p role="alert" className="auth-error mt-3 text-sm">
          {errors.form}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="auth-cta mt-5 flex min-h-[44px] w-full items-center justify-center gap-2 py-2 text-sm font-semibold"
      >
        {busy ? (
          <>
            <span className="auth-spin" aria-hidden="true" />
            Saving…
          </>
        ) : (
          'Save password'
        )}
      </button>
      <p className="auth-subtitle mt-3 text-xs">{`The link ends ${endTime(info.expiresAt)}.`}</p>
    </form>
  );
}
