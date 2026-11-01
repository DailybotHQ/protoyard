// @vitest-environment node

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Command } from 'commander';
import { afterAll, describe, expect, it } from 'vitest';
import {
  CAPABILITIES,
  CAPABILITY_IDS,
  DOCTOR_INTERFACE,
  doctorCommand,
} from '../src/commands/doctor.ts';
import { INTERFACE_MAJOR } from '../src/lib/workspace.ts';
import { createProgram, versionInfo } from '../src/program.ts';
import { cli } from './helpers.ts';

/**
 * The machine interface (docs/INTERFACE.md): `doctor --json` carries
 * `interface` and `capabilities` at the top level of its envelope, beside
 * ok/command/data, on every outcome (pass, failed checks, no workspace), so a
 * detector such as DWP's `json:interface` reads one field. Checks, exit codes
 * and the human output are unchanged.
 */

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

type DoctorEnvelope = {
  ok: boolean;
  command: string;
  interface?: number;
  capabilities?: string[];
  data?: { ok: boolean; checks: { id: string; status: string; required: boolean }[] };
  error?: { code: string; message: string };
};

const doctor = async (root: string, extra: string[] = []) => {
  const run = await cli(['--root', root, '--json', 'doctor', '--offline', ...extra]);
  return { code: run.code, envelope: JSON.parse(run.stdout) as DoctorEnvelope, stdout: run.stdout };
};

describe('the doctor interface', () => {
  it('is interface 1 with a sorted, frozen subset of the defined capability ids', () => {
    expect(DOCTOR_INTERFACE).toBe(1);
    expect(CAPABILITIES).toEqual([...CAPABILITIES].sort());
    for (const id of CAPABILITIES) expect(CAPABILITY_IDS, id).toContain(id);
    expect(Object.isFrozen(CAPABILITIES)).toBe(true);
    expect(doctorCommand.envelope).toEqual({ interface: 1, capabilities: CAPABILITIES });
    expect(Object.isFrozen(doctorCommand.envelope)).toBe(true);
  });

  it('lists exactly the capabilities this CLI implements', () => {
    const program = createProgram({ setExitCode: () => {} });
    const commands = new Set<string>();
    const walk = (cmd: Command, prefix: string[]) => {
      for (const sub of cmd.commands) {
        const path = [...prefix, sub.name()].join(' ');
        commands.add(path);
        walk(sub, [...prefix, sub.name()]);
      }
    };
    walk(program, []);
    const blueprintExports = JSON.parse(
      readFileSync(join(REPO, 'packages', 'blueprint', 'package.json'), 'utf8')
    ).exports;
    const cliDeps = JSON.parse(
      readFileSync(join(REPO, 'packages', 'cli', 'package.json'), 'utf8')
    ).dependencies;
    const contentKind = (kind: 'deck' | 'page' | 'doc') =>
      commands.has('quick') &&
      Boolean(blueprintExports['./kinds']) &&
      Boolean(blueprintExports['./schema.json']) &&
      existsSync(join(REPO, 'templates', kind));
    const implemented: Record<(typeof CAPABILITY_IDS)[number], boolean> = {
      quick: commands.has('quick'),
      generate: commands.has('generate'),
      'blueprint-schema':
        commands.has('blueprint validate') && Boolean(blueprintExports['./schema.json']),
      'deck-cli': ['schema', 'layouts', 'blocks', 'lint', 'inspect', 'capabilities'].every((sub) =>
        commands.has(`deck ${sub}`)
      ),
      'kind-deck': contentKind('deck'),
      'kind-page': contentKind('page'),
      'kind-doc': contentKind('doc'),
      player: Boolean(cliDeps['@protoyard/player']) && commands.has('quick'),
      mcp: commands.has('mcp'),
      import: commands.has('blueprint import') || commands.has('import'),
    };
    const expected = CAPABILITY_IDS.filter((id) => implemented[id]).sort();
    // When `mcp` or `import` ships, this fails until CAPABILITIES lists it.
    expect([...CAPABILITIES]).toEqual(expected);
  });

  it('puts interface and capabilities at the top level of a passing doctor envelope, keeping the checks', async () => {
    const { code, envelope } = await doctor(REPO);
    expect(code).toBe(0);
    expect(Object.keys(envelope)).toEqual(['ok', 'command', 'data', 'interface', 'capabilities']);
    expect(envelope).toMatchObject({
      ok: true,
      command: 'doctor',
      interface: 1,
      capabilities: [...CAPABILITIES],
    });
    expect(envelope.data?.ok).toBe(true);
    expect(envelope.data?.checks.map((c) => c.id)).toEqual(
      expect.arrayContaining(['node', 'pnpm', 'layout'])
    );
    // data keeps exactly its shape: the interface is not duplicated inside it.
    expect(Object.keys(envelope.data ?? {})).toEqual(['ok', 'checks']);
  }, 120_000);
});

describe('protoyard --version', () => {
  /**
   * The version contract (docs/INTERFACE.md): `protoyard --version` stays plain
   * semver; `protoyard --version --json` prints `{"version","interface"}` and
   * exits 0 anywhere, with the version read from the CLI's package.json and
   * the interface major shared with `doctor --json`.
   */

  const REPO = fileURLToPath(new URL('../../../', import.meta.url));
  const PACKAGE_VERSION = (
    JSON.parse(readFileSync(join(REPO, 'packages', 'cli', 'package.json'), 'utf8')) as {
      version: string;
    }
  ).version;
  const roots: string[] = [];
  afterAll(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  });

  describe('protoyard --version', () => {
    it('prints exactly {"version","interface"} with --json, in either order and with -v', async () => {
      for (const argv of [
        ['--version', '--json'],
        ['--json', '--version'],
        ['--json', '-v'],
      ]) {
        const run = await cli(argv);
        expect(run.code, argv.join(' ')).toBe(0);
        const lines = run.stdout.trim().split('\n');
        expect(lines, argv.join(' ')).toHaveLength(1);
        const parsed = JSON.parse(lines[0] ?? '') as Record<string, unknown>;
        expect(Object.keys(parsed)).toEqual(['version', 'interface']);
        expect(parsed).toEqual({ version: PACKAGE_VERSION, interface: INTERFACE_MAJOR });
        expect(Number.isInteger(parsed.interface)).toBe(true);
      }
      expect(versionInfo()).toEqual({ version: PACKAGE_VERSION, interface: 1 });
    });

    it('shares one interface major with doctor --json', async () => {
      expect(DOCTOR_INTERFACE).toBe(INTERFACE_MAJOR);
      const doctor = JSON.parse(
        (await cli(['--root', REPO, '--json', 'doctor', '--offline'])).stdout
      ) as {
        interface: number;
        capabilities: string[];
      };
      expect(doctor.interface).toBe(versionInfo().interface);
      expect(doctor.capabilities).toEqual([...CAPABILITIES]);
    }, 120_000);

    it('works outside any workspace from the real bin and exits 0 (a detector can probe anywhere)', () => {
      const empty = realpathSync(mkdtempSync(join(tmpdir(), 'protoyard-version-')));
      roots.push(empty);
      const env = { ...process.env };
      delete env.NODE_PATH;
      delete env.PROTOYARD_ROOT;
      const run = spawnSync(
        process.execPath,
        [join(REPO, 'packages', 'cli', 'bin', 'protoyard.mjs'), '--version', '--json'],
        {
          cwd: empty,
          env,
          encoding: 'utf8',
        }
      );
      expect(run.status, run.stderr).toBe(0);
      expect(JSON.parse(run.stdout)).toEqual({
        version: PACKAGE_VERSION,
        interface: INTERFACE_MAJOR,
      });
      const plain = spawnSync(
        process.execPath,
        [join(REPO, 'packages', 'cli', 'bin', 'protoyard.mjs'), '--version'],
        {
          cwd: empty,
          env,
          encoding: 'utf8',
        }
      );
      expect(plain.stdout).toBe(`${PACKAGE_VERSION}\n`);
    }, 60_000);
  });
});

describe('doctor kind capabilities', () => {
  /**
   * Kind capabilities on the machine interface (Task 145 / T-kinds-doctor-mcp):
   * `kind-deck`, `kind-page` and `kind-doc` are additive under interface 1.
   */

  describe('doctor kind capabilities (T-kinds-doctor-mcp)', () => {
    it('reports kind-deck from doctor --json (AC-kinds-dm-cli)', async () => {
      const result = await cli(['--json', 'doctor', '--offline']);
      expect(result.code, result.stdout).toBeLessThan(4);
      const envelope = result.json<{
        interface: number;
        capabilities: string[];
      }>();
      expect(envelope.interface).toBe(1);
      expect(envelope.capabilities).toEqual([...CAPABILITIES]);
      expect(envelope.capabilities).toContain('kind-deck');
      expect(envelope.capabilities).toContain('kind-page');
      expect(envelope.capabilities).toContain('kind-doc');
      // Sorted as advertised.
      expect(envelope.capabilities).toEqual([...envelope.capabilities].sort());
    }, 60_000);
  });
});
