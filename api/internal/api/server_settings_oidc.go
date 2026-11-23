package api

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/finish06/homepad/api/internal/oidc"
)

// SPEC-admin-server-settings §2.5 (Q2 A) — the test sign-in. Before a single
// sign-on change applies, an admin with no local password proves the new
// values work: Homepad opens the provider with the staged values, and the
// callback checks who came back without starting a session. A pass is a
// token bound to that admin and to a hash of exactly those values, good for
// 10 minutes. Runs and tokens live in this process's memory.

// oidcTestTTL is how long a test run waits for its callback, and how long a
// passed test's token is good for.
const oidcTestTTL = 10 * time.Minute

// The states GET /api/admin/server-settings/oidc/test/{id} reports.
const (
	oidcTestPending = "pending"
	oidcTestPassed  = "passed"
	oidcTestFailed  = "failed"
)

type oidcTestRun struct {
	id, state, verifier, nonce string
	adminID, adminEmail        string
	cfg                        oidc.Config
	provider                   *oidc.Provider
	expires                    time.Time

	status, message, token string
}

type oidcTestToken struct {
	adminID, hash string
	expires       time.Time
}

type oidcTestFlow struct {
	mu      sync.Mutex
	byID    map[string]*oidcTestRun
	byState map[string]*oidcTestRun
	tokens  map[string]oidcTestToken
	now     func() time.Time
}

func newOIDCTestFlow() *oidcTestFlow {
	return &oidcTestFlow{byID: map[string]*oidcTestRun{}, byState: map[string]*oidcTestRun{},
		tokens: map[string]oidcTestToken{}, now: time.Now}
}

// sweep drops expired runs and tokens. Callers hold mu.
func (f *oidcTestFlow) sweep() {
	now := f.now()
	for id, r := range f.byID {
		if now.After(r.expires) {
			delete(f.byID, id)
			delete(f.byState, r.state)
		}
	}
	for t, tok := range f.tokens {
		if now.After(tok.expires) {
			delete(f.tokens, t)
		}
	}
}

func (f *oidcTestFlow) add(r *oidcTestRun) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.sweep()
	r.expires = f.now().Add(oidcTestTTL)
	f.byID[r.id], f.byState[r.state] = r, r
}

// takeState returns the pending run for a callback state, once.
func (f *oidcTestFlow) takeState(state string) *oidcTestRun {
	if state == "" {
		return nil
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	f.sweep()
	r, ok := f.byState[state]
	if !ok {
		return nil
	}
	delete(f.byState, state)
	return r
}

func (f *oidcTestFlow) finish(r *oidcTestRun, passed bool, message string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if !passed {
		r.status, r.message = oidcTestFailed, message
		return
	}
	r.status, r.token = oidcTestPassed, oidc.RandToken()
	f.tokens[r.token] = oidcTestToken{adminID: r.adminID, hash: r.cfg.Hash(), expires: f.now().Add(oidcTestTTL)}
}

func (f *oidcTestFlow) status(id, adminID string) (oidcTestRun, bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.sweep()
	r, ok := f.byID[id]
	if !ok || r.adminID != adminID {
		return oidcTestRun{}, false
	}
	return *r, true
}

// valid reports whether token is a live pass by adminID for exactly cfg.
func (f *oidcTestFlow) valid(token, adminID string, cfg oidc.Config) bool {
	if token == "" {
		return false
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	f.sweep()
	t, ok := f.tokens[token]
	return ok && t.adminID == adminID && t.hash == cfg.Hash()
}

func (f *oidcTestFlow) consume(token string) {
	f.mu.Lock()
	delete(f.tokens, token)
	f.mu.Unlock()
}

// handleStartOIDCTest is POST /api/admin/server-settings/oidc/test: it takes
// the staged Sign-in values ({set:{OIDC_*:value}}, laid over what is in
// force), checks discovery, and answers {id, authorizeUrl}. The web app opens
// the URL in a new tab and polls the status route with the id.
func (s *server) handleStartOIDCTest(w http.ResponseWriter, r *http.Request) {
	admin, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}
	if s.envOnly {
		writeSettingsError(w, http.StatusConflict, settingsError{Error: "env_only", Message: envOnlyMessage})
		return
	}
	var in struct {
		Set map[string]json.RawMessage `json:"set"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&in); err != nil {
		writeSettingsError(w, http.StatusBadRequest, settingsError{Error: "invalid", Message: "The request isn't valid JSON."})
		return
	}
	for k := range in.Set {
		if !isOIDCKey(k) {
			if _, known := settingDefByKey[k]; !known {
				writeSettingsError(w, http.StatusNotFound, unknownKey(k))
				return
			}
			writeSettingsError(w, http.StatusBadRequest, settingsError{Error: "invalid", Key: k, Message: "Only sign-in settings can be tested."})
			return
		}
	}
	s.settingsMu.Lock()
	ui, _, err := s.loadUI(r.Context())
	if err != nil {
		s.settingsMu.Unlock()
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	next, serr := s.stage(ui, in.Set)
	s.settingsMu.Unlock()
	if serr != nil {
		writeSettingsError(w, serr.status, serr.body)
		return
	}
	cfg := next.oidc
	cfg.Enabled = true
	if missing := missingOIDC(cfg); len(missing) > 0 {
		writeSettingsError(w, http.StatusBadRequest, incompleteOIDC(missing))
		return
	}
	provider := oidc.NewProviderWithClient(cfg, s.outbound.HTTPClient())
	if msg := checkDiscovery(r.Context(), provider); msg != "" {
		writeSettingsError(w, http.StatusUnprocessableEntity, settingsError{Error: "discovery_failed", Message: msg})
		return
	}
	run := &oidcTestRun{id: oidc.RandToken(), state: oidc.RandToken(), verifier: oidc.NewVerifier(), nonce: oidc.RandToken(),
		adminID: admin.ID, adminEmail: admin.Email, cfg: cfg, provider: provider, status: oidcTestPending}
	authURL, err := provider.AuthCodeURL(r.Context(), run.state, run.nonce, oidc.Challenge(run.verifier))
	if err != nil {
		writeSettingsError(w, http.StatusUnprocessableEntity, settingsError{Error: "discovery_failed", Message: "Couldn't build the sign-in address from the provider's settings."})
		return
	}
	s.oidcTests.add(run)
	log.Printf("settings: admin %s started a single sign-on test sign-in", admin.ID)
	writeJSON(w, http.StatusOK, struct {
		ID           string `json:"id"`
		AuthorizeURL string `json:"authorizeUrl"`
	}{run.id, authURL})
}

// checkDiscovery runs the save-time discovery check with a 5 s budget and
// returns the admin's message, or "" when it passed (§2.5, AC-021).
func checkDiscovery(ctx context.Context, p *oidc.Provider) string {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := p.CheckDiscovery(ctx); err != nil {
		return err.Error()
	}
	return ""
}

// finishOIDCTest is the callback for a test run: it starts no session. It
// passes when the verified email is the acting admin's, or the groups hold
// the staged admin group. The tab lands on /#oidc-test=passed or =failed.
func (s *server) finishOIDCTest(w http.ResponseWriter, r *http.Request, run *oidcTestRun, code string) {
	fail := func(msg string) {
		s.oidcTests.finish(run, false, msg)
		log.Printf("settings: admin %s single sign-on test sign-in failed: %s", run.adminID, msg)
		http.Redirect(w, r, "/#oidc-test=failed", http.StatusFound)
	}
	if code == "" {
		fail("The provider sent no sign-in code back.")
		return
	}
	claims, err := identify(r.Context(), run.provider, code, run.verifier, run.nonce)
	if err != nil {
		log.Printf("settings: test sign-in: %v", err)
		fail("The provider refused the sign-in. Check the client ID, the secret and the redirect URL.")
		return
	}
	verified := claims.EmailVerified != nil && *claims.EmailVerified
	switch {
	case verified && claims.Email != "" && strings.EqualFold(claims.Email, run.adminEmail):
	case run.cfg.AdminGroup != "" && containsString(claims.Groups, run.cfg.AdminGroup):
	default:
		fail("You signed in, but not as this admin, and not in the admin group.")
		return
	}
	s.oidcTests.finish(run, true, "")
	log.Printf("settings: admin %s passed a single sign-on test sign-in", run.adminID)
	http.Redirect(w, r, "/#oidc-test=passed", http.StatusFound)
}

// handleOIDCTestStatus is GET /api/admin/server-settings/oidc/test/{id}:
// {state, token?, message?}. Only the admin who started the run sees it.
func (s *server) handleOIDCTestStatus(w http.ResponseWriter, r *http.Request) {
	admin, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}
	run, ok := s.oidcTests.status(r.PathValue("id"), admin.ID)
	if !ok {
		writeSettingsError(w, http.StatusNotFound, settingsError{Error: "not_found", Message: "That test sign-in has ended. Start a new one."})
		return
	}
	writeJSON(w, http.StatusOK, struct {
		State   string `json:"state"`
		Token   string `json:"token,omitempty"`
		Message string `json:"message,omitempty"`
	}{run.status, run.token, run.message})
}
