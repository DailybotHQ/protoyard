import type { PrototypeDefinition, Scenario } from '@protoyard/core';
import { dumpTables } from '@protoyard/database';
import { createGenerateContextAsync } from '@protoyard/scenarios';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import { createPrototypeRuntime, type ProtoyardRuntime } from '../src/index.ts';
import { createTasksDefinition } from './fixtures/tasks-prototype.ts';

const open: ProtoyardRuntime[] = [];

afterEach(() => {
  for (const runtime of open.splice(0)) runtime.close();
});

async function start(definition: PrototypeDefinition) {
  const runtime = await createPrototypeRuntime(definition, {
    indexedDB: new IDBFactory() as unknown as globalThis.IDBFactory,
    IDBKeyRange,
    sleep: async () => {},
    now: () => Date.parse('2026-10-17T12:00:00.000Z'),
  });
  open.push(runtime);
  return runtime;
}

/**
 * The fixture with a context-free `generateWorld` that runs the same
 * deterministic generator, and a `generate` that records every call.
 */
function withGenerateWorld() {
  const base = createTasksDefinition();
  const worldCalls: Scenario[] = [];
  let generateCalls = 0;
  const definition: PrototypeDefinition = {
    ...base,
    generate(ctx) {
      generateCalls++;
      return base.generate(ctx);
    },
    async generateWorld(scenario) {
      worldCalls.push(scenario);
      return base.generate(await createGenerateContextAsync(scenario));
    },
  };
  return { definition, worldCalls, generateCalls: () => generateCalls };
}

const tablesOf = async (runtime: ProtoyardRuntime) => JSON.stringify(await dumpTables(runtime.db));

describe('definition.generateWorld', () => {
  it('is called with the effective scenario on load, and generate is not', async () => {
    const probe = withGenerateWorld();
    const runtime = await start(probe.definition);
    await runtime.scenarios.ensureSeeded();
    await runtime.scenarios.load('viewer', { seed: 1234 });
    await runtime.scenarios.reset();

    expect(probe.generateCalls()).toBe(0);
    expect(probe.worldCalls.map((s) => [s.id, s.seed])).toEqual([
      ['active-month', 42],
      ['viewer', 1234],
      ['viewer', 1234],
    ]);
    // The resolved scenario (preset, knobs, environment) reaches the hook, with the seed applied.
    const resolved = runtime.scenarios.list().find((s) => s.id === 'viewer');
    expect(probe.worldCalls[1]).toEqual({ ...resolved, seed: 1234 });
  });

  it('produces the same world as generate for the same scenario and seed', async () => {
    const probe = withGenerateWorld();
    const viaWorld = await start(probe.definition);
    const viaGenerate = await start(createTasksDefinition());
    for (const [id, seed] of [
      ['active-month', 42],
      ['viewer', 1234],
      ['new-member', 99],
    ] as const) {
      await viaWorld.scenarios.load(id, { seed });
      await viaGenerate.scenarios.load(id, { seed });
      expect(await tablesOf(viaWorld), `${id}/${seed}`).toBe(await tablesOf(viaGenerate));
    }
    expect(probe.generateCalls()).toBe(0);
  });

  it('leaves advance() on the context path, which needs no generate call', async () => {
    const probe = withGenerateWorld();
    const runtime = await start(probe.definition);
    await runtime.scenarios.load('active-month');
    const result = await runtime.scenarios.advance({ days: 3 });
    expect(result.applied).toBeGreaterThan(0);
    expect(probe.worldCalls).toHaveLength(1);
    expect(probe.generateCalls()).toBe(0);
  });

  it('keeps calling generate when a definition has no generateWorld', async () => {
    const base = createTasksDefinition();
    let generateCalls = 0;
    const runtime = await start({
      ...base,
      generate(ctx) {
        generateCalls++;
        expect(ctx.scenario.seed).toBe(5);
        return base.generate(ctx);
      },
    });
    await runtime.scenarios.load('viewer', { seed: 5 });
    expect(generateCalls).toBe(1);
  });
});
