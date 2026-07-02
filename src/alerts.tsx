// v17 §3 — Status Alert History. A session-persistent, in-memory ledger of the
// status transitions the v13 poller already detects, surfaced via a header bell
// with an unread badge. No backend, no localStorage: the log lives only for the
// current page session (AC-013) and resets on reload/logout.
//
// AlertHistoryProvider wraps Home (outside ServicesProvider, so the poller can
// call pushEvent via useAlertHistory). The hook is nullable on purpose — like
// useServicesContext — so AppHeader/the panel render in isolated tests without
// a provider.
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import type { ServiceStatus } from './api';

// One captured status-change event (§3 data model).
export interface AlertEvent {
  id: string;
  serviceId: string;
  serviceName: string;
  serviceUrl: string;
  prevStatus: ServiceStatus;
  newStatus: ServiceStatus;
  ts: number; // epoch-ms when the detecting poll completed
}

// AC-005 — the in-memory log holds at most this many events; the oldest is
// dropped when a newer one would overflow it.
export const MAX_EVENTS = 50;

export type AlertHistoryContextValue = {
  events: AlertEvent[]; // newest-first, ≤ MAX_EVENTS
  unreadCount: number; // events since the last clearBadge()
  pushEvent: (e: AlertEvent) => void;
  clearBadge: () => void;
};

const AlertHistoryContext = createContext<AlertHistoryContextValue | null>(null);

// §7 — the shared status→dot-class helper, reused by the panel's transition
// dots. Mirrors the tile/launcher colour system (AC-008) and adds the soft glow
// the spec calls for so a row reads identically to its tile.
const DOT: Record<ServiceStatus, string> = {
  UP: 'bg-emerald-500 shadow-[0_0_6px_#10b981]',
  DOWN: 'bg-red-500 shadow-[0_0_6px_#ef4444]',
  DEGRADED: 'bg-amber-400 shadow-[0_0_6px_#fbbf24]',
  UNKNOWN: 'bg-neutral-300 dark:bg-neutral-500',
  NOT_MONITORED: 'bg-transparent border-2 border-neutral-400 dark:border-neutral-500',
};

export function statusDotClass(status: ServiceStatus): string {
  return DOT[status] ?? DOT.UNKNOWN;
}

export function AlertHistoryProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Prepend newest-first and apply the ring-buffer cap; bump the unread counter
  // (uncapped — the badge display clamps to "99+", AC-002).
  const pushEvent = useCallback((e: AlertEvent) => {
    setEvents((prev) => [e, ...prev].slice(0, MAX_EVENTS));
    setUnreadCount((n) => n + 1);
  }, []);

  // AC-007 — opening the panel marks everything read; the list is untouched.
  const clearBadge = useCallback(() => setUnreadCount(0), []);

  return (
    <AlertHistoryContext.Provider value={{ events, unreadCount, pushEvent, clearBadge }}>
      {children}
    </AlertHistoryContext.Provider>
  );
}

export function useAlertHistory(): AlertHistoryContextValue | null {
  return useContext(AlertHistoryContext);
}
