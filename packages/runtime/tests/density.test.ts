import { dumpTables } from '@protoyard/database';
import { BUILTIN_THEMES } from '@protoyard/themes';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createPrototypeRuntime } from '../src/index.ts';
import { createTasksDefinition } from './fixtures/tasks-prototype.ts';

describe('density override', () => {
  it('defaults to the theme density, reports its source and never writes domain data', async () => {
    const runtime = await createPrototypeRuntime(createTasksDefinition(), {
      indexedDB: new IDBFactory(),
      IDBKeyRange,
      themes: BUILTIN_THEMES,
      sleep: async () => {},
    });
    await runtime.scenarios.ensureSeeded();
    const before = JSON.stringify(await dumpTables(runtime.db as never));

    expect(runtime.theme.appearance().density.source).toBe('default');
    await runtime.theme.setOverride({ density: 0.875 });
    expect(runtime.theme.appearance().density).toEqual({ value: 0.875, source: 'override' });
    await expect(runtime.overrides.set({ density: 3 })).rejects.toThrow();

    await runtime.theme.clearOverride();
    expect(runtime.theme.appearance().density.source).toBe('default');
    expect(JSON.stringify(await dumpTables(runtime.db as never))).toBe(before);
    runtime.close();
  });
});
