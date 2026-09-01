import { describe, expect, it } from 'vitest';
import { userInitials } from './initials';

// v7 §6.2 — the avatar's real-initials derivation, unit-tested in isolation so
// the rule is pinned independently of the menu UI. Rule: first letter of the
// first word + first letter of the last word; a single name word uses its first
// two letters; with no usable name, fall back to the email's first letter. All
// uppercased.
describe('D — userInitials (§6.2 derivation)', () => {
  it('takes first + last word initials for a full name (Caleb Dunn → CD)', () => {
    expect(userInitials({ name: 'Caleb Dunn', email: 'caleb@ohana.io' })).toBe('CD');
  });

  it('uses first+last across three or more words (Mary Jane Watson → MW)', () => {
    expect(userInitials({ name: 'Mary Jane Watson', email: 'mj@ohana.io' })).toBe('MW');
  });

  it('uses the first two letters of a single-word name (Caleb → CA)', () => {
    expect(userInitials({ name: 'Caleb', email: 'caleb@ohana.io' })).toBe('CA');
  });

  it('uppercases a lowercase name (caleb dunn → CD)', () => {
    expect(userInitials({ name: 'caleb dunn', email: 'caleb@ohana.io' })).toBe('CD');
  });

  it('ignores surrounding and internal extra whitespace', () => {
    expect(userInitials({ name: '  Caleb   Dunn  ', email: 'caleb@ohana.io' })).toBe('CD');
  });

  it('falls back to the email first letter when name is empty', () => {
    expect(userInitials({ name: '', email: 'nani@ohana.io' })).toBe('N');
  });

  it('falls back to the email first letter when name is absent', () => {
    expect(userInitials({ email: 'zoe@ohana.io' })).toBe('Z');
  });

  it('uppercases the email fallback letter', () => {
    expect(userInitials({ name: '   ', email: 'lilo@ohana.io' })).toBe('L');
  });
});
