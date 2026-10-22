/**
 * The fragment vocabulary, in a leaf module so the deck schema can validate
 * step markers without importing the motion engine (which imports the schema).
 */

/** Fragment effects (the site's fragment classes). */
export const FRAGMENT_EFFECTS = [
  'fade-up',
  'in',
  'out',
  'in-then-out',
  'grow',
  'shrink',
  'highlight',
  'strike',
] as const;
export type FragmentEffect = (typeof FRAGMENT_EFFECTS)[number];

export function isFragmentEffect(value: unknown): value is FragmentEffect {
  return typeof value === 'string' && (FRAGMENT_EFFECTS as readonly string[]).includes(value);
}

/** The block contract's `reveal` words, also accepted in catalog props markers. */
export const REVEAL_WORDS = ['fade', 'fade-up', 'grow', 'highlight', 'strike'] as const;

/** Authored step numbers a marker or block may use (renumbered densely at runtime). */
export const MAX_AUTHORED_STEP = 1_000;
