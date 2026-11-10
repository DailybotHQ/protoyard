// @vitest-environment node
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { locateDesignSystem, readApproval, readComponents } from '../src/lib/design-systems.ts';
import { readRequest } from '../src/lib/ds-components.ts';
import {
  contractJsonSchema,
  DESIGN_SYSTEM_CONTRACTS,
  type DesignSystemContract,
} from '../src/lib/ds-contracts.ts';
import { CliError } from '../src/lib/output.ts';
import { createWorkspace, type TempWorkspace } from './helpers.ts';

/**
 * PLAN_013 T-contracts: the JSON Schema files of every design-system file
 * are generated from the zod schemas the CLI reads with (one source of
 * truth). The files must not drift, and a document the JSON Schema rejects
 * must be rejected by the CLI's reader too.
 */

const SCHEMA_DIR = new URL('../src/lib/ds-schemas/', import.meta.url);
const HASH = 'a'.repeat(64);
const AT = '2026-11-09T12:00:00.000Z';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Schema = Record<string, unknown>;

const KNOWN = new Set([
  '$schema',
  '$id',
  'title',
  'description',
  'type',
  'properties',
  'required',
  'additionalProperties',
  'propertyNames',
  'items',
  'const',
  'enum',
  'pattern',
  'format',
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'minItems',
  'maxItems',
]);

/**
 * A small draft 2020-12 validator for the keywords these schemas use. It
 * throws on any other keyword, so a schema change that it cannot judge fails
 * the test instead of passing silently. `format` is an annotation in 2020-12
 * (the generated date-time schemas also carry a `pattern`).
 */
function validate(schema: Schema, value: unknown): boolean {
  for (const key of Object.keys(schema)) {
    if (!KNOWN.has(key)) throw new Error(`Unsupported JSON Schema keyword: ${key}`);
  }
  const type = schema.type as string | undefined;
  if (type === 'string' && typeof value !== 'string') return false;
  if (type === 'number' && typeof value !== 'number') return false;
  if (type === 'integer' && !Number.isInteger(value)) return false;
  if (type === 'boolean' && typeof value !== 'boolean') return false;
  if (type === 'array' && !Array.isArray(value)) return false;
  if (type === 'object' && (value === null || typeof value !== 'object' || Array.isArray(value)))
    return false;
  if ('const' in schema && value !== schema.const) return false;
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) return false;
  if (typeof value === 'string') {
    if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern, 'u').test(value))
      return false;
    const length = [...value].length;
    if (typeof schema.minLength === 'number' && length < schema.minLength) return false;
    if (typeof schema.maxLength === 'number' && length > schema.maxLength) return false;
  }
  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) return false;
    if (typeof schema.maximum === 'number' && value > schema.maximum) return false;
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) return false;
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) return false;
    if (schema.items && !value.every((item) => validate(schema.items as Schema, item)))
      return false;
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const properties = (schema.properties ?? {}) as Record<string, Schema>;
    for (const key of (schema.required ?? []) as string[]) {
      if (!(key in record)) return false;
    }
    for (const [key, item] of Object.entries(record)) {
      if (schema.propertyNames && !validate(schema.propertyNames as Schema, key)) return false;
      if (key in properties) {
        if (!validate(properties[key] as Schema, item)) return false;
      } else if (schema.additionalProperties === false) {
        return false;
      } else if (
        schema.additionalProperties &&
        typeof schema.additionalProperties === 'object' &&
        !validate(schema.additionalProperties as Schema, item)
      ) {
        return false;
      }
    }
  }
  return true;
}

const contract = (name: string) =>
  DESIGN_SYSTEM_CONTRACTS.find((c) => c.name === name) as DesignSystemContract;

/** One valid document per contract. */
const VALID: Record<string, Json> = {
  approval: {
    status: 'approved',
    version: '1.2.0',
    approvedBy: 'Ada Example',
    approvedAt: AT,
    contentHash: HASH,
  },
  components: {
    format: 'protoyard/ds-components',
    version: 1,
    components: [
      {
        name: 'StatusPill',
        purpose: 'Shows a ticket status with its label',
        version: '0.1.0',
        status: 'draft',
        file: 'components/StatusPill.svelte',
        sha256: HASH,
      },
    ],
  },
  'component-request': {
    format: 'protoyard/ds-component-request',
    version: 1,
    name: 'StatusPill',
    purpose: 'Shows a ticket status with its label',
    why: 'Badge has no label layout',
    requestedBy: 'Ada Example',
    requestedAt: AT,
    status: 'open',
  },
  story: {
    format: 'protoyard/ds-story',
    version: 1,
    component: 'StatusPill',
    variants: [{ name: 'Default', props: { label: 'Open' } }],
  },
  release: {
    format: 'protoyard/ds-release',
    version: 1,
    designSystem: 'harbor',
    release: '1.2.0',
    contentHash: HASH,
    approvedBy: 'Ada Example',
    approvedAt: AT,
    components: [{ name: 'StatusPill', version: '0.1.0', sha256: HASH }],
  },
  bundle: {
    format: 'protoyard/ds-bundle',
    version: 1,
    designSystem: 'harbor',
    release: '1.2.0',
    contentHash: HASH,
    texuli: { format: 'texuli/design-system-bundle', version: 1 },
    files: [
      { path: 'document.json', sha256: HASH, bytes: 120, from: 'document' },
      { path: 'components.json', sha256: HASH, bytes: 64, text: '{}' },
    ],
  },
};

/** Documents both the JSON Schema and the reader must refuse. */
const INVALID: Record<string, [string, Json][]> = {
  approval: [
    ['an unknown status', { status: 'pending', version: '1.0.0' }],
    ['a version range', { status: 'draft', version: '^1.0.0' }],
    ['a short hash', { status: 'approved', version: '1.0.0', contentHash: 'abc' }],
    ['a date that is not ISO', { status: 'approved', version: '1.0.0', approvedAt: 'yesterday' }],
    ['an extra key', { status: 'draft', version: '1.0.0', approvedVia: 'cloud' }],
    ['no version', { status: 'draft' }],
  ],
  components: [
    ['another format', { format: 'texuli/components', version: 1, components: [] }],
    ['version 2', { format: 'protoyard/ds-components', version: 2, components: [] }],
    [
      'a file outside components/',
      {
        format: 'protoyard/ds-components',
        version: 1,
        components: [
          {
            name: 'StatusPill',
            purpose: 'p',
            version: '0.1.0',
            status: 'draft',
            file: '../StatusPill.svelte',
            sha256: HASH,
          },
        ],
      },
    ],
    [
      'a camelCase name',
      {
        format: 'protoyard/ds-components',
        version: 1,
        components: [
          {
            name: 'statusPill',
            purpose: 'p',
            version: '0.1.0',
            status: 'draft',
            file: 'components/StatusPill.svelte',
            sha256: HASH,
          },
        ],
      },
    ],
  ],
  'component-request': [
    [
      'a line break in why',
      {
        format: 'protoyard/ds-component-request',
        version: 1,
        name: 'StatusPill',
        purpose: 'p',
        why: 'one\ntwo',
        requestedAt: AT,
        status: 'open',
      },
    ],
    [
      'a line separator in purpose',
      {
        format: 'protoyard/ds-component-request',
        version: 1,
        name: 'StatusPill',
        purpose: 'one two',
        why: 'w',
        requestedAt: AT,
        status: 'open',
      },
    ],
    [
      'an unknown status',
      {
        format: 'protoyard/ds-component-request',
        version: 1,
        name: 'StatusPill',
        purpose: 'p',
        why: 'w',
        requestedAt: AT,
        status: 'rejected',
      },
    ],
    [
      'a why over 1000 characters',
      {
        format: 'protoyard/ds-component-request',
        version: 1,
        name: 'StatusPill',
        purpose: 'p',
        why: 'w'.repeat(1001),
        requestedAt: AT,
        status: 'open',
      },
    ],
  ],
  story: [
    ['no variants', { format: 'protoyard/ds-story', version: 1, component: 'A', variants: [] }],
    [
      'props that are not an object',
      {
        format: 'protoyard/ds-story',
        version: 1,
        component: 'A',
        variants: [{ name: 'Default', props: [] }],
      },
    ],
  ],
  release: [
    [
      'no contentHash',
      {
        format: 'protoyard/ds-release',
        version: 1,
        designSystem: 'harbor',
        release: '1.2.0',
        approvedBy: 'Ada Example',
        approvedAt: AT,
        components: [],
      },
    ],
  ],
  bundle: [
    [
      'a path that climbs out',
      {
        format: 'protoyard/ds-bundle',
        version: 1,
        designSystem: 'harbor',
        release: '1.2.0',
        contentHash: HASH,
        texuli: {},
        files: [{ path: '../secret.json', sha256: HASH, bytes: 1, text: 'x' }],
      },
    ],
    [
      'an absolute path',
      {
        format: 'protoyard/ds-bundle',
        version: 1,
        designSystem: 'harbor',
        release: '1.2.0',
        contentHash: HASH,
        texuli: {},
        files: [{ path: '/etc/passwd', sha256: HASH, bytes: 1, text: 'x' }],
      },
    ],
  ],
};

/** Every one-step mutation of a valid document: drop a key, add one, retype each value. */
function mutations(value: Json): Json[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const out: Json[] = [{ ...value, unexpected: true }];
  for (const [key, item] of Object.entries(value)) {
    const { [key]: _dropped, ...rest } = value;
    out.push(rest);
    for (const replacement of [42, 'x', true, null, [], {}] as Json[]) {
      out.push({ ...value, [key]: replacement });
    }
    for (const nested of mutations(item)) out.push({ ...value, [key]: nested });
    if (Array.isArray(item) && item[0] !== undefined) {
      for (const nested of mutations(item[0])) out.push({ ...value, [key]: [nested] });
    }
  }
  return out;
}

describe('design-system JSON Schemas (PLAN_013 T-contracts)', () => {
  it('ships one checked-in schema per contract, equal to the generated one (drift test)', () => {
    // Regenerate: PROTOYARD_WRITE_DS_SCHEMAS=1 pnpm vitest run packages/cli/tests/ds-contracts.test.ts,
    // then `npx biome format --write packages/cli/src/lib/ds-schemas`.
    if (process.env.PROTOYARD_WRITE_DS_SCHEMAS === '1') {
      for (const c of DESIGN_SYSTEM_CONTRACTS) {
        writeFileSync(
          new URL(`${c.name}.schema.json`, SCHEMA_DIR),
          `${JSON.stringify(contractJsonSchema(c), null, 2)}\n`
        );
      }
    }
    const files = readdirSync(SCHEMA_DIR).sort();
    expect(files).toEqual(DESIGN_SYSTEM_CONTRACTS.map((c) => `${c.name}.schema.json`).sort());
    for (const c of DESIGN_SYSTEM_CONTRACTS) {
      // Compared as JSON: the files are formatted by Biome, the content must match exactly.
      const checkedIn = JSON.parse(
        readFileSync(new URL(`${c.name}.schema.json`, SCHEMA_DIR), 'utf8')
      ) as unknown;
      expect(
        checkedIn,
        `${c.name}.schema.json drifted; regenerate it from ds-contracts.ts`
      ).toEqual(contractJsonSchema(c));
    }
  });

  it('declares draft 2020-12, a unique URN $id, a closed root and marks the planned ones', () => {
    const ids = new Set<string>();
    for (const c of DESIGN_SYSTEM_CONTRACTS) {
      const schema = contractJsonSchema(c);
      expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
      expect(schema.$id).toMatch(/^urn:protoyard:design-system:[a-z-]+:1$/);
      expect(schema.additionalProperties).toBe(false);
      expect(String(schema.description).includes('planned')).toBe(c.status === 'planned');
      ids.add(String(schema.$id));
    }
    expect(ids.size).toBe(DESIGN_SYSTEM_CONTRACTS.length);
    expect(
      DESIGN_SYSTEM_CONTRACTS.filter((c) => c.status === 'planned').map((c) => c.name)
    ).toEqual(['release']);
  });

  for (const c of DESIGN_SYSTEM_CONTRACTS) {
    it(`${c.name}: the JSON Schema and zod agree on valid documents, and zod refuses what the schema refuses`, () => {
      const schema = contractJsonSchema(c);
      const valid = VALID[c.name] as Json;
      expect(validate(schema, valid)).toBe(true);
      expect(c.schema.safeParse(valid).success).toBe(true);

      for (const [label, document] of INVALID[c.name] ?? []) {
        expect(validate(schema, document), `${label}: JSON Schema`).toBe(false);
        expect(c.schema.safeParse(document).success, `${label}: zod`).toBe(false);
      }

      let refused = 0;
      for (const document of mutations(valid)) {
        if (!validate(schema, document)) {
          refused += 1;
          expect(
            c.schema.safeParse(document).success,
            `zod accepts what the JSON Schema refuses: ${JSON.stringify(document)}`
          ).toBe(false);
        }
      }
      expect(refused).toBeGreaterThan(5);
    });
  }
});

describe('the CLI readers refuse what the JSON Schema refuses', () => {
  let ws: TempWorkspace | undefined;
  afterEach(() => {
    ws?.cleanup();
    ws = undefined;
  });

  function folder() {
    ws = createWorkspace();
    ws.write('design-systems/harbor/document.json', {
      format: 'texuli/design-system',
      formatVersion: 1,
      id: 'harbor',
      version: '1.2.0',
      name: 'Harbor',
      color: { brand: { seed: '#0f766e' } },
    });
    return locateDesignSystem(ws.root, 'harbor');
  }

  function refused(read: () => unknown): boolean {
    try {
      read();
      return false;
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).code).toBe('validation');
      return true;
    }
  }

  const readers: [string, string, (location: ReturnType<typeof folder>) => unknown][] = [
    ['approval', 'approval.json', (l) => readApproval(l)],
    ['components', 'components.json', (l) => readComponents(l)],
    ['component-request', 'requests/StatusPill.json', (l) => readRequest(l, 'StatusPill')],
  ];

  for (const [name, file, read] of readers) {
    it(`${name}: reads the valid document and refuses every document its JSON Schema refuses`, () => {
      const location = folder();
      const schema = contractJsonSchema(contract(name));
      const write = (value: Json) => ws?.write(`design-systems/harbor/${file}`, value as object);

      write(VALID[name] as Json);
      expect(read(location)).toEqual(VALID[name]);

      const corpus = [
        ...(INVALID[name] ?? []).map(([, document]) => document),
        ...mutations(VALID[name] as Json).filter((document) => !validate(schema, document)),
      ];
      expect(corpus.length).toBeGreaterThan(5);
      for (const document of corpus) {
        write(document);
        expect(
          refused(() => read(location)),
          JSON.stringify(document)
        ).toBe(true);
      }
    });
  }

  it('the source of the contracts is one module', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../src/lib/design-systems.ts', import.meta.url)),
      'utf8'
    );
    expect(source).not.toMatch(/export const ApprovalSchema = z/);
    const components = readFileSync(
      fileURLToPath(new URL('../src/lib/ds-components.ts', import.meta.url)),
      'utf8'
    );
    expect(components).not.toMatch(/export const ComponentRequestSchema = z/);
  });
});
