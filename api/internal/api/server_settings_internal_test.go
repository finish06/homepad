package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/finish06/homepad/api/internal/oidc"
)

// SPEC-admin-server-settings AC-023 — a test sign-in's token is bound to
// the admin and to exactly the tested values, and lasts 10 minutes.
func TestOIDCTestFlow_TokenBindingAndExpiry(t *testing.T) {
	now := time.Date(2026, 11, 23, 12, 0, 0, 0, time.UTC)
	f := newOIDCTestFlow()
	f.now = func() time.Time { return now }
	cfg := oidc.Config{Issuer: "https://id.example.com", ClientID: "homepad", ClientSecret: "s", RedirectURL: "https://homepad.example.com/api/auth/oidc/callback"}
	run := &oidcTestRun{id: "id1", state: "st1", adminID: "admin-1", cfg: cfg, status: oidcTestPending}
	f.add(run)
	if got := f.takeState("st1"); got != run {
		t.Fatal("the callback finds the run by state")
	}
	if f.takeState("st1") != nil {
		t.Fatal("a state is used once")
	}
	f.finish(run, true, "")
	tok := run.token
	if !f.valid(tok, "admin-1", cfg) {
		t.Fatal("a pass is valid for the admin and the values")
	}
	if f.valid(tok, "admin-2", cfg) {
		t.Fatal("bound to the admin")
	}
	other := cfg
	other.ClientSecret = "t"
	if f.valid(tok, "admin-1", other) {
		t.Fatal("bound to every value, the secret included")
	}
	enabled := cfg
	enabled.Enabled = true
	if !f.valid(tok, "admin-1", enabled) {
		t.Fatal("the on/off switch isn't part of what was tested")
	}
	now = now.Add(9 * time.Minute)
	if !f.valid(tok, "admin-1", cfg) {
		t.Fatal("still valid at 9 minutes")
	}
	now = now.Add(2 * time.Minute)
	if f.valid(tok, "admin-1", cfg) {
		t.Fatal("expired after 10 minutes")
	}
	if _, ok := f.status("id1", "admin-1"); ok {
		t.Fatal("the run is gone after 10 minutes")
	}
}

// §2.6 — only true/1/yes/on turn the recovery flag on.
func TestTruthyFlag(t *testing.T) {
	for v, want := range map[string][2]bool{
		"true": {true, true}, "1": {true, true}, "YES": {true, true}, " on ": {true, true},
		"": {false, true}, "false": {false, true}, "0": {false, true}, "off": {false, true},
		"maybe": {false, false}, "enabled": {false, false},
	} {
		on, ok := truthyFlag(v)
		if on != want[0] || ok != want[1] {
			t.Errorf("%q: got %v,%v want %v", v, on, ok, want)
		}
	}
}

// AC-026 — the trusted-proxies warning shows the client's own address, not
// the IPv6 /64 the rate limits key on; with and without a matching proxy.
func TestClientAddress_IPv6IsTheAddressNotTheBucket(t *testing.T) {
	req := func(peer, xff string) *http.Request {
		r := httptest.NewRequest(http.MethodGet, "/", nil)
		r.RemoteAddr = peer
		if xff != "" {
			r.Header.Set("X-Forwarded-For", xff)
		}
		return r
	}
	none, _ := ParseTrustedProxies("")
	loop, _ := ParseTrustedProxies("::1")
	cases := []struct {
		name, peer, xff string
		tp              *TrustedProxies
		want, key       string
	}{
		{"loopback, no proxy", "[::1]:5000", "2001:db8::77", none, "::1", "::/64"},
		{"peer is not a listed proxy", "[2001:db8:1::5]:5000", "2001:db8::77", loop, "2001:db8:1::5", "2001:db8:1::/64"},
		{"matching proxy, forwarded v6", "[::1]:5000", "2001:db8::77", loop, "2001:db8::77", "2001:db8::/64"},
		{"matching proxy, forwarded v4", "[::1]:5000", "192.0.2.50", loop, "192.0.2.50", "192.0.2.50"},
		{"matching proxy, no header", "[::1]:5000", "", loop, "::1", "::/64"},
	}
	for _, c := range cases {
		r := req(c.peer, c.xff)
		if got := clientAddress(r, c.tp); got != c.want {
			t.Errorf("%s: clientAddress = %q, want %q", c.name, got, c.want)
		}
		if got := clientAddr(r, c.tp); got != c.key {
			t.Errorf("%s: the limit key stays the /64: %q, want %q", c.name, got, c.key)
		}
	}
}
