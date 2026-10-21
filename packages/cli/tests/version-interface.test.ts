// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { CAPABILITIES, DOCTOR_INTERFACE } from '../src/commands/doctor.ts';
import { CLI_VERSION, INTERFACE_MAJOR } from '../src/lib/workspace.ts';
import { versionInfo, wantsJsonVersion } from '../src/program.ts';
import { cli } from './helpers.ts';

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

describe('wantsJsonVersion', () => {
  it('needs --version (or -v) and --json among the global options, in any order', () => {
    for (const argv of [
      ['--version', '--json'],
      ['--json', '--version'],
      ['-v', '--json'],
      ['--root', 'some/dir', '--json', '--version'],
      ['--cwd', '.', '-v', '--json', '--quiet'],
    ]) {
      expect(wantsJsonVersion(argv), argv.join(' ')).toBe(true);
    }
  });

  it('ignores either flag alone, flags after a command word, and option values', () => {
    for (const argv of [
      ['--version'],
      ['--json'],
      ['list', '--json', '--version'],
      ['--json', 'doctor', '-v'],
      // `--json` here is the value of --root, not the flag.
      ['--root', '--json', '--version'],
      ['--', '--version', '--json'],
    ]) {
      expect(wantsJsonVersion(argv), argv.join(' ')).toBe(false);
    }
  });
});

describe('protoyard --version', () => {
  it('stays plain semver from the package version', async () => {
    const run = await cli(['--version']);
    expect(run.code).toBe(0);
    expect(run.stdout).toBe(`${PACKAGE_VERSION}\n`);
    expect(CLI_VERSION).toBe(PACKAGE_VERSION);
  });

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
