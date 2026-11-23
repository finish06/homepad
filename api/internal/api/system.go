package api

import (
	"encoding/json"
	"io"
	"log"
	"net/http"

	"github.com/finish06/homepad/api/internal/storage"
)

// systemConfigView is the wire shape of the global System settings, shared by
// the public GET and the admin PATCH so both always echo the same fields.
type systemConfigView struct {
	ShowUptimeDisplay bool `json:"showUptimeDisplay"`
	// StatusDegradedMs is the EFFECTIVE "Slow" threshold: the admin-set value
	// when there is one, else what the poller is running with (env / default).
	StatusDegradedMs int `json:"statusDegradedMs"`
}

func (s *server) toSystemConfigView(cfg storage.SystemSettings) systemConfigView {
	// The live config resolves UI, env and default, and honours
	// HOMEPAD_SETTINGS_FROM_ENV_ONLY (SPEC-admin-server-settings §2.1).
	return systemConfigView{ShowUptimeDisplay: cfg.ShowUptimeDisplay, StatusDegradedMs: s.cfg().degradedMs}
}

// maxStatusDegradedMs bounds the admin input (10 minutes); mirrors the DB CHECK.
const maxStatusDegradedMs = 600000

// handleSystemConfig serves the global System settings to anyone, no auth
// required (SPEC cap6 §7, D4) — the frontend reads it consistently regardless of
// session state. A missing row resolves to the default-ON config in the store
// layer (AC-008/010).
func (s *server) handleSystemConfig(w http.ResponseWriter, r *http.Request) {
	cfg, err := s.store.SystemSettings(r.Context())
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, s.toSystemConfigView(cfg))
}

// handlePatchSystemSettings upserts the global System settings (admin only,
// SPEC cap6 §7, D5). The body is a partial patch — only present fields change —
// so it is merged over the current persisted values; the response echoes the
// full state after the write. requireAdmin writes 401 (no session) / 403
// (non-admin) itself (AC-011/012/013).
func (s *server) handlePatchSystemSettings(w http.ResponseWriter, r *http.Request) {
	admin, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}
	raw, err := io.ReadAll(io.LimitReader(r.Body, 64<<10))
	if err != nil {
		http.Error(w, "invalid JSON body", http.StatusBadRequest)
		return
	}
	var in struct {
		ShowUptimeDisplay *bool `json:"showUptimeDisplay"`
		StatusDegradedMs  *int  `json:"statusDegradedMs"`
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		http.Error(w, "invalid JSON body", http.StatusBadRequest)
		return
	}
	// statusDegradedMs: null resets the threshold to env or the default
	// (SPEC-admin-server-settings AC-005; SPEC-status-degraded-threshold OQ-1).
	var present map[string]json.RawMessage
	_ = json.Unmarshal(raw, &present)
	resetDegraded := false
	if v, ok := present["statusDegradedMs"]; ok && string(v) == "null" {
		resetDegraded = true
	}
	if in.StatusDegradedMs != nil && (*in.StatusDegradedMs < 0 || *in.StatusDegradedMs > maxStatusDegradedMs) {
		http.Error(w, "statusDegradedMs must be between 0 and 600000", http.StatusBadRequest)
		return
	}
	// SPEC-status-widgets §7.3 — the clock, weather and web search settings
	// ride on the same PATCH. They are validated (422) before anything is
	// written, and echoed in a separate `widgets` block: this route is
	// admin-only, while systemConfigView is also the PUBLIC GET's shape and
	// must not grow the household's place.
	widgetsView, fe, err := s.patchWidgetSettings(r.Context(), raw)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	if fe != nil {
		writeFieldError(w, fe)
		return
	}
	cur, err := s.store.SystemSettings(r.Context())
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	if in.ShowUptimeDisplay != nil {
		cur.ShowUptimeDisplay = *in.ShowUptimeDisplay
	}
	if in.StatusDegradedMs != nil {
		v := *in.StatusDegradedMs
		cur.StatusDegradedMs = &v
	}
	if resetDegraded {
		cur.StatusDegradedMs = nil
	}
	cur.StatusDegradedUpdatedBy = admin.ID // recorded only if the value changes (AC-007)
	saved, err := s.store.UpsertSystemSettings(r.Context(), cur)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	// Apply to the running poller at once — the next poll (scheduled or
	// "Retry now") uses it. No restart, which is the point of a UI setting.
	if err := s.reload(r.Context(), true); err != nil {
		log.Printf("settings: apply status_degraded_ms: %v", err)
	}
	writeJSON(w, http.StatusOK, struct {
		systemConfigView
		Widgets widgetSettingsView `json:"widgets"`
	}{s.toSystemConfigView(saved), widgetsView})
}
