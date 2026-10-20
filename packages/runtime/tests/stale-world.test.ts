import type { PrototypeDefinition } from '@protoyard/core';
import { dumpTables } from '@protoyard/database';
import { GENERATOR_SDK_VERSION } from '@protoyard/scenarios';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import { createPrototypeRuntime, isStaleWorld, type ProtoyardRuntime } from '../src/index.ts';
import type { RuntimeOptions } from '../src/options.ts';
import { createTasksDefinition, type Task } from './fixtures/tasks-prototype.ts';

const open: ProtoyardRuntime[] = [];

function backend() {
  return { indexedDB: new IDBFactory() as unknown as globalThis.IDBFactory, IDBKeyRange };
}

/** The fixture with another prototype generator version (the fixture declares 3). */
function withVersion(version: number | undefined): PrototypeDefinition {
  const { generatorVersion: _ignored, ...rest } = createTasksDefinition();
  return version === undefined ? rest : { ...rest, generatorVersion: version };
}

async function start(
  definition: PrototypeDefinition,
  store: ReturnType<typeof backend>,
  extra: RuntimeOptions = {}
) {
  const runtime = await createPrototypeRuntime(definition, {
    sleep: async () => {},
    now: () => Date.parse('2026-10-17T12:00:00.000Z'),
    ...store,
    ...extra,
  });
  open.push(runtime);
  await runtime.scenarios.ensureSeeded();
  return runtime;
}

/** Seeds `viewer` with a non-default seed, then edits it so a reseed is observable. */
async function editedWorld(store: ReturnType<typeof backend>, extra: RuntimeOptions = {}) {
  const runtime = await start(createTasksDefinition(), store, extra);
  await runtime.scenarios.load('viewer', { seed: 7 });
  await runtime.db.rows<Task>('tasks').clear();
  await runtime.db.rows('projects').put({ id: 'project_edit', name: 'Edited by hand' });
  runtime.close();
}

const domainOnly = async (runtime: ProtoyardRuntime) =>
  (await dumpTables(runtime.db)).filter((t) => !t.name.startsWith('py_'));

afterEach(() => {
  for (const runtime of open.splice(0)) runtime.close();
});

describe('isStaleWorld', () => {
  it('compares the SDK and the prototype generator versions', () => {
    const current = { generatorVersion: 3, prototypeGeneratorVersion: 4 };
    expect(isStaleWorld({ generatorVersion: 3, prototypeGeneratorVersion: 4 }, current)).toBe(
      false
    );
    expect(isStaleWorld({ generatorVersion: 2, prototypeGeneratorVersion: 4 }, current)).toBe(true);
    expect(isStaleWorld({ generatorVersion: 3, prototypeGeneratorVersion: 3 }, current)).toBe(true);
    expect(isStaleWorld({ generatorVersion: 3 }, current)).toBe(true);
    expect(isStaleWorld({ generatorVersion: 3 }, { generatorVersion: 3 })).toBe(false);
  });
});

describe('a stored world built by other generator versions', () => {
  it('keeps the data when the versions are unchanged', async () => {
    const store = backend();
    await editedWorld(store);
    const reopened = await start(createTasksDefinition(), store);
    expect(reopened.scenarios.staleWorld()).toBeNull();
    expect(await reopened.db.rows('tasks').count()).toBe(0);
    expect(await reopened.db.rows('projects').get('project_edit')).toBeDefined();
    expect(await reopened.snapshots.list()).toEqual([]);
    expect(reopened.scenarios.active()).toMatchObject({
      seed: 7,
      generatorVersion: GENERATOR_SDK_VERSION,
      prototypeGeneratorVersion: 3,
    });
  });

  it('reseeds the active scenario with its stored seed after a version bump', async () => {
    const store = backend();
    await editedWorld(store);
    const reopened = await start(withVersion(4), store);

    expect(reopened.scenarios.active()).toMatchObject({
      scenario: { id: 'viewer' },
      seed: 7,
      generatorVersion: GENERATOR_SDK_VERSION,
      prototypeGeneratorVersion: 4,
    });
    expect(await reopened.db.rows('projects').get('project_edit')).toBeUndefined();

    // Deterministic: the same world a fresh load of viewer/7 builds with the new code.
    const fresh = await start(withVersion(4), backend());
    await fresh.scenarios.load('viewer', { seed: 7 });
    expect(await domainOnly(reopened)).toEqual(await domainOnly(fresh));

    // A third boot finds matching versions and leaves the rebuilt world alone.
    reopened.close();
    const third = await start(withVersion(4), store);
    expect(third.scenarios.staleWorld()).toBeNull();
  });

  it('surfaces the refresh and keeps the old data in a safety snapshot', async () => {
    const store = backend();
    await editedWorld(store);
    const seen: (string | undefined)[] = [];
    const runtime = await createPrototypeRuntime(withVersion(4), {
      sleep: async () => {},
      now: () => Date.parse('2026-10-17T12:00:00.000Z'),
      ...store,
    });
    open.push(runtime);
    runtime.scenarios.subscribe((info) => seen.push(info?.scenario.id));
    await runtime.scenarios.ensureSeeded();

    const stale = runtime.scenarios.staleWorld();
    expect(stale).toMatchObject({
      scenario: 'viewer',
      seed: 7,
      status: 'reseeded',
      stored: { generatorVersion: GENERATOR_SDK_VERSION, prototypeGeneratorVersion: 3 },
      current: { generatorVersion: GENERATOR_SDK_VERSION, prototypeGeneratorVersion: 4 },
    });
    expect(stale?.reason).toMatch(/prototype v3.*prototype v4.*safety snapshot/);
    expect(seen).toContain('viewer');

    const snapshots = await runtime.snapshots.list();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.id).toBe(stale?.snapshotId);
    expect(snapshots[0]?.name).toMatch(/^Before refreshing /);

    // The edits are recoverable from that snapshot.
    await runtime.snapshots.restore(snapshots[0]?.id ?? '');
    expect(await runtime.db.rows('projects').get('project_edit')).toBeDefined();
  });

  it('treats a newly declared or removed prototype version as a change', async () => {
    const store = backend();
    await editedWorld(store);
    const dropped = await start(withVersion(undefined), store);
    expect(dropped.scenarios.staleWorld()?.current).toEqual({
      generatorVersion: GENERATOR_SDK_VERSION,
    });
    expect(await dropped.db.rows('projects').get('project_edit')).toBeUndefined();
  });

  it('reseeds a sandbox without a safety snapshot', async () => {
    const store = backend();
    const link = { sandbox: 'trial' };
    await editedWorld(store, { link });
    const reopened = await start(withVersion(4), store, { link });
    expect(reopened.scenarios.staleWorld()).toMatchObject({ status: 'reseeded' });
    expect(reopened.scenarios.staleWorld()?.snapshotId).toBeUndefined();
    expect(await reopened.snapshots.list()).toEqual([]);
    expect(await reopened.db.rows('projects').get('project_edit')).toBeUndefined();
  });

  it('still offers a pending link after the reseed', async () => {
    const store = backend();
    await editedWorld(store);
    const reopened = await start(withVersion(4), store, { link: { scenario: 'empty' } });
    expect(reopened.scenarios.staleWorld()?.status).toBe('reseeded');
    expect(reopened.scenarios.active()?.scenario.id).toBe('viewer');
    expect(reopened.scenarios.pendingLink()).toMatchObject({ scenario: 'empty' });
  });
});
