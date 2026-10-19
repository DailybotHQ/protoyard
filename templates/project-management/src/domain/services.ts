import {
  createRuntimeId,
  type PrototypeRuntime,
  parseInput,
  ValidationError,
} from '@protoyard/core';
import { z } from 'zod';
import {
  type Activity,
  type ActivityType,
  type Comment,
  PROJECT_COLORS,
  type Project,
  TASK_LABELS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type Task,
  type TaskDatabase,
  type TaskStatus,
} from '../database/schema.ts';
import { CAPABILITIES } from './policy.ts';
import { STATUS_LABELS } from './tasks.ts';

export { ValidationError };

/** Mention tokens are stable persona ids, deduplicated in appearance order. */
function mentionedIds(body: string): string[] {
  const ids: string[] = [];
  for (const match of body.matchAll(/@\{([^{}\s]{1,120})\}/g)) {
    const id = match[1];
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * Domain services: the ONLY way the UI changes data. Each mutation
 *   1. checks the simulated policy (`session.assert`) — holds even if the UI is bypassed,
 *   2. validates input with zod (field errors render inline in forms),
 *   3. runs through the simulated environment (latency / offline / failures),
 *   4. writes related rows in ONE Dexie transaction (e.g. task + activity entry).
 */

export const ProjectInputSchema = z.object({
  name: z.string().trim().min(2, 'Name must have at least 2 characters').max(60),
  key: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9]{1,4}$/, 'Use 2–5 letters or digits, starting with a letter'),
  description: z.string().trim().max(280, 'Keep it under 280 characters').default(''),
  color: z.enum(PROJECT_COLORS).default('violet'),
});
export type ProjectInput = z.input<typeof ProjectInputSchema>;

export const TaskInputSchema = z.object({
  projectId: z.string().min(1, 'Pick a project'),
  title: z.string().trim().min(3, 'Title must have at least 3 characters').max(140),
  description: z.string().trim().max(4000, 'Keep it under 4,000 characters').default(''),
  status: z.enum(TASK_STATUSES).default('todo'),
  priority: z.enum(TASK_PRIORITIES).default('medium'),
  assigneeId: z
    .string()
    .nullish()
    .transform((v) => v || null),
  dueDate: z
    .string()
    .nullish()
    .transform((v) => v || null)
    .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Use a valid date'),
  labels: z.array(z.enum(TASK_LABELS)).max(4, 'Pick up to 4 labels').default([]),
});
export type TaskInput = z.input<typeof TaskInputSchema>;

export const CommentInputSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Write something first')
    .max(2000, 'Keep it under 2,000 characters'),
});

const ScheduleChangesSchema = z
  .array(
    z.object({
      id: z.string().min(1),
      start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
  )
  .max(200);

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} no longer exists. It may have been deleted.`);
    this.name = 'NotFoundError';
  }
}

type PersonaRow = { id: string; name: string };
type MembershipRow = { personaId: string; role: string };

export function createTaskServices(runtime: PrototypeRuntime<TaskDatabase>) {
  const { db, session, environment, clock } = runtime;
  const now = () => clock.now().toISOString();
  const actorId = () => {
    const principal = session.principal();
    if (!principal) throw new Error('No active persona. Load a scenario first.');
    return principal.persona.id;
  };

  const entry = (
    task: Pick<Task, 'id' | 'projectId'>,
    type: ActivityType,
    body: string
  ): Activity => ({
    id: createRuntimeId('activity'),
    taskId: task.id,
    projectId: task.projectId,
    actorId: actorId(),
    type,
    body,
    at: now(),
  });

  /** Assignees must be people in the workspace who can work on tasks (not viewers). */
  async function assertAssignable(assigneeId: string | null): Promise<string | null> {
    if (!assigneeId) return null;
    const memberships = (await db.table('py_memberships').toArray()) as MembershipRow[];
    const membership = memberships.find((m) => m.personaId === assigneeId);
    if (!membership)
      throw new ValidationError({ assigneeId: 'That person is not in this workspace' });
    if (membership.role === 'viewer') {
      throw new ValidationError({ assigneeId: 'Viewers cannot be assigned tasks' });
    }
    return assigneeId;
  }

  async function personName(id: string | null): Promise<string> {
    if (!id) return 'nobody';
    const persona = (await db.table('py_personas').get(id)) as PersonaRow | undefined;
    return persona?.name ?? 'someone';
  }

  async function nextOrder(status: TaskStatus, projectId: string): Promise<number> {
    const inColumn = await db.tasks
      .where('projectId')
      .equals(projectId)
      .filter((t) => t.status === status)
      .toArray();
    return inColumn.reduce((max, t) => Math.max(max, t.order), -1) + 1;
  }

  return {
    projects: {
      async create(input: ProjectInput): Promise<Project> {
        session.assert(CAPABILITIES.projectsManage);
        const data = parseInput(ProjectInputSchema, input);
        return environment.run('projects.create', () =>
          db.transaction('rw', db.projects, db.sprints, async () => {
            if (await db.projects.filter((p) => p.key === data.key).count()) {
              throw new ValidationError({ key: `Another project already uses ${data.key}` });
            }
            const at = now();
            const project: Project = {
              id: createRuntimeId('project'),
              ...data,
              ownerId: actorId(),
              createdAt: at,
              updatedAt: at,
            };
            await db.projects.add(project);
            const startDate = at.slice(0, 10);
            const end = new Date(`${startDate}T12:00:00.000Z`);
            end.setUTCDate(end.getUTCDate() + 14);
            await db.sprints.add({
              id: createRuntimeId('sprint'),
              projectId: project.id,
              name: 'Sprint 1',
              startDate,
              endDate: end.toISOString().slice(0, 10),
              goal: 'Plan and ship the first project milestone.',
            });
            return project;
          })
        );
      },

      async update(id: string, input: ProjectInput): Promise<void> {
        session.assert(CAPABILITIES.projectsManage);
        const data = parseInput(ProjectInputSchema, input);
        await environment.run('projects.update', () =>
          db.transaction('rw', db.projects, async () => {
            if (await db.projects.filter((p) => p.key === data.key && p.id !== id).count()) {
              throw new ValidationError({ key: `Another project already uses ${data.key}` });
            }
            if (!(await db.projects.get(id))) throw new NotFoundError('This project');
            await db.projects.update(id, { ...data, updatedAt: now() });
          })
        );
      },

      /** Deletes the project with its tasks, comments, activity and notices, atomically. */
      async remove(id: string): Promise<void> {
        session.assert(CAPABILITIES.projectsManage);
        await environment.run('projects.delete', () =>
          db.transaction(
            'rw',
            [db.projects, db.tasks, db.sprints, db.comments, db.activity, db.notifications],
            async () => {
              const taskIds = await db.tasks.where('projectId').equals(id).primaryKeys();
              await db.comments.where('taskId').anyOf(taskIds).delete();
              await db.activity.where('projectId').equals(id).delete();
              await db.sprints.where('projectId').equals(id).delete();
              await db.notifications.where('subjectId').anyOf(taskIds).delete();
              await db.tasks.where('projectId').equals(id).delete();
              await db.projects.delete(id);
            }
          )
        );
      },
    },

    tasks: {
      async create(input: TaskInput): Promise<Task> {
        session.assert(CAPABILITIES.tasksCreate);
        const data = parseInput(TaskInputSchema, input);
        const assigneeId = await assertAssignable(data.assigneeId);
        return environment.run('tasks.create', () =>
          db.transaction('rw', db.projects, db.tasks, db.sprints, db.activity, async () => {
            if (!(await db.projects.get(data.projectId))) {
              throw new ValidationError({ projectId: 'That project no longer exists' });
            }
            const siblings = await db.tasks.where('projectId').equals(data.projectId).toArray();
            const sprint = await db.sprints.where('projectId').equals(data.projectId).first();
            const at = now();
            const startDate = at.slice(0, 10);
            const endDate = data.dueDate ?? startDate;
            const task: Task = {
              id: createRuntimeId('task'),
              projectId: data.projectId,
              number: siblings.reduce((max, t) => Math.max(max, t.number), 0) + 1,
              title: data.title,
              description: data.description,
              status: data.status,
              priority: data.priority,
              assigneeId,
              reporterId: actorId(),
              dueDate: data.dueDate,
              startDate,
              endDate,
              estimateHours: 4,
              sprintId: sprint?.id ?? '',
              labels: [...new Set(data.labels)],
              order: await nextOrder(data.status, data.projectId),
              completedAt: data.status === 'done' ? at : null,
              createdAt: at,
              updatedAt: at,
            };
            await db.tasks.add(task);
            await db.activity.add(
              entry(task, 'created', `Created in ${STATUS_LABELS[task.status]}`)
            );
            return task;
          })
        );
      },

      async update(id: string, input: TaskInput): Promise<void> {
        const existing = await db.tasks.get(id);
        if (!existing) throw new NotFoundError('This task');
        session.assert(CAPABILITIES.tasksUpdate, existing);
        const data = parseInput(TaskInputSchema, input);
        const assigneeId = await assertAssignable(data.assigneeId);
        const assigneeName = await personName(assigneeId);
        await environment.run('tasks.update', () =>
          db.transaction('rw', db.projects, db.tasks, db.activity, async () => {
            const current = await db.tasks.get(id);
            if (!current) throw new NotFoundError('This task');
            const moved = data.status !== current.status;
            const changedProject = data.projectId !== current.projectId;
            const targetProject = changedProject
              ? await db.projects.get(data.projectId)
              : undefined;
            if (changedProject && !targetProject) {
              throw new ValidationError({ projectId: 'That project no longer exists' });
            }
            // Numbers are per project (KEY-n): a moved task takes the next number in
            // its new project, so two tasks never share a key.
            let number = current.number;
            if (changedProject) {
              const siblings = await db.tasks.where('projectId').equals(data.projectId).toArray();
              number =
                siblings.reduce((max, t) => (t.id === id ? max : Math.max(max, t.number)), 0) + 1;
              // History moves with the task; otherwise deleting the old project
              // (which deletes its activity) would erase this task's history.
              await db.activity.where('taskId').equals(id).modify({ projectId: data.projectId });
            }
            const at = now();
            await db.tasks.update(id, {
              projectId: data.projectId,
              number,
              title: data.title,
              description: data.description,
              status: data.status,
              priority: data.priority,
              assigneeId,
              dueDate: data.dueDate,
              labels: [...new Set(data.labels)],
              order:
                moved || changedProject
                  ? await nextOrder(data.status, data.projectId)
                  : current.order,
              completedAt: data.status === 'done' ? (current.completedAt ?? at) : null,
              updatedAt: at,
            });
            const target = { id, projectId: data.projectId };
            if (changedProject && targetProject) {
              await db.activity.add(
                entry(
                  target,
                  'edited',
                  `Moved to ${targetProject.name} as ${targetProject.key}-${number}`
                )
              );
            }
            if (moved) {
              await db.activity.add(
                entry(
                  target,
                  'moved',
                  `Moved from ${STATUS_LABELS[current.status]} to ${STATUS_LABELS[data.status]}`
                )
              );
            }
            if (assigneeId !== current.assigneeId) {
              await db.activity.add(entry(target, 'assigned', `Assigned to ${assigneeName}`));
            }
            await db.activity.add(entry(target, 'edited', 'Edited the task'));
          })
        );
      },

      /** Board drag/drop and "Move to…" menu: status + position + activity in one transaction. */
      async move(id: string, status: TaskStatus): Promise<void> {
        const existing = await db.tasks.get(id);
        if (!existing) throw new NotFoundError('This task');
        session.assert(CAPABILITIES.tasksUpdate, existing);
        if (!TASK_STATUSES.includes(status))
          throw new ValidationError({ status: 'Unknown column' });
        if (existing.status === status) return;
        await environment.run('tasks.move', () =>
          db.transaction('rw', db.tasks, db.activity, async () => {
            const current = await db.tasks.get(id);
            if (!current) throw new NotFoundError('This task');
            const at = now();
            await db.tasks.update(id, {
              status,
              order: await nextOrder(status, current.projectId),
              completedAt: status === 'done' ? at : null,
              updatedAt: at,
            });
            await db.activity.add(
              entry(
                current,
                'moved',
                `Moved from ${STATUS_LABELS[current.status]} to ${STATUS_LABELS[status]}`
              )
            );
          })
        );
      },

      /** Board moves and rank updates persist together; no view writes tables. */
      async reorder(move: { itemId: string; columnId: string; index: number }): Promise<void> {
        const existing = await db.tasks.get(move.itemId);
        if (!existing) throw new NotFoundError('This task');
        session.assert(CAPABILITIES.tasksUpdate, existing);
        if (!TASK_STATUSES.includes(move.columnId as TaskStatus))
          throw new ValidationError({ status: 'Unknown column' });
        await environment.run('tasks.reorder', () =>
          db.transaction('rw', db.tasks, db.activity, async () => {
            const current = await db.tasks.get(move.itemId);
            if (!current) throw new NotFoundError('This task');
            const target = await db.tasks
              .where('projectId')
              .equals(current.projectId)
              .filter((task) => task.id !== current.id && task.status === move.columnId)
              .toArray();
            target.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
            const next = { ...current, status: move.columnId as TaskStatus };
            target.splice(Math.max(0, Math.min(move.index, target.length)), 0, next);
            const at = now();
            for (const [order, task] of target.entries()) {
              await db.tasks.update(task.id, {
                status: next.status,
                order,
                ...(task.id === current.id
                  ? {
                      completedAt: next.status === 'done' ? (current.completedAt ?? at) : null,
                      updatedAt: at,
                    }
                  : {}),
              });
            }
            if (current.status !== next.status) {
              await db.activity.add(
                entry(
                  current,
                  'moved',
                  `Moved from ${STATUS_LABELS[current.status]} to ${STATUS_LABELS[next.status]}`
                )
              );
            }
          })
        );
      },

      /** Timeline cascade writes all affected date ranges in one service transaction. */
      async reschedule(
        changes: readonly { id: string; start: string; end: string }[]
      ): Promise<void> {
        const data = parseInput(ScheduleChangesSchema, changes);
        for (const change of data) {
          if (change.end < change.start)
            throw new ValidationError({ end: 'End must follow start' });
          const task = await db.tasks.get(change.id);
          if (!task) throw new NotFoundError('This task');
          session.assert(CAPABILITIES.tasksUpdate, task);
        }
        await environment.run('tasks.reschedule', () =>
          db.transaction('rw', db.tasks, db.activity, async () => {
            const at = now();
            for (const change of data) {
              const task = await db.tasks.get(change.id);
              if (!task) throw new NotFoundError('This task');
              await db.tasks.update(task.id, {
                startDate: change.start,
                endDate: change.end,
                dueDate: change.end,
                updatedAt: at,
              });
              await db.activity.add(
                entry(task, 'edited', `Rescheduled to ${change.start}–${change.end}`)
              );
            }
          })
        );
      },

      async assign(id: string, assigneeId: string | null): Promise<void> {
        const task = await db.tasks.get(id);
        if (!task) throw new NotFoundError('This task');
        session.assert(CAPABILITIES.tasksUpdate, task);
        const nextAssignee = await assertAssignable(assigneeId);
        const name = await personName(nextAssignee);
        await environment.run('tasks.assign', () =>
          db.transaction('rw', db.tasks, db.activity, async () => {
            const current = await db.tasks.get(id);
            if (!current) throw new NotFoundError('This task');
            await db.tasks.update(id, { assigneeId: nextAssignee, updatedAt: now() });
            await db.activity.add(entry(current, 'assigned', `Assigned to ${name}`));
          })
        );
      },

      async remove(id: string): Promise<void> {
        const existing = await db.tasks.get(id);
        if (!existing) return;
        session.assert(CAPABILITIES.tasksDelete, existing);
        await environment.run('tasks.delete', () =>
          db.transaction('rw', [db.tasks, db.comments, db.activity, db.notifications], async () => {
            await db.comments.where('taskId').equals(id).delete();
            await db.activity.where('taskId').equals(id).delete();
            await db.notifications.where('subjectId').equals(id).delete();
            await db.tasks.delete(id);
          })
        );
      },
    },

    comments: {
      async add(taskId: string, body: string): Promise<Comment> {
        session.assert(CAPABILITIES.commentsCreate);
        const data = parseInput(CommentInputSchema, { body });
        const authorName = await personName(actorId());
        return environment.run('comments.create', () =>
          db.transaction('rw', [db.tasks, db.comments, db.activity, db.notifications], async () => {
            const task = await db.tasks.get(taskId);
            if (!task) throw new NotFoundError('This task');
            const comment: Comment = {
              id: createRuntimeId('comment'),
              taskId,
              authorId: actorId(),
              body: data.body,
              createdAt: now(),
            };
            await db.comments.add(comment);
            await db.activity.add(entry(task, 'commented', 'Left a comment'));
            const mentionTargets = mentionedIds(data.body).filter((id) => id !== comment.authorId);
            const title = `${authorName} mentioned you in a comment`;
            for (const personaId of mentionTargets) {
              await db.notifications.add({
                id: createRuntimeId('notification'),
                personaId,
                kind: 'mention',
                title,
                subjectId: task.id,
                createdAt: comment.createdAt,
                readAt: null,
              });
            }
            return comment;
          })
        );
      },

      async remove(id: string): Promise<void> {
        const existing = await db.comments.get(id);
        if (!existing) return;
        session.assert(CAPABILITIES.commentsDelete, existing);
        await environment.run('comments.delete', () => db.comments.delete(id));
      },
    },

    notifications: {
      async list() {
        return (await db.notifications.where('personaId').equals(actorId()).toArray()).sort(
          (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)
        );
      },
      async markRead(id: string): Promise<boolean> {
        const existing = await db.notifications.get(id);
        if (!existing || existing.personaId !== actorId()) return false;
        if (existing.readAt) return true;
        await environment.run('notifications.markRead', () =>
          db.transaction('rw', db.notifications, async () => {
            await db.notifications.update(id, { readAt: now() });
          })
        );
        return true;
      },
      async markAllRead(): Promise<number> {
        const own = await db.notifications.where('personaId').equals(actorId()).toArray();
        const unread = own.filter((row) => row.readAt === null);
        await environment.run('notifications.markAllRead', () =>
          db.transaction('rw', db.notifications, async () => {
            const readAt = now();
            for (const row of unread) await db.notifications.update(row.id, { readAt });
          })
        );
        return unread.length;
      },
    },
  };
}

export type TaskServices = ReturnType<typeof createTaskServices>;
