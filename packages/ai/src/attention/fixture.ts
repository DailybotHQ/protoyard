/**
 * Deterministic fixture world for demos and unit tests.
 *
 * Fictional people and paths only. Dates are offsets from the supplied `now`.
 */

import { dayKey, plusDays } from './clock.ts';
import type { WatcherWorld, WatchTask } from './world.ts';

export const ATTENTION_FIXTURE_TIMEZONE = 'America/Bogota';

/** A release due this far ahead is outside the 3-day slip window at `now`. */
const SLIP_AFTER_DAYS = 4;

const PEOPLE = [
  { id: 'avery', firstName: 'Avery', fullName: 'Avery Quinn', role: 'admin' },
  { id: 'oscar', firstName: 'Oscar', fullName: 'Oscar Rivera', role: 'member' },
  { id: 'morgan', firstName: 'Morgan', fullName: 'Morgan Lee', role: 'manager' },
  { id: 'sam', firstName: 'Sam', fullName: 'Sam Okafor', role: 'member' },
  { id: 'priya', firstName: 'Priya', fullName: 'Priya Shah', role: 'member' },
] as const;

function task(
  now: string,
  partial: Partial<WatchTask> & Pick<WatchTask, 'id' | 'key' | 'ownerId'>
): WatchTask {
  return {
    title: partial.title ?? partial.key,
    category: 'todo',
    dueDate: null,
    updatedAt: now,
    boardId: 'board_attention',
    milestoneId: null,
    ...partial,
  };
}

/**
 * Five situations are already true at `now`: Sam is overloaded, WRK-220 is
 * stalled, Priya missed three working days, morale fell, and the weekly
 * summary is due. Release 2.4 is due in four days, so the slip watcher stays
 * quiet until the clock moves one day forward.
 */
export function attentionFixtureWorld(now: string): WatcherWorld {
  const today = dayKey(now, ATTENTION_FIXTURE_TIMEZONE);
  const stalledAt = new Date(Date.parse(now) - 5 * 86_400_000).toISOString();
  const tasks: WatchTask[] = [
    task(now, {
      id: 'WRK-220',
      key: 'WRK-220',
      title: 'Design approval for the release notes',
      ownerId: 'sam',
      category: 'in_progress',
      dueDate: plusDays(today, 1),
      updatedAt: stalledAt,
    }),
  ];
  for (let index = 1; index < 8; index += 1) {
    tasks.push(
      task(now, {
        id: `WRK-${index}`,
        key: `WRK-${index}`,
        title: `Open task ${index}`,
        ownerId: 'sam',
        dueDate: index < 3 ? plusDays(today, index) : null,
      })
    );
  }
  tasks.push(
    task(now, {
      id: 'M-0',
      key: 'M-0',
      title: 'Release notes',
      ownerId: 'avery',
      boardId: 'board_release',
      milestoneId: 'ms_release',
    }),
    task(now, {
      id: 'M-1',
      key: 'M-1',
      title: 'Release checklist',
      ownerId: 'avery',
      boardId: 'board_release',
      milestoneId: 'ms_release',
    }),
    task(now, {
      id: 'M-2',
      key: 'M-2',
      title: 'Release build',
      ownerId: 'avery',
      category: 'done',
      boardId: 'board_release',
      milestoneId: 'ms_release',
    }),
    task(now, {
      id: 'O-done',
      key: 'O-1',
      title: 'Done work',
      ownerId: 'oscar',
      category: 'done',
    })
  );
  return {
    timezone: ATTENTION_FIXTURE_TIMEZONE,
    people: PEOPLE.map((person) => ({ ...person })),
    tasks,
    comments: [{ taskId: 'WRK-220', body: 'Blocked on design approval.' }],
    milestones: [
      {
        id: 'ms_release',
        name: 'Release 2.4',
        dueDate: plusDays(today, SLIP_AFTER_DAYS),
        projectId: 'proj_attention',
        taskIds: ['M-0', 'M-1', 'M-2'],
      },
    ],
    responses: [
      { personaId: 'priya', date: plusDays(today, -20) },
      { personaId: 'oscar', date: plusDays(today, -1) },
    ],
    checkinId: 'checkin_standup',
    mood: [
      { teamId: 'eng', period: '2026-W39', score: 8 },
      { teamId: 'eng', period: '2026-W40', score: 6 },
      { teamId: 'eng', period: '2026-W41', score: 4 },
    ],
    summaries: [{ id: 'fact_weekly', dueDate: plusDays(today, 2), posted: false }],
  };
}
