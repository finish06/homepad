// #127 — Mobile command launcher UX (specs/SPEC-mobile-launcher-ux.md).
// Two mobile-only gaps on a 390×844 viewport:
//   1. the launcher keyboard-hint footer (↑↓/⏎/Esc) is meaningless on touch
//      and eats ~42px — it must be `display:none` on phones (<640px).
//   2. the header search trigger (.launcher-trigger) and avatar (.user-avatar)
//      are 34px — below the 44×44px WCAG-2.5.5/HIG tap minimum on mobile.
//
// jsdom has no layout/media-query engine, so the real 390px behaviour is
// proven in a browser via CDP. Here we pin the SOURCE changes that drive it:
// the footer's responsive utility classes (AC1/AC2) and the mobile-scoped
// 44px min-size CSS rules (AC3/AC4). Named for the observed symptoms.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import CommandLauncher from './CommandLauncher';
import { LauncherProvider } from './launcher';
import type { Service } from './api';

const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

function svc(over: Partial<Service> = {}): Service {
  return {
    id: over.id ?? 's',
    slug: 'slug',
    name: 'Service',
    description: '',
    url: 'https://svc.example.com',
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

function openLauncher() {
  render(
    <LauncherProvider>
      <CommandLauncher services={[svc()]} />
    </LauncherProvider>,
  );
  fireEvent.keyDown(document, { key: 'k', metaKey: true });
}

beforeEach(() => {
  // jsdom lacks scrollIntoView; the launcher calls it to keep selection in view.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('#127 AC1/AC2 — keyboard-hint footer is phone-hidden, desktop-visible', () => {
  it('marks the launcher footer hidden on mobile and flex at >=640px', () => {
    openLauncher();
    const footer = screen.getByTestId('launcher-footer');
    // `hidden` => display:none on phones; `sm:flex` restores it at >=640px.
    expect(footer).toHaveClass('hidden');
    expect(footer).toHaveClass('sm:flex');
  });
});

describe('#127 AC3/AC4 — header tap targets reach 44px on mobile only', () => {
  // Mobile-scoped so desktop (avatar 34px, trigger 36px-tall pill) is untouched
  // — an unconditional min-size would regress the desktop chrome (AC2 spirit).
  const mobileBlock = css.match(/@media\s*\(max-width:\s*639px\)\s*\{([\s\S]*?)\n\s*\}\s*\n/);

  it('has a max-width:639px block raising .launcher-trigger to 44px', () => {
    expect(mobileBlock).not.toBeNull();
    const rule = css.match(/\.launcher-trigger\s*\{([^}]*)\}/g) ?? [];
    const mobileRule = rule.find((r) => /min-height:\s*44px/.test(r) && /min-width:\s*44px/.test(r));
    expect(mobileRule, '.launcher-trigger needs 44px min-height & min-width on mobile').toBeTruthy();
  });

  it('raises .user-avatar to 44px min-height & min-width on mobile', () => {
    const rule = css.match(/\.user-avatar\s*\{([^}]*)\}/g) ?? [];
    const mobileRule = rule.find((r) => /min-height:\s*44px/.test(r) && /min-width:\s*44px/.test(r));
    expect(mobileRule, '.user-avatar needs 44px min-height & min-width on mobile').toBeTruthy();
  });
});
