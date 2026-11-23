package api

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/finish06/homepad/api/internal/oidc"
	"github.com/finish06/homepad/api/internal/storage"
)

// oidcNoPassword is stored in users.password_hash for accounts provisioned via
// PocketID. It is not a valid bcrypt hash, so bcrypt.CompareHashAndPassword
// always fails for these rows — an OIDC-only user can never local-login, while
// a user who also set a local password keeps it (we link by email, never
// overwrite the hash).
const oidcNoPassword = "oidc:no-local-password"

// The sign-in screen's codes for a failed single sign-on
// (SPEC-signin-hardening §2.4). The browser lands on /#signin-error=<code>.
const (
	signinEmailUnverified = "email_unverified"
	signinNotInvited      = "not_invited"
	signinAccountLimit    = "account_limit"
	signinFailed          = "sso_failed"
	signinTooMany         = "too_many"
)

// errNotInvited is resolveOIDCUser's refusal of a new identity under
// invite_only (§2.5).
var errNotInvited = errors.New("oidc: new identity not in an allowed group under invite_only")

// signinError sends the browser back to the sign-in screen with code. Every
// single sign-on failure the browser reaches by navigation ends here, never
// on a text page (AC-002, AC-019).
func signinError(w http.ResponseWriter, r *http.Request, code string) {
	http.Redirect(w, r, "/#signin-error="+code, http.StatusFound)
}

// handleOIDCConfig is GET /api/auth/config: what the sign-in screen needs
// before anyone is signed in. oidcEnabled shows or hides the "Log in with
// PocketID" button; registration ("open" or "invite_only") decides whether
// "Create account" shows; setupNeeded (no adult account yet) turns the screen
// into "Set up Homepad" (SPEC-household-basics AC-004). Always registered,
// never requires a session.
func (s *server) handleOIDCConfig(w http.ResponseWriter, r *http.Request) {
	cfg := s.cfg()
	registration := "invite_only"
	if cfg.registration == RegistrationOpen {
		registration = "open"
	}
	adults, err := s.store.CountUsers(r.Context())
	if err != nil {
		// Fail toward the normal sign-in screen, never toward setup.
		log.Printf("auth config: count adults: %v", err)
		adults = 1
	}
	writeJSON(w, http.StatusOK, struct {
		OIDCEnabled  bool   `json:"oidcEnabled"`
		Registration string `json:"registration"`
		SetupNeeded  bool   `json:"setupNeeded"`
	}{cfg.oidc.Enabled, registration, adults == 0})
}

// oidcOff is the 404 the login and callback routes answer while single
// sign-on is off.
func oidcOff(w http.ResponseWriter) {
	http.Error(w, "single sign-on is off", http.StatusNotFound)
}

// oidcOn answers 404 while single sign-on is off, as an unregistered route
// did before it could be turned on live (SPEC-admin-server-settings AC-017).
func (s *server) oidcOn(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if c := s.cfg(); !c.oidc.Enabled || c.provider == nil {
			oidcOff(w)
			return
		}
		h(w, r)
	}
}

// handleOIDCLogin begins the Authorization Code + PKCE flow: it mints state,
// nonce, and a PKCE verifier, stashes them server-side keyed by state, and
// redirects the browser to the PocketID authorize endpoint. The stash
// records which provider the login began with (AC-018).
func (s *server) handleOIDCLogin(w http.ResponseWriter, r *http.Request) {
	cfg := s.cfg()
	state := oidc.RandToken()
	nonce := oidc.RandToken()
	verifier := oidc.NewVerifier()

	authURL, err := cfg.provider.AuthCodeURL(r.Context(), state, nonce, oidc.Challenge(verifier))
	if err != nil {
		log.Printf("oidc login: build authorize url: %v", err)
		signinError(w, r, signinFailed)
		return
	}

	s.pending.PutTag(state, verifier, nonce, strconv.FormatUint(cfg.gen, 10))
	http.Redirect(w, r, authURL, http.StatusFound)
}

// handleOIDCCallback completes the flow: validate state, exchange the code with
// the PKCE verifier, verify the ID token, resolve the user by email (linking to
// an existing local account or creating a new one with the right role), then set
// the same homepad_session cookie the local login uses and land on the catalog.
// Every failure lands on the sign-in screen with a §2.4 code (AC-002).
//
// A state that belongs to an admin's test sign-in is finished by
// finishOIDCTest instead, even while single sign-on is off
// (SPEC-admin-server-settings §2.5); otherwise the route is 404 while off.
func (s *server) handleOIDCCallback(w http.ResponseWriter, r *http.Request) {
	state := r.URL.Query().Get("state")
	code := r.URL.Query().Get("code")
	if run := s.oidcTests.takeState(state); run != nil {
		s.finishOIDCTest(w, r, run, code)
		return
	}
	cfg := s.cfg()
	if !cfg.oidc.Enabled || cfg.provider == nil {
		oidcOff(w)
		return
	}
	if state == "" || code == "" {
		log.Printf("oidc callback: missing state or code")
		signinError(w, r, signinFailed)
		return
	}

	verifier, nonce, gen, ok := s.pending.TakeTag(state)
	if !ok {
		log.Printf("oidc callback: invalid or expired login state")
		signinError(w, r, signinFailed)
		return
	}
	if gen != strconv.FormatUint(cfg.gen, 10) {
		log.Printf("oidc callback: the login began before a single sign-on settings change; try again")
		signinError(w, r, signinFailed)
		return
	}

	ctx := r.Context()
	claims, err := identify(ctx, cfg.provider, code, verifier, nonce)
	if err != nil {
		log.Printf("oidc callback: %v", err)
		signinError(w, r, signinFailed)
		return
	}
	if claims.Email == "" {
		log.Printf("oidc callback: refused sign-in: the identity has no email")
		signinError(w, r, signinFailed)
		return
	}
	// #89 — an account is linked or created by email only when the provider
	// says the email is verified. Otherwise anyone who could set an address
	// at the provider could sign in as the local account that has it.
	if claims.EmailVerified == nil || !*claims.EmailVerified {
		log.Printf("oidc callback: refused sign-in: email_verified is not true")
		signinError(w, r, signinEmailUnverified)
		return
	}

	u, err := s.resolveOIDCUser(ctx, cfg, claims)
	switch {
	case errors.Is(err, storage.ErrAccountLimit):
		log.Printf("accounts: limit %d reached, refused %s %s", cfg.maxAccounts, r.Method, r.URL.Path)
		signinError(w, r, signinAccountLimit)
		return
	case errors.Is(err, errNotInvited):
		log.Printf("oidc: refused new identity under invite_only (not in an allowed group)")
		signinError(w, r, signinNotInvited)
		return
	case err != nil:
		log.Printf("oidc callback: resolve user: %v", err)
		signinError(w, r, signinFailed)
		return
	}

	// The cookie follows COOKIE_SECURE, like every other sign-in path.
	if err := s.beginSession(w, r, u); err != nil {
		signinError(w, r, signinFailed)
		return
	}
	http.Redirect(w, r, "/", http.StatusFound)
}

// identify exchanges code, verifies the ID token and fills the email, its
// verification and the groups from userinfo where the token left them out.
func identify(ctx context.Context, p *oidc.Provider, code, verifier, nonce string) (oidc.Claims, error) {
	idToken, accessToken, err := p.Exchange(ctx, code, verifier)
	if err != nil {
		return oidc.Claims{}, fmt.Errorf("token exchange: %w", err)
	}
	claims, err := p.VerifyIDToken(ctx, idToken, nonce)
	if err != nil {
		return oidc.Claims{}, fmt.Errorf("verify id_token: %w", err)
	}
	// The ID token is the primary identity source; fall back to userinfo only
	// when it omits the email, its email_verified claim, or the groups.
	if claims.Email == "" || claims.EmailVerified == nil || len(claims.Groups) == 0 {
		if ui, err := p.Userinfo(ctx, accessToken); err == nil {
			switch {
			case claims.Email == "":
				// The email comes from userinfo, so its verification must too.
				claims.Email, claims.EmailVerified = ui.Email, ui.EmailVerified
			case claims.EmailVerified == nil && strings.EqualFold(ui.Email, claims.Email):
				// A userinfo claim counts only for the address it describes.
				claims.EmailVerified = ui.EmailVerified
			}
			if len(claims.Groups) == 0 {
				claims.Groups = ui.Groups
			}
		}
	}
	return claims, nil
}

// resolveOIDCUser links the OIDC identity to a homepad user by email: an
// existing adult is reused as-is, whatever its groups (AC-011). Otherwise a
// new account is created within HOMEPAD_MAX_ACCOUNTS (storage.ErrAccountLimit)
// by SPEC-signin-hardening §2.5:
//
//   - in OIDC_ADMIN_GROUP: an admin, in every mode;
//   - under open: a member (unchanged from 17.1.0, AC-012);
//   - under invite_only, in OIDC_MEMBER_GROUP: a member, but only once the
//     household has an adult, so an empty install's first account is always
//     an admin;
//   - anyone else under invite_only: errNotInvited (AC-010).
//
// Any mode but open counts as invite_only, so a mistyped
// HOMEPAD_REGISTRATION fails closed here too. The caller has checked that
// the email is verified.
func (s *server) resolveOIDCUser(ctx context.Context, cfg *liveConfig, claims oidc.Claims) (storage.User, error) {
	u, err := s.store.UserByEmail(ctx, claims.Email)
	if err == nil {
		// UserByEmail never returns a kid; refuse one anyway rather than sign
		// a kid in through an identity provider.
		if !storage.IsAdultRole(u.Role) {
			return storage.User{}, errors.New("oidc: identity resolves to a non-adult account")
		}
		return u, nil
	}
	if !errors.Is(err, storage.ErrNotFound) {
		return storage.User{}, err
	}

	switch {
	case cfg.oidc.AdminGroup != "" && containsString(claims.Groups, cfg.oidc.AdminGroup):
		return s.store.CreateOIDCUser(ctx, claims.Email, oidcNoPassword, "admin", cfg.maxAccounts)
	case cfg.registration == RegistrationOpen:
		return s.store.CreateOIDCUser(ctx, claims.Email, oidcNoPassword, "user", cfg.maxAccounts)
	case cfg.oidc.MemberGroup != "" && containsString(claims.Groups, cfg.oidc.MemberGroup):
		u, err := s.store.CreateOIDCMember(ctx, claims.Email, oidcNoPassword, cfg.maxAccounts)
		if errors.Is(err, storage.ErrRegistrationClosed) {
			return storage.User{}, errNotInvited
		}
		return u, err
	default:
		return storage.User{}, errNotInvited
	}
}

func containsString(xs []string, want string) bool {
	for _, x := range xs {
		if x == want {
			return true
		}
	}
	return false
}
