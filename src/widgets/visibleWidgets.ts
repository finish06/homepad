// SPEC-health-widget §4.1 / §4.4 — the one place that decides which widgets
// show for a person. App.tsx, the widget area and My settings all call it, so
// they can't disagree (AC-015).

// The per-person hidden list's keys, in the fixed order the API keeps them.
// clock, weather and health are widgets; healthDetails (the health widget's
// counts, meter and legend) and tiles (the numbers on tiles) are parts of
// something and have no household switch.
export const WIDGET_KEYS = ['clock', 'weather', 'health', 'healthDetails', 'tiles'] as const;
export type WidgetKey = (typeof WIDGET_KEYS)[number];

// The household's on/off switches (Admin → Widgets).
export type Household = { clock: boolean; weather: boolean; health: boolean };

export type Visible = Record<WidgetKey, boolean>;

// normalizeHidden keeps known keys only, once each, in the fixed order.
export function normalizeHidden(keys: readonly unknown[]): WidgetKey[] {
  return WIDGET_KEYS.filter((k) => keys.includes(k));
}

// visibleWidgets — a widget shows when the household has it on and the person
// has not hidden it. healthDetails needs health to show. A kid never sees
// tile numbers (SPEC-status-widgets Q3 a), whatever the list says.
export function visibleWidgets(household: Household, hidden: readonly string[], role: string): Visible {
  const shown = (k: WidgetKey) => !hidden.includes(k);
  const health = household.health && shown('health');
  return {
    clock: household.clock && shown('clock'),
    weather: household.weather && shown('weather'),
    health,
    healthDetails: health && shown('healthDetails'),
    tiles: role !== 'kid' && shown('tiles'),
  };
}

// legacyHidden is the list an account's old switches meant, mapped the way
// migration 0026 maps them: for an adult, showHealthBar false hid the counts
// and meter, and showWidgets false hid the clock, the weather and the tile
// numbers; for a kid, showHealthBar false hid the whole health panel and
// showWidgets was never read. Used against an API that has no hiddenWidgets
// yet (§4.3 rollout order) and to seed the first paint from the old caches.
export function legacyHidden(role: string, showHealthBar?: boolean, showWidgets?: boolean): WidgetKey[] {
  if (role === 'kid') return showHealthBar === true ? [] : ['health'];
  const out: string[] = [];
  if (showHealthBar === false) out.push('healthDetails');
  if (showWidgets === false) out.push('clock', 'weather', 'tiles');
  return normalizeHidden(out);
}
