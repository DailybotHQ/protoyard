// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readInterfaceProbe } from '../src/commands/doctor.ts';
import { INTERFACE_MAJOR } from '../src/lib/workspace.ts';
import { cli } from './helpers.ts';

/**
 * The Protoyard DWP addon descriptor (integrations/deepworkplan/protoyard/):
 * valid against the vendored addon-descriptor-v1 schema and the pack's own
 * runtime check, keyed by its directory, pinned to interface 1, and detected
 * through `protoyard --version --json`, read the way the pack reads it.
 */

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const DIR = join(REPO, 'integrations', 'deepworkplan', 'protoyard');
const PACK = join(REPO, '.agents', 'skills', 'deepworkplan');
const descriptor = JSON.parse(readFileSync(join(DIR, 'addon.json'), 'utf8')) as Record<
  string,
  // biome-ignore lint/suspicious/noExplicitAny: a parsed JSON descriptor
  any
>;
const schema = JSON.parse(
  readFileSync(join(PACK, 'spec', 'schema', 'addon-descriptor-v1.schema.json'), 'utf8')
);

const python = spawnSync('python3', ['--version'], { encoding: 'utf8' }).status === 0;

/** Runs a snippet against the vendored pack's shared/ modules. */
function packPython(code: string, input = '') {
  return spawnSync('python3', ['-I', '-B', '-c', code, join(PACK, 'shared')], {
    encoding: 'utf8',
    input,
  });
}

describe('the protoyard addon descriptor', () => {
  it('is a closed object with exactly the schema’s fields, its key equal to the directory', () => {
    const allowed = Object.keys(schema.properties);
    for (const key of Object.keys(descriptor)) expect(allowed, key).toContain(key);
    for (const key of schema.required as string[]) expect(descriptor, key).toHaveProperty(key);
    expect(descriptor.schema).toBe(schema.properties.schema.const);
    expect(descriptor.key).toBe('protoyard');
    expect(new RegExp(schema.properties.key.pattern).test(descriptor.key)).toBe(true);
  });

  it('matches the schema’s product, detect, ability and grant rules', () => {
    const product = schema.properties.product;
    expect(Object.keys(descriptor.product).sort()).toEqual(['interface', 'repo', 'tag']);
    expect(new RegExp(product.properties.repo.pattern).test(descriptor.product.repo)).toBe(true);
    expect(new RegExp(product.properties.tag.pattern).test(descriptor.product.tag)).toBe(true);
    expect(descriptor.product.interface).toBe(INTERFACE_MAJOR);

    const detect = schema.properties.detect;
    expect(Object.keys(descriptor.detect).sort()).toEqual(['command', 'interface_from']);
    expect(descriptor.detect).toEqual({
      command: 'protoyard --version --json',
      interface_from: 'json:interface',
    });
    expect(new RegExp(detect.properties.command.pattern).test(descriptor.detect.command)).toBe(
      true
    );
    expect(
      new RegExp(detect.properties.interface_from.pattern).test(descriptor.detect.interface_from)
    ).toBe(true);

    const abilities = schema.properties.provides_abilities.items.enum as string[];
    const grants = schema.properties.requires_grants.items.enum as string[];
    // Protoyard contributes no host ability and is not a delegation transport.
    expect(descriptor.provides_abilities).toEqual([]);
    expect(descriptor).not.toHaveProperty('transport');
    for (const grant of descriptor.requires_grants) expect(grants, grant).toContain(grant);
    expect(new Set(descriptor.requires_grants).size).toBe(descriptor.requires_grants.length);
    expect(descriptor.requires_grants).toEqual(['gate_command_exec', 'fs_write_plan_scope']);
    expect(abilities.length).toBeGreaterThan(0);
  });

  it.skipIf(!python)('passes the vendored pack’s runtime descriptor check', () => {
    const run = packPython(
      [
        'import json, sys',
        'sys.path.insert(0, sys.argv[1])',
        'from config import descriptor_errors',
        'print(json.dumps(descriptor_errors(json.load(sys.stdin), "protoyard")))',
      ].join('\n'),
      JSON.stringify(descriptor)
    );
    expect(run.status, run.stderr).toBe(0);
    expect(JSON.parse(run.stdout)).toEqual([]);
    // The same check rejects a key that does not match the directory.
    const wrong = packPython(
      [
        'import json, sys',
        'sys.path.insert(0, sys.argv[1])',
        'from config import descriptor_errors',
        'print(json.dumps(descriptor_errors(json.load(sys.stdin), "other")))',
      ].join('\n'),
      JSON.stringify(descriptor)
    );
    expect(JSON.parse(wrong.stdout)).toEqual([
      "key 'protoyard' does not equal its directory 'other'",
    ]);
  });

  it.skipIf(!python)(
    'detects interface 1 from the real CLI through the pack’s interface reader',
    async () => {
      const argv = descriptor.detect.command.split(' ').slice(1);
      const run = await cli(argv);
      expect(run.code).toBe(0);
      const read = packPython(
        [
          'import sys',
          'sys.path.insert(0, sys.argv[1])',
          'from resources import _read_interface',
          `print(_read_interface(${JSON.stringify(descriptor.detect.interface_from)}, sys.stdin.read()))`,
        ].join('\n'),
        run.stdout
      );
      expect(read.status, read.stderr).toBe(0);
      expect(read.stdout.trim()).toBe(String(descriptor.product.interface));
      expect(readInterfaceProbe(run.stdout).compatible).toBe(true);
    }
  );

  it('pins a tag that ships the interface (v1.0.0 predates it)', () => {
    expect(descriptor.product.tag).not.toBe('v1.0.0');
    const tag = descriptor.product.tag as string;
    const exists =
      spawnSync('git', ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`], { cwd: REPO })
        .status === 0;
    if (!exists) return; // Not released yet: the release adds the tag this pin names.
    const program = spawnSync('git', ['show', `${tag}:packages/cli/src/program.ts`], {
      cwd: REPO,
      encoding: 'utf8',
    });
    expect(program.stdout).toContain('wantsJsonVersion');
  });

  it('keeps the vendored pack untouched (the descriptor is a Protoyard-side packet)', () => {
    const vendored = spawnSync('git', ['ls-files', join(PACK, 'addons', 'protoyard')], {
      cwd: REPO,
      encoding: 'utf8',
    });
    expect(vendored.stdout.trim()).toBe('');
  });
});
