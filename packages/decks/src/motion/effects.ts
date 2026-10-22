/** Effects a catalog prop can request when its authored step is reached. */
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
