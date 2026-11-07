import type { TileWidget, WidgetField } from '../api';
import type { TileDensity } from '../grid/tileDensity';

// SPEC-status-widgets §6.6 / UX §9 — the server sends typed numbers; this turns
// them into the tile line. Plain words, the number first, fields joined with
// " · ". Labels that read as names (VMs, CPU, ↓) go before the number.

const PREFIX = new Set(['VMs', 'CTs', 'CPU', 'RAM', '↓', '↑']);
const RATE_UNITS = ['B/s', 'kB/s', 'MB/s', 'GB/s'];

// Digit grouping below 10,000; the compact form ("48k") from there up.
function formatCount(n: number): string {
  if (Math.abs(n) < 10_000) return Math.round(n).toLocaleString();
  return new Intl.NumberFormat(undefined, { notation: 'compact' })
    .format(n)
    .replace('K', 'k');
}

export function formatFieldValue(f: WidgetField): string {
  switch (f.unit) {
    case 'percent':
      return `${Math.round(f.value)}%`;
    case 'ratio':
      return typeof f.total === 'number' ? `${f.value}/${f.total}` : String(f.value);
    case 'bytes_per_sec': {
      let v = f.value;
      let i = 0;
      while (v >= 1000 && i < RATE_UNITS.length - 1) {
        v /= 1000;
        i++;
      }
      return `${i > 0 && v < 10 ? v.toFixed(1) : Math.round(v)} ${RATE_UNITS[i]}`;
    }
    default:
      return formatCount(f.value);
  }
}

export function fieldText(f: WidgetField): string {
  const v = formatFieldValue(f);
  return PREFIX.has(f.label) ? `${f.label} ${v}` : `${v} ${f.label}`;
}

// AC-009 — List shows up to 3 fields; Compact and Large up to 2.
export function maxFields(density: TileDensity): number {
  return density === 'list' ? 3 : 2;
}

export type WidgetLine = { parts: string[]; stale: boolean; description: string };

// The line to show, or null when the tile should fall back to what it shows
// today: no widget, loading, error, or nothing answered (AC-007). The outage
// rule (DOWN wins) is the caller's, because it needs the service status.
export function widgetLine(w: TileWidget | undefined, density: TileDensity, nowMs: number): WidgetLine | null {
  if (!w || (w.state !== 'ok' && w.state !== 'stale') || w.fields.length === 0) return null;
  const parts = w.fields.slice(0, maxFields(density)).map(fieldText);
  const stale = w.state === 'stale';
  // UX §10 — arrows are spoken as words.
  let description = parts.join(', ').replace(/↓/g, 'down').replace(/↑/g, 'up');
  if (stale) {
    const t = w.asOf ? Date.parse(w.asOf) : NaN;
    description += Number.isNaN(t)
      ? '. Updated a while ago'
      : `. Updated ${Math.max(1, Math.floor((nowMs - t) / 60_000))} min ago`;
  }
  return { parts, stale, description };
}
