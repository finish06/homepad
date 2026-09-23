import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsPanel from './SettingsPanel';
import { adminEnvConfig, listLibrary } from '../api';

// SPEC-density-to-my-settings — the density control's new home.
//
// It moves out of the dashboard toolbar (where SPEC-tile-density OQ-9 put it,
// "matching the v16 artboard") and into My settings, beside the two preferences
// that already share its shape: per-user, persisted through /api/me, set once.
// Caleb reversed that placement on 2026-09-23; OQ-1 records it as a product call
// overriding a design one.

vi.mock('../api', () => ({
  listLibrary: vi.fn(),
  createLibraryApp: vi.fn(),
  updateLibraryApp: vi.fn(),
  deleteLibraryApp: vi.fn(),
  setLibraryOrder: vi.fn(),
  adminEnvConfig: vi.fn(),
}));

function renderPanel(props: Partial<React.ComponentProps<typeof SettingsPanel>> = {}) {
  return render(
    <SettingsPanel
      isAdmin={props.isAdmin ?? false}
      scope={props.scope ?? 'personal'}
      showUptimeDisplay={true}
      statusDegradedMs={1000}
      onSaveSettings={vi.fn().mockResolvedValue(undefined)}
      showHealthBar={true}
      onSetHealthBar={vi.fn()}
      showUptimeDisplayPref={true}
      onSetUptimeDisplay={vi.fn()}
      density={props.density ?? 'compact'}
      onSetDensity={props.onSetDensity ?? vi.fn()}
      onClose={vi.fn()}
    />,
  );
}

beforeEach(() => {
  vi.mocked(listLibrary).mockResolvedValue([]);
  vi.mocked(adminEnvConfig).mockResolvedValue([]);
});

afterEach(() => vi.clearAllMocks());

describe('My settings — tile density (AC-001, AC-005)', () => {
  it('AC-001 — renders the density control inside My settings', async () => {
    renderPanel();
    const personal = await screen.findByTestId('settings-personal');
    expect(within(personal).getByTestId('density-toggle')).toBeTruthy();
  });

  it('AC-001 — sits BELOW the two existing preference rows', async () => {
    renderPanel();
    const personal = await screen.findByTestId('settings-personal');
    const order = Array.from(
      personal.querySelectorAll('[data-testid="setting-health-bar"], [data-testid="setting-uptime-display"], [data-testid="density-toggle"]'),
    ).map((el) => el.getAttribute('data-testid'));
    expect(order).toEqual(['setting-health-bar', 'setting-uptime-display', 'density-toggle']);
  });

  it('AC-005 — it is a radiogroup, not a switch, and names itself', async () => {
    renderPanel();
    const group = await screen.findByTestId('density-toggle');
    // Three-way choice: a switch would misrepresent it to assistive tech.
    expect(group).toHaveAttribute('role', 'radiogroup');
    expect(group).toHaveAttribute('aria-label', 'Tile density');
    expect(within(group).getAllByRole('radio')).toHaveLength(3);
  });

  it('AC-005 — the persisted value is the checked radio', async () => {
    renderPanel({ density: 'list' });
    const group = await screen.findByTestId('density-toggle');
    expect(within(group).getByTestId('density-list')).toHaveAttribute('aria-checked', 'true');
    expect(within(group).getByTestId('density-compact')).toHaveAttribute('aria-checked', 'false');
  });

  it('AC-003 — choosing a density reports up immediately, without closing the panel', async () => {
    const onSetDensity = vi.fn();
    renderPanel({ density: 'compact', onSetDensity });
    const group = await screen.findByTestId('density-toggle');
    await userEvent.click(within(group).getByTestId('density-large'));
    expect(onSetDensity).toHaveBeenCalledWith('large');
    // The panel is still open — the change is live, not staged behind a save.
    expect(screen.getByTestId('settings-personal')).toBeTruthy();
  });

  it('AC-005 — arrow keys move between options (radio-group keyboard model)', async () => {
    const onSetDensity = vi.fn();
    renderPanel({ density: 'compact', onSetDensity });
    const group = await screen.findByTestId('density-toggle');
    within(group).getByTestId('density-compact').focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onSetDensity).toHaveBeenCalledWith('list');
  });

  it('is absent from the ADMIN scope — density is a personal preference', async () => {
    renderPanel({ scope: 'admin', isAdmin: true });
    await screen.findByTestId('settings-system');
    expect(screen.queryByTestId('density-toggle')).toBeNull();
  });

  it('a non-admin opening My settings still gets it (AC-001 is not role-gated)', async () => {
    renderPanel({ isAdmin: false });
    const personal = await screen.findByTestId('settings-personal');
    expect(within(personal).getByTestId('density-toggle')).toBeTruthy();
  });
});
