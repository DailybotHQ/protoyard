import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONTROL_COST, type Rect } from '../src/shell/badge-placement.ts';
import {
  FLOATING_EVENT,
  FLOATING_INSET,
  floatingSpots,
  pickFloatingSpot,
  placeFloating,
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

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
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

  it('pins the element by its corner sides and tells the badge it moved', () => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => null });
    Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: () => [] });
    const element = document.body.appendChild(document.createElement('nav'));
    const handle = element.appendChild(document.createElement('button'));
    handle.getBoundingClientRect = () => ({
      ...SIZE,
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 40,
      bottom: 40,
      toJSON: () => ({}),
    });
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
    // Same spot again: no event, so the badge and the toolbar never ping-pong.
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(200);
    expect(moved).toHaveBeenCalledTimes(1);
    placement.destroy();
    window.removeEventListener(FLOATING_EVENT, moved);
  });

  it('looks through itself: a control under its current spot still counts', () => {
    vi.useFakeTimers();
    const element = document.body.appendChild(document.createElement('nav'));
    const handle = element.appendChild(document.createElement('button'));
    handle.getBoundingClientRect = () =>
      ({
        ...SIZE,
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 40,
        bottom: 40,
        toJSON: () => ({}),
      }) as DOMRect;
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
});
