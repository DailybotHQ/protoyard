/**
 * Where the "Prototype · simulated data" badge goes when the app is full-bleed.
 * In a frame the badge sits below the stage, outside the screen (app.css), so
 * none of this applies there. Full-bleed, it takes the first corner of the
 * app's box where it covers no control (link, button, field…), preferring one
 * that covers no text either.
 */

export type BadgeCorner = 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';

/** Preference order: bottom-left was the only position before. */
export const BADGE_CORNERS: readonly BadgeCorner[] = [
  'bottom-left',
  'bottom-right',
  'top-left',
  'top-right',
];

/** Distance from the container edges, in CSS px (Tailwind `3`). */
export const BADGE_INSET = 12;

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The badge's box in `corner` of `container`. */
export function cornerRect(
  corner: BadgeCorner,
  container: Rect,
  size: { width: number; height: number },
  inset = BADGE_INSET
): Rect {
  const left = corner.endsWith('left')
    ? container.left + inset
    : container.left + container.width - inset - size.width;
  const top = corner.startsWith('top')
    ? container.top + inset
    : container.top + container.height - inset - size.height;
  return { left, top, width: size.width, height: size.height };
}

/** A grid of points over `rect` (edges included), spaced at most `step` px apart. */
export function samplePoints(rect: Rect, step = 16): [number, number][] {
  const cols = Math.max(2, Math.ceil(rect.width / step) + 1);
  const rows = Math.max(2, Math.ceil(rect.height / step) + 1);
  const points: [number, number][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      points.push([
        rect.left + 1 + ((rect.width - 2) * c) / (cols - 1),
        rect.top + 1 + ((rect.height - 2) * r) / (rows - 1),
      ]);
    }
  }
  return points;
}

/**
 * The first corner with nothing to cover (`blockedAt` counts covered points),
 * else the one that covers the least.
 */
export function pickCorner(blockedAt: (corner: BadgeCorner) => number): BadgeCorner {
  let best: BadgeCorner = BADGE_CORNERS[0] as BadgeCorner;
  let bestCount = Number.POSITIVE_INFINITY;
  for (const corner of BADGE_CORNERS) {
    const count = blockedAt(corner);
    if (count === 0) return corner;
    if (count < bestCount) {
      best = corner;
      bestCount = count;
    }
  }
  return best;
}

/** Elements the badge must never sit on. */
export const INTERACTIVE_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  'summary',
  'label',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="option"]',
  '[role="slider"]',
  '[role="textbox"]',
  '[role="combobox"]',
].join(',');

/** Cost of covering a control at one sample point, against 1 for plain text. */
export const CONTROL_COST = 100;

/**
 * Whether (x, y) is on the text of `el` itself: its own text nodes' line boxes,
 * not the whole element (a full-width heading leaves its right side free).
 * Without layout (no `Range#getClientRects`), any own text counts.
 */
function textAt(el: Element, x: number, y: number): boolean {
  for (const node of el.childNodes) {
    if (node.nodeType !== 3 || !node.textContent?.trim()) continue;
    const range = el.ownerDocument.createRange();
    range.selectNodeContents(node);
    if (typeof range.getClientRects !== 'function') return true;
    const rects = range.getClientRects();
    if (rects.length === 0) return true;
    for (const r of rects) {
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
    }
  }
  return false;
}

/**
 * Picks the corner of `container` where a badge of `size` covers nothing,
 * hit-testing the top element at each sample point (the badge itself has
 * `pointer-events: none`, so it is never hit). A control under a point costs
 * far more than text, so the badge only ever sits on a control when every
 * corner has one.
 */
export function placeBadge(
  container: Rect,
  size: { width: number; height: number },
  hit: (x: number, y: number) => Element | null
): BadgeCorner {
  return pickCorner((corner) => spotCost(cornerRect(corner, container, size), hit));
}

type Hit = (x: number, y: number) => Element | null;

/** What covering `rect` costs: CONTROL_COST per sample point on a control, 1 per point on text. */
export function spotCost(rect: Rect, hit: Hit, step = 16): number {
  let cost = 0;
  for (const [x, y] of samplePoints(rect, step)) {
    const el = hit(x, y);
    if (!el) continue;
    if (el.closest(INTERACTIVE_SELECTOR)) cost += CONTROL_COST;
    else if (textAt(el, x, y)) cost += 1;
  }
  return cost;
}

/** True when the full badge would sit on a control in every corner. */
export function everyCornerBlocked(
  container: Rect,
  size: { width: number; height: number },
  hit: Hit
) {
  return BADGE_CORNERS.every(
    (corner) => spotCost(cornerRect(corner, container, size), hit) >= CONTROL_COST
  );
}

/** Size of the compact badge (the info dot), in CSS px. */
export const COMPACT_SIZE = 20;
/** Distance of the compact badge from the container edges. */
export const COMPACT_INSET = 4;

/**
 * Where the info dot may go, in order: the four corners, then every `step`
 * px along the bottom edge, then along the top edge (left to right). Phone
 * apps put controls in the corners (back, menu, more actions) but leave gaps
 * between them.
 */
export function compactSpots(container: Rect, step = 8): Rect[] {
  const size = { width: COMPACT_SIZE, height: COMPACT_SIZE };
  const spots = BADGE_CORNERS.map((corner) => cornerRect(corner, container, size, COMPACT_INSET));
  const minX = container.left + COMPACT_INSET;
  const maxX = container.left + container.width - COMPACT_INSET - COMPACT_SIZE;
  for (const top of [
    container.top + container.height - COMPACT_INSET - COMPACT_SIZE,
    container.top + COMPACT_INSET,
  ]) {
    for (let left = minX + step; left < maxX; left += step) spots.push({ left, top, ...size });
  }
  return spots;
}

/**
 * The first spot for the info dot that covers nothing, else the least
 * covered one (text before controls, by `spotCost`'s weights).
 */
export function placeCompact(container: Rect, hit: Hit): Rect {
  let best: Rect | undefined;
  let bestCost = Number.POSITIVE_INFINITY;
  for (const spot of compactSpots(container)) {
    const cost = spotCost(spot, hit, 6);
    if (cost === 0) return spot;
    if (cost < bestCost) {
      best = spot;
      bestCost = cost;
    }
  }
  return best as Rect;
}
