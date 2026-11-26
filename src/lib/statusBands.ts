import type { ServiceStatus } from '../api';

// The health meter's status banding, shared by the health panel's meter
// (src/app/StatusBar.tsx) and each App Grid box header's status bar
// (SPEC-group-header-collapse §3.2, AC-003). One module so the two can never
// band a status differently.
//
// Three bands only, healthy-first (SPEC-v24 §3.2, §8.B): 0 GREEN (UP), 1 GRAY
// (NOT_MONITORED + UNKNOWN: unobservable, not known-down), 2 RED (DOWN +
// DEGRADED). DEGRADED reads red, not amber: amber is the LED's and the tile
// pip's. Status hue never takes the service or category hue (#352).

export type Band = 0 | 1 | 2;

export const statusBand: Record<ServiceStatus, Band> = {
  UP: 0,
  NOT_MONITORED: 1,
  UNKNOWN: 1,
  DOWN: 2,
  DEGRADED: 2,
};

// The colour class per status (`.health-tick-*`, index.css), semantic only and
// accent-independent.
export const tickClass: Record<ServiceStatus, string> = {
  UP: 'health-tick-up',
  DOWN: 'health-tick-down',
  DEGRADED: 'health-tick-down',
  UNKNOWN: 'health-tick-idle',
  NOT_MONITORED: 'health-tick-idle',
};

// The class for each band, in band order. Same tokens as tickClass.
export const BAND_CLASS: readonly [string, string, string] = ['health-tick-up', 'health-tick-idle', 'health-tick-down'];

// bandOf maps any status string to its band. A status the client does not know
// (a newer server) is gray: unobservable, never claimed up or down.
export function bandOf(status: string): Band {
  return statusBand[status as ServiceStatus] ?? 1;
}

// isDown is the health panel's "N down" rule: DOWN and DEGRADED both count
// (StatusBar's down chip, SPEC-group-header-collapse §3.3).
export function isDown(status: string): boolean {
  return status === 'DOWN' || status === 'DEGRADED';
}

// bandCounts counts apps per band: [green, gray, red].
export function bandCounts(statuses: readonly string[]): [number, number, number] {
  const c: [number, number, number] = [0, 0, 0];
  for (const s of statuses) c[bandOf(s)] += 1;
  return c;
}

export const BAR_WIDTH_PX = 64;
export const MIN_BAND_PX = 4;

// bandWidths — §3.2's formula. Each non-empty band gets MIN_BAND_PX, so one red
// app always shows; the rest of the bar is shared among the non-empty bands by
// app count: width = 4 + (64 − 4 × bands) × count / total. An empty band is 0.
// The widths always sum to exactly `total` (when any band is non-empty), so the
// bar never overflows or clips (AC-002).
export function bandWidths(
  counts: readonly [number, number, number],
  total: number = BAR_WIDTH_PX,
): [number, number, number] {
  const apps = counts[0] + counts[1] + counts[2];
  if (apps === 0) return [0, 0, 0];
  const bands = counts.filter((n) => n > 0).length;
  const share = total - MIN_BAND_PX * bands;
  return counts.map((n) => (n > 0 ? MIN_BAND_PX + (share * n) / apps : 0)) as [number, number, number];
}

// The status words, in the order the hidden status line reads them (AC-004).
// They are the tile pips' words (statusLabel in AppGrid), lower-cased, so
// UNKNOWN is never called "not monitored" and DEGRADED never "down".
const STATUS_WORDS: readonly [ServiceStatus, string][] = [
  ['UP', 'up'],
  ['DOWN', 'down'],
  ['DEGRADED', 'degraded'],
  ['UNKNOWN', 'unknown'],
  ['NOT_MONITORED', 'not monitored'],
];

// statusLine — "2 up, 1 down, 1 degraded, 1 unknown, 1 not monitored". Zero
// counts are left out; an empty box gives "". A status the client does not know
// is read as "unknown", like its gray band.
export function statusLine(statuses: readonly string[]): string {
  const n = new Map<string, number>();
  for (const s of statuses) {
    const k = STATUS_WORDS.some(([st]) => st === s) ? s : 'UNKNOWN';
    n.set(k, (n.get(k) ?? 0) + 1);
  }
  return STATUS_WORDS.filter(([s]) => n.get(s))
    .map(([s, word]) => `${n.get(s)} ${word}`)
    .join(', ');
}

// countPhrase — "1 app", "0 apps", "6 apps" (§3.2): the pill's accessible text
// and the announcement's count.
export function countPhrase(n: number): string {
  return n === 1 ? '1 app' : `${n} apps`;
}
