// SPEC-tile-density §status-line — the compact/list tile's second line. These are
// the RED tests for the ONE real constraint (OQ-6): GET /api/services carries no
// response time today, so the line must DEGRADE GRACEFULLY — the state word always
// renders, the latency is appended only when the field is present, and no
// fabricated placeholder ("-- ms") is ever shown (AC-DEN-009/010). Pure function,
// clock injected, so every case is deterministic.
import { describe, expect, it } from 'vitest';
import type { Service } from '../api';
import { formatLatency, tileStatusLine } from './tileStatus';

// A minimal service; `over` overrides status / responseTimeMs / uptimeChecks.
function svc(over: Partial<Service>): Service {
  return {
    id: 's',
    slug: 's',
    name: 'Grafana',
    description: '',
    url: 'https://x.test',
    icon: '',
    status: 'UP',
    favorite: false,
    iconLight: false,
    iconDark: false,
    ...over,
  };
}

const NOW = Date.parse('2026-09-12T12:00:00Z');

describe('SPEC-tile-density — tileStatusLine', () => {
  it('AC-DEN-009 — UP with no response time renders the state word ALONE (no placeholder)', () => {
    const line = tileStatusLine(svc({ status: 'UP' }), NOW);
    expect(line).toBe('Online');
    // The forbidden fabrications never appear.
    expect(line).not.toContain('ms');
    expect(line).not.toContain('--');
  });

  it('AC-DEN-010 — UP with responseTimeMs present appends the latency, no other change', () => {
    expect(tileStatusLine(svc({ status: 'UP', responseTimeMs: 41 }), NOW)).toBe('Online · 41 ms');
    expect(tileStatusLine(svc({ status: 'UP', responseTimeMs: 63 }), NOW)).toBe('Online · 63 ms');
  });

  it('AC-DEN-011 — DEGRADED reads "Slow" on the line; latency appends when present', () => {
    expect(tileStatusLine(svc({ status: 'DEGRADED' }), NOW)).toBe('Slow');
    expect(tileStatusLine(svc({ status: 'DEGRADED', responseTimeMs: 1900 }), NOW)).toBe('Slow · 1.9 s');
    expect(tileStatusLine(svc({ status: 'DEGRADED', responseTimeMs: 2400 }), NOW)).toBe('Slow · 2.4 s');
  });

  it('AC-DEN-012 — DOWN reads "Offline" and derives the outage duration from uptimeChecks', () => {
    // Newest successful check was 6 minutes before NOW → "Offline · 6 min".
    const sixMinAgo = new Date(NOW - 6 * 60_000).toISOString();
    const line = tileStatusLine(
      svc({ status: 'DOWN', uptimeChecks: [{ success: true, timestamp: sixMinAgo }, { success: false, timestamp: new Date(NOW).toISOString() }] }),
      NOW,
    );
    expect(line).toBe('Offline · 6 min');
  });

  it('AC-DEN-012 — DOWN with no successful check to measure from reads "Offline" alone', () => {
    expect(tileStatusLine(svc({ status: 'DOWN' }), NOW)).toBe('Offline');
    expect(
      tileStatusLine(svc({ status: 'DOWN', uptimeChecks: [{ success: false, timestamp: new Date(NOW).toISOString() }] }), NOW),
    ).toBe('Offline');
  });

  it('AC-DEN-012 — NOT_MONITORED reads "Not monitored" and never shows a latency', () => {
    expect(tileStatusLine(svc({ status: 'NOT_MONITORED', responseTimeMs: 41 }), NOW)).toBe('Not monitored');
  });

  it('UNKNOWN degrades to the neutral "Unknown" word', () => {
    expect(tileStatusLine(svc({ status: 'UNKNOWN' }), NOW)).toBe('Unknown');
  });

  it('formatLatency renders sub-second as ms and ≥1s as one-decimal seconds', () => {
    expect(formatLatency(41)).toBe('41 ms');
    expect(formatLatency(999)).toBe('999 ms');
    expect(formatLatency(1000)).toBe('1.0 s');
    expect(formatLatency(1900)).toBe('1.9 s');
    expect(formatLatency(2449)).toBe('2.4 s');
  });
});
