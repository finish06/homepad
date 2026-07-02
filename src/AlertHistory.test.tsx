// v17 §4 — the alert-history UI: the header bell + unread badge (AppHeader),
// the history panel (AlertHistoryPanel), and the Home-style wiring that ties
// them together (badge clears on open, second click + Escape close, focus
// returns to the bell). Test names describe the observed behaviour, not a
// theorised cause (retro lesson).
import { useEffect, useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AppHeader from './AppHeader';
import AlertHistoryPanel from './AlertHistoryPanel';
import { LauncherProvider } from './launcher';
import { AlertHistoryProvider, useAlertHistory, type AlertEvent } from './alerts';
import type { User } from './api';

const USER: User = { id: 'u1', email: 'nani@ohana.io', role: 'user', themePref: 'system' };

function ev(n: number, over: Partial<AlertEvent> = {}): AlertEvent {
  return {
    id: `e${n}`,
    serviceId: `s${n}`,
    serviceName: `Service ${n}`,
    serviceUrl: `https://example.test/${n}`,
    prevStatus: 'UP',
    newStatus: 'DOWN',
    ts: 1_700_000_000_000 + n,
    ...over,
  };
}

function renderHeader(alertCount: number, onAlertClick = () => {}) {
  return render(
    <LauncherProvider>
      <AppHeader
        user={USER}
        onOpenAdminSettings={() => {}}
        onGoToDashboard={() => {}}
        onLogout={() => {}}
        alertCount={alertCount}
        onAlertClick={onAlertClick}
      />
    </LauncherProvider>,
  );
}

describe('header alert bell (AppHeader)', () => {
  it('AC-001 — renders a bell button', () => {
    renderHeader(0);
    const bell = screen.getByTestId('alert-bell');
    expect(bell.tagName).toBe('BUTTON');
  });

  it('AC-002 — shows no badge and a plain label at 0 unread', () => {
    renderHeader(0);
    expect(screen.queryByTestId('alert-bell-badge')).toBeNull();
    expect(screen.getByTestId('alert-bell')).toHaveAttribute('aria-label', 'Alert history');
  });

  it('AC-002 — shows the count and an unread label at N > 0', () => {
    renderHeader(3);
    expect(screen.getByTestId('alert-bell-badge')).toHaveTextContent('3');
    expect(screen.getByTestId('alert-bell')).toHaveAttribute(
      'aria-label',
      'Alert history, 3 unread',
    );
  });

  it('AC-002 — caps the badge display at 99+', () => {
    renderHeader(100);
    expect(screen.getByTestId('alert-bell-badge')).toHaveTextContent('99+');
  });

  it('AC-006 — clicking the bell calls onAlertClick', async () => {
    const onAlertClick = vi.fn();
    renderHeader(2, onAlertClick);
    await userEvent.click(screen.getByTestId('alert-bell'));
    expect(onAlertClick).toHaveBeenCalledTimes(1);
  });
});

describe('alert history panel (AlertHistoryPanel)', () => {
  it('renders nothing while closed', () => {
    const { container } = render(
      <AlertHistoryPanel open={false} events={[]} onClose={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('AC-006 — is a labelled modal dialog titled "Alert History"', () => {
    render(<AlertHistoryPanel open events={[]} onClose={() => {}} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Alert History')).toBeInTheDocument();
  });

  it('AC-010 — shows the empty-state copy when there are no events', () => {
    render(<AlertHistoryPanel open events={[]} onClose={() => {}} />);
    expect(
      screen.getByText(/No alerts yet\. Status changes will appear here while this page is open\./i),
    ).toBeInTheDocument();
  });

  it('AC-008 — renders a row per event with name, transition dots, time, and visit link', () => {
    render(
      <AlertHistoryPanel
        open
        events={[ev(1, { prevStatus: 'UP', newStatus: 'DOWN' })]}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText('Service 1')).toBeInTheDocument();
    const dots = screen.getAllByTestId('alert-dot');
    expect(dots.map((d) => d.getAttribute('data-status'))).toEqual(['UP', 'DOWN']);
    expect(screen.getByTestId('alert-time')).toBeInTheDocument();
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://example.test/1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('AC-008 — renders events newest-first', () => {
    render(<AlertHistoryPanel open events={[ev(2), ev(1)]} onClose={() => {}} />);
    const rows = screen.getAllByTestId('alert-row');
    expect(rows[0]).toHaveTextContent('Service 2');
    expect(rows[1]).toHaveTextContent('Service 1');
  });

  it('AC-006 — closes on the ✕ button', async () => {
    const onClose = vi.fn();
    render(<AlertHistoryPanel open events={[]} onClose={onClose} />);
    await userEvent.click(screen.getByTestId('alert-panel-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('AC-006 — closes on Escape', async () => {
    const onClose = vi.fn();
    render(<AlertHistoryPanel open events={[]} onClose={onClose} />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// Home-style wiring harness: bell badge derives from unreadCount, opening the
// panel clears the badge and the event list survives, a second bell click or
// Escape closes, and focus returns to the bell (AC-006/AC-007/AC-009).
function Harness({ seed }: { seed: AlertEvent[] }) {
  const alerts = useAlertHistory()!;
  const [open, setOpen] = useState(false);
  const bellRef = useRef<HTMLButtonElement>(null);
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    seed.forEach((e) => alerts.pushEvent(e));
  });
  function toggle() {
    setOpen((o) => {
      if (!o) alerts.clearBadge();
      return !o;
    });
  }
  function close() {
    setOpen(false);
    bellRef.current?.focus();
  }
  return (
    <LauncherProvider>
      <AppHeader
        user={USER}
        onOpenAdminSettings={() => {}}
        onGoToDashboard={() => {}}
        onLogout={() => {}}
        alertCount={alerts.unreadCount}
        onAlertClick={toggle}
        bellRef={bellRef}
      />
      <AlertHistoryPanel open={open} events={alerts.events} onClose={close} />
    </LauncherProvider>
  );
}

function renderHarness(seed: AlertEvent[]) {
  return render(
    <AlertHistoryProvider>
      <Harness seed={seed} />
    </AlertHistoryProvider>,
  );
}

describe('alert history wiring (Home)', () => {
  it('AC-007 — opening the panel clears the badge but keeps the events', async () => {
    renderHarness([ev(1), ev(2)]);
    expect(screen.getByTestId('alert-bell-badge')).toHaveTextContent('2');
    await userEvent.click(screen.getByTestId('alert-bell'));
    expect(screen.queryByTestId('alert-bell-badge')).toBeNull();
    expect(screen.getAllByTestId('alert-row')).toHaveLength(2);
  });

  it('AC-006 — a second bell click closes the panel', async () => {
    renderHarness([ev(1)]);
    await userEvent.click(screen.getByTestId('alert-bell'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('alert-bell'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('AC-009 — Escape closes and returns focus to the bell', async () => {
    renderHarness([ev(1)]);
    await userEvent.click(screen.getByTestId('alert-bell'));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('alert-bell')).toHaveFocus();
  });
});
