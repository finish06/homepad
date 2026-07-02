// v14 — Dashboard Status Summary Bar. A compact strip below the sticky header
// summarizing fleet health from the already-loaded ServicesContext array (no new
// fetch). UNKNOWN is intentionally excluded — it is a monitoring-infra signal,
// not a per-service health reading; the tile's gray dot already surfaces it.
//
// v16 — Status Bar Quick-Peek. Each non-empty chip is now a <button>; clicking
// it opens a popover listing the services in that bucket, each a direct link to
// its url. Dismiss on Escape, outside-click, or re-click. Frontend-only — the
// list is filtered from the same ctx.items the bar already reads.

import { useEffect, useRef, useState } from 'react';
import { useServicesContext } from './services';
import type { Service, ServiceStatus } from './api';
import { CONTENT_WIDTH } from './layout';

// Which chip's popover is open (if any).
type PeekStatus = 'UP' | 'DOWN_DEGRADED' | 'NOT_MONITORED';

// Status-dot color coding, matching the tiles (Catalog.tsx statusDot): UP green,
// DOWN/DEGRADED red, NOT_MONITORED dashed neutral ring (AC-004/AC-011).
const peekDot: Record<ServiceStatus, string> = {
  UP: 'bg-emerald-500',
  DOWN: 'bg-red-500',
  DEGRADED: 'bg-red-500',
  UNKNOWN: 'bg-neutral-300',
  NOT_MONITORED: 'bg-transparent border-2 border-dashed border-neutral-400 dark:border-neutral-500',
};

// Each peek bucket: its chip testid, the human label used in the aria-label, and
// the predicate selecting its members from ctx.items.
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

export default function StatusBar() {
  const ctx = useServicesContext();
  const [peek, setPeek] = useState<PeekStatus | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<Partial<Record<PeekStatus, HTMLButtonElement | null>>>({});

  // Outside-click dismiss — same pattern as UserMenu. Attached only while open.
  useEffect(() => {
    if (!peek) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      // Clicks on a chip button are owned by its onClick toggle — closing here
      // too would race it (mousedown closes, then onClick reopens). Ignore them.
      const onTrigger = Object.values(triggerRefs.current).some((b) => b?.contains(target));
      if (!onTrigger && !popoverRef.current?.contains(target)) setPeek(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [peek]);

  // Escape dismiss — closes and returns focus to the triggering chip (AC-009).
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

  if (!ctx?.items) return null;
  const items = ctx.items;

  const up = items.filter(PEEK_META.UP.match).length;
  const down = items.filter(PEEK_META.DOWN_DEGRADED.match).length;
  const notMonitored = items.filter(PEEK_META.NOT_MONITORED.match).length;

  const segments: { peekId: PeekStatus; count: number; label: string; className: string }[] = [];
  if (up > 0)
    segments.push({ peekId: 'UP', count: up, label: `${up} UP`, className: 'text-emerald-600 dark:text-emerald-400' });
  if (down > 0)
    segments.push({ peekId: 'DOWN_DEGRADED', count: down, label: `${down} DOWN`, className: 'text-red-600 dark:text-red-500' });
  if (notMonitored > 0)
    segments.push({
      peekId: 'NOT_MONITORED',
      count: notMonitored,
      label: `${notMonitored} not monitored`,
      className: 'text-neutral-500 dark:text-neutral-400',
    });

  if (segments.length === 0) return null;

  // v16: live-refresh coherence (TC-007). If a poll empties the open bucket while
  // its popover is up, the chip disappears — render no stale popover for it.
  const openSegment = peek ? segments.find((s) => s.peekId === peek) : undefined;
  const peekServices = openSegment
    ? items.filter(PEEK_META[peek!].match).slice().sort((a, b) => a.name.localeCompare(b.name))
    : [];

  return (
    <div
      data-testid="status-bar"
      role="status"
      aria-label="Service status summary"
      className="relative border-b border-neutral-100 bg-white/50 py-1.5 text-left text-xs font-medium tracking-wide dark:border-neutral-800/50 dark:bg-neutral-900/50"
    >
      {/* #196 AC-008/AC-009/AC-010: the stripe stays full-bleed; only this inner
          content shares the App/AppHeader content width so its left edge aligns
          with the header wordmark and the grid. */}
      <div data-testid="status-bar-content" className={CONTENT_WIDTH}>
        {segments.map((seg, i) => (
          <span key={seg.peekId}>
            {i > 0 && <span className="mx-2 text-neutral-300 dark:text-neutral-600">·</span>}
            <button
              type="button"
              data-testid={PEEK_META[seg.peekId].testId}
              ref={(el) => {
                triggerRefs.current[seg.peekId] = el;
              }}
              aria-haspopup="dialog"
              aria-expanded={peek === seg.peekId}
              aria-label={`Show ${seg.count} service${seg.count === 1 ? '' : 's'} that are ${PEEK_META[seg.peekId].label}`}
              onClick={() => setPeek((cur) => (cur === seg.peekId ? null : seg.peekId))}
              className={`cursor-pointer rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${seg.className}`}
            >
              {seg.label}
            </button>
          </span>
        ))}
      </div>

      {/* Popover stays a child of the full-bleed relative wrapper so its
          left-1/2 anchor centers on the viewport, not the constrained box. */}
      {openSegment && <StatusPeekPopover services={peekServices} popoverRef={popoverRef} />}
    </div>
  );
}

// Co-located popover: a positioned overlay below the bar listing the bucket's
// services as new-tab links. z-30 sits above tiles (z-10) and below the command
// launcher (z-60). Scroll-contained so a long list never covers the page.
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
          href={s.url}
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
