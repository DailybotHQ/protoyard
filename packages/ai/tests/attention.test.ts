import { describe, expect, it } from 'vitest';
import {
  type AttentionItem,
  askTarget,
  attentionAccessOf,
  attentionFixtureWorld,
  attentionKey,
  attentionPreset,
  attentionVisibleTo,
  attentionWatchersForPreset,
  OVERLOAD_THRESHOLD,
  previousWorkingDays,
  runWatchers,
  STALL_DAYS,
  type WatcherWorld,
  type WatchTask,
  WORKING_DAY_THRESHOLD,
  watchOverloaded,
  watchQuietPerson,
  watchSlippingDate,
  watchStalled,
} from '../src/attention/index.ts';

const NOW = '2026-10-14T18:00:00.000Z';
const TZ = 'America/Bogota';

function basePeople(): WatcherWorld['people'] {
  return [
    { id: 'avery', firstName: 'Avery', fullName: 'Avery Quinn', role: 'admin' },
    { id: 'oscar', firstName: 'Oscar', fullName: 'Oscar Rivera', role: 'member' },
    { id: 'morgan', firstName: 'Morgan', fullName: 'Morgan Lee', role: 'manager' },
    { id: 'sam', firstName: 'Sam', fullName: 'Sam Okafor', role: 'member' },
    { id: 'priya', firstName: 'Priya', fullName: 'Priya Shah', role: 'member' },
  ];
}

function task(partial: Partial<WatchTask> & Pick<WatchTask, 'id' | 'ownerId'>): WatchTask {
  return {
    key: partial.key ?? partial.id,
    title: partial.title ?? partial.key ?? partial.id,
    category: 'todo',
    dueDate: null,
    updatedAt: NOW,
    boardId: 'b1',
    milestoneId: null,
    ...partial,
  };
}

function world(partial: Partial<WatcherWorld> = {}): WatcherWorld {
  return {
    timezone: TZ,
    people: basePeople(),
    tasks: [],
    comments: [],
    milestones: [],
    responses: [],
    checkinId: 'checkin_standup',
    mood: [],
    summaries: [],
    ...partial,
  };
}

/** Sam at the overload threshold: stalled blocked task + enough open due-soon work. */
function samTasks(openCount: number): WatchTask[] {
  const stalledAt = new Date(Date.parse(NOW) - STALL_DAYS * 86_400_000).toISOString();
  const tasks: WatchTask[] = [
    task({
      id: 'WRK-220',
      key: 'WRK-220',
      title: 'Design approval for the release notes',
      ownerId: 'sam',
      category: 'in_progress',
      dueDate: '2026-10-15',
      updatedAt: stalledAt,
    }),
  ];
  for (let index = 1; index < openCount; index += 1) {
    tasks.push(
      task({
        id: `WRK-${index}`,
        key: `WRK-${index}`,
        title: `Open task ${index}`,
        ownerId: 'sam',
        dueDate: index < 3 ? `2026-10-${14 + index}` : null,
      })
    );
  }
  return tasks;
}

describe('attention watchers on a fixed world', () => {
  it('raises the month situations once, with stable ids', () => {
    const snapshot = world({
      tasks: [
        ...samTasks(OVERLOAD_THRESHOLD),
        task({ id: 'M-0', ownerId: 'avery', category: 'todo', boardId: 'release' }),
        task({ id: 'M-1', ownerId: 'avery', category: 'todo', boardId: 'release' }),
        task({ id: 'M-2', ownerId: 'avery', category: 'done', boardId: 'release' }),
        // Oscar is on Sam's board with nothing open, so he is the least loaded.
        task({ id: 'O-done', ownerId: 'oscar', category: 'done', boardId: 'b1' }),
      ],
      comments: [{ taskId: 'WRK-220', body: 'Blocked on design approval.' }],
      milestones: [
        {
          id: 'ms_release',
          name: 'Release 2.4',
          dueDate: '2026-10-17',
          projectId: 'proj_1',
          taskIds: ['M-0', 'M-1', 'M-2'],
        },
      ],
      responses: [
        { personaId: 'priya', date: '2026-10-01' },
        { personaId: 'oscar', date: '2026-10-13' },
      ],
      mood: [
        { teamId: 'eng', period: '2026-W39', score: 8 },
        { teamId: 'eng', period: '2026-W40', score: 6 },
        { teamId: 'eng', period: '2026-W41', score: 4 },
      ],
      summaries: [{ id: 'fact_weekly', dueDate: '2026-10-16', posted: false }],
    });
    const first = runWatchers(snapshot, NOW, []);
    expect(first.map((item) => item.kind).sort()).toEqual([
      'escalate',
      'move_date',
      'nudge',
      'reassign',
      'summary',
    ]);
    expect(runWatchers(snapshot, NOW, first)).toEqual([]);
    expect(runWatchers(snapshot, NOW, []).map((item) => item.id)).toEqual(
      first.map((item) => item.id)
    );
    expect(OVERLOAD_THRESHOLD).toBe(8);
    expect(STALL_DAYS).toBe(5);
    expect(WORKING_DAY_THRESHOLD).toBe(3);
    const reassign = first.find((item) => item.kind === 'reassign');
    expect(reassign?.title).toBe('Reassign WRK-220? Sam is overloaded');
    expect(reassign?.response).toBe('asks_first');
    expect(reassign?.action).toMatchObject({
      type: 'reassign_task',
      taskKey: 'WRK-220',
      toPersonaId: 'oscar',
    });
    const move = first.find((item) => item.kind === 'move_date');
    expect(move?.title).toBe('Move the Release 2.4 date?');
    expect(move?.action).toMatchObject({ type: 'move_date', toDate: '2026-10-24' });
    expect(first.find((item) => item.kind === 'nudge')?.title).toBe(
      'Priya has not answered in 3 days — nudge?'
    );
    expect(first.find((item) => item.kind === 'summary')?.title).toBe('Weekly summary ready');
    expect(first.find((item) => item.kind === 'escalate')?.response).toBe('brings_person');
    expect(attentionKey(reassign as AttentionItem)).toBe('reassign:sam');
  });

  it('lets a dismissed key suppress and an approved key recur only after it clears', () => {
    const snapshot = world({
      tasks: samTasks(OVERLOAD_THRESHOLD),
      comments: [{ taskId: 'WRK-220', body: 'Blocked.' }],
    });
    const first = runWatchers(snapshot, NOW, [])[0];
    expect(first).toBeTruthy();
    if (!first) return;
    const dismissed = { ...first, status: 'dismissed' as const };
    expect(runWatchers(snapshot, NOW, [dismissed]).some((item) => item.key === first.key)).toBe(
      false
    );
    const approved = { ...first, status: 'approved' as const };
    expect(runWatchers(snapshot, NOW, [approved]).some((item) => item.key === first.key)).toBe(
      false
    );
    expect(
      runWatchers(snapshot, NOW, [approved], new Set([first.key])).some(
        (item) => item.key === first.key
      )
    ).toBe(true);
  });

  it('counts Friday to Wednesday as three working days', () => {
    expect(previousWorkingDays('2026-10-14T13:00:00.000Z', 3, 'America/Bogota')).toEqual([
      '2026-10-13',
      '2026-10-12',
      '2026-10-09',
    ]);
  });
});

describe('attention watcher thresholds', () => {
  it('fires for a person exactly at OVERLOAD_THRESHOLD and not one below', () => {
    const blocked = [{ taskId: 'WRK-220', body: 'Blocked on the provider.' }];
    expect(
      watchOverloaded(world({ tasks: samTasks(OVERLOAD_THRESHOLD), comments: blocked }), NOW, [])
    ).toHaveLength(1);
    expect(
      watchOverloaded(
        world({ tasks: samTasks(OVERLOAD_THRESHOLD - 1), comments: blocked }),
        NOW,
        []
      )
    ).toEqual([]);
  });

  it('fires for a task stalled exactly STALL_DAYS and not one idle day less', () => {
    const calm = (idle: number) =>
      world({
        tasks: [
          task({
            id: 'T-1',
            ownerId: 'morgan',
            category: 'in_progress',
            updatedAt: new Date(Date.parse(NOW) - idle * 86_400_000).toISOString(),
          }),
        ],
        comments: [{ taskId: 'T-1', body: 'Blocked on the provider.' }],
      });
    expect(watchStalled(calm(STALL_DAYS), NOW, [])).toHaveLength(1);
    expect(watchStalled(calm(STALL_DAYS - 1), NOW, [])).toEqual([]);
  });

  it('treats 29% open as on track and 30% as slipping', () => {
    const milestone = (open: number, total: number) => {
      const tasks = Array.from({ length: total }, (_, index) =>
        task({
          id: `M-${index}`,
          ownerId: 'avery',
          category: index < open ? 'todo' : 'done',
        })
      );
      return world({
        tasks,
        milestones: [
          {
            id: 'm1',
            name: 'Release',
            dueDate: '2026-10-16',
            projectId: null,
            taskIds: tasks.map((row) => row.id),
          },
        ],
      });
    };
    expect(watchSlippingDate(milestone(29, 100), NOW, [])).toEqual([]);
    expect(watchSlippingDate(milestone(30, 100), NOW, [])).toHaveLength(1);
  });

  it('raises nothing for a quiet person when they answered a missing day', () => {
    const quiet = world({
      responses: [{ personaId: 'priya', date: '2026-10-01' }],
    });
    expect(watchQuietPerson(quiet, NOW, [])).toHaveLength(1);
    const answered = world({
      responses: [
        { personaId: 'priya', date: '2026-10-01' },
        { personaId: 'priya', date: '2026-10-13' },
      ],
    });
    expect(watchQuietPerson(answered, NOW, [])).toEqual([]);
  });

  it('stays deterministic over fifty runs', () => {
    const snapshot = world({
      summaries: [{ id: 'fact_weekly', dueDate: '2026-10-16', posted: false }],
    });
    const reference = runWatchers(snapshot, NOW, []).map((item) => item.id);
    expect(reference).toHaveLength(1);
    for (let run = 0; run < 50; run += 1) {
      expect(runWatchers(snapshot, NOW, []).map((item) => item.id)).toEqual(reference);
    }
  });
});

describe('attention presets and access', () => {
  it('selects watcher subsets by preset id', () => {
    expect(attentionWatchersForPreset('work-health')).toEqual(['overloaded', 'stalled']);
    expect(attentionWatchersForPreset('none')).toEqual([]);
    expect(attentionPreset('full').watchers).toHaveLength(6);
  });

  it('runs only the preset watchers', () => {
    const snapshot = world({
      summaries: [{ id: 'fact_weekly', dueDate: '2026-10-16', posted: false }],
      mood: [
        { teamId: 'eng', period: '2026-W39', score: 8 },
        { teamId: 'eng', period: '2026-W40', score: 6 },
        { teamId: 'eng', period: '2026-W41', score: 4 },
      ],
    });
    const deadlines = runWatchers(snapshot, NOW, [], {
      watchers: attentionWatchersForPreset('deadlines'),
    });
    expect(deadlines.map((item) => item.kind)).toEqual(['summary']);
    const none = runWatchers(snapshot, NOW, [], {
      watchers: attentionWatchersForPreset('none'),
    });
    expect(none).toEqual([]);
  });

  it('filters the queue by access role', () => {
    const items: AttentionItem[] = [
      {
        id: 'a1',
        key: 'nudge:priya',
        kind: 'nudge',
        response: 'handles',
        status: 'open',
        title: 'nudge',
        detail: '',
        evidence: [],
        action: { type: 'nudge', personaId: 'priya', checkinId: 'c1' },
        raisedAt: NOW,
        snoozedUntil: null,
        subjectId: 'priya',
      },
      {
        id: 'a2',
        key: 'nudge:sam',
        kind: 'nudge',
        response: 'handles',
        status: 'open',
        title: 'nudge',
        detail: '',
        evidence: [],
        action: { type: 'nudge', personaId: 'sam', checkinId: 'c1' },
        raisedAt: NOW,
        snoozedUntil: null,
        subjectId: 'sam',
      },
    ];
    expect(attentionVisibleTo(items, attentionAccessOf('admin'), 'priya')).toHaveLength(2);
    expect(
      attentionVisibleTo(items, attentionAccessOf('member'), 'priya').map((i) => i.id)
    ).toEqual(['a1']);
    expect(attentionVisibleTo(items, attentionAccessOf('guest'), 'priya')).toEqual([]);
  });

  it('routes ask_person away from the decider', () => {
    const action = {
      type: 'ask_person' as const,
      personaId: 'morgan',
      fallbackPersonaId: 'avery',
      question: 'What should we change?',
    };
    expect(askTarget(action, 'morgan')).toBe('avery');
    expect(askTarget(action, 'avery')).toBe('morgan');
  });
});

describe('attention fixture world', () => {
  it('raises four open items at the fixture now without the slip watcher', () => {
    const snapshot = attentionFixtureWorld(NOW);
    const raised = runWatchers(snapshot, NOW, []);
    expect(raised.map((item) => item.kind).sort()).toEqual([
      'escalate',
      'nudge',
      'reassign',
      'summary',
    ]);
    // Slip stays quiet: release is four days out.
    expect(raised.some((item) => item.kind === 'move_date')).toBe(false);
  });
});
