import { ACCENTS, type AccentId } from '../theme/accent';

// SPEC-kid-accounts — an account's avatar color is one of the accent ids
// (homepad-api validates it against the same eight). Unknown or unset ("" for
// most adults) reads as the default, blue.
export function avatarColorId(color: string | undefined): AccentId {
  return ACCENTS.find((a) => a.id === color)?.id ?? 'blue';
}

export function avatarSwatch(color: string | undefined): string {
  const id = avatarColorId(color);
  return ACCENTS.find((a) => a.id === id)!.swatch;
}
