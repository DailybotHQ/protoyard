import { PermissionDeniedError, SimulatedServiceError } from '@protoyard/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import type { TaskDatabase } from '../src/database/schema.ts';
import { createTaskServices, ValidationError } from '../src/domain/services.ts';
import { definition } from '../src/prototype.ts';

/**
 * Domain tests on the REAL runtime with an in-memory IndexedDB: scenario
 * loads, persona switches, service-level permissions, persistence across
 * "reloads" (a second runtime on the same storage) and time advance.
 */

let harness = createHarness<TaskDatabase>(definition);
afterEach(() => harness.closeAll());
const fresh = () => {
  harness = createHarness<TaskDatabase>(definition);
};

describe('task-manager services on the real runtime', () => {
  it('moves a task between columns and the move survives a reload', async () => {
    fresh();
    let runtime = await harness.boot('active-team');
    const services = createTaskServices(runtime);
    const task = (await runtime.db.tasks.toArray()).find((t) => t.status === 'todo');
    if (!task) throw new Error('seed has a todo task');

    await services.tasks.move(task.id, 'review');
    await services.tasks.move(task.id, 'done');
    runtime = await harness.reload(runtime);

    const stored = await runtime.db.tasks.get(task.id);
    expect(stored?.status).toBe('done');
    expect(stored?.completedAt).toBe(runtime.clock.now().toISOString());
    const reviewAndDone = await runtime.db.tasks
      .where('projectId')
      .equals(task.projectId)
      .filter((t) => t.status === 'done')
      .toArray();
    // Moved cards land at the bottom of the target column.
    expect(Math.max(...reviewAndDone.map((t) => t.order))).toBe(stored?.order);
    const moves = await runtime.db.activity
      .where('taskId')
      .equals(task.id)
      .filter((a) => a.type === 'moved' && a.id.includes('_u'))
      .toArray();
    expect(moves.map((m) => m.body).sort()).toEqual([
      'Moved from Review to Done',
      'Moved from To do to Review',
    ]);
  });

  it('creates, edits, comments and deletes with validation — persisted', async () => {
    fresh();
    let runtime = await harness.boot('active-team');
    let services = createTaskServices(runtime);
    const project = (await runtime.db.projects.toArray())[0];
    if (!project) throw new Error('seed has projects');

    await expect(
      services.tasks.create({ projectId: project.id, title: 'x', dueDate: 'soon' })
    ).rejects.toMatchObject({
      issues: { title: expect.any(String), dueDate: 'Use a valid date' },
    });
    await expect(
      services.tasks.create({
        projectId: project.id,
        title: 'Assign a viewer',
        assigneeId: 'user_0006',
      })
    ).rejects.toBeInstanceOf(ValidationError);

    const created = await services.tasks.create({
      projectId: project.id,
      title: 'Write the release notes',
      priority: 'high',
      assigneeId: 'user_0004',
      dueDate: '2026-10-20',
      labels: ['docs', 'docs'],
    });
    expect(created.id).toMatch(/^task_u/);
    expect(created.labels).toEqual(['docs']);
    const siblings = await runtime.db.tasks.where('projectId').equals(project.id).toArray();
    expect(created.number).toBe(Math.max(...siblings.map((t) => t.number)));

    await services.tasks.update(created.id, {
      projectId: project.id,
      title: 'Write and publish the release notes',
      status: 'in-progress',
      priority: 'urgent',
      assigneeId: null,
      dueDate: null,
      labels: ['docs', 'blocked'],
    });
    await services.comments.add(created.id, '  Draft is in the shared folder.  ');
    await expect(services.comments.add(created.id, '   ')).rejects.toBeInstanceOf(ValidationError);

    runtime = await harness.reload(runtime);
    services = createTaskServices(runtime);
    expect(await runtime.db.tasks.get(created.id)).toMatchObject({
      title: 'Write and publish the release notes',
      status: 'in-progress',
      assigneeId: null,
      dueDate: null,
      labels: ['docs', 'blocked'],
    });
    const comments = await runtime.db.comments.where('taskId').equals(created.id).toArray();
    expect(comments.map((c) => c.body)).toEqual(['Draft is in the shared folder.']);

    await services.tasks.remove(created.id);
    runtime = await harness.reload(runtime);
    expect(await runtime.db.tasks.get(created.id)).toBeUndefined();
    expect(await runtime.db.comments.where('taskId').equals(created.id).count()).toBe(0);
    expect(await runtime.db.activity.where('taskId').equals(created.id).count()).toBe(0);
  });

  it('denies forbidden actions at service level and writes nothing', async () => {
    fresh();
    const runtime = await harness.boot('overdue-crunch');
    const services = createTaskServices(runtime);
    expect(runtime.session.principal()?.role).toBe('member');
    const tasks = await runtime.db.tasks.toArray();
    const others = tasks.find((t) => t.reporterId !== 'user_0003');
    const own = tasks.find((t) => t.reporterId === 'user_0003');
    if (!others || !own) throw new Error('seed has tasks from several reporters');

    // Members edit any task but delete only their own, and never manage projects.
    await services.tasks.move(others.id, others.status === 'done' ? 'todo' : 'done');
    await expect(services.tasks.remove(others.id)).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(
      services.projects.create({ name: 'Side quest', key: 'SQ', color: 'rose' })
    ).rejects.toBeInstanceOf(PermissionDeniedError);
    await services.tasks.remove(own.id);
    expect(await runtime.db.tasks.get(own.id)).toBeUndefined();
    expect(await runtime.db.tasks.get(others.id)).toBeDefined();

    // Viewers are read-only, even when the UI is bypassed.
    await runtime.session.switchActor('user_0006');
    const before = await runtime.db.tasks.orderBy('id').toArray();
    const target = before[0];
    if (!target) throw new Error('tasks');
    await expect(services.tasks.move(target.id, 'review')).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
    await expect(
      services.tasks.create({ projectId: target.projectId, title: 'Sneaky task' })
    ).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(services.comments.add(target.id, 'hello')).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
    expect(await runtime.db.tasks.orderBy('id').toArray()).toEqual(before);
  });

  it('owners manage projects; deleting one cascades atomically', async () => {
    fresh();
    const runtime = await harness.boot('active-team');
    const services = createTaskServices(runtime);
    await expect(
      services.projects.create({ name: 'Duplicate key', key: 'WEB' })
    ).rejects.toMatchObject({ issues: { key: 'Another project already uses WEB' } });
    const project = await services.projects.create({ name: 'Research hub', key: 'res' });
    expect(project.key).toBe('RES');

    const victim = (await runtime.db.projects.toArray()).find((p) => p.key === 'WEB');
    if (!victim) throw new Error('WEB project');
    const taskIds = await runtime.db.tasks.where('projectId').equals(victim.id).primaryKeys();
    expect(taskIds.length).toBeGreaterThan(0);
    await services.projects.remove(victim.id);
    expect(await runtime.db.tasks.where('projectId').equals(victim.id).count()).toBe(0);
    expect(await runtime.db.comments.where('taskId').anyOf(taskIds).count()).toBe(0);
    expect(await runtime.db.activity.where('projectId').equals(victim.id).count()).toBe(0);
  });

  it('fails cleanly offline without writing anything', async () => {
    fresh();
    const runtime = await harness.boot('active-team');
    const services = createTaskServices(runtime);
    const task = (await runtime.db.tasks.toArray())[0];
    if (!task) throw new Error('tasks');
    await runtime.overrides.set({ environment: { network: 'offline' } });
    await expect(
      services.tasks.move(task.id, task.status === 'done' ? 'todo' : 'done')
    ).rejects.toBeInstanceOf(SimulatedServiceError);
    expect((await runtime.db.tasks.get(task.id))?.status).toBe(task.status);
  });

  it('advancing time is idempotent: 7×1 day equals 1×7 days', async () => {
    fresh();
    const a = await harness.boot('active-team');
    for (let i = 0; i < 7; i++) await a.scenarios.advance({ days: 1 });
    const stepwise = {
      tasks: await a.db.tasks.orderBy('id').toArray(),
      activity: await a.db.activity.orderBy('id').toArray(),
    };
    expect(stepwise.activity.some((row) => row.id.startsWith('activity_evt:'))).toBe(true);
    harness.closeAll();

    fresh();
    const b = await harness.boot('active-team');
    await b.scenarios.advance({ days: 7 });
    expect(await b.db.tasks.orderBy('id').toArray()).toEqual(stepwise.tasks);
    expect(await b.db.activity.orderBy('id').toArray()).toEqual(stepwise.activity);
  });
});
