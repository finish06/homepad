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
  // The settings gear is the per-user controls entry point — shown to everyone
  // (not admin-gated), distinct from the admin Edit toggle. Today it toggles
  // personal arrange mode, which reveals the reorder arrows (A5.1); it's built
  // to host future per-user controls. Off by default so the normal view stays
  // decluttered. Client-ephemeral — a reload returns to the clean view.
  const [arrange, setArrange] = useState(false);

  async function handleLogout() {
    await logout();
    onLogout();
  }

  return (
    <main className="app-surface min-h-screen font-sans">
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
              data-testid="settings-gear"
              aria-label="Personal settings"
              aria-pressed={arrange}
              title="Personal settings"
              onClick={() => setArrange((on) => !on)}
              className={`flex h-9 w-9 items-center justify-center rounded-lg border outline-none transition focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                arrange
                  ? 'border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700'
                  : 'border-neutral-200 text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800'
              }`}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                className="h-5 w-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 0 1 1.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 0 1-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 0 1-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 0 1 .12-1.45l.773-.773a1.125 1.125 0 0 1 1.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894Z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                />
              </svg>
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
