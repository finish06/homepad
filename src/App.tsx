import { useEffect, useState } from 'react';
import { authConfig, login, logout, me, register, type User } from './api';
import Catalog from './Catalog';
import ThemeControl from './ThemeControl';
import { ThemeProvider } from './theme';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    me().then((u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  // The provider wraps every state (loading/auth/home) so the resolved theme is
  // applied throughout. Pre-auth has no stored pref, so it falls back to System
  // (OS/cache); once /api/me resolves, the user's themePref flows in via the prop.
  return (
    <ThemeProvider userPref={user?.themePref}>
      {loading ? (
        <main className="min-h-screen flex items-center justify-center font-sans text-neutral-500">
          loading…
        </main>
      ) : user ? (
        <Home user={user} onLogout={() => setUser(null)} />
      ) : (
        <AuthForm onAuthed={setUser} />
      )}
    </ThemeProvider>
  );
}

function Home({ user, onLogout }: { user: User; onLogout: () => void }) {
  // Edit mode is admin-only and client-ephemeral — a reload returns to view
  // mode. It surfaces the per-tile icon controls (and delete-service). Every
  // mutating endpoint is independently admin-gated server-side, so this toggle
  // is a convenience surface, not the security boundary.
  const isAdmin = user.role === 'admin';
  const [editMode, setEditMode] = useState(false);
  // Arrange mode is per-user and available to everyone (not admin-gated): it
  // reveals the personal reorder arrows (A5). Off by default so the normal view
  // stays decluttered. Client-ephemeral — a reload returns to the clean view.
  const [arrange, setArrange] = useState(false);

  async function handleLogout() {
    await logout();
    onLogout();
  }

  return (
    <main className="min-h-screen bg-neutral-50 font-sans dark:bg-neutral-950">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/80 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <h1 className="text-lg font-semibold">homepad</h1>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-neutral-500 sm:inline">{user.email}</span>
            <ThemeControl />
            <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
              {user.role}
            </span>
            <button
              type="button"
              data-testid="arrange-toggle"
              aria-pressed={arrange}
              onClick={() => setArrange((on) => !on)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                arrange
                  ? 'border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700'
                  : 'border-neutral-200 text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800'
              }`}
            >
              {arrange ? 'Done' : 'Arrange'}
            </button>
            {isAdmin && (
              <button
                type="button"
                data-testid="edit-toggle"
                aria-pressed={editMode}
                onClick={() => setEditMode((on) => !on)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                  editMode
                    ? 'border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700'
                    : 'border-neutral-200 text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800'
                }`}
              >
                {editMode ? 'Done' : 'Edit'}
              </button>
            )}
            <button
              onClick={handleLogout}
              className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-6">
        <Catalog isAdmin={isAdmin} editMode={editMode} arrange={arrange} />
      </section>
    </main>
  );
}

function AuthForm({ onAuthed }: { onAuthed: (u: User) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [oidcEnabled, setOidcEnabled] = useState(false);

  useEffect(() => {
    authConfig().then((c) => setOidcEnabled(c.oidcEnabled));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'register') {
        const r = await register(email, password);
        if (!r.ok) {
          setError(r.error ?? 'registration failed');
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

  return (
    <main className="min-h-screen flex items-center justify-center p-6 font-sans">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
      >
        <h1 className="text-xl font-semibold">homepad</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {mode === 'login' ? 'Sign in to your dashboard' : 'Create your account'}
        </p>

        <label className="mt-5 block text-sm font-medium text-neutral-700">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />
        </label>

        <label className="mt-4 block text-sm font-medium text-neutral-700">
          Password
          <input
            type="password"
            required
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />
        </label>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-5 w-full rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {busy ? '…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>

        <button
          type="button"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError('');
          }}
          className="mt-3 w-full text-center text-sm text-neutral-500 hover:text-neutral-800"
        >
          {mode === 'login' ? 'Need an account? Register' : 'Have an account? Sign in'}
        </button>

        {oidcEnabled && (
          <>
            <div className="my-4 flex items-center gap-3 text-xs text-neutral-400">
              <span className="h-px flex-1 bg-neutral-200" />
              or
              <span className="h-px flex-1 bg-neutral-200" />
            </div>
            <button
              type="button"
              onClick={() => window.location.assign('/api/auth/oidc/login')}
              className="w-full rounded-lg border border-neutral-300 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Log in with PocketID
            </button>
          </>
        )}
      </form>
    </main>
  );
}
