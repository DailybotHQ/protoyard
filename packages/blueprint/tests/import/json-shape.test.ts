import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  inferJsonShape,
  JSON_SHAPE_MAX_DEPTH,
  JSON_SHAPE_MAX_FIELDS,
  JSON_SHAPE_MAX_OBJECTS,
  JSON_SHAPE_MAX_SAMPLE_OBJECTS,
  JsonShapeError,
} from '../../src/import/json-shape.ts';
import { parseBlueprint } from '../../src/schema.ts';

function expectShapeError(action: () => unknown, code: JsonShapeError['code']): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(JsonShapeError);
    expect(error).toMatchObject({ code });
    return;
  }
  throw new Error(`Expected JSON shape error ${code}`);
}

describe('JSON shape inference', () => {
  it('publishes the importer only through its lazy authoring subpath', () => {
    const manifest = JSON.parse(
      readFileSync(resolve(process.cwd(), 'packages/blueprint/package.json'), 'utf8')
    ) as { exports: Record<string, string> };
    expect(manifest.exports['./import/json-shape']).toBe('./src/import/json-shape.ts');
  });

  it('infers a validated value-free draft from a representative object', () => {
    const sample = {
      Name: 'Ada Vale private sample',
      active: true,
      attempts: 3,
      emailAddress: 'ada.private@example.com',
      startedAt: '2025-04-03T10:00:00Z',
      profile: { display: 'Private nested sample' },
      labels: ['restricted-alpha', 'restricted-beta'],
      statuses: ['private-status-a', 'private-status-b'],
    };

    const result = inferJsonShape(JSON.stringify(sample), { entityName: 'support-ticket' });
    const entity = result.entities[0];
    expect(entity?.name).toBe('support-ticket');
    expect(entity?.titleField).toBe('name');
    expect(entity?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'name', kind: 'text', required: false }),
        expect.objectContaining({ name: 'active', kind: 'boolean', required: false }),
        expect.objectContaining({ name: 'attempts', kind: 'integer', required: false }),
        expect.objectContaining({ name: 'emailAddress', kind: 'email', required: false }),
        expect.objectContaining({ name: 'startedAt', kind: 'datetime', required: false }),
        expect.objectContaining({ name: 'profile', kind: 'json', required: false }),
        expect.objectContaining({ name: 'labels', kind: 'tags', required: false }),
        expect.objectContaining({ name: 'statuses', kind: 'tags', required: false }),
      ])
    );
    expect(result.notes).toContainEqual(
      expect.stringContaining(
        'support ticket.profile: nested objects stay in a JSON field; review whether to model a relation.'
      )
    );
    expect(
      parseBlueprint({
        formatVersion: 1,
        name: 'Imported support tickets',
        entities: result.entities,
        roles: [{ name: 'owner', permissions: { '*': ['*'] } }],
      }).entities
    ).toEqual(result.entities);
    for (const sourceValue of [
      sample.Name,
      'Private nested sample',
      'restricted-alpha',
      'private-status-a',
    ]) {
      expect(JSON.stringify(result)).not.toContain(sourceValue);
    }
  });

  it('infers relation candidates from object arrays and preserves nested record drafts', () => {
    const result = inferJsonShape(
      JSON.stringify({
        title: 'Sensitive parent',
        items: [
          { title: 'Sensitive child one', quantity: 2 },
          { quantity: 4, title: 'Sensitive child two' },
        ],
      }),
      { entityName: 'order' }
    );
    const order = result.entities.find((entity) => entity.name === 'order');
    const item = result.entities.find((entity) => entity.name === 'item');

    expect(order?.fields).toContainEqual(
      expect.objectContaining({
        name: 'items',
        kind: 'relation',
        to: 'item',
        cardinality: 'many',
        required: false,
      })
    );
    expect(item?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'quantity', kind: 'integer' }),
        expect.objectContaining({ name: 'title', kind: 'text' }),
      ])
    );
    expect(result.relationCandidates).toEqual([
      expect.objectContaining({
        sourceEntity: 'order',
        field: 'items',
        targetEntity: 'item',
        cardinality: 'many',
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain('Sensitive child');
  });

  it('does not choose a long-text field as the title', () => {
    const result = inferJsonShape(JSON.stringify({ description: 'x'.repeat(600) }));
    expect(result.entities[0]?.fields).toContainEqual(
      expect.objectContaining({ name: 'description', kind: 'longText' })
    );
    expect(result.entities[0]?.titleField).toBe('name');
  });

  it('is deterministic across object key insertion order and reports inconsistent samples', () => {
    const first = inferJsonShape(
      '[{"firstName":"Ada","status":"open","score":1},{"firstName":"Grace","score":"unknown","status":null}]'
    );
    const second = inferJsonShape(
      '[{"score":1,"status":"open","firstName":"Ada"},{"status":null,"score":"unknown","firstName":"Grace"}]'
    );

    expect(first).toEqual(second);
    expect(first.entities[0]?.fields.map((field) => field.name)).toEqual([
      'firstName',
      'score',
      'status',
    ]);
    expect(first.entities[0]?.fields).toContainEqual(
      expect.objectContaining({ name: 'score', kind: 'json' })
    );
    expect(first.entities[0]?.fields).toContainEqual(
      expect.objectContaining({ name: 'status', kind: 'text', required: false })
    );
    expect(first.notes.some((note) => note.includes('inconsistent scalar types'))).toBe(true);
    expect(first.notes.some((note) => note.includes('absent or null'))).toBe(true);
    expect(JSON.stringify(first)).not.toContain('unknown');
  });

  it('bounds samples, nesting, object nodes, fields, strings and total bytes', () => {
    const rows = Array.from({ length: JSON_SHAPE_MAX_SAMPLE_OBJECTS + 2 }, (_, index) => ({
      title: `sample-${index}`,
    }));
    const sampled = inferJsonShape(JSON.stringify(rows));
    expect(sampled.objectsInspected).toBe(JSON_SHAPE_MAX_SAMPLE_OBJECTS);
    expect(sampled.notes.some((note) => note.includes('Only the first 100'))).toBe(true);

    const tooDeep = JSON.stringify({ a: { b: { c: true } } });
    expectShapeError(() => inferJsonShape(tooDeep, { maxDepth: 2 }), 'too-deep');
    expectShapeError(
      () => inferJsonShape('[{"a":1},{"b":2}]', { maxObjects: 2 }),
      'too-many-objects'
    );
    expectShapeError(() => inferJsonShape('{"a":1,"b":2}', { maxFields: 1 }), 'too-many-fields');
    expectShapeError(
      () => inferJsonShape('{"a":"too long"}', { maxStringBytes: 3 }),
      'string-too-large'
    );
    expectShapeError(
      () => inferJsonShape('{"sensitive":"private-value"}', { maxBytes: 4 }),
      'input-too-large'
    );
    expect(() => inferJsonShape('{"a":1}', { maxDepth: JSON_SHAPE_MAX_DEPTH + 1 })).not.toThrow();
    expect(() => inferJsonShape('{"a":1}', { maxFields: JSON_SHAPE_MAX_FIELDS + 1 })).not.toThrow();
    expect(() =>
      inferJsonShape('{"a":1}', { maxObjects: JSON_SHAPE_MAX_OBJECTS + 1 })
    ).not.toThrow();
  });

  it('rejects invalid JSON and mixed top-level arrays without echoing input', () => {
    const badJson = '{"secret":"do-not-repeat",';
    try {
      inferJsonShape(badJson);
      throw new Error('Expected invalid JSON to be rejected');
    } catch (error) {
      expect(error).toMatchObject({ code: 'invalid-json' });
      expect((error as Error).message).not.toContain('do-not-repeat');
    }

    const invalidShape = '[{"title":"private"},"private scalar"]';
    try {
      inferJsonShape(invalidShape);
      throw new Error('Expected mixed top-level array to be rejected');
    } catch (error) {
      expect(error).toMatchObject({ code: 'invalid-shape' });
      expect((error as Error).message).not.toContain('private');
    }
  });
});
