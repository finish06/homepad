// cap5 — Toast rendering behaviour. Driven through the real ToastContainer with
// the services context mocked, so each toast is the product of `recentChanges`
// exactly as the provider would emit it. Tests are named for the observed
// symptom (what the user sees), not the wiring.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { StatusChange } from './services';

// Controllable context: each test sets the recentChanges the container reads.
// clearRecentChanges is the AC-015 drain callback the container invokes after
// consuming; a shared spy stands in for it so tests that don't assert on it still
// satisfy the call.
let ctxValue: { recentChanges: StatusChange[]; clearRecentChanges: () => void } | null;
let clearRecentChanges: () => void;
vi.mock('./services', () => ({
  useServicesContext: () => ctxValue,
}));

import ToastContainer from './Toasts';

function change(id: string, from: StatusChange['from'], to: StatusChange['to']): StatusChange {
  return { id, name: `App ${id}`, from, to };
}

beforeEach(() => {
  clearRecentChanges = vi.fn();
  ctxValue = { recentChanges: [], clearRecentChanges };
  // jsdom defaults to 'visible'; be explicit so AC-012 tests are deterministic.
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ToastContainer (cap5)', () => {
  it('T-006: renders the service name + "went DOWN" for a DOWN change', () => {
    ctxValue = { recentChanges: [change('a', 'UP', 'DOWN')], clearRecentChanges };
    render(<ToastContainer />);
    expect(screen.getByText('App a went DOWN')).toBeInTheDocument();
  });

  it('T-007: renders "is back UP" for an UP change', () => {
    ctxValue = { recentChanges: [change('a', 'DOWN', 'UP')], clearRecentChanges };
    render(<ToastContainer />);
    expect(screen.getByText('App a is back UP')).toBeInTheDocument();
  });

  it('T-008: renders nothing on initial baseline (recentChanges empty)', () => {
    ctxValue = { recentChanges: [], clearRecentChanges };
    render(<ToastContainer />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('T-009: auto-dismisses a toast after 4 seconds', () => {
    vi.useFakeTimers();
    ctxValue = { recentChanges: [change('a', 'UP', 'DOWN')], clearRecentChanges };
    render(<ToastContainer />);
    expect(screen.getByText('App a went DOWN')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(4_000);
    });
    expect(screen.queryByText('App a went DOWN')).not.toBeInTheDocument();
  });

  it('T-010: multiple simultaneous changes produce multiple toasts', () => {
    ctxValue = { recentChanges: [change('a', 'UP', 'DOWN'), change('b', 'DOWN', 'UP')], clearRecentChanges };
    render(<ToastContainer />);
    expect(screen.getByText('App a went DOWN')).toBeInTheDocument();
    expect(screen.getByText('App b is back UP')).toBeInTheDocument();
    expect(screen.getAllByRole('status')).toHaveLength(2);
  });

  it('T-011: shows at most 3 toasts when 4+ changes arrive (AC-008)', () => {
    ctxValue = {
      recentChanges: [
        change('a', 'UP', 'DOWN'),
        change('b', 'UP', 'DOWN'),
        change('c', 'UP', 'DOWN'),
        change('d', 'UP', 'DOWN'),
      ],
      clearRecentChanges,
    };
    render(<ToastContainer />);
    expect(screen.getAllByRole('status')).toHaveLength(3);
  });

  it('AC-012: drops changes detected while the tab is hidden', () => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    ctxValue = { recentChanges: [change('a', 'UP', 'DOWN')], clearRecentChanges };
    render(<ToastContainer />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('T-012: clears recentChanges after consuming, so a remount fires no ghost toasts (AC-015)', () => {
    ctxValue = { recentChanges: [change('a', 'UP', 'DOWN')], clearRecentChanges };
    const first = render(<ToastContainer />);
    expect(screen.getByText('App a went DOWN')).toBeInTheDocument();
    // AC-015 — the container must ask the provider to reset the queue after it
    // has enqueued, so the changes can't be replayed by a later mount.
    expect(clearRecentChanges).toHaveBeenCalledTimes(1);

    // Provider honours the reset; a fresh ToastContainer then sees an empty batch
    // and must NOT resurrect the prior poll's toast.
    first.unmount();
    ctxValue = { recentChanges: [], clearRecentChanges };
    render(<ToastContainer />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('AC-010: DOWN toast is assertive, UP toast is polite', () => {
    ctxValue = { recentChanges: [change('a', 'UP', 'DOWN'), change('b', 'DOWN', 'UP')], clearRecentChanges };
    render(<ToastContainer />);
    const down = screen.getByText('App a went DOWN').closest('[role="status"]')!;
    const up = screen.getByText('App b is back UP').closest('[role="status"]')!;
    expect(down).toHaveAttribute('aria-live', 'assertive');
    expect(up).toHaveAttribute('aria-live', 'polite');
  });
});
