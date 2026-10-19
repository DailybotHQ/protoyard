import { defineTheme, ThemePaletteSchema } from '@protoyard/core';
import { isStorageError } from '@protoyard/database';
import { afterEach, describe, expect, it } from 'vitest';
import { createPrototypeRuntime, type ProtoyardRuntime } from '../src/index.ts';
import { createTasksDefinition } from './fixtures/tasks-prototype.ts';

/*
 * Storage that cannot be used, as in a Claude artifact preview, a private
 * window or blocked site data (ADR-026): the runtime keeps working from
 * memory and says so, and never pretends the data is saved.
 */

const palette = Object.fromEntries(
  Object.keys(ThemePaletteSchema.shape).map((key) => [key, '#123456'])
) as never;
const themes = [defineTheme({ id: 'violet', name: 'Violet', light: palette, dark: palette })];

/** An IndexedDB whose every open throws `name`, the way browsers refuse it. */
function refusingIndexedDB(name: string): IDBFactory {
  const refuse = () => {
    throw new DOMException('IndexedDB cannot be used here.', name);
  };
  return {
    open: refuse,
    deleteDatabase: refuse,
    databases: refuse,
    cmp: () => 0,
  } as unknown as IDBFactory;
}

const open: ProtoyardRuntime[] = [];
afterEach(() => {
  for (const runtime of open.splice(0)) runtime.close();
});

async function start(name: string, allowMemoryFallback?: boolean) {
  const runtime = await createPrototypeRuntime(
    createTasksDefinition({ namespace: `blocked-${name.toLowerCase()}` }),
    {
      themes,
      indexedDB: refusingIndexedDB(name),
      sleep: async () => {},
      now: () => Date.parse('2026-10-19T12:00:00.000Z'),
      ...(allowMemoryFallback === undefined ? {} : { allowMemoryFallback }),
    }
  );
  open.push(runtime);
  return runtime;
}

describe('storage unavailable', () => {
  it.each(['SecurityError', 'InvalidStateError', 'NotAllowedError'])(
    'runs from memory and says so when IndexedDB open throws %s',
    async (name) => {
      const runtime = await start(name);
      expect(runtime.storage()).toMatchObject({ backend: 'memory', persistent: false });
      expect(runtime.storage().warning).toMatch(/running from memory: changes are lost/);
    }
  );

  it('still seeds the default scenario and runs services in memory', async () => {
    const runtime = await start('SecurityError');
    await runtime.scenarios.ensureSeeded();
    expect(runtime.scenarios.active()?.scenario.id).toBe(runtime.manifest.defaultScenario);
    const tasks = runtime.db.table('tasks');
    const before = await tasks.count();
    expect(before).toBeGreaterThan(0);
    await runtime.environment.run('tasks.write', () =>
      runtime.db.transaction('rw', tasks, () =>
        tasks.add({ id: 'task_memory', projectId: 'p1', title: 'Kept in memory', status: 'todo' })
      )
    );
    expect(await tasks.count()).toBe(before + 1);
    // Control data (overrides) works too: it lives in the same in-memory backend.
    await runtime.theme.setOverride({ mode: 'dark' });
    expect(runtime.theme.appearance().mode.value).toBe('dark');
  });

  it('refuses instead of falling back when the fallback is turned off', async () => {
    const failure = await start('SecurityError', false).then(
      () => null,
      (error: unknown) => error
    );
    expect(isStorageError(failure) && failure.code).toBe('unavailable');
  });

  it('never hides a real storage failure behind an empty in-memory world', async () => {
    // Chrome's UnknownError can mean a damaged store that still holds real data.
    const failure = await start('UnknownError').then(
      () => null,
      (error: unknown) => error
    );
    expect(failure).not.toBeNull();
    expect(isStorageError(failure) && failure.code).toBe('unknown');
  });
});
