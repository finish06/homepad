// SPEC-status-widgets §6.6 / UX §9 — the browser formats the typed numbers the
// server sends. These pin the copy rules: digit grouping under 10,000, compact
// above it, whole percents, ratios as "5/7", decimal byte rates, the label
// before or after the number, and the per-density field count (AC-009).
import { describe, expect, it } from 'vitest';
import type { TileWidget, WidgetField } from '../api';
import { fieldText, formatFieldValue, maxFields, widgetLine } from './format';

const count = (key: string, label: string, value: number): WidgetField => ({ key, label, unit: 'count', value });

const NOW = Date.parse('2026-11-07T14:20:00Z');

function widget(over: Partial<TileWidget> = {}): TileWidget {
  return {
    kind: 'sonarr',
    state: 'ok',
    asOf: '2026-11-07T14:19:30Z',
    fields: [count('upcoming', 'this week', 3), count('queued', 'in queue', 1), count('missing', 'missing', 12)],
    ...over,
  };
}

describe('formatFieldValue — §6.6', () => {
  it('groups digits below 10,000', () => {
    expect(formatFieldValue(count('movies', 'movies', 1204))).toBe('1,204');
    expect(formatFieldValue(count('playing', 'playing', 0))).toBe('0');
  });

  it('uses the compact form from 10,000 up, with a lower-case k', () => {
    expect(formatFieldValue(count('queries', 'queries', 48_213))).toBe('48k');
    expect(formatFieldValue(count('queries', 'queries', 1_250_000))).toBe('1.3M');
  });

  it('shows a percent as a whole number', () => {
    expect(formatFieldValue({ key: 'p', label: 'blocked', unit: 'percent', value: 12.4 })).toBe('12%');
  });

  it('shows a ratio as running/total', () => {
    expect(formatFieldValue({ key: 'vms', label: 'VMs', unit: 'ratio', value: 5, total: 7 })).toBe('5/7');
  });

  it('shows a ratio with no total as the bare number', () => {
    expect(formatFieldValue({ key: 'vms', label: 'VMs', unit: 'ratio', value: 5 })).toBe('5');
  });

  it('uses decimal byte units for rates', () => {
    const rate = (value: number): WidgetField => ({ key: 'down', label: '↓', unit: 'bytes_per_sec', value });
    expect(formatFieldValue(rate(512))).toBe('512 B/s');
    expect(formatFieldValue(rate(310_000))).toBe('310 kB/s');
    expect(formatFieldValue(rate(4_200_000))).toBe('4.2 MB/s');
    expect(formatFieldValue(rate(1_500_000_000))).toBe('1.5 GB/s');
  });
});

describe('fieldText — UX §9 label placement', () => {
  it('puts a plain label after the number', () => {
    expect(fieldText(count('upcoming', 'this week', 3))).toBe('3 this week');
  });

  it('puts name-like labels before the number', () => {
    expect(fieldText({ key: 'vms', label: 'VMs', unit: 'ratio', value: 5, total: 7 })).toBe('VMs 5/7');
    expect(fieldText({ key: 'down', label: '↓', unit: 'bytes_per_sec', value: 4_200_000 })).toBe('↓ 4.2 MB/s');
  });
});

describe('maxFields — AC-009', () => {
  it('List shows up to 3; Compact and Large up to 2', () => {
    expect(maxFields('list')).toBe(3);
    expect(maxFields('compact')).toBe(2);
    expect(maxFields('large')).toBe(2);
  });
});

describe('widgetLine — AC-007, AC-009, AC-012', () => {
  it('ok: the first fields for the density, joined for screen readers with commas', () => {
    const line = widgetLine(widget(), 'compact', NOW)!;
    expect(line.parts).toEqual(['3 this week', '1 in queue']);
    expect(line.stale).toBe(false);
    expect(line.description).toBe('3 this week, 1 in queue');
  });

  it('List gets the third field', () => {
    expect(widgetLine(widget(), 'list', NOW)!.parts).toEqual(['3 this week', '1 in queue', '12 missing']);
  });

  it('stale: keeps the values and says how old they are', () => {
    const line = widgetLine(widget({ state: 'stale', asOf: '2026-11-07T14:08:00Z' }), 'large', NOW)!;
    expect(line.stale).toBe(true);
    expect(line.parts).toEqual(['3 this week', '1 in queue']);
    expect(line.description).toBe('3 this week, 1 in queue. Updated 12 min ago');
  });

  it('stale with no asOf still reads as old, never as a fake time', () => {
    const line = widgetLine(widget({ state: 'stale', asOf: null }), 'large', NOW)!;
    expect(line.description).toBe('3 this week, 1 in queue. Updated a while ago');
  });

  it('stale under a minute old reads "1 min ago", never "0 min"', () => {
    const line = widgetLine(widget({ state: 'stale', asOf: '2026-11-07T14:19:59Z' }), 'large', NOW)!;
    expect(line.description).toMatch(/Updated 1 min ago$/);
  });

  it('loading and error: no line (the tile falls back to its status line)', () => {
    expect(widgetLine(widget({ state: 'loading', fields: [] }), 'compact', NOW)).toBeNull();
    expect(widgetLine(widget({ state: 'error', fields: [] }), 'compact', NOW)).toBeNull();
  });

  it('ok but nothing answered: no line', () => {
    expect(widgetLine(widget({ fields: [] }), 'compact', NOW)).toBeNull();
  });

  it('no widget: no line', () => {
    expect(widgetLine(undefined, 'compact', NOW)).toBeNull();
  });

  it('arrows are spoken as words in the description (UX §10)', () => {
    const line = widgetLine(
      widget({
        kind: 'qbittorrent',
        fields: [{ key: 'down', label: '↓', unit: 'bytes_per_sec', value: 4_200_000 }],
      }),
      'compact',
      NOW,
    )!;
    expect(line.parts).toEqual(['↓ 4.2 MB/s']);
    expect(line.description).toBe('down 4.2 MB/s');
  });
});
