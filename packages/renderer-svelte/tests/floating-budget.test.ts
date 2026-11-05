import { describe, expect, it } from 'vitest';
import {
  cachedHit,
  FLOATING_PROBE_BUDGET,
  floatingSpots,
  pickFloatingSpot,
} from '../src/shell/floating.ts';

/**
 * Dailybot G-037: on pages of 15,000+ elements every probe is expensive, so
 * one placement must stay within a fixed number of distinct probes.
 */
describe('floating placement probe budget', () => {
  const container = { left: 0, top: 0, width: 1280, height: 800 };
  const size = { width: 160, height: 40 };

  it('probes at most the budget on a page where every point is a control', () => {
    const button = document.createElement('button');
    let calls = 0;
    const spot = pickFloatingSpot(container, size, () => {
      calls++;
      return button;
    });
    expect(calls).toBeLessThanOrEqual(FLOATING_PROBE_BUDGET);
    expect(floatingSpots(container, size)).toContainEqual(spot);
  });

  it('stops at the first free spot after probing only its own samples', () => {
    let calls = 0;
    const spot = pickFloatingSpot(container, size, () => {
      calls++;
      return null;
    });
    expect(spot).toEqual(floatingSpots(container, size)[0]);
    // A free first corner costs only its own samples (21 × 6 at 8 px).
    expect(calls).toBeLessThanOrEqual(126);
  });

  it('caches by a 4 px grid and reports exhaustion', () => {
    let calls = 0;
    const probe = cachedHit(() => {
      calls++;
      return null;
    }, 2);
    probe.hit(10, 10);
    probe.hit(11, 10);
    expect(calls).toBe(1);
    probe.hit(100, 100);
    probe.hit(200, 200);
    expect(calls).toBe(2);
    expect(probe.exhausted()).toBe(true);
  });
});

describe('demo badge obstacles (Dailybot G-052)', () => {
  it('counts navigation and images, such as a logo, as controls', async () => {
    const { CONTROL_COST, spotCost } = await import('../src/shell/badge-placement.ts');
    const nav = document.createElement('nav');
    const navBackground = nav.appendChild(document.createElement('div'));
    const logo = document.createElement('img');
    const rect = { left: 0, top: 0, width: 20, height: 10 };
    expect(spotCost(rect, () => navBackground, 16)).toBeGreaterThanOrEqual(CONTROL_COST);
    expect(spotCost(rect, () => logo, 16)).toBeGreaterThanOrEqual(CONTROL_COST);
    expect(spotCost(rect, () => document.createElement('div'), 16)).toBe(0);
  });
});
