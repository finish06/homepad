import { describe, expect, it } from 'vitest';
import { waitMessage } from './waitMessage';

// SPEC-signin-hardening §8, UX §3.1 — one formatter for every 429 wait line:
// the sign-in card, the Join screen, the reset screen and Change password.

describe('waitMessage', () => {
  it.each([
    [undefined, 'a minute'],
    [Number.NaN, 'a minute'],
    [0, 'a minute'],
    [1, 'a minute'],
    [60, 'a minute'],
    [61, '2 minutes'],
    [120, '2 minutes'],
    [899, '15 minutes'],
    [900, '15 minutes'],
  ])('Retry-After %s reads "%s"', (seconds, wait) => {
    expect(waitMessage(seconds)).toBe(`Too many tries. Wait ${wait} and try again.`);
  });
});
