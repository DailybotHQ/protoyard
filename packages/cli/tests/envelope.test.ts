// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CliError,
  ExitCode,
  errorEnvelope,
  formatTable,
  successEnvelope,
} from '../src/lib/output.ts';
import { addPrototype, addTemplate, cli, createWorkspace, type TempWorkspace } from './helpers.ts';

let ws: TempWorkspace;
beforeAll(() => {
  ws = createWorkspace();
  addPrototype(ws, 'crm-app', { name: 'CRM', tags: ['crm'], scenarios: ['default', 'empty'] });
  addTemplate(ws, 'blank');
});
afterAll(() => ws.cleanup());

describe('JSON envelope', () => {
  it('has a stable success and error shape', () => {
    expect(successEnvelope('list', { n: 1 })).toEqual({
      ok: true,
      command: 'list',
      data: { n: 1 },
    });
    expect(errorEnvelope('build', new CliError('not_found', 'nope', { hint: 'try' }))).toEqual({
      ok: false,
      command: 'build',
      error: { code: 'not_found', message: 'nope', hint: 'try' },
    });
    expect(errorEnvelope('x', new Error('boom')).error).toEqual({
      code: 'failure',
      message: 'boom',
    });
    expect(new CliError('auth', 'login').exitCode).toBe(ExitCode.Provider);
  });

  it('list --json prints exactly one parseable envelope', async () => {
    const run = await cli(['--root', ws.root, '--json', 'list', '--kind', 'prototype']);
    expect(run.code).toBe(0);
    const env = run.json<{
      ok: boolean;
      command: string;
      data: { count: number; entries: { slug: string; scenarioCount: number }[] };
    }>();
    expect(env).toMatchObject({ ok: true, command: 'list' });
    expect(env.data.entries).toMatchObject([{ slug: 'crm-app', scenarioCount: 2 }]);
    expect(run.stderr).toBe('');
  });

  it('maps commander usage errors to exit 2 with an envelope', async () => {
    const unknown = await cli(['--root', ws.root, '--json', 'list', '--kind', 'nope']);
    expect(unknown.code).toBe(2);
    expect(unknown.json<{ ok: boolean; error: { code: string } }>()).toMatchObject({
      ok: false,
      error: { code: 'usage' },
    });
    const missing = await cli(['--root', ws.root, '--json', 'new', 'x-app']);
    expect(missing.code).toBe(2);
    expect(missing.json<{ error: { message: string } }>().error.message).toMatch(/--template/);
  });

  it('uses exit 3 for unknown slugs and suggests similar ones', async () => {
    const run = await cli(['--root', ws.root, '--json', 'scenario', 'list', 'crm']);
    expect(run.code).toBe(3);
    expect(run.json<{ error: { hint: string } }>().error.hint).toMatch(/crm-app/);
  });

  it('scenario list reads ids statically from the manifest', async () => {
    const run = await cli(['--root', ws.root, '--json', 'scenario', 'list', 'crm-app']);
    expect(
      run.json<{ data: { source: string; scenarios: { id: string; default: boolean }[] } }>().data
    ).toEqual({
      slug: 'crm-app',
      source: 'manifest',
      scenarios: [
        { id: 'default', default: true },
        { id: 'empty', default: false },
      ],
    });
  });

  it('snapshot list validates committed snapshot files as data', async () => {
    ws.write('prototypes/crm-app/snapshots/good.protoyard.json', {
      format: 'protoyard.snapshot',
      formatVersion: 1,
      id: 'snap_1',
      name: 'Demo state',
      prototypeId: 'example.crm-app',
      prototypeVersion: '0.1.0',
      schemaVersion: 1,
      scenarioId: 'default',
      scenarioVersion: 1,
      seed: 1,
      referenceTime: '2026-01-01T00:00:00Z',
      createdAt: '2026-01-02T00:00:00Z',
      actorId: null,
      organizationId: null,
      clock: null,
      environment: {},
      tables: [{ name: 'deals', rows: [{ id: 'd1' }] }],
    });
    ws.write('prototypes/crm-app/snapshots/other.protoyard.json', { format: 'protoyard.snapshot' });
    ws.write('prototypes/crm-app/snapshots/notes.txt', 'ignored');
    const run = await cli(['--root', ws.root, '--json', 'snapshot', 'list', 'crm-app']);
    const files = run.json<{ data: { files: { file: string; ok: boolean; rows?: number }[] } }>()
      .data.files;
    expect(files.map((f) => [f.file, f.ok])).toEqual([
      ['good.protoyard.json', true],
      ['other.protoyard.json', false],
    ]);
    expect(files[0]?.rows).toBe(1);
  });

  it('formats aligned tables with truncation', () => {
    const table = formatTable(['A', 'B'], [['short', 'x'.repeat(50)]], { maxWidth: 10 });
    expect(table.split('\n')[2]).toBe(`short  ${'x'.repeat(9)}…`);
  });
});
