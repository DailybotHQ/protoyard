/**
 * Deterministic attention watchers.
 *
 * Same world, same `now` and same existing items always return the same
 * additions. Ids are FNV-1a over the key, `now` and the generation — no
 * Math.random and no Date.now.
 *
 * English titles are fallbacks; screens may show `text` through i18n.
 */

import { ageDays, plusDays, previousWorkingDays, withinDays } from './clock.ts';
import type { AttentionItem, AttentionKind, EvidenceLink } from './types.ts';
import type { WatcherWorld, WatchMilestone, WatchTask } from './world.ts';

export const WORKING_DAY_THRESHOLD = 3;
export const OVERLOAD_THRESHOLD = 8;
export const STALL_DAYS = 5;

const DUE_SOON_DAYS = 7;
const SLIP_DAYS = 3;
const OPEN_RATIO = 0.3;
/** "Due this week", including a summary inside 24 h. */
const SUMMARY_LEAD_DAYS = 7;

export function attentionKey(item: { kind: AttentionKind; subjectId: string }): string {
  return `${item.kind}:${item.subjectId}`;
}

function hashSeed(label: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < label.length; index += 1) {
    hash = Math.imul(hash ^ label.charCodeAt(index), 0x01000193);
  }
  return hash >>> 0;
}

/** Stable id derived from the key, instant and generation. */
function itemId(key: string, now: string, generation: number): string {
  const hash = hashSeed(`${key}:${now}:${generation}`).toString(16).padStart(8, '0');
  return `attn_${hash}_${generation}`;
}

function isOpen(task: WatchTask): boolean {
  if (task.open === false) return false;
  if (task.open === true) return true;
  return task.category !== 'done' && task.category !== 'canceled' && task.category !== '';
}

function isInProgress(task: WatchTask): boolean {
  return task.category === 'in_progress';
}

function suppressed(existing: AttentionItem[], key: string, cleared: ReadonlySet<string>): boolean {
  const latest = existing.filter((item) => item.key === key).at(-1);
  if (!latest) return false;
  if (latest.status === 'open' || latest.status === 'dismissed' || latest.status === 'snoozed') {
    return true;
  }
  if (latest.status === 'approved') return !cleared.has(key);
  return true;
}

function build(
  existing: AttentionItem[],
  now: string,
  fields: Omit<AttentionItem, 'id' | 'key' | 'status' | 'raisedAt' | 'snoozedUntil'>
): AttentionItem {
  const key = attentionKey(fields);
  const generation = existing.filter((item) => item.key === key).length;
  return {
    ...fields,
    id: itemId(key, now, generation),
    key,
    status: 'open',
    raisedAt: now,
    snoozedUntil: null,
  };
}

function openCount(tasks: readonly WatchTask[], personaId: string, boardId: string | null): number {
  return tasks.filter((task) => {
    if (!isOpen(task) || task.ownerId !== personaId) return false;
    if (boardId && task.boardId !== boardId) return false;
    return true;
  }).length;
}

function mainBoard(tasks: readonly WatchTask[], personaId: string): string | null {
  const counts = new Map<string, number>();
  for (const task of tasks) {
    if (task.ownerId !== personaId || !task.boardId) continue;
    counts.set(task.boardId, (counts.get(task.boardId) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [board, count] of counts) {
    if (count > bestCount) {
      best = board;
      bestCount = count;
    }
  }
  return best;
}

function leastLoaded(world: WatcherWorld, ownerId: string, boardId: string | null): string {
  const people = world.people.filter((person) => person.id !== ownerId && person.role !== 'guest');
  const onBoard = boardId
    ? people.filter((person) =>
        world.tasks.some((task) => task.boardId === boardId && task.ownerId === person.id)
      )
    : [];
  const pool = onBoard.length > 0 ? onBoard : people;
  const ranked = [...pool].sort((left, right) => {
    const scope = onBoard.length > 0 ? boardId : null;
    const diff = openCount(world.tasks, left.id, scope) - openCount(world.tasks, right.id, scope);
    if (diff !== 0) return diff;
    return left.fullName.localeCompare(right.fullName);
  });
  return ranked[0]?.id ?? ownerId;
}

function hasBlocker(world: WatcherWorld, task: WatchTask): boolean {
  return world.comments.some(
    (row) => (row.taskId === task.id || row.taskId === task.key) && /block/i.test(row.body)
  );
}

function stalledTasks(world: WatcherWorld, now: string): WatchTask[] {
  return world.tasks.filter(
    (task) =>
      isInProgress(task) && ageDays(task.updatedAt, now) >= STALL_DAYS && hasBlocker(world, task)
  );
}

function projectPath(milestone: WatchMilestone): string {
  return milestone.projectId ? `#/projects/${milestone.projectId}?tab=milestones` : '#/projects';
}

/** Work health — at least 8 open tasks, at least 3 due within 7 days, one stalled. */
export function watchOverloaded(
  world: WatcherWorld,
  now: string,
  existing: AttentionItem[],
  cleared: ReadonlySet<string> = new Set()
): AttentionItem[] {
  const stalled = stalledTasks(world, now);
  const items: AttentionItem[] = [];
  for (const person of world.people) {
    const open = world.tasks.filter((task) => isOpen(task) && task.ownerId === person.id);
    const dueSoon = open.filter((task) =>
      withinDays(task.dueDate, now, DUE_SOON_DAYS, world.timezone)
    );
    if (open.length < OVERLOAD_THRESHOLD || dueSoon.length < 3) continue;
    const chosen = stalled
      .filter((task) => task.ownerId === person.id)
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))[0];
    if (!chosen) continue;
    const board = chosen.boardId ?? mainBoard(world.tasks, person.id);
    const toPersonaId = leastLoaded(world, person.id, board);
    const days = Math.floor(ageDays(chosen.updatedAt, now));
    const fields = {
      kind: 'reassign' as const,
      response: 'asks_first' as const,
      title: `Reassign ${chosen.key}? ${person.firstName} is overloaded`,
      detail: `${person.firstName} has ${open.length} open tasks.`,
      text: {
        title: {
          key: 'attention.items.overload.title',
          params: { task: chosen.key, name: person.firstName },
        },
        detail: {
          key: 'attention.items.overload.detail',
          params: {
            name: person.firstName,
            count: open.length,
            due: dueSoon.length,
            task: chosen.key,
            days,
          },
        },
      },
      evidence: [
        {
          label: `${person.firstName}'s tasks`,
          href: '#/board?scope=workspace&lanes=owner',
          text: { key: 'attention.items.evidence.tasks_of', params: { name: person.firstName } },
          target: {
            kind: 'tasks' as const,
            total: open.length,
            tasks: open.slice(0, 8).map((task) => ({
              key: task.key,
              title: task.title,
              due: task.dueDate,
            })),
          },
        },
      ] satisfies EvidenceLink[],
      action: { type: 'reassign_task' as const, taskKey: chosen.key, toPersonaId },
      subjectId: person.id,
    };
    if (suppressed(existing, attentionKey(fields), cleared)) continue;
    items.push(build(existing, now, fields));
  }
  return items;
}

/** Stalled work raises its own item only when the owner is not already overloaded. */
export function watchStalled(
  world: WatcherWorld,
  now: string,
  existing: AttentionItem[],
  cleared: ReadonlySet<string> = new Set()
): AttentionItem[] {
  const overloaded = new Set(
    watchOverloaded(world, now, [], new Set()).map((item) => item.subjectId)
  );
  const items: AttentionItem[] = [];
  for (const task of stalledTasks(world, now)) {
    if (!task.ownerId || overloaded.has(task.ownerId)) continue;
    const toPersonaId = leastLoaded(
      world,
      task.ownerId,
      task.boardId ?? mainBoard(world.tasks, task.ownerId)
    );
    const days = Math.floor(ageDays(task.updatedAt, now));
    const fields = {
      kind: 'reassign' as const,
      response: 'asks_first' as const,
      title: `Reassign ${task.key}? It has been stalled`,
      detail: `${task.title} has had no activity for ${STALL_DAYS} days.`,
      text: {
        title: { key: 'attention.items.stalled.title', params: { task: task.key } },
        detail: {
          key: 'attention.items.stalled.detail',
          params: { task: task.title, days },
        },
      },
      evidence: [
        {
          label: task.key,
          href: `#/work/${task.key}`,
          target: { kind: 'path' as const, path: `#/work/${task.key}` },
        },
      ] satisfies EvidenceLink[],
      action: { type: 'reassign_task' as const, taskKey: task.key, toPersonaId },
      subjectId: task.id,
    };
    if (suppressed(existing, attentionKey(fields), cleared)) continue;
    items.push(build(existing, now, fields));
  }
  return items;
}

function milestoneTasks(tasks: readonly WatchTask[], milestone: WatchMilestone): WatchTask[] {
  const ids = new Set(milestone.taskIds);
  return tasks.filter(
    (task) => ids.has(task.id) || ids.has(task.key) || task.milestoneId === milestone.id
  );
}

/** A milestone due within 3 days with at least 30% of its tasks open. */
export function watchSlippingDate(
  world: WatcherWorld,
  now: string,
  existing: AttentionItem[],
  cleared: ReadonlySet<string> = new Set()
): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const milestone of world.milestones) {
    if (!withinDays(milestone.dueDate, now, SLIP_DAYS, world.timezone)) continue;
    const linked = milestoneTasks(world.tasks, milestone);
    if (linked.length === 0) continue;
    const open = linked.filter(isOpen);
    if (open.length / linked.length < OPEN_RATIO) continue;
    const toDate = plusDays(milestone.dueDate.slice(0, 10), 7);
    const path = projectPath(milestone);
    const fields = {
      kind: 'move_date' as const,
      response: 'asks_first' as const,
      title: `Move the ${milestone.name} date?`,
      detail: `${open.length} of ${linked.length} tasks are still open.`,
      text: {
        title: {
          key: 'attention.items.move_date.title',
          params: { milestone: milestone.name },
        },
        detail: {
          key: 'attention.items.move_date.detail',
          params: {
            open: open.length,
            total: linked.length,
            due: milestone.dueDate.slice(0, 10),
          },
          dates: ['due'],
        },
      },
      evidence: [
        {
          label: milestone.name,
          href: path,
          target: { kind: 'path' as const, path },
        },
        ...open.map((task) => ({
          label: task.key,
          href: `#/work/${task.key}`,
          target: { kind: 'path' as const, path: `#/work/${task.key}` },
        })),
      ],
      action: { type: 'move_date' as const, milestoneId: milestone.id, toDate },
      subjectId: milestone.id,
    };
    if (suppressed(existing, attentionKey(fields), cleared)) continue;
    items.push(build(existing, now, fields));
  }
  return items;
}

/** No stand-up response for at least 3 working days, and the person has answered before. */
export function watchQuietPerson(
  world: WatcherWorld,
  now: string,
  existing: AttentionItem[],
  cleared: ReadonlySet<string> = new Set()
): AttentionItem[] {
  const days = previousWorkingDays(now, WORKING_DAY_THRESHOLD, world.timezone);
  const items: AttentionItem[] = [];
  for (const person of world.people) {
    const answered = new Set(
      world.responses
        .filter((row) => row.personaId === person.id)
        .map((row) => row.date.slice(0, 10))
    );
    if (answered.size === 0) continue;
    if (days.some((day) => answered.has(day))) continue;
    const path = world.checkinId
      ? `#/check-ins/${world.checkinId}/activity?users=${person.id}`
      : '#/check-ins';
    const fields = {
      kind: 'nudge' as const,
      response: 'handles' as const,
      title: `${person.firstName} has not answered in ${WORKING_DAY_THRESHOLD} days — nudge?`,
      detail: `Missing ${days.join(', ')}.`,
      text: {
        title: {
          key: 'attention.items.nudge.title',
          params: { name: person.firstName, days: WORKING_DAY_THRESHOLD },
        },
        detail: {
          key: 'attention.items.nudge.detail',
          params: Object.fromEntries(days.map((day, index) => [`day${index}`, day])),
          dates: days.map((_, index) => `day${index}`),
        },
      },
      evidence: [
        {
          label: `${person.firstName}'s check-ins`,
          href: path,
          text: { key: 'attention.items.evidence.checkins_of', params: { name: person.firstName } },
          target: { kind: 'path' as const, path },
        },
      ] satisfies EvidenceLink[],
      action: {
        type: 'nudge' as const,
        personaId: person.id,
        checkinId: world.checkinId || 'checkin',
      },
      subjectId: person.id,
    };
    if (suppressed(existing, attentionKey(fields), cleared)) continue;
    items.push(build(existing, now, fields));
  }
  return items;
}

function moraleSeries(world: WatcherWorld): WatcherWorld['mood'] {
  const team = world.mood[0]?.teamId;
  if (!team) return [];
  return world.mood
    .filter((row) => row.teamId === team)
    .sort((left, right) => left.period.localeCompare(right.period));
}

/** Mood lower two weeks in a row. Asks a lead, or the fallback when that lead is deciding. */
export function watchMorale(
  world: WatcherWorld,
  now: string,
  existing: AttentionItem[],
  cleared: ReadonlySet<string> = new Set(),
  leads: { personId: string; fallbackId: string } = { personId: 'morgan', fallbackId: 'avery' }
): AttentionItem[] {
  const ordered = moraleSeries(world);
  const before = ordered.at(-3);
  const previous = ordered.at(-2);
  const last = ordered.at(-1);
  if (!before || !previous || !last) return [];
  if (!(last.score < previous.score && previous.score < before.score)) return [];
  const question = 'Morale dipped two weeks in a row. What should we change?';
  const fields = {
    kind: 'escalate' as const,
    response: 'brings_person' as const,
    title: 'Morale dipped two weeks in a row — talk to the team?',
    detail: `Scores ${before.score} → ${previous.score} → ${last.score}.`,
    text: {
      title: { key: 'attention.items.morale.title' },
      detail: {
        key: 'attention.items.morale.detail',
        params: { a: before.score, b: previous.score, c: last.score },
      },
    },
    evidence: [
      {
        label: 'Motivation, last three weeks',
        href: '#/settings/mood',
        text: { key: 'attention.items.evidence.mood' },
        target: {
          kind: 'mood' as const,
          scores: [before, previous, last].map((row) => ({ period: row.period, score: row.score })),
        },
      },
    ] satisfies EvidenceLink[],
    action: {
      type: 'ask_person' as const,
      personaId: leads.personId,
      fallbackPersonaId: leads.fallbackId,
      question,
    },
    subjectId: 'morale',
  };
  if (suppressed(existing, attentionKey(fields), cleared)) return [];
  return [build(existing, now, fields)];
}

/** The weekly summary is due this week and has not been posted. */
export function watchSummaryDue(
  world: WatcherWorld,
  now: string,
  existing: AttentionItem[],
  cleared: ReadonlySet<string> = new Set()
): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const fact of world.summaries) {
    if (fact.posted) continue;
    if (!withinDays(fact.dueDate, now, SUMMARY_LEAD_DAYS, world.timezone)) continue;
    const fields = {
      kind: 'summary' as const,
      response: 'handles' as const,
      title: 'Weekly summary ready',
      detail: `Due ${fact.dueDate}.`,
      text: {
        title: { key: 'attention.items.summary.title' },
        detail: {
          key: 'attention.items.summary.detail',
          params: { due: fact.dueDate.slice(0, 10) },
          dates: ['due'],
        },
      },
      evidence: [
        {
          label: '#product',
          href: '#/chat',
          target: { kind: 'channel' as const, channel: 'product' },
        },
      ] satisfies EvidenceLink[],
      action: { type: 'post_summary' as const, channel: '#product' },
      subjectId: fact.id,
    };
    if (suppressed(existing, attentionKey(fields), cleared)) continue;
    items.push(build(existing, now, fields));
  }
  return items;
}

/** Named watcher functions the presets select from. */
export const ATTENTION_WATCHERS = {
  overloaded: watchOverloaded,
  stalled: watchStalled,
  slippingDate: watchSlippingDate,
  quietPerson: watchQuietPerson,
  morale: watchMorale,
  summaryDue: watchSummaryDue,
} as const;

export type AttentionWatcherName = keyof typeof ATTENTION_WATCHERS;

export interface RunWatchersOptions {
  /** Keys whose approved condition has cleared and may raise again. */
  cleared?: ReadonlySet<string>;
  /** Subset of watchers to run. Defaults to every built-in watcher. */
  watchers?: readonly AttentionWatcherName[];
  /** Leads for the morale escalate item. */
  moraleLeads?: { personId: string; fallbackId: string };
}

/**
 * Items to add. An open, dismissed or snoozed row blocks its key.
 * An approved row blocks until `cleared` records that the condition went away.
 */
function isClearedSet(value: unknown): value is ReadonlySet<string> {
  return value instanceof Set;
}

export function runWatchers(
  world: WatcherWorld,
  now: string,
  existing: AttentionItem[],
  options: RunWatchersOptions | ReadonlySet<string> = {}
): AttentionItem[] {
  const opts: RunWatchersOptions = isClearedSet(options) ? { cleared: options } : options;
  const cleared = opts.cleared ?? new Set<string>();
  const names = opts.watchers ?? (Object.keys(ATTENTION_WATCHERS) as AttentionWatcherName[]);
  const additions: AttentionItem[] = [];
  for (const name of names) {
    if (name === 'morale') {
      additions.push(...watchMorale(world, now, existing, cleared, opts.moraleLeads));
    } else {
      additions.push(...ATTENTION_WATCHERS[name](world, now, existing, cleared));
    }
  }
  const seen = new Set<string>();
  return additions.filter((item) => {
    if (seen.has(item.key)) return false;
    seen.add(item.key);
    return true;
  });
}
