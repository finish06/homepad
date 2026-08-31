import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import CommandLauncher from './CommandLauncher';
import { LauncherProvider } from './launcher';
import type { Service } from './api';

// specs/not-monitored-state.md — a service with no gatus_key resolves to the
// "NOT_MONITORED" status and must render an OUTLINED DASHED RING (not the solid
// gray UNKNOWN dot). jsdom can't paint, so these assert the class hooks; the
// visual distinction is confirmed browser-real in the gate.
//
// The Catalog-tile half of this spec's coverage moved with the layout: the live
// App Grid pip is covered by app-grid-status-dot.test.tsx (shape-not-colour,
// labels) and the real-Chromium gate (dashed hollow ring paint). What remains
// here are the OTHER live surfaces sharing the .status-dot system: the ⌘K
// launcher row, and the danger-glow CSS rules (also used by AlertHistoryPanel).

function svc(over: Partial<Service> = {}): Service {
  return {
    id: 's1',
    slug: 'proxmox',
    name: 'Proxmox',
    description: '',
    url: 'https://proxmox.example.com',
    icon: 'proxmox',
    status: 'UP',
    favorite: false,
    iconLight: false,
    iconDark: false,
    categoryId: null,
    categoryName: null,
    ...over,
  };
}

beforeEach(() => {
  // jsdom lacks scrollIntoView; the launcher calls it to keep selection in view.
  Element.prototype.scrollIntoView = vi.fn();
});

describe('AC-005 — Command Launcher: NOT_MONITORED row shows the dashed ring', () => {
  it('applies the dashed-ring treatment in the launcher row status slot', () => {
    const catalog = [
      svc({ id: 'proxmox', name: 'Proxmox', status: 'NOT_MONITORED' }),
    ];
    render(
      <LauncherProvider>
        <CommandLauncher services={catalog} />
      </LauncherProvider>,
    );
    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    const status = screen.getByTestId('launcher-result-status');
    expect(status).toHaveAttribute('data-status', 'NOT_MONITORED');
    expect(status.className).toContain('border-dashed');
    expect(status.className).not.toContain('bg-neutral-300');
  });
});

// Board finding (release-board PAT): the §4 danger-glow rule was written as
// `.status-dot:not([data-status='UP'])`, so it painted the rose-red danger halo
// on EVERY non-UP dot — including the NOT_MONITORED ring. "Not monitored" is an
// ABSENCE of monitoring, not a failure, so it must read neutral (dashed ring,
// NO glow). UNKNOWN is a real monitoring-failure signal and MUST keep its glow.
// jsdom can't compute the whole index.css (cssom bails on some modern rules), but
// it DOES resolve a single extracted rule via getComputedStyle — so we pull just
// the real `.status-dot` rules from index.css and assert the painted box-shadow.
describe('board finding — NOT_MONITORED carries no danger glow (neutral, not error)', () => {
  const ROSE = '244, 63, 94'; // the rose-red danger-glow color
  const EMERALD = '16, 185, 129'; // the UP green-glow color

  function boxShadowFor(status: string): string {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
    const rules = css.match(/\.status-dot[^{}]*\{[^{}]*\}/g) ?? [];
    expect(rules.length).toBeGreaterThan(0);
    const style = document.createElement('style');
    style.textContent = rules.join('\n');
    document.head.appendChild(style);
    const dot = document.createElement('span');
    dot.className = 'status-dot';
    dot.setAttribute('data-status', status);
    document.body.appendChild(dot);
    const shadow = getComputedStyle(dot).boxShadow;
    style.remove();
    dot.remove();
    return shadow;
  }

  it('paints NO rose danger glow on a NOT_MONITORED dot', () => {
    expect(boxShadowFor('NOT_MONITORED')).not.toContain(ROSE);
  });

  it('still paints the rose danger glow on UNKNOWN (real monitoring failure)', () => {
    expect(boxShadowFor('UNKNOWN')).toContain(ROSE);
  });

  it('still paints the rose danger glow on DOWN', () => {
    expect(boxShadowFor('DOWN')).toContain(ROSE);
  });

  it('keeps the emerald glow on UP unchanged', () => {
    expect(boxShadowFor('UP')).toContain(EMERALD);
  });
});

// #80 (Walt's 2026-06-19 live UI review): the dashed neutral-300 ring read as a
// faint ambiguous gray smudge at 9px. Raise the ring to neutral-400 (light) /
// neutral-500 (dark) so the hollow ring is legibly an INTENTIONAL "not
// monitored" marker, while staying neutral (no fill, no glow).
describe('#80 — NOT_MONITORED ring is legibly muted, not a faint near-invisible dot', () => {
  it('Command Launcher row uses the higher-contrast ring', () => {
    const catalog = [svc({ id: 'proxmox', name: 'Proxmox', status: 'NOT_MONITORED' })];
    render(
      <LauncherProvider>
        <CommandLauncher services={catalog} />
      </LauncherProvider>,
    );
    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    const status = screen.getByTestId('launcher-result-status');
    expect(status.className).toContain('border-neutral-400');
    expect(status.className).toContain('dark:border-neutral-500');
    expect(status.className).not.toContain('border-neutral-300');
  });
});
