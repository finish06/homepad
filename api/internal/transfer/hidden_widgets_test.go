package transfer_test

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/finish06/homepad/api/internal/storage"
	"github.com/finish06/homepad/api/internal/transfer"
)

// SPEC-health-widget AC-012…AC-014 — backups carry each person's hidden
// widgets, and restore old and new files.

// AC-012 — an export writes prefs.hiddenWidgets for every adult and kid and
// still writes showHealthBar worked out from it, by role.
func TestBackup_WritesHiddenWidgetsAndTheOldSwitch(t *testing.T) {
	st := populatedState()
	st.People[0].HiddenWidgets = []string{"tiles", "clock"} // out of order on purpose
	f := transfer.BuildFile(st, true, "18.8.0", exportTime)
	require.NotNil(t, f.People)

	byEmail := map[string]transfer.Adult{}
	for _, a := range f.People.Adults {
		byEmail[a.Email] = a
	}
	admin := byEmail["admin@example.com"].Prefs
	require.NotNil(t, admin.HiddenWidgets)
	assert.Equal(t, []string{"clock", "tiles"}, *admin.HiddenWidgets, "fixed key order")
	assert.Equal(t, true, *admin.ShowHealthBar)

	alex := byEmail["alex@example.com"].Prefs
	assert.Equal(t, []string{"healthDetails"}, *alex.HiddenWidgets)
	assert.Equal(t, false, *alex.ShowHealthBar, "an adult's healthDetails is the old showHealthBar false")

	kid := f.People.Kids[0].Prefs
	assert.Equal(t, []string{"health"}, *kid.HiddenWidgets)
	assert.Equal(t, false, *kid.ShowHealthBar, "a kid's health is the old showHealthBar false")

	// An 18.7 server knows every key but hiddenWidgets: it counts one
	// unknown field per person and restores the rest.
	var m map[string]any
	require.NoError(t, json.Unmarshal(transfer.Encode(f), &m))
	kidPrefs := m["people"].(map[string]any)["kids"].([]any)[0].(map[string]any)["prefs"].(map[string]any)
	assert.Contains(t, kidPrefs, "showHealthBar")
	assert.Contains(t, kidPrefs, "hiddenWidgets")
	assert.Equal(t, 2, transfer.SchemaVersion, "schemaVersion stays 2")
}

// restoreOnto plans a merge of f onto st and applies it.
func restoreOnto(t *testing.T, st *storage.TransferState, f *transfer.File) (*transfer.Plan, *storage.TransferState) {
	t.Helper()
	p := restorePlan(t, st, decodeFile(t, f), transfer.ModeMerge)
	return p, apply(t, newMem(st), p)
}

// AC-013 — a file with hiddenWidgets sets the list; a key this version
// doesn't know is dropped and counted with the unknown fields, not refused.
func TestRestore_HiddenWidgetsFromTheFile(t *testing.T) {
	f := decodeFixture(t).File
	f.People.Adults[0].Prefs.HiddenWidgets = &[]string{"weather", "pihole", "health"}
	f.People.Adults[0].Prefs.ShowHealthBar = boolp(false) // ignored next to the list
	b, err := json.Marshal(f)
	require.NoError(t, err)
	d, derr := transfer.DecodeBackup(b)
	require.Nil(t, derr)
	assert.Equal(t, 1, d.UnknownFields, "the unknown key is counted")

	p := restorePlan(t, freshState(), d, transfer.ModeMerge)
	assert.Contains(t, p.Warnings, transfer.PlanWarning{Code: transfer.WarnUnknownFields, Count: 1})
	after := apply(t, newMem(freshState()), p)
	assert.Equal(t, []string{"weather", "health"}, personByEmail(after, "alex@example.com").HiddenWidgets)
}

// AC-013 — a file without hiddenWidgets (every file before 18.8) maps
// showHealthBar as 0026 does and leaves clock, weather and tiles alone.
func TestRestore_OldFileMapsShowHealthBar(t *testing.T) {
	f := decodeFixture(t).File
	require.Nil(t, f.People.Adults[0].Prefs.HiddenWidgets, "the fixture is an old file")

	st := freshState()
	personByEmail(st, "alex@example.com").HiddenWidgets = []string{"clock", "tiles"}
	f.People.Adults[0].Prefs.ShowHealthBar = boolp(false)
	_, after := restoreOnto(t, st, f)
	assert.Equal(t, []string{"clock", "healthDetails", "tiles"}, personByEmail(after, "alex@example.com").HiddenWidgets,
		"an adult's false adds healthDetails and keeps the rest")

	st = freshState()
	personByEmail(st, "alex@example.com").HiddenWidgets = []string{"weather", "healthDetails"}
	f.People.Adults[0].Prefs.ShowHealthBar = boolp(true)
	_, after = restoreOnto(t, st, f)
	assert.Equal(t, []string{"weather"}, personByEmail(after, "alex@example.com").HiddenWidgets,
		"an adult's true removes healthDetails and keeps the rest")
}

// AC-013/AC-014 — an existing kid: showHealthBar true in an old file shows
// health; a new kid from a file with neither field hides it, as insertKid.
func TestRestore_KidsHealth(t *testing.T) {
	f := decodeFixture(t).File
	f.People.Kids[0].Prefs.ShowHealthBar = boolp(true)
	st := freshState()
	st.People = append(st.People, storage.TransferPerson{ID: "k-maya", Role: storage.RoleKid, DisplayName: "Maya",
		AvatarColor: "teal", ThemePref: "light", DensityPref: "large", HiddenWidgets: []string{"health"}, ShowUptimeDisplay: true,
		Favorites: []string{}, Order: []string{}, Collapsed: []string{}, Allowed: []string{}})
	p, after := restoreOnto(t, st, f)
	assert.Contains(t, item(t, p, transfer.KindKid, "Maya").Fields, "prefs", "a list change is a pref change")
	var maya *storage.TransferPerson
	for i := range after.People {
		if after.People[i].DisplayName == "Maya" {
			maya = &after.People[i]
		}
	}
	require.NotNil(t, maya)
	assert.Equal(t, []string{}, maya.HiddenWidgets)

	f = decodeFixture(t).File
	f.People.Kids[0].Prefs.ShowHealthBar = nil
	f.People.Kids[0].Prefs.HiddenWidgets = nil
	_, after = restoreOnto(t, freshState(), f)
	for _, x := range after.People {
		if x.Role == storage.RoleKid {
			assert.Equal(t, []string{"health"}, x.HiddenWidgets, "a new kid starts with health hidden")
		}
	}
}

// AC-014 — a restore that would leave the list as it is shows no change;
// one that changes it lists prefs.
func TestRestore_ListChangeIsAPrefChange(t *testing.T) {
	f := decodeFixture(t).File
	st := freshState()
	alex := personByEmail(st, "alex@example.com")
	alex.ThemePref, alex.DensityPref = "dark", "compact"
	alex.HiddenWidgets = []string{"clock"}
	f.People.Adults[0].Prefs.HiddenWidgets = &[]string{"clock"}
	p := restorePlan(t, st, decodeFile(t, f), transfer.ModeMerge)
	assert.NotContains(t, item(t, p, transfer.KindAdult, "alex@example.com").Fields, "prefs")

	f.People.Adults[0].Prefs.HiddenWidgets = &[]string{"clock", "weather"}
	p = restorePlan(t, st, decodeFile(t, f), transfer.ModeMerge)
	assert.Contains(t, item(t, p, transfer.KindAdult, "alex@example.com").Fields, "prefs")
}
