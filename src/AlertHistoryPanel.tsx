// v17 §4 — the Alert History overlay. Reuses the launcher overlay/panel chrome
// (scrim + 14px panel shell) and the status-dot colour system. Lists captured
// status transitions newest-first with a from→to dot pair, a timestamp, and a
// new-tab Visit link. In-memory only; the event list is passed in from
// AlertHistoryProvider via Home.
import { useEffect, useRef } from 'react';
import type { AlertEvent } from './alerts';
import { statusDotClass } from './alerts';
import type { ServiceStatus } from './api';

// A relative "x ago" label for the row timestamp (AC-008c); the absolute
// HH:MM:SS rides along as the title so hover/long-press reveals the exact time.
function relativeTime(ts: number, now: number): string {
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.floor(h / 24)} d ago`;
}

function StatusDot({ status }: { status: ServiceStatus }) {
  return (
    <span
      data-testid="alert-dot"
      data-status={status}
      aria-hidden="true"
      className={`status-dot ${statusDotClass(status)}`}
    />
  );
}

function AlertRow({ event }: { event: AlertEvent }) {
  const now = Date.now();
  const abs = new Date(event.ts).toLocaleTimeString();
  return (
    <li data-testid="alert-row" className="alert-row">
      <div className="alert-row-main">
        <span className="alert-row-name">{event.serviceName}</span>
        <span className="alert-row-transition" aria-hidden="true">
          <StatusDot status={event.prevStatus} />
          <span className="alert-row-arrow">→</span>
          <StatusDot status={event.newStatus} />
        </span>
        {/* Status folded into accessible text — never colour alone. */}
        <span className="sr-only">
          {event.serviceName}: {event.prevStatus.toLowerCase()} to {event.newStatus.toLowerCase()}
        </span>
      </div>
      <div className="alert-row-meta">
        <time data-testid="alert-time" className="alert-row-time" dateTime={new Date(event.ts).toISOString()} title={abs}>
          {relativeTime(event.ts, now)}
        </time>
        <a
          className="alert-row-visit"
          href={event.serviceUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Visit ${event.serviceName}`}
        >
          Visit ↗
        </a>
      </div>
    </li>
  );
}

export default function AlertHistoryPanel({
  open,
  events,
  onClose,
}: {
  open: boolean;
  events: AlertEvent[];
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // AC-006/AC-009 — Escape closes from anywhere in the dialog; move focus into
  // the panel on open so keyboard users land inside and Tab cycles its controls.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      data-testid="alert-overlay"
      className="launcher-overlay"
      onClick={(e) => {
        // Close only on a scrim click, not a click bubbling out of the panel.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Alert History"
        className="launcher-panel alert-history-panel"
      >
        <header className="alert-history-header">
          <h2 className="alert-history-title">Alert History</h2>
          <button
            type="button"
            data-testid="alert-panel-close"
            aria-label="Close alert history"
            className="alert-history-close"
            onClick={onClose}
          >
            ✕
          </button>
        </header>

        {events.length === 0 ? (
          <p data-testid="alert-empty" className="alert-history-empty">
            No alerts yet. Status changes will appear here while this page is open.
          </p>
        ) : (
          <ul role="list" className="alert-history-list">
            {events.map((e) => (
              <AlertRow key={e.id} event={e} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
