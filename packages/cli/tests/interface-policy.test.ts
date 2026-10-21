// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CAPABILITIES, CAPABILITY_IDS } from '../src/commands/doctor.ts';
import { CliError, type ErrorCode } from '../src/lib/output.ts';
import { INTERFACE_MAJOR } from '../src/lib/workspace.ts';

/**
 * docs/INTERFACE.md's stability policy stays true to the code: the exit-code
 * table, the capability table, the interface major, the DWP descriptor
 * example (checked against DWP's addon-descriptor v1 schema) and its links.
 */

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const DOC_PATH = join(REPO, 'docs', 'INTERFACE.md');
const DOC = readFileSync(DOC_PATH, 'utf8');

/** The rows of the first table after `heading`, as trimmed cells. */
function tableAfter(heading: string): string[][] {
  const start = DOC.indexOf(heading);
  expect(start, heading).toBeGreaterThan(-1);
  const rows: string[][] = [];
  let inTable = false;
  for (const line of DOC.slice(start).split('\n').slice(1)) {
    if (line.startsWith('|')) {
      inTable = true;
      if (/^\|\s*-/.test(line)) continue;
      rows.push(
        line
          .slice(1, -1)
          .split(/(?<!\\)\|/)
          .map((cell) => cell.trim())
      );
    } else if (inTable) break;
  }
  return rows.slice(1);
}

/** The parts of a JSON Schema node this test reads. */
interface SchemaNode {
  const?: string;
  pattern?: string;
  properties?: Record<string, SchemaNode>;
  items?: { enum?: string[] };
}

const ERROR_CODES: ErrorCode[] = [
  'failure',
  'usage',
  'not_found',
  'validation',
  'provider',
  'auth',
  'conflict',
  'unsafe_path',
];

describe('docs/INTERFACE.md stability policy', () => {
  it('states the interface major the CLI reports', () => {
    expect(DOC).toContain(`It is **${INTERFACE_MAJOR}** today.`);
  });

  it('documents exactly the exit code of every error code', () => {
    const documented = new Map<string, number>();
    for (const [exit, , codes] of tableAfter('### Exit codes and errors')) {
      for (const code of (codes ?? '').match(/[a-z_]+/g) ?? []) documented.set(code, Number(exit));
    }
    expect([...documented.keys()].sort()).toEqual([...ERROR_CODES].sort());
    for (const code of ERROR_CODES) {
      expect(documented.get(code), code).toBe(new CliError(code, 'x').exitCode);
    }
  });

  it('lists every defined capability id, marked yes exactly when this CLI lists it', () => {
    const rows = tableAfter('## Capability ids');
    const ids = rows.map(([id]) => (id ?? '').replace(/`/g, ''));
    expect([...ids].sort()).toEqual([...CAPABILITY_IDS].sort());
    for (const [id, , status] of rows) {
      const listed = (CAPABILITIES as readonly string[]).includes((id ?? '').replace(/`/g, ''));
      expect(status, id).toBe(listed ? 'yes' : 'not yet');
    }
  });

  it('gives a DWP descriptor example that the addon-descriptor v1 schema accepts', () => {
    const marker = DOC.indexOf('<!-- interface-policy:descriptor -->');
    expect(marker).toBeGreaterThan(-1);
    const block = /```json\n([\s\S]*?)\n```/.exec(DOC.slice(marker))?.[1] ?? '';
    const descriptor = JSON.parse(block) as Record<string, unknown> & {
      product: Record<string, unknown>;
      detect: Record<string, unknown>;
    };
    const schema = JSON.parse(
      readFileSync(
        join(
          REPO,
          '.agents',
          'skills',
          'deepworkplan',
          'spec',
          'schema',
          'addon-descriptor-v1.schema.json'
        ),
        'utf8'
      )
    ) as SchemaNode & { required: string[] };
    /** The schema node at a `properties` path; fails the test when it is missing. */
    const at = (...path: string[]): SchemaNode => {
      let node: SchemaNode = schema;
      for (const key of path) {
        const next = node.properties?.[key];
        if (!next) throw new Error(`the schema has no ${path.join('.')}`);
        node = next;
      }
      return node;
    };
    const pattern = (...path: string[]) => new RegExp(at(...path).pattern ?? '(?!)');
    const keysOf = (...path: string[]) => Object.keys(at(...path).properties ?? {});

    expect(Object.keys(descriptor).every((key) => keysOf().includes(key))).toBe(true);
    for (const key of schema.required) expect(descriptor, key).toHaveProperty(key);
    expect(descriptor.schema).toBe(at('schema').const);
    expect(descriptor.key).toMatch(pattern('key'));

    expect(Object.keys(descriptor.product).every((k) => keysOf('product').includes(k))).toBe(true);
    expect(descriptor.product.repo).toMatch(pattern('product', 'repo'));
    // The tag is a documented placeholder until a release ships interface 1.
    expect(descriptor.product.tag).toBe('vX.Y.Z');
    expect('v1.2.3').toMatch(pattern('product', 'tag'));
    expect(descriptor.product.interface).toBe(INTERFACE_MAJOR);

    expect(Object.keys(descriptor.detect).every((k) => keysOf('detect').includes(k))).toBe(true);
    expect(descriptor.detect.paths).toBeUndefined();
    expect(descriptor.detect.command).toMatch(pattern('detect', 'command'));
    expect(descriptor.detect.interface_from).toMatch(pattern('detect', 'interface_from'));
    expect(descriptor.detect.command).toBe('protoyard --version --json');
    expect(descriptor.detect.interface_from).toBe('json:interface');

    for (const key of ['provides_abilities', 'requires_grants'] as const) {
      const allowed = at(key).items?.enum ?? [];
      for (const value of descriptor[key] as string[]) expect(allowed).toContain(value);
    }
  });

  it('links to the CLI output documentation, and every relative link resolves', () => {
    expect(DOC).toContain('](DEVELOPMENT_COMMANDS.md)');
    expect(DOC).toContain('](../packages/cli/README.md#json-output-and-exit-codes)');
    const readme = readFileSync(join(REPO, 'packages', 'cli', 'README.md'), 'utf8');
    expect(readme).toContain('\n## JSON output and exit codes\n');
    for (const [, target] of DOC.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) {
      if (/^[a-z]+:/.test(target ?? '')) continue;
      expect(existsSync(resolve(dirname(DOC_PATH), target ?? '')), target).toBe(true);
    }
  });
});
