package api

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/finish06/homepad/api/internal/oidc"
	"github.com/finish06/homepad/api/internal/storage"
	"github.com/finish06/homepad/api/internal/widgets"
)

// SPEC-admin-server-settings §7 — GET, PATCH and DELETE
// /api/admin/server-settings. Every route is admin-only. No response, error
// or log line ever holds the client secret (§2.4, AC-013).

const envOnlyMessage = "Server settings come from the environment only. Saved values are ignored, and only Reset works."

// settingsError is every error body these routes send:
// {"error":code, "message":…, "key"?:…, "missing"?:[…], "warnings"?:[…]}.
type settingsError struct {
	Error    string           `json:"error"`
	Message  string           `json:"message"`
	Key      string           `json:"key,omitempty"`
	Missing  []string         `json:"missing,omitempty"`
	Warnings []settingWarning `json:"warnings,omitempty"`
}

// settingWarning is one warning: a confirm the admin must resend
// (confirm_required), or a note on a save that went through.
type settingWarning struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	// trusted_proxies: the caller's address now and under the new list.
	CurrentAddress string `json:"currentAddress,omitempty"`
	NewAddress     string `json:"newAddress,omitempty"`
	// max_accounts_below_count.
	Accounts       *int `json:"accounts,omitempty"`
	PendingInvites *int `json:"pendingInvites,omitempty"`
	Limit          *int `json:"limit,omitempty"`
	// proxy_unresolved.
	Hosts []string `json:"hosts,omitempty"`
}

type stageErr struct {
	status int
	body   settingsError
}

func writeSettingsError(w http.ResponseWriter, status int, e settingsError) {
	writeJSON(w, status, e)
}

// unknownKey never echoes the key: a request naming DATABASE_URL or
// HOMEPAD_SECRET_KEY must not get the name back (AC-012).
func unknownKey(string) settingsError {
	return settingsError{Error: "unknown_key", Message: "That isn't a setting Homepad lets you change here."}
}

func readOnlyKey(k string) settingsError {
	return settingsError{Error: "read_only", Key: k, Message: "This is set on the server. It applies after a restart."}
}

var oidcRequired = []struct{ key, label string }{
	{keyOIDCIssuer, "Issuer"}, {keyOIDCClientID, "Client ID"}, {keyOIDCClientSecret, "Client secret"}, {keyOIDCRedirectURL, "Redirect URL"},
}

// missingOIDC lists what single sign-on needs and cfg lacks (§2.5).
func missingOIDC(cfg oidc.Config) []string {
	have := map[string]bool{keyOIDCIssuer: cfg.Issuer != "", keyOIDCClientID: cfg.ClientID != "",
		keyOIDCClientSecret: cfg.ClientSecret != "", keyOIDCRedirectURL: cfg.RedirectURL != ""}
	var out []string
	for _, r := range oidcRequired {
		if !have[r.key] {
			out = append(out, r.key)
		}
	}
	return out
}

func incompleteOIDC(missing []string) settingsError {
	var labels []string
	for _, r := range oidcRequired {
		for _, m := range missing {
			if m == r.key {
				labels = append(labels, r.label)
			}
		}
	}
	return settingsError{Error: "invalid", Key: keyOIDCEnabled, Missing: missing,
		Message: "Single sign-on needs these first: " + strings.Join(labels, ", ") + "."}
}

// --- GET ----------------------------------------------------------------

type serverSettingsBody struct {
	EnvOnly  bool             `json:"envOnly"`
	Settings []map[string]any `json:"settings"`
	Warnings []settingWarning `json:"warnings,omitempty"`
}

func (s *server) settingsBody(c *liveConfig, notes []settingWarning) serverSettingsBody {
	out := serverSettingsBody{EnvOnly: c.envOnly, Settings: make([]map[string]any, 0, len(serverSettingDefs)), Warnings: notes}
	for i := range serverSettingDefs {
		def := &serverSettingDefs[i]
		st := c.settings[def.Key]
		m := map[string]any{
			"key": def.Key, "group": def.Group, "type": def.Type,
			"source": st.source, "saved": st.saved,
			"applies": "live", "editable": true,
			"updatedAt": nil, "updatedBy": nil,
		}
		if def.Choices != nil {
			m["choices"] = def.Choices
		}
		switch {
		case def.Restart:
			m["applies"], m["editable"], m["readOnlyReason"] = "restart", false, "restart"
		case c.envOnly:
			m["editable"], m["readOnlyReason"] = false, "env_only"
		case def.Type == typeSecret && s.sealer == nil:
			m["editable"], m["readOnlyReason"] = false, "no_secret_key"
		}
		if st.savedInvalid {
			m["savedInvalid"] = true
		}
		if st.updatedAt != nil {
			m["updatedAt"] = st.updatedAt.UTC().Format(time.RFC3339)
		}
		if st.updatedBy != nil && st.updatedBy.UpdatedBy != "" {
			m["updatedBy"] = map[string]string{"id": st.updatedBy.UpdatedBy, "name": st.updatedBy.UpdatedByName}
		}
		if def.Type == typeSecret {
			m["secret"] = true
			m["isSet"] = st.value != ""
			m["envIsSet"] = s.env.values[def.Key] != ""
			m["unreadable"] = st.unreadable
			out.Settings = append(out.Settings, m)
			continue
		}
		m["value"] = wireValue(def, st.value)
		m["defaultValue"] = wireValue(def, def.Default)
		m["envValue"] = nil
		if s.env.set[def.Key] {
			m["envValue"] = wireValue(def, s.env.values[def.Key])
		}
		if st.saved && !st.savedInvalid {
			m["savedValue"] = wireValue(def, st.savedValue)
		}
		out.Settings = append(out.Settings, m)
	}
	return out
}

// handleGetServerSettings is GET /api/admin/server-settings (AC-007).
func (s *server) handleGetServerSettings(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	writeJSON(w, http.StatusOK, s.settingsBody(s.cfg(), nil))
}

// --- staging and guards ---------------------------------------------------

// stage lays set over ui and builds the snapshot that would result. It
// validates every value (AC-011); it writes nothing.
func (s *server) stage(ui uiValues, set map[string]json.RawMessage) (*liveConfig, *stageErr) {
	next := ui.clone()
	for _, k := range sortedKeys(set) {
		def, ok := settingDefByKey[k]
		if !ok {
			return nil, &stageErr{http.StatusNotFound, unknownKey(k)}
		}
		if def.Restart {
			return nil, &stageErr{http.StatusBadRequest, readOnlyKey(k)}
		}
		v, err := decodeSettingValue(def, set[k])
		if err != nil {
			return nil, &stageErr{http.StatusBadRequest, settingsError{Error: "invalid", Key: k, Message: err.Error()}}
		}
		if k == keyGatusDegradedMs {
			n := 0
			fmt.Sscan(v, &n)
			next.degraded = &n
			continue
		}
		next.values[k] = v
		delete(next.invalid, k)
		if def.Type == typeSecret {
			next.unreadable = false
		}
	}
	c, err := s.build(next, s.cfg().trusted)
	if err != nil {
		return nil, &stageErr{http.StatusBadRequest, settingsError{Error: "invalid", Message: err.Error()}}
	}
	return c, nil
}

func sortedKeys[V any](m map[string]V) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// guard runs the §2.5 checks on going from cur to next. It returns the
// refusal, or the notes for a change that may go ahead.
func (s *server) guard(r *http.Request, admin storage.User, cur, next *liveConfig, confirm []string, oidcTest string) (*stageErr, []settingWarning) {
	ctx := r.Context()
	oidcChanged := !cur.oidc.Equal(next.oidc)
	var notes []settingWarning

	if oidcChanged && next.oidc.Enabled {
		if missing := missingOIDC(next.oidc); len(missing) > 0 {
			return &stageErr{http.StatusBadRequest, incompleteOIDC(missing)}, nil
		}
	}
	// Never zero ways in (Q2 A).
	if oidcChanged && cur.oidc.Enabled {
		hasPassword, err := s.store.AdminHasLocalPassword(ctx)
		if err != nil {
			return &stageErr{http.StatusInternalServerError, settingsError{Error: "internal", Message: "Couldn't check the admin accounts. Try again."}}, nil
		}
		switch {
		case hasPassword:
		case !next.oidc.Enabled:
			return &stageErr{http.StatusConflict, settingsError{Error: "would_lock_out",
				Message: "No admin has a password, so turning single sign-on off would lock everyone out. Set a password on an admin account first."}}, nil
		case !s.oidcTests.valid(oidcTest, admin.ID, next.oidc):
			return &stageErr{http.StatusConflict, settingsError{Error: "would_lock_out",
				Message: "No admin has a password, so a mistake here could lock everyone out. Test sign-in with the new settings first."}}, nil
		}
	}
	// Discovery before save (AC-021), with the guarded client.
	if oidcChanged && next.oidc.Enabled {
		p := oidc.NewProviderWithClient(next.oidc, s.outbound.HTTPClient())
		if msg := checkDiscovery(ctx, p); msg != "" {
			return &stageErr{http.StatusUnprocessableEntity, settingsError{Error: "discovery_failed", Message: msg}}, nil
		}
		if strings.HasPrefix(next.oidc.Issuer, "http://") {
			notes = append(notes, settingWarning{Code: "oidc_issuer_http",
				Message: "The issuer is on plain http://. Sign-in codes and tokens travel unencrypted."})
		}
	}

	// Confirms (AC-025).
	var need []settingWarning
	if cur.trustedRaw != next.trustedRaw {
		if next.trusted != nil && next.trusted != s.env.trusted && next.trusted.HasHostnames() {
			rctx, cancel := context.WithTimeout(ctx, 10*time.Second)
			next.trusted.Refresh(rctx)
			cancel()
			if hosts := next.trusted.unresolved(); len(hosts) > 0 {
				notes = append(notes, settingWarning{Code: "proxy_unresolved", Hosts: hosts,
					Message: "Some names don't resolve yet: " + strings.Join(hosts, ", ") + ". Homepad keeps trying."})
			}
		}
		now, after := clientAddress(r, cur.trusted), clientAddress(r, next.trusted)
		need = append(need, settingWarning{Code: "trusted_proxies", CurrentAddress: now, NewAddress: after,
			Message: fmt.Sprintf("Homepad sees you as %s now. With this list it would see %s. A wrong list makes everyone share one sign-in limit, or lets people fake their address.", now, after)})
	}
	if cur.cookieSecure != next.cookieSecure {
		if next.cookieSecure {
			need = append(need, settingWarning{Code: "cookie_secure_on",
				Message: "On plain http://, nobody can sign in after this. People already signed in stay signed in until their cookie runs out or they sign out."})
		} else {
			need = append(need, settingWarning{Code: "cookie_secure_off",
				Message: "Only do this on plain http://. On https:// it makes sign-in cookies less safe."})
		}
	}
	if next.maxAccounts > 0 && next.maxAccounts != cur.maxAccounts {
		accounts, invites, err := s.store.AccountCounts(ctx)
		if err == nil && accounts+invites > next.maxAccounts {
			limit := next.maxAccounts
			need = append(need, settingWarning{Code: "max_accounts_below_count", Accounts: &accounts, PendingInvites: &invites, Limit: &limit,
				Message: fmt.Sprintf("There are %d accounts and %d pending invites. Nobody is removed. New accounts and invites are refused until there are fewer than %d.", accounts, invites, limit)})
		}
	}
	if cur.registration != RegistrationOpen && next.registration == RegistrationOpen {
		need = append(need, settingWarning{Code: "registration_open",
			Message: "Anyone who can open Homepad can make an account, including a kid who signs out."})
	}
	confirmed := map[string]bool{}
	for _, c := range confirm {
		confirmed[strings.TrimSpace(c)] = true
	}
	for _, n := range need {
		if !confirmed[n.Code] {
			return &stageErr{http.StatusConflict, settingsError{Error: "confirm_required", Warnings: need,
				Message: "This change needs a confirm. Resend it with the warning codes in confirm."}}, nil
		}
	}

	// The Gatus address: one guarded fetch; a failure is only a note.
	if next.gatusBaseURL != cur.gatusBaseURL && next.gatusBaseURL != "" {
		if !s.gatusAnswers(ctx, next.gatusBaseURL) {
			notes = append(notes, settingWarning{Code: "gatus_unreachable",
				Message: "Saved, but Homepad couldn't reach Gatus at " + next.gatusBaseURL + " just now. Status shows once it answers."})
		}
	}
	return nil, notes
}

// gatusAnswers fetches <base>/api/v1/endpoints/statuses with the guarded
// client (5 s, no redirects) and reports a 200.
func (s *server) gatusAnswers(ctx context.Context, base string) bool {
	u, err := url.Parse(base + "/api/v1/endpoints/statuses")
	if err != nil {
		return false
	}
	resp, err := s.outbound.Do(ctx, widgets.Request{URL: u, MaxBody: widgets.MaxBodyBytes, AllowTruncate: true})
	return err == nil && resp.Status == http.StatusOK
}

// --- PATCH ----------------------------------------------------------------

// handlePatchServerSettings is PATCH /api/admin/server-settings:
// {set:{KEY:value}, confirm?:[code], oidcTest?:token} (AC-008). Every key
// saves in one transaction or none does; the answer is the GET body.
func (s *server) handlePatchServerSettings(w http.ResponseWriter, r *http.Request) {
	admin, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}
	var in struct {
		Set      map[string]json.RawMessage `json:"set"`
		Confirm  []string                   `json:"confirm"`
		OIDCTest string                     `json:"oidcTest"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&in); err != nil {
		writeSettingsError(w, http.StatusBadRequest, settingsError{Error: "invalid", Message: "The request isn't valid JSON."})
		return
	}
	keys := sortedKeys(in.Set)
	refuse := func(status int, e settingsError) {
		for _, k := range keys {
			log.Printf("settings: admin %s refused %s: %s", admin.ID, k, e.Error)
		}
		writeSettingsError(w, status, e)
	}
	if s.envOnly {
		refuse(http.StatusConflict, settingsError{Error: "env_only", Message: envOnlyMessage})
		return
	}
	if len(keys) == 0 {
		writeSettingsError(w, http.StatusBadRequest, settingsError{Error: "invalid", Message: "Nothing to save."})
		return
	}
	for _, k := range keys {
		def, ok := settingDefByKey[k]
		switch {
		case !ok:
			writeSettingsError(w, http.StatusNotFound, unknownKey(k))
			return
		case def.Restart:
			refuse(http.StatusBadRequest, readOnlyKey(k))
			return
		case def.Type == typeSecret && s.sealer == nil:
			refuse(http.StatusConflict, settingsError{Error: "no_secret_key", Key: k,
				Message: "To save the secret here, add a server key on the server. The env secret still works."})
			return
		}
	}

	s.settingsMu.Lock()
	defer s.settingsMu.Unlock()
	ctx := r.Context()
	// Compare with what is stored now, not a snapshot another replica has
	// since replaced (AC-030).
	_ = s.reloadLocked(ctx, false)
	ui, _, err := s.loadUI(ctx)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	cur := s.cfg()
	next, serr := s.stage(ui, in.Set)
	if serr != nil {
		if serr.status != http.StatusNotFound {
			refuse(serr.status, serr.body)
		} else {
			writeSettingsError(w, serr.status, serr.body)
		}
		return
	}
	gerr, notes := s.guard(r, admin, cur, next, in.Confirm, in.OIDCTest)
	if gerr != nil {
		refuse(gerr.status, gerr.body)
		return
	}

	var ch storage.ServerSettingsChange
	var lines []string
	for _, k := range keys {
		def := settingDefByKey[k]
		st := cur.settings[k]
		newVal := next.settings[k].value
		if st.saved && !st.savedInvalid && st.savedValue == newVal && !(def.Type == typeSecret && st.unreadable) {
			continue // already saved as this
		}
		switch {
		case k == keyGatusDegradedMs:
			ch.Degraded = &storage.DegradedChange{Ms: next.degradedMsPtr()}
		case def.Type == typeSecret:
			sealed, nonce, err := s.sealer.Seal([]byte(newVal), secretAAD)
			if err != nil {
				log.Printf("settings: seal %s: %v", k, err)
				http.Error(w, "internal error", http.StatusInternalServerError)
				return
			}
			ch.Upserts = append(ch.Upserts, storage.ServerSettingRow{Key: k, Sealed: sealed, Nonce: nonce})
		default:
			v := newVal
			ch.Upserts = append(ch.Upserts, storage.ServerSettingRow{Key: k, Value: &v})
		}
		if def.Type == typeSecret {
			how := "(set)"
			if st.saved {
				how = "(replaced)"
			}
			lines = append(lines, fmt.Sprintf("settings: admin %s changed %s %s", admin.ID, k, how))
		} else {
			lines = append(lines, fmt.Sprintf("settings: admin %s changed %s from %q to %q", admin.ID, k, st.value, newVal))
		}
	}
	if len(ch.Upserts) > 0 || ch.Degraded != nil {
		if err := s.store.ApplyServerSettings(ctx, admin.ID, ch); err != nil {
			log.Printf("settings: save: %v; nothing changed", err)
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		for _, l := range lines {
			log.Print(l)
		}
		if in.OIDCTest != "" && !cur.oidc.Equal(next.oidc) {
			s.oidcTests.consume(in.OIDCTest)
		}
		if err := s.reloadLocked(ctx, true, next.trusted); err != nil {
			log.Printf("settings: apply after save: %v", err)
		}
	}
	writeJSON(w, http.StatusOK, s.settingsBody(s.cfg(), notes))
}

func (c *liveConfig) degradedMsPtr() *int {
	v := c.degradedMs
	return &v
}

// --- DELETE ---------------------------------------------------------------

// handleResetServerSetting is DELETE /api/admin/server-settings/{key}
// (AC-009): it removes the UI value, so env or the default applies again.
// It runs the guards for the value it leaves in place; confirm codes and a
// test token come as ?confirm=a,b and ?oidcTest=. It works with
// HOMEPAD_SETTINGS_FROM_ENV_ONLY on (§2.6), where it changes nothing live.
func (s *server) handleResetServerSetting(w http.ResponseWriter, r *http.Request) {
	admin, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}
	k := r.PathValue("key")
	def, known := settingDefByKey[k]
	if !known {
		writeSettingsError(w, http.StatusNotFound, unknownKey(k))
		return
	}
	if def.Restart {
		log.Printf("settings: admin %s refused %s: read_only", admin.ID, k)
		writeSettingsError(w, http.StatusBadRequest, readOnlyKey(k))
		return
	}
	s.settingsMu.Lock()
	defer s.settingsMu.Unlock()
	ctx := r.Context()
	// Compare with what is stored now, not a snapshot another replica has
	// since replaced (AC-030).
	_ = s.reloadLocked(ctx, false)
	ui, _, err := s.loadUI(ctx)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	cur := s.cfg()
	st := cur.settings[k]
	if _, isRow := ui.rows[k]; !isRow && !(k == keyGatusDegradedMs && ui.degraded != nil) {
		writeJSON(w, http.StatusOK, s.settingsBody(cur, nil)) // nothing saved: nothing to do
		return
	}

	without := ui.clone()
	without.rows = map[string]storage.ServerSettingRow{}
	for rk, row := range ui.rows {
		if rk != k {
			without.rows[rk] = row
		}
	}
	delete(without.values, k)
	delete(without.invalid, k)
	if k == keyGatusDegradedMs {
		without.degraded = nil
	}
	if def.Type == typeSecret {
		without.unreadable = false
	}
	next, err := s.build(without, cur.trusted)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	var notes []settingWarning
	if !s.envOnly {
		var confirm []string
		if c := r.URL.Query().Get("confirm"); c != "" {
			confirm = strings.Split(c, ",")
		}
		var gerr *stageErr
		gerr, notes = s.guard(r, admin, cur, next, confirm, r.URL.Query().Get("oidcTest"))
		if gerr != nil {
			log.Printf("settings: admin %s refused %s: %s", admin.ID, k, gerr.body.Error)
			writeSettingsError(w, gerr.status, gerr.body)
			return
		}
	}
	ch := storage.ServerSettingsChange{}
	if k == keyGatusDegradedMs {
		ch.Degraded = &storage.DegradedChange{Ms: nil}
	} else {
		ch.Deletes = []string{k}
	}
	if err := s.store.ApplyServerSettings(ctx, admin.ID, ch); err != nil {
		log.Printf("settings: reset %s: %v; nothing changed", k, err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	after := next.settings[k]
	if def.Type == typeSecret {
		log.Printf("settings: admin %s reset %s (removed)", admin.ID, k)
	} else {
		was := st.savedValue
		log.Printf("settings: admin %s reset %s (was %q; now %s %q)", admin.ID, k, was, after.source, after.value)
	}
	if err := s.reloadLocked(ctx, true); err != nil {
		log.Printf("settings: apply after reset: %v", err)
	}
	writeJSON(w, http.StatusOK, s.settingsBody(s.cfg(), notes))
}
