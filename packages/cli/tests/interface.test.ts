// @vitest-environment node
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
import { withEnvelopeFields } from '../src/lib/command.ts';
import { createProgram } from '../src/program.ts';
import { cli, createWorkspace } from './helpers.ts';

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

describe('withEnvelopeFields', () => {
  it('adds static fields and never replaces the envelope’s own keys', () => {
    const envelope = { ok: true, command: 'doctor', data: { a: 1 } };
    expect(withEnvelopeFields(envelope, { interface: 1, capabilities: ['quick'] })).toEqual({
      ok: true,
      command: 'doctor',
      data: { a: 1 },
      interface: 1,
      capabilities: ['quick'],
    });
    expect(
      withEnvelopeFields(envelope, { ok: false, command: 'x', data: null, error: {}, interface: 2 })
    ).toEqual({ ...envelope, interface: 2 });
    expect(withEnvelopeFields(envelope, undefined)).toBe(envelope);
  });
});

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

  it('keeps them on a failed doctor run, with the same failure, data and exit code', async () => {
    const ws = createWorkspace();
    roots.push(ws.root);
    const { code, envelope } = await doctor(ws.root);
    expect(code).toBe(1);
    expect(envelope.ok).toBe(false);
    expect(envelope.error?.message).toMatch(/required check\(s\) failed/);
    expect(envelope.data?.checks.some((c) => c.required && c.status === 'fail')).toBe(true);
    expect(envelope).toMatchObject({ interface: 1, capabilities: [...CAPABILITIES] });
  }, 120_000);

  it('keeps them when there is no workspace at all (exit 3 as before)', async () => {
    const empty = realpathSync(mkdtempSync(join(tmpdir(), 'protoyard-interface-')));
    roots.push(empty);
    const run = await cli(['--cwd', empty, '--json', 'doctor', '--offline']);
    const envelope = JSON.parse(run.stdout) as DoctorEnvelope;
    expect(run.code).toBe(3);
    expect(envelope).toMatchObject({
      ok: false,
      command: 'doctor',
      error: { code: 'not_found' },
      interface: 1,
      capabilities: [...CAPABILITIES],
    });
  }, 60_000);

  it('is deterministic across runs and leaves other commands and the human output alone', async () => {
    const first = await doctor(REPO);
    const second = await doctor(REPO);
    expect([first.envelope.interface, first.envelope.capabilities]).toEqual([
      second.envelope.interface,
      second.envelope.capabilities,
    ]);
    const list = JSON.parse((await cli(['--root', REPO, '--json', 'list'])).stdout) as Record<
      string,
      unknown
    >;
    expect(list).not.toHaveProperty('interface');
    expect(list).not.toHaveProperty('capabilities');
    const human = await cli(['--root', REPO, 'doctor', '--offline']);
    expect(human.stdout).toContain('Protoyard doctor');
    expect(human.stdout).not.toMatch(/interface|capabilities/i);
  }, 180_000);
});
