import { describe, expect, it } from 'vitest';
import committedSchema from '../schema/blocks.schema.json' with { type: 'json' };
import { BLOCK_CATALOG_LIST } from '../src/catalog/entries.ts';
import { BLOCKS_SCHEMA_URL, blocksJsonSchema } from '../src/json-schema.ts';
import { BLOCK_TYPES } from '../src/schema/index.ts';

type Schema = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveRef(root: Schema, ref: string): Schema | undefined {
  if (ref === '#') return root;
  if (!ref.startsWith('#/')) return undefined;
  let current: unknown = root;
  for (const segment of ref
    .slice(2)
    .split('/')
    .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))) {
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }
  return isRecord(current) ? current : undefined;
}

function schemaErrors(value: unknown, schema: Schema, root: Schema, path = '$'): string[] {
  if (typeof schema.$ref === 'string') {
    const target = resolveRef(root, schema.$ref);
    return target
      ? schemaErrors(value, target, root, path)
      : [`${path}: unresolved ${schema.$ref}`];
  }

  const errors: string[] = [];
  const choices = schema.oneOf;
  if (Array.isArray(choices)) {
    const results = choices.map((choice) =>
      isRecord(choice) ? schemaErrors(value, choice, root, path) : ['not a schema']
    );
    const matching = results.filter((result) => result.length === 0);
    if (matching.length !== 1)
      errors.push(`${path}: expected exactly one matching oneOf branch (${matching.length})`);
  }
  const alternatives = schema.anyOf;
  if (
    Array.isArray(alternatives) &&
    !alternatives.some(
      (choice) => isRecord(choice) && schemaErrors(value, choice, root, path).length === 0
    )
  ) {
    errors.push(`${path}: expected a matching anyOf branch`);
  }

  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const typeMatches =
    schema.type === undefined ||
    types.some(
      (type) =>
        (type === 'object' && isRecord(value)) ||
        (type === 'array' && Array.isArray(value)) ||
        (type === 'string' && typeof value === 'string') ||
        (type === 'integer' && typeof value === 'number' && Number.isInteger(value)) ||
        (type === 'number' && typeof value === 'number' && Number.isFinite(value)) ||
        (type === 'boolean' && typeof value === 'boolean') ||
        (type === 'null' && value === null)
    );
  if (!typeMatches) return [...errors, `${path}: expected ${String(schema.type)}`];

  if ('const' in schema && value !== schema.const)
    errors.push(`${path}: expected constant ${String(schema.const)}`);
  if (Array.isArray(schema.enum) && !schema.enum.includes(value))
    errors.push(`${path}: value is outside enum`);
  if (typeof value === 'string') {
    const length = Array.from(value).length;
    if (typeof schema.minLength === 'number' && length < schema.minLength)
      errors.push(`${path}: string is too short`);
    if (typeof schema.maxLength === 'number' && length > schema.maxLength)
      errors.push(`${path}: string is too long`);
    if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern).test(value))
      errors.push(`${path}: string does not match pattern`);
  }
  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum)
      errors.push(`${path}: number is below minimum`);
    if (typeof schema.maximum === 'number' && value > schema.maximum)
      errors.push(`${path}: number is above maximum`);
    if (typeof schema.exclusiveMinimum === 'number' && value <= schema.exclusiveMinimum)
      errors.push(`${path}: number is below exclusive minimum`);
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems)
      errors.push(`${path}: array is too short`);
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems)
      errors.push(`${path}: array is too long`);
    if (isRecord(schema.items)) {
      value.forEach((item, index) => {
        errors.push(...schemaErrors(item, schema.items as Schema, root, `${path}[${index}]`));
      });
    }
  }
  if (isRecord(value)) {
    const properties = isRecord(schema.properties) ? schema.properties : {};
    if (Array.isArray(schema.required)) {
      for (const name of schema.required) {
        if (typeof name === 'string' && !(name in value)) errors.push(`${path}: missing ${name}`);
      }
    }
    if (schema.additionalProperties === false) {
      for (const name of Object.keys(value)) {
        if (!(name in properties)) errors.push(`${path}: unknown property ${name}`);
      }
    }
    if (isRecord(schema.propertyNames) && typeof schema.propertyNames.pattern === 'string') {
      const pattern = new RegExp(schema.propertyNames.pattern);
      for (const name of Object.keys(value))
        if (!pattern.test(name)) errors.push(`${path}: invalid property name ${name}`);
    }
    for (const [name, propertySchema] of Object.entries(properties)) {
      if (name in value && isRecord(propertySchema)) {
        errors.push(...schemaErrors(value[name], propertySchema, root, `${path}.${name}`));
      }
    }
  }
  return errors;
}

function expectDescriptions(value: unknown): void {
  if (!isRecord(value)) return;
  if (isRecord(value.properties)) {
    for (const [name, property] of Object.entries(value.properties)) {
      expect(
        isRecord(property) &&
          typeof property.description === 'string' &&
          property.description.length > 0,
        name
      ).toBe(true);
    }
  }
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) child.forEach(expectDescriptions);
    else if (isRecord(child)) expectDescriptions(child);
  }
}

describe('blocks JSON Schema', () => {
  it('matches the committed draft 2020-12 schema', () => {
    expect(committedSchema).toEqual(blocksJsonSchema());
    expect(blocksJsonSchema()).toMatchObject({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: BLOCKS_SCHEMA_URL,
    });
  });

  it('defines every block type and keeps recursive containers as references', () => {
    const schema = blocksJsonSchema() as Schema;
    const definitions = schema.$defs as Record<string, Schema>;
    expect(Object.keys(schema.oneOf as unknown[])).toHaveLength(BLOCK_TYPES.length);
    for (const type of BLOCK_TYPES) expect(definitions[type]).toBeDefined();
    expect((definitions.columns!.properties as Schema).columns).toMatchObject({
      items: { items: { $ref: '#' } },
    });
    expect((definitions.tabs!.properties as Schema).panels).toMatchObject({
      items: { properties: { blocks: { items: { $ref: '#' } } } },
    });
    expect((definitions.reveal!.properties as Schema).blocks).toMatchObject({
      items: { $ref: '#' },
    });
  });

  it('describes every property and structurally accepts all catalog examples', () => {
    const schema = blocksJsonSchema() as Schema;
    expectDescriptions(schema);
    for (const entry of BLOCK_CATALOG_LIST) {
      for (const [kind, example] of [
        ['minimal', entry.exampleMinimal],
        ['rich', entry.exampleRich],
      ] as const) {
        expect(schemaErrors(example, schema, schema), `${entry.type} ${kind} example`).toEqual([]);
      }
    }
  });
});
