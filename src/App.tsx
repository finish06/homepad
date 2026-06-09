import { useEffect, useState } from 'react';
import { login, logout, me, register, type User } from './api';
import Catalog from './Catalog';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    me().then((u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center font-sans text-neutral-500">
        loading…
      </main>
    );
  }

  return user ? (
    <Home user={user} onLogout={() => setUser(null)} />
  ) : (
    <AuthForm onAuthed={setUser} />
  );
}

function Home({ user, onLogout }: { user: User; onLogout: () => void }) {
  async function handleLogout() {
    await logout();
    onLogout();
  }

  return (
    <main className="min-h-screen bg-neutral-50 font-sans">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <h1 className="text-lg font-semibold">homepad</h1>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-neutral-500 sm:inline">{user.email}</span>
            <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-600">
              {user.role}
            </span>
            <button
              onClick={handleLogout}
              className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-6">
        <Catalog />
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
        className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm"
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
      </form>
    </main>
  );
}
