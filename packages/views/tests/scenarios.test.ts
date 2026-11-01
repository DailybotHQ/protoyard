// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createIdFactory, createTimeHelpers, type Scenario } from '@protoyard/core';
import { describe, expect, it } from 'vitest';
import {
  defaultPeople,
  generateActivity,
  generateCalendarEvents,
  generateComments,
  generateFileTree,
  generateGeoWorld,
  generateNotifications,
  generateOutline,
  generateTaskPlan,
  type ViewsCtx,
  type ViewsLevel,
} from '../src/scenarios/index.ts';

const REFERENCE = '2026-10-19T12:00:00.000Z'; // a Monday

function ctx(seed = 42, extra: Partial<Scenario> = {}): ViewsCtx {
  const scenario = {
    id: 'views-test',
    seed,
    density: 'normal',
    referenceTime: REFERENCE,
    ...extra,
  } as Scenario;
  return { scenario, ids: createIdFactory(), time: createTimeHelpers(REFERENCE) };
}

/** Every generator, run on a fresh context, so outputs can be compared across seeds and levels. */
function world(seed = 42, level?: ViewsLevel) {
  const c = ctx(seed);
  const people = defaultPeople(c);
  const subjects = [
    { id: 'deal_01', title: 'Northwind renewal' },
    { id: 'deal_02', title: 'Globex pilot' },
    { id: 'deal_03', title: 'Initech seats' },
  ];
  const options = level ? { level } : {};
  return {
    people,
    calendar: generateCalendarEvents(c, { people, ...options }),
    plan: generateTaskPlan(c, { people, ...options }),
    geo: generateGeoWorld(c, options),
    outline: generateOutline(c, options),
    files: generateFileTree(c, { people, ...options }),
    comments: generateComments(c, { people, subjects, ...options }),
    activity: generateActivity(c, { people, subjects, ...options }),
    notifications: generateNotifications(c, { people, subjects, ...options }),
  };
}

describe('determinism', () => {
  it('produces deep-equal output for the same seed and different output for another', () => {
    expect(world(42)).toEqual(world(42));
    const a = world(42);
    const b = world(7);
    for (const key of [
      'calendar',
      'plan',
      'geo',
      'outline',
      'files',
      'comments',
      'activity',
      'notifications',
    ] as const) {
      expect(JSON.stringify(a[key]), key).not.toBe(JSON.stringify(b[key]));
    }
  });

  it('never reads Math.random or the wall clock', () => {
    const dir = join(import.meta.dirname, '../src/scenarios');
    for (const file of readdirSync(dir)) {
      const source = readFileSync(join(dir, file), 'utf8');
      expect(source, file).not.toMatch(/Math\.random|Date\.now|new Date\(\)/);
    }
  });
});
