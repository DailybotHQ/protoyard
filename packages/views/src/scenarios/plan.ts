import { addDays, dateIn, daysBetween, type IsoDate, weekdayOf } from '../calendar/dates.ts';
import {
  countFor,
  phrase,
  type ViewsCtx,
  type ViewsLevel,
  type ViewsPerson,
  viewsLevel,
  viewsRng,
} from './shared.ts';

export interface PlanTask {
  id: string;
  title: string;
  /** First working day (inclusive). */
  start: IsoDate;
  /** Last working day (inclusive); equals `start` for milestones. */
  end: IsoDate;
  /** Working days of effort; 0 for milestones. */
  durationDays: number;
  milestone: boolean;
  assigneeId: string | null;
  /** 0–100, from where `today` falls in the task. */
  progress: number;
  costCents: number;
}

export interface PlanDependency {
  id: string;
  /** Predecessor task id. */
  from: string;
  /** Successor task id. */
  to: string;
  /** FS: the successor starts after the predecessor ends; SS: it starts once the predecessor starts. */
  type: 'FS' | 'SS';
  lagDays: number;
}

export interface TaskPlan {
  tasks: PlanTask[];
  dependencies: PlanDependency[];
}

export interface TaskPlanOptions {
  people: readonly ViewsPerson[];
  level?: ViewsLevel;
}

const AREAS = [
  'API',
  'billing',
  'mobile app',
  'onboarding',
  'search',
  'reports',
  'sync',
  'settings',
  'exports',
];
const STEPS = ['Design', 'Build', 'Test', 'Polish', 'Document', 'Review', 'Migrate'];

const isWorkday = (date: IsoDate) => ![0, 6].includes(weekdayOf(date));

/** The first working day on or after `date`. */
export function nextWorkday(date: IsoDate): IsoDate {
  let day = date;
  while (!isWorkday(day)) day = addDays(day, 1);
  return day;
}

/** The working day `count` working days after `date` (0 = `date` itself, rolled forward). */
export function addWorkdays(date: IsoDate, count: number): IsoDate {
  let day = nextWorkday(date);
  for (let left = count; left > 0; left--) day = nextWorkday(addDays(day, 1));
  return day;
}

/**
 * A project plan as a DAG: each task may depend only on earlier tasks (so the
 * graph is acyclic by construction), with FS or SS links and lags. Every
 * start is the latest of its constraints, rolled onto a working day, and every
 * end counts working days; milestones take no time. It starts three weeks
 * before the reference time, so some work is done, some under way.
 */
export function generateTaskPlan(ctx: ViewsCtx, options: TaskPlanOptions): TaskPlan {
  const level = viewsLevel(ctx, 'plan', options.level);
  const count = countFor(level, [0, 24, 160, 18]);
  if (count === 0) return { tasks: [], dependencies: [] };
  const rng = viewsRng(ctx, 'plan');
  const today = dateIn(ctx.time.now.getTime(), 'UTC');
  const projectStart = nextWorkday(addDays(today, -21));
  const tasks: PlanTask[] = [];
  const dependencies: PlanDependency[] = [];

  for (let i = 0; i < count; i++) {
    const milestone = i > 0 && (i % 8 === 7 || (level === 'edge' && i === count - 1));
    const id = ctx.ids.next('task');
    const durationDays = milestone ? 0 : rng.int(1, 8);
    // Up to three predecessors among the previous eight tasks; the edge plan's last task fans in from many.
    const fanIn =
      level === 'edge' && i === count - 2
        ? Math.min(i, 10)
        : i === 0
          ? 0
          : rng.int(milestone ? 1 : 0, 3);
    const candidates = tasks.slice(Math.max(0, i - (fanIn > 3 ? i : 8)));
    const chosen = new Set<string>();
    for (let k = 0; k < fanIn && chosen.size < candidates.length; k++)
      chosen.add((rng.pick(candidates) as PlanTask).id);
    let start = projectStart;
    for (const from of [...chosen].sort()) {
      const pred = tasks.find((t) => t.id === from) as PlanTask;
      const type = milestone || rng.chance(0.75) ? 'FS' : 'SS';
      const lagDays = rng.chance(0.2) ? rng.int(1, 3) : 0;
      dependencies.push({ id: ctx.ids.next('dep'), from, to: id, type, lagDays });
      // FS: the day after the predecessor's last day; SS: its first day.
      const bound =
        type === 'FS'
          ? addWorkdays(pred.end, (pred.milestone ? 0 : 1) + lagDays)
          : addWorkdays(pred.start, lagDays);
      if (bound > start) start = bound;
    }
    start = nextWorkday(start);
    const end = milestone ? start : addWorkdays(start, durationDays - 1);
    const elapsed = daysBetween(start, today);
    const span = daysBetween(start, end) + 1;
    const progress =
      today < start ? 0 : today > end ? 100 : Math.min(95, Math.round((elapsed / span) * 100));
    const longTitle = level === 'edge' && i === 3;
    tasks.push({
      id,
      title: milestone
        ? `Milestone: ${rng.pick(AREAS)} ready`
        : `${rng.pick(STEPS)} ${phrase(rng, AREAS, 1)}${longTitle ? ` ${'with cross-team sign-off '.repeat(8).trim()}` : ''}`,
      start,
      end,
      durationDays,
      milestone,
      assigneeId:
        milestone || options.people.length === 0
          ? null
          : (rng.pick(options.people) as ViewsPerson).id,
      progress,
      costCents: milestone ? 0 : durationDays * rng.int(40, 120) * 100_00,
    });
  }
  return { tasks, dependencies };
}
