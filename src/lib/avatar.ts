/** Initials and a stable per-user tint, so avatars never change colour, and the picture's size and limit. */

/** A profile picture is this many pixels square, at most AVATAR_MAX_BYTES. */
export const AVATAR_SIZE = 256;
export const AVATAR_MAX_BYTES = 512 * 1024;

export const AVATAR_TINTS = 10;

/**
 * The step between consecutive ids. Coprime with AVATAR_TINTS, so the cycle
 * still visits every hue, but ids 1 and 2 land on opposite sides of the wheel
 * instead of next door to each other — the first few people to sign up are the
 * ones most likely to be on screen together.
 */
const TINT_STEP = 7;

/**
 * Pick one of the ten identity hues from the user's id. Deterministic, so the
 * same person is the same colour in every list, on every machine.
 */
export function avatarTint(userId: number): number {
  return ((Math.abs(userId) * TINT_STEP) % AVATAR_TINTS) + 1;
}

/**
 * Up to two initials. Takes the first letter of the first and last words, so
 * "Ada Lovelace" is AL and "ada" is A. Falls back to "?" for a blank name.
 */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = [...words[0]!][0] ?? '';
  if (words.length === 1) return first.toLocaleUpperCase();
  const last = [...words[words.length - 1]!][0] ?? '';
  return `${first}${last}`.toLocaleUpperCase();
}
