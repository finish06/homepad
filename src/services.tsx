// v8 §3/A12 — a tiny shared owner for the catalog's Service[] so the launcher
// filters the SAME already-loaded array the grid renders, with NO second fetch.
// The provider performs the one /api/services load; Catalog reads from it when
// present (falling back to its own fetch when rendered without a provider, e.g.
// isolated tests — the same optional-context shape as useResolvedTheme).
//
// v13: the provider also keeps that array LIVE — it re-polls /api/services every
// ~60s while the tab is visible and merges only the changed status fields back in
// (preserving tile identity/order), exposing `lastUpdatedAt` so the header can
// show data freshness.

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { servicesWithStatus, type Service, type ServiceStatus } from './api';

// How often to re-poll while visible (AC-001, ±10s tolerance).
const POLL_MS = 60_000;

// cap5 — a meaningful status transition between two polls, worth a toast alert.
export type StatusChange = {
  id: string;
  name: string;
  from: ServiceStatus;
  to: ServiceStatus;
};

// cap5 — the only states worth toasting. UNKNOWN/NOT_MONITORED are monitoring
// infra, not real flips, so transitions touching them are dropped (AC-004, AC-005).
const TOASTABLE: ReadonlySet<ServiceStatus> = new Set(['UP', 'DOWN', 'DEGRADED']);

export type ServicesContextValue = {
  items: Service[] | null;
  setItems: React.Dispatch<React.SetStateAction<Service[] | null>>;
  // v13: epoch-ms of the last successful load/refresh, or null before the first
  // load resolves. Drives the header's "Updated X ago" indicator.
  lastUpdatedAt: number | null;
  // cap5: status flips detected by the most-recent poll. Empty on initial load
  // (baseline only, AC-003); set whenever a non-initial poll detects changes.
  recentChanges: StatusChange[];
};

const ServicesContext = createContext<ServicesContextValue | null>(null);

// mergeStatuses folds a freshly-polled list into the current one WITHOUT replacing
// the array: it updates only `status` (and `uptimeChecks`) on each existing tile,
// keyed by id, so tile identity and the user's personal order are preserved and
// only the tiles that actually changed get a new object reference (so only those
// re-render — AC-009). Returns the SAME array reference when nothing changed, so a
// no-op poll triggers no render at all. Tiles absent from `fresh` are left as-is.
//
// cap5: it also collects the toastable status flips it sees (UP/DOWN/DEGRADED
// only) into `changes`, returning both so the provider can fire alerts.
export function mergeStatuses(
  current: Service[],
  fresh: Service[],
): { next: Service[]; changes: StatusChange[] } {
  const byId = new Map(fresh.map((s) => [s.id, s]));
  const changes: StatusChange[] = [];
  let changed = false;
  const next = current.map((s) => {
    const f = byId.get(s.id);
    if (!f) return s;
    if (f.status === s.status && sameChecks(s.uptimeChecks, f.uptimeChecks)) return s;
    changed = true;
    // Only surface transitions between toastable states (AC-004, AC-005).
    if (s.status !== f.status && TOASTABLE.has(s.status) && TOASTABLE.has(f.status)) {
      changes.push({ id: s.id, name: s.name, from: s.status, to: f.status });
    }
    return { ...s, status: f.status, uptimeChecks: f.uptimeChecks };
  });
  return { next: changed ? next : current, changes };
}

function sameChecks(a?: Service['uptimeChecks'], b?: Service['uptimeChecks']): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((c, i) => c.success === b[i].success && c.timestamp === b[i].timestamp);
}

export function ServicesProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Service[] | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  // cap5 — flips from the most-recent poll; empty until a non-initial poll sees one.
  const [recentChanges, setRecentChanges] = useState<StatusChange[]>([]);
  // Set once a refresh returns 401 (session expired) — polling then stops for good
  // (AC-011). A ref so flipping it doesn't trigger a render and the running poll
  // reads the latest value.
  const stopped = useRef(false);
  // cap5 — mirror the latest committed items so a poll merges against the array
  // the grid actually shows (incl. user reorders), not a stale closure capture.
  const itemsRef = useRef<Service[] | null>(null);
  itemsRef.current = items;

  useEffect(() => {
    let cancelled = false;

    async function load(initial: boolean) {
      if (stopped.current) return;
      // While hidden, polling is suspended (AC-002); the initial load still runs.
      if (!initial && document.visibilityState === 'hidden') return;
      const { status, services: fresh } = await servicesWithStatus();
      if (cancelled) return;
      if (status === 401) {
        stopped.current = true; // AC-011 — stop silently
        return;
      }
      // AC-008 — a transient failure is ignored: keep the last good data and the
      // existing freshness counter (don't bump lastUpdatedAt). The initial load
      // is the one exception — it has nothing to keep, so an empty list stands.
      if (status !== 200 && !initial) return;
      const cur = itemsRef.current;
      // Initial load (or nothing to merge against) just sets the baseline — no
      // recentChanges, so no toasts fire on first paint (AC-003).
      if (initial || !cur) {
        setItems(fresh);
        setLastUpdatedAt(Date.now());
        return;
      }
      const { next, changes } = mergeStatuses(cur, fresh);
      setItems(next);
      setLastUpdatedAt(Date.now());
      if (changes.length) setRecentChanges(changes);
    }

    void load(true);
    const id = setInterval(() => void load(false), POLL_MS);

    // AC-002 — on returning to the tab, re-poll immediately (well within 5s)
    // rather than waiting for the next interval tick.
    function onVisibility() {
      if (document.visibilityState === 'visible') void load(false);
    }
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <ServicesContext.Provider value={{ items, setItems, lastUpdatedAt, recentChanges }}>
      {children}
    </ServicesContext.Provider>
  );
}

// Nullable on purpose: Catalog and the launcher both call it and branch on
// whether a provider is present.
export function useServicesContext(): ServicesContextValue | null {
  return useContext(ServicesContext);
}
