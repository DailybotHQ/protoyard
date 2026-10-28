// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { ensurePlayerBuild } from '../../../player/tests/support/serve-dist.ts';
import { chunkReferences, entryGraph } from '../../src/lib/quick/chunk-graph.ts';
import {
  buildSingleFile,
  QUICK_SINGLE_FILE_BUDGET_BYTES,
  QUICK_SINGLE_FILE_ENTRY_BUDGET_BYTES,
  type SingleFileEntry,
  singleFileEntryFor,
} from '../../src/lib/quick/single-file.ts';

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
const styleNames = (html: string) =>
  [...html.matchAll(/<style data-py-style="([^"]+)">/g)].map(([, name]) => name as string);

describe('chunk references', () => {
  it('finds static, dynamic, template and preload-list references to emitted files', () => {
    const code = [
      'import{a}from"./a-1.js";',
      "export*from'./b-2.js';",
      'const l=()=>import("./c-3.js"),t=()=>import(`./d-4.js`);',
      'const m=["./e-5.js","./e-5.css","assets/f-6.css"];',
      'const w=new URL("./generate.worker-Z.js",import.meta.url);',
      'import x from "svelte";const s="./not quoted.js";const h="https://cdn.example/x.js";',
    ].join('');
    const refs = chunkReferences(code);
    expect(refs.js.sort()).toEqual(
      ['a-1.js', 'b-2.js', 'c-3.js', 'd-4.js', 'e-5.js', 'generate.worker-Z.js'].sort()
    );
    expect(refs.css.sort()).toEqual(['e-5.css', 'f-6.css']);
  });
});

/** A built player with an app page and a deck page sharing chunks. */
function fixturePlayer(withDeckPage = true): string {
  const dir = mkdtempSync(join(tmpdir(), 'py-sf-kinds-'));
  mkdirSync(join(dir, 'assets'));
  const page = (entry: string, css: string) =>
    [
      '<!doctype html><html lang="en"><head><meta charset="UTF-8">',
      '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'">',
      '<script>window.__appearance = 1;</script>',
      `<script type="module" crossorigin src="./assets/${entry}"></script>`,
      '<link rel="modulepreload" crossorigin href="./assets/shared-S.js">',
      `<link rel="stylesheet" crossorigin href="./assets/${css}">`,
      '</head><body><div id="app"></div></body></html>',
    ].join('\n');
  writeFileSync(join(dir, 'index.html'), page('index-I.js', 'index-I.css'));
  if (withDeckPage) writeFileSync(join(dir, 'deck.html'), page('deck-D.js', 'deck-D.css'));
  const files: Record<string, string> = {
    'index-I.js':
      'import{s}from"./shared-S.js";const m=["./boot-B.js","./crud-C.js","./crud-C.css","./kind-K.js"];export const go=()=>import("./boot-B.js");export const k=()=>import("./kind-K.js");',
    'deck-D.js':
      'import{s}from"./shared-S.js";const m=["./kind-K.js"];export const k=()=>import("./kind-K.js");',
    'shared-S.js': 'export const s=1;',
    'boot-B.js':
      'import"./crud-C.js";const f=()=>import("./faker-F.js");const w=new URL("./generate.worker-W.js",import.meta.url);',
    'crud-C.js': 'export const crud=1;',
    'faker-F.js': 'export const faker=1;',
    'kind-K.js':
      'const m=["./deck-ui-U.js","./deck-ui-U.css"];export const r=()=>import("./deck-ui-U.js");',
    'deck-ui-U.js': 'export const deckUi=1;',
    'generate.worker-W.js': 'self.onmessage=()=>{};',
    'orphan-O.js': 'export const orphan=1;',
    'index-I.css': '.i{}',
    'deck-D.css': '.d{}',
    'crud-C.css': '.c{}',
    'deck-ui-U.css': '.u{}',
    'orphan-O.css': '.o{}',
  };
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, 'assets', name), text);
  return dir;
}

const temps: string[] = [];
afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});
const fixture = (withDeckPage = true) => {
  const dir = fixturePlayer(withDeckPage);
  temps.push(dir);
  return dir;
};

describe('entry graph', () => {
  it('walks a page through static and dynamic imports, never the worker or orphans', async () => {
    const dir = fixture();
    const files = [
      ...readFileSync(join(dir, 'deck.html'), 'utf8').matchAll(/assets\/([\w.-]+)/g),
    ].map(([, file]) => file as string);
    expect(files).toContain('deck-D.js');
    const read = (file: string) => Promise.resolve(readFileSync(join(dir, 'assets', file), 'utf8'));
    const all = (await import('node:fs')).readdirSync(join(dir, 'assets'));
    const exclude = (file: string) => file.startsWith('generate.worker-');

    const deck = await entryGraph({
      html: readFileSync(join(dir, 'deck.html'), 'utf8'),
      files: all,
      read,
      exclude,
    });
    expect(deck?.entry).toBe('deck-D.js');
    expect(deck?.js.sort()).toEqual(['deck-D.js', 'deck-ui-U.js', 'kind-K.js', 'shared-S.js']);
    expect(deck?.css).toEqual(['deck-D.css', 'deck-ui-U.css']);

    const app = await entryGraph({
      html: readFileSync(join(dir, 'index.html'), 'utf8'),
      files: all,
      read,
      exclude,
    });
    expect(app?.js.sort()).toEqual(
      [
        'boot-B.js',
        'crud-C.js',
        'deck-ui-U.js',
        'faker-F.js',
        'index-I.js',
        'kind-K.js',
        'shared-S.js',
      ].sort()
    );
    expect(app?.css).toEqual(['index-I.css', 'crud-C.css', 'deck-ui-U.css']);
    expect(await entryGraph({ html: '<html></html>', files: all, read })).toBeNull();
  });
});

describe('buildSingleFile with an entry page', () => {
  it('embeds only the deck page graph', async () => {
    const result = await buildSingleFile({
      playerDir: fixture(),
      blueprintJson: '{"kind":"deck"}',
      title: 'Deck',
      entry: 'deck',
    });
    expect(result.entry).toBe('deck');
    expect(chunkNames(result.html).sort()).toEqual([
      'deck-D.js',
      'deck-ui-U.js',
      'kind-K.js',
      'shared-S.js',
    ]);
    expect(styleNames(result.html)).toEqual(['deck-D.css', 'deck-ui-U.css']);
    expect(result.chunks).toBe(4);
    expect(result.stylesheets).toBe(2);
    expect(result.html).toContain('import "py:assets/deck-D.js";');
    expect(result.html).not.toMatch(/crud-C|faker-F|generate\.worker|orphan-O/);
  });

  it('keeps every reachable lazy chunk for an app, and falls back to index.html on an older player', async () => {
    const app = await buildSingleFile({ playerDir: fixture(), blueprintJson: '{}', title: 'App' });
    expect(app.entry).toBe('index');
    expect(chunkNames(app.html)).toEqual(
      expect.arrayContaining(['boot-B.js', 'crud-C.js', 'faker-F.js', 'kind-K.js'])
    );
    expect(chunkNames(app.html)).not.toContain('generate.worker-W.js');

    const fallback = await buildSingleFile({
      playerDir: fixture(false),
      blueprintJson: '{"kind":"deck"}',
      title: 'Deck',
      entry: 'deck',
    });
    expect(fallback.entry).toBe('index');
    expect(chunkNames(fallback.html)).toContain('index-I.js');
  });

  it('chooses the page by blueprint kind, and budgets per page', () => {
    expect(singleFileEntryFor({ name: 'App' })).toBe('index');
    expect(singleFileEntryFor({ kind: 'app' })).toBe('index');
    expect(singleFileEntryFor({ kind: 'deck' })).toBe('deck');
    expect(singleFileEntryFor({ kind: 'page' })).toBe('page');
    expect(singleFileEntryFor({ kind: 'doc' })).toBe('doc');
    expect(singleFileEntryFor({ kind: '../index' })).toBe('index');
    for (const kind of ['deck', 'page', 'doc'] as const) {
      expect(QUICK_SINGLE_FILE_ENTRY_BUDGET_BYTES[kind]).toBe(Math.round(2.65 * 1024 * 1024));
    }
    expect(QUICK_SINGLE_FILE_ENTRY_BUDGET_BYTES.index).toBe(QUICK_SINGLE_FILE_BUDGET_BYTES);
  });
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
    // A kind file is well under an app file: the kind graph only. Measured
    // 2026-10-28 at 0.64 of the app file (the deck stage ships with both).
    for (const kind of ['deck', 'page', 'doc']) {
      if (sizes[kind] !== undefined) expect(sizes[kind]).toBeLessThan(result.bytes * 0.67);
    }
    const embedded = new Set(chunkNames(result.html));
    const screens = filesOf(/\/crud\/src\/screens\//);
    expect(screens.length).toBeGreaterThan(0);
    expect(screens.filter((name) => !embedded.has(name))).toEqual([]);
    expect(filesOf(/@faker-js\/faker/).some((name) => embedded.has(name))).toBe(true);
    expect(result.bytes).toBeLessThanOrEqual(QUICK_SINGLE_FILE_BUDGET_BYTES);
  }, 300_000);

  it('a deck single file opens from file:// and shows the deck with no network', async () => {
    ensureBuild();
    let chromium: typeof import('@playwright/test').chromium;
    try {
      ({ chromium } = await import('@playwright/test'));
    } catch (error) {
      console.warn(
        `single-file-kinds: Playwright unavailable (${String(error)}); browser check skipped`
      );
      return;
    }
    const blueprintJson = readFileSync(join(REPO, 'blueprints/decks/lumen-launch.json'), 'utf8');
    const { html } = await buildSingleFile({
      playerDir: PLAYER,
      blueprintJson,
      title: 'Lumen',
      entry: 'deck',
    });
    const out = resolve(REPO, 'tmp', `single-file-deck-${process.pid}.html`);
    mkdirSync(join(REPO, 'tmp'), { recursive: true });
    writeFileSync(out, html);
    let browser: Awaited<ReturnType<typeof chromium.launch>>;
    try {
      browser = await chromium.launch();
    } catch (error) {
      console.warn(
        `single-file-kinds: Chromium unavailable (${String(error).split('\n')[0]}); browser check skipped`
      );
      return;
    }
    try {
      const page = await browser.newPage();
      const problems: string[] = [];
      const network: string[] = [];
      page.on('request', (request) => {
        if (/^https?:/.test(request.url())) network.push(request.url());
      });
      page.on('pageerror', (error) => problems.push(error.message));
      await page.goto(pathToFileURL(out).href);
      await page.waitForSelector('[data-py-deck-app]', { timeout: 60_000 });
      const slide = await page.locator('[data-py-deck-app]').getAttribute('data-slide-id');
      expect(slide).toBe(JSON.parse(blueprintJson).deck.slides[0].id);
      await page.keyboard.press('ArrowRight');
      await expect
        .poll(() => page.locator('[data-py-deck-app]').getAttribute('data-slide-id'))
        .not.toBe(slide);
      expect(network).toEqual([]);
      expect(problems).toEqual([]);
    } finally {
      await browser.close();
      rmSync(out, { force: true });
    }
  }, 120_000);
});
