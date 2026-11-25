import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  categories as fetchCategories,
  logout,
  me,
  saveSystemSettings,
  systemConfig,
  type Category,
  type Service,
  type SystemConfig,
  type User,
} from '../api';
import AppHeader from './AppHeader';
import AppGrid from '../grid/AppGrid';
import { clearShapeCache } from '../grid/gridShapeCache';
import { useTileDensity } from '../grid/tileDensity';
import { useHealthBarPref } from './healthBarPref';
import { useUptimeDisplayPref } from './uptimeDisplayPref';
import type { SettingsScope, SettingsSection } from '../library/SettingsPanel';
import StatusBar from './StatusBar';
import CommandLauncher from '../launcher/CommandLauncher';
import { LauncherProvider, useLauncher } from '../launcher/launcher';
import { KID_POLL_MS, ServicesProvider, useServicesContext } from '../services';
import AuthForm from './AuthForm';
import { AlertHistoryProvider, useAlertHistory } from '../alerts/alerts';
import AlertHistoryPanel from '../alerts/AlertHistoryPanel';
import ToastContainer from '../alerts/Toasts';
import UpdateBanner from './UpdateBanner';
import { ThemeProvider } from '../theme/theme';
import { CONTENT_WIDTH } from '../lib/layout';
import { ShowWidgetsContext, WidgetsInfoContext } from '../widgets/context';
import { useShowWidgetsPref } from '../widgets/showWidgetsPref';
import { useWidgetsInfo } from '../widgets/useWidgetsInfo';
import { shouldOpenWhatsNew } from './whatsNew';
import ChunkErrorBoundary from '../ui/ChunkErrorBoundary';

// v14.0.1 optimize — these three surfaces only ever mount after a user action
// (open the Library, open the custom-app form, open admin Settings), so they are
// code-split into their own async chunks and kept out of the initial bundle.
// Suspense fallback is null: each is a modal/overlay, so a sub-frame gap before
// its small chunk resolves is imperceptible (and its own backdrop covers paint).
const LibraryBrowse = lazy(() => import('../library/LibraryBrowse'));
const ServiceForm = lazy(() => import('../library/ServiceForm'));
const SettingsPanel = lazy(() => import('../library/SettingsPanel'));
// SPEC-household-basics — the Join screen only ever mounts from an invite link,
// so it stays out of the entry chunk too.
const JoinScreen = lazy(() => import('./JoinScreen'));
// SPEC-password-reset-link UX §1 — and the reset screen, from a reset link.
const ResetPasswordScreen = lazy(() => import('./ResetPasswordScreen'));

// readLinkToken returns the kind and token of an `/#invite=<token>` or
// `/#reset=<token>` link, or null. It only reads: App removes the fragment
// after mount, and again whenever a link arrives in the open tab (household-
// basics AC-020, reset-link AC-019). The token
// lives in the fragment because browsers never send a fragment to the server,
// so it stays out of access logs and Referer headers (spec §3.2).
type LinkToken = { kind: string; token: string };
function readLinkToken(): LinkToken | null {
  const m = /^#(invite|reset)=([^&]+)$/.exec(window.location.hash);
  if (!m) return null;
  try {
    return { kind: m[1], token: decodeURIComponent(m[2]) };
  } catch {
    return null;
  }
}
// SPEC-signin-hardening AC-003 — a failed single sign-on comes back as
// `/#signin-error=<code>`. App clears any such fragment and hands what follows
// `=` to the sign-in card, whose lazy ssoMessage shows a line only for a
// well-formed code (UX §2.3).
const readSsoError = () => /^#signin-error=(.*)/.exec(window.location.hash)?.[1];
// SPEC-backup-import B-2 — the admin empty state opens the Homepage import here.
const HomepageImportModal = lazy(() => import('../library/backup/HomepageImportModal'));
// SPEC-status-widgets — the glance strip (clock, weather, its icons) is a lazy
// chunk too: it renders only once the admin turns the clock or weather on, so
// a dashboard without it never downloads it. Its CSS stays in the entry.
const GlanceStrip = lazy(() => import('./GlanceStrip'));
// The changelog overlay opens from the footer version badge, or on its own once
// after an upgrade (whatsNew.ts, #590). It carries src/changelog.json (every
// release ever shipped, ~47 kB raw). Lazy, so a dashboard load never downloads
// it; it mounts only while open.
const ChangelogOverlay = lazy(() => import('./ChangelogOverlay'));

export default function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [link, setLink] = useState<LinkToken | null>(readLinkToken);
  const [ssoError, setSsoError] = useState(readSsoError);

  // Take the token, or the sign-in error, out of the address bar as soon as it
  // has been read, keeping the path and query. That happens even when a
  // session exists and the sign-in card never mounts. Nothing else in the app
  // uses the fragment.
  useEffect(() => {
    const clear = () =>
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
    // On mount: the state initializer read the token.
    if (link || ssoError !== undefined) clear();
    // #582 — a link opened in a tab that already shows Homepad changes only
    // the fragment: read and clear it the same way. replaceState also takes
    // the token out of the tab's history.
    const onHash = () => {
      const next = readLinkToken();
      if (!next) return;
      setLink(next);
      clear();
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The Join and reset screens take the same props. Done: the account is
  // signed in on this device. Leave: drop the link, back to the dashboard or
  // the sign-in card. Signed out: "Sign out and continue" ended the session.
  const linkProps = {
    token: link?.token ?? '',
    user,
    onLeave: () => setLink(null),
    onSignedOut: () => setUser(null),
  };
  const linkDone = (u: User) => {
    setLink(null);
    setUser(u);
  };

  // The sign-in error is for the first sign-in card only, not the one a later
  // sign-out shows.
  useEffect(() => {
    if (user) setSsoError(undefined);
  }, [user]);

  useEffect(() => {
    me().then((u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  // The provider wraps every state (loading/auth/home) so the resolved theme is
  // applied throughout. Pre-auth `user` is null, so userPref stays undefined
  // indefinitely — the provider resolves from the first-paint cache, falling
  // back to the live OS when that cache is empty or invalid (homepad#468). It
  // does NOT resolve as 'system': an explicitly cached dark keeps the login
  // screen dark even under a light OS, which is the anti-flash guarantee. Once
  // /api/me answers, the account's themePref takes over via this prop.
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
      ) : link ? (
        <ChunkErrorBoundary>
        <Suspense fallback={null}>
          {/* Keyed by the token, so a second link starts its screen afresh. */}
          {link.kind === 'reset' ? (
            <ResetPasswordScreen key={link.token} {...linkProps} onDone={linkDone} />
          ) : (
            <JoinScreen key={link.token} {...linkProps} onJoined={linkDone} />
          )}
        </Suspense>
        </ChunkErrorBoundary>
      ) : user ? (
        // v8/v17 — the home providers wrap Home so its body can read launcher,
        // services, and alert-history context directly. Order matters:
        // AlertHistoryProvider must sit above ServicesProvider so the poller can
        // push transitions into the log.
        <LauncherProvider>
          <AlertHistoryProvider>
            {/* SPEC-kid-accounts AC-012 — a kid device an admin signed out gets
                401 on its next poll and shows the login screen.
                SPEC-household-manage-adults AC-016 (UX A-5) — so does an adult
                who was removed, given a new role, or reset elsewhere. */}
            <ServicesProvider
              onUnauthorized={() => setUser(null)}
              // AC-002 / TC-003 — an admin's change to a kid's apps shows on the
              // kid's next poll, with no reload.
              syncMembership={user.role === 'kid'}
              // SPEC-household-basics AC-033 (#548) — a kid's allow-list change
              // shows within 30s; adults keep the 60s default.
              pollMs={user.role === 'kid' ? KID_POLL_MS : undefined}
            >
              <Home user={user} onLogout={() => setUser(null)} />
            </ServicesProvider>
          </AlertHistoryProvider>
        </LauncherProvider>
      ) : (
        <AuthForm onAuthed={setUser} ssoError={ssoError} />
      )}
      {/* Release awareness — polls /version.json (CI-emitted, no-store) and
          offers a refresh when a newer build is live. Mounted outside the auth
          branch so even a tab parked on the login screen learns of a release. */}
      <UpdateBanner />
    </ThemeProvider>
  );
}

function Home({ user, onLogout }: { user: User; onLogout: () => void }) {
  // Edit mode is admin-only and client-ephemeral — a reload returns to view
  // mode. It surfaces the per-tile icon controls (and delete-service). Every
  // mutating endpoint is independently admin-gated server-side, so this toggle
  // is a convenience surface, not the security boundary.
  const isAdmin = user.role === 'admin';
  // SPEC-kid-accounts §8 — the kid shell. Gated on the role, never on missing
  // data, so a kid is never shown an affordance the server would 403.
  const isKid = user.role === 'kid';
  // SPEC-app-grid §7 — Edit Dashboard mode: admin-only + client-ephemeral (a
  // reload returns to view mode). When on, AppGrid's boxes become drag-to-reorder
  // sortables; the header Gear toggles it. Every mutating endpoint is
  // independently admin-gated server-side, so this toggle is a convenience
  // surface, not the security boundary.
  const [editMode, setEditMode] = useState(false);
  // SPEC-tile-density + OQ-9 — the tile density is a per-USER preference: the
  // account's densityPref from /api/me seeds it (and wins), localStorage is only
  // the per-device cache, choices write through to PATCH /api/me. The switch
  // lives in the dashboard header below.
  const [density, setDensity] = useTileDensity(user.densityPref);
  // SPEC-health-bar-visibility-toggle — same per-USER shape as densityPref: the
  // account's showHealthBar from /api/me seeds it and wins on every resolve,
  // localStorage is only the first-paint cache. The setter is consumed by the
  // settings control reached from UserMenu -> My Dashboard -> "My settings".
  const [showHealthBar, setShowHealthBar] = useHealthBarPref(user.showHealthBar);
  // cap6 v2 — the uptime sparkline is a per-USER preference now, not the global
  // System setting. sysConfig.showUptimeDisplay still exists but only seeds NEW
  // accounts server-side; nothing on the grid reads it any more.
  const [showUptimeDisplay, setShowUptimeDisplay] = useUptimeDisplayPref(user.showUptimeDisplay);
  // SPEC-status-widgets — "Show widgets" (AC-031, per user) and the info
  // widgets read (clock, weather, web search). A kid never sees tile widget
  // data (Q3 a) and has no switch, but does get the strip (UX §2.5).
  const [showWidgetsPref, setShowWidgetsPref] = useShowWidgetsPref(user.showWidgets);
  const [widgetsInfo, reloadWidgetsInfo] = useWidgetsInfo();
  const showStrip =
    !!widgetsInfo && (widgetsInfo.clock.enabled || widgetsInfo.weather.enabled) && (isKid || showWidgetsPref);
  // Library browse + add-custom-app remain (service management, not layout),
  // lifted here so the header Gear can trigger them and their result flows into
  // the shared services context that AppGrid renders from.
  const [browseOpen, setBrowseOpen] = useState(false);
  // SPEC-dashboard-empty-loading §3.4 — the box an admin's empty-box button
  // aimed the Library at (null from the Gear), with the button for focus return,
  // and the ids added in that Library session (the first is the focus fallback).
  const [browseTarget, setBrowseTarget] = useState<{ id: string; title: string; opener: HTMLButtonElement } | null>(
    null,
  );
  const browseAdded = useRef<string[]>([]);
  const browseFocus = useRef<{ id: string; opener: HTMLButtonElement; added: string | undefined } | null>(null);
  const [customFormOpen, setCustomFormOpen] = useState(false);
  // v9.3 §7.3 — the admin Settings modal (App Library management + read-only
  // System settings). Opened from the avatar menu (admin only). SPEC-v26: the
  // System panel reads its own server settings (SPEC-admin-server-settings),
  // so App no longer needs to feed it the client auth config.
  const [settingsOpen, setSettingsOpen] = useState(false);
  // OQ-1 (a) — one panel, two scopes. The entry point decides which: personal
  // settings are offered to every role, admin settings only under the shield.
  const [settingsScope, setSettingsScope] = useState<SettingsScope>('admin');
  // SPEC-kid-accounts UX §1 — the section the panel opens scrolled to: set by
  // Administration → "Accounts", cleared by every other entry point.
  const [settingsSection, setSettingsSection] = useState<SettingsSection | undefined>(undefined);
  // cap6 — the global uptime-display toggle. Seeded ON so the first paint (before
  // the config resolves) matches today's behavior; systemConfig() then corrects it.
  const [sysConfig, setSysConfig] = useState<SystemConfig>({ showUptimeDisplay: true, statusDegradedMs: 1000 });
  // v15 — version badge in the footer opens the changelog overlay.
  const [changelogOpen, setChangelogOpen] = useState(false);
  // #590 — and it opens on its own on the first load after an upgrade. Not on
  // a kid device: a release note over the kid's tiles helps nobody. In an
  // effect, not the state initializer, because the check writes storage.
  useEffect(() => {
    if (!isKid && shouldOpenWhatsNew(__APP_VERSION__)) setChangelogOpen(true);
    // Once per mount: a role never changes under a mounted Home.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // v17 — alert-history panel open-state + the bell ref (focus returns here on
  // close, AC-009). The log + unread badge live in AlertHistoryProvider.
  const [alertOpen, setAlertOpen] = useState(false);
  const bellRef = useRef<HTMLButtonElement>(null);
  const alerts = useAlertHistory();
  const services = useServicesContext();
  // SPEC-dashboard-empty-loading §3.5 — the one answer to "is the dashboard
  // empty", used for admin-empty, member-empty, kid-empty and AppGrid's prop.
  // False while services are still loading (items null).
  const dashboardEmpty = services?.items?.length === 0;
  const { open: launcherOpen, closeLauncher } = useLauncher();
  // Categories feed the add-custom-app form's category picker (parity with the
  // list Catalog used to pass). AppGrid owns box widths independently; this is a
  // read-only list for the form dropdown.
  const [cats, setCats] = useState<Category[]>([]);
  // SPEC-backup-import — the empty-dashboard import (B-2), and a counter bumped
  // after any restore or import so the grid remounts and re-reads its sections.
  const [importOpen, setImportOpen] = useState(false);
  const [catalogVersion, setCatalogVersion] = useState(0);

  useEffect(() => {
    systemConfig().then(setSysConfig);
    fetchCategories().then(setCats);
  }, []);

  // cap6 — persist a System settings change and reflect it locally so the app
  // grid updates without a reload. Rejects on failure so the toggle can revert
  // its optimistic state (§9.2 error path).
  async function onSaveSettings(patch: Partial<SystemConfig>) {
    const next = await saveSystemSettings(patch);
    setSysConfig(next);
  }

  // Reflect a service added via the Library, or created/edited via the custom-app
  // form, into the shared services list — the SAME array AppGrid + the launcher
  // read — so the new tool appears without a refetch (mirrors the old Catalog
  // handlers). An edit keeps the existing favorite/icon flags, which the
  // create/update response serializes as zero values.
  function onAddedFromLibrary(added: Service) {
    services?.setItems((cur) => [...(cur ?? []), added]);
    browseAdded.current.push(added.id);
  }

  // §3.4 — open the one Library: from the Gear (no target, adds land in
  // Uncategorized) or from an empty box (that box is the target, OQ-2).
  function openBrowse(target: { id: string; title: string; opener: HTMLButtonElement } | null) {
    browseAdded.current = [];
    browseFocus.current = null;
    setBrowseTarget(target);
    setBrowseOpen(true);
  }
  function closeBrowse() {
    if (browseTarget) {
      browseFocus.current = { id: browseTarget.id, opener: browseTarget.opener, added: browseAdded.current[0] };
    }
    setBrowseTarget(null);
    setBrowseOpen(false);
  }
  // AC-011 — after a box's Library closes (and after LibraryBrowse's own
  // unmount focus, which this runs after): back to the button if it is still on
  // the page; else the tile link of the first app added, found by its id; else
  // that box's heading. Never <body>.
  useEffect(() => {
    const f = browseFocus.current;
    if (browseOpen || !f) return;
    browseFocus.current = null;
    if (f.opener.isConnected) {
      f.opener.focus();
      return;
    }
    const box = Array.from(document.querySelectorAll<HTMLElement>('[data-box-id]')).find(
      (el) => el.dataset.boxId === f.id,
    );
    const tile = f.added
      ? Array.from(box?.querySelectorAll<HTMLElement>('.app-grid-tool-wrap[data-service-id]') ?? []).find(
          (el) => el.dataset.serviceId === f.added,
        )
      : undefined;
    const link = tile?.querySelector<HTMLElement>('[data-testid="tool-link"]');
    // If the box itself is gone (deleted elsewhere meanwhile), the first box
    // heading, else the Gear — somewhere on the dashboard, never <body>.
    const target =
      link ??
      box?.querySelector<HTMLElement>('h2') ??
      document.querySelector<HTMLElement>('[data-box-id] h2') ??
      document.querySelector<HTMLElement>('[data-testid="settings-gear"]');
    target?.focus();
  }, [browseOpen]);
  function onSavedCustom(saved: Service, mode: 'add' | 'edit') {
    services?.setItems((cur) => {
      if (mode === 'add') return [...(cur ?? []), saved];
      return (
        cur?.map((s) =>
          s.id === saved.id
            ? { ...saved, favorite: s.favorite, iconLight: s.iconLight, iconDark: s.iconDark }
            : s,
        ) ?? cur
      );
    });
    setCustomFormOpen(false);
  }

  // SPEC-backup-import §10 — after an apply, refetch services, categories and
  // (by remounting the grid) its sections, as after any catalog edit.
  function onCatalogChanged() {
    setCatalogVersion((v) => v + 1);
    fetchCategories().then(setCats);
    void services?.reload?.();
  }

  // AC-014 — one overlay at a time: opening the ⌘K launcher closes the alert panel.
  useEffect(() => {
    if (launcherOpen) setAlertOpen(false);
  }, [launcherOpen]);

  async function handleLogout() {
    await logout();
    // SPEC-dashboard-empty-loading AC-019 — the skeleton shape is this user's:
    // cancel a pending write first, then remove the key, so nothing queued just
    // before sign-out can put it back for the next person on this device.
    clearShapeCache();
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
    <WidgetsInfoContext.Provider value={widgetsInfo}>
    <ShowWidgetsContext.Provider value={!isKid && showWidgetsPref}>
      <main className="app-surface min-h-screen font-sans">
        <AppHeader
          user={user}
          editMode={editMode}
          onToggleEdit={() => setEditMode((e) => !e)}
          onOpenLibrary={() => openBrowse(null)}
          onOpenCustomAppForm={() => setCustomFormOpen(true)}
          onOpenAdminSettings={() => {
            setSettingsScope('admin');
            setSettingsSection(undefined);
            setSettingsOpen(true);
          }}
          onOpenMySettings={() => {
            setSettingsScope('personal');
            setSettingsSection(undefined);
            setSettingsOpen(true);
          }}
          onOpenAccounts={() => {
            setSettingsScope('admin');
            setSettingsSection('accounts');
            setSettingsOpen(true);
          }}
          onGoToDashboard={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          onLogout={handleLogout}
          alertCount={alerts?.unreadCount ?? 0}
          onAlertClick={toggleAlerts}
          bellRef={bellRef}
        />

        {/* SPEC-kid-accounts OQ-3 / AC-019 — a kid's health panel is off unless
            the account says otherwise (kids are created with it off and cannot
            change it). When it does render, it counts the served list, which is
            already only that kid's apps, and offers no re-poll (kid-forbidden). */}
        {showStrip && (
          <div className={CONTENT_WIDTH}>
            <ChunkErrorBoundary silent>
              <Suspense fallback={null}>
                <GlanceStrip info={widgetsInfo} />
              </Suspense>
            </ChunkErrorBoundary>
          </div>
        )}

        {(!isKid || user.showHealthBar === true) && (
          <StatusBar showHealthBar={showHealthBar} canRetry={!isKid} />
        )}

        <section className={`${CONTENT_WIDTH} py-6`}>
          {/* v19 §4.5 / #277 — the shared-catalog edit warning. editMode is
              admin-only (the Gear's "Edit dashboard" only renders for admins), and
              an admin's rename/delete/box-width changes persist to the shared
              catalog every user sees. The Catalog→AppGrid migration dropped the
              old point-of-use banner; restored here at the App level, above the
              grid, so the warning ships with the live surface. */}
          {isAdmin && editMode && (
            <div data-testid="edit-mode-banner" className="edit-mode-banner" role="status">
              <span className="edit-mode-banner-label">
                Editing the shared catalog — changes affect all users
              </span>
              <button
                type="button"
                data-testid="exit-edit-mode"
                onClick={() => setEditMode(false)}
                className="edit-mode-banner-exit"
              >
                Done
              </button>
            </div>
          )}
          {/* SPEC-density-to-my-settings AC-002/AC-006 — the density switch moved
              to My settings and the toolbar row went with it (OQ-2 (a)): its only
              other content was a "Your dashboard" label restating the page, and
              leaving an empty band is what AC-006 forbids. SPEC-tile-density OQ-9
              put the switch here "matching the v16 artboard"; Caleb reversed that
              placement 2026-09-23 (OQ-1 — a product call over a design one). */}
          {isKid && dashboardEmpty ? (
            // UX §5 — the kid's empty state: plain words, no buttons. There is
            // nothing a child can do about it but ask.
            <p data-testid="kid-empty" className="kid-empty">
              No apps yet. Ask a grown-up to add some.
            </p>
          ) : (
            <>
              {/* SPEC-backup-import UX §5 / B-2 — a new install's admin gets the
                  Homepage import one click from the empty dashboard. Users and
                  kids see no change (AC-032); the block goes once there is an app. */}
              {isAdmin && dashboardEmpty && (
                <div data-testid="admin-empty" className="kid-empty">
                  <p>No apps yet.</p>
                  <div className="mt-4 flex flex-wrap justify-center gap-3">
                    <button type="button" className="library-add" onClick={() => setCustomFormOpen(true)}>
                      + Add an app
                    </button>
                    <button type="button" className="settings-ghost-btn" onClick={() => openBrowse(null)}>
                      Browse the App Library
                    </button>
                  </div>
                  <p className="settings-note mt-4">
                    Coming from Homepage?{' '}
                    <button type="button" className="library-manage-link" onClick={() => setImportOpen(true)}>
                      Import your services.yaml
                    </button>
                  </p>
                </div>
              )}
              {/* SPEC-dashboard-empty-loading AC-012 — a member can't add apps,
                  so they get plain words and no button, in the same look. */}
              {!isAdmin && dashboardEmpty && (
                <p data-testid="member-empty" className="kid-empty">
                  No apps yet. Ask an admin to add some.
                </p>
              )}
              <AppGrid
                // AC-002 — the grid reads its sections once, on mount. When a
                // kid's poll adopts a changed app list, remount it so a newly
                // allowed app's section is read too (and an emptied one drops).
                // SPEC-backup-import — and after a restore or import.
                key={isKid ? `kid-${services?.membershipVersion ?? 0}` : `grid-${catalogVersion}`}
                isAdmin={isAdmin}
                editMode={editMode}
                showUptimeDisplay={showUptimeDisplay}
                // UX K-3 — kids get large tiles, the biggest touch targets. The
                // server creates kids with densityPref=large; this holds it even
                // over a device cache left by another account, and a kid has no
                // control that could write it (PATCH /api/me is themePref-only).
                density={isKid ? 'large' : density}
                // SPEC-dashboard-empty-loading — whose skeleton shape to keep
                // (§3.1), the empty-box button's Library (§3.4; AppGrid shows it
                // to admins only), and the one dashboardEmpty value (§3.5).
                userId={user.id}
                onAddToBox={(box, opener) => openBrowse({ ...box, opener })}
                dashboardEmpty={dashboardEmpty}
              />
            </>
          )}
        </section>

        {/* SPEC-app-grid §7 — service management stays on the existing surfaces.
            The header Gear's "Add apps" opens the Library; "Add custom app"
            (admin) opens the add-mode form. Both lifted to App level now that
            AppGrid (unlike Catalog) doesn't host them; their result lands in the
            shared services context AppGrid renders from. */}
        {browseOpen && (
          <ChunkErrorBoundary onClose={closeBrowse}>
          <Suspense fallback={null}>
            <LibraryBrowse
              isAdmin={isAdmin}
              targetCategory={browseTarget ? { id: browseTarget.id, title: browseTarget.title } : undefined}
              onClose={closeBrowse}
              onAdded={onAddedFromLibrary}
              onCustomAdd={() => {
                setBrowseTarget(null);
                setBrowseOpen(false);
                setCustomFormOpen(true);
              }}
            />
          </Suspense>
          </ChunkErrorBoundary>
        )}
        {customFormOpen && (
          <ChunkErrorBoundary onClose={() => setCustomFormOpen(false)}>
          <Suspense fallback={null}>
            <ServiceForm
              categories={cats}
              onClose={() => setCustomFormOpen(false)}
              onSaved={onSavedCustom}
            />
          </Suspense>
          </ChunkErrorBoundary>
        )}

        {/* Feeds the launcher the shared catalog array; while still loading it
            simply has nothing to match (an empty list), never its own fetch. */}
        <CommandLauncher
          services={services?.items ?? []}
          webSearch={widgetsInfo?.search.enabled ? widgetsInfo.search : null}
        />

        {/* cap5 — ambient status-change toasts; v17 — the alert history. Neither
            is for a kid (UX §5 keeps tiles, ⌘K, favorites and Recently Opened):
            "Plex is DOWN" is the admin's business, and the kid header has no
            bell to open the history with. */}
        {/* SPEC-ui-quick-wins AC-009 — a toast's View opens the alert history
            the way the bell does (badge cleared, launcher closed). It only
            opens: a second View while the panel is up must not close it. */}
        {!isKid && <ToastContainer onView={() => !alertOpen && toggleAlerts()} />}
        {!isKid && (
          <AlertHistoryPanel open={alertOpen} events={alerts?.events ?? []} onClose={closeAlerts} />
        )}

        {settingsOpen && (
          <ChunkErrorBoundary onClose={() => setSettingsOpen(false)}>
          <Suspense fallback={null}>
            <SettingsPanel
              isAdmin={isAdmin}
              scope={settingsScope}
              initialSection={settingsSection}
              currentUserId={user.id}
              email={user.email}
              hasPassword={user.hasPassword === true}
              showHealthBar={showHealthBar}
              onSetHealthBar={setShowHealthBar}
              showUptimeDisplay={sysConfig.showUptimeDisplay}
              showUptimeDisplayPref={showUptimeDisplay}
              onSetUptimeDisplay={setShowUptimeDisplay}
              density={density}
              onSetDensity={setDensity}
              onSaveSettings={onSaveSettings}
              onServerSettingsChanged={() => void systemConfig().then(setSysConfig)}
              onCatalogChanged={onCatalogChanged}
              showWidgets={showWidgetsPref}
              onSetShowWidgets={isKid ? undefined : setShowWidgetsPref}
              onWidgetsChanged={reloadWidgetsInfo}
              onClose={() => setSettingsOpen(false)}
            />
          </Suspense>
          </ChunkErrorBoundary>
        )}
        {importOpen && (
          <ChunkErrorBoundary onClose={() => setImportOpen(false)}>
            <Suspense fallback={null}>
              <HomepageImportModal onClose={() => setImportOpen(false)} onApplied={onCatalogChanged} />
            </Suspense>
          </ChunkErrorBoundary>
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
      {changelogOpen && (
        <ChunkErrorBoundary onClose={() => setChangelogOpen(false)}>
          <Suspense fallback={null}>
            <ChangelogOverlay open onClose={() => setChangelogOpen(false)} />
          </Suspense>
        </ChunkErrorBoundary>
      )}
    </ShowWidgetsContext.Provider>
    </WidgetsInfoContext.Provider>
  );
}
