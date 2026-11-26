import { describe, expect, it } from 'vitest';
import {
  BAND_CLASS,
  bandCounts,
  bandOf,
  bandWidths,
  countPhrase,
  isDown,
  statusBand,
  statusLine,
  tickClass,
} from './statusBands';

// SPEC-group-header-collapse AC-002, AC-003, AC-004 — the one band module the
// health meter and the box header bar share.

describe('band mapping (AC-003)', () => {
  it('maps all five statuses to the meter bands: green, gray, red', () => {
    expect(statusBand).toEqual({ UP: 0, NOT_MONITORED: 1, UNKNOWN: 1, DOWN: 2, DEGRADED: 2 });
    expect(tickClass).toEqual({
      UP: 'health-tick-up',
      DOWN: 'health-tick-down',
      DEGRADED: 'health-tick-down',
      UNKNOWN: 'health-tick-idle',
      NOT_MONITORED: 'health-tick-idle',
    });
    expect(BAND_CLASS).toEqual(['health-tick-up', 'health-tick-idle', 'health-tick-down']);
  });

  it('DEGRADED is red and UNKNOWN is gray; an unknown status string is gray', () => {
    expect(bandOf('DEGRADED')).toBe(2);
    expect(bandOf('UNKNOWN')).toBe(1);
    expect(bandOf('SOMETHING_NEW')).toBe(1);
    expect(bandOf('constructor')).toBe(1);
    expect(isDown('constructor')).toBe(false);
  });

  it('counts DOWN and DEGRADED as down, nothing else', () => {
    expect(['UP', 'DOWN', 'DEGRADED', 'UNKNOWN', 'NOT_MONITORED'].filter(isDown)).toEqual(['DOWN', 'DEGRADED']);
  });

  it('counts apps per band', () => {
    expect(bandCounts(['UP', 'UP', 'UNKNOWN', 'NOT_MONITORED', 'DOWN', 'DEGRADED'])).toEqual([2, 2, 2]);
    expect(bandCounts([])).toEqual([0, 0, 0]);
  });
});

describe('bar widths (AC-002)', () => {
  const sum = (w: number[]) => w.reduce((a, b) => a + b, 0);

  it('98 up, 1 gray, 1 down: about 55, 4.5, 4.5 and exactly 64 in all', () => {
    const w = bandWidths([98, 1, 1]);
    expect(w[0]).toBeCloseTo(4 + 52 * 0.98, 6);
    expect(w[1]).toBeCloseTo(4.52, 6);
    expect(w[2]).toBeCloseTo(4.52, 6);
    expect(sum(w)).toBeCloseTo(64, 9);
  });

  it('every non-empty band gets at least 4px; empty bands get nothing', () => {
    for (const c of [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [500, 0, 1],
      [3, 2, 0],
      [1, 1, 1],
    ] as [number, number, number][]) {
      const w = bandWidths(c);
      c.forEach((n, i) => (n > 0 ? expect(w[i]).toBeGreaterThanOrEqual(4) : expect(w[i]).toBe(0)));
      expect(sum(w)).toBeCloseTo(64, 9);
    }
  });

  it('an all-gray box is one 64px gray band (OQ-4)', () => {
    expect(bandWidths([0, 5, 0])).toEqual([0, 64, 0]);
  });

  it('an empty box has no bar', () => {
    expect(bandWidths([0, 0, 0])).toEqual([0, 0, 0]);
  });
});

describe('status line and count phrase (AC-001, AC-004)', () => {
  it('reads each status in its own word, in order, leaving out zeros', () => {
    expect(statusLine(['NOT_MONITORED', 'UNKNOWN', 'DEGRADED', 'DOWN', 'UP', 'UP'])).toBe(
      '2 up, 1 down, 1 degraded, 1 unknown, 1 not monitored',
    );
    expect(statusLine(['UP', 'DEGRADED'])).toBe('1 up, 1 degraded');
    expect(statusLine(['UNKNOWN'])).toBe('1 unknown');
    expect(statusLine([])).toBe('');
  });

  it('reads a status it does not know as unknown', () => {
    expect(statusLine(['SOMETHING_NEW', 'UNKNOWN'])).toBe('2 unknown');
  });

  it('says "1 app" for one and "N apps" otherwise', () => {
    expect(countPhrase(0)).toBe('0 apps');
    expect(countPhrase(1)).toBe('1 app');
    expect(countPhrase(6)).toBe('6 apps');
  });
});
