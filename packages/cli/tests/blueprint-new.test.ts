// @vitest-environment node
import { existsSync, readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import { parseBlueprint } from '@protoyard/blueprint';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BRIEF_QUESTIONS, setBriefIo } from '../src/commands/blueprint.ts';
import { addCrudTemplate, cli, createWorkspace, type TempWorkspace } from './helpers.ts';

const SALON =
  'A dog grooming salon that books appointments, tracks groomers and invoices with amount and due date.';

let ws: TempWorkspace;
let restore: (() => void) | undefined;
beforeEach(() => {
  ws = createWorkspace();
});
afterEach(() => {
  restore?.();
  restore = undefined;
  ws.cleanup();
});

const path = (rel: string) => join(ws.root, rel);
const readJson = (rel: string) => JSON.parse(readFileSync(path(rel), 'utf8'));
const run = (...args: string[]) => cli(['--root', ws.root, '--json', 'blueprint', 'new', ...args]);

/** Feeds `text` as stdin; `tty` marks it as a terminal for --interactive. */
function stdin(text: string, tty = false) {
  const input = Readable.from([text]) as Readable & { isTTY?: boolean };
  if (tty) input.isTTY = true;
  const prompts = new PassThrough();
  let asked = '';
  prompts.on('data', (chunk) => {
    asked += String(chunk);
  });
  restore = setBriefIo({ stdin: input, prompts });
  return { asked: () => asked };
}

type Envelope = {
  ok: boolean;
  data: {
    file: string;
    written: boolean;
    archetype: string;
    layout: string;
    name: string;
    entities: string[];
    screens: string[];
    rationale: string[];
    blueprint?: Record<string, unknown>;
    generate?: { dryRun: boolean; files: { path: string }[] };
  };
  error?: { code: string; message: string; hint?: string };
};

describe('protoyard blueprint new', () => {
  it('writes a valid blueprint from a brief file and explains it', async () => {
    ws.write('brief.md', SALON);
    const result = await run(path('salon.json'), '--from-brief', path('brief.md'));
    expect(result.code).toBe(0);
    const { data } = result.json<Envelope>();
    expect(data).toMatchObject({
      written: true,
      archetype: 'booking',
      entities: ['appointment', 'client', 'groomer', 'invoice'],
    });
    expect(data.rationale[0]).toBe('Archetype booking: matched appointments, salon.');
    const written = readJson('salon.json');
    expect(() => parseBlueprint(written)).not.toThrow();
    expect(parseBlueprint(written).name).toBe(data.name);

    const validated = await cli(['--json', 'blueprint', 'validate', path('salon.json')]);
    expect(validated.code).toBe(0);
  });

  it('reads the brief from stdin with "-" and is deterministic', async () => {
    stdin(SALON);
    expect((await run(path('a.json'), '--from-brief', '-')).code).toBe(0);
    restore?.();
    stdin(SALON);
    expect((await run(path('b.json'), '--from-brief', '-')).code).toBe(0);
    expect(readFileSync(path('a.json'), 'utf8')).toBe(readFileSync(path('b.json'), 'utf8'));
  });

  it('honors --archetype and --name', async () => {
    ws.write('brief.md', 'Something for our team.');
    const result = await run(
      path('iot.json'),
      '--from-brief',
      path('brief.md'),
      '--archetype',
      'iot',
      '--name',
      'Fern Example'
    );
    expect(result.code).toBe(0);
    expect(readJson('iot.json')).toMatchObject({ name: 'Fern Example', tags: ['iot'] });
  });

  it('refuses to overwrite without --force, and replaces with it', async () => {
    ws.write('brief.md', SALON);
    ws.write('salon.json', '{"keep": true}');
    const refused = await run(path('salon.json'), '--from-brief', path('brief.md'));
    expect(refused.code).toBe(1);
    expect(refused.json<Envelope>().error).toMatchObject({ code: 'conflict' });
    expect(readJson('salon.json')).toEqual({ keep: true });

    // --force only replaces a file that already is a blueprint.
    const notBlueprint = await run(path('salon.json'), '--from-brief', path('brief.md'), '--force');
    expect(notBlueprint.code).toBe(1);
    expect(notBlueprint.json<Envelope>().error?.message).toMatch(/not a blueprint/);
    expect(readJson('salon.json')).toEqual({ keep: true });

    expect((await run(path('first.json'), '--from-brief', path('brief.md'))).code).toBe(0);
    const before = readJson('first.json');
    const forced = await run(
      path('first.json'),
      '--from-brief',
      path('brief.md'),
      '--force',
      '--name',
      'Renamed Salon'
    );
    expect(forced.code).toBe(0);
    expect(readJson('first.json')).toMatchObject({ formatVersion: 1, name: 'Renamed Salon' });
    expect(readJson('first.json').name).not.toBe(before.name);
  });

  it('never writes over workspace config, generated state, dependencies or symlinks', async () => {
    ws.write('brief.md', SALON);
    ws.write('tsconfig.base.json', '{"compilerOptions": {}}');
    ws.write('biome.json', '{}');
    ws.write('prototypes/other/protoyard.json', '{"id": "local.other"}');
    ws.write('.protoyard/registry.json', '{}');
    ws.write('node_modules/pkg/data.json', '{}');
    ws.write('prototypes/other/src/generated/blueprint.snapshot.json', '{}');
    const reserved = [
      'package.json',
      'tsconfig.base.json',
      'biome.json',
      'prototypes/other/protoyard.json',
      '.protoyard/registry.json',
      'node_modules/pkg/data.json',
      'prototypes/other/src/generated/blueprint.snapshot.json',
      'prototypes/other/tsconfig.json',
    ];
    for (const rel of reserved) {
      const before = existsSync(path(rel)) ? readFileSync(path(rel), 'utf8') : null;
      for (const extra of [['--force'], ['--force', '--dry-run']]) {
        const result = await run(path(rel), '--from-brief', path('brief.md'), ...extra);
        expect(result.code, rel).toBe(2);
        expect(result.json<Envelope>().error?.code).toBe('unsafe_path');
      }
      expect(existsSync(path(rel)) ? readFileSync(path(rel), 'utf8') : null).toBe(before);
    }

    // A symlink is refused even when it points at a blueprint inside the workspace.
    expect((await run(path('real.json'), '--from-brief', path('brief.md'))).code).toBe(0);
    symlinkSync(path('real.json'), path('link.json'));
    const linked = await run(path('link.json'), '--from-brief', path('brief.md'), '--force');
    expect(linked.code).toBe(2);
    expect(linked.json<Envelope>().error?.code).toBe('unsafe_path');
  });

  it('writes nothing on --dry-run and returns the blueprint', async () => {
    ws.write('brief.md', SALON);
    const result = await run(path('dry.json'), '--from-brief', path('brief.md'), '--dry-run');
    expect(result.code).toBe(0);
    const { data } = result.json<Envelope>();
    expect(data.written).toBe(false);
    expect(data.blueprint).toMatchObject({ formatVersion: 1, name: data.name });
    expect(existsSync(path('dry.json'))).toBe(false);
  });

  it('chains into generate --dry-run without writing a prototype', async () => {
    addCrudTemplate(ws);
    ws.write('brief.md', SALON);
    const result = await run(
      path('salon.json'),
      '--from-brief',
      path('brief.md'),
      '--generate',
      'salon-desk',
      '--dry-run'
    );
    expect(result.code).toBe(0);
    const { data } = result.json<Envelope>();
    expect(data.generate?.dryRun).toBe(true);
    expect(data.generate?.files.map((f) => f.path)).toEqual(
      expect.arrayContaining([
        'blueprint.json',
        'src/generated/schema.ts',
        'src/generated/services.ts',
      ])
    );
    expect(existsSync(path('prototypes/salon-desk'))).toBe(false);
    expect(existsSync(path('salon.json'))).toBe(false);
  });

  it('asks the interactive questions on a terminal and builds a brief from the answers', async () => {
    const io = stdin(
      [
        'A plant care tool for a community garden',
        'volunteers',
        'plants and beds',
        'watering date, location and health status',
        '',
        'Sprout Example',
        'y',
        '',
      ].join('\n'),
      true
    );
    const result = await run(path('garden.json'), '--interactive');
    expect(result.code).toBe(0);
    for (const question of BRIEF_QUESTIONS) expect(io.asked()).toContain(question);
    const { data } = result.json<Envelope>();
    expect(data).toMatchObject({ name: 'Sprout Example', layout: 'mobile-tabs' });
    const plant = parseBlueprint(readJson('garden.json')).entities.find((e) => e.name === 'bed');
    expect(plant?.fields.map((f) => f.kind)).toEqual(
      expect.arrayContaining(['date', 'geo', 'enum'])
    );
  });

  it('refuses --interactive without a terminal (exit 2 with a hint)', async () => {
    stdin('ignored', false);
    const result = await run(path('x.json'), '--interactive');
    expect(result.code).toBe(2);
    expect(result.json<Envelope>().error?.hint).toMatch(/--from-brief -/);
  });

  it.each([
    [['x.json'], 2, 'usage', /Missing a brief/],
    [['x.json', '--from-brief', 'missing.md'], 3, 'not_found', /Brief file not found/],
    [['x.txt', '--from-brief', '-'], 2, 'usage', /must end in \.json/],
    [['x.json', '--from-brief', '-', '--archetype', 'spaceship'], 2, 'usage', /Unknown archetype/],
    [['x.json', '--from-brief', '-', '--interactive'], 2, 'usage', /not both/],
  ])('rejects %j with exit %i', async (args, code, errorCode, message) => {
    stdin(SALON);
    const [file, ...rest] = args as string[];
    const result = await run(path(file as string), ...rest);
    expect(result.code).toBe(code);
    const { error } = result.json<Envelope>();
    expect(error?.code).toBe(errorCode);
    expect(error?.message).toMatch(message);
  });

  it('rejects an empty brief and a path outside the workspace', async () => {
    stdin('   ');
    expect((await run(path('empty.json'), '--from-brief', '-')).code).toBe(2);
    restore?.();
    stdin(SALON);
    const outside = await run(join(ws.root, '..', 'escape.json'), '--from-brief', '-');
    expect(outside.code).toBe(2);
    expect(outside.json<Envelope>().error?.code).toBe('unsafe_path');
  });
});
