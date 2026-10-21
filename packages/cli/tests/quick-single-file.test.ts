// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setQuickPlayerLocator } from '../src/commands/quick/index.ts';
import {
  createPlayerAssetsManifest,
  readPlayerAssetsManifest,
} from '../src/lib/quick/player-assets.ts';
import {
  buildSingleFile,
  escapeScriptText,
  inertJson,
  QUICK_SINGLE_FILE_BUDGET_BYTES,
  rewriteChunk,
  SINGLE_FILE_BASE,
  SINGLE_FILE_CSP,
} from '../src/lib/quick/single-file.ts';
import { cli, createWorkspace, type TempWorkspace } from './helpers.ts';

const REPO = fileURLToPath(new URL('../../..', import.meta.url));
const ANALYTICS = join(REPO, 'blueprints/quick/analytics.json');

/** Text of every `<script type="text/plain" data-py-chunk>` keyed by chunk name. */
function chunksOf(html: string): Map<string, string> {
  return new Map(
    [
      ...html.matchAll(/<script type="text\/plain" data-py-chunk="([^"]+)">([\s\S]*?)<\/script>/g),
    ].map(([, name, text]) => [name as string, text as string])
  );
}

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
  writeFileSync(join(dir, 'assets', 'lazy-B2.js'), 'export const t=()=>import(`./index-A1.js`);\n');
  writeFileSync(join(dir, 'assets', 'generate.worker-Z.js'), 'self.onmessage=()=>{};\n');
  writeFileSync(join(dir, 'assets', 'index-C3.css'), 'body{color:red}\n');
  writeFileSync(join(dir, 'assets', 'lazy-D4.css'), '.lazy{color:blue}\n');
}

describe('single-file building blocks', () => {
  it('breaks </script and <!-- in raw script text without changing string values', () => {
    const source = 'const a="</script>",b=`<!-- c`,r=/<\\/script>/;';
    const escaped = escapeScriptText(source);
    expect(escaped).not.toMatch(/<\/script/i);
    expect(escaped).not.toContain('<!--');
    // The values survive: evaluate both versions and compare.
    const run = (code: string) => new Function(`${code}return [a,b,r.source];`)();
    expect(run(escaped)).toEqual(run(source));
  });

  it('makes the blueprint inert JSON that parses back to the same value', () => {
    const value = { name: 'x </script><!-- y', note: 'line sep' };
    const inert = inertJson(JSON.stringify(value));
    expect(inert).not.toContain('<');
    expect(inert).not.toContain(' ');
    expect(JSON.parse(inert)).toEqual(value);
  });

  it('rewrites only known chunk imports, stylesheet preloads and import.meta.url', () => {
    const chunks = new Set(['a-1.js', 'b-2.js']);
    const out = rewriteChunk(
      'import"./a-1.js";import(`./b-2.js`);const k="./other.js",d=["./a.css","./a-1.js"];const resolve=function(dep, importerUrl){return new URL(dep, importerUrl).href};new URL("x",import.meta.url)',
      'a-1.js',
      chunks,
      new Set(['a.css'])
    );
    expect(out).toContain('import"py:assets/a-1.js"');
    expect(out).toContain('import(`py:assets/b-2.js`)');
    expect(out).toContain('"./other.js"'); // not a chunk: untouched
    expect(out).toContain('"./a.css-inlined"');
    expect(out).toContain(JSON.stringify(`${SINGLE_FILE_BASE}assets/a-1.js`));
    expect(out).toContain('function(){return "data:application/javascript,"}');
    expect(out).not.toContain('.invalid');
    expect(out).not.toContain('import.meta.url');
  });

  it('assembles one file: CSP, inlined CSS, inert blueprint, chunks, no service worker or links', async () => {
    const dir = join(REPO, 'tmp', `single-file-fixture-${process.pid}`);
    fixturePlayerApp(dir);
    const blueprint = { name: 'Fixture </script> desk' };
    const result = await buildSingleFile({
      playerDir: dir,
      blueprintJson: JSON.stringify(blueprint),
      title: blueprint.name,
    }).finally(() => rmSync(dir, { recursive: true, force: true }));
    const { html } = result;
    expect(result).toMatchObject({ chunks: 2, stylesheets: 2 });
    expect(result.bytes).toBe(Buffer.byteLength(html));
    expect(html).toContain(
      `<meta http-equiv="Content-Security-Policy" content="${SINGLE_FILE_CSP}">`
    );
    expect(html).not.toContain("default-src 'self'");
    expect(html).not.toMatch(/<link\b/);
    expect(html).not.toMatch(/<script[^>]+\bsrc=/);
    expect(html).not.toContain('serviceWorker.register');
    expect(html).toContain('<script>window.__appearance = 1;</script>');
    expect(html).toContain('<title>Fixture &lt;/script&gt; desk</title>');
    // Linked stylesheet first, lazy one after.
    expect(html.indexOf('data-py-style="index-C3.css"')).toBeLessThan(
      html.indexOf('data-py-style="lazy-D4.css"')
    );
    const chunks = chunksOf(html);
    expect([...chunks.keys()].sort()).toEqual(['index-A1.js', 'lazy-B2.js']); // worker left out
    expect(chunks.get('index-A1.js')).toContain('from"py:assets/lazy-B2.js"');
    expect(chunks.get('index-A1.js')).not.toMatch(/<\/script/i);
    const json =
      /<script type="application\/json" id="protoyard-blueprint">([\s\S]*?)<\/script>/.exec(
        html
      )?.[1];
    expect(JSON.parse(json ?? 'null')).toEqual(blueprint);
    // The bootstrap starts the entry through the import map.
    expect(html).toContain('import "py:assets/index-A1.js";');
    expect(html).toContain('vite:preloadError');
    expect(html).not.toContain('.invalid');
    expect(html).toContain('data:application/javascript,');
  });
});

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

describe('single file from the real player build', () => {
  const playerDir = join(REPO, 'packages/player/dist/app');
  const ensureBuild = () => {
    if (existsSync(join(playerDir, 'index.html'))) return;
    const built = spawnSync('pnpm', ['--filter', '@protoyard/player', 'build'], {
      cwd: REPO,
      encoding: 'utf8',
    });
    if (built.status !== 0) throw new Error(`player build failed:\n${built.stderr}${built.stdout}`);
  };

  it('stays under the budget for every catalog blueprint', async () => {
    ensureBuild();
    const names = readdirSync(join(REPO, 'blueprints')).filter((name) => name.endsWith('.json'));
    expect(names.length).toBeGreaterThanOrEqual(40);
    let largest = 0;
    for (const name of names) {
      const result = await buildSingleFile({
        playerDir,
        blueprintJson: readFileSync(join(REPO, 'blueprints', name), 'utf8'),
        title: name,
      });
      largest = Math.max(largest, result.bytes);
      expect(result.bytes, name).toBeLessThanOrEqual(QUICK_SINGLE_FILE_BUDGET_BYTES);
    }
    expect(largest).toBeGreaterThan(1024 * 1024); // the real player, not a stub
  }, 300_000);

  it('opens from file:// with no server, boots the blueprint and keeps its data', async () => {
    ensureBuild();
    let chromium: typeof import('@playwright/test').chromium;
    try {
      ({ chromium } = await import('@playwright/test'));
    } catch (error) {
      console.warn(
        `quick-single-file: Playwright unavailable (${String(error)}); browser check skipped`
      );
      return;
    }
    const blueprintJson = readFileSync(join(REPO, 'blueprints/crm.json'), 'utf8');
    const { html } = await buildSingleFile({ playerDir, blueprintJson, title: 'Northstar CRM' });
    // Model an artifact skeleton that strips the CSP meta; the output must
    // still make no request except data URLs because its preload helper is inert.
    const pageHtml = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '');
    const file = resolve(REPO, 'tmp', `single-file-crm-${process.pid}.html`);
    writeFileSync(file, pageHtml);
    let browser: Awaited<ReturnType<typeof chromium.launch>>;
    try {
      browser = await chromium.launch();
    } catch (error) {
      console.warn(
        `quick-single-file: Chromium unavailable (${String(error).split('\n')[0]}); browser check skipped`
      );
      return;
    }
    try {
      const page = await browser.newPage();
      const problems: string[] = [];
      const networkRequests: string[] = [];
      page.on('request', (request) => {
        if (/^https?:/.test(request.url())) networkRequests.push(request.url());
      });
      page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
      const ready = async () => {
        await page.waitForSelector('html[data-protoyard-ready="1"]', {
          state: 'attached',
          timeout: 60_000,
        });
        return page.evaluate(() => {
          const world = performance.getEntriesByName('protoyard:world-ready', 'mark')[0] as
            | PerformanceMark
            | undefined;
          return (world?.detail as { seeded?: boolean } | null)?.seeded ?? null;
        });
      };
      await page.goto(pathToFileURL(file).href);
      expect(await ready()).toBe(true);
      await expect
        .poll(() => page.locator('h1').first().textContent())
        .toBe(JSON.parse(blueprintJson).name);
      // A lazy screen (another chunk, styles already inline) renders too.
      await page.getByRole('link', { name: 'Contacts' }).first().click();
      await expect.poll(() => page.locator('h1').first().textContent()).toBe('Contacts');
      // IndexedDB works on file://: a reload reuses the stored world.
      await page.reload();
      expect(await ready()).toBe(false);
      const workers = await page.evaluate(async () => {
        // file:// has no service workers at all; getRegistrations() then throws.
        try {
          return navigator.serviceWorker
            ? (await navigator.serviceWorker.getRegistrations()).length
            : 0;
        } catch {
          return 0;
        }
      });
      expect(workers).toBe(0);
      expect(networkRequests).toEqual([]);
      expect(problems).toEqual([]);
    } finally {
      await browser.close();
      rmSync(file, { force: true });
    }
  }, 300_000);
});
