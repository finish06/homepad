package api

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"

	"github.com/finish06/homepad/api/internal/gatus"
	"github.com/finish06/homepad/api/internal/oidc"
	"github.com/finish06/homepad/api/internal/storage"
)

// SPEC-admin-server-settings §2.2 — the live config holder. Handlers read
// every server setting from one immutable snapshot behind an atomic pointer
// (s.cfg()), never from server fields, so a save applies on the next request
// with no restart.

// SettingsReloadEvery is how often main has each process re-read
// server_settings, so a change made on one replica applies on the others
// within 30 seconds (AC-030).
const SettingsReloadEvery = 25 * time.Second

// envLayer is what applies when no UI value is saved: the env var as main
// parsed it, else the default. It never changes after boot.
type envLayer struct {
	values  map[string]string // normalized, per key
	set     map[string]bool   // the env var is set (source "env")
	trusted *TrustedProxies   // HOMEPAD_TRUSTED_PROXIES as main parsed it
}

// newEnvLayer builds the env layer from what main (or a test) parsed into
// Deps, plus the raw env for the source badge. A key counts as set in env
// when its env var is set or the parsed value isn't the default.
func newEnvLayer(d Deps, getenv func(string) string, gatusBase string, degraded time.Duration) envLayer {
	reg := DefaultRegistration
	if d.Registration == RegistrationOpen {
		reg = "open"
	}
	trustedRaw := ""
	if d.TrustedProxies != nil {
		trustedRaw = d.TrustedProxies.raw
	}
	o := d.OIDC
	v := map[string]string{
		keyCookieSecure:     strconv.FormatBool(ParseCookieSecure(getenv(keyCookieSecure))),
		keyTrustedProxies:   trustedRaw,
		keyPort:             strings.TrimSpace(getenv(keyPort)),
		keyGatusBaseURL:     strings.TrimRight(gatusBase, "/"),
		keyGatusDegradedMs:  strconv.Itoa(int(degraded / time.Millisecond)),
		keyRegistration:     reg,
		keyMaxAccounts:      strconv.Itoa(d.MaxAccounts),
		keyOIDCEnabled:      strconv.FormatBool(o.Enabled),
		keyOIDCIssuer:       strings.TrimRight(o.Issuer, "/"),
		keyOIDCDiscoveryURL: o.DiscoveryURL,
		keyOIDCRedirectURL:  o.RedirectURL,
		keyOIDCClientID:     o.ClientID,
		keyOIDCClientSecret: o.ClientSecret,
		keyOIDCAdminGroup:   o.AdminGroup,
		keyOIDCMemberGroup:  o.MemberGroup,
	}
	if v[keyPort] == "" {
		v[keyPort] = "8080"
	}
	set := map[string]bool{}
	for _, def := range serverSettingDefs {
		set[def.Key] = strings.TrimSpace(getenv(def.Key)) != "" || v[def.Key] != def.Default
	}
	return envLayer{values: v, set: set, trusted: d.TrustedProxies}
}

// settingState is one key in a snapshot: where its value came from, and
// what the UI saved.
type settingState struct {
	def    *settingDef
	value  string // effective, normalized
	source string // ui | env | default
	// saved: a value is saved in the UI (used or not). savedValue is it,
	// normalized; savedInvalid: it failed validation and is ignored (§3.3).
	saved        bool
	savedValue   string
	savedInvalid bool
	unreadable   bool // the saved secret can't be opened (AC-015)
	updatedAt    *time.Time
	updatedBy    *storage.ServerSettingRow
}

// liveConfig is one immutable snapshot of every server setting.
type liveConfig struct {
	cookieSecure bool
	registration RegistrationMode
	maxAccounts  int
	trusted      *TrustedProxies
	trustedRaw   string
	gatusBaseURL string
	degradedMs   int
	oidc         oidc.Config
	// provider is built for oidc when single sign-on is on; nil when off.
	// gen changes with every new provider, so a login begun on an older one
	// fails cleanly (AC-018).
	provider *oidc.Provider
	gen      uint64

	envOnly     bool
	settings    map[string]*settingState
	fingerprint string
}

// uiValues is what the UI saved, opened: normalized value per key, plus the
// row's metadata. The secret is plaintext here and never leaves memory.
type uiValues struct {
	values     map[string]string
	rows       map[string]storage.ServerSettingRow
	degraded   *int
	unreadable bool // the saved secret can't be opened
	invalid    map[string]string
}

func (u uiValues) clone() uiValues {
	n := uiValues{values: map[string]string{}, rows: u.rows, degraded: u.degraded, unreadable: u.unreadable, invalid: map[string]string{}}
	for k, v := range u.values {
		n.values[k] = v
	}
	for k, v := range u.invalid {
		n.invalid[k] = v
	}
	return n
}

// errSavedMaxAccounts stops the API at boot: a saved account limit that
// fails validation, like a junk env value (§3.3, AC-006).
var errSavedMaxAccounts = errors.New("settings: the account limit saved in Admin Panel → System is not a whole number from 0 to 10000; fix it with " + SettingsFromEnvOnlyEnv + "=true")

// loadUI reads server_settings and the "Slow" threshold and opens the
// secret. A saved value that fails today's rule is set aside in invalid
// (§3.3); fingerprint identifies the stored state for the reload loop.
func (s *server) loadUI(ctx context.Context) (uiValues, string, error) {
	u := uiValues{values: map[string]string{}, rows: map[string]storage.ServerSettingRow{}, invalid: map[string]string{}}
	if s.store == nil {
		return u, "", nil
	}
	rows, err := s.store.ServerSettings(ctx)
	if err != nil {
		return u, "", err
	}
	sys, err := s.store.SystemSettings(ctx)
	if err != nil {
		return u, "", err
	}
	h := sha256.New()
	for _, r := range rows {
		fmt.Fprintf(h, "%s|%v|%x|%x|%s|%d\n", r.Key, r.Value != nil, r.Sealed, r.Nonce, deref(r.Value), r.UpdatedAt.UnixNano())
		def, ok := settingDefByKey[r.Key]
		if !ok || !def.Stored {
			continue
		}
		u.rows[r.Key] = r
		raw := deref(r.Value)
		if def.Type == typeSecret {
			plain, err := s.sealer.Open(r.Sealed, r.Nonce, secretAAD)
			if err != nil {
				u.unreadable = true
				continue
			}
			raw = string(plain)
		}
		norm, err := def.norm(raw)
		if err != nil {
			u.invalid[r.Key] = raw
			continue
		}
		u.values[r.Key] = norm
	}
	if sys.StatusDegradedMs != nil {
		v := *sys.StatusDegradedMs
		u.degraded = &v
		fmt.Fprintf(h, "degraded|%d\n", v)
	}
	return u, hex.EncodeToString(h.Sum(nil)), nil
}

func deref(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

// build resolves every key from ui, env and the defaults (§2.1) into a
// snapshot. It does no I/O; trusted-proxy hostnames are resolved by apply.
// reuse offers already-parsed proxy lists to keep (by raw value).
func (s *server) build(ui uiValues, reuse ...*TrustedProxies) (*liveConfig, error) {
	c := &liveConfig{envOnly: s.envOnly, settings: map[string]*settingState{}}
	for i := range serverSettingDefs {
		def := &serverSettingDefs[i]
		st := &settingState{def: def}
		uiVal, uiOK := ui.values[def.Key]
		if def.Key == keyGatusDegradedMs && ui.degraded != nil {
			st.saved = true
			uiVal = strconv.Itoa(*ui.degraded)
			_, err := def.norm(uiVal)
			uiOK = err == nil
			st.savedInvalid = !uiOK
		}
		if row, ok := ui.rows[def.Key]; ok {
			st.saved = true
			t := row.UpdatedAt
			st.updatedAt = &t
			r := row
			st.updatedBy = &r
		}
		st.savedValue = uiVal
		if raw, bad := ui.invalid[def.Key]; bad {
			st.savedInvalid, st.savedValue = true, raw
		}
		st.unreadable = def.Type == typeSecret && ui.unreadable
		switch {
		case uiOK && !s.envOnly:
			st.value, st.source = uiVal, "ui"
		case def.Key == keyRegistration && st.savedInvalid && !s.envOnly:
			// §3.3 — a saved sign-up mode that fails the rule fails closed.
			st.value, st.source = DefaultRegistration, "ui"
		case def.Key == keyMaxAccounts && st.savedInvalid && !s.envOnly:
			return nil, errSavedMaxAccounts
		case s.env.set[def.Key]:
			st.value, st.source = s.env.values[def.Key], "env"
		default:
			st.value, st.source = def.Default, "default"
		}
		c.settings[def.Key] = st
	}
	val := func(k string) string { return c.settings[k].value }
	c.cookieSecure = val(keyCookieSecure) == "true"
	c.registration, _ = ParseRegistrationMode(val(keyRegistration))
	c.maxAccounts, _ = strconv.Atoi(val(keyMaxAccounts))
	c.gatusBaseURL = val(keyGatusBaseURL)
	c.degradedMs, _ = strconv.Atoi(val(keyGatusDegradedMs))
	c.oidc = oidc.Config{
		Enabled:      val(keyOIDCEnabled) == "true",
		Issuer:       val(keyOIDCIssuer),
		DiscoveryURL: val(keyOIDCDiscoveryURL),
		RedirectURL:  val(keyOIDCRedirectURL),
		ClientID:     val(keyOIDCClientID),
		ClientSecret: val(keyOIDCClientSecret),
		AdminGroup:   val(keyOIDCAdminGroup),
		MemberGroup:  val(keyOIDCMemberGroup),
		Scopes:       []string{"openid", "profile", "email", "groups"},
	}
	c.trustedRaw = val(keyTrustedProxies)
	if c.settings[keyTrustedProxies].source != "ui" {
		c.trusted = s.env.trusted
	} else {
		for _, tp := range reuse {
			if tp != nil && tp.raw == c.trustedRaw && tp != s.env.trusted {
				c.trusted = tp
				break
			}
		}
		if c.trusted == nil {
			tp, err := parseTrustedProxies(c.trustedRaw, s.lookupHost)
			if err != nil { // can't happen: the value passed normTrustedProxies
				return nil, err
			}
			c.trusted = tp
		}
	}
	return c, nil
}

// apply makes next the live snapshot: it resolves new proxy hostnames before
// the swap, restarts the refresh loop for a new list, builds a new OIDC
// provider when any sign-in value changed (fresh discovery and keys), and
// pushes the Gatus address and "Slow" threshold to the poller. Callers hold
// settingsMu.
func (s *server) apply(ctx context.Context, next *liveConfig) {
	prev := s.live.Load()
	if prev != nil && prev.trusted == next.trusted {
		// same list object: keep its loop
	} else {
		// Resolve the new list's hostnames before the swap (AC-019).
		next.trusted.Refresh(ctx)
		s.swapProxyLoop(next.trusted)
	}
	switch {
	case prev != nil && prev.oidc.Equal(next.oidc):
		next.provider, next.gen = prev.provider, prev.gen
	default:
		s.providerGen++
		next.gen = s.providerGen
		if next.oidc.Enabled {
			next.provider = oidc.NewProviderWithClient(next.oidc, s.outbound.HTTPClient())
		}
	}
	if s.poller != nil {
		if prev == nil || prev.degradedMs != next.degradedMs {
			s.poller.SetDegradedAfter(time.Duration(next.degradedMs) * time.Millisecond)
		}
		if prev != nil && prev.gatusBaseURL != next.gatusBaseURL {
			s.poller.SetBaseURL(next.gatusBaseURL)
			// Saving triggers one poll (§2.2), off the request path.
			go func() {
				pctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
				defer cancel()
				_, _ = s.poller.PollNow(pctx)
			}()
		} else if prev == nil && s.poller.BaseURL() != next.gatusBaseURL {
			s.poller.SetBaseURL(next.gatusBaseURL)
		}
	}
	s.live.Store(next)
}

// cfg is the live snapshot every handler reads. A server built without
// newServer (internal tests) reads the built-in defaults.
func (s *server) cfg() *liveConfig {
	if c := s.live.Load(); c != nil {
		return c
	}
	return &liveConfig{cookieSecure: true, degradedMs: int(gatus.DefaultDegradedAfter / time.Millisecond), settings: map[string]*settingState{}}
}

// swapProxyLoop stops the running hostname refresh loop, waits for it to
// exit, and starts one for tp when it has hostnames and the server has a
// lifetime context (AC-019). Callers hold settingsMu.
func (s *server) swapProxyLoop(tp *TrustedProxies) {
	if s.proxyLoop != nil {
		s.proxyLoop.cancel()
		<-s.proxyLoop.done
		s.proxyLoop = nil
	}
	if s.baseCtx == nil || !tp.HasHostnames() {
		return
	}
	ctx, cancel := context.WithCancel(s.baseCtx)
	done := make(chan struct{})
	go func() {
		defer close(done)
		tp.Run(ctx, s.proxyRefreshEvery, s.proxyRetryEvery)
	}()
	s.proxyLoop = &loopHandle{cancel: cancel, done: done}
}

type loopHandle struct {
	cancel context.CancelFunc
	done   chan struct{}
}

// bootSettings builds and applies the first snapshot. A saved account limit
// that fails validation is an error (main stops the API); every other bad
// saved value is ignored with one warning naming the key (AC-006).
func (s *server) bootSettings(ctx context.Context) error {
	ui, fp, err := s.loadUI(ctx)
	if err != nil {
		log.Printf("settings: read saved server settings: %v; using the environment", err)
		ui = uiValues{values: map[string]string{}, rows: map[string]storage.ServerSettingRow{}, invalid: map[string]string{}}
	}
	next, err := s.build(ui)
	if err != nil {
		// Keep a working server for New (tests); main stops on the error.
		s.envOnlyFallback(ui)
		return err
	}
	next.fingerprint = fp
	s.logBootWarnings(ui)
	s.apply(ctx, next)
	return nil
}

// envOnlyFallback applies the env-only snapshot when the saved values can't
// be used at all.
func (s *server) envOnlyFallback(ui uiValues) {
	keep := s.envOnly
	s.envOnly = true
	next, _ := s.build(ui)
	s.envOnly = keep
	s.apply(context.Background(), next)
}

func (s *server) logBootWarnings(ui uiValues) {
	if s.envOnly {
		if len(ui.rows) > 0 || ui.degraded != nil {
			log.Printf("settings: %s is on: values saved in Admin Panel → System are ignored", SettingsFromEnvOnlyEnv)
		}
		return
	}
	for k := range ui.invalid {
		switch k {
		case keyRegistration:
			log.Printf("settings: the saved %s is not open or invite_only; using invite_only", k)
		default:
			log.Printf("settings: the saved %s fails validation; ignored, using env or the default", k)
		}
	}
	if ui.unreadable {
		log.Printf("settings: the saved %s can't be opened with the server key; using the env secret if there is one", keyOIDCClientSecret)
	}
}

// reload re-reads server_settings and applies it when it changed — on
// another replica, or by this process's own save (force).
func (s *server) reload(ctx context.Context, force bool) error {
	s.settingsMu.Lock()
	defer s.settingsMu.Unlock()
	return s.reloadLocked(ctx, force)
}

func (s *server) reloadLocked(ctx context.Context, force bool, reuse ...*TrustedProxies) error {
	ui, fp, err := s.loadUI(ctx)
	if err != nil {
		return err
	}
	cur := s.cfg()
	if !force && cur != nil && cur.fingerprint == fp {
		return nil
	}
	if cur != nil {
		reuse = append(reuse, cur.trusted)
	}
	next, err := s.build(ui, reuse...)
	if err != nil {
		log.Printf("settings: reload: %v; keeping the current settings", err)
		return err
	}
	next.fingerprint = fp
	s.apply(ctx, next)
	return nil
}

// runReload re-reads server_settings every interval until ctx ends (AC-030).
func (s *server) runReload(ctx context.Context, every time.Duration) {
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if err := s.reload(ctx, false); err != nil && ctx.Err() == nil {
				log.Printf("settings: reload: %v", err)
			}
		}
	}
}

// truthyFlag reads HOMEPAD_SETTINGS_FROM_ENV_ONLY: only true/1/yes/on turn
// it on (§2.6).
func truthyFlag(v string) (on, recognized bool) {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "1", "true", "yes", "on":
		return true, true
	case "", "0", "false", "no", "off":
		return false, true
	}
	return false, false
}

// SavedSettingReplacesEnv reports whether a valid value for key is saved in
// the UI and will be used (HOMEPAD_SETTINGS_FROM_ENV_ONLY off). main asks it
// before stopping on a junk HOMEPAD_TRUSTED_PROXIES or HOMEPAD_MAX_ACCOUNTS:
// a good saved value lets the API start (§3.3).
func SavedSettingReplacesEnv(ctx context.Context, store *storage.Store, key string, getenv func(string) string) bool {
	if on, _ := truthyFlag(getenv(SettingsFromEnvOnlyEnv)); on || store == nil {
		return false
	}
	def, ok := settingDefByKey[key]
	if !ok || !def.Stored || def.Type == typeSecret {
		return false
	}
	rows, err := store.ServerSettings(ctx)
	if err != nil {
		return false
	}
	for _, r := range rows {
		if r.Key == key && r.Value != nil {
			_, err := def.norm(*r.Value)
			return err == nil
		}
	}
	return false
}
