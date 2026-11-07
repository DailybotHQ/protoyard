import { afterEach, describe, expect, it } from 'vitest';
import { CONTROL_COST, inPinnedChrome, spotCost } from '../src/shell/badge-placement.ts';

function box(el: HTMLElement, width: number, height: number): void {
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width, height, right: width, bottom: height, x: 0, y: 0 }) as DOMRect;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('demo badge and pinned edge chrome (Dailybot batch 6)', () => {
  it('treats a plain fixed side rail as chrome the badge must not cover', () => {
    const rail = document.createElement('div');
    rail.style.position = 'fixed';
    box(rail, 64, window.innerHeight);
    const empty = document.createElement('div');
    rail.append(empty);
    document.body.append(rail);
    expect(inPinnedChrome(empty)).toBe(true);
    const cost = spotCost({ left: 0, top: 0, width: 32, height: 16 }, () => empty);
    expect(cost).toBeGreaterThanOrEqual(CONTROL_COST);
  });

  it('treats a sticky top bar as chrome', () => {
    const bar = document.createElement('header');
    bar.style.position = 'sticky';
    box(bar, window.innerWidth, 48);
    document.body.append(bar);
    expect(inPinnedChrome(bar)).toBe(true);
  });

  it('ignores a full-viewport pinned app root and static content', () => {
    const root = document.createElement('div');
    root.style.position = 'fixed';
    box(root, window.innerWidth, window.innerHeight);
    const content = document.createElement('p');
    root.append(content);
    document.body.append(root);
    expect(inPinnedChrome(content)).toBe(false);
    const plain = document.createElement('div');
    document.body.append(plain);
    expect(inPinnedChrome(plain)).toBe(false);
  });
});
