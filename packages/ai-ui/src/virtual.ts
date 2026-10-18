export interface VirtualItem {
  index: number;
  start: number;
  size: number;
}

export interface VirtualWindow {
  start: number;
  end: number;
  totalSize: number;
  items: VirtualItem[];
}

export interface ScrollAnchor {
  messageId: string;
  offset: number;
}

const DEFAULT_ESTIMATED_HEIGHT = 120;

function heightAt(
  index: number,
  measuredHeights: readonly number[],
  estimatedHeight: number
): number {
  const measured = measuredHeights[index];
  return measured !== undefined && Number.isFinite(measured) && measured > 0
    ? measured
    : estimatedHeight;
}

function createOffsets(
  count: number,
  measuredHeights: readonly number[],
  estimatedHeight: number
): number[] {
  const offsets = new Array<number>(count + 1);
  offsets[0] = 0;
  for (let index = 0; index < count; index += 1) {
    offsets[index + 1] = (offsets[index] ?? 0) + heightAt(index, measuredHeights, estimatedHeight);
  }
  return offsets;
}

function lowerBound(offset: number, offsets: readonly number[]): number {
  let low = 0;
  let high = offsets.length - 1;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((offsets[middle + 1] ?? 0) <= offset) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** Calculate the visible message window from measured heights, with a bounded overscan. */
export function calculateVirtualWindow(
  count: number,
  scrollTop: number,
  viewportHeight: number,
  measuredHeights: readonly number[] = [],
  estimatedHeight = DEFAULT_ESTIMATED_HEIGHT,
  overscan = 5
): VirtualWindow {
  const safeCount = Math.max(0, Math.floor(count));
  const safeEstimate =
    Number.isFinite(estimatedHeight) && estimatedHeight > 0
      ? estimatedHeight
      : DEFAULT_ESTIMATED_HEIGHT;
  const safeScrollTop = Math.max(0, Number.isFinite(scrollTop) ? scrollTop : 0);
  const safeViewportHeight = Math.max(0, Number.isFinite(viewportHeight) ? viewportHeight : 0);
  const offsets = createOffsets(safeCount, measuredHeights, safeEstimate);
  const totalSize = offsets[safeCount] ?? 0;
  if (safeCount === 0) return { start: 0, end: 0, totalSize, items: [] };

  const firstVisible = Math.min(safeCount - 1, lowerBound(safeScrollTop, offsets));
  const lastVisible = Math.min(
    safeCount,
    lowerBound(safeScrollTop + safeViewportHeight, offsets) + 1
  );
  const safeOverscan = Math.max(0, Math.floor(overscan));
  const start = Math.max(0, firstVisible - safeOverscan);
  const end = Math.min(safeCount, Math.max(firstVisible + 1, lastVisible) + safeOverscan);
  const items: VirtualItem[] = [];
  for (let index = start; index < end; index += 1) {
    items.push({
      index,
      start: offsets[index] ?? 0,
      size: heightAt(index, measuredHeights, safeEstimate),
    });
  }
  return { start, end, totalSize, items };
}

export function captureScrollAnchor(
  messageIds: readonly string[],
  scrollTop: number,
  measuredHeights: readonly number[] = [],
  estimatedHeight = DEFAULT_ESTIMATED_HEIGHT
): ScrollAnchor | null {
  if (messageIds.length === 0) return null;
  const offsets = createOffsets(messageIds.length, measuredHeights, estimatedHeight);
  const index = Math.min(messageIds.length - 1, lowerBound(Math.max(0, scrollTop), offsets));
  return { messageId: messageIds[index] ?? '', offset: scrollTop - (offsets[index] ?? 0) };
}

export function restoreScrollAnchor(
  messageIds: readonly string[],
  anchor: ScrollAnchor | null,
  measuredHeights: readonly number[] = [],
  estimatedHeight = DEFAULT_ESTIMATED_HEIGHT
): number {
  if (messageIds.length === 0 || !anchor) return 0;
  const index = messageIds.indexOf(anchor.messageId);
  if (index < 0) return 0;
  return Math.max(
    0,
    (createOffsets(messageIds.length, measuredHeights, estimatedHeight)[index] ?? 0) + anchor.offset
  );
}

export function saveScrollAnchor(key: string, anchor: ScrollAnchor | null): void {
  if (!anchor || typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(key, JSON.stringify(anchor));
  } catch {
    // Storage can be unavailable in private browsing or quota-constrained contexts.
  }
}

export function loadScrollAnchor(key: string): ScrollAnchor | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    if (
      typeof value === 'object' &&
      value !== null &&
      'messageId' in value &&
      typeof value.messageId === 'string' &&
      'offset' in value &&
      typeof value.offset === 'number' &&
      Number.isFinite(value.offset)
    )
      return { messageId: value.messageId, offset: value.offset };
  } catch {
    // Ignore stale or malformed saved state.
  }
  return null;
}
