import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type ClockAdvanceRequest,
  clockRequestForAdvance,
  createScenarioClockHandler,
  createTourController,
  parseTourDefinition,
  resolveTourTarget,
  stepDay,
  type TourDefinition,
  TourDefinitionError,
  TourPlayer,
} from '../src/tours/index.ts';

const DEMO_TOUR: TourDefinition = {
  id: 'story-month',
  title: 'Product story',
  steps: [
    {
      id: 'day-1',
      title: 'Day 1 · Set the rhythm',
      body: 'The first check-ins begin.',
      target: '[data-tour="inbox"]',
      day: 1,
    },
    {
      id: 'day-2',
      title: 'Day 2 · Notice the signal',
      body: 'A first response arrives.',
      target: '[data-tour="attention"]',
      day: 2,
    },
    {
      id: 'day-7',
      title: 'Day 7 · Learn the pattern',
      body: 'A week of work is visible.',
      day: 7,
    },
    {
      id: 'day-30',
      title: 'Day 30 · Review the month',
      body: 'A month of activity is ready to review.',
      target: '#missing-never-rendered',
      day: 30,
    },
  ],
};

describe('parseTourDefinition', () => {
  it('accepts a well-formed tour and freezes step order', () => {
    const tour = parseTourDefinition(DEMO_TOUR);
    expect(tour.id).toBe('story-month');
    expect(tour.steps.map((s) => s.id)).toEqual(['day-1', 'day-2', 'day-7', 'day-30']);
    expect(tour.steps.map((s) => s.day)).toEqual([1, 2, 7, 30]);
  });

  it('rejects empty steps, duplicate ids and backward days', () => {
    expect(() => parseTourDefinition({ id: 'x', title: 'X', steps: [] })).toThrow(
      TourDefinitionError
    );
    expect(() =>
      parseTourDefinition({
        id: 'x',
        title: 'X',
        steps: [
          { id: 'a', title: 'A', body: '', day: 5 },
          { id: 'a', title: 'B', body: '', day: 6 },
        ],
      })
    ).toThrow(/duplicated/);
    expect(() =>
      parseTourDefinition({
        id: 'x',
        title: 'X',
        steps: [
          { id: 'a', title: 'A', body: '', day: 7 },
          { id: 'b', title: 'B', body: '', day: 3 },
        ],
      })
    ).toThrow(/must be ≥ previous day/);
  });
});

describe('clockRequestForAdvance', () => {
  const tour = parseTourDefinition(DEMO_TOUR);

  it('requests the day delta between two steps', () => {
    expect(clockRequestForAdvance(tour, -1, 0)).toEqual({
      days: 1,
      fromDay: 0,
      toDay: 1,
      stepId: 'day-1',
      tourId: 'story-month',
    });
    expect(clockRequestForAdvance(tour, 0, 1)).toMatchObject({ days: 1, fromDay: 1, toDay: 2 });
    expect(clockRequestForAdvance(tour, 1, 2)).toMatchObject({ days: 5, fromDay: 2, toDay: 7 });
    expect(clockRequestForAdvance(tour, 2, 3)).toMatchObject({ days: 23, fromDay: 7, toDay: 30 });
  });

  it('returns null for backward or zero-delta moves', () => {
    expect(clockRequestForAdvance(tour, 2, 1)).toBeNull();
    expect(clockRequestForAdvance(tour, 1, 1)).toBeNull();
    const flat = parseTourDefinition({
      id: 'flat',
      title: 'Flat',
      steps: [
        { id: 'a', title: 'A', body: '', day: 3 },
        { id: 'b', title: 'B', body: '' },
      ],
    });
    expect(stepDay(flat.steps, 1)).toBe(3);
    expect(clockRequestForAdvance(flat, 0, 1)).toBeNull();
  });
});

describe('resolveTourTarget', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('returns the element when present and null when absent or invalid', () => {
    const el = document.body.appendChild(document.createElement('div'));
    el.setAttribute('data-tour', 'inbox');
    expect(resolveTourTarget('[data-tour="inbox"]')?.getAttribute('data-tour')).toBe('inbox');
    expect(resolveTourTarget('[data-tour="nope"]')).toBeNull();
    expect(resolveTourTarget(undefined)).toBeNull();
    expect(resolveTourTarget('')).toBeNull();
    // Invalid selector must not throw.
    expect(resolveTourTarget('###')).toBeNull();
  });
});

describe('createTourController — step progression', () => {
  it('advances deterministically through every step', async () => {
    const advances: ClockAdvanceRequest[] = [];
    const controller = createTourController(DEMO_TOUR, {
      onClockAdvance: (req) => {
        advances.push(req);
      },
    });

    expect(controller.getState()).toMatchObject({ status: 'idle', stepIndex: -1, storyDay: 0 });

    await controller.start();
    expect(controller.getState()).toMatchObject({
      status: 'active',
      stepIndex: 0,
      storyDay: 1,
    });
    expect(controller.currentStep()?.id).toBe('day-1');

    await controller.next();
    expect(controller.currentStep()?.id).toBe('day-2');
    expect(controller.getState().storyDay).toBe(2);

    await controller.next();
    expect(controller.currentStep()?.id).toBe('day-7');
    expect(controller.getState().storyDay).toBe(7);

    await controller.next();
    expect(controller.currentStep()?.id).toBe('day-30');
    expect(controller.getState().storyDay).toBe(30);

    await controller.next();
    expect(controller.getState().status).toBe('completed');
    expect(controller.getState().stepIndex).toBe(3);

    expect(advances.map((a) => a.days)).toEqual([1, 1, 5, 23]);
    expect(advances.map((a) => a.stepId)).toEqual(['day-1', 'day-2', 'day-7', 'day-30']);
  });

  it('is dismissible and requires reset before restarting', async () => {
    const controller = createTourController(DEMO_TOUR, {
      onClockAdvance: async () => {},
    });
    await controller.start();
    controller.dismiss();
    expect(controller.getState().status).toBe('dismissed');
    expect(controller.currentStep()).toBeNull();
    await expect(controller.next()).rejects.toThrow(/dismissed/);
    controller.reset();
    expect(controller.getState()).toMatchObject({ status: 'idle', stepIndex: -1, storyDay: 0 });
    await controller.start();
    expect(controller.getState().status).toBe('active');
  });

  it('never reverses the clock when moving back', async () => {
    const advances: number[] = [];
    const controller = createTourController(DEMO_TOUR, {
      onClockAdvance: (req) => {
        advances.push(req.days);
      },
    });
    await controller.start();
    await controller.next();
    await controller.next();
    expect(controller.getState()).toMatchObject({ stepIndex: 2, storyDay: 7 });
    controller.back();
    expect(controller.getState()).toMatchObject({ stepIndex: 1, storyDay: 7 });
    expect(advances).toEqual([1, 1, 5]);
    // Forward again from day-2 UI to day-7: story day already 7, so no new request.
    await controller.next();
    expect(controller.getState()).toMatchObject({ stepIndex: 2, storyDay: 7 });
    expect(advances).toEqual([1, 1, 5]);
  });
});

describe('createTourController — clock requests', () => {
  it('records the request when no handler is supplied', async () => {
    const controller = createTourController(DEMO_TOUR);
    await controller.start();
    expect(controller.lastClockRequest()).toEqual({
      days: 1,
      fromDay: 0,
      toDay: 1,
      stepId: 'day-1',
      tourId: 'story-month',
    });
    controller.clearClockRequest();
    expect(controller.lastClockRequest()).toBeNull();
  });

  it('createScenarioClockHandler forwards days to scenarios.advance', async () => {
    const advance = vi.fn(async (_duration: { days: number }) => ({ applied: 0, skipped: 0 }));
    const handler = createScenarioClockHandler(advance);
    const controller = createTourController(DEMO_TOUR, { onClockAdvance: handler });
    await controller.start();
    await controller.goTo(2);
    expect(advance).toHaveBeenCalledTimes(2);
    expect(advance).toHaveBeenNthCalledWith(1, { days: 1 });
    // goTo(2) from step 0 jumps with net delta 7-1 = 6
    expect(advance).toHaveBeenNthCalledWith(2, { days: 6 });
    expect(controller.getState()).toMatchObject({ stepIndex: 2, storyDay: 7 });
  });

  it('surfaces handler failures without changing the step', async () => {
    const controller = createTourController(DEMO_TOUR, {
      onClockAdvance: async () => {
        throw new Error('No active scenario. Load one before advancing time.');
      },
    });
    await expect(controller.start()).rejects.toThrow(/No active scenario/);
    expect(controller.getState().status).toBe('idle');
    expect(controller.getState().stepIndex).toBe(-1);
  });
});

describe('createTourController — missing targets', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('returns null for missing targets and still advances', async () => {
    const controller = createTourController(DEMO_TOUR, {
      onClockAdvance: async () => {},
    });
    await controller.start();
    // day-1 target is absent
    expect(controller.currentTarget()).toBeNull();

    const inbox = document.body.appendChild(document.createElement('div'));
    inbox.setAttribute('data-tour', 'inbox');
    expect(controller.currentTarget()).toBe(inbox);

    await controller.goTo(3);
    // day-30 targets a selector that is never in the DOM
    expect(controller.currentStep()?.id).toBe('day-30');
    expect(controller.currentTarget()).toBeNull();
    expect(controller.getState().status).toBe('active');
  });

  it('uses a custom resolver and tolerates resolver throws via resolveTourTarget', () => {
    const controller = createTourController(DEMO_TOUR, {
      resolveTarget: (selector) => {
        if (selector.includes('inbox')) return document.createElement('section');
        return null;
      },
      onClockAdvance: async () => {},
    });
    // start is async; drive it synchronously through the promise
    return controller.start().then(() => {
      expect(controller.currentTarget()?.tagName).toBe('SECTION');
    });
  });
});

describe('TourPlayer UI', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('renders the first step, stays safe without a target, and dismisses', async () => {
    const advances: number[] = [];
    const controller = createTourController(DEMO_TOUR, {
      onClockAdvance: (req) => {
        advances.push(req.days);
      },
    });
    const target = document.body.appendChild(document.createElement('div'));
    const onClose = vi.fn();
    const app = mount(TourPlayer, {
      target,
      props: { controller, onClose },
    });
    // Let onMount auto-start settle.
    for (let i = 0; i < 5; i++) await Promise.resolve();
    flushSync();

    const root = document.querySelector('.py-tour');
    expect(root).toBeTruthy();
    expect(root?.getAttribute('data-tour-status')).toBe('active');
    expect(root?.getAttribute('data-tour-step')).toBe('day-1');
    expect(document.getElementById('py-tour-title')?.textContent).toMatch(/Day 1/);
    // Target missing → no spotlight.
    expect(document.querySelector('.py-tour-spotlight')).toBeNull();

    const next = Array.from(document.querySelectorAll('button')).find((b) =>
      /Next/i.test(b.textContent ?? '')
    );
    expect(next).toBeTruthy();
    next?.click();
    for (let i = 0; i < 5; i++) await Promise.resolve();
    flushSync();
    expect(root?.getAttribute('data-tour-step')).toBe('day-2');
    expect(advances).toEqual([1, 1]);

    const dismiss = Array.from(document.querySelectorAll('button')).find((b) =>
      /Dismiss/i.test(b.textContent ?? '')
    );
    dismiss?.click();
    flushSync();
    expect(controller.getState().status).toBe('dismissed');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.py-tour')).toBeNull();

    unmount(app);
  });
});
