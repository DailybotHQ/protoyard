import { fitScale } from '@texuli/slides/layouts';

/**
 * Free-slide content fit: `@texuli/slides/layouts`' `fitContent` plus the
 * oscillation guard Protoyard's former `design/fit.ts` had (`keepsZoom`).
 *
 * Texuli's attachment resets the zoom and measures again on every resize of
 * the box. Blocks that lay out at their measured width (a Texuli chart, the
 * chart explorer) reflow when the zoom is reset, the box resizes, the fit runs
 * again and puts the zoom back: the zoom flips every frame and the slide never
 * holds still (the flagship's `explore` slide did, in both levels). Remove this
 * file and import `fitContent` from `@texuli/slides/layouts` again once the
 * Texuli attachment keeps a zoom under which the content still fits.
 */

/** Why a fit runs again: a box resized, or the content itself changed. */
export type FitReason = 'resize' | 'content';

/**
 * Whether a re-fit may keep the zoom it already applied instead of resetting
 * and measuring again. Measuring with the zoom reset reads a layout the
 * content has not reflowed to yet (a block sized for the zoomed width), which
 * can find "it fits", drop the zoom, and flip back a frame later, forever. So
 * a resize keeps a zoom under which the content still fits, or the floor zoom
 * (content taller than the floor allows cannot shrink further, and measuring
 * again only flips between the floor and a near guess), unless the space
 * around it changed; new content always measures from scratch.
 */
export function keepsZoom(state: {
  applied: number;
  reason: FitReason;
  spaceChanged: boolean;
  fitsAtApplied: boolean;
  /** The floor zoom (`fitContent`'s `min`). */
  min: number;
}): boolean {
  return (
    state.applied < 1 &&
    state.reason === 'resize' &&
    !state.spaceChanged &&
    (state.fitsAtApplied || state.applied <= state.min)
  );
}

function watch(node: HTMLElement, run: (reason: FitReason) => void): () => void {
  if (typeof requestAnimationFrame !== 'function') return () => {};
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
 * own box, never below `min` (0.75, the floor of the stage's layouts, keeps
 * 24 px body text at the 18 px label minimum). Same contract and attribute
 * (`data-tx-deck-fit`) as `@texuli/slides/layouts`' `fitContent`.
 */
export function fitContent(min = 0.75) {
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
          min,
        })
      ) {
        return;
      }
      node.style.zoom = '';
      if (node.clientHeight === 0) return;
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
      node.dataset.txDeckFit = scale < 1 ? String(scale) : '1';
      applied = scale;
      space = now;
    });
  };
}
