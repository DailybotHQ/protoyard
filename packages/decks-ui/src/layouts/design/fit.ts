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

/** Why a fit runs again: a box resized, or the content itself changed. */
export type FitReason = 'resize' | 'content';

/**
 * Whether a re-fit may keep the zoom it already applied instead of resetting
 * and measuring again. Measuring with the zoom reset reads a layout the
 * content has not reflowed to yet (a block sized for the zoomed width), which
 * can find "it fits", drop the zoom, and flip back a frame later, forever. So
 * a resize keeps a zoom under which the content still fits, unless the space
 * around it changed; new content always measures from scratch.
 */
export function keepsZoom(state: {
  applied: number;
  reason: FitReason;
  spaceChanged: boolean;
  fitsAtApplied: boolean;
}): boolean {
  return (
    state.applied < 1 && state.reason === 'resize' && !state.spaceChanged && state.fitsAtApplied
  );
}

function watch(node: HTMLElement, run: (reason: FitReason) => void): () => void {
  let frame = 0;
  let pending: FitReason = 'content';
  const schedule = (reason: FitReason) => {
    // Content outranks a resize when both arrive in one frame.
    pending = pending === 'content' || reason === 'content' ? 'content' : 'resize';
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const why = pending;
      pending = 'resize';
      run(why);
    });
  };
  schedule('content');
  const resized = () => schedule('resize');
  const changed = () => schedule('content');
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resized) : null;
  observer?.observe(node);
  if (node.parentElement) observer?.observe(node.parentElement);
  // Images and fonts change the size after the first measure.
  node.addEventListener('load', changed, true);
  // Lazy blocks arrive after the first measure without resizing this box, so
  // added content also triggers a re-fit (only nodes, never style changes).
  const mutations = typeof MutationObserver === 'function' ? new MutationObserver(changed) : null;
  mutations?.observe(node, { childList: true, subtree: true });
  return () => {
    cancelAnimationFrame(frame);
    observer?.disconnect();
    mutations?.disconnect();
    node.removeEventListener('load', changed, true);
  };
}

/**
 * Zooms `node` down (CSS `zoom`, so layout follows) until its content fits its
 * own box, never below `min` (default 0.72, which keeps 24 px body text at or
 * above the 18 px label minimum).
 */
export function fitContent(min = 0.72) {
  return (node: HTMLElement) => {
    let applied = 1;
    let space = '';
    const spaceOf = () => {
      const parent = node.parentElement;
      return parent ? `${parent.clientWidth}x${parent.clientHeight}` : '';
    };
    return watch(node, (reason) => {
      const now = spaceOf();
      if (
        keepsZoom({
          applied,
          reason,
          spaceChanged: now !== space,
          fitsAtApplied: node.scrollHeight <= node.clientHeight + 2,
        })
      ) {
        return;
      }
      node.style.zoom = '';
      let scale = fitScale(node.scrollHeight, node.clientHeight, min);
      // Content reflows under the zoom (a wider box, shorter lines), so the
      // first estimate is checked under the zoom itself and tightened until it
      // fits there: the result is a fixed point, not a guess the next frame undoes.
      for (let pass = 0; scale < 1 && pass < 6; pass += 1) {
        node.style.zoom = String(scale);
        if (node.scrollHeight <= node.clientHeight + 2 || scale <= min) break;
        scale = Math.max(
          min,
          Math.floor(scale * (node.clientHeight / node.scrollHeight) * 1000) / 1000
        );
      }
      node.style.zoom = scale < 1 ? String(scale) : '';
      node.dataset.pyDeckFit = scale < 1 ? String(scale) : '1';
      applied = scale;
      space = now;
    });
  };
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
