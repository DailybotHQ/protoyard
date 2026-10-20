/**
 * Placement for floating chrome that is not the app (the review toolbar's
 * launcher), sharing the demo badge's rules: take the first spot of the
 * window where it covers no control, preferring one that covers no text, and
 * never sit on the badge. The badge treats the placed element as a control
 * (it is a button), and re-places itself when `FLOATING_EVENT` fires, so the
 * two never cover each other or the app.
 */
import {
  type BadgeCorner,
  CONTROL_COST,
  cornerRect,
  type Rect,
  spotCost,
} from './badge-placement.ts';

/** Fired on `window` after a floating element moved; the demo badge re-checks its corner. */
export const FLOATING_EVENT = 'protoyard:floating';

/** The badge prefers bottom-left; floating chrome starts at the opposite side. */
export const FLOATING_CORNERS: readonly BadgeCorner[] = [
  'bottom-right',
  'top-right',
  'bottom-left',
  'top-left',
];

/** Distance from the window edges, in CSS px. */
export const FLOATING_INSET = 12;

/**
 * Candidate spots for an element of `size`: the four corners, then every
 * `step` px along the bottom edge and the top edge (right to left), the gaps
 * phone apps leave between their corner controls.
 */
export function floatingSpots(
  container: Rect,
  size: { width: number; height: number },
  step = 8,
  inset = FLOATING_INSET
): Rect[] {
  const spots = FLOATING_CORNERS.map((corner) => cornerRect(corner, container, size, inset));
  const minX = container.left + inset;
  const maxX = container.left + container.width - inset - size.width;
  for (const top of [
    container.top + container.height - inset - size.height,
    container.top + inset,
  ]) {
    for (let left = maxX - step; left > minX; left -= step) spots.push({ left, top, ...size });
  }
  return spots;
}

const intersects = (a: Rect, b: Rect) =>
  a.left < b.left + b.width &&
  b.left < a.left + a.width &&
  a.top < b.top + b.height &&
  b.top < a.top + a.height;

/**
 * The first spot that covers no control, no text and none of `avoid` (the
 * badge), else the cheapest one. Covering something in `avoid` costs more
 * than any control, so floating chrome only ever sits on the badge when the
 * window has no other room.
 */
export function pickFloatingSpot(
  container: Rect,
  size: { width: number; height: number },
  hit: (x: number, y: number) => Element | null,
  avoid: readonly Rect[] = []
): Rect {
  let best: Rect | undefined;
  let bestCost = Number.POSITIVE_INFINITY;
  for (const spot of floatingSpots(container, size)) {
    const cost =
      spotCost(spot, hit, 8) +
      avoid.filter((rect) => intersects(spot, rect)).length * CONTROL_COST * 100;
    if (cost === 0) return spot;
    if (cost < bestCost) {
      best = spot;
      bestCost = cost;
    }
  }
  return best as Rect;
}

export interface FloatingPlacement {
  /** Re-checks the spot now (after the element changed size, for example). */
  update(): void;
  destroy(): void;
}

/**
 * Keeps `element` (fixed) in the best spot of the window. Only `handle` (the
 * part that is always shown, e.g. a launcher button) is measured, and the
 * element grows away from its corner: on the right half it is placed by
 * `right`, on the bottom half by `bottom`. Re-checked after resizes,
 * navigation and app DOM changes, in idle time like the badge.
 */
export function placeFloating(
  element: HTMLElement,
  options: { handle?: () => HTMLElement | null } = {}
): FloatingPlacement {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last = '';
  const place = () => {
    if (!element.isConnected || typeof document.elementFromPoint !== 'function') return;
    const handle = options.handle?.() ?? element;
    const box = handle.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const container = { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    const badge = document.querySelector('[data-py-demo-badge]');
    const avoid: Rect[] = [];
    if (badge) {
      const r = badge.getBoundingClientRect();
      if (r.width && r.height)
        avoid.push({ left: r.left, top: r.top, width: r.width, height: r.height });
    }
    // Look THROUGH this element and the badge: the element may already sit on the spot being
    // tested, and the topmost hit would then hide the app control underneath.
    const hit = (x: number, y: number) =>
      (typeof document.elementsFromPoint === 'function'
        ? document.elementsFromPoint(x, y)
        : [document.elementFromPoint(x, y)]
      ).find((el) => el && !element.contains(el) && !badge?.contains(el)) ?? null;
    const spot = pickFloatingSpot(container, { width: box.width, height: box.height }, hit, avoid);
    const right = spot.left + spot.width / 2 > container.width / 2;
    const bottom = spot.top + spot.height / 2 > container.height / 2;
    const style = element.style;
    style.position = 'fixed';
    style.left = right ? 'auto' : `${Math.round(spot.left)}px`;
    style.right = right ? `${Math.round(container.width - spot.left - spot.width)}px` : 'auto';
    style.top = bottom ? 'auto' : `${Math.round(spot.top)}px`;
    style.bottom = bottom ? `${Math.round(container.height - spot.top - spot.height)}px` : 'auto';
    element.dataset.pyFloatX = right ? 'right' : 'left';
    element.dataset.pyFloatY = bottom ? 'bottom' : 'top';
    const key = `${style.left}|${style.right}|${style.top}|${style.bottom}`;
    if (key !== last) {
      last = key;
      window.dispatchEvent(new Event(FLOATING_EVENT));
    }
  };
  const idle = (fn: () => void) =>
    typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 1000 }) : fn();
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => idle(place), 150);
  };
  // A first spot right away (no hit-testing yet), so the element never flashes over the app's top bar.
  element.style.position = 'fixed';
  element.style.right = `${FLOATING_INSET}px`;
  element.style.bottom = `${FLOATING_INSET}px`;
  schedule();
  const observer =
    typeof MutationObserver === 'undefined' ? undefined : new MutationObserver(schedule);
  observer?.observe(document.getElementById('app') ?? document.body, {
    childList: true,
    subtree: true,
  });
  observer?.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-py-shell', 'data-py-viewport'],
  });
  window.addEventListener('resize', schedule);
  window.addEventListener('hashchange', schedule);
  return {
    update: schedule,
    destroy() {
      clearTimeout(timer);
      observer?.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('hashchange', schedule);
    },
  };
}
