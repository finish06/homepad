package storage_test

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/finish06/homepad/api/internal/storage"
)

func pv[T any](v T) *T { return &v }

// SPEC-api-cleanup-18.2.0 AC-005 (#665) — PATCH /api/me writes every field in
// one statement, so a failed write changes nothing. Here the density value
// breaks the column CHECK (the handler would refuse it first; this is the
// backstop), and the theme sent with it must not be saved.
func TestSetUserPrefs_IsAllOrNothing(t *testing.T) {
	store, ctx := openStore(t)
	id := seedStoreUser(t, store, ctx)
	before, err := store.UserByID(ctx, id)
	require.NoError(t, err)
	require.NotEqual(t, "dark", before.ThemePref)

	_, err = store.SetUserPrefs(ctx, id, storage.UserPrefs{ThemePref: pv("dark"), DensityPref: pv("huge")})
	require.Error(t, err, "a density outside the CHECK must fail")

	after, err := store.UserByID(ctx, id)
	require.NoError(t, err)
	assert.Equal(t, before.ThemePref, after.ThemePref, "the theme must not be saved when the density fails")
	assert.Equal(t, before.DensityPref, after.DensityPref)
}

// Only the fields given are written; the rest keep their value.
func TestSetUserPrefs_WritesOnlyGivenFields(t *testing.T) {
	store, ctx := openStore(t)
	id := seedStoreUser(t, store, ctx)
	before, err := store.UserByID(ctx, id)
	require.NoError(t, err)

	got, err := store.SetUserPrefs(ctx, id, storage.UserPrefs{
		ThemePref: pv("dark"), DensityPref: pv("list"), ShowHealthBar: pv(!before.ShowHealthBar),
	})
	require.NoError(t, err)
	assert.Equal(t, "dark", got.ThemePref)
	assert.Equal(t, "list", got.DensityPref)
	assert.Equal(t, !before.ShowHealthBar, got.ShowHealthBar)
	assert.Equal(t, before.ShowUptimeDisplay, got.ShowUptimeDisplay)
	assert.Equal(t, before.ShowWidgets, got.ShowWidgets)

	reread, err := store.UserByID(ctx, id)
	require.NoError(t, err)
	assert.Equal(t, got, reread)
}

func TestSetUserPrefs_UnknownUser(t *testing.T) {
	store, ctx := openStore(t)
	_, err := store.SetUserPrefs(ctx, "00000000-0000-0000-0000-000000000000", storage.UserPrefs{ThemePref: pv("dark")})
	assert.True(t, errors.Is(err, storage.ErrNotFound), "got %v", err)
}

// colsOf reads the three widget columns of one user straight from the row.
func colsOf(t *testing.T, store *storage.Store, ctx context.Context, id string) (hidden []string, bar, widgets bool) {
	t.Helper()
	require.NoError(t, store.Pool().QueryRow(ctx,
		`SELECT hidden_widgets, show_health_bar, show_widgets FROM users WHERE id = $1`, id).Scan(&hidden, &bar, &widgets))
	return hidden, bar, widgets
}

// SPEC-health-widget AC-005 — every write to the list writes
// show_health_bar and show_widgets to match, in the same UPDATE, so an 18.7
// image rolled back to reads each person's choice.
func TestSetUserPrefs_HiddenWidgetsKeepsTheOldColumnsInStep(t *testing.T) {
	store, ctx := openStore(t)
	id := seedStoreUser(t, store, ctx)

	for _, c := range []struct {
		name        string
		set         []string
		want        []string
		bar, widget bool
	}{
		{"nothing hidden", []string{}, []string{}, true, true},
		{"order is fixed", []string{"tiles", "healthDetails", "clock"}, []string{"clock", "healthDetails", "tiles"}, false, true},
		{"all three of the old switch", []string{"weather", "clock", "tiles"}, []string{"clock", "weather", "tiles"}, true, false},
		{"health alone keeps the adult's old switch on", []string{"health"}, []string{"health"}, true, true},
		{"everything", []string{"clock", "weather", "health", "healthDetails", "tiles"},
			[]string{"clock", "weather", "health", "healthDetails", "tiles"}, false, false},
	} {
		got, err := store.SetUserPrefs(ctx, id, storage.UserPrefs{HiddenWidgets: &c.set})
		require.NoError(t, err, c.name)
		assert.Equal(t, c.want, got.HiddenWidgets, c.name)
		hidden, bar, widgets := colsOf(t, store, ctx, id)
		assert.Equal(t, c.want, hidden, c.name)
		assert.Equal(t, c.bar, bar, "%s: show_health_bar", c.name)
		assert.Equal(t, c.widget, widgets, "%s: show_widgets", c.name)
	}
}

// §4.3 — the old switches change the list: showHealthBar adds or removes
// healthDetails (an adult), showWidgets all of clock, weather and tiles.
// Nothing else in the list moves.
func TestSetUserPrefs_OldSwitchesChangeTheList(t *testing.T) {
	store, ctx := openStore(t)
	id := seedStoreUser(t, store, ctx)
	_, err := store.SetUserPrefs(ctx, id, storage.UserPrefs{HiddenWidgets: &[]string{"health", "weather"}})
	require.NoError(t, err)

	got, err := store.SetUserPrefs(ctx, id, storage.UserPrefs{ShowHealthBar: pv(false)})
	require.NoError(t, err)
	assert.Equal(t, []string{"weather", "health", "healthDetails"}, got.HiddenWidgets)
	got, err = store.SetUserPrefs(ctx, id, storage.UserPrefs{ShowWidgets: pv(false)})
	require.NoError(t, err)
	assert.Equal(t, []string{"clock", "weather", "health", "healthDetails", "tiles"}, got.HiddenWidgets)
	got, err = store.SetUserPrefs(ctx, id, storage.UserPrefs{ShowWidgets: pv(true), ShowHealthBar: pv(true)})
	require.NoError(t, err)
	assert.Equal(t, []string{"health"}, got.HiddenWidgets, "turning showWidgets on shows all three, weather too")
	hidden, bar, widgets := colsOf(t, store, ctx, id)
	assert.Equal(t, []string{"health"}, hidden)
	assert.True(t, bar)
	assert.True(t, widgets)

	// A change to another field leaves the list alone.
	got, err = store.SetUserPrefs(ctx, id, storage.UserPrefs{ThemePref: pv("light")})
	require.NoError(t, err)
	assert.Equal(t, []string{"health"}, got.HiddenWidgets)
}

// A kid's old showHealthBar gated the whole panel: the store maps it to
// health (the API never lets a kid send it; a restore can).
func TestSetUserPrefs_KidsOldSwitchIsHealth(t *testing.T) {
	store, ctx := openStore(t)
	kid, err := store.CreateKid(ctx, uniqueKidName(t), "teal")
	require.NoError(t, err)
	got, err := store.SetUserPrefs(ctx, kid.ID, storage.UserPrefs{ShowHealthBar: pv(true)})
	require.NoError(t, err)
	assert.Equal(t, []string{}, got.HiddenWidgets)
	_, bar, _ := colsOf(t, store, ctx, kid.ID)
	assert.True(t, bar)
	got, err = store.SetUserPrefs(ctx, kid.ID, storage.UserPrefs{HiddenWidgets: &[]string{"health"}})
	require.NoError(t, err)
	_, bar, _ = colsOf(t, store, ctx, kid.ID)
	assert.False(t, bar, "a kid's health is the old show_health_bar false")
	assert.False(t, got.ShowHealthBar)
}

// AC-004 — a new adult starts with an empty list.
func TestCreateUser_StartsWithNothingHidden(t *testing.T) {
	store, ctx := openStore(t)
	u, err := store.UserByID(ctx, seedStoreUser(t, store, ctx))
	require.NoError(t, err)
	assert.Equal(t, []string{}, u.HiddenWidgets)
	assert.True(t, u.ShowHealthBar)
	assert.True(t, u.ShowWidgets)
}

// AC-005 — a restore's SetPerson writes the list and both old columns, with
// show_health_bar read by role.
func TestTransferSetPerson_KeepsTheOldColumnsInStep(t *testing.T) {
	store, ctx := openStore(t)
	adult := seedStoreUser(t, store, ctx)
	kid, err := store.CreateKid(ctx, uniqueKidName(t), "teal")
	require.NoError(t, err)
	require.NoError(t, store.InTransferTx(ctx, 0, func(tx *storage.TransferTx) error {
		for _, id := range []string{adult, kid.ID} {
			if err := tx.SetPerson(ctx, id, storage.TransferPersonRow{ThemePref: "dark", DensityPref: "list",
				HiddenWidgets: []string{"tiles", "health", "weather", "clock"}, ShowUptimeDisplay: true}); err != nil {
				return err
			}
		}
		return nil
	}))
	hidden, bar, widgets := colsOf(t, store, ctx, adult)
	assert.Equal(t, []string{"clock", "weather", "health", "tiles"}, hidden)
	assert.True(t, bar, "an adult's show_health_bar follows healthDetails, which is not hidden")
	assert.False(t, widgets)
	hidden, bar, widgets = colsOf(t, store, ctx, kid.ID)
	assert.Equal(t, []string{"clock", "weather", "health", "tiles"}, hidden)
	assert.False(t, bar, "a kid's show_health_bar follows health")
	assert.False(t, widgets)
}
