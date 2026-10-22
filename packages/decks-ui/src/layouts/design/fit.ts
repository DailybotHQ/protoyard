/**
 * Keeps slide content inside the stage. Layout CSS already clamps lines; these
 * attachments handle what CSS cannot know, such as a free slide with many
 * blocks or an unusually long title, by measuring and shrinking within a floor.
 */

/**
 * The zoom that makes `needed` px fit in `available` px, never above 1 and
 * never below `min`. Zero or invalid sizes (not laid out yet) give 1.
 */
export function fitScale(needed: number, available: number, min: number): number {
  if (!(needed > 0) || !(available > 0)) return 1;
  // A couple of pixels of rounding never justify shrinking a slide.
  if (needed <= available + 2) return 1;
  return Math.max(min, Math.floor((available / needed) * 1000) / 1000);
}

/**
 * The font size that fits, stepping down 6 % at a time from `start` and
 * stopping at `minPx`. `overflows(size)` reports whether `size` still overflows.
 */
export function fitFontSize(
  start: number,
  minPx: number,
  overflows: (size: number) => boolean
): number {
  let size = start;
  let guard = 0;
  while (size > minPx && overflows(size) && guard < 40) {
    size = Math.max(minPx, Math.round(size * 0.94 * 10) / 10);
    guard += 1;
  }
  return size;
}

/**
 * True when a (line-clamped) text box hides content. Glyph ascenders and
 * descenders make `scrollHeight` a few pixels taller than a tight line box
 * even when everything shows, so only half a line or more counts.
 */
export function textOverflows(
  node: Pick<HTMLElement, 'scrollHeight' | 'clientHeight' | 'scrollWidth' | 'clientWidth'>,
  fontSize: number
): boolean {
  const tolerance = Math.max(4, fontSize * 0.5);
  return (
    node.scrollHeight > node.clientHeight + tolerance ||
    node.scrollWidth > node.clientWidth + tolerance
  );
}

function watch(node: HTMLElement, run: () => void): () => void {
  let frame = 0;
  const schedule = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(run);
  };
  schedule();
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
  observer?.observe(node);
  if (node.parentElement) observer?.observe(node.parentElement);
  // Images and fonts change the size after the first measure.
  node.addEventListener('load', schedule, true);
  return () => {
    cancelAnimationFrame(frame);
    observer?.disconnect();
    node.removeEventListener('load', schedule, true);
  };
}

/**
 * Zooms `node` down (CSS `zoom`, so layout follows) until its content fits its
 * own box, never below `min` (default 0.72, which keeps 24 px body text at or
 * above the 18 px label minimum).
 */
export function fitContent(min = 0.72) {
  return (node: HTMLElement) =>
    watch(node, () => {
      node.style.zoom = '';
      const scale = fitScale(node.scrollHeight, node.clientHeight, min);
      node.style.zoom = scale < 1 ? String(scale) : '';
      node.dataset.pyDeckFit = scale < 1 ? String(scale) : '1';
    });
}

/**
 * Steps a single text element's font size down until it no longer overflows
 * its box (CSS sets the starting size and a line clamp), never below `minPx`.
 */
export function fitText(minPx: number) {
  return (node: HTMLElement) =>
    watch(node, () => {
      node.style.fontSize = '';
      const start = Number.parseFloat(getComputedStyle(node).fontSize) || 0;
      if (!start) return;
      const size = fitFontSize(start, minPx, (candidate) => {
        node.style.fontSize = `${candidate}px`;
        return textOverflows(node, candidate);
      });
      node.style.fontSize = size < start ? `${size}px` : '';
    });
}
