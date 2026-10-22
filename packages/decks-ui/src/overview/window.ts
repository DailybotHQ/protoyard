/**
 * Pure helpers for the overview grid: column count, keyboard moves and
 * windowed ranges so large decks only mount nearby thumbnails.
 */

/** Default number of thumbnails mounted around the selection. */
export const OVERVIEW_WINDOW_RADIUS = 12;

/** Column counts by minimum container width (px). */
export const OVERVIEW_BREAKPOINTS = [
  { minWidth: 900, columns: 4 },
  { minWidth: 640, columns: 3 },
  { minWidth: 0, columns: 2 },
] as const;

export function overviewColumns(containerWidth: number): number {
  const width = Number.isFinite(containerWidth) ? Math.max(0, containerWidth) : 0;
  for (const point of OVERVIEW_BREAKPOINTS) {
    if (width >= point.minWidth) return point.columns;
  }
  return 2;
}

/**
 * Next selected index after an arrow key. Wraps at the ends of the grid.
 * Unknown keys return the current index.
 */
export function moveOverviewSelection(
  current: number,
  key: string,
  total: number,
  columns: number
): number {
  if (total <= 0) return 0;
  const cols = Math.max(1, Math.floor(columns) || 1);
  const index = ((Math.trunc(current) % total) + total) % total;
  switch (key) {
    case 'ArrowRight':
      return (index + 1) % total;
    case 'ArrowLeft':
      return (index - 1 + total) % total;
    case 'ArrowDown':
      return Math.min(total - 1, index + cols);
    case 'ArrowUp':
      return Math.max(0, index - cols);
    case 'Home':
      return 0;
    case 'End':
      return total - 1;
    default:
      return index;
  }
}

/** Inclusive window of indices to mount around `selected`. */
export function overviewWindow(
  selected: number,
  total: number,
  radius: number = OVERVIEW_WINDOW_RADIUS
): { start: number; end: number } {
  if (total <= 0) return { start: 0, end: 0 };
  const r = Math.max(0, Math.floor(radius));
  const index = Math.min(total - 1, Math.max(0, Math.trunc(selected)));
  const start = Math.max(0, index - r);
  const end = Math.min(total, index + r + 1);
  return { start, end };
}

export function isOverviewNavKey(key: string): boolean {
  return (
    key === 'ArrowRight' ||
    key === 'ArrowLeft' ||
    key === 'ArrowUp' ||
    key === 'ArrowDown' ||
    key === 'Home' ||
    key === 'End' ||
    key === 'Enter' ||
    key === ' '
  );
}
