import { z } from 'zod';
import { addDays, daysBetween, type IsoDate, weekdayOf } from '../calendar/dates.ts';

/**
 * Task scheduling for timelines and gantt charts: working-day calendars,
 * FS / SS / FF / SF dependencies with lag, topological order with readable
 * cycle errors, the critical path with slack, and cascading a move to the
 * successors it pushes. Pure, so services run the same rules as the UI.
 *
 * Dates are civil (`YYYY-MM-DD`), inclusive: a task runs from its first to
 * its last working day; a milestone takes no time (`start === end`).
 */

export interface ScheduleTask {
  id: string;
  start: IsoDate;
  end: IsoDate;
  milestone?: boolean;
}

export const DEPENDENCY_TYPES = ['FS', 'SS', 'FF', 'SF'] as const;
export type DependencyType = (typeof DEPENDENCY_TYPES)[number];

export interface Dependency {
  /** Predecessor id. */
  from: string;
  /** Successor id. */
  to: string;
  /**
   * FS: the successor starts after the predecessor finishes; SS: it starts once
   * the predecessor starts; FF: it finishes once the predecessor finishes; SF:
   * it finishes once the predecessor starts.
   */
  type: DependencyType;
  /** Working days of lag (negative for lead). */
  lagDays?: number;
}

export interface WorkCalendar {
  /** Working weekdays, 0 = Sunday (default Monday–Friday). */
  workdays?: readonly number[];
  /** Non-working dates. */
  holidays?: readonly IsoDate[];
}

// ── working days ─────────────────────────────────────────────────────────

/** A Monday long before any plan; ordinals count working days from it. */
const ANCHOR = '1970-01-05';

export interface WorkDays {
  isWorkday(date: IsoDate): boolean;
  /** Working days strictly before `date` (since the anchor). */
  ordinal(date: IsoDate): number;
  /** The working day with this ordinal. */
  fromOrdinal(ordinal: number): IsoDate;
  /** The first working day on or after `date`. */
  next(date: IsoDate): IsoDate;
  /** Working days from `a` to `b` inclusive (0 when `b` is before `a`). */
  count(a: IsoDate, b: IsoDate): number;
}

export function workDays(calendar: WorkCalendar = {}): WorkDays {
  const days = new Set(calendar.workdays ?? [1, 2, 3, 4, 5]);
  if (days.size === 0) throw new RangeError('a work calendar needs at least one working weekday');
  const perWeek = days.size;
  // Working days among the first `n` days of a Monday-based week.
  const prefix = [0];
  for (let i = 0; i < 7; i++) prefix.push((prefix[i] as number) + (days.has((1 + i) % 7) ? 1 : 0));
  const holidays = [...new Set(calendar.holidays ?? [])]
    .filter((d) => days.has(weekdayOf(d)))
    .sort();
  const holidaySet = new Set(holidays);
  const holidaysBefore = (date: IsoDate) => {
    let low = 0;
    let high = holidays.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if ((holidays[middle] as string) < date) low = middle + 1;
      else high = middle;
    }
    return low;
  };
  const isWorkday = (date: IsoDate) => days.has(weekdayOf(date)) && !holidaySet.has(date);
  const ordinal = (date: IsoDate) => {
    const n = daysBetween(ANCHOR, date);
    const weeks = Math.floor(n / 7);
    return weeks * perWeek + (prefix[n - weeks * 7] as number) - holidaysBefore(date);
  };
  const next = (date: IsoDate) => {
    let day = date;
    for (let i = 0; !isWorkday(day); i++) {
      if (i > 3660) throw new RangeError('no working day within ten years');
      day = addDays(day, 1);
    }
    return day;
  };
  return {
    isWorkday,
    ordinal,
    next,
    fromOrdinal(target) {
      // Jump close with whole weeks, then step: holidays only add a few steps.
      let day = addDays(ANCHOR, Math.floor(target / perWeek) * 7);
      for (let at = ordinal(day); at > target; at = ordinal(day)) day = addDays(day, -7);
      day = next(day);
      while (ordinal(day) < target) day = next(addDays(day, 1));
      return day;
    },
    count(a, b) {
      return b < a ? 0 : ordinal(addDays(b, 1)) - ordinal(a);
    },
  };
}

// ── graph ────────────────────────────────────────────────────────────────

export type TopoResult = { ok: true; order: string[] } | { ok: false; cycle: string[] };

/**
 * Tasks in dependency order (predecessors first; ties keep input order).
 * A cycle returns its path, first id repeated at the end: `a → b → c → a`.
 * Links to unknown tasks are ignored here; validate them with the schema.
 */
export function topoOrder(
  taskIds: readonly string[],
  dependencies: readonly Dependency[]
): TopoResult {
  const known = new Set(taskIds);
  const next = new Map<string, string[]>(taskIds.map((id) => [id, []]));
  const incoming = new Map<string, number>(taskIds.map((id) => [id, 0]));
  for (const dep of dependencies) {
    if (!known.has(dep.from) || !known.has(dep.to)) continue;
    next.get(dep.from)?.push(dep.to);
    incoming.set(dep.to, (incoming.get(dep.to) ?? 0) + 1);
  }
  const queue = taskIds.filter((id) => incoming.get(id) === 0);
  const order: string[] = [];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i] as string;
    order.push(id);
    for (const to of next.get(id) ?? []) {
      const left = (incoming.get(to) as number) - 1;
      incoming.set(to, left);
      if (left === 0) queue.push(to);
    }
  }
  if (order.length === taskIds.length) return { ok: true, order };
  // Some tasks are on (or behind) a cycle: walk until a node repeats.
  const stuck = new Set(taskIds.filter((id) => (incoming.get(id) ?? 0) > 0));
  let at = [...stuck][0] as string;
  const path: string[] = [];
  const seen = new Map<string, number>();
  while (!seen.has(at)) {
    seen.set(at, path.length);
    path.push(at);
    at = (next.get(at) ?? []).find((to) => stuck.has(to)) as string;
  }
  return { ok: false, cycle: [...path.slice(seen.get(at)), at] };
}

/** "Dependencies form a cycle: a → b → a", or null. */
export function cycleMessage(
  taskIds: readonly string[],
  dependencies: readonly Dependency[]
): string | null {
  const result = topoOrder(taskIds, dependencies);
  return result.ok ? null : `Dependencies form a cycle: ${result.cycle.join(' → ')}`;
}

export const DependencySchema = z
  .strictObject({
    from: z.string().min(1),
    to: z.string().min(1),
    type: z.enum(DEPENDENCY_TYPES),
    lagDays: z.number().int().min(-365).max(365).optional(),
  })
  .refine((dep) => dep.from !== dep.to, {
    message: 'A task cannot depend on itself',
    path: ['to'],
  });

/**
 * A list of links that must stay acyclic: use it in services (and their zod
 * input schemas) so a cyclic link is a validation error, not a broken plan.
 */
export const DependencyListSchema = z.array(DependencySchema).superRefine((list, ctx) => {
  const ids = [...new Set(list.flatMap((dep) => [dep.from, dep.to]))];
  const message = cycleMessage(ids, list);
  if (message) ctx.addIssue({ code: 'custom', message });
});

// ── scheduling ───────────────────────────────────────────────────────────

/** A task in working-day slots: starts at slot `start`, takes `duration` slots. */
interface Slots {
  start: number;
  duration: number;
}

function slotsOf(task: ScheduleTask, wd: WorkDays): Slots {
  const start = wd.ordinal(wd.next(task.start));
  const duration = task.milestone ? 0 : Math.max(1, wd.count(task.start, task.end));
  return { start, duration };
}

function datesOf(slots: Slots, milestone: boolean, wd: WorkDays): { start: IsoDate; end: IsoDate } {
  const start = wd.fromOrdinal(slots.start);
  return { start, end: milestone ? start : wd.fromOrdinal(slots.start + slots.duration - 1) };
}

/** The earliest start a dependency allows for its successor, in slots. */
function earliestFrom(dep: Dependency, pred: Slots, succDuration: number): number {
  const lag = dep.lagDays ?? 0;
  const finish = pred.start + pred.duration;
  switch (dep.type) {
    case 'FS':
      return finish + lag;
    case 'SS':
      return pred.start + lag;
    case 'FF':
      return finish + lag - succDuration;
    case 'SF':
      return pred.start + lag - succDuration;
  }
}

/** The latest finish a dependency allows for its predecessor, given the successor's latest dates. */
function latestFinishFrom(
  dep: Dependency,
  latestStart: number,
  latestFinish: number,
  predDuration: number
): number {
  const lag = dep.lagDays ?? 0;
  switch (dep.type) {
    case 'FS':
      return latestStart - lag;
    case 'SS':
      return latestStart - lag + predDuration;
    case 'FF':
      return latestFinish - lag;
    case 'SF':
      return latestFinish - lag + predDuration;
  }
}

export interface ScheduleInfo {
  earlyStart: IsoDate;
  earlyFinish: IsoDate;
  lateStart: IsoDate;
  lateFinish: IsoDate;
  /** Working days the task can slip without delaying the project end. */
  slackDays: number;
  critical: boolean;
}

export interface CriticalPath {
  /** By task id. */
  tasks: Map<string, ScheduleInfo>;
  /** Critical task ids in dependency order. */
  critical: string[];
  /** The project's last working day. */
  finish: IsoDate;
}

function plan(tasks: readonly ScheduleTask[], dependencies: readonly Dependency[]) {
  const result = topoOrder(
    tasks.map((t) => t.id),
    dependencies
  );
  if (!result.ok) throw new RangeError(`Dependencies form a cycle: ${result.cycle.join(' → ')}`);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const into = new Map<string, Dependency[]>();
  const out = new Map<string, Dependency[]>();
  for (const dep of dependencies) {
    if (!byId.has(dep.from) || !byId.has(dep.to)) continue;
    into.set(dep.to, [...(into.get(dep.to) ?? []), dep]);
    out.set(dep.from, [...(out.get(dep.from) ?? []), dep]);
  }
  return { order: result.order, byId, into, out };
}

/**
 * Forward and backward pass. A task starts at its own start or as soon as its
 * predecessors allow, whichever is later; slack is how far it can slip before
 * it moves the project end. Throws a `RangeError` naming the cycle, if any.
 */
export function criticalPath(
  tasks: readonly ScheduleTask[],
  dependencies: readonly Dependency[],
  calendar: WorkCalendar = {}
): CriticalPath {
  const wd = workDays(calendar);
  const { order, byId, into, out } = plan(tasks, dependencies);
  const early = new Map<string, Slots>();
  for (const id of order) {
    const own = slotsOf(byId.get(id) as ScheduleTask, wd);
    let start = own.start;
    for (const dep of into.get(id) ?? [])
      start = Math.max(start, earliestFrom(dep, early.get(dep.from) as Slots, own.duration));
    early.set(id, { start, duration: own.duration });
  }
  const projectFinish = Math.max(...[...early.values()].map((s) => s.start + s.duration), 0);
  const lateFinish = new Map<string, number>();
  for (const id of [...order].reverse()) {
    const { duration } = early.get(id) as Slots;
    let finish = projectFinish;
    for (const dep of out.get(id) ?? []) {
      const lf = lateFinish.get(dep.to) as number;
      const succ = early.get(dep.to) as Slots;
      finish = Math.min(finish, latestFinishFrom(dep, lf - succ.duration, lf, duration));
    }
    lateFinish.set(id, finish);
  }
  const info = new Map<string, ScheduleInfo>();
  const critical: string[] = [];
  for (const id of order) {
    const e = early.get(id) as Slots;
    const lf = lateFinish.get(id) as number;
    const slack = lf - e.duration - e.start;
    const milestone = byId.get(id)?.milestone === true;
    const earlyDates = datesOf(e, milestone, wd);
    const lateDates = datesOf({ start: lf - e.duration, duration: e.duration }, milestone, wd);
    info.set(id, {
      earlyStart: earlyDates.start,
      earlyFinish: earlyDates.end,
      lateStart: lateDates.start,
      lateFinish: lateDates.end,
      slackDays: slack,
      critical: slack <= 0,
    });
    if (slack <= 0) critical.push(id);
  }
  return {
    tasks: info,
    critical,
    finish: tasks.length === 0 ? wd.next(ANCHOR) : wd.fromOrdinal(Math.max(projectFinish - 1, 0)),
  };
}

export interface TaskChange {
  id: string;
  /** New start; the duration is kept unless `end` is given too. */
  start?: IsoDate;
  end?: IsoDate;
}

export interface CascadeResult {
  /** Only the rows whose dates changed (the moved task first), to write in one transaction. */
  changes: { id: string; start: IsoDate; end: IsoDate }[];
  /** Links into the moved task that its new dates break (it moved earlier than they allow). */
  violations: Dependency[];
}

/**
 * Applies a change and pushes every successor later only as far as its links
 * require (nothing is pulled earlier). Throws a `RangeError` for an unknown
 * task, an end before the start, or a cycle.
 */
export function cascade(
  tasks: readonly ScheduleTask[],
  dependencies: readonly Dependency[],
  change: TaskChange,
  calendar: WorkCalendar = {}
): CascadeResult {
  const wd = workDays(calendar);
  const { order, byId, into } = plan(tasks, dependencies);
  const target = byId.get(change.id);
  if (!target) throw new RangeError(`There is no task ${change.id}.`);
  const slots = new Map(tasks.map((t) => [t.id, slotsOf(t, wd)]));
  const own = slots.get(change.id) as Slots;
  const start = change.start ? wd.ordinal(wd.next(change.start)) : own.start;
  let duration = own.duration;
  if (change.end && !target.milestone) {
    const end = wd.ordinal(wd.next(change.end));
    if (end < start) throw new RangeError('A task cannot end before it starts.');
    duration = end - start + 1;
  }
  slots.set(change.id, { start, duration });

  const violations = (into.get(change.id) ?? []).filter(
    (dep) => earliestFrom(dep, slots.get(dep.from) as Slots, duration) > start
  );
  const moved = new Set([change.id]);
  for (const id of order.slice(order.indexOf(change.id) + 1)) {
    const current = slots.get(id) as Slots;
    let required = current.start;
    for (const dep of into.get(id) ?? []) {
      if (!moved.has(dep.from)) continue;
      required = Math.max(
        required,
        earliestFrom(dep, slots.get(dep.from) as Slots, current.duration)
      );
    }
    if (required > current.start) {
      slots.set(id, { start: required, duration: current.duration });
      moved.add(id);
    }
  }
  const changes: CascadeResult['changes'] = [];
  for (const id of [change.id, ...order.filter((o) => o !== change.id)]) {
    if (!moved.has(id)) continue;
    const task = byId.get(id) as ScheduleTask;
    const dates = datesOf(slots.get(id) as Slots, task.milestone === true, wd);
    if (dates.start !== task.start || dates.end !== task.end) changes.push({ id, ...dates });
  }
  return { changes, violations };
}

/** Working days a task takes (0 for milestones). */
export function durationDays(task: ScheduleTask, calendar: WorkCalendar = {}): number {
  if (task.milestone) return 0;
  return Math.max(1, workDays(calendar).count(task.start, task.end));
}
