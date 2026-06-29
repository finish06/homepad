import { useEffect, useRef, useState } from 'react';
import { authConfig, login, logout, me, register, type User } from './api';
import AppHeader from './AppHeader';
import Catalog from './Catalog';
import StatusBar from './StatusBar';
import CommandLauncher from './CommandLauncher';
import { LauncherProvider, useLauncher } from './launcher';
import { ServicesProvider, useServicesContext } from './services';
import { AlertHistoryProvider, useAlertHistory } from './alerts';
import AlertHistoryPanel from './AlertHistoryPanel';
import SettingsPanel from './SettingsPanel';
import ToastContainer from './Toasts';
import ChangelogOverlay from './ChangelogOverlay';
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
        // #184 — a real loading state: an indigo spinner + an AA-contrast,
        // screen-reader-announced label, replacing the bare low-contrast text.
        <main
          role="status"
          aria-live="polite"
          className="app-surface min-h-screen flex flex-col items-center justify-center gap-3 font-sans"
        >
          <span data-testid="app-loading-spinner" className="app-spinner" aria-hidden="true" />
          <span className="text-sm font-medium text-neutral-600 dark:text-neutral-300">
            Loading your dashboard…
          </span>
        </main>
      ) : user ? (
        // v8/v17 — the home providers wrap Home so its body can read launcher,
        // services, and alert-history context directly. Order matters:
        // AlertHistoryProvider must sit above ServicesProvider so the poller can
        // push transitions into the log.
        <LauncherProvider>
          <AlertHistoryProvider>
            <ServicesProvider>
              <Home user={user} onLogout={() => setUser(null)} />
            </ServicesProvider>
          </AlertHistoryProvider>
        </LauncherProvider>
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
  // #166 — per-user Arrange mode (v1 A5.1). Client-ephemeral (a reload returns
  // to the decluttered launcher view); toggled by the header settings gear,
  // available to every logged-in user. Reveals the per-tile reorder grips.
  const [arrange, setArrange] = useState(false);
  // v9.3 §7.3 — the admin Settings modal (App Library management + read-only
  // System settings). Opened from the avatar menu (admin only). OIDC is read
  // from the client-visible auth config — no API change.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [oidcEnabled, setOidcEnabled] = useState(false);
  // v15 — version badge in the footer opens the changelog overlay.
  const [changelogOpen, setChangelogOpen] = useState(false);
  // v17 — alert-history panel open-state + the bell ref (focus returns here on
  // close, AC-009). The log + unread badge live in AlertHistoryProvider.
  const [alertOpen, setAlertOpen] = useState(false);
  const bellRef = useRef<HTMLButtonElement>(null);
  const alerts = useAlertHistory();
  const services = useServicesContext();
  const { open: launcherOpen, closeLauncher } = useLauncher();

  useEffect(() => {
    authConfig().then((c) => setOidcEnabled(c.oidcEnabled));
  }, []);

  // AC-014 — one overlay at a time: opening the ⌘K launcher closes the alert panel.
  useEffect(() => {
    if (launcherOpen) setAlertOpen(false);
  }, [launcherOpen]);

  async function handleLogout() {
    await logout();
    onLogout();
  }

  // AC-006/AC-007/AC-014 — the bell toggles the panel: opening clears the badge
  // and closes the launcher; a second click closes the panel.
  function toggleAlerts() {
    if (alertOpen) {
      setAlertOpen(false);
      return;
    }
    closeLauncher();
    alerts?.clearBadge();
    setAlertOpen(true);
  }
  // AC-009 — Escape/✕/scrim close all route here and restore focus to the bell.
  function closeAlerts() {
    setAlertOpen(false);
    bellRef.current?.focus();
  }

  // v8: LauncherProvider owns launcher open-state + the global ⌘K / `/` hotkey;
  // ServicesProvider owns the single Service[] load shared by the grid and the
  // launcher (no second fetch, §3/A12). CommandLauncher renders the overlay when
  // opened and filters that same array.
  return (
    <>
      <main className="app-surface min-h-screen font-sans">
        <AppHeader
          user={user}
          arrange={arrange}
          onToggleArrange={() => setArrange((on) => !on)}
          onToggleEdit={isAdmin ? () => setEditMode((on) => !on) : () => {}}
          onOpenAdminSettings={() => setSettingsOpen(true)}
          onGoToDashboard={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          onLogout={handleLogout}
          alertCount={alerts?.unreadCount ?? 0}
          onAlertClick={toggleAlerts}
          bellRef={bellRef}
        />

        <StatusBar />

        <section className="mx-auto max-w-6xl px-4 py-6">
          <Catalog isAdmin={isAdmin} editMode={editMode} arrange={arrange} onExitEdit={() => setEditMode(false)} />
        </section>

        {/* Feeds the launcher the shared catalog array; while still loading it
            simply has nothing to match (an empty list), never its own fetch. */}
        <CommandLauncher services={services?.items ?? []} />

        {/* cap5 — ambient status-change toasts; reads recentChanges from context. */}
        <ToastContainer />

        {/* v17 — async-review alert history; reads the log from context. */}
        <AlertHistoryPanel open={alertOpen} events={alerts?.events ?? []} onClose={closeAlerts} />

        {settingsOpen && (
          <SettingsPanel
            isAdmin={isAdmin}
            oidcEnabled={oidcEnabled}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </main>

      {/* v15 — quiet version badge in natural page flow (not sticky). Opens
          the changelog overlay so an operator can confirm what this build
          shipped without leaving the dashboard. */}
      <footer
        data-testid="app-footer"
        className="border-t border-neutral-100 dark:border-neutral-800 py-3 text-center"
      >
        <button
          type="button"
          data-testid="changelog-open"
          aria-label="Open changelog"
          onClick={() => setChangelogOpen(true)}
          // #181 — was neutral-400 (#A3A3A3, 2.52:1, axe serious). neutral-500
          // (#737373) is 4.74:1 on white; dark uses neutral-400 on the dark canvas.
          className="text-xs text-neutral-500 hover:text-neutral-700 hover:underline dark:text-neutral-400 dark:hover:text-neutral-200 bg-transparent border-none cursor-pointer"
        >
          homepad v{__APP_VERSION__} ({__GIT_SHA__})
        </button>
      </footer>
      <ChangelogOverlay open={changelogOpen} onClose={() => setChangelogOpen(false)} />
    </>
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
        <img
          src="/icon-192.png"
          alt="homepad"
          className="mb-3 h-12 w-12 rounded-xl"
        />
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
            className="mt-1 min-h-[44px] w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
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
            className="mt-1 min-h-[44px] w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />
        </label>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-5 flex min-h-[44px] w-full items-center justify-center rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {busy ? '…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>

        <button
          type="button"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError('');
          }}
          className="mt-3 flex min-h-[44px] w-full items-center justify-center text-center text-sm text-neutral-500 hover:text-neutral-800"
        >
          {mode === 'login' ? 'Need an account? Register' : 'Have an account? Sign in'}
        </button>

        {oidcEnabled && (
          <>
            <div className="my-4 flex items-center gap-3 text-xs text-neutral-500">
              <span className="h-px flex-1 bg-neutral-200" />
              or
              <span className="h-px flex-1 bg-neutral-200" />
            </div>
            <button
              type="button"
              onClick={() => window.location.assign('/api/auth/oidc/login')}
              className="flex min-h-[44px] w-full items-center justify-center rounded-lg border border-neutral-300 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Log in with PocketID
            </button>
          </>
        )}
      </form>
    </main>
  );
}
