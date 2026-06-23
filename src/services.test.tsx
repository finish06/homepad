// cap5 — mergeStatuses now also surfaces the meaningful status transitions
// (StatusChange[]) that drive toast alerts. These cover the diff logic only:
// toastable states are UP/DOWN/DEGRADED; UNKNOWN and NOT_MONITORED are excluded
// (AC-004, AC-005). Behaviour-level toast rendering lives in Toasts.test.tsx.
import { describe, expect, it } from 'vitest';
import { mergeStatuses } from './services';
import type { Service, ServiceStatus } from './api';

function svc(id: string, status: ServiceStatus): Service {
  return {
    id,
    slug: id,
    name: `App ${id}`,
    description: '',
    url: `https://${id}.test`,
    icon: '',
    status,
    favorite: false,
    iconLight: false,
    iconDark: false,
  };
}

describe('mergeStatuses change detection (cap5)', () => {
  it('T-001: returns changes=[] when nothing changed', () => {
    const cur = [svc('a', 'UP'), svc('b', 'DOWN')];
    const fresh = [svc('a', 'UP'), svc('b', 'DOWN')];
    const { changes } = mergeStatuses(cur, fresh);
    expect(changes).toEqual([]);
  });

  it('T-002: returns a StatusChange for UP→DOWN', () => {
    const { changes } = mergeStatuses([svc('a', 'UP')], [svc('a', 'DOWN')]);
    expect(changes).toEqual([{ id: 'a', name: 'App a', from: 'UP', to: 'DOWN' }]);
  });

  it('T-003: returns a StatusChange for DOWN→UP', () => {
    const { changes } = mergeStatuses([svc('a', 'DOWN')], [svc('a', 'UP')]);
    expect(changes).toEqual([{ id: 'a', name: 'App a', from: 'DOWN', to: 'UP' }]);
  });

  it('T-004: no StatusChange for UNKNOWN↔UP (AC-004)', () => {
    // UP→UNKNOWN and UNKNOWN→UP are both monitoring-infra noise.
    expect(mergeStatuses([svc('a', 'UP')], [svc('a', 'UNKNOWN')]).changes).toEqual([]);
    expect(mergeStatuses([svc('a', 'UNKNOWN')], [svc('a', 'UP')]).changes).toEqual([]);
  });

  it('T-005: no StatusChange for NOT_MONITORED↔UP (AC-005)', () => {
    expect(mergeStatuses([svc('a', 'UP')], [svc('a', 'NOT_MONITORED')]).changes).toEqual([]);
    expect(mergeStatuses([svc('a', 'NOT_MONITORED')], [svc('a', 'UP')]).changes).toEqual([]);
  });

  it('still merges status into next (regression: identity preserved)', () => {
    const cur = [svc('a', 'UP'), svc('b', 'DOWN')];
    const { next } = mergeStatuses(cur, [svc('a', 'DOWN'), svc('b', 'DOWN')]);
    expect(next.map((s) => s.status)).toEqual(['DOWN', 'DOWN']);
    expect(next[1]).toBe(cur[1]); // unchanged tile keeps its reference
  });
});
