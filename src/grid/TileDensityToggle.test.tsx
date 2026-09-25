// SPEC-tile-density §switch — the dashboard-header density control (AC-DEN-001/008).
// RED tests: it offers the three densities as a radio group, marks the active one,
// and reports a change. Rendered as a controlled component so App owns the persisted
// value.
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TileDensityToggle from './TileDensityToggle';
import type { TileDensity } from './tileDensity';

describe('SPEC-tile-density — TileDensityToggle', () => {
  it('AC-DEN-001 — renders a radio for each density with the active one pressed', () => {
    render(<TileDensityToggle density="compact" onChange={() => {}} />);
    const group = screen.getByRole('radiogroup', { name: /tile density/i });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /large/i })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('radio', { name: /compact/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /list/i })).toHaveAttribute('aria-checked', 'false');
  });

  it('AC-DEN-004 — clicking a density reports it to onChange', async () => {
    const onChange = vi.fn();
    render(<TileDensityToggle density="compact" onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: /list/i }));
    expect(onChange).toHaveBeenCalledWith('list');
  });
});

// #437 — the roving tabindex moved SELECTION but never physical focus, so
// `document.activeElement` stayed on the originally-focused button. Because that
// button keeps its own index in the keydown closure, every subsequent arrow press
// recomputed `next` from the SAME index: the control advanced exactly once and
// then stuck. Reported against v16.1.0 (ebc2f3e) on staging.
//
// The assertions are on activeElement, not on onChange, because the aria state was
// already correct — the defect was invisible to any test that only watched the
// callback, which is why it shipped.
describe('#437 — arrow keys move focus, not just selection', () => {
  function Controlled({ start }: { start: TileDensity }) {
    const [d, setD] = useState<TileDensity>(start);
    return <TileDensityToggle density={d} onChange={setD} />;
  }

  it('ArrowRight moves physical focus to the newly selected radio', async () => {
    const u = userEvent.setup();
    render(<Controlled start="large" />);
    screen.getByTestId('density-large').focus();
    expect(document.activeElement).toBe(screen.getByTestId('density-large'));

    await u.keyboard('{ArrowRight}');
    expect(screen.getByTestId('density-compact')).toHaveAttribute('aria-checked', 'true');
    expect(document.activeElement).toBe(screen.getByTestId('density-compact'));
  });

  it('advances on EVERY press rather than sticking after the first', async () => {
    const u = userEvent.setup();
    render(<Controlled start="large" />);
    screen.getByTestId('density-large').focus();

    await u.keyboard('{ArrowRight}');
    await u.keyboard('{ArrowRight}');
    // large -> compact -> list. The bug parked here at compact forever.
    expect(screen.getByTestId('density-list')).toHaveAttribute('aria-checked', 'true');
    expect(document.activeElement).toBe(screen.getByTestId('density-list'));
  });

  it('ArrowLeft walks back the other way', async () => {
    const u = userEvent.setup();
    render(<Controlled start="list" />);
    screen.getByTestId('density-list').focus();
    await u.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(screen.getByTestId('density-compact'));
    await u.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(screen.getByTestId('density-large'));
  });

  it('wraps at both ends, focus following selection', async () => {
    const u = userEvent.setup();
    render(<Controlled start="list" />);
    screen.getByTestId('density-list').focus();
    await u.keyboard('{ArrowRight}'); // list -> large
    expect(document.activeElement).toBe(screen.getByTestId('density-large'));
    await u.keyboard('{ArrowLeft}'); // large -> list
    expect(document.activeElement).toBe(screen.getByTestId('density-list'));
  });

  it('keeps exactly one tab stop — the selected radio', async () => {
    const u = userEvent.setup();
    render(<Controlled start="large" />);
    screen.getByTestId('density-large').focus();
    await u.keyboard('{ArrowRight}');
    expect(screen.getByTestId('density-compact')).toHaveAttribute('tabindex', '0');
    expect(screen.getByTestId('density-large')).toHaveAttribute('tabindex', '-1');
    expect(screen.getByTestId('density-list')).toHaveAttribute('tabindex', '-1');
  });
});
