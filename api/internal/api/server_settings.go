package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/netip"
	"net/url"
	"sort"
	"strconv"
	"strings"
)

// SPEC-admin-server-settings — the server settings an admin edits in Admin
// Panel → System. For each key the server uses the first of: a value saved in
// the UI, the env var, the built-in default (§2.1). This file is the one list
// of those settings (AC-002) and their rules (§2.2).

// The setting keys.
const (
	keyCookieSecure     = "COOKIE_SECURE"
	keyTrustedProxies   = "HOMEPAD_TRUSTED_PROXIES"
	keyPort             = "PORT"
	keyGatusBaseURL     = "GATUS_BASE_URL"
	keyGatusDegradedMs  = "GATUS_DEGRADED_MS"
	keyRegistration     = "HOMEPAD_REGISTRATION"
	keyMaxAccounts      = "HOMEPAD_MAX_ACCOUNTS"
	keyOIDCEnabled      = "OIDC_ENABLED"
	keyOIDCIssuer       = "OIDC_ISSUER"
	keyOIDCDiscoveryURL = "OIDC_DISCOVERY_URL"
	keyOIDCRedirectURL  = "OIDC_REDIRECT_URL"
	keyOIDCClientID     = "OIDC_CLIENT_ID"
	keyOIDCClientSecret = "OIDC_CLIENT_SECRET"
	keyOIDCAdminGroup   = "OIDC_ADMIN_GROUP"
	keyOIDCMemberGroup  = "OIDC_MEMBER_GROUP"
)

// SettingsFromEnvOnlyEnv is the recovery flag (§2.6): when on, every value
// saved in the UI is ignored.
const SettingsFromEnvOnlyEnv = "HOMEPAD_SETTINGS_FROM_ENV_ONLY"

// secretAAD binds the sealed client secret to its row (§2.4).
var secretAAD = []byte("server_settings:" + keyOIDCClientSecret)

// The wire types (§7: values travel as JSON types).
const (
	typeBoolean = "boolean"
	typeNumber  = "number"
	typeString  = "string"
	typeList    = "list" // a comma-separated string
	typeChoice  = "choice"
	typeSecret  = "secret"
)

// maxTrustedProxies bounds HOMEPAD_TRUSTED_PROXIES saved in the UI (§2.2).
const maxTrustedProxies = 64

// maxAccountsLimit bounds HOMEPAD_MAX_ACCOUNTS saved in the UI (§2.2).
const maxAccountsLimit = 10000

// settingDef is one server setting.
type settingDef struct {
	Key     string
	Group   string // server, status, accounts, signin
	Type    string
	Choices []string
	// Stored is true for a key with a row in server_settings. PORT can't be
	// saved; GATUS_DEGRADED_MS lives in system_settings.status_degraded_ms.
	Stored bool
	// Restart marks PORT: read-only, applies after a restart.
	Restart bool
	Default string // normalized
	// norm validates a value (as text) and returns its normalized form; the
	// error is the plain-words message the admin sees (AC-011). It runs on
	// every write and again on every value read back at boot (§3.3).
	norm func(string) (string, error)
}

// serverSettingDefs is the one allowlist, in display order. Every route
// takes only these keys (AC-002); DATABASE_URL and HOMEPAD_SECRET_KEY are
// never here.
var serverSettingDefs = []settingDef{
	{Key: keyCookieSecure, Group: "server", Type: typeBoolean, Stored: true, Default: "true", norm: normBool},
	{Key: keyTrustedProxies, Group: "server", Type: typeList, Stored: true, Default: "", norm: normTrustedProxies},
	{Key: keyPort, Group: "server", Type: typeNumber, Restart: true, Default: "8080", norm: normAny},
	{Key: keyGatusBaseURL, Group: "status", Type: typeString, Stored: true, Default: "", norm: normGatusURL},
	{Key: keyGatusDegradedMs, Group: "status", Type: typeNumber, Default: "1000", norm: normRange(0, maxStatusDegradedMs)},
	{Key: keyRegistration, Group: "accounts", Type: typeChoice, Choices: []string{"invite_only", "open"}, Stored: true, Default: DefaultRegistration, norm: normRegistration},
	{Key: keyMaxAccounts, Group: "accounts", Type: typeNumber, Stored: true, Default: "0", norm: normRange(0, maxAccountsLimit)},
	{Key: keyOIDCEnabled, Group: "signin", Type: typeBoolean, Stored: true, Default: "false", norm: normBool},
	{Key: keyOIDCIssuer, Group: "signin", Type: typeString, Stored: true, Default: "", norm: normIssuer},
	{Key: keyOIDCDiscoveryURL, Group: "signin", Type: typeString, Stored: true, Default: "", norm: normOptionalURL},
	{Key: keyOIDCRedirectURL, Group: "signin", Type: typeString, Stored: true, Default: "", norm: normRedirectURL},
	{Key: keyOIDCClientID, Group: "signin", Type: typeString, Stored: true, Default: "", norm: normClientID},
	{Key: keyOIDCClientSecret, Group: "signin", Type: typeSecret, Stored: true, Default: "", norm: normSecret},
	{Key: keyOIDCAdminGroup, Group: "signin", Type: typeString, Stored: true, Default: "", norm: normGroup},
	{Key: keyOIDCMemberGroup, Group: "signin", Type: typeString, Stored: true, Default: "", norm: normGroup},
}

var settingDefByKey = func() map[string]*settingDef {
	m := make(map[string]*settingDef, len(serverSettingDefs))
	for i := range serverSettingDefs {
		m[serverSettingDefs[i].Key] = &serverSettingDefs[i]
	}
	return m
}()

// ServerSettingKeys is every key GET /api/admin/server-settings returns.
func ServerSettingKeys() []string {
	out := make([]string, len(serverSettingDefs))
	for i, d := range serverSettingDefs {
		out[i] = d.Key
	}
	return out
}

// StoredServerSettingKeys is every key with a row in server_settings, sorted:
// the keys migration 0024's CHECK must list (AC-002).
func StoredServerSettingKeys() []string {
	var out []string
	for _, d := range serverSettingDefs {
		if d.Stored {
			out = append(out, d.Key)
		}
	}
	sort.Strings(out)
	return out
}

func isOIDCKey(k string) bool { return strings.HasPrefix(k, "OIDC_") }

// --- rules (§2.2) -----------------------------------------------------------

func normAny(v string) (string, error) { return v, nil }

func normBool(v string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "true":
		return "true", nil
	case "false":
		return "false", nil
	}
	return "", errors.New("Choose on or off.")
}

func normRange(lo, hi int) func(string) (string, error) {
	return func(v string) (string, error) {
		n, err := strconv.Atoi(strings.TrimSpace(v))
		if err != nil || n < lo || n > hi {
			return "", fmt.Errorf("Enter a whole number from %d to %d.", lo, hi)
		}
		return strconv.Itoa(n), nil
	}
}

func normRegistration(v string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "open":
		return "open", nil
	case "invite_only", "invite-only":
		return "invite_only", nil
	}
	return "", errors.New("Choose invite only or open.")
}

// errTrustEveryone is the refusal of 0.0.0.0/0 and ::/0 (§2.5, TC-002).
var errTrustEveryone = errors.New("That trusts every address. Anyone could pick their own address, and the sign-in limits would stop working.")

func normTrustedProxies(v string) (string, error) {
	var entries []string
	for _, e := range strings.Split(v, ",") {
		if e = strings.TrimSpace(e); e != "" {
			entries = append(entries, e)
		}
	}
	if len(entries) > maxTrustedProxies {
		return "", fmt.Errorf("List at most %d proxies.", maxTrustedProxies)
	}
	for _, e := range entries {
		if p, err := netip.ParsePrefix(e); err == nil && p.Bits() == 0 {
			return "", errTrustEveryone
		}
		if _, err := parseTrustedProxies(e, nil); err != nil {
			return "", fmt.Errorf("%q is not an address, a range like 192.0.2.0/24, or a hostname.", e)
		}
	}
	return strings.Join(entries, ","), nil
}

// parseHTTPURL accepts an absolute http or https URL with a host and no
// user:password part.
func parseHTTPURL(v string) (*url.URL, bool) {
	u, err := url.Parse(v)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || u.User != nil || u.Opaque != "" {
		return nil, false
	}
	return u, true
}

func normGatusURL(v string) (string, error) {
	v = strings.TrimSpace(v)
	if v == "" {
		return "", nil
	}
	u, ok := parseHTTPURL(v)
	if !ok || u.RawQuery != "" || u.Fragment != "" || strings.Contains(v, "?") || strings.Contains(v, "#") {
		return "", errors.New("Enter an http:// or https:// address with no ? or #, or leave it empty to turn status off.")
	}
	return strings.TrimRight(v, "/"), nil
}

func normIssuer(v string) (string, error) {
	v = strings.TrimSpace(v)
	if v == "" {
		return "", nil
	}
	if _, ok := parseHTTPURL(v); !ok {
		return "", errors.New("Enter your provider's address, like https://id.example.com.")
	}
	return strings.TrimRight(v, "/"), nil
}

func normOptionalURL(v string) (string, error) {
	v = strings.TrimSpace(v)
	if v == "" {
		return "", nil
	}
	if _, ok := parseHTTPURL(v); !ok {
		return "", errors.New("Enter an http:// or https:// address, or leave it empty to use the issuer's.")
	}
	return v, nil
}

func normRedirectURL(v string) (string, error) {
	v = strings.TrimSpace(v)
	if v == "" {
		return "", nil
	}
	u, ok := parseHTTPURL(v)
	if !ok || !strings.HasSuffix(u.Path, "/api/auth/oidc/callback") {
		return "", errors.New("Enter Homepad's address followed by /api/auth/oidc/callback.")
	}
	return v, nil
}

func normClientID(v string) (string, error) {
	v = strings.TrimSpace(v)
	if v == "" || len(v) > 255 || strings.ContainsAny(v, " \t\r\n") {
		return "", errors.New("Enter the client ID from your provider: 1 to 255 characters, no spaces.")
	}
	return v, nil
}

func normSecret(v string) (string, error) {
	if v == "" || len(v) > 1024 {
		return "", errors.New("Paste the client secret from your provider: 1 to 1024 characters.")
	}
	return v, nil
}

func normGroup(v string) (string, error) {
	v = strings.TrimSpace(v)
	if len(v) > 255 {
		return "", errors.New("Use at most 255 characters.")
	}
	return v, nil
}

// decodeSettingValue reads one PATCH value of def's JSON type and returns it
// normalized, or the plain-words message (AC-011).
func decodeSettingValue(def *settingDef, raw json.RawMessage) (string, error) {
	switch def.Type {
	case typeBoolean:
		var b bool
		if err := json.Unmarshal(raw, &b); err != nil {
			return "", errors.New("Choose on or off.")
		}
		return strconv.FormatBool(b), nil
	case typeNumber:
		var f float64
		if err := json.Unmarshal(raw, &f); err != nil || f != float64(int64(f)) {
			_, msg := def.norm("not a number")
			return "", msg
		}
		return def.norm(strconv.FormatInt(int64(f), 10))
	default:
		var s string
		if err := json.Unmarshal(raw, &s); err != nil {
			if def.Type == typeSecret {
				return "", errors.New("Paste the client secret from your provider: 1 to 1024 characters.")
			}
			return "", errors.New("Enter text.")
		}
		return def.norm(s)
	}
}

// wireValue turns a normalized value into its JSON type.
func wireValue(def *settingDef, v string) any {
	switch def.Type {
	case typeBoolean:
		return v == "true"
	case typeNumber:
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
		return v
	}
	return v
}
