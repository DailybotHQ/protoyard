// @vitest-environment node
import { createRng } from '@protoyard/core';
import { describe, expect, it } from 'vitest';
import { addDays } from '../src/calendar/dates.ts';
import {
  cascade,
  criticalPath,
  cycleMessage,
  type Dependency,
  DependencyListSchema,
  durationDays,
  type ScheduleTask,
  topoOrder,
  workDays,
} from '../src/timeline/index.ts';

// 2026-10-19 is a Monday.
const MON = '2026-10-19';
const task = (id: string, start: string, end: string, milestone = false): ScheduleTask => ({
  id,
  start,
  end,
  milestone,
});

describe('working days', () => {
  it('counts Monday to Friday, skips weekends and holidays', () => {
    const wd = workDays({ holidays: ['2026-10-21'] });
    expect(wd.isWorkday('2026-10-24')).toBe(false); // Saturday
    expect(wd.isWorkday('2026-10-21')).toBe(false); // holiday
    expect(wd.count(MON, '2026-10-25')).toBe(4);
    expect(wd.next('2026-10-24')).toBe('2026-10-26');
    expect(durationDays(task('t', MON, '2026-10-23'))).toBe(5);
    expect(durationDays(task('m', MON, MON, true))).toBe(0);
  });

  it('round-trips every working day through its ordinal, for other work weeks too', () => {
    for (const calendar of [
      {},
      { workdays: [0, 1, 2, 3, 4] },
      { holidays: ['2026-12-25', '2027-01-01'] },
    ]) {
      const wd = workDays(calendar);
      let day = '2026-01-01';
      for (let i = 0; i < 730; i++, day = addDays(day, 1)) {
        if (wd.isWorkday(day)) expect(wd.fromOrdinal(wd.ordinal(day)), day).toBe(day);
      }
    }
    expect(workDays({ workdays: [0, 1, 2, 3, 4] }).isWorkday('2026-10-25')).toBe(true); // Sunday
    expect(() => workDays({ workdays: [] })).toThrow(RangeError);
  });
});

describe('dependency graph', () => {
  const deps: Dependency[] = [
    { from: 'a', to: 'b', type: 'FS' },
    { from: 'b', to: 'c', type: 'FS' },
    { from: 'a', to: 'c', type: 'SS' },
  ];

  it('orders predecessors first and names a cycle readably', () => {
    expect(topoOrder(['c', 'b', 'a'], deps)).toEqual({ ok: true, order: ['a', 'b', 'c'] });
    const cyclic = [...deps, { from: 'c', to: 'a', type: 'FS' as const }];
    const result = topoOrder(['a', 'b', 'c'], cyclic);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.cycle[0]).toBe(result.cycle[result.cycle.length - 1]);
      expect(result.cycle.length).toBeGreaterThanOrEqual(3);
    }
    expect(cycleMessage(['a', 'b', 'c'], cyclic)).toMatch(
      /^Dependencies form a cycle: [abc]( → [abc])+$/
    );
    expect(cycleMessage(['a', 'b', 'c'], deps)).toBeNull();
  });

  it('rejects self-links and cycles as zod errors, for services to use', () => {
    expect(DependencyListSchema.safeParse(deps).success).toBe(true);
    const self = DependencyListSchema.safeParse([{ from: 'a', to: 'a', type: 'FS' }]);
    expect(self.success === false && self.error.issues[0]?.message).toBe(
      'A task cannot depend on itself'
    );
    const loop = DependencyListSchema.safeParse([
      { from: 'a', to: 'b', type: 'FS' },
      { from: 'b', to: 'a', type: 'SS' },
    ]);
    expect(loop.success === false && loop.error.issues[0]?.message).toMatch(
      /cycle: (a → b → a|b → a → b)/
    );
    expect(DependencyListSchema.safeParse([{ from: 'a', to: 'b', type: 'XX' }]).success).toBe(
      false
    );
  });
});

describe('cascade: each dependency type', () => {
  // Predecessor P: Mon–Wed (3 days). Successor S: 2 days, starting early on Mon.
  const P = task('p', MON, '2026-10-21');
  const S = task('s', MON, '2026-10-20');
  const run = (type: Dependency['type'], lagDays = 0) =>
    cascade([P, S], [{ from: 'p', to: 's', type, lagDays }], { id: 'p', start: MON });

  it('FS: starts after the predecessor finishes (plus lag, minus lead)', () => {
    expect(run('FS').changes).toEqual([{ id: 's', start: '2026-10-22', end: '2026-10-23' }]);
    expect(run('FS', 2).changes).toEqual([{ id: 's', start: '2026-10-26', end: '2026-10-27' }]);
    expect(run('FS', -1).changes).toEqual([{ id: 's', start: '2026-10-21', end: '2026-10-22' }]);
  });

  it('SS: starts once the predecessor starts', () => {
    expect(run('SS').changes).toEqual([]); // already allowed
    expect(run('SS', 1).changes).toEqual([{ id: 's', start: '2026-10-20', end: '2026-10-21' }]);
  });

  it('FF: finishes once the predecessor finishes', () => {
    expect(run('FF').changes).toEqual([{ id: 's', start: '2026-10-20', end: '2026-10-21' }]);
  });

  it('SF: finishes once the predecessor starts (plus lag)', () => {
    expect(run('SF').changes).toEqual([]);
    // Finishes are exclusive slots: done by the end of Wednesday, three days after Monday.
    expect(run('SF', 3).changes).toEqual([{ id: 's', start: '2026-10-20', end: '2026-10-21' }]);
  });
});

describe('cascade', () => {
  const tasks = [
    task('design', MON, '2026-10-21'), // Mon–Wed
    task('build', '2026-10-22', '2026-10-27'), // Thu–Tue
    task('docs', '2026-11-02', '2026-11-03'), // plenty of slack
    task('launch', '2026-10-28', '2026-10-28', true),
  ];
  const deps: Dependency[] = [
    { from: 'design', to: 'build', type: 'FS' },
    { from: 'build', to: 'launch', type: 'FS' },
    { from: 'design', to: 'docs', type: 'FS' },
  ];

  it('pushes the chain and returns only the rows that changed', () => {
    const result = cascade(tasks, deps, { id: 'design', start: '2026-10-21' });
    expect(result.changes).toEqual([
      { id: 'design', start: '2026-10-21', end: '2026-10-23' },
      { id: 'build', start: '2026-10-26', end: '2026-10-29' },
      { id: 'launch', start: '2026-10-30', end: '2026-10-30' },
    ]);
    // docs had slack, so it stays.
    expect(result.changes.some((c) => c.id === 'docs')).toBe(false);
    expect(result.violations).toEqual([]);
  });

  it('never pulls successors earlier, and reports links a moved task breaks', () => {
    const earlier = cascade(tasks, deps, { id: 'design', start: '2026-10-12' });
    expect(earlier.changes).toEqual([{ id: 'design', start: '2026-10-12', end: '2026-10-14' }]);
    const tooEarly = cascade(tasks, deps, { id: 'build', start: MON });
    expect(tooEarly.violations).toEqual([deps[0]]);
  });

  it('changes durations, skips holidays and keeps milestones at zero length', () => {
    const longer = cascade(tasks, deps, { id: 'design', start: MON, end: '2026-10-22' });
    expect(longer.changes[0]).toEqual({ id: 'design', start: MON, end: '2026-10-22' });
    expect(longer.changes[1]).toEqual({ id: 'build', start: '2026-10-23', end: '2026-10-28' });
    // Durations count the calendar's working days; a pushed task skips holidays.
    const pair = [task('design', MON, '2026-10-21'), task('qa', '2026-10-22', '2026-10-23')];
    const link: Dependency[] = [{ from: 'design', to: 'qa', type: 'FS' }];
    const change = { id: 'design', start: MON, end: '2026-10-22' };
    expect(cascade(pair, link, change).changes[1]).toEqual({
      id: 'qa',
      start: '2026-10-23',
      end: '2026-10-26',
    });
    expect(cascade(pair, link, change, { holidays: ['2026-10-26'] }).changes[1]).toEqual({
      id: 'qa',
      start: '2026-10-23',
      end: '2026-10-27',
    });
    expect(longer.changes.find((c) => c.id === 'launch')).toEqual({
      id: 'launch',
      start: '2026-10-29',
      end: '2026-10-29',
    });
    expect(() => cascade(tasks, deps, { id: 'design', start: '2026-10-21', end: MON })).toThrow(
      RangeError
    );
    expect(() => cascade(tasks, deps, { id: 'nope', start: MON })).toThrow(RangeError);
    expect(() =>
      cascade(tasks, [...deps, { from: 'launch', to: 'design', type: 'FS' }], {
        id: 'design',
        start: MON,
      })
    ).toThrow(/cycle/);
  });
});

describe('critical path', () => {
  it('finds the zero-slack chain and the slack of the rest', () => {
    // a (3d) → b (2d) → d (1d);  a → c (5d) → d.
    const tasks = [
      task('a', MON, '2026-10-21'),
      task('b', '2026-10-22', '2026-10-23'),
      task('c', '2026-10-22', '2026-10-28'),
      task('d', '2026-10-29', '2026-10-29'),
    ];
    const deps: Dependency[] = [
      { from: 'a', to: 'b', type: 'FS' },
      { from: 'a', to: 'c', type: 'FS' },
      { from: 'b', to: 'd', type: 'FS' },
      { from: 'c', to: 'd', type: 'FS' },
    ];
    const result = criticalPath(tasks, deps);
    expect(result.critical).toEqual(['a', 'c', 'd']);
    expect(result.tasks.get('b')).toMatchObject({
      slackDays: 3,
      critical: false,
      lateStart: '2026-10-27',
      lateFinish: '2026-10-28',
    });
    expect(result.tasks.get('c')).toMatchObject({
      slackDays: 0,
      earlyStart: '2026-10-22',
      earlyFinish: '2026-10-28',
    });
    expect(result.finish).toBe('2026-10-29');
  });
});

describe('speed', () => {
  it('cascades a 2,000-task plan within budget', () => {
    const rng = createRng('schedule-2k');
    const tasks: ScheduleTask[] = [];
    const deps: Dependency[] = [];
    for (let i = 0; i < 2000; i++) {
      tasks.push(task(`t${i}`, addDays(MON, i), addDays(MON, i + rng.int(0, 4))));
      if (i > 0)
        deps.push({
          from: `t${rng.int(Math.max(0, i - 5), i - 1)}`,
          to: `t${i}`,
          type: rng.pick(['FS', 'SS', 'FF', 'SF'] as const),
          lagDays: rng.int(0, 2),
        });
    }
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
    let changed = 0;
    const ms = time(() => {
      changed = cascade(tasks, deps, { id: 't0', start: addDays(MON, 30) }).changes.length;
    });
    expect(changed).toBeGreaterThan(20);
    const factor = Number(process.env.PROTOYARD_PERF_FACTOR ?? 3);
    console.info(
      `schedule cascade 2k: ${ms.toFixed(1)} ms, ${changed} rows (native 100k sort ${baseline.toFixed(1)} ms)`
    );
    expect(ms).toBeLessThan(Math.max(20 * factor, 5 * baseline));
  });
});
