import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import LauncherTrigger from './LauncherTrigger';
import { LauncherProvider } from './launcher';

// #82 — the chord hint must be OS-aware: ⌘K on macOS, "Ctrl K" elsewhere. Walt
// saw "Ctrl K" on a real Mac because detection leaned on the deprecated
// `navigator.platform`, which privacy-hardened/modern browsers empty or farble.
// These tests pin the hint against the modern `navigator.userAgentData.platform`
// signal first, with the legacy regex kept as a fallback for older browsers.
// Named for the observed symptom ("hint glyph by platform"), not a root-cause theory.

const realPlatform = Object.getOwnPropertyDescriptor(Navigator.prototype, 'platform')
  ?? Object.getOwnPropertyDescriptor(navigator, 'platform');

function stubNav(opts: { uaPlatform?: string; platform?: string }) {
  if ('uaPlatform' in opts) {
    Object.defineProperty(navigator, 'userAgentData', {
      value: { platform: opts.uaPlatform },
      configurable: true,
    });
  }
  Object.defineProperty(navigator, 'platform', {
    value: opts.platform ?? '',
    configurable: true,
  });
}

afterEach(() => {
  delete (navigator as { userAgentData?: unknown }).userAgentData;
  if (realPlatform) Object.defineProperty(navigator, 'platform', realPlatform);
});

function hintText() {
  const hint = screen.getByTestId('launcher-trigger-hint');
  return within(hint).getByText(/⌘K|Ctrl K/).textContent;
}

function renderTrigger() {
  return render(
    <LauncherProvider>
      <LauncherTrigger />
    </LauncherProvider>,
  );
}

describe('launcher chord hint is OS-aware (#82)', () => {
  it('shows ⌘K on macOS via the modern userAgentData signal', () => {
    stubNav({ uaPlatform: 'macOS', platform: '' });
    renderTrigger();
    expect(hintText()).toBe('⌘K');
  });

  it('shows "Ctrl K" on Windows via the modern userAgentData signal', () => {
    stubNav({ uaPlatform: 'Windows', platform: 'Win32' });
    renderTrigger();
    expect(hintText()).toBe('Ctrl K');
  });

  it('falls back to the legacy platform regex for Macs when userAgentData is absent', () => {
    stubNav({ platform: 'MacIntel' });
    renderTrigger();
    expect(hintText()).toBe('⌘K');
  });

  it('defaults to "Ctrl K" when the platform is unknown', () => {
    stubNav({ platform: '' });
    renderTrigger();
    expect(hintText()).toBe('Ctrl K');
  });
});
