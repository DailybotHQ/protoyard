// @vitest-environment node
import { symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { inspectPrototype } from '../src/lib/inspect.ts';
import { addPrototype, createWorkspace, type TempWorkspace } from './helpers.ts';

const repositoryRoot = process.cwd();

describe('inspect prototype actor validation', () => {
  let ws: TempWorkspace | undefined;

  afterEach(() => {
    ws?.cleanup();
    ws = undefined;
  });

  it('accepts a signed-out world with no generated personas', { timeout: 60_000 }, async () => {
    ws = createInspectionWorkspace();
    addActorFixture(ws);

    const inspection = await inspectPrototype(
      ws.root,
      join(ws.root, 'prototypes/actor-fixture'),
      'generate',
      'signed-out'
    );

    expect(inspection.runs).toMatchObject([
      { id: 'signed-out', ok: true, counts: { py_personas: 0 }, violations: [] },
    ]);
  });

  it('rejects a missing actor when generated personas exist', { timeout: 60_000 }, async () => {
    ws = createInspectionWorkspace();
    addActorFixture(ws);

    const inspection = await inspectPrototype(
      ws.root,
      join(ws.root, 'prototypes/actor-fixture'),
      'generate',
      'missing-actor'
    );

    expect(inspection.runs).toMatchObject([
      {
        id: 'missing-actor',
        ok: false,
        violations: [
          {
            table: 'py_personas',
            rowId: 'user_9999',
            message: 'scenario actor "user_9999" is not among the generated personas',
          },
        ],
      },
    ]);
  });
});

function createInspectionWorkspace(): TempWorkspace {
  const workspace = createWorkspace();
  symlinkSync(join(repositoryRoot, 'node_modules'), join(workspace.root, 'node_modules'), 'dir');
  symlinkSync(join(repositoryRoot, 'packages'), join(workspace.root, 'packages'), 'dir');
  return workspace;
}

function addActorFixture(ws: TempWorkspace): void {
  addPrototype(ws, 'actor-fixture', {
    scenarios: ['signed-out', 'missing-actor'],
    defaultScenario: 'signed-out',
  });
  ws.write('prototypes/actor-fixture/package.json', {
    name: '@prototype/actor-fixture',
    private: true,
  });
  ws.write(
    'prototypes/actor-fixture/src/prototype.ts',
    `
import { definePrototype, parseManifest } from '@protoyard/core';
import manifestJson from '../protoyard.json';

const referenceTime = '2026-10-16T10:00:00.000Z';
const scenarios = [
  {
    id: 'signed-out',
    name: 'Signed-out start',
    seed: 1,
    referenceTime,
    organization: { id: 'org_0001', name: 'Fixture Studio', ageDays: 0, size: 1 },
    actor: { id: 'user_0001', role: 'owner', joinedDaysAgo: 0 },
    generators: { empty: true },
  },
  {
    id: 'missing-actor',
    name: 'Missing actor',
    seed: 2,
    referenceTime,
    organization: { id: 'org_0001', name: 'Fixture Studio', ageDays: 1, size: 1 },
    actor: { id: 'user_9999', role: 'owner', joinedDaysAgo: 1 },
  },
];

export const definition = definePrototype({
  manifest: parseManifest(manifestJson),
  database: { versions: [{ version: 1, stores: { tasks: 'id' } }] },
  scenarios,
  generate(ctx) {
    if (ctx.scenario.id === 'signed-out') {
      return { organizations: [], personas: [], memberships: [], tables: { tasks: [] } };
    }
    return {
      organizations: [{ id: 'org_0001', name: 'Fixture Studio', createdAt: referenceTime }],
      personas: [{ id: 'user_0001', name: 'Fixture Owner', joinedAt: referenceTime }],
      memberships: [{
        id: 'membership_0001',
        personaId: 'user_0001',
        organizationId: 'org_0001',
        role: 'owner',
        joinedAt: referenceTime,
      }],
      tables: { tasks: [] },
    };
  },
});
`
  );
}
