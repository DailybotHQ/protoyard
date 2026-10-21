// @vitest-environment node
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseScenario } from '@protoyard/core';
import { createGenerateContext, validateWorld } from '@protoyard/scenarios';
import { describe, expect, it } from 'vitest';
import { createBlueprintGenerator } from '../../src/generator.ts';
import { deriveIntegrity, parseBlueprint } from '../../src/index.ts';

const ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const EXAMPLES = resolve(ROOT, 'blueprints/quick');

function load(name: 'assistant' | 'team-chat') {
  const path = resolve(EXAMPLES, `${name}.json`);
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  return { raw, bytes: statSync(path).size, blueprint: parseBlueprint(raw) };
}

function worldFor(name: 'assistant' | 'team-chat') {
  const { blueprint, raw } = load(name);
  const scenario = parseScenario({
    id: `quick-${name}`,
    name: `Quick ${name}`,
    seed: 74_204,
    referenceTime: '2026-06-15T12:00:00.000Z',
    density: blueprint.archetype?.scenarioDefaults.density ?? 'normal',
    activity: { level: blueprint.archetype?.scenarioDefaults.activity ?? 'normal' },
    organization: {
      id: 'org_quick_examples',
      name: 'Protoyard Example Studio',
      size: 6,
      ageDays: 45,
      subscription: 'pro',
    },
  });
  const generator = createBlueprintGenerator(blueprint);
  return {
    blueprint,
    raw,
    scenario,
    world: generator.generate(createGenerateContext(scenario)),
  };
}

describe('quick assistant and team-chat blueprints', () => {
  it('keeps both examples compact and declares only the lazy kit contracts they need', () => {
    const assistant = load('assistant');
    const teamChat = load('team-chat');

    expect(assistant.bytes).toBeLessThan(5_000);
    expect(teamChat.bytes).toBeLessThan(5_000);
    expect(assistant.blueprint.archetype).toMatchObject({
      id: 'assistant',
      kits: ['@protoyard/ai', '@protoyard/ai-ui'],
      entities: { conversations: 'conversation', messages: 'message' },
      screens: [{ kind: 'assistant-workspace', path: '/assistant' }],
    });
    expect(teamChat.blueprint.archetype).toMatchObject({
      id: 'team-chat',
      kits: ['@protoyard/ai', '@protoyard/ai-ui'],
      entities: { rooms: 'room', messages: 'message', members: 'member' },
      screens: [{ kind: 'team-chat', path: '/chat' }],
    });
    expect(assistant.blueprint.entities.map((entity) => entity.name)).toEqual([
      'conversation',
      'message',
    ]);
    expect(teamChat.blueprint.entities.map((entity) => entity.name)).toEqual([
      'room',
      'member',
      'message',
    ]);
    expect(assistant.blueprint.screens.map((screen) => screen.path)).toEqual([
      '/conversations',
      '/conversations/:id',
    ]);
    expect(teamChat.blueprint.screens.map((screen) => screen.path)).toEqual([
      '/rooms',
      '/rooms/:id',
    ]);
  });

  it('generates deterministic, related fictional starter worlds for both archetypes', () => {
    for (const name of ['assistant', 'team-chat'] as const) {
      const first = worldFor(name);
      const second = worldFor(name);
      expect(first.world, name).toEqual(second.world);
      expect(
        validateWorld(first.world, {
          ...deriveIntegrity(first.blueprint),
          referenceTime: first.scenario.referenceTime,
        }),
        name
      ).toEqual([]);

      const expectedTables = first.blueprint.entities.map((entity) =>
        entity.plural.replace(/-([a-z0-9])/g, (_match, letter: string) => letter.toUpperCase())
      );
      for (const table of expectedTables) {
        expect(first.world.tables[table]?.length, `${name}.${table}`).toBeGreaterThan(0);
      }
      expect(JSON.stringify(first.world)).not.toMatch(/@(gmail|yahoo|outlook)\./i);
      expect(JSON.stringify(first.raw)).not.toMatch(/\b(records|seedData|messagesData)\s*:/i);
    }
  });

  it('keeps the assistant demo described as a local deterministic simulation', () => {
    const assistant = load('assistant');
    expect(assistant.blueprint.description).toMatch(/fictional/i);
    expect(assistant.blueprint.description).toMatch(/simulated/i);
    expect(assistant.blueprint.description).not.toMatch(/real model|provider/i);
  });
});
