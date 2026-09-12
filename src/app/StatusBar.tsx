// v15 — Health summary panel (design spec §4.2). Rebuilds v14's count-strip
// StatusBar into a glass verdict panel: a status LED + a loud headline
// ("All systems operational" / "N services need attention" / "Checking…" /
// "No services yet") + a service·group·monitored sub-line on the left, and
// count chips + a per-service meter + a freshness legend on the right.
//
// It still derives purely from the already-loaded ServicesContext (no new
// fetch). Two v14 features are preserved verbatim: the five status states
// (UP/DOWN/DEGRADED/UNKNOWN/NOT_MONITORED) feed the aggregate, and the count
// chips remain quick-peek buttons — clicking one opens a popover listing that
// bucket's services as links (Escape / outside-click / re-click dismiss).

import { useEffect, useRef, useState } from 'react';
import { safeHref } from '../lib/safeUrl';
import { useServicesContext } from '../services';
import type { Service, ServiceStatus } from '../api';
import { CONTENT_WIDTH } from '../lib/layout';

// Which chip's popover is open (if any).
type PeekStatus = 'UP' | 'DOWN_DEGRADED' | 'NOT_MONITORED';

// Status-dot color coding in the popover, matching the tiles (Catalog.tsx):
// UP green, DOWN/DEGRADED red, NOT_MONITORED dashed neutral ring.
const peekDot: Record<ServiceStatus, string> = {
  UP: 'bg-emerald-500',
  DOWN: 'bg-red-500',
  DEGRADED: 'bg-red-500',
  UNKNOWN: 'bg-neutral-300',
  NOT_MONITORED: 'bg-transparent border-2 border-dashed border-neutral-400 dark:border-neutral-500',
};

const PEEK_META: Record<PeekStatus, { testId: string; label: string; match: (s: Service) => boolean }> = {
  UP: { testId: 'status-bar-up', label: 'UP', match: (s) => s.status === 'UP' },
  DOWN_DEGRADED: {
    testId: 'status-bar-down',
    label: 'DOWN',
    match: (s) => s.status === 'DOWN' || s.status === 'DEGRADED',
  },
  NOT_MONITORED: {
    testId: 'status-bar-not-monitored',
    label: 'not monitored',
    match: (s) => s.status === 'NOT_MONITORED',
  },
};

// Meter-tick color class per status (accent-independent, semantic only). Three
// colors only — the meter is a distribution view (like the chips + v16 popover),
// so DEGRADED reads red, not amber (SPEC-v24 §8.B; amber is reserved for the LED
// and the per-tile dot). This keeps the meter to exactly its three bands.
const tickClass: Record<ServiceStatus, string> = {
  UP: 'health-tick-up',
  DOWN: 'health-tick-down',
  DEGRADED: 'health-tick-down',
  UNKNOWN: 'health-tick-idle',
  NOT_MONITORED: 'health-tick-idle',
};

// Status → meter band (SPEC-v24 §3.2): 0 GREEN (UP), 1 GRAY (NOT_MONITORED +
// UNKNOWN — unobservable, not known-down), 2 RED (DOWN + DEGRADED). Ticks are
// grouped into these contiguous bands, healthy-first, so the distribution reads
// at a glance; within a band, layout order is preserved (§3.4).
const statusBand: Record<ServiceStatus, number> = {
  UP: 0,
  NOT_MONITORED: 1,
  UNKNOWN: 1,
  DOWN: 2,
  DEGRADED: 2,
};

// §4.2 stale thresholds (§5.3): freshness label → amber past 5 min, red past 15.
function staleness(ageMs: number): 'fresh' | 'amber' | 'red' {
  if (ageMs > 15 * 60 * 1000) return 'red';
  if (ageMs > 5 * 60 * 1000) return 'amber';
  return 'fresh';
}

function formatAgo(ageMs: number): string {
  const s = Math.max(0, Math.floor(ageMs / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `updated ${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `updated ${m}m ago`;
  return `updated ${Math.floor(m / 60)}h ago`;
}

export default function StatusBar() {
  const ctx = useServicesContext();
  const [peek, setPeek] = useState<PeekStatus | null>(null);
  // SPEC-v24 §12.2 — "Not now" on the NOT MONITORED state. Deliberately component
  // state and nothing more: the dismiss is session-scoped (OQ-4b), so it holds
  // while the panel stays mounted and is gone on the next load. Persisting it
  // would need both a storage decision and a way to undo it, and would let a
  // stray click permanently hide the fact that nothing is being checked.
  const [monitoringNoticeDismissed, setMonitoringNoticeDismissed] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<Partial<Record<PeekStatus, HTMLButtonElement | null>>>({});

  // Freshness self-tick — recompute the "updated Xs ago" label each second so it
  // counts up (and crosses the stale thresholds) without a new fetch.
  const lastUpdatedAt = ctx?.lastUpdatedAt ?? null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (lastUpdatedAt == null) return;
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [lastUpdatedAt]);

  // Outside-click dismiss for the quick-peek popover (v14 behavior preserved).
  useEffect(() => {
    if (!peek) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const onTrigger = Object.values(triggerRefs.current).some((b) => b?.contains(target));
      if (!onTrigger && !popoverRef.current?.contains(target)) setPeek(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [peek]);

  // Escape dismiss — closes and returns focus to the triggering chip.
  useEffect(() => {
    if (!peek) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const trigger = triggerRefs.current[peek];
        setPeek(null);
        trigger?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [peek]);

  const items = ctx?.items ?? null;
  const loading = items === null;
  const empty = !loading && items.length === 0;

  // Aggregate derivation (§4.2). idle (NOT_MONITORED) and UNKNOWN never promote
  // the LED — only DOWN → red, else DEGRADED → amber, else operational green.
  const up = loading || empty ? 0 : items.filter(PEEK_META.UP.match).length;
  const down = loading || empty ? 0 : items.filter((s) => s.status === 'DOWN').length;
  const degraded = loading || empty ? 0 : items.filter((s) => s.status === 'DEGRADED').length;
  const notMonitored = loading || empty ? 0 : items.filter(PEEK_META.NOT_MONITORED.match).length;
  const total = loading || empty ? 0 : items.length;
  const monitored = loading || empty ? 0 : items.filter((s) => s.status !== 'NOT_MONITORED').length;
  const groups = loading || empty ? 0 : new Set((items ?? []).map((s) => s.categoryName ?? '·uncategorized')).size;

  const attention = down + degraded;

  // SPEC-v24 §12.2 — the fleet is present but nothing is being checked. Trigger is
  // the monitored count reaching zero (OQ-10), not "some service is unmonitored":
  // one monitored service means the panel still has evidence to report on.
  //
  // Note this can only be true when `attention` is 0 — DOWN and DEGRADED are
  // monitored statuses, so any attention at all implies monitored > 0. The
  // ordering below is still explicit so the precedence does not rest on that.
  const fleetUnmonitored = !loading && !empty && monitored === 0;
  const showMonitoringNotice = fleetUnmonitored && !monitoringNoticeDismissed;

  const variant = loading
    ? 'loading'
    : attention > 0
      ? 'attention'
      : showMonitoringNotice
        ? 'not-monitored'
        : 'operational';
  const severity = down > 0 ? 'down' : degraded > 0 ? 'degraded' : 'none';

  let headline: string;
  let subline: string;
  if (loading) {
    headline = 'Checking services…';
    subline = 'Reading the latest status from every service.';
  } else if (empty) {
    headline = 'No services yet';
    subline = 'Add your first service to get started';
  } else if (attention > 0) {
    headline = `${attention} service${attention === 1 ? '' : 's'} need${attention === 1 ? 's' : ''} attention`;
    subline = `${total} service${total === 1 ? '' : 's'} across ${groups} group${groups === 1 ? '' : 's'} · ${monitored} monitored`;
  } else if (showMonitoringNotice) {
    // The panel has no evidence, so it states that instead of a verdict. The
    // sub-line is careful to say what still works: the tiles are not broken,
    // they simply cannot report.
    headline = 'Status is not being checked';
    subline = `${total} service${total === 1 ? '' : 's'}, none of them monitored · tiles will launch, but they cannot report`;
  } else {
    headline = 'All systems operational';
    subline = `${total} service${total === 1 ? '' : 's'} across ${groups} group${groups === 1 ? '' : 's'} · ${monitored} monitored`;
  }

  const showMetrics = !loading && !empty;

  // Quick-peek chips (v14). Down chip carries down+degraded; its number takes the
  // severity color when >0 (AC-V15-017). Rendered only when their count > 0.
  const chips: { peekId: PeekStatus; count: number; label: string; sev: 'up' | 'down' | 'degraded' | 'idle' }[] = [];
  if (up > 0) chips.push({ peekId: 'UP', count: up, label: `${up} UP`, sev: 'up' });
  if (attention > 0)
    chips.push({
      peekId: 'DOWN_DEGRADED',
      count: attention,
      label: `${attention} DOWN`,
      sev: down > 0 ? 'down' : 'degraded',
    });
  if (notMonitored > 0)
    chips.push({ peekId: 'NOT_MONITORED', count: notMonitored, label: `${notMonitored} not monitored`, sev: 'idle' });

  // If a poll empties the open bucket, drop its stale popover.
  const openSegment = peek ? chips.find((s) => s.peekId === peek) : undefined;
  const peekServices = openSegment
    ? (items ?? []).filter(PEEK_META[peek!].match).slice().sort((a, b) => a.name.localeCompare(b.name))
    : [];

  const ageMs = lastUpdatedAt == null ? null : now - lastUpdatedAt;

  return (
    <div data-testid="status-bar" role="status" aria-label="Service status summary" className="relative pt-3">
      {/* Content stays constrained to the shared width so the panel's left edge
          aligns with the header wordmark and the grid below (#196 intent kept). */}
      <div data-testid="status-bar-content" className={CONTENT_WIDTH}>
        <div className="health glass" data-variant={variant} data-severity={severity}>
          <div className="health-verdict">
            <span
              data-testid="health-led"
              className="health-led"
              data-variant={variant}
              data-severity={severity}
              aria-hidden="true"
            />
            <h2 data-testid="health-headline" className="health-headline">
              {headline}
            </h2>
            <p data-testid="health-subline" className="health-subline">
              {subline}
            </p>
            {showMonitoringNotice && (
              <div className="health-notice-actions">
                {/* SPEC-v24 §12.2, AC-V24-NM3a. The "Connect a status source"
                    primary CTA (NM3b) is deliberately absent: OQ-4 resolved its
                    target to "link to documentation", but no documentation page
                    exists yet and a dead link is worse than no link. Add it here
                    once there is a real URL to point at. */}
                <button
                  type="button"
                  data-testid="health-dismiss"
                  className="health-notice-dismiss"
                  onClick={() => setMonitoringNoticeDismissed(true)}
                >
                  Not now
                </button>
              </div>
            )}
          </div>

          {showMetrics && (
            <div className="health-metrics">
              <div className="health-chips">
                {chips.map((seg) => (
                  <button
                    key={seg.peekId}
                    type="button"
                    data-testid={PEEK_META[seg.peekId].testId}
                    ref={(el) => {
                      triggerRefs.current[seg.peekId] = el;
                    }}
                    aria-haspopup="dialog"
                    aria-expanded={peek === seg.peekId}
                    aria-label={`Show ${seg.count} service${seg.count === 1 ? '' : 's'} that are ${PEEK_META[seg.peekId].label}`}
                    onClick={() => setPeek((cur) => (cur === seg.peekId ? null : seg.peekId))}
                    className="health-chip"
                    data-sev={seg.sev}
                  >
                    <span className="health-chip-n">{seg.count}</span>
                    <span className="health-chip-label">{PEEK_META[seg.peekId].label}</span>
                  </button>
                ))}
              </div>

              {/* One tick per service, grouped into three status bands
                  (GREEN → GRAY → RED, healthy-first; SPEC-v24). Ticks keep their
                  layout order within a band — sort by band, then layout index.
                  Decorative — the chips carry the accessible numbers, so the
                  meter is aria-hidden. */}
              {/* AC-V24-NM2 — every tick would be gray in the not-monitored
                  state, so the meter is omitted rather than drawn empty. The
                  chips stay; only the meter goes. */}
              {!showMonitoringNotice && (
                <div data-testid="health-meter" className="health-meter" aria-hidden="true">
                  {(items ?? [])
                    .map((s, i) => ({ s, i }))
                    .sort((a, b) => statusBand[a.s.status] - statusBand[b.s.status] || a.i - b.i)
                    .map(({ s }) => (
                      <span
                        key={s.id}
                        data-tick
                        data-status={s.status}
                        className={`health-tick ${tickClass[s.status] ?? 'health-tick-idle'}`}
                      />
                    ))}
                </div>
              )}

              <div className="health-legend">
                <span className="health-legend-item">
                  <span className="health-legend-sw health-tick-up" /> Online
                </span>
                <span className="health-legend-item">
                  <span className="health-legend-sw health-tick-down" /> Offline
                </span>
                <span className="health-legend-item">
                  <span className="health-legend-sw health-tick-idle" /> Not monitored
                </span>
                {ageMs != null && (
                  <span
                    data-testid="health-updated"
                    className="health-updated"
                    data-stale={staleness(ageMs)}
                  >
                    {formatAgo(ageMs)}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {openSegment && <StatusPeekPopover services={peekServices} popoverRef={popoverRef} />}
    </div>
  );
}

// Quick-peek popover (v14, unchanged): a positioned overlay listing the bucket's
// services as new-tab links. z-30 sits above tiles (z-10), below the launcher.
function StatusPeekPopover({
  services,
  popoverRef,
}: {
  services: Service[];
  popoverRef: React.RefObject<HTMLDivElement>;
}) {
  return (
    <div
      ref={popoverRef}
      data-testid="status-peek-popover"
      role="dialog"
      aria-label="Services in this status"
      className="absolute left-1/2 top-full z-30 mt-1 -translate-x-1/2 w-72 max-w-[calc(100vw-1rem)]
                 overflow-y-auto max-h-[clamp(180px,40vh,320px)]
                 rounded-xl border border-neutral-200 bg-white text-left shadow-lg
                 dark:border-neutral-700 dark:bg-neutral-900"
    >
      {services.map((s) => (
        <a
          key={s.id}
          href={safeHref(s.url)}
          target="_blank"
          rel="noreferrer noopener"
          className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-800 hover:bg-neutral-50 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${peekDot[s.status] ?? peekDot.UNKNOWN}`} />
          <span className="truncate">{s.name}</span>
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="ml-auto h-3 w-3 shrink-0 text-neutral-400"
          >
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </a>
      ))}
    </div>
  );
}
