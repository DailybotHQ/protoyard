// @vitest-environment node
import { existsSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { blueprintIdentity, decodeBlueprintShare, parseBlueprint } from '@protoyard/blueprint';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  launcherHtml,
  setQuickPlayerLocator,
  setQuickStdin,
  slugFromName,
} from '../src/commands/quick/index.ts';
import { readQuickRecord } from '../src/lib/quick/model.ts';
import {
  createPlayerAssetsManifest,
  PLAYER_BUILD_COMMAND,
  readPlayerAssetsManifest,
} from '../src/lib/quick/player-assets.ts';
import { cli, createWorkspace, type TempWorkspace } from './helpers.ts';

const BRIEF =
  'A fictional field service team schedules equipment inspections, assigns technicians and tracks each visit.';
const ANALYTICS = join(import.meta.dirname, '../../../blueprints/quick/analytics.json');

/** A valid blueprint whose labels are incompressible, so its share link exceeds 16 KB. */
function incompressibleBlueprint() {
  let state = 7;
  const word = () => {
    let out = '';
    for (let i = 0; i < 40; i += 1) {
      state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
      out += 'abcdefghijklmnopqrstuvwxyz'[state % 26];
    }
    return out;
  };
  return {
    formatVersion: 1,
    name: 'Noisy Labels',
    entities: Array.from({ length: 12 }, (_, e) => ({
      name: `item-${String.fromCharCode(97 + e)}`,
      plural: `items-${String.fromCharCode(97 + e)}`,
      fields: Array.from({ length: 40 }, (_, f) => ({
        name: `field${f}`,
        kind: 'text',
        label: word(),
      })),
      titleField: 'field0',
    })),
    roles: [{ name: 'owner', permissions: { '*': ['*'] } }],
  };
}

let ws: TempWorkspace;
let restore: (() => void)[] = [];

/** A tiny prebuilt player with a real asset manifest, so quick never needs a build. */
async function fixturePlayer(root: string) {
  const dir = join(root, 'fixture-player', 'dist', 'app');
  mkdirSync(join(dir, 'assets'), { recursive: true });
  writeFileSync(
    join(dir, 'index.html'),
    '<!doctype html><script type="module" src="./assets/app.js"></script>\n'
  );
  writeFileSync(join(dir, 'assets', 'app.js'), 'export {};\n');
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
const at = (path: string) => join(ws.root, path);

describe('protoyard quick', () => {
  it('turns a brief into a ready exploration with a shared player and a share-link launcher', async () => {
    const result = await run(BRIEF);
    expect(result.code, result.stderr || result.stdout).toBe(0);
    const { data } = result.json<{ data: Record<string, unknown> }>();
    const slug = data.slug as string;
    expect(data).toMatchObject({
      dir: `.protoyard/quick/${slug}`,
      ready: true,
      source: 'brief',
      layout: 'shared',
      standaloneReason: null,
      player: { version: '1.0.0', dir: '.protoyard/quick/_player/1.0.0', reused: false },
      open: `.protoyard/quick/${slug}/index.html`,
      replaced: false,
    });
    expect(data.blueprintSha256).toMatch(/^[0-9a-f]{64}$/);

    const dir = at(data.dir as string);
    const blueprint = parseBlueprint(JSON.parse(readFileSync(join(dir, 'blueprint.json'), 'utf8')));
    expect((await blueprintIdentity(blueprint)).sha256).toBe(data.blueprintSha256);
    const record = await readQuickRecord(dir);
    expect(record).toMatchObject({
      slug,
      source: 'brief',
      brief: { text: BRIEF },
      blueprintSha256: data.blueprintSha256,
      seed: null,
      player: { version: '1.0.0', standalone: false },
    });
    expect(existsSync(join(dir, '.protoyard-quick'))).toBe(true);
    expect(existsSync(at('.protoyard/quick/_player/1.0.0/index.html'))).toBe(true);

    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    const href = /url=([^"]+)"/.exec(html)?.[1] ?? '';
    expect(href.startsWith('../_player/1.0.0/index.html#bp=')).toBe(true);
    expect(html).not.toMatch(/<script/i);
    const decoded = await decodeBlueprintShare(href.slice(href.indexOf('#')));
    expect(decoded.success && decoded.blueprint).toEqual(blueprint);

    const second = await run(BRIEF, '--slug', 'second-idea');
    expect(second.json<{ data: { player: { reused: boolean } } }>().data.player.reused).toBe(true);
  });

  it('warns, without failing, when the monorepo player build is older than its source', async () => {
    // This workspace's own packages/player, built, with sources next to it.
    const pkg = join(ws.root, 'packages', 'player');
    const app = join(pkg, 'dist', 'app');
    mkdirSync(join(pkg, 'src'), { recursive: true });
    mkdirSync(app, { recursive: true });
    writeFileSync(
      join(pkg, 'package.json'),
      JSON.stringify({ name: '@protoyard/player', version: '1.0.0' })
    );
    writeFileSync(join(pkg, 'src', 'main.ts'), 'export {};\n');
    writeFileSync(join(app, 'index.html'), '<!doctype html><title>player</title>\n');
    await createPlayerAssetsManifest(app, '1.0.0');
    const locate = () => ({
      dir: app,
      packageDir: pkg,
      version: '1.0.0',
      manifest: readPlayerAssetsManifest(app),
      source: 'repository' as const,
    });
    restore.push(setQuickPlayerLocator(locate));
    const setTime = (file: string, iso: string) => utimesSync(file, new Date(iso), new Date(iso));
    setTime(join(pkg, 'src', 'main.ts'), '2026-10-01T00:00:00Z');
    setTime(join(app, 'protoyard-player-assets.json'), '2026-10-02T00:00:00Z');

    const fresh = await run('--blueprint', ANALYTICS, '--slug', 'fresh-build');
    expect(fresh.code, fresh.stderr || fresh.stdout).toBe(0);
    expect(fresh.json<{ data: { warnings: string[] } }>().data.warnings).toEqual([]);

    setTime(join(pkg, 'src', 'main.ts'), '2026-10-03T00:00:00Z');
    const stale = await run('--blueprint', ANALYTICS, '--slug', 'stale-build');
    expect(stale.code, stale.stderr || stale.stdout).toBe(0);
    const [warning, ...rest] = stale.json<{ data: { warnings: string[] } }>().data.warnings;
    expect(rest).toEqual([]);
    expect(warning).toContain(PLAYER_BUILD_COMMAND);
    expect(warning).toContain('packages/player/src/main.ts');

    // The human output says it too.
    const human = await cli([
      '--root',
      ws.root,
      'quick',
      '--blueprint',
      ANALYTICS,
      '--slug',
      'human',
    ]);
    expect(human.code, human.stderr || human.stdout).toBe(0);
    expect(`${human.stdout}${human.stderr}`).toContain(PLAYER_BUILD_COMMAND);
  });

  it('reads a brief from stdin, passes the seed, and can keep only the brief hash', async () => {
    restore.push(setQuickStdin(Readable.from([Buffer.from(BRIEF)])));
    const result = await run('-', '--slug', 'from-stdin', '--seed', '42', '--no-store-brief');
    expect(result.code, result.stdout).toBe(0);
    const dir = at('.protoyard/quick/from-stdin');
    const record = await readQuickRecord(dir);
    expect(record.brief).toMatchObject({ text: null, chars: BRIEF.length });
    expect(record.seed).toBe('42');
    expect(readFileSync(join(dir, 'index.html'), 'utf8')).toContain('index.html?seed=42#bp=');
    expect(JSON.stringify(record)).not.toContain('field service');
  });

  it('validates a blueprint file and records it as the source', async () => {
    const result = await run('--blueprint', ANALYTICS);
    expect(result.code, result.stdout).toBe(0);
    const { data } = result.json<{ data: { slug: string; source: string; dir: string } }>();
    expect(data).toMatchObject({ slug: 'quick-product-analytics', source: 'blueprint' });
    expect((await readQuickRecord(at(data.dir))).brief).toBeNull();
  });

  it('copies the player in for --standalone, a custom --out, or a blueprint too large for a link', async () => {
    const standalone = await run('--blueprint', ANALYTICS, '--slug', 'alone', '--standalone');
    expect(standalone.json<{ data: unknown }>().data).toMatchObject({
      layout: 'standalone',
      standaloneReason: 'flag',
      player: { dir: '.protoyard/quick/alone/player' },
    });
    const dir = at('.protoyard/quick/alone');
    expect(existsSync(join(dir, 'player', 'blueprint.json'))).toBe(true);
    expect(readFileSync(join(dir, 'index.html'), 'utf8')).toContain(
      'url=player/index.html?src=./blueprint.json'
    );

    const out = await run('--blueprint', ANALYTICS, '--out', 'tmp/explorations/analytics');
    expect(out.json<{ data: unknown }>().data).toMatchObject({
      dir: 'tmp/explorations/analytics',
      layout: 'standalone',
      standaloneReason: 'out',
    });

    ws.write('noisy.blueprint.json', incompressibleBlueprint());
    const large = await run('--blueprint', at('noisy.blueprint.json'), '--slug', 'large-one');
    expect(large.code, large.stdout).toBe(0);
    expect(large.json<{ data: unknown }>().data).toMatchObject({
      layout: 'standalone',
      standaloneReason: 'too-large-for-link',
    });
  });

  it('refuses missing, conflicting, empty, invalid and oversized input with fix hints', async () => {
    const usage = await run();
    expect(usage.code).toBe(2);
    expect(usage.json<{ error: { hint: string } }>().error.hint).toMatch(/protoyard quick "/);
    expect((await run(BRIEF, '--blueprint', ANALYTICS)).code).toBe(2);
    expect((await run('   ')).code).toBe(2);
    expect((await run(BRIEF, '--seed', 'abc')).code).toBe(2);
    expect((await run(BRIEF, '--seed', '99999999999')).code).toBe(2);
    expect((await run('--blueprint', 'nope.json')).code).toBe(3);

    ws.write('bad.blueprint.json', { formatVersion: 1, name: 'Bad', entities: [], roles: [] });
    const invalid = await run('--blueprint', at('bad.blueprint.json'));
    expect(invalid.code).toBe(4);
    const envelope = invalid.json<{
      error: { message: string; hint: string };
      data: { issues: unknown[] };
    }>();
    expect(envelope.error.message).toMatch(/blueprint is invalid/);
    expect(envelope.error.hint.length).toBeGreaterThan(0);
    expect(envelope.data.issues.length).toBeGreaterThan(0);

    ws.write('huge.json', 'x'.repeat(300 * 1024));
    expect((await run('--blueprint', at('huge.json'))).code).toBe(4);
    restore.push(setQuickStdin(Readable.from([Buffer.from('x'.repeat(70 * 1024))])));
    expect((await run('-')).code).toBe(4);
    expect(existsSync(at('.protoyard/quick'))).toBe(false);
  });

  it('reports a brief the synthesizer cannot turn into a valid blueprint, never a crash', async () => {
    // At the time of writing, this brief yields a reserved /members screen in the synthesizer.
    const result = await run(
      'A fictional climbing gym books classes, tracks members and their passes.'
    );
    if (result.code !== 0) {
      expect(result.code).toBe(4);
      const envelope = result.json<{ error: { message: string; hint: string } }>();
      expect(envelope.error.message).toMatch(/brief produced an invalid blueprint/);
      expect(envelope.error.hint).toMatch(/Rephrase the brief/);
    }
  });

  it('refuses unsafe folders and an existing exploration unless --force', async () => {
    const unsafe = await run(BRIEF, '--out', 'docs');
    expect(unsafe.code).not.toBe(0);
    expect(unsafe.json<{ error: { code: string } }>().error.code).toBe('unsafe_path');

    expect((await run(BRIEF, '--slug', 'again')).code).toBe(0);
    const conflict = await run(BRIEF, '--slug', 'again');
    expect(conflict.json<{ error: { code: string; hint: string } }>().error).toMatchObject({
      code: 'conflict',
    });
    const forced = await run(BRIEF, '--slug', 'again', '--force');
    expect(forced.json<{ data: { replaced: boolean } }>().data.replaced).toBe(true);
  });
});

describe('quick helpers', () => {
  it('derives slugs from names', () => {
    expect(slugFromName('Field Visits Tracker')).toBe('field-visits-tracker');
    expect(slugFromName('42 Ideas!')).toBe('idea-42-ideas');
    expect(slugFromName('Café Résumé')).toBe('cafe-resume');
    expect(slugFromName('!!!')).toBeNull();
  });

  it('escapes names and links in the launcher', () => {
    const html = launcherHtml('"><script>alert(1)</script>', '../p/index.html#bp=1.a"b<c');
    expect(html).not.toMatch(/<script>alert/);
    expect(html).toContain('&quot;&gt;&lt;script&gt;');
    expect(html).toContain('#bp=1.a&quot;b&lt;c');
  });
});
