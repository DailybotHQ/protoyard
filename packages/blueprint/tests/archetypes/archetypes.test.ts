// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ARCHETYPE_IDS,
  ARCHETYPE_KIT_ENTRY_POINTS,
  ArchetypeSchema,
  type BlueprintArchetypeInput,
} from '../../src/archetypes/index.ts';
import { type BlueprintInput, parseBlueprint, safeParseBlueprint } from '../../src/schema.ts';

const archetypes: BlueprintArchetypeInput[] = [
  {
    id: 'assistant',
    kits: ['@protoyard/ai', '@protoyard/ai-ui'],
    entities: { conversations: 'conversation', messages: 'message' },
    screens: [{ kind: 'assistant-workspace', path: '/assistant' }],
  },
  {
    id: 'team-chat',
    kits: ['@protoyard/ai', '@protoyard/ai-ui'],
    entities: { rooms: 'room', messages: 'message', members: 'member' },
    screens: [{ kind: 'team-chat', path: '/chat' }],
    scenarioDefaults: { density: 'dense', activity: 'intense' },
  },
  {
    id: 'saas-onboarding',
    kits: ['@protoyard/saas', '@protoyard/saas-ui'],
    entities: { workspaces: 'workspace', members: 'member' },
    screens: [{ kind: 'saas-onboarding', path: '/onboarding' }],
  },
  {
    id: 'analytics',
    kits: [
      '@protoyard/analytics',
      '@protoyard/analytics-ui/grid',
      '@protoyard/analytics-ui/date-range',
    ],
    entities: { events: 'event', metrics: 'metric' },
    screens: [{ kind: 'analytics-dashboard', path: '/analytics' }],
  },
];
const assistant = archetypes[0] as Extract<BlueprintArchetypeInput, { id: 'assistant' }>;
const ROOT = fileURLToPath(new URL('../../../..', import.meta.url));

function blueprintFor(archetype: BlueprintArchetypeInput): BlueprintInput {
  const entities = [...new Set(Object.values(archetype.entities))];
  return {
    formatVersion: 1,
    name: `${archetype.id} example`,
    archetype,
    entities: entities.map((name) => ({
      name,
      plural: `${name}s`,
      fields: [{ name: 'title', kind: 'text' }],
      titleField: 'title',
    })),
    roles: [{ name: 'owner', permissions: { '*': ['*'] } }],
  };
}

describe('kit archetype data', () => {
  it('parses all four archetypes as strict, portable data', () => {
    expect(
      archetypes.map((archetype) => parseBlueprint(blueprintFor(archetype)).archetype?.id)
    ).toEqual(ARCHETYPE_IDS);
  });

  it('declares only supported public kit entry points', () => {
    for (const archetype of archetypes) {
      const parsed = ArchetypeSchema.parse(archetype);
      expect(parsed.kits.length).toBeGreaterThan(0);
      for (const entryPoint of parsed.kits) {
        expect(ARCHETYPE_KIT_ENTRY_POINTS).toContain(entryPoint);
        const [scope, packageName, ...subpath] = entryPoint.split('/');
        expect(scope).toBe('@protoyard');
        const manifest = JSON.parse(
          readFileSync(resolve(ROOT, 'packages', packageName as string, 'package.json'), 'utf8')
        ) as { exports: Record<string, unknown> };
        const exportName = subpath.length > 0 ? `./${subpath.join('/')}` : '.';
        expect(Object.keys(manifest.exports)).toContain(exportName);
      }
    }
    expect(
      ArchetypeSchema.safeParse({
        ...archetypes[0],
        kits: ['@protoyard/ai', '@protoyard/unknown'],
      }).success
    ).toBe(false);
  });

  it('rejects unknown keys and invalid entity, screen or scenario defaults', () => {
    expect(ArchetypeSchema.safeParse({ ...assistant, callback: 'run()' }).success).toBe(false);
    expect(
      ArchetypeSchema.safeParse({
        ...assistant,
        entities: { ...assistant.entities, messages: 'bad name' },
      }).success
    ).toBe(false);
    expect(
      ArchetypeSchema.safeParse({
        ...assistant,
        screens: [{ kind: 'assistant-workspace', path: 'javascript:alert(1)' }],
      }).success
    ).toBe(false);
    expect(
      ArchetypeSchema.safeParse({
        ...assistant,
        scenarioDefaults: { density: 'unbounded', activity: 'normal' },
      }).success
    ).toBe(false);
  });

  it('checks archetype entity references and routes against the blueprint', () => {
    const withUnknownEntity = blueprintFor(assistant);
    withUnknownEntity.archetype = {
      ...assistant,
      entities: { ...assistant.entities, messages: 'missing' },
    };
    const unknownEntityResult = safeParseBlueprint(withUnknownEntity);
    expect(unknownEntityResult.success).toBe(false);
    if (!unknownEntityResult.success) {
      expect(unknownEntityResult.error.issues).toContainEqual(
        expect.objectContaining({
          path: ['archetype', 'entities', 'messages'],
          message: expect.stringContaining('references unknown entity "missing"'),
        })
      );
    }

    const withRouteCollision = blueprintFor(assistant);
    withRouteCollision.screens = [{ type: 'dashboard', path: '/assistant', widgets: [] }];
    const routeCollisionResult = safeParseBlueprint(withRouteCollision);
    expect(routeCollisionResult.success).toBe(false);
    if (!routeCollisionResult.success) {
      expect(routeCollisionResult.error.issues).toContainEqual(
        expect.objectContaining({
          path: ['archetype', 'screens', 0, 'path'],
          message: expect.stringContaining('path "/assistant" is already used by screens.0'),
        })
      );
    }
  });
});
