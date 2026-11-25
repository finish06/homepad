import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { authConfig, login, register, type AuthConfig, type Result, type User } from '../api';
import { accountLimitMessage, isAccountLimit } from '../lib/accountLimit';
import { waitMessage } from '../lib/waitMessage';

// v27 login-glass — if a PocketID/OIDC redirect stalls (e.g. a PocketBase
// restart), the browser keeps our page on screen while the request hangs, so a
// bare spinner would spin forever. Reset the button after this window with a
// retry hint instead. 30s comfortably outlasts a healthy 302 round-trip.
const OIDC_TIMEOUT_MS = 30000;

// SPEC-household-basics AC-005, UX §2 — the sign-in card has three states, all
// on the same card: Set up Homepad (no adult account yet), Sign in with sign-up
// closed (no "Create account" at all), and Sign in with sign-up open (the card
// as it was). Until /api/auth/config answers, it renders the closed state, so
// "Create account" never flashes in and out.
type Mode = 'login' | 'register' | 'setup';

const SETUP_RACE = 'Someone else just finished setup. Sign in instead.';

export default function AuthForm({ onAuthed, ssoError }: { onAuthed: (u: User) => void; ssoError?: string }) {
  const [mode, setMode] = useState<Mode>('login');
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setErrorText] = useState('');
  // SPEC-ui-quick-wins AC-020 — every error shown is a NEW alert node (keyed on
  // this count), so a second failure with the same words is announced again
  // instead of leaving a live region whose text did not change.
  const [errorSeq, setErrorSeq] = useState(0);
  const setError = (msg: string) => {
    setErrorText(msg);
    if (msg) setErrorSeq((n) => n + 1);
  };
  // SPEC-ui-quick-wins §3.7 — show/hide password and the Caps Lock hint.
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  // The caret to put back after a show/hide toggle (AC-018).
  const restoreCaret = useRef<[number, number] | null>(null);
  const passwordId = useId();
  const capsId = useId();
  // SPEC-signin-hardening UX §2 — the single sign-on line, for the code App
  // read from /#signin-error=. Its copy is a lazy module, loaded only when a
  // code is present (AC-020). It stays until the next try, a submit or
  // PocketID, which sets it to false; a module that lands after that is
  // dropped.
  const [sso, setSso] = useState<string | false>('');
  const [busy, setBusy] = useState(false);
  const [oidcBusy, setOidcBusy] = useState(false);
  const oidcTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintId = useId();

  useEffect(() => {
    let live = true;
    if (ssoError) import('./ssoMessage').then((m) => setSso((s) => s === '' && m.ssoMessage(ssoError)));
    authConfig().then((c) => {
      if (!live) return;
      setConfig(c);
      if (c.setupNeeded) setMode('setup');
    });
    // Clear a pending OIDC-timeout timer if the card unmounts mid-redirect.
    return () => {
      live = false;
      if (oidcTimer.current) clearTimeout(oidcTimer.current);
    };
    // Once, on mount: App hands over the code once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // AC-018 — after a show/hide toggle, focus and the caret go back into the
  // field, where they were (switching `type` can reset the selection).
  useLayoutEffect(() => {
    const caret = restoreCaret.current;
    const input = passwordRef.current;
    if (!caret || !input) return;
    restoreCaret.current = null;
    input.focus();
    input.setSelectionRange(caret[0], caret[1]);
    // Chrome resets the selection to 0 at the next style update after a
    // `type` change (measured in the browser gate; jsdom does not), so put it
    // back once more before that frame paints.
    const raf = requestAnimationFrame(() => {
      if (document.activeElement === input) input.setSelectionRange(caret[0], caret[1]);
    });
    return () => cancelAnimationFrame(raf);
  }, [showPassword]);

  function togglePassword() {
    const input = passwordRef.current;
    if (input) restoreCaret.current = [input.selectionStart ?? input.value.length, input.selectionEnd ?? input.value.length];
    setShowPassword((v) => !v);
  }

  // AC-019 — read Caps Lock from every key event in the field; it can change
  // while the field has focus (the CapsLock key itself), so keyup counts too.
  function readCapsLock(e: React.KeyboardEvent<HTMLInputElement>) {
    setCapsLock(e.getModifierState?.('CapsLock') === true);
  }

  const canRegister = config?.registration === 'open';
  const oidcEnabled = config?.oidcEnabled === true;
  // UX §3 — the 429 line. The per-email lock touches only password sign-in,
  // so where the PocketID button shows, it's still a way in (S-2).
  const wait = (r: Result) =>
    waitMessage(r.retryAfter) + (oidcEnabled && mode !== 'setup' ? ' You can still use PocketID.' : '');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSso(false);
    setBusy(true);
    try {
      if (mode !== 'login') {
        const r = await register(email, password);
        if (!r.ok) {
          // AC-003 — two people raced to set up; the other one won. The API
          // answers 403 (sign-up is closed now that an admin exists).
          if (mode === 'setup' && r.status === 403) {
            setConfig((c) => (c ? { ...c, setupNeeded: false } : c));
            setMode('login');
            setError(SETUP_RACE);
            return;
          }
          setError(
            r.status === 429 ? wait(r) : isAccountLimit(r) ? accountLimitMessage(r.error) : (r.error ?? 'registration failed'),
          );
          return;
        }
      }
      const r = await login(email, password);
      if (r.ok && r.user) {
        onAuthed(r.user);
      } else {
        setError(r.status === 429 ? wait(r) : (r.error ?? 'login failed'));
      }
    } finally {
      setBusy(false);
    }
  }

  function handlePocketId() {
    setError('');
    setSso(false);
    setOidcBusy(true);
    oidcTimer.current = setTimeout(() => {
      setOidcBusy(false);
      setError('PocketID timed out — try again or use email/password');
    }, OIDC_TIMEOUT_MS);
    // Full-page navigation to the OIDC start endpoint. On success the page is
    // replaced (the timer never fires); on a stalled redirect the timer resets us.
    window.location.assign('/api/auth/oidc/login');
  }

  const subtitle =
    mode === 'setup' ? 'Set up Homepad' : mode === 'register' ? 'Create your account' : 'Sign in to your dashboard';
  const cta = mode === 'setup' ? 'Create admin account' : mode === 'register' ? 'Create account' : 'Sign in';

  return (
    <main className="app-surface auth-main font-sans">
      <form onSubmit={handleSubmit} className="auth-card">
        <div className="auth-logo mb-4 inline-flex">
          <img src="/icon-192.png" alt="homepad" className="h-11 w-11 rounded-xl" />
        </div>
        <h1 className="auth-title text-xl font-semibold">homepad</h1>
        <p className="auth-subtitle mt-1 text-sm">{subtitle}</p>
        {mode === 'setup' && <p className="auth-subtitle mt-1 text-sm">This first account is the admin.</p>}
        {sso && (
          <p role="alert" className="auth-error mt-3 text-sm">
            {sso}
          </p>
        )}

        <label className="auth-label mt-5 block text-[13px] font-medium">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="you@home.lan"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="auth-field mt-1.5 min-h-[44px] w-full"
          />
        </label>

        {/* SPEC-ui-quick-wins §3.7 — the label no longer wraps the input, so
            the show/hide button beside it never joins the field's name. */}
        <label htmlFor={passwordId} className="auth-label mt-4 block text-[13px] font-medium">
          Password
        </label>
        <div className="relative mt-1.5">
          <input
            ref={passwordRef}
            id={passwordId}
            type={showPassword ? 'text' : 'password'}
            required
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={readCapsLock}
            onKeyUp={readCapsLock}
            onBlur={() => setCapsLock(false)}
            aria-describedby={
              [mode === 'setup' ? hintId : '', capsLock ? capsId : ''].filter(Boolean).join(' ') || undefined
            }
            className="auth-field min-h-[44px] w-full pr-12"
          />
          {/* AC-018 — 44×44, type="button" so it never submits. Its name is its
              (visually hidden) text, not an aria-label, so it is not picked up
              as a label for the password field either. A mouse press must not
              take focus out of the field. */}
          <button
            type="button"
            data-testid="auth-password-toggle"
            aria-pressed={showPassword}
            onMouseDown={(e) => e.preventDefault()}
            onClick={togglePassword}
            className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-lg text-[color:var(--v-muted)] outline-none transition hover:text-[color:var(--v-txt)] focus-visible:text-[color:var(--v-txt)] focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <span className="sr-only">{showPassword ? 'Hide password' : 'Show password'}</span>
            <EyeIcon off={showPassword} />
          </button>
        </div>
        {mode === 'setup' && (
          <p id={hintId} className="auth-subtitle mt-1.5 text-xs">
            At least 8 characters.
          </p>
        )}
        {/* AC-019 — always in the DOM (empty when off), so the polite live
            region exists before its text appears and the hint is announced. */}
        <p id={capsId} aria-live="polite" className={capsLock ? 'auth-subtitle mt-1.5 text-xs' : 'sr-only'}>
          {capsLock ? 'Caps Lock is on' : ''}
        </p>

        {error && (
          <p key={errorSeq} role="alert" className="auth-error mt-3 text-sm">
            {error}
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
              Signing in…
            </>
          ) : (
            cta
          )}
        </button>

        {/* Only while sign-up is open: a kid who signs out on a closed install
            sees a plain sign-in and nothing else to do (UX §2). */}
        {canRegister && mode !== 'setup' && (
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError('');
            }}
            className="auth-secondary mt-3 flex min-h-[44px] w-full items-center justify-center text-center text-sm"
          >
            {mode === 'login' ? 'Create account' : 'Have an account? Sign in'}
          </button>
        )}

        {/* No PocketID on Set up: an OIDC sign-in makes a member unless the
            provider's admin group says otherwise, so it can't be relied on to
            make the first admin. */}
        {oidcEnabled && mode !== 'setup' && (
          <>
            <div className="auth-divider my-4 flex items-center gap-3 text-xs">
              <span className="auth-divider-rule h-px flex-1" />
              or
              <span className="auth-divider-rule h-px flex-1" />
            </div>
            <button
              type="button"
              onClick={handlePocketId}
              disabled={oidcBusy}
              className="auth-oidc flex min-h-[44px] w-full items-center justify-center gap-2 py-2 text-sm font-medium"
            >
              {oidcBusy ? (
                <>
                  <span className="auth-spin" aria-hidden="true" />
                  Signing in…
                </>
              ) : (
                'Log in with PocketID'
              )}
            </button>
          </>
        )}
      </form>

      {/* #9 — faint version footer so an operator can see which build they're
          hitting before authenticating. */}
      <p className="auth-footer" data-testid="auth-footer">
        homepad v{__APP_VERSION__}
      </p>
    </main>
  );
}

// The show/hide glyph: an eye, struck through while the password is shown
// (pressing it again hides it). aria-hidden; the button's text names it.
function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path strokeLinecap="round" d="M4 4l16 16" />}
    </svg>
  );
}
