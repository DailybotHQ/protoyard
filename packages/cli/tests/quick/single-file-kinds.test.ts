// @vitest-environment node
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ensurePlayerBuild } from '../../../player/tests/support/serve-dist.ts';
import { setQuickPlayerLocator } from '../../src/commands/quick/index.ts';
import {
  createPlayerAssetsManifest,
  readPlayerAssetsManifest,
} from '../../src/lib/quick/player-assets.ts';
import {
  buildSingleFile,
  QUICK_SINGLE_FILE_BUDGET_BYTES,
  QUICK_SINGLE_FILE_ENTRY_BUDGET_BYTES,
  type SingleFileEntry,
  singleFileEntryFor,
} from '../../src/lib/quick/single-file.ts';
import { cli, createWorkspace, type TempWorkspace } from '../helpers.ts';

/**
 * Single-file exports embed only the chunks their player page can reach
 * (T-kinds-single-file-prune): a deck from deck.html carries no CRUD shell,
 * Faker or analytics chunk and stays under the deck budget, while an app from
 * index.html still carries its lazy screens. The real-build checks build the
 * player when it is missing.
 */

const REPO = fileURLToPath(new URL('../../../..', import.meta.url));
const PLAYER = join(REPO, 'packages/player/dist/app');

/** Embedded chunk names, from the `<script type="text/plain" data-py-chunk>` tags. */
const chunkNames = (html: string) =>
  [...html.matchAll(/<script type="text\/plain" data-py-chunk="([^"]+)">/g)].map(
    ([, name]) => name as string
  );

const temps: string[] = [];
afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

describe('single files from the real player build', () => {
  // The player's shared helper: a production build, rebuilt when any kind page is missing.
  const ensureBuild = () => {
    ensurePlayerBuild(REPO);
  };
  /** Emitted files of modules matching `pattern`, from the player's Vite manifest. */
  const filesOf = (pattern: RegExp): string[] => {
    const manifest = JSON.parse(
      readFileSync(join(PLAYER, '.vite', 'manifest.json'), 'utf8')
    ) as Record<string, { file: string }>;
    return Object.entries(manifest)
      .filter(([key]) => pattern.test(key))
      .map(([, chunk]) => chunk.file.replace(/^assets\//, ''));
  };
  const APP_ONLY =
    /\/crud\/src\/|@faker-js\/faker|\/analytics-ui\/src\/|\/analytics\/src\/|\/player\/src\/boot\.ts$/;
  const sizes: Record<string, number> = {};
  afterAll(() => console.info(`[single-file kinds] ${JSON.stringify(sizes)}`));

  const kinds: [SingleFileEntry, string][] = [
    ['deck', 'blueprints/decks/lumen-launch.json'],
    ['page', 'blueprints/pages/tidewater-roasters-landing.json'],
    ['doc', 'blueprints/docs/northwind-quarterly-report.json'],
  ];

  it.each(kinds)(
    'a %s export has no CRUD, Faker or analytics chunk and fits its budget (AC)',
    async (kind, file) => {
      ensureBuild();
      const blueprintJson = readFileSync(join(REPO, file), 'utf8');
      expect(singleFileEntryFor(JSON.parse(blueprintJson))).toBe(kind);
      const result = await buildSingleFile({
        playerDir: PLAYER,
        blueprintJson,
        title: kind,
        entry: kind,
      });
      expect(result.entry).toBe(kind);
      sizes[kind] = result.bytes;
      const embedded = new Set(chunkNames(result.html));
      const forbidden = filesOf(APP_ONLY);
      expect(forbidden.length, 'the build has app-only chunks to compare with').toBeGreaterThan(0);
      expect(forbidden.filter((name) => embedded.has(name))).toEqual([]);
      // Literal markers: Faker's English first names and the CRUD world worker.
      expect(result.html.includes('Aaliyah'), 'Faker data').toBe(false);
      expect(/generate\.worker-/.test(result.html), 'the world worker').toBe(false);
      expect(result.bytes).toBeLessThanOrEqual(QUICK_SINGLE_FILE_ENTRY_BUDGET_BYTES[kind]);
      // Its own renderer is in the file.
      const renderer = kind === 'deck' ? /\/decks-ui\/src\/app\// : /\/pages-ui\/src\/(page|doc)\//;
      expect(
        filesOf(renderer).some((name) => embedded.has(name)),
        'the kind renderer'
      ).toBe(true);
    },
    300_000
  );

  it('an app export still carries its lazy screens and Faker (AC)', async () => {
    ensureBuild();
    const blueprintJson = readFileSync(join(REPO, 'blueprints/crm.json'), 'utf8');
    const result = await buildSingleFile({ playerDir: PLAYER, blueprintJson, title: 'CRM' });
    expect(result.entry).toBe('index');
    sizes.app = result.bytes;
    const embedded = new Set(chunkNames(result.html));
    // An app file never boots a deck, page or doc: no kind renderer or Deck Studio.
    // (This replaces a kind-to-app size ratio that relied on the app file carrying them.)
    const kindRenderers = filesOf(
      /\/decks-ui\/src\/(?:app|studio)\/|\/pages-ui\/src\/(?:page|doc)\//
    );
    expect(kindRenderers.length).toBeGreaterThan(0);
    expect(kindRenderers.filter((name) => embedded.has(name))).toEqual([]);
    const screens = filesOf(/\/crud\/src\/screens\//);
    expect(screens.length).toBeGreaterThan(0);
    expect(screens.filter((name) => !embedded.has(name))).toEqual([]);
    expect(filesOf(/@faker-js\/faker/).some((name) => embedded.has(name))).toBe(true);
    expect(result.bytes).toBeLessThanOrEqual(QUICK_SINGLE_FILE_BUDGET_BYTES);
  }, 300_000);
});

describe('protoyard quick export --single-file', () => {
  const REPO = fileURLToPath(new URL('../../../..', import.meta.url));
  const ANALYTICS = join(REPO, 'blueprints/quick/analytics.json');

  /** A small built player: entry + lazy chunk + worker, CSS, an inline SW registration, a CSP. */
  function fixturePlayerApp(dir: string) {
    mkdirSync(join(dir, 'assets'), { recursive: true });
    writeFileSync(
      join(dir, 'index.html'),
      [
        '<!doctype html><html lang="en"><head>',
        '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'">',
        '<meta charset="UTF-8"><meta name="robots" content="noindex">',
        '<link rel="manifest" href="./manifest.webmanifest">',
        '<script>window.__appearance = 1;</script>',
        '<script>navigator.serviceWorker.register("./sw.js")</script>',
        '<title>Protoyard player</title>',
        '<script type="module" crossorigin src="./assets/index-A1.js"></script>',
        '<link rel="modulepreload" crossorigin href="./assets/lazy-B2.js">',
        '<link rel="stylesheet" crossorigin href="./assets/index-C3.css">',
        '</head><body><div id="app"></div></body></html>',
      ].join('\n')
    );
    writeFileSync(
      join(dir, 'assets', 'index-A1.js'),
      'import{t as n}from"./lazy-B2.js";const d=["./lazy-B2.js","./lazy-D4.css"];const u=new URL("./generate.worker-Z.js",import.meta.url);const s="</script><!-- x";export{n,d,u,s};\n'
    );
    writeFileSync(
      join(dir, 'assets', 'lazy-B2.js'),
      'export const t=()=>import(`./index-A1.js`);\n'
    );
    writeFileSync(join(dir, 'assets', 'generate.worker-Z.js'), 'self.onmessage=()=>{};\n');
    writeFileSync(join(dir, 'assets', 'index-C3.css'), 'body{color:red}\n');
    writeFileSync(join(dir, 'assets', 'lazy-D4.css'), '.lazy{color:blue}\n');
  }

  describe('protoyard quick export --single-file', () => {
    let ws: TempWorkspace;
    let restore: (() => void)[] = [];
    beforeEach(async () => {
      ws = createWorkspace();
      const dir = join(ws.root, 'fixture-player', 'dist', 'app');
      fixturePlayerApp(dir);
      const manifest = await createPlayerAssetsManifest(dir, '1.0.0');
      const player = {
        dir,
        packageDir: join(ws.root, 'fixture-player'),
        version: '1.0.0',
        manifest,
        source: 'repository' as const,
      };
      restore = [
        setQuickPlayerLocator(() => ({ ...player, manifest: readPlayerAssetsManifest(dir) })),
      ];
    });
    afterEach(() => {
      for (const undo of restore.splice(0)) undo();
      ws.cleanup();
    });
    const run = (...args: string[]) => cli(['--root', ws.root, '--json', 'quick', ...args]);

    it('writes <exploration>/<slug>.html and reports its size against the budget', async () => {
      const created = await run('--blueprint', ANALYTICS);
      expect(created.code, created.stderr || created.stdout).toBe(0);
      const { slug, dir } = created.json<{ data: { slug: string; dir: string } }>().data;

      const exported = await run('export', slug, '--single-file');
      expect(exported.code, exported.stderr || exported.stdout).toBe(0);
      const data = exported.json<{ data: Record<string, unknown> }>().data;
      expect(data).toMatchObject({
        slug,
        file: `${dir}/${slug}.html`,
        budgetBytes: QUICK_SINGLE_FILE_BUDGET_BYTES,
        chunks: 2,
        playerVersion: '1.0.0',
      });
      const html = readFileSync(join(ws.root, data.file as string), 'utf8');
      expect(Buffer.byteLength(html)).toBe(data.bytes);
      const embedded = /id="protoyard-blueprint">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? 'null';
      expect(JSON.parse(embedded).name).toBe(JSON.parse(readFileSync(ANALYTICS, 'utf8')).name);

      const again = await run('export', slug, '--single-file');
      expect(again.json<{ error: { code: string } }>().error.code).toBe('conflict');
      expect((await run('export', slug, '--single-file', '--force')).code).toBe(0);

      const toTmp = await run('export', slug, '--single-file', '--out', 'tmp/share/demo.html');
      expect(toTmp.code, toTmp.stderr || toTmp.stdout).toBe(0);
      expect(existsSync(join(ws.root, 'tmp/share/demo.html'))).toBe(true);
      const toSource = await run('export', slug, '--single-file', '--out', 'src/demo.html');
      expect(toSource.json<{ error: { code: string } }>().error.code).toBe('unsafe_path');
      const noFormat = await run('export', slug);
      expect(noFormat.json<{ error: { code: string } }>().error.code).toBe('usage');
    });
  });
});
