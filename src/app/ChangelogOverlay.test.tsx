import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChangelogOverlay, { chipStyle, type Changelog } from './ChangelogOverlay';

// v15 §2 chip color table — the canonical four types plus the unknown fallback.
const CHIP_BG: Record<string, string> = {
  feature: 'rgba(34, 197, 94, 0.14)',
  enhancement: 'rgba(58, 142, 232, 0.15)',
  'bug-fix': 'rgba(217, 164, 65, 0.15)',
  security: 'rgba(248, 113, 113, 0.14)',
};

const DATA: Changelog = {
  pending: [{ type: 'feature', text: 'Version badge + changelog overlay' }],
  versions: [
    {
      version: '14.0.0',
      date: '2026-06-23',
      changes: [
        { type: 'feature', text: 'A new feature' },
        { type: 'enhancement', text: 'A refinement' },
        { type: 'bug-fix', text: 'A squashed bug' },
        { type: 'security', text: 'A hardening' },
        { type: 'mystery' as never, text: 'An unknown type' },
      ],
    },
  ],
};

const EMPTY_PENDING: Changelog = {
  pending: [],
  versions: DATA.versions,
};

describe('ChangelogOverlay (v15)', () => {
  // AC-021(a)
  it('renders the dialog without crashing when open', () => {
    render(<ChangelogOverlay open onClose={() => {}} data={DATA} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByText('Changelog')).toBeInTheDocument();
  });

  it('renders nothing when closed', () => {
    render(<ChangelogOverlay open={false} onClose={() => {}} data={DATA} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // AC-021(b) / AC-016 — four canonical chip colors + neutral unknown fallback.
  it('gives each of the four canonical types its spec rgba background', () => {
    for (const [type, bg] of Object.entries(CHIP_BG)) {
      expect(chipStyle(type).background).toBe(bg);
    }
  });

  it('falls back to a neutral muted chip for an unknown type (no crash)', () => {
    const style = chipStyle('totally-made-up');
    expect(style.background).toBe('rgba(138, 143, 152, 0.15)');
    // and the unknown entry still renders rather than being hidden
    render(<ChangelogOverlay open onClose={() => {}} data={DATA} />);
    // select the released version so its rows (incl. the unknown) show
    return userEvent.click(screen.getByRole('button', { name: /14\.0\.0/ })).then(() => {
      expect(screen.getByText('An unknown type')).toBeInTheDocument();
    });
  });

  // AC-021(c) / AC-013
  it('shows "Nothing queued yet." when pending is empty', async () => {
    const user = userEvent.setup();
    render(<ChangelogOverlay open onClose={() => {}} data={EMPTY_PENDING} />);
    await user.click(screen.getByRole('button', { name: /pending next release/i }));
    expect(screen.getByText('Nothing queued yet.')).toBeInTheDocument();
  });

  // AC-021(d) / AC-012 — pending entries render, and are the default selection.
  it('renders pending entries and defaults to the pending bucket on open', () => {
    render(<ChangelogOverlay open onClose={() => {}} data={DATA} />);
    expect(screen.getByText('Version badge + changelog overlay')).toBeInTheDocument();
  });

  // AC-009 — Escape closes and calls onClose.
  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ChangelogOverlay open onClose={onClose} data={DATA} />);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
