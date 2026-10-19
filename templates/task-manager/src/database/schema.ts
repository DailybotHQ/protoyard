import type { DatabaseDefinition } from '@protoyard/core';
import type { Dexie, EntityTable } from 'dexie';

/**
 * Task manager data model. Seeded ids are deterministic (`task_0007`); ids
 * created in the UI carry a `u` marker (`task_u3f…`).
 *
 * project 1─* task 1─* comment, task 1─* activity. `ownerId`, `assigneeId`,
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
  labels: TaskLabel[];
  /** Position inside its column (ascending). */
  order: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Comment = {
  id: string;
  taskId: string;
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

export type TaskDatabase = Dexie & {
  projects: EntityTable<Project, 'id'>;
  tasks: EntityTable<Task, 'id'>;
  comments: EntityTable<Comment, 'id'>;
  activity: EntityTable<Activity, 'id'>;
  notifications: EntityTable<Notification, 'id'>;
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
  ],
};
