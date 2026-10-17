export type PageToken = number | 'ellipsis-start' | 'ellipsis-end';

/**
 * Page numbers to render, always keeping first/last and `siblings` around the current page.
 * The token count is stable (when there are enough pages) so the control does not jump around.
 */
export function getPageTokens(page: number, pageCount: number, siblings = 1): PageToken[] {
  const total = Math.max(1, pageCount);
  const current = Math.min(Math.max(1, page), total);
  const slots = siblings * 2 + 5;
  if (total <= slots) return Array.from({ length: total }, (_, i) => i + 1);

  const left = Math.max(current - siblings, 1);
  const right = Math.min(current + siblings, total);
  const showStart = left > 3;
  const showEnd = right < total - 2;

  if (!showStart) {
    const count = siblings * 2 + 3;
    return [...Array.from({ length: count }, (_, i) => i + 1), 'ellipsis-end', total];
  }
  if (!showEnd) {
    const count = siblings * 2 + 3;
    return [1, 'ellipsis-start', ...Array.from({ length: count }, (_, i) => total - count + 1 + i)];
  }
  const middle = Array.from({ length: right - left + 1 }, (_, i) => left + i);
  return [1, 'ellipsis-start', ...middle, 'ellipsis-end', total];
}
