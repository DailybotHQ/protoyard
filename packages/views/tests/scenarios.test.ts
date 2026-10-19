// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isAvatarId } from '@protoyard/avatars';
import {
  createIdFactory,
  createRng,
  createTimeHelpers,
  isPersonaAvatar,
  type Scenario,
} from '@protoyard/core';
import { describe, expect, it } from 'vitest';
import { dateIn, weekdayOf } from '../src/calendar/dates.ts';
import { expandAll, hasOccurrence, RecurrenceRuleSchema } from '../src/calendar/recurrence.ts';
import { GeofenceSchema, pointInRing, type Ring, ringSelfIntersects } from '../src/map/fence.ts';
import { haversine } from '../src/map/geo.ts';
import { PORT_MERIDIAN } from '../src/map/port-meridian.ts';
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
  viewsFragments,
  viewsLevel,
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

const ringOf = (coords: readonly number[]): Ring =>
  Array.from({ length: coords.length / 2 }, (_, i) => [
    coords[2 * i] as number,
    coords[2 * i + 1] as number,
  ]);

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

describe('levels and fragments', () => {
  it('scales from empty to dense and reads fragment knobs before density', () => {
    const empty = world(42, 'empty');
    for (const rows of [
      empty.calendar,
      empty.geo.sites,
      empty.outline,
      empty.files,
      empty.comments,
      empty.activity,
      empty.notifications,
    ]) {
      expect(rows).toEqual([]);
    }
    expect(empty.plan.tasks).toEqual([]);
    const typical = world(42, 'typical');
    const dense = world(42, 'dense');
    expect(dense.plan.tasks.length).toBeGreaterThan(typical.plan.tasks.length);
    expect(dense.geo.sites.length).toBeGreaterThan(typical.geo.sites.length);
    expect(dense.calendar.length).toBeGreaterThan(typical.calendar.length);

    const fragment = viewsFragments.calendar('dense');
    expect(fragment).toEqual({
      generators: { views: { calendar: 'dense' } },
      tags: ['calendar-dense'],
    });
    const knobbed = ctx(42, { generators: fragment.generators } as Partial<Scenario>);
    expect(viewsLevel(knobbed, 'calendar')).toBe('dense');
    expect(viewsLevel(knobbed, 'plan')).toBe('typical');
    expect(viewsLevel(ctx(42, { density: 'empty' }), 'plan')).toBe('empty');
    expect(viewsLevel(ctx(42, { density: 'massive' }), 'geo')).toBe('dense');
  });

  it('makes fictional people with unique handles and example.com emails', () => {
    const people = defaultPeople(ctx(), 12);
    expect(new Set(people.map((p) => p.handle)).size).toBe(12);
    expect(people.every((p) => p.email.endsWith('@example.com'))).toBe(true);
  });

  it('gives default people seeded, unique library avatars', () => {
    const people = defaultPeople(ctx(), 12);
    expect(people.every((p) => isAvatarId(p.avatar) && isPersonaAvatar(p.avatar))).toBe(true);
    expect(new Set(people.map((p) => p.avatar)).size).toBe(12);
    expect(defaultPeople(ctx(), 12)).toEqual(people);
    expect(defaultPeople(ctx(7), 12).map((p) => p.avatar)).not.toEqual(people.map((p) => p.avatar));
    // A smaller cast keeps the same first people, faces included.
    expect(defaultPeople(ctx(), 6)).toEqual(people.slice(0, 6));
  });

  it('authors, actors and recipients are default people with faces', () => {
    const { people, comments, activity, notifications } = world();
    const faces = new Map(people.map((p) => [p.id, p.avatar]));
    const ids = [
      ...comments.map((c) => c.authorId),
      ...activity.map((a) => a.actorId),
      ...notifications.map((n) => n.recipientId),
    ];
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(isAvatarId(faces.get(id)), id).toBe(true);
  });

  it('a whole views world is byte-identical across two runs', () => {
    expect(JSON.stringify(world(42))).toBe(JSON.stringify(world(42)));
  });
});

describe('calendar events', () => {
  it('builds valid recurring series whose exceptions are real occurrences', () => {
    const { calendar } = world();
    for (const series of calendar) {
      if (series.rule)
        expect(RecurrenceRuleSchema.safeParse(series.rule).success, series.id).toBe(true);
      for (const id of series.exdates ?? []) {
        expect(hasOccurrence({ ...series, exdates: [] }, id), `${series.id} exdate ${id}`).toBe(
          true
        );
      }
      for (const id of Object.keys(series.overrides ?? {})) {
        expect(hasOccurrence(series, id), `${series.id} override ${id}`).toBe(true);
      }
    }
    const standup = calendar.find((s) => s.data?.title === 'Daily stand-up');
    expect(standup?.exdates).toHaveLength(1);
    expect(Object.keys(standup?.overrides ?? {})).toHaveLength(1);
    const week = expandAll(calendar, {
      start: '2026-10-19T00:00:00Z',
      end: '2026-10-26T00:00:00Z',
    });
    // Monday to Friday, minus a cancelled day that falls in this week.
    const cancelledThisWeek = (standup?.exdates ?? []).filter(
      (id) => id >= '2026-10-19T00:00:00Z' && id < '2026-10-26T00:00:00Z'
    ).length;
    expect(week.occurrences.filter((o) => o.seriesId === standup?.id)).toHaveLength(
      5 - cancelledThisWeek
    );
  });

  it('puts one-off meetings on working days and keeps wall time in the zone', () => {
    const c = ctx();
    const people = defaultPeople(c);
    const series = generateCalendarEvents(c, { people, timeZone: 'America/New_York' });
    for (const s of series.filter((x) => x.data?.kind === 'meeting' && !x.rule)) {
      expect([0, 6]).not.toContain(weekdayOf(dateIn(Date.parse(s.start), 'America/New_York')));
    }
    const standup = series.find((s) => s.data?.title === 'Daily stand-up');
    const nine30 = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    });
    expect(nine30.format(Date.parse(standup?.start ?? ''))).toBe('09:30');
  });

  it('adds overlaps, a midnight crossing and a long title at the edge level', () => {
    const { calendar } = world(42, 'edge');
    const crossing = calendar.find((s) => s.data?.title.includes('crosses midnight'));
    expect(
      crossing &&
        dateIn(Date.parse(crossing.end), 'UTC') > dateIn(Date.parse(crossing.start), 'UTC')
    ).toBe(true);
    expect(calendar.some((s) => (s.data?.title.length ?? 0) > 150)).toBe(true);
  });
});

describe('task plan', () => {
  it('is an acyclic graph whose dates respect every dependency on working days', () => {
    for (const level of ['typical', 'dense', 'edge'] as const) {
      const { plan, people } = world(42, level);
      const byId = new Map(plan.tasks.map((t) => [t.id, t]));
      const order = new Map(plan.tasks.map((t, i) => [t.id, i]));
      for (const dep of plan.dependencies) {
        const from = byId.get(dep.from);
        const to = byId.get(dep.to);
        expect(from && to, dep.id).toBeTruthy();
        if (!from || !to) continue;
        // Predecessors always come earlier: no cycles by construction.
        expect((order.get(dep.from) as number) < (order.get(dep.to) as number)).toBe(true);
        if (dep.type === 'FS')
          expect(from.milestone ? to.start >= from.end : to.start > from.end, dep.id).toBe(true);
        else expect(to.start >= from.start, dep.id).toBe(true);
      }
      for (const task of plan.tasks) {
        expect([0, 6]).not.toContain(weekdayOf(task.start));
        expect([0, 6]).not.toContain(weekdayOf(task.end));
        expect(task.end >= task.start).toBe(true);
        expect(Number.isInteger(task.costCents)).toBe(true);
        if (task.milestone) expect([task.durationDays, task.start === task.end]).toEqual([0, true]);
        if (task.assigneeId) expect(people.some((p) => p.id === task.assigneeId)).toBe(true);
        expect(task.progress).toBeGreaterThanOrEqual(0);
        expect(task.progress).toBeLessThanOrEqual(100);
      }
    }
    const edge = world(42, 'edge').plan;
    const fanIn = new Map<string, number>();
    for (const dep of edge.dependencies) fanIn.set(dep.to, (fanIn.get(dep.to) ?? 0) + 1);
    expect(Math.max(...fanIn.values())).toBeGreaterThanOrEqual(5);
  });
});

describe('geo world', () => {
  const mainland = ringOf(PORT_MERIDIAN.features.find((f) => f.id === 'mainland')?.coords ?? []);
  const district = (id: string) =>
    ringOf(PORT_MERIDIAN.features.find((f) => f.id === id)?.coords ?? []);

  it('places every site inside its Port Meridian district', () => {
    for (const level of ['typical', 'edge'] as const) {
      const { geo } = world(42, level);
      for (const site of geo.sites) {
        expect(pointInRing(site, mainland), site.id).toBe(true);
        expect(pointInRing(site, district(site.districtId)), site.id).toBe(true);
      }
    }
  });

  it('routes from a depot through the nearest remaining stop each time', () => {
    const { geo } = world();
    const byId = new Map(geo.sites.map((s) => [s.id, s]));
    for (const route of geo.routes) {
      const stops = route.stopIds.map((id) => byId.get(id));
      expect(stops.every(Boolean)).toBe(true);
      expect(stops[0]?.kind).toBe('depot');
      for (let i = 1; i < stops.length - 1; i++) {
        const here = stops[i] as NonNullable<(typeof stops)[number]>;
        const next = stops[i + 1] as NonNullable<(typeof stops)[number]>;
        const later = stops.slice(i + 1) as NonNullable<(typeof stops)[number]>[];
        expect(haversine(here, next)).toBeLessThanOrEqual(
          Math.min(...later.map((s) => haversine(here, s))) + 1e-6
        );
      }
    }
  });

  it('draws geofences that are valid and never cross themselves', () => {
    for (const level of ['typical', 'dense', 'edge'] as const) {
      for (const fence of world(42, level).geo.geofences) {
        expect(GeofenceSchema.safeParse(fence).success, fence.id).toBe(true);
        if (fence.shape === 'polygon') expect(ringSelfIntersects(fence.ring), fence.id).toBe(false);
      }
    }
  });
});

describe('outline and files', () => {
  it('lists parents before children, within the depth limit, with ordered unique ranks', () => {
    for (const level of ['typical', 'dense', 'edge'] as const) {
      const nodes = world(42, level).outline;
      const seen = new Set<string>();
      const ranks = new Map<string | null, string[]>();
      for (const node of nodes) {
        if (node.parentId) expect(seen.has(node.parentId), node.id).toBe(true);
        seen.add(node.id);
        ranks.set(node.parentId, [...(ranks.get(node.parentId) ?? []), node.rank]);
      }
      for (const list of ranks.values()) {
        expect(new Set(list).size).toBe(list.length);
        expect([...list].sort()).toEqual(list);
      }
    }
    expect(Math.max(...world(42, 'edge').outline.map((n) => n.depth))).toBe(5);
  });

  it('builds a file tree whose parents are folders, with integer sizes and edge cases', () => {
    const files = world(42, 'edge').files;
    const byId = new Map(files.map((f) => [f.id, f]));
    for (const entry of files) {
      if (entry.parentId) expect(byId.get(entry.parentId)?.kind, entry.id).toBe('folder');
      expect(Number.isInteger(entry.sizeBytes)).toBe(true);
      if (entry.kind === 'folder') expect(entry.sizeBytes).toBe(0);
    }
    expect(files.some((f) => f.kind === 'file' && f.sizeBytes === 0)).toBe(true);
    expect(files.some((f) => /[^\x20-\x7e]/.test(f.name))).toBe(true);
    expect(files.some((f) => f.name.length > 150)).toBe(true);
  });
});

describe('comments, activity and notifications', () => {
  it('resolves every mention and keeps threads moving forward in time', () => {
    const { comments, people } = world(42, 'edge');
    const handles = new Map(people.map((p) => [p.id, p.handle]));
    const byId = new Map(comments.map((c) => [c.id, c]));
    for (const comment of comments) {
      for (const id of comment.mentionIds) expect(comment.body).toContain(`@${handles.get(id)}`);
      if (comment.parentId) {
        const parent = byId.get(comment.parentId);
        expect(parent?.subjectId).toBe(comment.subjectId);
        expect((parent?.createdAt ?? '') <= comment.createdAt).toBe(true);
      }
      expect(comment.createdAt < REFERENCE).toBe(true);
    }
  });

  it('starts each subject with "created" and lists activity newest first', () => {
    const { activity } = world();
    expect([...activity].sort((a, b) => (a.at < b.at ? 1 : -1)).map((a) => a.at)).toEqual(
      activity.map((a) => a.at)
    );
    const firsts = new Map<string, string>();
    for (const row of [...activity].reverse())
      if (!firsts.has(row.subjectId)) firsts.set(row.subjectId, row.verb);
    expect([...firsts.values()].every((verb) => verb === 'created')).toBe(true);
  });

  it('notifies real people, reads after it arrives, and leaves edge notifications unread', () => {
    const { notifications, people } = world();
    for (const n of notifications) {
      expect(people.some((p) => p.id === n.recipientId)).toBe(true);
      if (n.readAt) expect(n.readAt > n.at).toBe(true);
    }
    expect(notifications.some((n) => n.readAt === null)).toBe(true);
    expect(world(42, 'edge').notifications.every((n) => n.readAt === null)).toBe(true);
  });
});

describe('speed', () => {
  it('generates every typical kit within the 50 ms budget', () => {
    // A same-process calibration keeps this a regression guard on a busy machine.
    const time = (work: () => unknown) => {
      work();
      let best = Number.POSITIVE_INFINITY;
      for (let i = 0; i < 3; i++) {
        const started = performance.now();
        work();
        best = Math.min(best, performance.now() - started);
      }
      return best;
    };
    const random = createRng('calibration');
    const baseline = time(() => Float64Array.from({ length: 100_000 }, () => random.next()).sort());
    const ms = time(() => world(42, 'typical'));
    const factor = Number(process.env.PROTOYARD_PERF_FACTOR ?? 1);
    console.info(
      `views scenarios (all typical kits): ${ms.toFixed(1)} ms (native 100k sort ${baseline.toFixed(1)} ms)`
    );
    expect(ms).toBeLessThan(Math.max(50 * factor, 10 * baseline));
  });
});
