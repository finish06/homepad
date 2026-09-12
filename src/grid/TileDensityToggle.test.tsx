// SPEC-tile-density §switch — the dashboard-header density control (AC-DEN-001/008).
// RED tests: it offers the three densities as a radio group, marks the active one,
// and reports a change. Rendered as a controlled component so App owns the persisted
// value.
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TileDensityToggle from './TileDensityToggle';

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
