/**
 * Compatibility helpers for `@protoyard/views-ui/board` consumers. Texuli
 * 0.4.0 moved insertion indexing to `@texuli/drag/collision` and the pointer
 * threshold to the `@texuli/drag/gesture` tracker option.
 */

import { midpointIndex } from '@texuli/drag/collision';

/** Index before the first midpoint past the pointer, preserving arbitrary input order. */
export function indexFromPointer(middles: readonly number[], y: number): number {
  let ascending = true;
  const first = middles[0];
  if (middles.length > 0 && (first === undefined || Number.isNaN(first))) ascending = false;
  for (let index = 1; index < middles.length; index += 1) {
    if (!ascending) break;
    const previous = middles[index - 1];
    const current = middles[index];
    if (
      previous === undefined ||
      current === undefined ||
      Number.isNaN(previous) ||
      Number.isNaN(current) ||
      current < previous
    ) {
      ascending = false;
      break;
    }
  }
  if (!ascending) {
    const index = middles.findIndex((middle) => y < middle);
    return index === -1 ? middles.length : index;
  }
  return midpointIndex(middles, y);
}

/** Pixels before a press becomes a drag; matches createPointerTracker's default. */
export const DRAG_THRESHOLD_PX = 4;
