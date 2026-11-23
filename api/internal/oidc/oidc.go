// Package oidc implements the homelab PocketID (OpenID Connect) login flow:
// Authorization Code with PKCE, ID-token verification via the provider's JWKS,
// and an in-memory store for the short-lived per-login state (verifier+nonce).
//
// It is deliberately self-contained — ID-token signature verification is done
// against the discovery document's jwks_uri with stdlib crypto (see verify.go),
// so no external OIDC/JWT dependency is pulled in.
package oidc

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"
)

// Config holds everything needed to talk to PocketID. Every field is sourced
// from the environment (see ConfigFromEnv) so real values are wired at deploy.
type Config struct {
	Enabled      bool
	DiscoveryURL string // OIDC_DISCOVERY_URL; if empty, derived from Issuer.
	Issuer       string // OIDC_ISSUER; also the expected `iss` of the ID token.
	ClientID     string // OIDC_CLIENT_ID
	ClientSecret string // OIDC_CLIENT_SECRET
	RedirectURL  string // OIDC_REDIRECT_URL (the /api/auth/oidc/callback URL)
	AdminGroup   string // OIDC_ADMIN_GROUP; members get the homepad admin role.
	// MemberGroup is OIDC_MEMBER_GROUP: under invite_only, a new identity in
	// it gets a member account (SPEC-signin-hardening §2.5). Unset: none.
	MemberGroup string
	Scopes      []string // defaults to openid profile email groups
}

// ConfigFromEnv reads the OIDC_* environment variables. OIDC is off unless
// OIDC_ENABLED is a truthy value (1/true/yes/on).
func ConfigFromEnv() Config {
	c := Config{
		Enabled:      truthy(os.Getenv("OIDC_ENABLED")),
		DiscoveryURL: os.Getenv("OIDC_DISCOVERY_URL"),
		Issuer:       strings.TrimRight(os.Getenv("OIDC_ISSUER"), "/"),
		ClientID:     os.Getenv("OIDC_CLIENT_ID"),
		ClientSecret: os.Getenv("OIDC_CLIENT_SECRET"),
		RedirectURL:  os.Getenv("OIDC_REDIRECT_URL"),
		AdminGroup:   os.Getenv("OIDC_ADMIN_GROUP"),
		MemberGroup:  os.Getenv("OIDC_MEMBER_GROUP"),
		Scopes:       []string{"openid", "profile", "email", "groups"},
	}
	return c
}

// discoveryURL is the well-known document URL: the explicit override if set,
// otherwise issuer + the standard path.
func (c Config) discoveryURL() string {
	if c.DiscoveryURL != "" {
		return c.DiscoveryURL
	}
	return c.Issuer + "/.well-known/openid-configuration"
}

func truthy(v string) bool {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "1", "true", "yes", "on":
		return true
	}
	return false
}

// metadata is the subset of the OIDC discovery document homepad uses.
type metadata struct {
	Issuer        string `json:"issuer"`
	AuthEndpoint  string `json:"authorization_endpoint"`
	TokenEndpoint string `json:"token_endpoint"`
	UserinfoURL   string `json:"userinfo_endpoint"`
	JWKSURI       string `json:"jwks_uri"`
}

// Provider talks to one OIDC issuer. Discovery and JWKS are fetched lazily on
// first use and cached, so constructing a Provider does no network I/O and a
// briefly-unreachable IdP doesn't block boot.
type Provider struct {
	cfg Config
	hc  *http.Client

	mu   sync.Mutex
	meta *metadata
	keys map[string]*rsaKey // by kid
}

// NewProvider returns a Provider for cfg with a plain 10 s-timeout client. It
// does not perform any I/O. The server uses NewProviderWithClient and the
// guarded outbound client.
func NewProvider(cfg Config) *Provider {
	return NewProviderWithClient(cfg, &http.Client{Timeout: 10 * time.Second})
}

// NewProviderWithClient is NewProvider over hc — in the server, the guarded
// outbound client, because the issuer is admin-typed
// (SPEC-admin-server-settings §1a). It does not perform any I/O.
func NewProviderWithClient(cfg Config, hc *http.Client) *Provider {
	if len(cfg.Scopes) == 0 {
		cfg.Scopes = []string{"openid", "profile", "email", "groups"}
	}
	return &Provider{cfg: cfg, hc: hc}
}

// Config returns the configuration the provider was built with.
func (p *Provider) Config() Config { return p.cfg }

// DiscoveryURL is the discovery document's address for c.
func (c Config) DiscoveryDocumentURL() string { return c.discoveryURL() }

// Hash identifies every value a sign-in depends on (Enabled and Scopes
// aside), so a test sign-in can be bound to exactly the values it tested
// (SPEC-admin-server-settings §2.5). It includes the client secret; it is
// never logged or returned.
func (c Config) Hash() string {
	h := sha256.New()
	for _, v := range []string{c.DiscoveryURL, strings.TrimRight(c.Issuer, "/"), c.ClientID, c.ClientSecret, c.RedirectURL, c.AdminGroup, c.MemberGroup} {
		fmt.Fprintf(h, "%d:%s|", len(v), v)
	}
	return base64.RawURLEncoding.EncodeToString(h.Sum(nil))
}

// Equal reports whether a and b would sign in the same way.
func (c Config) Equal(o Config) bool { return c.Enabled == o.Enabled && c.Hash() == o.Hash() }

// maxDocBytes caps a discovery, JWKS, token or userinfo body.
const maxDocBytes = 1 << 20

// CheckDiscovery fetches the discovery document now, without the cache, and
// checks it as a save does (SPEC-admin-server-settings §2.5): status 200,
// the authorization, token and JWKS endpoints, and an issuer equal to the
// configured one (a trailing "/" ignored). The error is plain words for the
// admin and never holds the client secret.
func (p *Provider) CheckDiscovery(ctx context.Context) error {
	u := p.cfg.discoveryURL()
	fail := fmt.Errorf("Couldn't read the sign-in settings at %s.", u)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return fail
	}
	req.Header.Set("Accept", "application/json")
	resp, err := p.hc.Do(req)
	if err != nil {
		return fail
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("Couldn't read the sign-in settings at %s (it answered %d).", u, resp.StatusCode)
	}
	var m metadata
	if err := json.NewDecoder(io.LimitReader(resp.Body, maxDocBytes)).Decode(&m); err != nil {
		return fmt.Errorf("Couldn't read the sign-in settings at %s (not a discovery document).", u)
	}
	if m.AuthEndpoint == "" || m.TokenEndpoint == "" || m.JWKSURI == "" {
		return fmt.Errorf("The sign-in settings at %s are missing the authorization, token or keys address.", u)
	}
	if strings.TrimRight(m.Issuer, "/") != strings.TrimRight(p.cfg.Issuer, "/") {
		return fmt.Errorf("The provider at %s says its issuer is %q, not %q.", u, m.Issuer, p.cfg.Issuer)
	}
	p.mu.Lock()
	p.meta = &m
	p.mu.Unlock()
	return nil
}

// discover loads and caches the discovery document.
func (p *Provider) discover(ctx context.Context) (*metadata, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.meta != nil {
		return p.meta, nil
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, p.cfg.discoveryURL(), nil)
	if err != nil {
		return nil, err
	}
	resp, err := p.hc.Do(req)
	if err != nil {
		return nil, fmt.Errorf("oidc: discovery: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("oidc: discovery: status %d", resp.StatusCode)
	}
	var m metadata
	if err := json.NewDecoder(io.LimitReader(resp.Body, maxDocBytes)).Decode(&m); err != nil {
		return nil, fmt.Errorf("oidc: discovery decode: %w", err)
	}
	if m.AuthEndpoint == "" || m.TokenEndpoint == "" || m.JWKSURI == "" {
		return nil, fmt.Errorf("oidc: discovery missing required endpoints")
	}
	p.meta = &m
	return &m, nil
}

// AuthCodeURL builds the authorize redirect for the login leg, carrying the
// PKCE challenge, state, and nonce.
func (p *Provider) AuthCodeURL(ctx context.Context, state, nonce, challenge string) (string, error) {
	m, err := p.discover(ctx)
	if err != nil {
		return "", err
	}
	u, err := url.Parse(m.AuthEndpoint)
	if err != nil {
		return "", err
	}
	q := u.Query()
	q.Set("response_type", "code")
	q.Set("client_id", p.cfg.ClientID)
	q.Set("redirect_uri", p.cfg.RedirectURL)
	q.Set("scope", strings.Join(p.cfg.Scopes, " "))
	q.Set("state", state)
	q.Set("nonce", nonce)
	q.Set("code_challenge", challenge)
	q.Set("code_challenge_method", "S256")
	u.RawQuery = q.Encode()
	return u.String(), nil
}

// tokenResponse is the subset of the token endpoint response we consume.
type tokenResponse struct {
	IDToken     string `json:"id_token"`
	AccessToken string `json:"access_token"`
}

// Exchange swaps an authorization code for tokens, supplying the PKCE verifier.
func (p *Provider) Exchange(ctx context.Context, code, verifier string) (idToken, accessToken string, err error) {
	m, err := p.discover(ctx)
	if err != nil {
		return "", "", err
	}
	form := url.Values{
		"grant_type":    {"authorization_code"},
		"code":          {code},
		"redirect_uri":  {p.cfg.RedirectURL},
		"client_id":     {p.cfg.ClientID},
		"client_secret": {p.cfg.ClientSecret},
		"code_verifier": {verifier},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, m.TokenEndpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return "", "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	resp, err := p.hc.Do(req)
	if err != nil {
		return "", "", fmt.Errorf("oidc: token exchange: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return "", "", fmt.Errorf("oidc: token exchange: status %d: %s", resp.StatusCode, body)
	}
	var tr tokenResponse
	if err := json.NewDecoder(io.LimitReader(resp.Body, maxDocBytes)).Decode(&tr); err != nil {
		return "", "", fmt.Errorf("oidc: token decode: %w", err)
	}
	if tr.IDToken == "" {
		return "", "", fmt.Errorf("oidc: token response had no id_token")
	}
	return tr.IDToken, tr.AccessToken, nil
}

// Claims holds the identity facts homepad needs from a login.
type Claims struct {
	Email  string   `json:"email"`
	Groups []string `json:"groups"`
	// EmailVerified is the provider's email_verified claim: nil when it sent
	// none. homepad links or creates an account by email only when it is
	// true (homepad-api #89).
	EmailVerified *bool `json:"-"`
}

// optionalBool decodes the email_verified claim. OIDC Core makes it a JSON
// boolean; some providers send the string "true" or "false", which is
// accepted too. Absent leaves it unset; any other value reads as false, so a
// strange claim never counts as verified.
type optionalBool struct {
	set   bool
	value bool
}

func (o *optionalBool) UnmarshalJSON(b []byte) error {
	o.set = true
	switch string(b) {
	case "true", `"true"`:
		o.value = true
	case "null":
		o.set = false
	default:
		o.value = false
	}
	return nil
}

func (o optionalBool) ptr() *bool {
	if !o.set {
		return nil
	}
	v := o.value
	return &v
}

// Userinfo fetches the userinfo endpoint with accessToken. It is used as a
// fallback when the ID token omits email or groups. Returns empty Claims (no
// error) when the provider exposes no userinfo endpoint.
func (p *Provider) Userinfo(ctx context.Context, accessToken string) (Claims, error) {
	m, err := p.discover(ctx)
	if err != nil {
		return Claims{}, err
	}
	if m.UserinfoURL == "" {
		return Claims{}, nil
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, m.UserinfoURL, nil)
	if err != nil {
		return Claims{}, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/json")
	resp, err := p.hc.Do(req)
	if err != nil {
		return Claims{}, fmt.Errorf("oidc: userinfo: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return Claims{}, fmt.Errorf("oidc: userinfo: status %d", resp.StatusCode)
	}
	var c struct {
		Email         string       `json:"email"`
		Groups        []string     `json:"groups"`
		EmailVerified optionalBool `json:"email_verified"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, maxDocBytes)).Decode(&c); err != nil {
		return Claims{}, fmt.Errorf("oidc: userinfo decode: %w", err)
	}
	return Claims{Email: c.Email, Groups: c.Groups, EmailVerified: c.EmailVerified.ptr()}, nil
}

// --- PKCE / state / nonce helpers ---

// RandToken returns a URL-safe random token suitable for state and nonce.
func RandToken() string {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

// NewVerifier returns a PKCE code_verifier (43-char base64url of 32 bytes).
func NewVerifier() string { return RandToken() }

// Challenge derives the S256 PKCE code_challenge from a verifier.
func Challenge(verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

// --- pending-login store ---

type pendingEntry struct {
	verifier string
	nonce    string
	tag      string
	expires  time.Time
}

// Pending is an in-memory store of in-flight logins keyed by state. Unlike
// sessions (persisted in Postgres) these live only minutes, and a single
// replica serves them, so a restart simply invalidates logins that were
// mid-redirect, which is acceptable.
type Pending struct {
	mu  sync.Mutex
	m   map[string]pendingEntry
	ttl time.Duration
}

// NewPending returns a store whose entries expire after ttl.
func NewPending(ttl time.Duration) *Pending {
	return &Pending{m: map[string]pendingEntry{}, ttl: ttl}
}

// Put records the verifier and nonce for state.
func (p *Pending) Put(state, verifier, nonce string) { p.PutTag(state, verifier, nonce, "") }

// PutTag is Put with a tag the caller gets back from TakeTag — the server
// records which provider a login started with, so a login begun before a
// settings change fails cleanly (SPEC-admin-server-settings AC-018).
func (p *Pending) PutTag(state, verifier, nonce, tag string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	now := time.Now()
	for k, e := range p.m { // drop abandoned logins so the map can't grow forever
		if now.After(e.expires) {
			delete(p.m, k)
		}
	}
	p.m[state] = pendingEntry{verifier: verifier, nonce: nonce, tag: tag, expires: now.Add(p.ttl)}
}

// TakeTag is Take, returning the tag PutTag stored.
func (p *Pending) TakeTag(state string) (verifier, nonce, tag string, ok bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	e, found := p.m[state]
	if !found {
		return "", "", "", false
	}
	delete(p.m, state)
	if time.Now().After(e.expires) {
		return "", "", "", false
	}
	return e.verifier, e.nonce, e.tag, true
}

// Take consumes the entry for state, returning false if it is missing or
// expired. An entry is single-use.
func (p *Pending) Take(state string) (verifier, nonce string, ok bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	e, found := p.m[state]
	if !found {
		return "", "", false
	}
	delete(p.m, state)
	if time.Now().After(e.expires) {
		return "", "", false
	}
	return e.verifier, e.nonce, true
}
