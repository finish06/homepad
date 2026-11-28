import { describe, expect, it } from 'vitest';
import { legacyHidden, normalizeHidden, visibleWidgets, WIDGET_KEYS } from './visibleWidgets';

// SPEC-health-widget AC-015 — one function decides what shows.
describe('visibleWidgets', () => {
  const all = { clock: true, weather: true, health: true };

  it('shows a widget when the household has it on and the person has not hidden it', () => {
    expect(visibleWidgets(all, [], 'member')).toEqual({
      clock: true,
      weather: true,
      health: true,
      healthDetails: true,
      tiles: true,
    });
    expect(visibleWidgets(all, ['clock'], 'member').clock).toBe(false);
    expect(visibleWidgets({ ...all, clock: false }, [], 'admin').clock).toBe(false);
    expect(visibleWidgets({ ...all, weather: false }, [], 'admin').weather).toBe(false);
    expect(visibleWidgets(all, ['weather'], 'admin').weather).toBe(false);
  });

  it('health details need health, from both the person and the household', () => {
    expect(visibleWidgets(all, ['healthDetails'], 'member')).toMatchObject({ health: true, healthDetails: false });
    expect(visibleWidgets(all, ['health'], 'member')).toMatchObject({ health: false, healthDetails: false });
    expect(visibleWidgets({ ...all, health: false }, [], 'member')).toMatchObject({ health: false, healthDetails: false });
  });

  it('tile numbers have no household switch, and a kid never sees them', () => {
    expect(visibleWidgets({ clock: false, weather: false, health: false }, [], 'member').tiles).toBe(true);
    expect(visibleWidgets(all, ['tiles'], 'member').tiles).toBe(false);
    expect(visibleWidgets(all, [], 'kid').tiles).toBe(false);
  });

  it('a kid follows the household for clock and weather, and its own list for health', () => {
    expect(visibleWidgets(all, ['health'], 'kid')).toEqual({
      clock: true,
      weather: true,
      health: false,
      healthDetails: false,
      tiles: false,
    });
    expect(visibleWidgets(all, [], 'kid')).toMatchObject({ health: true, healthDetails: true });
  });

  it('normalizeHidden keeps known keys once, in the fixed order', () => {
    expect(normalizeHidden(['tiles', 'clock', 'pihole', 'clock', 3])).toEqual(['clock', 'tiles']);
    expect(normalizeHidden([...WIDGET_KEYS].reverse())).toEqual([...WIDGET_KEYS]);
  });
});

// AC-003 — nobody's dashboard changes on upgrade. For every role ×
// showHealthBar × showWidgets × household clock/weather, what a person saw on
// 18.7 (App.tsx's old rules) equals what visibleWidgets shows them from the
// list migration 0026 writes (mirrored by legacyHidden; the Go test
// migration_0026_test.go checks the SQL writes the same lists).
describe('AC-003 — the upgrade keeps every dashboard', () => {
  // 18.7's rules (App.tsx at 63011f5):
  //   strip = (clock || weather on) && (isKid || showWidgets)
  //   health panel = !isKid || showHealthBar === true
  //   health details = showHealthBar
  //   tile numbers = !isKid && showWidgets
  function before(role: string, bar: boolean, wid: boolean, clock: boolean, weather: boolean) {
    const isKid = role === 'kid';
    const strip = isKid || wid;
    const health = !isKid || bar;
    return {
      clock: clock && strip,
      weather: weather && strip,
      health,
      healthDetails: health && bar,
      tiles: !isKid && wid,
    };
  }

  // The 0026 backfill, as the Go migration writes it.
  function migrated(role: string, bar: boolean, wid: boolean): string[] {
    if (role === 'kid') return bar ? [] : ['health'];
    return [...(wid ? [] : ['clock', 'weather']), ...(bar ? [] : ['healthDetails']), ...(wid ? [] : ['tiles'])];
  }

  const rows: [string, boolean, boolean, boolean, boolean][] = [];
  for (const role of ['admin', 'member', 'kid'])
    for (const bar of [true, false])
      for (const wid of [true, false])
        for (const clock of [true, false]) for (const weather of [true, false]) rows.push([role, bar, wid, clock, weather]);

  it.each(rows)('%s showHealthBar=%s showWidgets=%s clock=%s weather=%s', (role, bar, wid, clock, weather) => {
    const list = migrated(role, bar, wid);
    expect(legacyHidden(role, bar, wid)).toEqual(list);
    expect(visibleWidgets({ clock, weather, health: true }, list, role)).toEqual(before(role, bar, wid, clock, weather));
  });

  it('covers all 48 combinations', () => {
    expect(rows).toHaveLength(48);
  });
});
