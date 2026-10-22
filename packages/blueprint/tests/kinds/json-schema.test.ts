import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import committedSchema from '../../schema/blueprint.schema.json' with { type: 'json' };
import { blueprintJsonSchema } from '../../src/index.ts';

type Schema = Record<string, unknown>;
const ROOT = process.cwd();

function isRecord(value: unknown): value is Schema {
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

/** A test-only validator for the JSON Schema keywords emitted by Zod here. */
function schemaErrors(value: unknown, schema: Schema, root: Schema, path = '$'): string[] {
  const errors: string[] = [];
  if (typeof schema.$ref === 'string') {
    const target = resolveRef(root, schema.$ref);
    if (!target) return [`${path}: unresolved ${schema.$ref}`];
    errors.push(...schemaErrors(value, target, root, path));
  }

  const checkAlternatives = (key: 'oneOf' | 'anyOf', exactlyOne: boolean) => {
    const choices = schema[key];
    if (!Array.isArray(choices)) return;
    const results = choices.map((choice) =>
      isRecord(choice) ? schemaErrors(value, choice, root, path) : ['not a schema']
    );
    const matching = results.filter((result) => result.length === 0).length;
    if (exactlyOne ? matching !== 1 : matching === 0) {
      errors.push(`${path}: expected ${exactlyOne ? 'exactly one' : 'at least one'} ${key} branch`);
    }
  };
  checkAlternatives('oneOf', true);
  checkAlternatives('anyOf', false);
  if (Array.isArray(schema.allOf)) {
    for (const child of schema.allOf) {
      if (isRecord(child)) errors.push(...schemaErrors(value, child, root, path));
    }
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
  if (!typeMatches) return [...errors, `${path}: unexpected JSON type`];
  if ('const' in schema && value !== schema.const) errors.push(`${path}: wrong constant`);
  if (Array.isArray(schema.enum) && !schema.enum.includes(value))
    errors.push(`${path}: wrong enum`);

  if (typeof value === 'string') {
    const length = Array.from(value).length;
    if (typeof schema.minLength === 'number' && length < schema.minLength)
      errors.push(`${path}: string too short`);
    if (typeof schema.maxLength === 'number' && length > schema.maxLength)
      errors.push(`${path}: string too long`);
    if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern).test(value))
      errors.push(`${path}: string does not match pattern`);
  }
  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum)
      errors.push(`${path}: below minimum`);
    if (typeof schema.maximum === 'number' && value > schema.maximum)
      errors.push(`${path}: above maximum`);
    if (typeof schema.exclusiveMinimum === 'number' && value <= schema.exclusiveMinimum)
      errors.push(`${path}: below exclusive minimum`);
    if (typeof schema.multipleOf === 'number' && value % schema.multipleOf !== 0)
      errors.push(`${path}: not a multiple`);
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems)
      errors.push(`${path}: array too short`);
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems)
      errors.push(`${path}: array too long`);
    const prefixItems = Array.isArray(schema.prefixItems) ? schema.prefixItems : [];
    prefixItems.forEach((child, index) => {
      if (index < value.length && isRecord(child)) {
        errors.push(...schemaErrors(value[index], child, root, `${path}[${index}]`));
      }
    });
    if (schema.items === false && value.length > prefixItems.length) {
      errors.push(`${path}: unexpected additional array item`);
    } else if (isRecord(schema.items)) {
      value.slice(prefixItems.length).forEach((item, index) => {
        errors.push(
          ...schemaErrors(
            item,
            schema.items as Schema,
            root,
            `${path}[${index + prefixItems.length}]`
          )
        );
      });
    }
  }
  if (isRecord(value)) {
    const properties = isRecord(schema.properties) ? schema.properties : {};
    const patterns = isRecord(schema.patternProperties) ? schema.patternProperties : {};
    if (Array.isArray(schema.required)) {
      for (const name of schema.required) {
        if (typeof name === 'string' && !(name in value)) errors.push(`${path}: missing ${name}`);
      }
    }
    for (const [name, item] of Object.entries(value)) {
      const matchedPatterns = Object.entries(patterns).filter(([pattern]) =>
        new RegExp(pattern).test(name)
      );
      if (name in properties) {
        const child = properties[name];
        if (isRecord(child)) errors.push(...schemaErrors(item, child, root, `${path}.${name}`));
      } else if (matchedPatterns.length > 0) {
        for (const [, child] of matchedPatterns) {
          if (isRecord(child)) errors.push(...schemaErrors(item, child, root, `${path}.${name}`));
        }
      } else if (schema.additionalProperties === false) {
        errors.push(`${path}: unknown property ${name}`);
      } else if (isRecord(schema.additionalProperties)) {
        errors.push(...schemaErrors(item, schema.additionalProperties, root, `${path}.${name}`));
      }
    }
  }
  return errors;
}

function jsonFiles(directory: string): string[] {
  return readdirSync(join(ROOT, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? jsonFiles(path) : entry.name.endsWith('.json') ? [path] : [];
  });
}

const fixtures = [
  ...jsonFiles('blueprints'),
  ...jsonFiles('packages/blueprint/tests/fixtures/kinds'),
];

describe('kind union JSON Schema', () => {
  it('is current and publishes a strict oneOf for every blueprint kind', async () => {
    const generated = await blueprintJsonSchema();
    expect(committedSchema).toEqual(generated);
    expect(generated).toMatchObject({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: 'https://github.com/DailybotHQ/protoyard/schema/blueprint/v1',
    });
    const branches = generated.oneOf as Schema[];
    expect(branches).toHaveLength(4);
    expect(branches.map((branch) => (branch.properties as Schema).kind)).toEqual([
      { type: 'string', const: 'app' },
      { type: 'string', const: 'deck' },
      { type: 'string', const: 'page' },
      { type: 'string', const: 'doc' },
    ]);
    expect(branches[0]?.required).toContain('entities');
    expect(branches[0]?.required).toContain('roles');
    expect(branches[0]?.additionalProperties).toBe(false);
  });

  it.each(fixtures)('validates %s against the committed schema', (path) => {
    const value: unknown = JSON.parse(readFileSync(join(ROOT, path), 'utf8'));
    expect(
      schemaErrors(value, committedSchema, committedSchema),
      relative(ROOT, join(ROOT, path))
    ).toEqual([]);
  });
});
