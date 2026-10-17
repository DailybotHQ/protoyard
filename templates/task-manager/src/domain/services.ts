import { createRuntimeId, type PrototypeRuntime } from '@protoyard/core';
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

export class ValidationError extends Error {
  readonly issues: Record<string, string>;
  constructor(issues: Record<string, string>) {
    super(Object.values(issues)[0] ?? 'Invalid input');
    this.issues = issues;
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} no longer exists. It may have been deleted.`);
    this.name = 'NotFoundError';
  }
}

function parse<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const issues: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || 'form';
    issues[key] ??= issue.message;
  }
  throw new ValidationError(issues);
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
        const data = parse(ProjectInputSchema, input);
        return environment.run('projects.create', () =>
          db.transaction('rw', db.projects, async () => {
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
            return project;
          })
        );
      },

      async update(id: string, input: ProjectInput): Promise<void> {
        session.assert(CAPABILITIES.projectsManage);
        const data = parse(ProjectInputSchema, input);
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

      /** Deletes the project with all its tasks, comments and activity, atomically. */
      async remove(id: string): Promise<void> {
        session.assert(CAPABILITIES.projectsManage);
        await environment.run('projects.delete', () =>
          db.transaction('rw', db.projects, db.tasks, db.comments, db.activity, async () => {
            const taskIds = await db.tasks.where('projectId').equals(id).primaryKeys();
            await db.comments.where('taskId').anyOf(taskIds).delete();
            await db.activity.where('projectId').equals(id).delete();
            await db.tasks.where('projectId').equals(id).delete();
            await db.projects.delete(id);
          })
        );
      },
    },

    tasks: {
      async create(input: TaskInput): Promise<Task> {
        session.assert(CAPABILITIES.tasksCreate);
        const data = parse(TaskInputSchema, input);
        const assigneeId = await assertAssignable(data.assigneeId);
        return environment.run('tasks.create', () =>
          db.transaction('rw', db.projects, db.tasks, db.activity, async () => {
            if (!(await db.projects.get(data.projectId))) {
              throw new ValidationError({ projectId: 'That project no longer exists' });
            }
            const siblings = await db.tasks.where('projectId').equals(data.projectId).toArray();
            const at = now();
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
        const data = parse(TaskInputSchema, input);
        const assigneeId = await assertAssignable(data.assigneeId);
        const assigneeName = await personName(assigneeId);
        await environment.run('tasks.update', () =>
          db.transaction('rw', db.projects, db.tasks, db.activity, async () => {
            const current = await db.tasks.get(id);
            if (!current) throw new NotFoundError('This task');
            const moved = data.status !== current.status;
            const changedProject = data.projectId !== current.projectId;
            if (changedProject && !(await db.projects.get(data.projectId))) {
              throw new ValidationError({ projectId: 'That project no longer exists' });
            }
            const at = now();
            await db.tasks.update(id, {
              projectId: data.projectId,
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

      async remove(id: string): Promise<void> {
        const existing = await db.tasks.get(id);
        if (!existing) return;
        session.assert(CAPABILITIES.tasksDelete, existing);
        await environment.run('tasks.delete', () =>
          db.transaction('rw', db.tasks, db.comments, db.activity, async () => {
            await db.comments.where('taskId').equals(id).delete();
            await db.activity.where('taskId').equals(id).delete();
            await db.tasks.delete(id);
          })
        );
      },
    },

    comments: {
      async add(taskId: string, body: string): Promise<Comment> {
        session.assert(CAPABILITIES.commentsCreate);
        const data = parse(CommentInputSchema, { body });
        return environment.run('comments.create', () =>
          db.transaction('rw', db.tasks, db.comments, db.activity, async () => {
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
  };
}

export type TaskServices = ReturnType<typeof createTaskServices>;
