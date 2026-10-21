// @vitest-environment node
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { CAPABILITIES, type InterfaceIssue, readInterfaceProbe } from '../src/commands/doctor.ts';
import { INTERFACE_MAJOR } from '../src/lib/workspace.ts';
import { cli, createWorkspace } from './helpers.ts';

/**
 * Interface compatibility failures (docs/INTERFACE.md, "Reading a probe"):
 * missing, malformed and mismatched interface data is rejected, unknown
 * capability ids are downgraded to warnings, and nothing claims compatibility
 * from a partial answer. Ordinary doctor failures keep their exit codes.
 */

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const codes = (issues: InterfaceIssue[], severity: InterfaceIssue['severity']) =>
  issues.filter((i) => i.severity === severity).map((i) => i.code);
const probe = (value: unknown, requirement?: Parameters<typeof readInterfaceProbe>[1]) =>
  readInterfaceProbe(typeof value === 'string' ? value : JSON.stringify(value), requirement);

describe('readInterfaceProbe: rejected outputs', () => {
  it.each([
    ['empty output', ''],
    ['plain semver (no --json)', '1.0.0\n'],
    ['truncated JSON', '{"version":"1.0.0","interf'],
    ['a JSON array', '[1]'],
    ['JSON null', 'null'],
    ['a bare number', '1'],
  ])('%s is unreadable', (_name, stdout) => {
    const result = readInterfaceProbe(stdout);
    expect(result).toMatchObject({ compatible: false, status: 'incompatible', interface: null });
    expect(codes(result.issues, 'error')).toEqual(['unreadable']);
  });

  it('rejects a missing interface field, also inside an envelope that looks healthy', () => {
    for (const value of [{ version: '1.0.0' }, { ok: true, command: 'doctor', data: {} }]) {
      const result = probe(value);
      expect(result.compatible).toBe(false);
      expect(codes(result.issues, 'error')).toEqual(['interface-missing']);
    }
    // Nested under data is not the documented place.
    expect(codes(probe({ ok: true, data: { interface: 1 } }).issues, 'error')).toEqual([
      'interface-missing',
    ]);
  });

  it.each([
    ['a string', '1'],
    ['a semver string', '1.0.0'],
    ['a fraction', 1.5],
    ['zero', 0],
    ['a negative', -1],
    ['null', null],
    ['a boolean', true],
    ['an object', { major: 1 }],
    ['beyond safe integers', 2 ** 60],
  ])('rejects interface as %s without coercing it', (_name, value) => {
    const result = probe({ version: '1.0.0', interface: value });
    expect(result).toMatchObject({ compatible: false, status: 'incompatible', interface: null });
    expect(codes(result.issues, 'error')).toEqual(['interface-malformed']);
    expect(result.issues[0]?.message).toContain(JSON.stringify(value));
  });

  it('rejects an older or newer major, reporting what it read', () => {
    for (const value of [INTERFACE_MAJOR + 1, INTERFACE_MAJOR + 41]) {
      const result = probe({ version: '9.0.0', interface: value });
      expect(result).toMatchObject({ compatible: false, interface: value });
      expect(codes(result.issues, 'error')).toEqual(['interface-mismatch']);
    }
    const older = probe({ interface: 1 }, { interface: 2 });
    expect(older.compatible).toBe(false);
    expect(older.issues[0]?.message).toMatch(/interface 1; this tool needs 2/);
  });

  it('rejects capabilities that are not an array', () => {
    for (const capabilities of ['quick', { quick: true }, null, 1]) {
      const result = probe({ interface: 1, capabilities });
      expect(result.compatible, JSON.stringify(capabilities)).toBe(false);
      expect(codes(result.issues, 'error')).toEqual(['capabilities-malformed']);
      expect(result.capabilities).toEqual([]);
    }
  });

  it('rejects a missing required capability, and a required id no probe can satisfy', () => {
    const doctorLike = { interface: 1, capabilities: ['generate', 'quick'] };
    const missing = probe(doctorLike, { capabilities: ['quick', 'mcp'] });
    expect(missing).toMatchObject({ compatible: false, missingCapabilities: ['mcp'] });
    expect(codes(missing.issues, 'error')).toEqual(['capability-missing']);

    // `--version --json` lists no capabilities: a requirement is never assumed met.
    const version = probe({ version: '1.0.0', interface: 1 }, { capabilities: ['quick'] });
    expect(version.compatible).toBe(false);
    expect(version.issues[0]?.message).toMatch(/lists no capabilities.*doctor --json/);

    // Requiring an undefined id fails even when the probe lists that exact string.
    const undefinedId = probe(
      { interface: 1, capabilities: ['quick', 'telepathy'] },
      { capabilities: ['telepathy'] }
    );
    expect(undefinedId.compatible).toBe(false);
    expect(codes(undefinedId.issues, 'error')).toEqual(['capability-unknown']);
    expect(undefinedId.missingCapabilities).toEqual(['telepathy']);
  });
});

describe('readInterfaceProbe: downgraded outputs', () => {
  it('ignores unknown capability ids with a warning and never counts them', () => {
    const result = probe({
      interface: 1,
      capabilities: ['quick', 'future-thing', 'quick', 'generate', 'Quick'],
    });
    expect(result).toMatchObject({
      compatible: true,
      status: 'degraded',
      capabilities: ['generate', 'quick'],
      unknownCapabilities: ['Quick', 'future-thing'],
    });
    expect(codes(result.issues, 'warning')).toEqual(['capability-unknown']);
  });

  it('drops non-string capability entries with a warning', () => {
    const result = probe({ interface: 1, capabilities: ['player', 7, null, { id: 'quick' }] });
    expect(result).toMatchObject({
      compatible: true,
      status: 'degraded',
      capabilities: ['player'],
    });
    expect(codes(result.issues, 'warning')).toEqual(['capabilities-malformed']);
    expect(result.issues[0]?.message).toMatch(/Ignored 3 capability entries/);
  });

  it('flags a doctor envelope that reported ok: false, without rejecting the interface', () => {
    const result = probe({
      ok: false,
      command: 'doctor',
      error: { code: 'not_found', message: 'No workspace.' },
      interface: 1,
      capabilities: [...CAPABILITIES],
    });
    expect(result).toMatchObject({ compatible: true, status: 'degraded', interface: 1 });
    expect(codes(result.issues, 'warning')).toEqual(['probe-not-ok']);
    expect(result.issues[0]?.message).toContain('not_found');
  });
});

describe('the real probes', () => {
  it('reads --version --json as compatible, with no capabilities claimed', async () => {
    const run = await cli(['--version', '--json']);
    expect(run.code).toBe(0);
    expect(readInterfaceProbe(run.stdout)).toEqual({
      compatible: true,
      status: 'compatible',
      interface: INTERFACE_MAJOR,
      capabilities: [],
      unknownCapabilities: [],
      missingCapabilities: [],
      issues: [],
    });
  });

  it('reads a passing doctor --json as compatible with exactly its capabilities', async () => {
    const run = await cli(['--root', REPO, '--json', 'doctor', '--offline']);
    expect(run.code).toBe(0);
    const result = readInterfaceProbe(run.stdout, { capabilities: [...CAPABILITIES] });
    expect(result).toMatchObject({
      compatible: true,
      status: 'compatible',
      capabilities: [...CAPABILITIES],
      issues: [],
    });
    expect(readInterfaceProbe(run.stdout, { capabilities: ['mcp'] }).compatible).toBe(false);
  }, 120_000);

  it('keeps ordinary doctor failures on their exit codes and reads them as degraded', async () => {
    const ws = createWorkspace();
    roots.push(ws.root);
    const failed = await cli(['--root', ws.root, '--json', 'doctor', '--offline']);
    expect(failed.code).toBe(1);
    expect(JSON.parse(failed.stdout).error.code).toBe('failure');

    const empty = realpathSync(mkdtempSync(join(tmpdir(), 'protoyard-compat-')));
    roots.push(empty);
    const missing = await cli(['--cwd', empty, '--json', 'doctor', '--offline']);
    expect(missing.code).toBe(3);

    for (const run of [failed, missing]) {
      const result = readInterfaceProbe(run.stdout);
      expect(result).toMatchObject({ compatible: true, status: 'degraded' });
      expect(codes(result.issues, 'warning')).toEqual(['probe-not-ok']);
    }
  }, 120_000);
});
