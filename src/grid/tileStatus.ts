import type { Service } from '../api';

// SPEC-tile-density §status-line — the compact/list tile's second line ("Online ·
// 41 ms", "Slow · 1.9 s", "Offline · 6 min", "Not monitored").
//
// THE ONE REAL CONSTRAINT (OQ-6): GET /api/services carries no response time today
// (Service.responseTimeMs is optional and currently absent). So the line DEGRADES
// GRACEFULLY — it renders the state word always and appends the latency ONLY when
// the field is present. It never fabricates a value and never shows a placeholder
// like "-- ms". When the API later starts returning responseTimeMs, the latency
// simply appears with no other frontend change (AC-DEN-009/010).

// formatLatency — sub-second as "N ms"; ≥1s as one-decimal seconds ("1.9 s"),
// matching the v16 artboard (41 ms, 1.9 s, 2.4 s).
export function formatLatency(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

// offlineMinutes — whole minutes since the newest SUCCESSFUL uptime check, or null
// when there is nothing successful to measure from. Derivable from existing data
// today (OQ-6 note): no backend field is needed for the outage duration.
// uptimeChecks is oldest-first, so scan from the end for the newest success.
function offlineMinutes(service: Service, nowMs: number): number | null {
  const checks = service.uptimeChecks;
  if (!checks || checks.length === 0) return null;
  for (let i = checks.length - 1; i >= 0; i--) {
    if (checks[i].success) {
      const t = Date.parse(checks[i].timestamp);
      if (Number.isNaN(t)) return null;
      return Math.max(0, Math.floor((nowMs - t) / 60_000));
    }
  }
  return null;
}

export function tileStatusLine(service: Service, nowMs: number): string {
  const ms = service.responseTimeMs;
  const latency = typeof ms === 'number' && Number.isFinite(ms) ? formatLatency(ms) : null;
  switch (service.status) {
    case 'UP':
      return latency ? `Online · ${latency}` : 'Online';
    case 'DEGRADED':
      // OQ-8 — "Slow" is the tile status-line label ONLY; the pip's aria-label and
      // title keep "DEGRADED" (assistive output is unchanged).
      return latency ? `Slow · ${latency}` : 'Slow';
    case 'DOWN': {
      const mins = offlineMinutes(service, nowMs);
      return mins !== null && mins >= 1 ? `Offline · ${mins} min` : 'Offline';
    }
    case 'NOT_MONITORED':
      return 'Not monitored';
    default:
      return 'Unknown';
  }
}
