/**
 * Placement for floating chrome that is not the app (the review toolbar's
 * launcher), sharing the demo badge's rules: take the first spot of the
 * *visible* viewport where it covers no control, preferring one that covers
 * no text, and never sit on the badge, bottom nav or review UI. The badge
 * treats the placed element as a control (it is a button), and re-places
 * itself when `FLOATING_EVENT` fires, so the two never cover each other or
 * the app.
 *
 * Phone frames and mobile emulation often expose a layout viewport wider than
 * the visual viewport. Logical `right`/`bottom` on `position: fixed` then land
 * outside the clickable area — so placement measures `window.visualViewport`
 * and, when it is smaller than the layout viewport, pins with explicit visual
 * coordinates.
 */
import { BOTTOM_NAV_SELECTOR } from '@protoyard/ui';
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
 * badge, bottom nav, …), else the cheapest one. Covering something in `avoid`
 * costs more than any control, so floating chrome only ever sits on those
 * regions when the window has no other room.
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

/** Visible client area used for placement (visual viewport when available). */
export function visiblePlacementContainer(
  win: Pick<Window, 'innerWidth' | 'innerHeight' | 'visualViewport'> = window
): Rect {
  const layoutWidth = win.innerWidth;
  const layoutHeight = win.innerHeight;
  const vv = win.visualViewport;
  return {
    left: vv?.offsetLeft ?? 0,
    top: vv?.offsetTop ?? 0,
    width: vv?.width ?? layoutWidth,
    height: vv?.height ?? layoutHeight,
  };
}

/**
 * Where the demo badge may sit, and the origin of its containing block. Under
 * a viewport preset `#app` has a transform, so it is the containing block and
 * the area. Full-bleed, the area is the *visible* viewport (as for floating
 * chrome) while fixed coordinates stay relative to the layout viewport at 0,0.
 */
export function badgeContainer(
  app: Rect | null,
  win: Pick<Window, 'innerWidth' | 'innerHeight' | 'visualViewport'> = window
): { container: Rect; origin: { left: number; top: number } } {
  if (app) return { container: app, origin: { left: app.left, top: app.top } };
  return { container: visiblePlacementContainer(win), origin: { left: 0, top: 0 } };
}

/** Custom property on `<html>`: layout-viewport px hidden to the right of the visual viewport. */
export const FIXED_RIGHT_EDGE_VAR = '--py-fixed-right-edge';

/**
 * How far the layout viewport extends past the visible right edge, in CSS px
 * (0 unless phone emulation, a frame or pinch zoom makes the visual viewport
 * narrower). `position: fixed; right: …` chrome adds it to stay clickable.
 */
export function visibleRightEdge(
  win: Pick<Window, 'innerWidth' | 'visualViewport'> = window
): number {
  const vv = win.visualViewport;
  if (!vv) return 0;
  return Math.max(0, Math.round(win.innerWidth - (vv.offsetLeft + vv.width)));
}

/**
 * Keeps `--py-fixed-right-edge` on `root` equal to `visibleRightEdge()`, so
 * fixed chrome in any package (review toolbar, DevTools launcher, toasts) can
 * use `right: calc(… + var(--py-fixed-right-edge, 0px))`. Returns a stop
 * function that removes the listeners and the property.
 */
export function trackFixedRightEdge(
  root: HTMLElement = document.documentElement,
  win: Window = window
): () => void {
  let last = '';
  const sync = () => {
    const value = `${visibleRightEdge(win)}px`;
    if (value === last) return;
    last = value;
    root.style.setProperty(FIXED_RIGHT_EDGE_VAR, value);
  };
  sync();
  const vv = win.visualViewport;
  win.addEventListener('resize', sync);
  vv?.addEventListener('resize', sync);
  vv?.addEventListener('scroll', sync);
  return () => {
    win.removeEventListener('resize', sync);
    vv?.removeEventListener('resize', sync);
    vv?.removeEventListener('scroll', sync);
    root.style.removeProperty(FIXED_RIGHT_EDGE_VAR);
  };
}

export interface FloatingPlacement {
  /** Re-checks the spot now (after the element changed size, for example). */
  update(): void;
  destroy(): void;
}

/**
 * Keeps `element` (fixed) in the best spot of the visible viewport. Only
 * `handle` (the part that is always shown, e.g. a launcher button) is
 * measured, and the element grows away from its corner: on the right half it
 * is placed by `right`, on the bottom half by `bottom` — except when the
 * visual viewport is smaller than the layout viewport, where explicit left/top
 * visual coordinates keep chrome on screen. Re-checked after resizes, visual
 * viewport changes, navigation and app DOM changes (never its own subtree),
 * in idle time like the badge.
 */
export function placeFloating(
  element: HTMLElement,
  options: { handle?: () => HTMLElement | null } = {}
): FloatingPlacement {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last = '';
  let lastSpot: Rect | undefined;
  let lastHorizontal: 'left' | 'right' | undefined;
  let lastVertical: 'top' | 'bottom' | undefined;

  const place = () => {
    if (!element.isConnected || typeof document.elementFromPoint !== 'function') return;
    const handle = options.handle?.() ?? element;
    const box = handle.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const full = element.getBoundingClientRect();
    const layoutWidth = window.innerWidth;
    const layoutHeight = window.innerHeight;
    const container = visiblePlacementContainer(window);
    const badge = document.querySelector('[data-py-demo-badge]');
    const avoid: Rect[] = [];
    if (badge) {
      const r = badge.getBoundingClientRect();
      if (r.width && r.height)
        avoid.push({ left: r.left, top: r.top, width: r.width, height: r.height });
    }
    // Phone / narrow frames: keep clear of the app's bottom tab bar.
    if (container.width <= 767) {
      const footer = document.querySelector(BOTTOM_NAV_SELECTOR);
      if (footer) {
        const r = footer.getBoundingClientRect();
        if (r.width && r.height)
          avoid.push({ left: r.left, top: r.top, width: r.width, height: r.height });
      }
    }
    const reviewOverlay = document.querySelector('[data-py-review-overlay]');
    const reviewRoot = element.closest('[data-py-review-root]');
    // Look THROUGH this element, the badge, and review capture: any of them may
    // already sit on the spot being tested and hide the app control underneath.
    const hit = (x: number, y: number) =>
      (typeof document.elementsFromPoint === 'function'
        ? document.elementsFromPoint(x, y)
        : [document.elementFromPoint(x, y)]
      ).find(
        (el) =>
          el &&
          !element.contains(el) &&
          !badge?.contains(el) &&
          !reviewOverlay?.contains(el) &&
          !reviewRoot?.contains(el)
      ) ?? null;
    const size = {
      width: Math.min(Math.max(box.width, full.width), container.width - FLOATING_INSET * 2),
      height: Math.max(box.height, full.height),
    };
    // elementsFromPoint can return only this floating layer when it is above
    // the app. Let the probe see the controls underneath, then restore the
    // element's hit target before the user can interact with it.
    const visibility = element.style.visibility;
    element.style.visibility = 'hidden';
    let spot: Rect;
    try {
      spot = pickFloatingSpot(container, size, hit, avoid);
    } finally {
      element.style.visibility = visibility;
    }

    // Keep a valid previous anchor when a size change makes another corner
    // look marginally cheaper. This hysteresis prevents an expanding toolbar
    // from ping-ponging between corners while its action row settles.
    if (lastSpot && lastHorizontal && lastVertical) {
      const preferred: Rect = {
        left:
          lastHorizontal === 'right'
            ? container.left + container.width - FLOATING_INSET - size.width
            : lastSpot.left,
        top:
          lastVertical === 'bottom'
            ? container.top + container.height - FLOATING_INSET - size.height
            : lastSpot.top,
        ...size,
      };
      const inside =
        preferred.left >= container.left + FLOATING_INSET &&
        preferred.top >= container.top + FLOATING_INSET &&
        preferred.left + preferred.width <= container.left + container.width - FLOATING_INSET &&
        preferred.top + preferred.height <= container.top + container.height - FLOATING_INSET;
      const preferredCost =
        spotCost(preferred, hit, 8) +
        avoid.filter((rect) => intersects(preferred, rect)).length * CONTROL_COST * 100;
      if (inside && preferredCost === 0) spot = preferred;
    }

    const right = spot.left + spot.width / 2 > container.left + container.width / 2;
    const bottom = spot.top + spot.height / 2 > container.top + container.height / 2;
    const style = element.style;
    // Mobile emulation can expose a wider layout viewport than the visual
    // viewport. Logical right/bottom offsets then place fixed chrome outside
    // the clickable client area, so use explicit visual coordinates there.
    const visualCoordinates =
      container.width < layoutWidth ||
      container.height < layoutHeight ||
      container.left !== 0 ||
      container.top !== 0;
    // A bar wider than its launcher, pinned with a visual left at the right
    // edge, still grows past the clickable client area. Pin that bar to the
    // visible left and keep document order so every action stays on screen.
    const pinLeft = visualCoordinates && full.width > box.width + 1;
    const left =
      visualCoordinates || !right
        ? `${Math.round(pinLeft ? container.left + FLOATING_INSET : spot.left)}px`
        : 'auto';
    const rightOffset =
      visualCoordinates || !right
        ? 'auto'
        : `${Math.round(container.left + container.width - spot.left - spot.width)}px`;
    const top = visualCoordinates || !bottom ? `${Math.round(spot.top)}px` : 'auto';
    const bottomOffset =
      visualCoordinates || !bottom
        ? 'auto'
        : `${Math.round(container.top + container.height - spot.top - spot.height)}px`;
    const floatX = pinLeft || visualCoordinates ? 'left' : right ? 'right' : 'left';
    const floatY = bottom ? 'bottom' : 'top';
    const anchorY = visualCoordinates ? 'top' : floatY;
    const key = `${left}|${rightOffset}|${top}|${bottomOffset}|${floatX}|${floatY}`;
    if (key === last) return;
    last = key;
    style.position = 'fixed';
    style.setProperty('transition', 'none', 'important');
    style.left = left;
    style.right = rightOffset;
    style.top = top;
    style.bottom = bottomOffset;
    element.dataset.pyFloatX = floatX;
    element.dataset.pyFloatY = floatY;
    lastSpot = {
      left:
        left === 'auto'
          ? container.left + container.width - Number.parseFloat(rightOffset) - size.width
          : Number.parseFloat(left),
      top:
        top === 'auto'
          ? container.top + container.height - Number.parseFloat(bottomOffset) - size.height
          : Number.parseFloat(top),
      ...size,
    };
    lastHorizontal = floatX;
    lastVertical = anchorY;
    window.dispatchEvent(new Event(FLOATING_EVENT));
  };

  const idle = (fn: () => void) =>
    typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 1000 }) : fn();
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => idle(place), 150);
  };

  // Start with a safe fallback, then place synchronously so a fast click cannot
  // hit the launcher while it still overlaps a fixed app control.
  element.style.position = 'fixed';
  element.style.right = `${FLOATING_INSET}px`;
  element.style.bottom = `${FLOATING_INSET}px`;
  place();
  schedule();

  const observer =
    typeof MutationObserver === 'undefined'
      ? undefined
      : new MutationObserver((mutations) => {
          // The expanded review toolbar adds its action row inside this
          // element. Its own size change is handled by the caller's explicit
          // update; observing it again can move the toolbar while a button is
          // being clicked.
          if (mutations.some(({ target }) => !element.contains(target))) schedule();
        });
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
  // Other fixed chrome announces itself: the DevTools launcher mounts in its own
  // host outside #app (often after this element was placed) and moves when it
  // docks or opens. Re-check, or this element can stay under it. Its own event
  // re-checks once and finds the same spot, so two placements never loop.
  window.addEventListener(FLOATING_EVENT, schedule);
  const vv = window.visualViewport;
  vv?.addEventListener('resize', schedule);
  vv?.addEventListener('scroll', schedule);

  return {
    // Callers use update after a synchronous size change (for example when a
    // toolbar opens). Place once; viewport and app-layout observers handle
    // later retries without reacting to the toolbar's own size change.
    update() {
      clearTimeout(timer);
      place();
    },
    destroy() {
      clearTimeout(timer);
      observer?.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('hashchange', schedule);
      window.removeEventListener(FLOATING_EVENT, schedule);
      vv?.removeEventListener('resize', schedule);
      vv?.removeEventListener('scroll', schedule);
    },
  };
}
