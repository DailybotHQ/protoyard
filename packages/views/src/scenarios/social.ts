import {
  countFor,
  phrase,
  type ViewsCtx,
  type ViewsLevel,
  type ViewsPerson,
  viewsLevel,
  viewsRng,
} from './shared.ts';

/** A record that comments, activity and notifications refer to. */
export interface ViewsSubject {
  id: string;
  title: string;
}

export interface CommentRow {
  id: string;
  subjectId: string;
  /** The comment it replies to (null for a thread's first comment). */
  parentId: string | null;
  authorId: string;
  /** Plain text; mentions appear as `@handle`. */
  body: string;
  /** Person ids mentioned in `body`, in order. */
  mentionIds: string[];
  createdAt: string;
}

export type ActivityVerb = 'created' | 'updated' | 'commented' | 'assigned' | 'completed';

export interface ActivityRow {
  id: string;
  subjectId: string;
  actorId: string;
  verb: ActivityVerb;
  field?: string;
  from?: string;
  to?: string;
  at: string;
}

export interface NotificationRow {
  id: string;
  recipientId: string;
  kind: 'mention' | 'assigned' | 'comment';
  title: string;
  subjectId: string;
  at: string;
  readAt: string | null;
}

export interface SocialOptions {
  people: readonly ViewsPerson[];
  subjects: readonly ViewsSubject[];
  level?: ViewsLevel;
}

const OPENERS = [
  'Looks good overall.',
  'Quick question on this.',
  'Updated the numbers.',
  'Shipping this today.',
  'Blocked on review.',
  'Nice work!',
];
const DETAILS = [
  'the copy',
  'the totals',
  'the timeline',
  'the screenshots',
  'the edge cases',
  'the export',
  'the rollout plan',
];
const STATUSES = ['todo', 'in progress', 'in review', 'done'];

/** Comment threads: a first comment per thread plus replies, with mentions that always resolve to `people`. */
export function generateComments(ctx: ViewsCtx, options: SocialOptions): CommentRow[] {
  const level = viewsLevel(ctx, 'comments', options.level);
  const perSubject = countFor(level, [0, 3, 12, 6]);
  if (perSubject === 0 || options.people.length === 0) return [];
  const rng = viewsRng(ctx, 'comments');
  const rows: CommentRow[] = [];
  for (const subject of options.subjects) {
    const total = rng.int(Math.max(1, perSubject - 2), perSubject + 2);
    // Each thread runs forward in time from up to ten days ago.
    let minutesAgo = rng.int(60 * 24 * 2, 60 * 24 * 10);
    const thread: CommentRow[] = [];
    for (let i = 0; i < total; i++) {
      const author = rng.pick(options.people) as ViewsPerson;
      const others = options.people.filter((p) => p.id !== author.id);
      const mentioned =
        others.length > 0 && rng.chance(level === 'edge' ? 0.9 : 0.35)
          ? [rng.pick(others) as ViewsPerson]
          : [];
      if (level === 'edge' && i === 0 && others.length > 1)
        mentioned.push(others[others.length - 1] as ViewsPerson);
      const mentions = mentioned.map((p) => `@${p.handle}`).join(' ');
      const body = `${mentions ? `${mentions} ` : ''}${rng.pick(OPENERS)} See ${phrase(rng, DETAILS, 1)}.${level === 'edge' && i === 1 ? ` ${'More context. '.repeat(40).trim()}` : ''}`;
      minutesAgo = Math.max(1, minutesAgo - rng.int(5, 600));
      const row: CommentRow = {
        id: ctx.ids.next('comment'),
        subjectId: subject.id,
        parentId:
          i === 0
            ? null
            : rng.chance(0.5)
              ? (thread[0] as CommentRow).id
              : (rng.pick(thread) as CommentRow).id,
        authorId: author.id,
        body,
        mentionIds: [...new Set(mentioned.map((p) => p.id))],
        createdAt: ctx.time.iso(new Date(ctx.time.now.getTime() - minutesAgo * 60_000)),
      };
      thread.push(row);
      rows.push(row);
    }
  }
  return rows;
}

/** Activity entries per subject (created first, then changes), newest first overall. */
export function generateActivity(ctx: ViewsCtx, options: SocialOptions): ActivityRow[] {
  const level = viewsLevel(ctx, 'activity', options.level);
  const perSubject = countFor(level, [0, 4, 15, 8]);
  if (perSubject === 0 || options.people.length === 0) return [];
  const rng = viewsRng(ctx, 'activity');
  const rows: ActivityRow[] = [];
  for (const subject of options.subjects) {
    let minutesAgo = rng.int(60 * 24 * 5, 60 * 24 * 20);
    let status = 'todo';
    for (let i = 0; i < perSubject; i++) {
      minutesAgo = Math.max(1, minutesAgo - rng.int(30, 60 * 24));
      const actor = rng.pick(options.people) as ViewsPerson;
      const at = ctx.time.iso(new Date(ctx.time.now.getTime() - minutesAgo * 60_000));
      const id = ctx.ids.next('activity');
      if (i === 0) {
        rows.push({ id, subjectId: subject.id, actorId: actor.id, verb: 'created', at });
        continue;
      }
      const verb = rng.pick(['updated', 'commented', 'assigned', 'updated'] as const);
      if (verb === 'updated') {
        const next = STATUSES[
          Math.min(STATUSES.indexOf(status) + 1, STATUSES.length - 1)
        ] as string;
        const row: ActivityRow = {
          id,
          subjectId: subject.id,
          actorId: actor.id,
          verb: next === 'done' ? 'completed' : 'updated',
          field: 'status',
          from: status,
          to: next,
          at,
        };
        status = next;
        rows.push(row);
      } else if (verb === 'assigned') {
        rows.push({
          id,
          subjectId: subject.id,
          actorId: actor.id,
          verb,
          field: 'assignee',
          to: (rng.pick(options.people) as ViewsPerson).id,
          at,
        });
      } else {
        rows.push({ id, subjectId: subject.id, actorId: actor.id, verb, at });
      }
    }
  }
  return rows.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.id < b.id ? -1 : 1));
}

/** Notifications for people (mentions, assignments, comments), newest first, some already read. */
export function generateNotifications(ctx: ViewsCtx, options: SocialOptions): NotificationRow[] {
  const level = viewsLevel(ctx, 'notifications', options.level);
  const perPerson = countFor(level, [0, 6, 40, 3]);
  if (perPerson === 0 || options.subjects.length === 0) return [];
  const rng = viewsRng(ctx, 'notifications');
  const rows: NotificationRow[] = [];
  for (const person of options.people) {
    for (let i = 0; i < perPerson; i++) {
      const subject = rng.pick(options.subjects) as ViewsSubject;
      const actor = rng.pick(options.people) as ViewsPerson;
      const kind = rng.pick(['mention', 'assigned', 'comment'] as const);
      const atMs = ctx.time.now.getTime() - rng.int(5, 60 * 24 * 14) * 60_000;
      const read = level !== 'edge' && rng.chance(0.55);
      rows.push({
        id: ctx.ids.next('notification'),
        recipientId: person.id,
        kind,
        title:
          kind === 'mention'
            ? `${actor.name} mentioned you on ${subject.title}`
            : kind === 'assigned'
              ? `${actor.name} assigned you ${subject.title}`
              : `${actor.name} commented on ${subject.title}`,
        subjectId: subject.id,
        at: ctx.time.iso(new Date(atMs)),
        readAt: read ? ctx.time.iso(new Date(atMs + rng.int(1, 600) * 60_000)) : null,
      });
    }
  }
  return rows.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.id < b.id ? -1 : 1));
}
