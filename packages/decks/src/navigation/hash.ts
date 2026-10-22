/**
 * Pure deep-link helpers for deck location. The hash router owns
 * `location.hash`; these only parse and format strings.
 *
 * Format: `#/<slide-id>/<step>` where `slide-id` is a lowercase slug and
 * `step` is a non-negative integer. Hostile or malformed input yields null.
 */

/** Maximum slide-id length accepted in a hash (matches schema slug bound). */
export const DECK_HASH_ID_MAX = 64;

/** Maximum step index accepted in a hash (matches deck step cap). */
export const DECK_HASH_STEP_MAX = 32;

const SLIDE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

export type DeckHashLocation = {
  slideId: string;
  step: number;
};

/**
 * Parse a deck deep link. Accepts `#/id/step`, `#/id`, `/id/step`, or `id/step`.
 * Returns `null` for empty, hostile, or malformed input (never throws).
 */
export function parseDeckHash(raw: string | null | undefined): DeckHashLocation | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 256) return null;
  // Strip a leading hash and optional single leading slash.
  let value = raw.startsWith('#') ? raw.slice(1) : raw;
  if (value.startsWith('/')) value = value.slice(1);
  // Reject query strings, extra fragments, backslashes and traversal.
  if (
    value.includes('?') ||
    value.includes('#') ||
    value.includes('\\') ||
    value.includes('..') ||
    value.includes('//') ||
    value.includes('%')
  ) {
    return null;
  }
  const parts = value.split('/');
  if (parts.length < 1 || parts.length > 2) return null;
  const slideId = parts[0] ?? '';
  if (!SLIDE_ID.test(slideId) || slideId.length > DECK_HASH_ID_MAX) return null;

  let step = 0;
  if (parts.length === 2) {
    const stepRaw = parts[1] ?? '';
    if (!/^\d{1,3}$/.test(stepRaw)) return null;
    step = Number(stepRaw);
    if (!Number.isInteger(step) || step < 0 || step > DECK_HASH_STEP_MAX) return null;
  }
  return { slideId, step };
}

/**
 * Format a deck deep link as `#/<slide-id>/<step>`. Clamps step to ≥ 0.
 * Returns `#/` when the id is empty or invalid (callers should prefer a real id).
 */
export function formatDeckHash(slideId: string, step = 0): string {
  const id = typeof slideId === 'string' && SLIDE_ID.test(slideId) ? slideId : '';
  const safeStep = Number.isFinite(step)
    ? Math.max(0, Math.min(DECK_HASH_STEP_MAX, Math.floor(step)))
    : 0;
  if (!id) return '#/';
  return `#/${id}/${safeStep}`;
}
