import { PermissionDeniedError, SimulatedServiceError } from '@protoyard/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import { expectBootableWorld } from '../../../tests/support/smoke.ts';
import type { TaskDatabase } from '../src/database/schema.ts';
import { createTaskServices } from '../src/domain/services.ts';
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

describe('keel-projects-demo services on the real runtime', () => {
  it('generates deterministic worlds and boots the default scenario', async () => {
    await expectBootableWorld(definition, harness);
  });

  it('moves a task between columns and the move survives a reload', async () => {
    fresh();
    let runtime = await harness.boot('sprint-in-flight');
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

  it('fails cleanly offline without writing anything', async () => {
    fresh();
    const runtime = await harness.boot('sprint-in-flight');
    const services = createTaskServices(runtime);
    const task = (await runtime.db.tasks.toArray())[0];
    if (!task) throw new Error('tasks');
    await runtime.overrides.set({ environment: { network: 'offline' } });
    await expect(
      services.tasks.move(task.id, task.status === 'done' ? 'todo' : 'done')
    ).rejects.toBeInstanceOf(SimulatedServiceError);
    expect((await runtime.db.tasks.get(task.id))?.status).toBe(task.status);
  });
});
