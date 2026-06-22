import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import CommandLauncher from './CommandLauncher';
import LauncherTrigger from './LauncherTrigger';
import { LauncherProvider } from './launcher';
import type { Service } from './api';

// Read the stylesheet from disk — vitest's CSS handling makes `?raw` empty, so
// assert the dark/reduced-motion/responsive rules against the file text.
const launcherCss = readFileSync('src/index.css', 'utf8');

// v8 slice 3 — the header trigger (§4.2), full combobox/listbox a11y + focus
// trap + aria-live (§8), light/dark + non-color selection + reduced-motion (§2),
// responsive trigger/modal (§9) and the per-row status dot (OQ3). Drives
// A4/A13/A14/A15 (specs/v8-command-launcher.md §11). RED before the trigger and
// the slice-3 wiring exist.

expect.extend(toHaveNoViolations);

function svc(over: Partial<Service> = {}): Service {
  return {
    id: over.id ?? over.name ?? 's',
    slug: 'slug',
    name: 'Service',
    description: '',
    url: `https://${over.id ?? 'svc'}.example.com`,
    icon: 'x',
    status: 'UP',
    favorite: false,
    iconLight: false,
    iconDark: false,
    categoryId: null,
    categoryName: null,
    ...over,
  };
}

const CATALOG: Service[] = [
  svc({ id: 'jellyfin', name: 'Jellyfin', categoryName: 'Media', status: 'UP' }),
  svc({ id: 'jellyseerr', name: 'Jellyseerr', categoryName: 'Media', status: 'DOWN' }),
  svc({ id: 'gitea', name: 'Gitea', categoryName: 'Dev', favorite: true }),
];

function setup(services: Service[] = CATALOG) {
  return render(
    <LauncherProvider>
      <LauncherTrigger />
      <CommandLauncher services={services} />
    </LauncherProvider>,
  );
}

beforeEach(() => {
  // jsdom lacks scrollIntoView; the launcher calls it to keep the selection
  // visible as the query/selection change.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => vi.restoreAllMocks());

describe('A4 — header trigger opens the launcher and carries dialog popup semantics', () => {
  it('exists, is a button with an accessible name + aria-haspopup=dialog, and opens on click', () => {
    setup();
    const trigger = screen.getByTestId('launcher-trigger');
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger).toHaveAccessibleName('Open quick launcher');
    expect(trigger).toHaveAttribute('aria-keyshortcuts', 'Meta+K Control+K');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    expect(screen.queryByTestId('launcher-modal')).toBeNull();
    fireEvent.click(trigger);
    expect(screen.getByTestId('launcher-modal')).toHaveAttribute('role', 'dialog');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('A13 — combobox/listbox aria wiring, focus trap, aria-live count, axe-clean', () => {
  it('wires combobox→listbox→option with aria-activedescendant on the selected row', () => {
    setup();
    fireEvent.click(screen.getByTestId('launcher-trigger'));
    fireEvent.change(screen.getByTestId('launcher-input'), { target: { value: 'jelly' } });

    const input = screen.getByTestId('launcher-input');
    expect(input).toHaveAttribute('role', 'combobox');
    expect(input).toHaveAttribute('aria-controls', 'launcher-results');
    expect(input).toHaveAttribute('aria-expanded', 'true');

    const listbox = screen.getByTestId('launcher-results');
    expect(listbox).toHaveAttribute('role', 'listbox');
    expect(listbox.id).toBe('launcher-results');

    const options = screen.getAllByRole('option');
    expect(options.length).toBeGreaterThan(0);
    const selected = options.find((o) => o.getAttribute('aria-selected') === 'true')!;
    expect(selected).toBeTruthy();
    expect(input).toHaveAttribute('aria-activedescendant', selected.id);
  });

  it('exposes a composed accessible name (name, category, status) on each option', () => {
    setup();
    fireEvent.click(screen.getByTestId('launcher-trigger'));
    fireEvent.change(screen.getByTestId('launcher-input'), { target: { value: 'jelly' } });
    const jelly = screen
      .getAllByRole('option')
      .find((o) => o.getAttribute('data-service-id') === 'jellyfin')!;
    expect(jelly).toHaveAccessibleName(/jellyfin/i);
    expect(jelly).toHaveAccessibleName(/media/i);
    expect(jelly).toHaveAccessibleName(/up/i);
  });

  it('announces the result count via an aria-live polite region', () => {
    setup();
    fireEvent.click(screen.getByTestId('launcher-trigger'));
    const live = screen.getByTestId('launcher-live');
    expect(live).toHaveAttribute('aria-live', 'polite');
    fireEvent.change(screen.getByTestId('launcher-input'), { target: { value: 'jelly' } });
    expect(live.textContent).toMatch(/2 results/i);
    fireEvent.change(screen.getByTestId('launcher-input'), { target: { value: 'zzzzz' } });
    expect(live.textContent).toMatch(/no services match/i);
  });

  it('traps Tab within the dialog (focus never lands on <body>)', () => {
    setup();
    fireEvent.click(screen.getByTestId('launcher-trigger'));
    const modal = screen.getByTestId('launcher-modal');
    fireEvent.keyDown(modal, { key: 'Tab' });
    expect(modal.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(modal, { key: 'Tab', shiftKey: true });
    expect(modal.contains(document.activeElement)).toBe(true);
  });

  it('has no axe violations open+empty and open+results', async () => {
    const { container } = setup();
    fireEvent.click(screen.getByTestId('launcher-trigger'));
    expect(await axe(container)).toHaveNoViolations();
    fireEvent.change(screen.getByTestId('launcher-input'), { target: { value: 'jelly' } });
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('A14 — dark theme, non-color selection markers, reduced-motion', () => {
  it('signals the selected row by more than color (accent bar + aria-selected + ⏎ chip)', () => {
    setup();
    fireEvent.click(screen.getByTestId('launcher-trigger'));
    fireEvent.change(screen.getByTestId('launcher-input'), { target: { value: 'jelly' } });
    const selected = screen
      .getAllByRole('option')
      .find((o) => o.getAttribute('data-selected') === 'true')!;
    expect(selected).toHaveAttribute('aria-selected', 'true');
    expect(within(selected).getByTestId('launcher-enter-hint')).toBeInTheDocument();
  });

  it('ships dark-theme launcher rules and a reduced-motion rule for the launcher', () => {
    expect(launcherCss).toMatch(/\.dark .launcher-panel/);
    expect(launcherCss).toMatch(/prefers-reduced-motion[\s\S]*launcher-/);
  });
});

describe('A15 — responsive trigger and modal', () => {
  it('trigger collapses its label/hint below 640px (icon-only) and shows them at ≥640px', () => {
    setup();
    const hint = screen.getByTestId('launcher-trigger-hint');
    // hidden by default, revealed at the sm (≥640px) breakpoint
    expect(hint.className).toMatch(/hidden/);
    expect(hint.className).toMatch(/sm:/);
    // the search glyph is always present (icon-only on mobile)
    expect(screen.getByTestId('launcher-trigger-glyph')).toBeInTheDocument();
  });

  it('modal width is responsive (min of 640px and the viewport minus gutters)', () => {
    expect(launcherCss).toMatch(/\.launcher-panel[\s\S]*min\(640px[\s\S]*100vw/);
  });
});

describe('#97 — the ⌘K/Ctrl K chord hint reads as a keycap, not a category chip', () => {
  const kbdRule = launcherCss.match(/\.launcher-trigger-kbd\s*\{([^}]*)\}/)?.[1] ?? '';

  it('renders the chord hint inside a semantic <kbd>', () => {
    render(
      <LauncherProvider>
        <LauncherTrigger />
      </LauncherProvider>,
    );
    const kbd = within(screen.getByTestId('launcher-trigger-hint')).getByText(/⌘K|Ctrl K/);
    expect(kbd.tagName).toBe('KBD');
    expect(kbd).toHaveClass('launcher-trigger-kbd');
  });

  it('styles the keycap with a full border and a raised bottom edge', () => {
    // a keycap has a full border plus a thicker bottom edge giving the key its depth
    expect(kbdRule).toMatch(/border:/);
    expect(kbdRule).toMatch(/border-bottom-width:\s*2px/);
    // ...and a subtle drop shadow, unlike a flat chip
    expect(kbdRule).toMatch(/box-shadow:/);
  });

  it('drops the category-chip accent tint that caused #97', () => {
    // the old badge filled itself with the indigo accent (the same look as a
    // category chip); a keycap sits on a neutral surface instead.
    expect(kbdRule).not.toMatch(/rgba\(99,\s*102,\s*241/);
  });
});
