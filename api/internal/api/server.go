package api

import (
	"context"
	"log"
	"net"
	"net/http"
	"net/netip"
	"os"
	"sync"
	"sync/atomic"
	"time"

	"github.com/finish06/homepad/api/internal/gatus"
	"github.com/finish06/homepad/api/internal/oidc"
	"github.com/finish06/homepad/api/internal/session"
	"github.com/finish06/homepad/api/internal/storage"
	"github.com/finish06/homepad/api/internal/transfer"
	"github.com/finish06/homepad/api/internal/widgets"
	"github.com/finish06/homepad/api/internal/widgets/providers"
)

const sessionCookie = "homepad_session"

// oidcPendingTTL bounds how long a login may sit between the authorize redirect
// and the callback.
const oidcPendingTTL = 10 * time.Minute

type Deps struct {
	Store        *storage.Store
	Poller       *gatus.Poller
	Sessions     session.Store
	Registration RegistrationMode
	OIDC         oidc.Config
	// MaxAccounts is HOMEPAD_MAX_ACCOUNTS: 0 is no limit.
	MaxAccounts int
	// InviteLimit is the per-client limit on the invite and reset-link
	// routes; zero is the default. Limits.Invite and Limits.Reset win.
	InviteLimit RateLimit
	// Limits are the sign-in limits (SPEC-signin-hardening §2.1); a zero
	// field is its default.
	Limits Limits
	// TrustedProxies is HOMEPAD_TRUSTED_PROXIES, parsed; nil trusts no
	// proxy, so the client is always the TCP peer (§2.2).
	TrustedProxies *TrustedProxies

	// Status widgets (SPEC-status-widgets). All optional: New builds a
	// default for any left nil, so a server always has a working set.
	Widgets     *widgets.Manager
	Weather     *widgets.Weather
	Sealer      *widgets.Sealer // nil = HOMEPAD_SECRET_KEY unset: keys can't be saved
	WidgetKinds *widgets.Registry
	// Outbound is the guarded client for every server-side fetch of an
	// admin-supplied address: widgets, favicons (#90), and the OIDC and
	// Gatus checks of SPEC-admin-server-settings.
	Outbound *widgets.Client

	// SPEC-admin-server-settings. Registration, MaxAccounts, TrustedProxies
	// and OIDC above are the env layer: what applies when no value is saved
	// in the UI. Getenv reads the raw env for the source badge,
	// COOKIE_SECURE, PORT and HOMEPAD_SETTINGS_FROM_ENV_ONLY; nil is
	// os.Getenv.
	Getenv func(string) string
	// Context is the server's lifetime. With it, the server runs the
	// trusted-proxy hostname refresh loop for whichever list is live, and
	// (with SettingsReloadEvery > 0) re-reads server_settings that often.
	// Nil: neither loop runs (most tests).
	Context             context.Context
	SettingsReloadEvery time.Duration
	// ResolveHost resolves a trusted-proxy hostname saved in the UI; nil is
	// the system resolver. ProxyRefreshEvery / ProxyRetryEvery override the
	// refresh loop's timing (tests); zero is the default.
	ResolveHost       func(ctx context.Context, host string) ([]netip.Addr, error)
	ProxyRefreshEvery time.Duration
	ProxyRetryEvery   time.Duration
}

type server struct {
	store    *storage.Store
	poller   *gatus.Poller
	sessions session.Store
	pending  *oidc.Pending

	// SPEC-admin-server-settings — the live config (cfg()), the env layer
	// under it, and what keeps it current. settingsMu serializes saves,
	// resets and reloads.
	live              atomic.Pointer[liveConfig]
	env               envLayer
	envOnly           bool
	settingsMu        sync.Mutex
	providerGen       uint64
	proxyLoop         *loopHandle
	baseCtx           context.Context
	lookupHost        func(ctx context.Context, host string) ([]netip.Addr, error)
	proxyRefreshEvery time.Duration
	proxyRetryEvery   time.Duration
	oidcTests         *oidcTestFlow
	bootErr           error

	// The sign-in limits (SPEC-signin-hardening §2.1), all per process: a
	// bucket per client for each public sign-in route, the process ceiling
	// the bcrypt routes share, the one the two lookups share, and the
	// per-email login lock.
	loginLimit    *keyedLimiter
	registerLimit *keyedLimiter
	inviteLimit   *keyedLimiter
	resetLimit    *keyedLimiter
	oidcLimit     *keyedLimiter
	ceiling       *tokenBucket
	lookupCeiling *tokenBucket // the invite and reset lookups only
	loginFails    *failureLimiter
	// passwordFails counts wrong current passwords on POST /api/me/password,
	// per account (SPEC-password-reset-link §3.3). Per process.
	passwordFails *failureLimiter
	// transferWrap, when set (tests only), wraps the Writer every restore and
	// import apply writes through.
	transferWrap func(transfer.Writer) transfer.Writer

	// Status widgets (SPEC-status-widgets).
	widgets     *widgets.Manager
	weather     *widgets.Weather
	sealer      *widgets.Sealer
	widgetKinds *widgets.Registry
	outbound    *widgets.Client
	tests       testLimiter

	// comparePassword is the bcrypt compare login uses; nil means
	// bcrypt.CompareHashAndPassword. Tests inject a counting one.
	comparePassword func(hash, password []byte) error
}

// New builds the API handler. A saved server setting that should stop the
// API (§3.3) is logged and the env value is used; main calls NewChecked to
// stop instead.
func New(d Deps) http.Handler {
	h, err := NewChecked(d)
	if err != nil {
		log.Printf("%v", err)
	}
	return h
}

// NewChecked is New, returning the error a saved setting raises at boot
// (SPEC-admin-server-settings AC-006): main stops the API on it.
func NewChecked(d Deps) (http.Handler, error) {
	s := newServer(d)
	h, _ := s.routes(d)
	return h, s.bootErr
}

func newServer(d Deps) *server {
	s := &server{
		store:       d.Store,
		poller:      d.Poller,
		sessions:    d.Sessions,
		widgets:     d.Widgets,
		weather:     d.Weather,
		sealer:      d.Sealer,
		widgetKinds: d.WidgetKinds,
		outbound:    d.Outbound,
		pending:     oidc.NewPending(oidcPendingTTL),
		oidcTests:   newOIDCTestFlow(),
		baseCtx:     d.Context,
		lookupHost:  d.ResolveHost,
	}
	s.passwordFails = newFailureLimiter(time.Now, passwordFailPolicy)
	limits := d.Limits
	if limits.Invite == (RateLimit{}) {
		limits.Invite = d.InviteLimit
	}
	if limits.Reset == (RateLimit{}) {
		limits.Reset = d.InviteLimit
	}
	limits = limits.withDefaults()
	s.loginLimit = newKeyedLimiter("login", limits.Login, time.Now)
	s.registerLimit = newKeyedLimiter("register", limits.Register, time.Now)
	s.inviteLimit = newKeyedLimiter("invites", limits.Invite, time.Now)
	s.resetLimit = newKeyedLimiter("resets", limits.Reset, time.Now)
	s.oidcLimit = newKeyedLimiter("oidc login", limits.OIDCLogin, time.Now)
	s.ceiling = newTokenBucket(limits.Ceiling, time.Now)
	s.lookupCeiling = newTokenBucket(limits.LookupCeiling, time.Now)
	s.loginFails = newFailureLimiter(time.Now, loginFailPolicy)
	// Defaults for anything left unwired, so every server has a working
	// widget set (the manager's loop only runs where main starts it).
	if s.outbound == nil {
		s.outbound = widgets.NewClient()
	}
	if s.widgetKinds == nil {
		s.widgetKinds = providers.Default()
	}
	if s.weather == nil {
		s.weather = widgets.NewWeather(widgets.WeatherOptions{Client: s.outbound, Logf: log.Printf})
	}
	if s.widgets == nil {
		s.widgets = widgets.NewManager(widgets.ManagerOptions{
			Source: NewWidgetSource(d.Store), Registry: s.widgetKinds, Client: s.outbound, Sealer: s.sealer, Logf: log.Printf,
		})
	}
	s.initSettings(d)
	return s
}

// initSettings builds the env layer and the first live snapshot
// (SPEC-admin-server-settings §3.3), and starts the loops that keep it
// current when the server has a lifetime context.
func (s *server) initSettings(d Deps) {
	getenv := d.Getenv
	if getenv == nil {
		getenv = os.Getenv
	}
	if s.lookupHost == nil {
		s.lookupHost = func(ctx context.Context, host string) ([]netip.Addr, error) {
			return net.DefaultResolver.LookupNetIP(ctx, "ip", host)
		}
	}
	s.proxyRefreshEvery, s.proxyRetryEvery = d.ProxyRefreshEvery, d.ProxyRetryEvery
	if s.proxyRefreshEvery <= 0 {
		s.proxyRefreshEvery = trustedRefreshEvery
	}
	if s.proxyRetryEvery <= 0 {
		s.proxyRetryEvery = trustedRetryEvery
	}
	on, recognized := truthyFlag(getenv(SettingsFromEnvOnlyEnv))
	if !recognized {
		log.Printf("warning: %s=%q is not true/1/yes/on; saved server settings apply", SettingsFromEnvOnlyEnv, getenv(SettingsFromEnvOnlyEnv))
	}
	s.envOnly = on
	if s.poller == nil {
		s.poller = gatus.NewPoller(gatus.NewClient(""), time.Hour)
	}
	s.env = newEnvLayer(d, getenv, s.poller.BaseURL(), s.poller.DegradedAfter())
	ctx := d.Context
	if ctx == nil {
		ctx = context.Background()
	}
	s.settingsMu.Lock()
	s.bootErr = s.bootSettings(ctx)
	s.settingsMu.Unlock()
	if d.Context != nil && d.SettingsReloadEvery > 0 {
		go s.runReload(d.Context, d.SettingsReloadEvery)
	}
}

// routeClass is what a route means for a kid session (SPEC-kid-accounts §7).
// Every route is registered with one, and the class drives enforcement: the
// kid write lock is applied here, by class, not remembered per handler. The
// route-coverage test (routes_test.go) holds an independent copy of every
// route's class and probes each one with a kid session.
type routeClass string

const (
	// classPublic: no session needed (auth bootstrap, health, public config).
	classPublic routeClass = "public"
	// classCatalogFree: session-gated, returns or writes no catalog data; a
	// kid may call it (PATCH /api/me limits a kid to themePref itself).
	classCatalogFree routeClass = "catalog-free"
	// classKidFiltered: returns or touches catalog data; the handler filters
	// through storage.VisibleServiceIDs for a kid.
	classKidFiltered routeClass = "kid-filtered"
	// classKidForbidden: open to adults, 403 for a kid (requireNotKid).
	classKidForbidden routeClass = "kid-forbidden"
	// classAdminOnly: requireAdmin in the handler, and requireNotKid in front
	// of it, so a kid is refused even if a handler forgot its admin gate.
	classAdminOnly routeClass = "admin-only"
	// classCatalogWrite: admin-only, enforced exactly like classAdminOnly,
	// and the write acts on the household's catalog, which has no owner
	// (SPEC-household-catalog-owner). second_admin_test.go probes every
	// route of this class as a second admin, reading the list from here
	// (SPEC-household-basics AC-025): it now guards against a regression.
	classCatalogWrite routeClass = "catalog-write"
)

// router is the only place a route is registered (routes_test.go checks that
// nothing else calls Handle/HandleFunc), so its record is the mux's route list.
type router struct {
	s      *server
	mux    *http.ServeMux
	routes []registeredRoute
	// stub replaces every handler with a 501 (the no-store scaffold mode).
	stub bool
}

type registeredRoute struct {
	pattern string
	class   routeClass
}

// livePattern is the liveness probe, the one route that answers even in the
// no-store scaffold mode.
const livePattern = "GET /live"

func (rt *router) handle(pattern string, class routeClass, h http.HandlerFunc) {
	var handler http.Handler = h
	switch {
	case rt.stub && pattern != livePattern:
		handler = http.HandlerFunc(notImplemented)
	case class == classKidForbidden || class == classAdminOnly || class == classCatalogWrite:
		handler = rt.s.requireNotKid(h)
	}
	rt.mux.Handle(pattern, handler)
	rt.routes = append(rt.routes, registeredRoute{pattern: pattern, class: class})
}

// routes registers every route and returns the handler with the record of
// what was registered. Without a Store wired (e.g. the scaffold test harness)
// the same routes are registered as 501s, so the surface is still routable and
// there is no second, hand-copied list to drift.
func (s *server) routes(d Deps) (http.Handler, []registeredRoute) {
	rt := &router{s: s, mux: http.NewServeMux(), stub: d.Store == nil || d.Sessions == nil}

	// SPEC-signin-hardening §2.1 — each public sign-in route has a limit per
	// client, and the bcrypt ones share the process ceiling; login also locks
	// an email after 10 failures (handleLogin).
	rt.handle("POST /api/register", classPublic, s.limited("POST /api/register", s.registerLimit, s.handleRegister))
	rt.handle("POST /api/login", classPublic, s.limited("POST /api/login", s.loginLimit, s.handleLogin))
	rt.handle("POST /api/logout", classCatalogFree, s.handleLogout)
	rt.handle("GET /api/me", classCatalogFree, s.handleMe)
	rt.handle("PATCH /api/me", classCatalogFree, s.handlePatchMe)
	rt.handle("GET /api/me/collapsed-categories", classKidFiltered, s.handleGetCollapsedCategories)
	rt.handle("PUT /api/me/collapsed-categories", classKidForbidden, s.handleSetCollapsedCategories)
	rt.handle("GET /api/services", classKidFiltered, s.handleListServices)
	rt.handle("POST /api/services", classCatalogWrite, s.handleCreateService)
	rt.handle("PATCH /api/services/{id}", classCatalogWrite, s.handleUpdateService)
	rt.handle("DELETE /api/services/{id}", classCatalogWrite, s.handleDeleteService)
	rt.handle("GET /api/categories", classKidFiltered, s.handleListCategories)
	rt.handle("POST /api/categories", classCatalogWrite, s.handleCreateCategory)
	rt.handle("PUT /api/categories/order", classCatalogWrite, s.handleSetCategoryOrder)
	rt.handle("PATCH /api/categories/{id}", classCatalogWrite, s.handleUpdateCategory)
	rt.handle("DELETE /api/categories/{id}", classCatalogWrite, s.handleDeleteCategory)
	rt.handle("GET /api/services/{id}/icon/{variant}", classKidFiltered, s.handleGetIcon)
	rt.handle("PUT /api/services/{id}/icon/{variant}", classCatalogWrite, s.handlePutIcon)
	rt.handle("DELETE /api/services/{id}/icon/{variant}", classCatalogWrite, s.handleDeleteIcon)
	rt.handle("POST /api/services/{id}/fetch-icon", classCatalogWrite, s.handleFetchIcon)
	rt.handle("POST /api/favorites/{id}", classKidFiltered, s.handleAddFavorite)
	rt.handle("DELETE /api/favorites/{id}", classKidFiltered, s.handleRemoveFavorite)
	// App Library (v9.2): browse is session-gated (any adult); CRUD, reorder
	// and add are admin-gated via requireAdmin (D10, SPEC-245-224). /order is
	// declared before /{id} so the literal path wins the ServeMux match.
	rt.handle("GET /api/library", classKidForbidden, s.handleListLibrary)
	rt.handle("POST /api/library", classAdminOnly, s.handleCreateLibraryApp)
	rt.handle("PUT /api/library/order", classAdminOnly, s.handleSetLibraryOrder)
	rt.handle("PATCH /api/library/{id}", classAdminOnly, s.handleUpdateLibraryApp)
	rt.handle("DELETE /api/library/{id}", classAdminOnly, s.handleDeleteLibraryApp)
	rt.handle("POST /api/library/{id}/add", classCatalogWrite, s.handleAddFromLibrary)
	rt.handle("PUT /api/layout", classKidForbidden, s.handleUpdateLayout)
	rt.handle("GET /api/status", classKidFiltered, s.handleStatus)
	// SPEC-v24 §12.3 — on-demand re-poll behind the health panel's "Retry now".
	rt.handle("POST /api/status/refresh", classKidForbidden, s.handleStatusRefresh)
	rt.handle("GET /health", classPublic, s.handleHealth)

	// System settings (cap6). The config read is public — registered
	// alongside GET /api/auth/config as the two unauthenticated config
	// endpoints (D4) — while the write is admin-only via requireAdmin (D5).
	rt.handle("GET /api/system/config", classPublic, s.handleSystemConfig)
	rt.handle("PATCH /api/admin/settings", classAdminOnly, s.handlePatchSystemSettings)
	// SPEC-v26 — read-only admin view of allowlisted runtime env vars.
	rt.handle("GET /api/admin/env-config", classAdminOnly, s.handleAdminEnvConfig)

	// SPEC-kid-accounts §7 — the admin Accounts API.
	rt.handle("GET /api/admin/accounts", classAdminOnly, s.handleListAccounts)
	rt.handle("POST /api/admin/kids", classAdminOnly, s.handleCreateKid)
	rt.handle("PATCH /api/admin/kids/{id}", classAdminOnly, s.handleUpdateKid)
	rt.handle("DELETE /api/admin/kids/{id}", classAdminOnly, s.handleDeleteKid)
	rt.handle("GET /api/admin/kids/{id}/services", classAdminOnly, s.handleGetKidServices)
	rt.handle("PUT /api/admin/kids/{id}/services", classAdminOnly, s.handleSetKidServices)
	rt.handle("GET /api/admin/kids/{id}/sessions", classAdminOnly, s.handleListKidSessions)
	rt.handle("DELETE /api/admin/kids/{id}/sessions/{sid}", classAdminOnly, s.handleRevokeKidSession)
	rt.handle("POST /api/admin/kids/{id}/sign-in-here", classAdminOnly, s.handleSignInHere)

	// SPEC-household-manage-adults §7 — change an adult's role, remove an adult.
	rt.handle(patchAdultRoute, classAdminOnly, s.handlePatchAdult)
	rt.handle(removeAdultRoute, classAdminOnly, s.handleRemoveAdult)

	// SPEC-household-basics §7 — invites. Making, listing and revoking are
	// admin-only; the link's two routes are public and share one per-client
	// limit (SPEC-signin-hardening §2.1). Only accept runs bcrypt, so only
	// accept spends the process ceiling; lookup has its own, cheaper one.
	rt.handle("POST /api/admin/invites", classAdminOnly, s.handleCreateInvite)
	rt.handle("GET /api/admin/invites", classAdminOnly, s.handleListInvites)
	rt.handle("DELETE /api/admin/invites/{id}", classAdminOnly, s.handleRevokeInvite)
	rt.handle("POST /api/invites/lookup", classPublic, s.lookupLimited("POST /api/invites/lookup", s.inviteLimit, s.handleLookupInvite))
	rt.handle("POST /api/invites/accept", classPublic, s.limited("POST /api/invites/accept", s.inviteLimit, s.handleAcceptInvite))

	// SPEC-password-reset-link §7 — reset links and changing your own
	// password. Making a link is admin-only; the link's two routes are public
	// and share their own per-client limit (SPEC-signin-hardening §2.1). Only
	// accept runs bcrypt, so only accept spends the process ceiling; lookup
	// shares the invite lookup's cheaper one.
	rt.handle("POST /api/admin/accounts/{id}/reset-link", classAdminOnly, s.handleCreateResetLink)
	rt.handle("POST /api/password-resets/lookup", classPublic, s.lookupLimited("POST /api/password-resets/lookup", s.resetLimit, s.handleLookupReset))
	rt.handle("POST /api/password-resets/accept", classPublic, s.limited("POST /api/password-resets/accept", s.resetLimit, s.handleAcceptReset))
	rt.handle("POST /api/me/password", classKidForbidden, s.handleChangePassword)

	// SPEC-backup-import §8 — backup, restore and Homepage import.
	rt.handle("GET /api/admin/export", classAdminOnly, s.handleExport)
	rt.handle("POST /api/admin/restore/preview", classAdminOnly, s.handleRestorePreview)
	rt.handle("POST /api/admin/restore", classAdminOnly, s.handleRestore)
	rt.handle("POST /api/admin/import/homepage/preview", classAdminOnly, s.handleImportPreview)
	rt.handle("POST /api/admin/import/homepage", classAdminOnly, s.handleImport)

	// SPEC-status-widgets §7.1. The info strip holds no catalog data, so
	// kids read it (catalog-free); every widget config route is admin-only.
	rt.handle("GET /api/widgets/info", classCatalogFree, s.handleWidgetsInfo)
	rt.handle("GET /api/admin/widgets/kinds", classAdminOnly, s.handleWidgetKinds)
	rt.handle("GET /api/services/{id}/widget", classAdminOnly, s.handleGetWidget)
	rt.handle("PUT /api/services/{id}/widget", classAdminOnly, s.handlePutWidget)
	rt.handle("DELETE /api/services/{id}/widget", classAdminOnly, s.handleDeleteWidget)
	rt.handle("POST /api/services/{id}/widget/test", classAdminOnly, s.handleTestWidget)
	rt.handle("GET /api/admin/geocode", classAdminOnly, s.handleGeocode)

	// SPEC-admin-server-settings §7 — server settings saved in the UI.
	rt.handle("GET /api/admin/server-settings", classAdminOnly, s.handleGetServerSettings)
	rt.handle("PATCH /api/admin/server-settings", classAdminOnly, s.handlePatchServerSettings)
	rt.handle("DELETE /api/admin/server-settings/{key}", classAdminOnly, s.handleResetServerSetting)
	rt.handle("POST /api/admin/server-settings/oidc/test", classAdminOnly, s.handleStartOIDCTest)
	rt.handle("GET /api/admin/server-settings/oidc/test/{id}", classAdminOnly, s.handleOIDCTestStatus)

	// OIDC config is always advertised so the web client can gate its
	// "Log in with PocketID" button. The login and callback routes are
	// always registered and answer 404 while single sign-on is off, so it
	// can be turned on live (SPEC-admin-server-settings AC-017). The
	// callback also finishes an admin's test sign-in, which works while
	// single sign-on is off.
	rt.handle("GET /api/auth/config", classPublic, s.handleOIDCConfig)
	rt.handle("GET /api/auth/oidc/login", classPublic, s.oidcOn(s.oidcStartLimited(s.oidcLimit, s.handleOIDCLogin)))
	rt.handle("GET /api/auth/oidc/callback", classPublic, s.handleOIDCCallback)

	rt.handle(livePattern, classPublic, handleLive)

	return refuseFraming(rt.mux), rt.routes
}

// refuseFraming sends the anti-framing headers on every response (homepad
// #612). The web nginx adds them to what it serves, but the ingress sends
// /api/* straight here, so the API has to send them itself. They are set
// before the handler runs, so a handler that sets its own
// Content-Security-Policy replaces this one rather than being overwritten;
// none does today, and one that does must keep frame-ancestors 'none'.
func refuseFraming(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Frame-Options", "DENY")
		h.Set("Content-Security-Policy", "frame-ancestors 'none'")
		next.ServeHTTP(w, r)
	})
}

func (s *server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if err := s.store.Ping(r.Context()); err != nil {
		http.Error(w, "database unreachable", http.StatusServiceUnavailable)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func handleLive(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("ok"))
}

func notImplemented(w http.ResponseWriter, r *http.Request) {
	http.Error(w, "not implemented", http.StatusNotImplemented)
}
