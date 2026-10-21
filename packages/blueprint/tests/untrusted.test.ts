import { describe, expect, it } from 'vitest';
import { loadUntrustedBlueprint, type UntrustedBlueprintLimits } from '../src/index.ts';

type TestBlueprint = {
  [key: string]: unknown;
  name: string;
  entities: Array<{
    [key: string]: unknown;
    name: string;
    plural: string;
    fields: Array<Record<string, unknown>>;
    seedCount?: number;
  }>;
  roles: unknown[];
  screens: unknown[];
};

function blueprint(): TestBlueprint {
  return {
    formatVersion: 1,
    name: 'Example workspace',
    entities: [
      {
        name: 'project',
        plural: 'projects',
        fields: [{ name: 'title', kind: 'text' }],
        titleField: 'title',
        seedCount: 4,
      },
    ],
    roles: [{ name: 'owner', permissions: { '*': ['*'] } }],
    screens: [],
  };
}

function failed(input: unknown, limits?: Partial<UntrustedBlueprintLimits>) {
  const result = loadUntrustedBlueprint(input, limits);
  expect(result.success).toBe(false);
  if (result.success) throw new Error('expected a failed blueprint load');
  expect(result.issues[0]).toMatchObject({ path: expect.any(Array), fix: expect.any(String) });
  return result.issues[0]!;
}

describe('loadUntrustedBlueprint', () => {
  it('loads valid JSON text and plain objects', () => {
    expect(loadUntrustedBlueprint(JSON.stringify(blueprint()))).toMatchObject({
      success: true,
      blueprint: { name: 'Example workspace' },
    });
    expect(loadUntrustedBlueprint(blueprint()).success).toBe(true);
  });

  it('caps UTF-8 bytes before parsing and rejects deeply nested JSON', () => {
    expect(failed(JSON.stringify(blueprint()), { maxBytes: 10 }).code).toBe('too-large');
    expect(failed(`{"x":${'['.repeat(8)}0${']'.repeat(8)}}`, { maxDepth: 6 }).code).toBe(
      'too-deep'
    );
  });

  it('reports malformed JSON and schema errors as typed issues instead of throwing', () => {
    expect(failed('{').code).toBe('invalid-json');
    expect(failed({ ...blueprint(), name: '' }).code).toBe('invalid-blueprint');
    expect(failed(undefined).code).toBe('invalid-input');
  });

  it('enforces top-level and per-entity item limits', () => {
    const bp = blueprint();
    bp.entities.push({ ...bp.entities[0]!, name: 'task', plural: 'tasks' });
    expect(failed(bp, { maxEntities: 1 })).toMatchObject({ code: 'too-many', path: ['entities'] });

    const fieldsBlueprint = blueprint();
    fieldsBlueprint.entities[0]!.fields.push({ name: 'summary', kind: 'text' });
    expect(failed(fieldsBlueprint, { maxFieldsPerEntity: 1 })).toMatchObject({
      code: 'too-many',
      path: ['entities', 0, 'fields'],
    });

    expect(failed({ ...blueprint(), roles: [{}, {}] }, { maxRoles: 1 }).path).toEqual(['roles']);
    expect(failed({ ...blueprint(), screens: [{}, {}] }, { maxScreens: 1 }).path).toEqual([
      'screens',
    ]);
    expect(
      failed({ ...blueprint(), notifications: [{}, {}] }, { maxNotifications: 1 }).path
    ).toEqual(['notifications']);
    expect(failed({ ...blueprint(), history: [{}, {}] }, { maxHistory: 1 }).path).toEqual([
      'history',
    ]);
  });

  it('never lets caller limits exceed the secure defaults', () => {
    const manyEntities = blueprint();
    manyEntities.entities.push(
      ...Array.from({ length: 64 }, (_, index) => ({
        ...manyEntities.entities[0]!,
        name: `project-${index + 2}`,
        plural: `projects-${index + 2}`,
      }))
    );
    for (const maxEntities of [Number.MAX_SAFE_INTEGER, Number.POSITIVE_INFINITY, undefined]) {
      expect(failed(manyEntities, { maxEntities }).code).toBe('too-many');
    }
  });

  it('rejects prototype-related keys and strips control and bidi characters', () => {
    const pollution = '{"__proto__":{"polluted":true}}';
    expect(failed(pollution).code).toBe('unsafe-key');
    expect(failed('{"constr\\u202euctor":{}}').code).toBe('unsafe-key');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();

    const source = blueprint();
    source.name = 'Example\u202eworkspace\u0000';
    const loaded = loadUntrustedBlueprint(source);
    expect(loaded.success && loaded.blueprint.name).toBe('Exampleworkspace');
    expect(source.name).toBe('Example\u202eworkspace\u0000');
  });

  it('caps the massive scenario estimate from seedCount × 25', () => {
    const bp = blueprint();
    bp.entities[0]!.seedCount = 3;
    expect(failed(bp, { maxWorldRows: 74 })).toMatchObject({
      code: 'too-many',
      path: ['entities'],
    });
    expect(loadUntrustedBlueprint(bp, { maxWorldRows: 75 }).success).toBe(true);
  });

  it('rejects non-JSON objects and catches cycles without leaking exceptions', () => {
    expect(failed(new Date()).code).toBe('invalid-input');
    const cyclic: Record<string, unknown> = blueprint();
    cyclic.self = cyclic;
    expect(failed(cyclic).code).toBe('invalid-input');
  });
});
