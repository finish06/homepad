// v17 §3/§4 — AlertHistoryProvider unit behaviour: the in-memory ring buffer,
// newest-first ordering, the unread badge counter, and clearBadge. Tagged with
// the acceptance criteria they cover.
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { AlertHistoryProvider, MAX_EVENTS, useAlertHistory, type AlertEvent } from './alerts';

function ev(n: number): AlertEvent {
  return {
    id: `e${n}`,
    serviceId: `s${n}`,
    serviceName: `svc ${n}`,
    serviceUrl: `https://example.test/${n}`,
    prevStatus: 'UP',
    newStatus: 'DOWN',
    ts: n,
  };
}

function setup() {
  return renderHook(() => useAlertHistory(), { wrapper: AlertHistoryProvider });
}

describe('AlertHistoryProvider', () => {
  it('AC-010/AC-002 — starts empty with zero unread', () => {
    const { result } = setup();
    expect(result.current!.events).toEqual([]);
    expect(result.current!.unreadCount).toBe(0);
  });

  it('AC-008/AC-002 — pushEvent prepends newest-first and bumps unread', () => {
    const { result } = setup();
    act(() => {
      result.current!.pushEvent(ev(1));
      result.current!.pushEvent(ev(2));
    });
    expect(result.current!.events.map((e) => e.id)).toEqual(['e2', 'e1']);
    expect(result.current!.unreadCount).toBe(2);
  });

  it('AC-005 — caps the log at MAX_EVENTS, dropping the oldest', () => {
    const { result } = setup();
    act(() => {
      for (let i = 0; i < MAX_EVENTS + 5; i++) result.current!.pushEvent(ev(i));
    });
    expect(result.current!.events).toHaveLength(MAX_EVENTS);
    // Newest is kept at the head; the five oldest (e0..e4) are dropped.
    expect(result.current!.events[0].id).toBe(`e${MAX_EVENTS + 4}`);
    expect(result.current!.events.at(-1)!.id).toBe('e5');
  });

  it('AC-007 — clearBadge resets unread to 0 but keeps the events', () => {
    const { result } = setup();
    act(() => {
      result.current!.pushEvent(ev(1));
      result.current!.pushEvent(ev(2));
    });
    act(() => result.current!.clearBadge());
    expect(result.current!.unreadCount).toBe(0);
    expect(result.current!.events).toHaveLength(2);
  });
});
