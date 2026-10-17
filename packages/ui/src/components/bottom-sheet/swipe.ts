/**
 * Swipe-to-dismiss decision for sheets: far enough (a quarter of the sheet,
 * at least 80px) or a quick flick downwards.
 */
export const SWIPE_MIN_DISTANCE = 80;
export const SWIPE_FLICK_VELOCITY = 0.6; // px per ms

export function shouldDismissSwipe(input: {
  distance: number;
  height: number;
  durationMs: number;
}): boolean {
  if (input.distance <= 0) return false;
  const threshold = Math.max(SWIPE_MIN_DISTANCE, input.height * 0.25);
  if (input.distance >= threshold) return true;
  const velocity = input.distance / Math.max(1, input.durationMs);
  return input.distance >= 24 && velocity >= SWIPE_FLICK_VELOCITY;
}

export function prefersReducedMotion(element: Element | null): boolean {
  if (element?.closest('[data-py-motion="reduce"]')) return true;
  try {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}
