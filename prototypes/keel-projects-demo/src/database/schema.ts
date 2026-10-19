import type { DatabaseDefinition } from '@protoyard/core';
import type { Dexie, EntityTable, Transaction } from 'dexie';

/**
 * Task manager data model. Seeded ids are deterministic (`task_0007`); ids
 * created in the UI carry a `u` marker (`task_u3f…`).
 *
 * project 1─* task 1─* comment, task 1─* activity, task *─* task through
 * `dependencies` (finish-to-start), project 1─* ritual (recurring calendar
 * series), persona 1─* savedView (task grid views). `ownerId`, `assigneeId`,
 * `reporterId`, `authorId` and `actorId` reference personas in the reserved
 * `py_personas` table. To add a table, add a NEW version (never edit an old
 * one) and bump `storage.schemaVersion` in protoyard.json.
 */

export const TASK_STATUSES = ['todo', 'in-progress', 'review', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_LABELS = [
  'bug',
  'feature',
  'design',
  'frontend',
  'backend',
  'research',
  'docs',
  'blocked',
] as const;
export type TaskLabel = (typeof TASK_LABELS)[number];

export const PROJECT_COLORS = ['violet', 'blue', 'teal', 'amber', 'rose', 'slate'] as const;
export type ProjectColor = (typeof PROJECT_COLORS)[number];

/** Type aliases (not interfaces) so rows stay assignable to the generic `Row`. */
export type Project = {
  id: string;
  name: string;
  /** Short uppercase prefix for task keys: `WEB` → `WEB-12`. */
  key: string;
  description: string;
  color: ProjectColor;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
};

export type Task = {
  id: string;
  projectId: string;
  /** Sequential per project; shown as `<project key>-<number>`. */
  number: number;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  /** Who created the task; members may delete only tasks they reported. */
  reporterId: string;
  /** Calendar day `YYYY-MM-DD` (no time), compared against the simulated clock. */
  dueDate: string | null;
  startDate: string;
  endDate: string;
  estimateHours: number;
  sprintId: string;
  /** A milestone: a zero-length gate on the timeline (start = end). */
  milestone: boolean;
  labels: TaskLabel[];
  /** Position inside its column (ascending). */
  order: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Sprint = {
  id: string;
  projectId: string;
  name: string;
  startDate: string;
  endDate: string;
  goal: string;
};

export type Comment = {
  id: string;
  taskId: string;
  /** The comment this one replies to (same task), or absent for a top-level comment. */
  parentId?: string | null;
  authorId: string;
  body: string;
  createdAt: string;
};

export type ActivityType = 'created' | 'moved' | 'assigned' | 'edited' | 'commented';

export type Activity = {
  id: string;
  taskId: string;
  projectId: string;
  actorId: string;
  type: ActivityType;
  body: string;
  at: string;
};

export type Notification = {
  id: string;
  personaId: string;
  kind: 'mention';
  title: string;
  subjectId: string;
  createdAt: string;
  readAt: string | null;
};

/** `fromId` must finish before `toId` starts (finish-to-start, no lag). */
export type Dependency = {
  id: string;
  projectId: string;
  fromId: string;
  toId: string;
  type: 'FS';
};

export const RITUAL_KINDS = ['standup', 'planning', 'review', 'retro', 'critique'] as const;
export type RitualKind = (typeof RITUAL_KINDS)[number];

/** The calendar engine's recurrence rule (`RecurrenceRule` in @protoyard/views/calendar). */
export type RitualRule = {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval?: number;
  byDay?: string[];
  byMonthDay?: number[];
  count?: number;
  until?: string;
};

/**
 * A recurring team ritual, stored in the calendar engine's series shape
 * (`CalendarSeries` from @protoyard/views/calendar): ISO instants, a rule,
 * skipped occurrences (`exdates`) and per-occurrence `overrides`, so the
 * calendar edits ("this", "following", "all") write rows back as they are.
 */
export type Ritual = {
  id: string;
  projectId: string | null;
  kind: RitualKind;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  timeZone: string;
  rule?: RitualRule;
  exdates?: string[];
  overrides?: Record<string, { start?: string; end?: string }>;
  createdAt: string;
};

/** A named task grid view (sort, filters, columns, density), per persona. */
export type SavedView = {
  id: string;
  personaId: string;
  name: string;
  /** Serialized grid view state (`GridViewState` from @protoyard/views/grid). */
  state: string;
  createdAt: string;
};

export type TaskDatabase = Dexie & {
  projects: EntityTable<Project, 'id'>;
  tasks: EntityTable<Task, 'id'>;
  sprints: EntityTable<Sprint, 'id'>;
  comments: EntityTable<Comment, 'id'>;
  activity: EntityTable<Activity, 'id'>;
  notifications: EntityTable<Notification, 'id'>;
  dependencies: EntityTable<Dependency, 'id'>;
  rituals: EntityTable<Ritual, 'id'>;
  savedViews: EntityTable<SavedView, 'id'>;
};

export const database: DatabaseDefinition = {
  versions: [
    {
      version: 1,
      stores: {
        projects: 'id, name, ownerId, createdAt',
        tasks:
          'id, projectId, status, assigneeId, reporterId, dueDate, priority, *labels, updatedAt',
        comments: 'id, taskId, authorId, createdAt',
        activity: 'id, taskId, projectId, actorId, at',
      },
    },
    {
      version: 2,
      stores: {
        projects: 'id, name, ownerId, createdAt',
        tasks:
          'id, projectId, status, assigneeId, reporterId, dueDate, priority, *labels, updatedAt',
        comments: 'id, taskId, authorId, createdAt',
        activity: 'id, taskId, projectId, actorId, at',
        notifications: 'id, personaId, kind, subjectId, createdAt, readAt, [personaId+readAt]',
      },
    },
    {
      version: 3,
      stores: {
        projects: 'id, name, ownerId, createdAt',
        tasks:
          'id, projectId, status, assigneeId, reporterId, dueDate, priority, sprintId, *labels, updatedAt',
        sprints: 'id, projectId, startDate, endDate',
        comments: 'id, taskId, authorId, createdAt',
        activity: 'id, taskId, projectId, actorId, at',
        notifications: 'id, personaId, kind, subjectId, createdAt, readAt, [personaId+readAt]',
      },
    },
    {
      version: 4,
      stores: {
        projects: 'id, name, ownerId, createdAt',
        tasks:
          'id, projectId, status, assigneeId, reporterId, dueDate, priority, sprintId, startDate, *labels, updatedAt',
        sprints: 'id, projectId, startDate, endDate',
        comments: 'id, taskId, authorId, createdAt',
        activity: 'id, taskId, projectId, actorId, at',
        notifications: 'id, personaId, kind, subjectId, createdAt, readAt, [personaId+readAt]',
        dependencies: 'id, projectId, fromId, toId',
        rituals: 'id, projectId, kind',
        savedViews: 'id, personaId, createdAt',
      },
      // Existing tasks are not milestones.
      upgrade: async (tx) => {
        await (tx as Transaction)
          .table('tasks')
          .toCollection()
          .modify((task: { milestone?: boolean }) => {
            task.milestone ??= false;
          });
      },
    },
  ],
};
