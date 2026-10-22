import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONTROL_COST, type Rect } from '../src/shell/badge-placement.ts';
import {
  FIXED_RIGHT_EDGE_VAR,
  FLOATING_EVENT,
  FLOATING_INSET,
  floatingSpots,
  pickFloatingSpot,
  placeFloating,
  trackFixedRightEdge,
  visiblePlacementContainer,
  visibleRightEdge,
} from '../src/shell/floating.ts';

const VIEW: Rect = { left: 0, top: 0, width: 400, height: 800 };
const SIZE = { width: 40, height: 40 };
const inside = (r: Rect, x: number, y: number) =>
  x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height;
/** A hit test over plain boxes: a button wherever `controls` are, nothing elsewhere. */
function hitFor(controls: Rect[]) {
  const button = document.createElement('button');
  return (x: number, y: number) => (controls.some((r) => inside(r, x, y)) ? button : null);
}

function stubHandle(handle: HTMLElement, size = SIZE) {
  handle.getBoundingClientRect = () =>
    ({
      ...size,
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: size.width,
      bottom: size.height,
      toJSON: () => ({}),
    }) as DOMRect;
}

function stubVisualViewport(
  value: {
    width: number;
    height: number;
    offsetLeft?: number;
    offsetTop?: number;
    addEventListener?: (type: string, fn: EventListener) => void;
    removeEventListener?: (type: string, fn: EventListener) => void;
  } | null
) {
  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: value
      ? {
          offsetLeft: 0,
          offsetTop: 0,
          addEventListener() {},
          removeEventListener() {},
          ...value,
        }
      : null,
  });
}

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
  stubVisualViewport(null);
});

describe('floating chrome placement', () => {
  it('starts bottom-right (the badge prefers bottom-left), then the other corners, then edge gaps', () => {
    const spots = floatingSpots(VIEW, SIZE);
    expect(spots[0]).toEqual({
      left: 400 - FLOATING_INSET - 40,
      top: 800 - FLOATING_INSET - 40,
      ...SIZE,
    });
    expect(spots[1]).toMatchObject({ left: 348, top: FLOATING_INSET });
    expect(spots.length).toBeGreaterThan(4);
  });

  it('skips spots over app controls and over the demo badge', () => {
    // A tab bar along the bottom and a header button top-right.
    const controls = [
      { left: 0, top: 740, width: 400, height: 60 },
      { left: 330, top: 0, width: 70, height: 60 },
    ];
    const spot = pickFloatingSpot(VIEW, SIZE, hitFor(controls));
    expect(spot).toMatchObject({ left: FLOATING_INSET, top: FLOATING_INSET }); // top-left is free
    // With the badge there, it moves along the top edge instead of sitting on it.
    const badge = { left: 8, top: 8, width: 60, height: 24 };
    const next = pickFloatingSpot(VIEW, SIZE, hitFor(controls), [badge]);
    expect(next.top).toBe(FLOATING_INSET);
    expect(next.left).toBeGreaterThanOrEqual(badge.left + badge.width);
    expect(next.left + next.width).toBeLessThanOrEqual(330);
  });

  it('takes the cheapest spot when every spot covers a control, but never prefers the badge', () => {
    const everything = [VIEW];
    const badge = { left: 0, top: 700, width: 400, height: 100 };
    const spot = pickFloatingSpot(VIEW, SIZE, hitFor(everything), [badge]);
    expect(spot.top + spot.height).toBeLessThanOrEqual(badge.top); // a top spot: same control cost, no badge
    expect(CONTROL_COST).toBeGreaterThan(1);
  });

  it('visiblePlacementContainer uses visual viewport size and offsets', () => {
    expect(
      visiblePlacementContainer({
        innerWidth: 1200,
        innerHeight: 900,
        visualViewport: {
          width: 390,
          height: 700,
          offsetLeft: 24,
          offsetTop: 40,
        } as VisualViewport,
      })
    ).toEqual({ left: 24, top: 40, width: 390, height: 700 });
    expect(
      visiblePlacementContainer({
        innerWidth: 800,
        innerHeight: 600,
        visualViewport: null,
      })
    ).toEqual({ left: 0, top: 0, width: 800, height: 600 });
  });

  it('pins the element by its corner sides and tells the badge it moved', () => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => null });
    Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: () => [] });
    const element = document.body.appendChild(document.createElement('nav'));
    const handle = element.appendChild(document.createElement('button'));
    stubHandle(handle);
    const moved = vi.fn();
    window.addEventListener(FLOATING_EVENT, moved);
    const placement = placeFloating(element, { handle: () => handle });
    vi.advanceTimersByTime(200);
    expect(element.style.position).toBe('fixed');
    expect(element.style.left).toBe('auto');
    expect(element.style.right).toBe(`${FLOATING_INSET}px`);
    expect(element.style.bottom).toBe(`${FLOATING_INSET}px`);
    expect(element.dataset.pyFloatX).toBe('right');
    expect(element.dataset.pyFloatY).toBe('bottom');
    expect(moved).toHaveBeenCalledTimes(1);
    expect(element.style.transition).toBe('none');
    const firstPlacement = element.getAttribute('style');
    // Same spot again: no style movement or event, so the badge and toolbar
    // never ping-pong when an observer measures an unchanged layout.
    placement.update();
    expect(element.getAttribute('style')).toBe(firstPlacement);
    expect(moved).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(200);
    expect(moved).toHaveBeenCalledTimes(1);
    placement.destroy();
    window.removeEventListener(FLOATING_EVENT, moved);
  });

  it('keeps the anchor when the toolbar expands and ignores its own action-row mutation', async () => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => null });
    Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: () => [] });
    const element = document.body.appendChild(document.createElement('nav'));
    const handle = element.appendChild(document.createElement('button'));
    let expanded = false;
    stubHandle(handle);
    const fullRect = vi.fn(() => ({
      left: 0,
      top: 0,
      width: expanded ? 260 : 40,
      height: 40,
      right: expanded ? 260 : 40,
      bottom: 40,
      toJSON: () => ({}),
    }));
    element.getBoundingClientRect = fullRect as unknown as () => DOMRect;
    const moved = vi.fn();
    window.addEventListener(FLOATING_EVENT, moved);
    const placement = placeFloating(element, { handle: () => handle });
    const collapsedPlacement = element.getAttribute('style');

    expanded = true;
    placement.update();
    const expandedPlacement = element.getAttribute('style');
    placement.update();

    expect(element.getAttribute('style')).toBe(expandedPlacement);
    expect(element.style.right).toBe(`${FLOATING_INSET}px`);
    expect(element.style.bottom).toBe(`${FLOATING_INSET}px`);
    expect(expandedPlacement).toBe(collapsedPlacement);
    expect(moved).toHaveBeenCalledTimes(1);

    const readsBeforeOwnMutation = fullRect.mock.calls.length;
    element.appendChild(document.createElement('div'));
    await Promise.resolve();
    vi.advanceTimersByTime(200);
    expect(fullRect).toHaveBeenCalledTimes(readsBeforeOwnMutation);
    expect(element.getAttribute('style')).toBe(expandedPlacement);

    placement.destroy();
    window.removeEventListener(FLOATING_EVENT, moved);
  });

  it('looks through itself: a control under its current spot still counts', () => {
    vi.useFakeTimers();
    const element = document.body.appendChild(document.createElement('nav'));
    const handle = element.appendChild(document.createElement('button'));
    stubHandle(handle);
    const appControl = document.body.appendChild(document.createElement('a'));
    appControl.setAttribute('href', '#/profile');
    const W = window.innerWidth;
    const H = window.innerHeight;
    // The element covers the bottom-right corner; under it, an app link (a tab bar item).
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: (x: number, y: number) => (x > W - 60 && y > H - 60 ? [handle, appControl] : []),
    });
    const placement = placeFloating(element, { handle: () => handle });
    vi.advanceTimersByTime(200);
    expect(element.dataset.pyFloatY).not.toBeUndefined();
    expect(`${element.dataset.pyFloatX}-${element.dataset.pyFloatY}`).not.toBe('right-bottom');
    placement.destroy();
  });

  it('avoids a fixed mobile tab bar before the first user interaction', () => {
    vi.useFakeTimers();
    const element = document.body.appendChild(document.createElement('nav'));
    const handle = element.appendChild(document.createElement('button'));
    stubHandle(handle);
    const appControl = document.body.appendChild(document.createElement('a'));
    appControl.setAttribute('href', '#/more');
    const footer = document.body.appendChild(document.createElement('div'));
    footer.dataset.pyBottomNav = '';
    footer.getBoundingClientRect = () =>
      ({ left: 0, top: 740, width: 400, height: 60, right: 400, bottom: 800 }) as DOMRect;
    stubVisualViewport({ width: 400, height: 800 });
    const W = window.innerWidth;
    const H = window.innerHeight;
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: (x: number, y: number) => (x > W - 60 && y > H - 60 ? [handle, appControl] : []),
    });

    const placement = placeFloating(element, { handle: () => handle });

    expect(`${element.dataset.pyFloatX}-${element.dataset.pyFloatY}`).not.toBe('right-bottom');
    placement.destroy();
  });

  it('avoids the demo badge rect and review overlay when probing hits', () => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => null });
    const element = document.body.appendChild(document.createElement('nav'));
    const handle = element.appendChild(document.createElement('button'));
    stubHandle(handle);
    const badge = document.body.appendChild(document.createElement('div'));
    badge.setAttribute('data-py-demo-badge', '');
    badge.getBoundingClientRect = () =>
      ({
        left: window.innerWidth - 80,
        top: window.innerHeight - 40,
        width: 70,
        height: 28,
        right: window.innerWidth - 10,
        bottom: window.innerHeight - 12,
        toJSON: () => ({}),
      }) as DOMRect;
    const review = document.body.appendChild(document.createElement('div'));
    review.setAttribute('data-py-review-overlay', '');
    const appControl = document.body.appendChild(document.createElement('button'));
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: (x: number, y: number) => {
        const hits: Element[] = [];
        if (x > window.innerWidth - 90 && y > window.innerHeight - 50) hits.push(badge, handle);
        if (x > window.innerWidth - 60 && y < 60) hits.push(review, appControl);
        return hits;
      },
    });

    const placement = placeFloating(element, { handle: () => handle });
    // Bottom-right is the badge; top-right is under review/app control → not right-bottom.
    expect(`${element.dataset.pyFloatX}-${element.dataset.pyFloatY}`).not.toBe('right-bottom');
    placement.destroy();
  });

  it('uses visual viewport coordinates when mobile layout viewport is wider', () => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => null });
    Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: () => [] });
    const element = document.body.appendChild(document.createElement('nav'));
    const handle = element.appendChild(document.createElement('button'));
    stubHandle(handle);
    stubVisualViewport({ width: 390, height: 844 });

    const placement = placeFloating(element, { handle: () => handle });

    expect(element.style.right).toBe('auto');
    expect(element.style.left).not.toBe('');
    expect(element.style.bottom).toBe('auto');
    expect(element.style.top).not.toBe('');
    // A right-anchored row would grow past the visual edge. Grow left instead.
    expect(element.dataset.pyFloatX).toBe('left');
    placement.destroy();
  });

  it('pins an expanded bar to the visual left so its last action stays on screen', () => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => null });
    Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: () => [] });
    const element = document.body.appendChild(document.createElement('nav'));
    const handle = element.appendChild(document.createElement('button'));
    stubHandle(handle);
    element.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 420,
        height: 40,
        right: 420,
        bottom: 40,
        toJSON: () => ({}),
      }) as DOMRect;
    stubVisualViewport({ width: 390, height: 844 });

    const placement = placeFloating(element, { handle: () => handle });

    expect(element.style.left).toBe('12px');
    expect(element.style.right).toBe('auto');
    expect(element.dataset.pyFloatX).toBe('left');
    placement.destroy();
  });

  it('applies visual viewport offsetLeft/offsetTop to the placed left/top', () => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => null });
    Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: () => [] });
    const element = document.body.appendChild(document.createElement('nav'));
    const handle = element.appendChild(document.createElement('button'));
    stubHandle(handle);
    stubVisualViewport({ width: 390, height: 700, offsetLeft: 30, offsetTop: 50 });

    const placement = placeFloating(element, { handle: () => handle });

    // Free bottom-right of the offset container → left = offset + width - inset - size.
    expect(element.style.left).toBe(`${30 + 390 - FLOATING_INSET - 40}px`);
    expect(element.style.top).toBe(`${50 + 700 - FLOATING_INSET - 40}px`);
    expect(element.style.right).toBe('auto');
    expect(element.style.bottom).toBe('auto');
    placement.destroy();
  });

  it('repositions on visualViewport resize without a layout window resize', () => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => null });
    Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: () => [] });
    const element = document.body.appendChild(document.createElement('nav'));
    const handle = element.appendChild(document.createElement('button'));
    stubHandle(handle);

    const listeners = new Map<string, Set<EventListener>>();
    const makeVv = (width: number, height: number) => ({
      width,
      height,
      offsetLeft: 0,
      offsetTop: 0,
      addEventListener(type: string, fn: EventListener) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)?.add(fn);
      },
      removeEventListener(type: string, fn: EventListener) {
        listeners.get(type)?.delete(fn);
      },
    });
    stubVisualViewport(makeVv(390, 844));

    const placement = placeFloating(element, { handle: () => handle });
    expect(listeners.get('resize')?.size).toBe(1);
    expect(listeners.get('scroll')?.size).toBe(1);

    const firstLeft = element.style.left;
    expect(Number.parseFloat(firstLeft)).toBe(390 - FLOATING_INSET - 40);

    // Phones fire visualViewport.resize when the keyboard opens. Swap the
    // viewport object (as a real browser would re-measure) and call the
    // registered listener path via update().
    stubVisualViewport(makeVv(300, 844));
    for (const fn of [...(listeners.get('resize') ?? [])]) fn(new Event('resize'));
    placement.update();
    expect(Number.parseFloat(element.style.left)).toBe(300 - FLOATING_INSET - 40);
    expect(Number.parseFloat(element.style.left)).toBeLessThan(Number.parseFloat(firstLeft));

    placement.destroy();
    // destroy unhooks the original vv reference captured at mount.
    expect(listeners.get('resize')?.size ?? 0).toBe(0);
    expect(listeners.get('scroll')?.size ?? 0).toBe(0);
  });

  it('does not reschedule when only the floating element mutates itself', async () => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => null });
    Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: () => [] });
    const app = document.body.appendChild(document.createElement('div'));
    app.id = 'app';
    const element = document.body.appendChild(document.createElement('nav'));
    const handle = element.appendChild(document.createElement('button'));
    stubHandle(handle);
    const placeReads = vi.fn();
    const originalRect = handle.getBoundingClientRect;
    handle.getBoundingClientRect = () => {
      placeReads();
      return originalRect.call(handle);
    };

    const placement = placeFloating(element, { handle: () => handle });
    // Drain the mount schedule so later reads are only from new work.
    vi.advanceTimersByTime(200);
    const readsAfterMount = placeReads.mock.calls.length;

    element.appendChild(document.createElement('span'));
    await Promise.resolve();
    vi.advanceTimersByTime(200);
    expect(placeReads).toHaveBeenCalledTimes(readsAfterMount);

    // An app DOM change still schedules a re-place.
    app.appendChild(document.createElement('section'));
    await Promise.resolve();
    vi.advanceTimersByTime(200);
    expect(placeReads.mock.calls.length).toBeGreaterThan(readsAfterMount);

    placement.destroy();
  });
});

describe('the visible right edge for fixed chrome', () => {
  const viewport = (values: { width: number; offsetLeft: number }) =>
    Object.assign(new EventTarget(), { height: 700, offsetTop: 0, ...values });

  it('is the layout width hidden to the right of the visual viewport, never negative', () => {
    const vv = (width: number, offsetLeft: number) =>
      ({ width, offsetLeft }) as unknown as VisualViewport;
    expect(visibleRightEdge({ innerWidth: 980, visualViewport: vv(390, 0) })).toBe(590);
    expect(visibleRightEdge({ innerWidth: 980, visualViewport: vv(390, 100) })).toBe(490);
    expect(visibleRightEdge({ innerWidth: 390, visualViewport: vv(390, 0) })).toBe(0);
    expect(visibleRightEdge({ innerWidth: 390, visualViewport: vv(390.4, 0.3) })).toBe(0);
    expect(visibleRightEdge({ innerWidth: 800, visualViewport: null })).toBe(0);
  });

  it('keeps --py-fixed-right-edge current on visual viewport changes and removes it on stop', () => {
    const vv = viewport({ width: 390, offsetLeft: 0 });
    const win = Object.assign(new EventTarget(), {
      innerWidth: 980,
      visualViewport: vv,
    }) as unknown as Window;
    const root = document.createElement('html');
    const stop = trackFixedRightEdge(root, win);
    expect(root.style.getPropertyValue(FIXED_RIGHT_EDGE_VAR)).toBe('590px');

    Object.assign(vv, { offsetLeft: 200 });
    vv.dispatchEvent(new Event('scroll'));
    expect(root.style.getPropertyValue(FIXED_RIGHT_EDGE_VAR)).toBe('390px');

    Object.assign(vv, { width: 780 });
    vv.dispatchEvent(new Event('resize'));
    expect(root.style.getPropertyValue(FIXED_RIGHT_EDGE_VAR)).toBe('0px');

    Object.assign(win, { innerWidth: 1000 });
    win.dispatchEvent(new Event('resize'));
    expect(root.style.getPropertyValue(FIXED_RIGHT_EDGE_VAR)).toBe('20px');

    stop();
    expect(root.style.getPropertyValue(FIXED_RIGHT_EDGE_VAR)).toBe('');
    Object.assign(vv, { offsetLeft: 0, width: 100 });
    vv.dispatchEvent(new Event('resize'));
    expect(root.style.getPropertyValue(FIXED_RIGHT_EDGE_VAR)).toBe('');
  });
});
