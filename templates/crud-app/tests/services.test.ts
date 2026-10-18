import { PermissionDeniedError } from '@protoyard/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import { createServices } from '../src/generated/services.ts';
import { definition } from '../src/prototype.ts';

describe('crud-app services', () => {
  let harness = createHarness(definition);
  afterEach(() => {
    harness.closeAll();
    harness = createHarness(definition);
  });

  it('creates a project and task that survive reload', async () => {
    let runtime = await harness.boot('empty');
    const services = createServices(runtime);
    const project = await services.project!.create({
      name: 'Launch kit',
      status: 'active',
    });
    const task = await services.task!.create({
      title: 'Write the README',
      status: 'todo',
      projectId: project.id,
      priority: 2,
    });
    expect(task.projectId).toBe(project.id);

    runtime = await harness.reload(runtime);
    const services2 = createServices(runtime);
    expect(await services2.project!.get(project.id)).toMatchObject({ name: 'Launch kit' });
    expect(await services2.task!.get(task.id)).toMatchObject({ title: 'Write the README' });
  });

  it('denies a viewer from creating projects', async () => {
    const runtime = await harness.boot('viewer');
    const services = createServices(runtime);
    await expect(services.project!.create({ name: 'Blocked' })).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
  });

  it('lists seeded active data for the owner', async () => {
    const runtime = await harness.boot('active');
    const services = createServices(runtime);
    const projects = await services.project!.list();
    const tasks = await services.task!.list();
    expect(projects.length).toBeGreaterThan(0);
    expect(tasks.length).toBeGreaterThan(0);
  });
});
