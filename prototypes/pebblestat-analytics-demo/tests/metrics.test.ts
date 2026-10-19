import { describe, expect, it } from 'vitest';
import type { TrackedEvent } from '../src/database/schema.ts';
import {
  activeUsersSeries,
  annotationMarks,
  applyFilter,
  countBy,
  kpis,
  rollupSeries,
  rollupTotal,
  trendSeries,
} from '../src/domain/metrics.ts';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 1);
const ev = (id: string, type: string, user: string, day: number, plan = 'free'): TrackedEvent => ({
  id,
  type,
  userId: user,
  at: new Date(T0 + day * DAY + 3_600_000).toISOString(),
  properties: { plan, platform: plan === 'free' ? 'web' : 'ios' },
  projectId: 'proj_web',
});
const EVENTS = [
  ev('1', 'signup', 'u1', 0),
  ev('2', 'page_view', 'u1', 0),
  ev('3', 'signup', 'u2', 1, 'pro'),
  ev('4', 'upgraded', 'u2', 1, 'pro'),
  ev('5', 'page_view', 'u2', 2, 'pro'),
];
const range = { start: T0, end: T0 + 3 * DAY };

describe('analytics read model', () => {
  it('computes KPIs: unique users, signups, events and the upgrade rate', () => {
    expect(kpis(EVENTS)).toEqual({ activeUsers: 2, signups: 2, events: 5, upgradeRate: 0.5 });
    expect(kpis([]).upgradeRate).toBeNull();
  });

  it('buckets events and unique users per day, with a breakdown per property value', () => {
    expect(trendSeries(EVENTS, { range, granularity: 'day' })[0]?.points.map((p) => p.y)).toEqual([
      2, 2, 1,
    ]);
    expect(activeUsersSeries(EVENTS, range, 'day')).toEqual([1, 1, 1]);
    const byPlan = trendSeries(EVENTS, { range, granularity: 'day', breakdown: 'properties.plan' });
    expect(byPlan.map((s) => s.id)).toEqual(['pro', 'free']);
    expect(byPlan[0]?.points.map((p) => p.y)).toEqual([0, 2, 1]);
  });

  it('counts by property, labels event types and folds the tail into Other', () => {
    expect(countBy(EVENTS, 'type').map((g) => [g.label, g.count])).toEqual([
      // Ties break by event key: page_view before signup.
      ['Viewed a page', 2],
      ['Signed up', 2],
      ['Upgraded', 1],
    ]);
    expect(countBy(EVENTS, 'type', 2).at(-1)).toEqual({ key: '__other', label: 'Other', count: 3 });
  });

  it('applies a segment filter and keeps everything for an empty group', () => {
    expect(applyFilter(EVENTS, { combinator: 'and', conditions: [] })).toHaveLength(5);
    const pro = applyFilter(EVENTS, {
      combinator: 'and',
      conditions: [{ property: 'properties.plan', operator: 'eq', value: 'pro' }],
    });
    expect(pro.map((e) => e.id)).toEqual(['3', '4', '5']);
  });

  it('reads rollups as daily totals and places annotations across the range', () => {
    const rollups = [
      { id: 'a', projectId: 'proj_web', day: '2026-10-01', type: 'page_view', count: 400 },
      { id: 'b', projectId: 'proj_web', day: '2026-10-01', type: 'signup', count: 20 },
      { id: 'c', projectId: 'proj_web', day: '2026-10-03', type: 'page_view', count: 380 },
    ];
    expect(rollupTotal(rollups)).toBe(800);
    expect(rollupTotal(rollups, 'signup')).toBe(20);
    expect(rollupSeries(rollups, range).map((p) => p.y)).toEqual([420, 0, 380]);
    const marks = annotationMarks(
      [
        {
          id: 'n1',
          projectId: 'proj_web',
          at: new Date(T0 + 1.5 * DAY).toISOString(),
          title: 'v2',
          kind: 'release',
          authorId: 'user_0001',
        },
        {
          id: 'n2',
          projectId: 'proj_web',
          at: new Date(T0 + 9 * DAY).toISOString(),
          title: 'later',
          kind: 'release',
          authorId: 'user_0001',
        },
      ],
      range
    );
    expect(marks.map((m) => [m.id, m.position])).toEqual([['n1', 0.5]]);
  });
});
