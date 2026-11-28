package storage

// SPEC-health-widget §4.1–§4.3 — each person's list of hidden widgets
// (users.hidden_widgets, migration 0026), and the mapping to and from the old
// show_health_bar / show_widgets switches, which are kept in step until
// 19.0.0 so an 18.7 image still sees each person's choices.

// Widget keys. clock, weather and health are widgets; healthDetails (the
// health widget's counts, meter and legend) and tiles (the widget numbers on
// tiles) are parts of something and have no household switch.
const (
	WidgetClock         = "clock"
	WidgetWeather       = "weather"
	WidgetHealth        = "health"
	WidgetHealthDetails = "healthDetails"
	WidgetTiles         = "tiles"
)

// WidgetKeys is the one allowlist of keys, in the fixed order the list is
// stored and returned in. A later key goes here; it needs no migration.
var WidgetKeys = []string{WidgetClock, WidgetWeather, WidgetHealth, WidgetHealthDetails, WidgetTiles}

// MaxHiddenWidgets caps the length of a PATCH body's list (§4.3).
const MaxHiddenWidgets = 16

// IsWidgetKey reports whether k is on the allowlist.
func IsWidgetKey(k string) bool {
	for _, w := range WidgetKeys {
		if w == k {
			return true
		}
	}
	return false
}

// NormalizeHiddenWidgets returns keys in the fixed order with no duplicates
// and no unknown keys. It never returns nil, so the column (NOT NULL) and the
// JSON ([] not null) both get an empty list.
func NormalizeHiddenWidgets(keys []string) []string {
	in := map[string]bool{}
	for _, k := range keys {
		in[k] = true
	}
	out := []string{}
	for _, k := range WidgetKeys {
		if in[k] {
			out = append(out, k)
		}
	}
	return out
}

func hasKey(list []string, k string) bool {
	for _, x := range list {
		if x == k {
			return true
		}
	}
	return false
}

// LegacyShowHealthBar is show_health_bar worked out from the list (§4.3): for
// an adult it hid the counts and meter, for a kid the whole panel.
func LegacyShowHealthBar(role string, hidden []string) bool {
	if role == RoleKid {
		return !hasKey(hidden, WidgetHealth)
	}
	return !hasKey(hidden, WidgetHealthDetails)
}

// LegacyShowWidgets is show_widgets worked out from the list (§4.3): false
// only when clock, weather and tiles are all hidden.
func LegacyShowWidgets(hidden []string) bool {
	return !(hasKey(hidden, WidgetClock) && hasKey(hidden, WidgetWeather) && hasKey(hidden, WidgetTiles))
}

// ApplyLegacyShowHealthBar changes the list the way the old showHealthBar
// switch meant for role: an adult's switch adds or removes healthDetails, a
// kid's adds or removes health. Nothing else in the list changes.
func ApplyLegacyShowHealthBar(role string, hidden []string, show bool) []string {
	key := WidgetHealthDetails
	if role == RoleKid {
		key = WidgetHealth
	}
	return setHidden(hidden, !show, key)
}

// ApplyLegacyShowWidgets changes the list the way the old showWidgets switch
// meant: it adds or removes all of clock, weather and tiles.
func ApplyLegacyShowWidgets(hidden []string, show bool) []string {
	return setHidden(hidden, !show, WidgetClock, WidgetWeather, WidgetTiles)
}

func setHidden(hidden []string, hide bool, keys ...string) []string {
	next := []string{}
	drop := map[string]bool{}
	for _, k := range keys {
		drop[k] = true
	}
	for _, k := range hidden {
		if !drop[k] {
			next = append(next, k)
		}
	}
	if hide {
		next = append(next, keys...)
	}
	return NormalizeHiddenWidgets(next)
}
