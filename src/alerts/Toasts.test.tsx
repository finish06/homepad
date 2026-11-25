// cap5 — Toast rendering behaviour. Driven through the real ToastContainer with
// the services context mocked, so each toast is the product of `recentChanges`
// exactly as the provider would emit it. Tests are named for the observed
// symptom (what the user sees), not the wiring.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { StatusChange } from '../services';

// Controllable context: each test sets the recentChanges the container reads.
// clearRecentChanges is the AC-015 drain callback the container invokes after
// consuming; a shared spy stands in for it so tests that don't assert on it still
// satisfy the call.
let ctxValue: { recentChanges: StatusChange[]; clearRecentChanges: () => void } | null;
let clearRecentChanges: () => void;
vi.mock('../services', () => ({
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

// SPEC-ui-quick-wins AC-007..AC-009 — toasts pause while hovered or focused,
// can be dismissed, and a status toast's "View" opens the alert history.
describe('ToastContainer — pause, dismiss, View (SPEC-ui-quick-wins)', () => {
  const toastOf = (text: string) => screen.getByText(text).closest('[data-testid="toast"]') as HTMLElement;
  const advance = (ms: number) =>
    act(() => {
      vi.advanceTimersByTime(ms);
    });

  it('AC-007: hovering pauses the timer, leaving resumes it with the time left', () => {
    vi.useFakeTimers();
    ctxValue = { recentChanges: [change('a', 'UP', 'DOWN')], clearRecentChanges };
    render(<ToastContainer />);
    advance(3_000);
    fireEvent.mouseEnter(toastOf('App a went DOWN'));
    advance(10_000);
    // Hovered: never closes.
    expect(screen.getByText('App a went DOWN')).toBeInTheDocument();
    fireEvent.mouseLeave(toastOf('App a went DOWN'));
    advance(900);
    expect(screen.getByText('App a went DOWN')).toBeInTheDocument();
    // 3s ran before the hover, so 1s was left: it closes at 1s, not 4s.
    advance(100);
    expect(screen.queryByText('App a went DOWN')).not.toBeInTheDocument();
  });

  it('AC-007: focus inside the toast pauses it; it resumes only when hover AND focus have ended', () => {
    vi.useFakeTimers();
    ctxValue = { recentChanges: [change('a', 'UP', 'DOWN')], clearRecentChanges };
    render(<ToastContainer />);
    advance(2_000);
    const toast = toastOf('App a went DOWN');
    const dismiss = within(toast).getByTestId('toast-dismiss');
    act(() => dismiss.focus());
    fireEvent.mouseEnter(toast);
    advance(10_000);
    fireEvent.mouseLeave(toast);
    // Still focused: still paused.
    advance(10_000);
    expect(screen.getByText('App a went DOWN')).toBeInTheDocument();
    act(() => dismiss.blur());
    advance(1_999);
    expect(screen.getByText('App a went DOWN')).toBeInTheDocument();
    advance(1);
    expect(screen.queryByText('App a went DOWN')).not.toBeInTheDocument();
  });

  it('AC-007: moving focus between the toast\'s own buttons keeps it paused', () => {
    vi.useFakeTimers();
    ctxValue = { recentChanges: [change('a', 'UP', 'DOWN')], clearRecentChanges };
    render(<ToastContainer onView={() => {}} />);
    const toast = toastOf('App a went DOWN');
    act(() => within(toast).getByTestId('toast-view').focus());
    act(() => within(toast).getByTestId('toast-dismiss').focus());
    advance(10_000);
    expect(screen.getByText('App a went DOWN')).toBeInTheDocument();
  });

  it('AC-008: every toast has a labelled Dismiss button that closes it at once', () => {
    ctxValue = { recentChanges: [change('a', 'UP', 'DOWN'), change('b', 'DOWN', 'UP')], clearRecentChanges };
    render(<ToastContainer />);
    const buttons = screen.getAllByRole('button', { name: 'Dismiss' });
    expect(buttons).toHaveLength(2);
    // ≥24×24 (WCAG 2.5.8). jsdom has no layout; the browser gate measures it.
    buttons.forEach((b) => expect(b).toHaveClass('min-h-6', 'min-w-6'));
    fireEvent.click(within(toastOf('App a went DOWN')).getByTestId('toast-dismiss'));
    expect(screen.queryByText('App a went DOWN')).not.toBeInTheDocument();
    expect(screen.getByText('App b is back UP')).toBeInTheDocument();
  });

  it('AC-008: dismissing a focused toast moves focus to the next toast\'s Dismiss', () => {
    ctxValue = {
      recentChanges: [change('a', 'UP', 'DOWN'), change('b', 'UP', 'DOWN'), change('c', 'UP', 'DOWN')],
      clearRecentChanges,
    };
    render(<ToastContainer />);
    const first = within(toastOf('App a went DOWN')).getByTestId('toast-dismiss');
    act(() => first.focus());
    fireEvent.click(first);
    expect(within(toastOf('App b went DOWN')).getByTestId('toast-dismiss')).toHaveFocus();
  });

  it('AC-008: dismissing the last focused toast moves focus to the alert bell', () => {
    const bell = document.createElement('button');
    bell.setAttribute('data-testid', 'alert-bell');
    document.body.appendChild(bell);
    try {
      ctxValue = { recentChanges: [change('a', 'UP', 'DOWN')], clearRecentChanges };
      render(<ToastContainer />);
      const btn = within(toastOf('App a went DOWN')).getByTestId('toast-dismiss');
      act(() => btn.focus());
      fireEvent.click(btn);
      expect(screen.queryByText('App a went DOWN')).not.toBeInTheDocument();
      expect(bell).toHaveFocus();
    } finally {
      bell.remove();
    }
  });

  it('AC-008: a dismiss by mouse with focus elsewhere does not move focus', () => {
    const outside = document.createElement('input');
    document.body.appendChild(outside);
    try {
      ctxValue = { recentChanges: [change('a', 'UP', 'DOWN'), change('b', 'UP', 'DOWN')], clearRecentChanges };
      render(<ToastContainer />);
      outside.focus();
      fireEvent.click(within(toastOf('App a went DOWN')).getByTestId('toast-dismiss'));
      expect(outside).toHaveFocus();
    } finally {
      outside.remove();
    }
  });

  it('AC-009: "View" calls onView and closes the toast', () => {
    const onView = vi.fn();
    ctxValue = { recentChanges: [change('a', 'UP', 'DOWN')], clearRecentChanges };
    render(<ToastContainer onView={onView} />);
    const view = within(toastOf('App a went DOWN')).getByRole('button', { name: /view/i });
    fireEvent.click(view);
    expect(onView).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('App a went DOWN')).not.toBeInTheDocument();
  });

  it('AC-009: recoveries get View too (every toast today is a status change)', () => {
    ctxValue = { recentChanges: [change('b', 'DOWN', 'UP')], clearRecentChanges };
    render(<ToastContainer onView={() => {}} />);
    expect(within(toastOf('App b is back UP')).getByTestId('toast-view')).toBeInTheDocument();
  });

  it('without an onView handler there is no View button (nothing to open)', () => {
    ctxValue = { recentChanges: [change('a', 'UP', 'DOWN')], clearRecentChanges };
    render(<ToastContainer />);
    expect(screen.queryByTestId('toast-view')).toBeNull();
  });

  it('the live region carries only the message, not the button names', () => {
    ctxValue = { recentChanges: [change('a', 'UP', 'DOWN')], clearRecentChanges };
    render(<ToastContainer onView={() => {}} />);
    expect(screen.getByRole('status')).toHaveTextContent(/^App a went DOWN$/);
  });
});
