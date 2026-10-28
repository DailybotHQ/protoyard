/**
 * Pointer helpers kept for `@protoyard/views-ui/board` consumers. Texuli 0.3.0
 * exported them from `@texuli/data/board`; 0.4.0 moved board dragging onto
 * `@texuli/drag` and dropped them, so Protoyard keeps the same behavior here.
 */

/** Pixels a pointer moves before a press becomes a drag. */
export const DRAG_THRESHOLD_PX = 4;

/** Index before the first item whose vertical midpoint is below the pointer. */
export function indexFromPointer(middles: readonly number[], y: number): number {
  const index = middles.findIndex((middle) => y < middle);
  return index === -1 ? middles.length : index;
}
