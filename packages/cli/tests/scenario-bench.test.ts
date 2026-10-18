// @vitest-environment node
import { symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_BUDGET_CONFIG } from '../src/lib/budgets.ts';
import { addPrototype, cli, createWorkspace, type TempWorkspace } from './helpers.ts';

const repositoryRoot = process.cwd();

describe('protoyard scenario bench', () => {
  let ws: TempWorkspace | undefined;

  afterEach(() => {
    ws?.cleanup();
    ws = undefined;
  });

  it('reports median timings and deterministic row counts for repeated fixture runs', async () => {
    ws = createBenchWorkspace();

    const run = await cli([
      '--root',
      ws.root,
      '--json',
      'scenario',
      'bench',
      'bench-fixture',
      '--scenario',
      'growing',
      '--runs',
      '3',
    ]);

    expect(run.code).toBe(0);
    const result = run.json<{
      data: {
        runs: number;
        results: Array<{
          id: string;
          runs: number;
          rows: number;
          rowCounts: Record<string, number>;
          generateMs: number;
          validateMs: number;
          durationMs: number;
          withinBudget: boolean;
          ok: boolean;
        }>;
      };
    }>().data.results[0];
    expect(result).toMatchObject({
      id: 'growing',
      runs: 3,
      rows: 7,
      rowCounts: { tasks: 4 },
      withinBudget: true,
      ok: true,
    });
    expect(result?.durationMs).toBeCloseTo(
      (result?.generateMs ?? 0) + (result?.validateMs ?? 0),
      1
    );
  });

  it('fails with validation exit code 4 when --check exceeds the generation budget', async () => {
    ws = createBenchWorkspace();
    ws.write('protoyard.budgets.json', {
      ...DEFAULT_BUDGET_CONFIG,
      overrides: { 'bench-fixture': { generateMs: 0.000001 } },
    });

    const run = await cli([
      '--root',
      ws.root,
      '--json',
      'scenario',
      'bench',
      'bench-fixture',
      '--scenario',
      'steady',
      '--runs',
      '3',
      '--check',
    ]);

    expect(run.code).toBe(4);
    expect(
      run.json<{
        error: { code: string };
        data: { checked: boolean; results: Array<{ ok: boolean; withinBudget: boolean }> };
      }>()
    ).toMatchObject({
      error: { code: 'validation' },
      data: { checked: true, results: [{ ok: false, withinBudget: false }] },
    });
  });
});

function createBenchWorkspace(): TempWorkspace {
  const workspace = createWorkspace();
  symlinkSync(join(repositoryRoot, 'node_modules'), join(workspace.root, 'node_modules'), 'dir');
  symlinkSync(join(repositoryRoot, 'packages'), join(workspace.root, 'packages'), 'dir');
  addPrototype(workspace, 'bench-fixture', {
    scenarios: ['steady', 'growing'],
    defaultScenario: 'steady',
  });
  workspace.write('prototypes/bench-fixture/package.json', {
    name: '@prototype/bench-fixture',
    private: true,
  });
  workspace.write('prototypes/bench-fixture/src/prototype.ts', fixturePrototype);
  return workspace;
}

const fixturePrototype = `
import { definePrototype, parseManifest } from '@protoyard/core';
import manifestJson from '../protoyard.json';

const referenceTime = '2026-10-16T10:00:00.000Z';
const scenarios = [
  {
    id: 'steady',
    name: 'Steady state',
    seed: 1,
    referenceTime,
    organization: { id: 'org_0001', name: 'Fixture Studio', ageDays: 1, size: 1 },
    actor: { id: 'user_0001', role: 'owner', joinedDaysAgo: 1 },
    generators: { taskRows: 1 },
  },
  {
    id: 'growing',
    name: 'Growing workspace',
    seed: 2,
    referenceTime,
    organization: { id: 'org_0001', name: 'Fixture Studio', ageDays: 1, size: 1 },
    actor: { id: 'user_0001', role: 'owner', joinedDaysAgo: 1 },
    generators: { taskRows: 4 },
  },
];

export const definition = definePrototype({
  manifest: parseManifest(manifestJson),
  database: { versions: [{ version: 1, stores: { tasks: 'id' } }] },
  scenarios,
  generate(ctx) {
    const referenceTime = ctx.scenario.referenceTime;
    const organizationId = ctx.scenario.organization.id;
    const personaId = ctx.scenario.actor.id;
    const taskRows = Number(ctx.scenario.generators.taskRows ?? 1);
    return {
      organizations: [{ id: organizationId, name: 'Fixture Studio', createdAt: referenceTime }],
      personas: [{ id: personaId, name: 'Fixture Owner', joinedAt: referenceTime }],
      memberships: [{
        id: 'membership_0001',
        personaId,
        organizationId,
        role: ctx.scenario.actor.role,
        joinedAt: referenceTime,
      }],
      tables: {
        tasks: Array.from({ length: taskRows }, (_, index) => ({ id: 'task_' + (index + 1) })),
      },
    };
  },
});
`;
