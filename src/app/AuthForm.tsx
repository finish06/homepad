import { useEffect, useId, useRef, useState } from 'react';
import { authConfig, login, register, type AuthConfig, type User } from '../api';
import { accountLimitMessage, isAccountLimit } from '../lib/accountLimit';

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

export default function AuthForm({ onAuthed }: { onAuthed: (u: User) => void }) {
  const [mode, setMode] = useState<Mode>('login');
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [oidcBusy, setOidcBusy] = useState(false);
  const oidcTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintId = useId();

  useEffect(() => {
    let live = true;
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
  }, []);

  const canRegister = config?.registration === 'open';
  const oidcEnabled = config?.oidcEnabled === true;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
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
          setError(isAccountLimit(r) ? accountLimitMessage(r.error) : (r.error ?? 'registration failed'));
          return;
        }
      }
      const r = await login(email, password);
      if (r.ok && r.user) {
        onAuthed(r.user);
      } else {
        setError(r.error ?? 'login failed');
      }
    } finally {
      setBusy(false);
    }
  }

  function handlePocketId() {
    setError('');
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

        <label className="auth-label mt-4 block text-[13px] font-medium">
          Password
          <input
            type="password"
            required
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby={mode === 'setup' ? hintId : undefined}
            className="auth-field mt-1.5 min-h-[44px] w-full"
          />
        </label>
        {mode === 'setup' && (
          <p id={hintId} className="auth-subtitle mt-1.5 text-xs">
            At least 8 characters.
          </p>
        )}

        {error && <p className="auth-error mt-3 text-sm">{error}</p>}

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
