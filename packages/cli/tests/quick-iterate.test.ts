// @vitest-environment node
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { deriveDatabaseVersions, parseBlueprint } from '@protoyard/blueprint';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setQuickPlayerLocator } from '../src/commands/quick/index.ts';
import { QUICK_PATCH_MAX_BYTES, setQuickIterateStdin } from '../src/commands/quick/iterate.ts';
import {
  createPlayerAssetsManifest,
  readPlayerAssetsManifest,
} from '../src/lib/quick/player-assets.ts';
import { addCrudTemplate, cli, createWorkspace, type TempWorkspace } from './helpers.ts';

const ANALYTICS = join(import.meta.dirname, '../../../blueprints/quick/analytics.json');

let ws: TempWorkspace;
let restore: (() => void)[] = [];

/** A tiny prebuilt player with a real asset manifest, so quick never needs a build. */
async function fixturePlayer(root: string) {
  const dir = join(root, 'fixture-player', 'dist', 'app');
  mkdirSync(join(dir, 'assets'), { recursive: true });
  writeFileSync(
    join(dir, 'index.html'),
    '<!doctype html><title>fixture player</title><script type="module" src="./assets/app.js"></script>\n'
  );
  writeFileSync(join(dir, 'assets', 'app.js'), 'export const fixture = true;\n');
  const manifest = await createPlayerAssetsManifest(dir, '1.0.0');
  return {
    dir,
    packageDir: join(root, 'fixture-player'),
    version: '1.0.0',
    manifest,
    source: 'repository' as const,
  };
}

beforeEach(async () => {
  ws = createWorkspace();
  const player = await fixturePlayer(ws.root);
  restore = [
    setQuickPlayerLocator(() => ({ ...player, manifest: readPlayerAssetsManifest(player.dir) })),
  ];
});
afterEach(() => {
  for (const undo of restore.splice(0)) undo();
  ws.cleanup();
});

const run = (...args: string[]) => cli(['--root', ws.root, '--json', 'quick', ...args]);

async function explore(...extra: string[]) {
  const result = await run('--blueprint', ANALYTICS, '--slug', 'idea', ...extra);
  expect(result.code, result.stderr || result.stdout).toBe(0);
  return result.json<{ data: { slug: string; dir: string } }>().data;
}

/** Writes a patch file in the workspace and returns its path. */
function patchFile(name: string, operations: unknown): string {
  const path = join(ws.root, 'tmp', name);
  mkdirSync(join(ws.root, 'tmp'), { recursive: true });
  writeFileSync(path, typeof operations === 'string' ? operations : JSON.stringify(operations));
  return path;
}

/** Every file of the exploration and its text, to prove a refused patch changed nothing. */
function snapshot(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (folder: string, prefix: string) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) walk(path, `${prefix}${entry.name}/`);
      else files[`${prefix}${entry.name}`] = readFileSync(path, 'utf8');
    }
  };
  walk(join(ws.root, dir), '');
  return files;
}

const read = (dir: string, file: string) => readFileSync(join(ws.root, dir, file), 'utf8');

interface IterateData {
  changed: boolean;
  history: string | null;
  before: { sha256: string; identitySha256: string };
  after: { sha256: string; identitySha256: string };
  world: { preserved: boolean; fromVersion: number; toVersion: number; ops: string[] };
}

const SEGMENT = {
  name: 'segment',
  plural: 'segments',
  label: 'Segment',
  fields: [{ name: 'title', label: 'Title', kind: 'text', required: true }],
  titleField: 'title',
};

describe('protoyard quick iterate and undo', () => {
  it('applies a patch with history, rewrites the launcher, and undoes byte for byte', async () => {
    const { dir } = await explore();
    const before = snapshot(dir);

    const result = await run(
      'iterate',
      'idea',
      '--patch',
      patchFile('rename.json', [{ op: 'replace', path: '/name', value: 'Pulse Board' }])
    );
    expect(result.code, result.stderr || result.stdout).toBe(0);
    const data = result.json<{ data: IterateData }>().data;
    expect(data).toMatchObject({
      changed: true,
      history: `${dir}/history/0001.json`,
      world: { preserved: true, fromVersion: 1, toVersion: 1, ops: [] },
    });
    expect(JSON.parse(read(dir, 'blueprint.json')).name).toBe('Pulse Board');
    const launcher = read(dir, 'index.html');
    expect(launcher).toContain('<title>Pulse Board</title>');
    expect(launcher).not.toBe(before['index.html']);
    const record = JSON.parse(read(dir, 'quick.json'));
    expect(record.blueprintSha256).toBe(data.after.identitySha256);
    const entry = JSON.parse(read(dir, 'history/0001.json'));
    expect(entry).toMatchObject({
      sequence: 1,
      allowDrop: false,
      before: { sha256: data.before.sha256, text: before['blueprint.json'] },
      after: { sha256: data.after.sha256 },
    });
    // The served exploration still resolves (its recorded identity matches).
    expect((await run('list')).json<{ data: { skipped: unknown[] } }>().data.skipped).toEqual([]);

    const undo = await run('undo', 'idea');
    expect(undo.code, undo.stderr || undo.stdout).toBe(0);
    expect(undo.json<{ data: { undone: number; remaining: number } }>().data).toMatchObject({
      undone: 1,
      remaining: 0,
    });
    const after = snapshot(dir);
    expect(after['blueprint.json']).toBe(before['blueprint.json']);
    expect(after['index.html']).toBe(before['index.html']);
    expect(JSON.parse(after['quick.json'] as string).blueprintSha256).toBe(
      JSON.parse(before['quick.json'] as string).blueprintSha256
    );
    expect(existsSync(join(ws.root, dir, 'history/0001.json'))).toBe(false);

    const nothing = await run('undo', 'idea');
    expect(nothing.json<{ error: { code: string } }>().error.code).toBe('not_found');
  });

  it('keeps the previous blueprint in history when storage changes, and stacks undo', async () => {
    const { dir } = await explore();
    const original = read(dir, 'blueprint.json');
    const first = await run(
      'iterate',
      'idea',
      '--patch',
      patchFile('segment.json', [{ op: 'add', path: '/entities/-', value: SEGMENT }])
    );
    expect(first.code, first.stderr || first.stdout).toBe(0);
    expect(first.json<{ data: IterateData }>().data.world).toMatchObject({
      preserved: true,
      fromVersion: 1,
      toVersion: 2,
    });
    const changed = parseBlueprint(JSON.parse(read(dir, 'blueprint.json')));
    expect(changed.history).toHaveLength(1);
    expect(deriveDatabaseVersions(changed).map((version) => version.version)).toEqual([1, 2]);
    const afterFirst = read(dir, 'blueprint.json');

    const second = await run(
      'iterate',
      'idea',
      '--patch',
      patchFile('describe.json', [{ op: 'replace', path: '/description', value: 'Second pass' }])
    );
    expect(second.json<{ data: IterateData }>().data).toMatchObject({
      history: `${dir}/history/0002.json`,
      world: { fromVersion: 2, toVersion: 2 },
    });

    expect((await run('undo', 'idea')).code).toBe(0);
    expect(read(dir, 'blueprint.json')).toBe(afterFirst);
    const back = await run('undo', 'idea');
    expect(back.json<{ data: { world: { preserved: boolean } } }>().data.world.preserved).toBe(
      false
    );
    expect(read(dir, 'blueprint.json')).toBe(original);
  });

  it('needs --allow-drop to lose data, and reports the world as not preserved', async () => {
    const { dir } = await explore();
    const before = snapshot(dir);
    const drop = patchFile('drop.json', [{ op: 'remove', path: '/entities/1/fields/2' }]);
    const refused = await run('iterate', 'idea', '--patch', drop);
    expect(refused.code).toBe(4);
    const error = refused.json<{
      error: { code: string; hint?: string };
      data: { code: string };
    }>();
    expect(error.data.code).toBe('drop-requires-allow');
    expect(error.error.hint).toMatch(/--allow-drop/);
    expect(snapshot(dir)).toEqual(before);

    const allowed = await run('iterate', 'idea', '--patch', drop, '--allow-drop');
    expect(allowed.code, allowed.stderr || allowed.stdout).toBe(0);
    // A dropped plain field needs no new database version, but its data is gone from the app.
    expect(allowed.json<{ data: IterateData }>().data.world).toMatchObject({
      preserved: false,
      fromVersion: 1,
      toVersion: 1,
    });
    expect(JSON.parse(read(dir, 'history/0001.json')).allowDrop).toBe(true);
  });

  it('changes nothing for an invalid, unsafe, oversized or history-writing patch', async () => {
    const { dir } = await explore();
    const before = snapshot(dir);
    const cases: [string, unknown, string | null][] = [
      ['not-json.json', '{nope', null],
      ['not-a-patch.json', { op: 'replace' }, 'invalid-patch'],
      ['test.json', [{ op: 'test', path: '/name', value: 'Something else' }], 'test-failed'],
      ['missing.json', [{ op: 'remove', path: '/entities/9' }], 'path-not-found'],
      ['proto.json', [{ op: 'add', path: '/__proto__/polluted', value: true }], 'unsafe-pointer'],
      ['invalid.json', [{ op: 'replace', path: '/entities', value: [] }], 'invalid-result'],
      [
        'history.json',
        [{ op: 'add', path: '/history', value: [{ schemaVersion: 1, blueprint: {} }] }],
        null,
      ],
      ['huge.json', `[${' '.repeat(QUICK_PATCH_MAX_BYTES)}]`, null],
    ];
    for (const [name, operations, code] of cases) {
      const result = await run('iterate', 'idea', '--patch', patchFile(name, operations));
      expect(result.code, name).toBe(4);
      const envelope = result.json<{ error: { code: string }; data?: { code: string } }>();
      expect(envelope.error.code, name).toBe('validation');
      if (code) expect(envelope.data?.code, name).toBe(code);
      expect(snapshot(dir), name).toEqual(before);
    }
    expect({} as Record<string, unknown>).not.toHaveProperty('polluted');

    // A patch that ends where it started changes nothing and records nothing.
    const same = await run(
      'iterate',
      'idea',
      '--patch',
      patchFile('noop.json', [{ op: 'test', path: '/formatVersion', value: 1 }])
    );
    expect(same.json<{ data: IterateData }>().data).toMatchObject({
      changed: false,
      history: null,
    });
    expect(snapshot(dir)).toEqual(before);

    const missing = await run('iterate', 'idea');
    expect(missing.json<{ error: { code: string } }>().error.code).toBe('usage');
  });

  it('reads the patch from stdin and updates a standalone player copy', async () => {
    const { dir } = await explore('--standalone');
    restore.push(
      setQuickIterateStdin(
        Readable.from([JSON.stringify([{ op: 'replace', path: '/name', value: 'Solo Board' }])])
      )
    );
    const result = await run('iterate', join(ws.root, dir), '--patch', '-');
    expect(result.code, result.stderr || result.stdout).toBe(0);
    expect(read(dir, 'player/blueprint.json')).toBe(read(dir, 'blueprint.json'));
    expect(JSON.parse(read(dir, 'player/blueprint.json')).name).toBe('Solo Board');
    expect(read(dir, 'index.html')).toMatch(/url=player\/index\.html\?src=\.\/blueprint\.json/);

    // A blueprint edited by hand since is not undone over.
    const path = join(ws.root, dir, 'blueprint.json');
    writeFileSync(path, read(dir, 'blueprint.json').replace('Solo Board', 'Hand Edit'));
    const undo = await run('undo', 'idea');
    expect(undo.code).not.toBe(0);
    expect(read(dir, 'blueprint.json')).toContain('Hand Edit');
  });

  it('promotes an iterated exploration as a fresh prototype at schema v1', async () => {
    addCrudTemplate(ws);
    await explore();
    await run(
      'iterate',
      'idea',
      '--patch',
      patchFile('segment.json', [{ op: 'add', path: '/entities/-', value: SEGMENT }])
    );
    const result = await run('promote', 'idea', 'iterated-idea', '--no-install');
    expect(result.code, result.stderr || result.stdout).toBe(0);
    const written = parseBlueprint(
      JSON.parse(readFileSync(join(ws.root, 'prototypes/iterated-idea/blueprint.json'), 'utf8'))
    );
    expect(written.history).toEqual([]);
    expect(written.entities.map((entity) => entity.name)).toContain('segment');
    expect(
      readdirSync(join(ws.root, '.protoyard/quick/idea')).some((n) => n.startsWith('.promote-'))
    ).toBe(false);
  }, 60_000);
});
