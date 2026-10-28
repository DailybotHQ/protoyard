// @vitest-environment node
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ensurePlayerBuild } from '../../player/tests/support/serve-dist.ts';
import { setQuickPlayerLocator } from '../src/commands/quick/index.ts';
import { ARTIFACT_LIMITS } from '../src/lib/artifact-pack.ts';
import { sha256Text } from '../src/lib/checksum.ts';
import {
  ARTIFACT_DESCRIPTION_MAX_CHARS,
  buildQuickArtifact,
  QUICK_ARTIFACT_FORMAT,
  quickArtifactDescription,
  quickArtifactPublishArguments,
  quickArtifactTitle,
  singleFileToArtifactPage,
} from '../src/lib/quick/artifact.ts';
import {
  createPlayerAssetsManifest,
  readPlayerAssetsManifest,
} from '../src/lib/quick/player-assets.ts';
import { buildSingleFile } from '../src/lib/quick/single-file.ts';
import { cli, createWorkspace, type TempWorkspace } from './helpers.ts';

const REPO = fileURLToPath(new URL('../../..', import.meta.url));
const ANALYTICS = join(REPO, 'blueprints/quick/analytics.json');
const SHA = 'a'.repeat(64);
const ARTIFACT_URL = 'https://claude.ai/artifact/0b5c2a3e-quick-demo';

/** What buildSingleFile writes, in miniature. */
const SINGLE_FILE = [
  '<!doctype html>',
  '<html lang="en">',
  '<head>',
  `<meta http-equiv="Content-Security-Policy" content="default-src 'none'">`,
  '<meta charset="UTF-8">',
  '<meta name="viewport" content="width=device-width">',
  '<meta name="robots" content="noindex">',
  '<title>Old title</title>',
  '<script>window.__appearance = 1;</script>',
  '<style data-py-style="index.css">body{color:red}</style>',
  '</head>',
  '<body>',
  '<div id="app"></div>',
  '<script type="application/json" id="protoyard-blueprint">{"name":"x"}</script>',
  '<script type="text/plain" data-py-chunk="index.js">const s="<img src=\\"https://cdn.example.com/a.png\\">";</script>',
  '<script>/* bootstrap */</script>',
  '</body>',
  '</html>',
  '',
].join('\n');

const input = (overrides: Partial<Parameters<typeof buildQuickArtifact>[0]> = {}) => ({
  singleFileHtml: SINGLE_FILE,
  slug: 'demo',
  blueprint: { name: 'Field Service Inspections Desk Pro', category: 'logistics' },
  blueprintSha256: SHA,
  playerVersion: '1.0.0',
  ...overrides,
});

describe('quick artifact publish arguments', () => {
  it('keeps the title to at most four words, with a fallback', () => {
    expect(quickArtifactTitle('Field Service Inspections Desk Pro')).toBe(
      'Field Service Inspections Desk'
    );
    expect(quickArtifactTitle('  Gym   bookings ')).toBe('Gym bookings');
    expect(quickArtifactTitle('<b> Desk')).toBe('b Desk');
    expect(quickArtifactTitle('— — —')).toBe('Protoyard exploration');
    for (const name of ['One', 'A b c d e f g', 'x'.repeat(80)]) {
      expect(quickArtifactTitle(name).split(' ').length).toBeLessThanOrEqual(
        ARTIFACT_LIMITS.titleWords
      );
    }
  });

  it('describes it in one sentence, labeled simulated when the blueprint has none', () => {
    expect(
      quickArtifactDescription({ name: 'Desk', description: 'Book rooms. Then more text.' })
    ).toBe('Book rooms.');
    expect(quickArtifactDescription({ name: 'Desk' })).toBe(
      'Desk: a playable Protoyard exploration with simulated data.'
    );
    expect(
      quickArtifactDescription({ name: 'Desk', description: 'x'.repeat(5000) }).length
    ).toBeLessThanOrEqual(ARTIFACT_DESCRIPTION_MAX_CHARS);
  });
});

describe('singleFileToArtifactPage', () => {
  const page = singleFileToArtifactPage(SINGLE_FILE, 'Demo desk');

  it('drops the document wrappers and puts the title first', () => {
    expect(page.startsWith('<title>Demo desk</title>\n<style>')).toBe(true);
    for (const wrapper of [/<!doctype/i, /<html\b/i, /<\/?head\b/i, /<\/?body\b/i]) {
      expect(page).not.toMatch(wrapper);
    }
    expect(page).not.toContain('Old title');
  });

  it('drops charset, viewport and the CSP meta, and keeps other metadata', () => {
    expect(page).not.toMatch(/charset|viewport|http-equiv/i);
    expect(page).toContain('<meta name="robots" content="noindex">');
  });

  it('keeps head scripts and styles, the body, and inert script types as written', () => {
    expect(page).toContain('<script>window.__appearance = 1;</script>');
    expect(page).toContain('<style data-py-style="index.css">body{color:red}</style>');
    expect(page).toContain('<div id="app"></div>');
    expect(page).toContain('<script type="application/json" id="protoyard-blueprint">');
    expect(page).toContain('<script type="text/plain" data-py-chunk="index.js">');
    expect(page).toContain('--tx-artifact-background');
  });

  it('escapes the title', () => {
    expect(singleFileToArtifactPage(SINGLE_FILE, 'A <b> & c')).toContain(
      '<title>A &lt;b&gt; &amp; c</title>'
    );
  });
});

describe('buildQuickArtifact', () => {
  it('packs one page with its sha256 and publish arguments, and no issues', () => {
    const pack = buildQuickArtifact(input());
    expect(pack.issues).toEqual([]);
    expect(pack.manifest).toEqual({
      format: QUICK_ARTIFACT_FORMAT,
      formatVersion: 1,
      slug: 'demo',
      blueprintSha256: SHA,
      playerVersion: '1.0.0',
      page: {
        path: 'page.html',
        bytes: Buffer.byteLength(pack.page),
        sha256: sha256Text(pack.page),
      },
      publish: {
        title: 'Field Service Inspections Desk',
        icon: 'truck',
        description:
          'Field Service Inspections Desk Pro: a playable Protoyard exploration with simulated data.',
      },
    });
    expect(quickArtifactPublishArguments(pack.manifest, '/w/x/artifact')).toEqual({
      file_path: '/w/x/artifact/page.html',
      title: 'Field Service Inspections Desk',
      icon: 'truck',
      description: pack.manifest.publish.description,
    });
  });

  it('escapes U+FFFD inside script and style bodies to the same character', () => {
    const html = SINGLE_FILE.replace('const s=', 'const r="\uFFFD";const s=').replace(
      'body{color:red}',
      'body{content:"\uFFFD"}'
    );
    const pack = buildQuickArtifact(input({ singleFileHtml: html }));
    expect(pack.issues).toEqual([]);
    expect(pack.page).not.toContain('\uFFFD');
    expect(pack.page).toContain('const r="\\uFFFD"');
    expect(pack.page).toContain('content:"\\fffd "');
    const chunk = /data-py-chunk="index.js">([\s\S]*?)<\/script>/.exec(pack.page)?.[1] ?? '';
    expect(new Function(`${chunk};return r;`)()).toBe('\uFFFD');
  });

  it('refuses a page over the text file limit', () => {
    const big = SINGLE_FILE.replace(
      '<div id="app"></div>',
      `<div id="app">${'x'.repeat(ARTIFACT_LIMITS.textFileBytes)}</div>`
    );
    const reasons = buildQuickArtifact(input({ singleFileHtml: big })).issues.map((i) => i.reason);
    expect(reasons.some((reason) => reason.includes('text file limit'))).toBe(true);
  });

  it('refuses U+FFFD, network markup, network imports, service workers and a missing body', () => {
    const cases: [string, string][] = [
      [SINGLE_FILE.replace('<div id="app"></div>', '<div>\uFFFD</div>'), 'U+FFFD'],
      [
        SINGLE_FILE.replace(
          '</body>',
          '<script src="https://cdn.example.com/x.js"></script></body>'
        ),
        'network resource',
      ],
      [
        SINGLE_FILE.replace('const s=', 'import("https://cdn.example.com/x.js");const s='),
        'over the network',
      ],
      [
        SINGLE_FILE.replace('/* bootstrap */', 'navigator.serviceWorker.register("sw.js")'),
        'service worker',
      ],
      ['<p>not a document</p>', 'no <head> and <body>'],
    ];
    for (const [html, reason] of cases) {
      const reasons = buildQuickArtifact(input({ singleFileHtml: html })).issues.map(
        (i) => i.reason
      );
      expect(reasons.join(' | '), reason).toContain(reason);
    }
  });
});

/** A small built player app (the shape quick-single-file.test.ts uses). */
function fixturePlayerApp(dir: string) {
  mkdirSync(join(dir, 'assets'), { recursive: true });
  writeFileSync(
    join(dir, 'index.html'),
    [
      '<!doctype html><html lang="en"><head>',
      '<meta charset="UTF-8"><meta name="robots" content="noindex">',
      '<title>Protoyard player</title>',
      '<script type="module" crossorigin src="./assets/index-A1.js"></script>',
      '<link rel="stylesheet" crossorigin href="./assets/index-C3.css">',
      '</head><body><div id="app"></div></body></html>',
    ].join('\n')
  );
  writeFileSync(join(dir, 'assets', 'index-A1.js'), 'export const ready=true;\n');
  writeFileSync(join(dir, 'assets', 'index-C3.css'), 'body{color:red}\n');
}

describe('protoyard quick export --target artifact', () => {
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
  const errorCode = (result: Awaited<ReturnType<typeof run>>) =>
    result.json<{ error: { code: string } }>().error.code;
  const quickJson = (dir: string) =>
    JSON.parse(readFileSync(join(ws.root, dir, 'quick.json'), 'utf8')) as {
      blueprintSha256: string;
      shares: Record<string, unknown>[];
    };

  it('packs the page and its publish arguments, records nothing until a URL is given', async () => {
    const created = await run('--blueprint', ANALYTICS);
    expect(created.code, created.stderr || created.stdout).toBe(0);
    const { slug, dir } = created.json<{ data: { slug: string; dir: string } }>().data;

    const packed = await run('export', slug, '--target', 'artifact');
    expect(packed.code, packed.stderr || packed.stdout).toBe(0);
    const data = packed.json<{
      data: {
        target: string;
        pack: string;
        page: { path: string; bytes: number; sha256: string };
        publish: { file_path: string; title: string; icon: string; description: string };
      };
    }>().data;
    expect(data.target).toBe('artifact');
    expect(data.pack).toBe(`${dir}/artifact`);
    expect(data.page.path).toBe(`${dir}/artifact/page.html`);
    const page = readFileSync(join(ws.root, data.page.path), 'utf8');
    expect(sha256Text(page)).toBe(data.page.sha256);
    expect(Buffer.byteLength(page)).toBe(data.page.bytes);
    expect(data.page.bytes).toBeLessThanOrEqual(ARTIFACT_LIMITS.textFileBytes);
    expect(isAbsolute(data.publish.file_path)).toBe(true);
    expect(data.publish.file_path.endsWith(`${dir}/artifact/page.html`)).toBe(true);
    expect(data.publish.title.split(' ').length).toBeLessThanOrEqual(ARTIFACT_LIMITS.titleWords);
    expect(data.publish.icon).toMatch(/^[a-z-]+$/);
    expect(data.publish.description.length).toBeGreaterThan(0);
    const blueprint = JSON.parse(readFileSync(ANALYTICS, 'utf8')) as { name: string };
    const embedded = /id="protoyard-blueprint">([\s\S]*?)<\/script>/.exec(page)?.[1] ?? 'null';
    expect(JSON.parse(embedded).name).toBe(blueprint.name);
    const manifest = JSON.parse(
      readFileSync(join(ws.root, dir, 'artifact', 'artifact-manifest.json'), 'utf8')
    ) as { blueprintSha256: string };
    expect(manifest.blueprintSha256).toBe(quickJson(dir).blueprintSha256);
    // Packing is not sharing: nothing is recorded yet.
    expect(quickJson(dir).shares).toEqual([]);
    // The pack is derived output: packing again replaces it.
    expect((await run('export', slug, '--target', 'artifact')).code).toBe(0);

    const badUrl = await run(
      'export',
      slug,
      '--target',
      'artifact',
      '--url',
      'https://example.com/a'
    );
    expect(errorCode(badUrl)).toBe('usage');
    expect(quickJson(dir).shares).toEqual([]);

    const recorded = await run('export', slug, '--target', 'artifact', '--url', ARTIFACT_URL);
    expect(recorded.code, recorded.stderr || recorded.stdout).toBe(0);
    expect(recorded.json<{ data: Record<string, unknown> }>().data).toMatchObject({
      target: 'artifact',
      recorded: { url: ARTIFACT_URL, visibility: 'private', sha256: data.page.sha256 },
      shares: 1,
    });
    expect(quickJson(dir).shares).toEqual([
      {
        kind: 'artifact',
        url: ARTIFACT_URL,
        visibility: 'private',
        variant: null,
        sha256: data.page.sha256,
        at: expect.any(String),
      },
    ]);
    // Never the prototype share ledger.
    expect(existsSync(join(ws.root, 'artifacts', 'share', 'ledger.jsonl'))).toBe(false);

    // A page edited after packing is not the page that was packed.
    writeFileSync(join(ws.root, data.page.path), `${page}<!-- edited -->`);
    const stale = await run('export', slug, '--target', 'artifact', '--url', ARTIFACT_URL);
    expect(errorCode(stale)).toBe('validation');
    expect(quickJson(dir).shares).toHaveLength(1);
  });

  it('refuses a missing pack, other targets and flag mixes', async () => {
    const created = await run('--blueprint', ANALYTICS);
    const { slug } = created.json<{ data: { slug: string } }>().data;
    expect(
      errorCode(await run('export', slug, '--target', 'artifact', '--url', ARTIFACT_URL))
    ).toBe('not_found');
    expect(errorCode(await run('export', slug, '--target', 'zip'))).toBe('usage');
    expect(errorCode(await run('export', slug, '--target', 'artifact', '--single-file'))).toBe(
      'usage'
    );
    expect(errorCode(await run('export', slug, '--single-file', '--url', ARTIFACT_URL))).toBe(
      'usage'
    );
    expect(
      errorCode(await run('export', slug, '--target', 'artifact', '--out', 'tmp/a.html'))
    ).toBe('usage');
  });
});

describe('artifact page from the real player build', () => {
  const playerDir = join(REPO, 'packages/player/dist/app');
  // The player's shared helper: one locked production build across test files.
  const ensureBuild = () => ensurePlayerBuild(REPO);

  it('fits every Artifact limit with no issues for every quick example', async () => {
    ensureBuild();
    const dir = join(REPO, 'blueprints', 'quick');
    const names = readdirSync(dir).filter((name) => name.endsWith('.json'));
    expect(names.length).toBeGreaterThanOrEqual(4);
    for (const name of names) {
      const text = readFileSync(join(dir, name), 'utf8');
      const blueprint = JSON.parse(text) as { name: string; description?: string };
      const single = await buildSingleFile({ playerDir, blueprintJson: text, title: name });
      const pack = buildQuickArtifact({
        singleFileHtml: single.html,
        slug: name.replace(/\.json$/, ''),
        blueprint,
        blueprintSha256: SHA,
        playerVersion: '1.0.0',
      });
      expect(pack.issues, name).toEqual([]);
      expect(pack.manifest.page.bytes, name).toBeGreaterThan(1024 * 1024); // the real player
      expect(pack.manifest.page.bytes, name).toBeLessThanOrEqual(ARTIFACT_LIMITS.textFileBytes);
      expect(pack.manifest.publish.title.split(' ').length).toBeLessThanOrEqual(
        ARTIFACT_LIMITS.titleWords
      );
    }
  }, 300_000);

  it('boots inside an Artifact-style document skeleton over http', async () => {
    ensureBuild();
    let chromium: typeof import('@playwright/test').chromium;
    try {
      ({ chromium } = await import('@playwright/test'));
    } catch (error) {
      console.warn(
        `quick-artifact: Playwright unavailable (${String(error)}); browser check skipped`
      );
      return;
    }
    const text = readFileSync(ANALYTICS, 'utf8');
    const single = await buildSingleFile({ playerDir, blueprintJson: text, title: 'analytics' });
    const pack = buildQuickArtifact({
      singleFileHtml: single.html,
      slug: 'analytics',
      blueprint: JSON.parse(text) as { name: string },
      blueprintSha256: SHA,
      playerVersion: '1.0.0',
    });
    // What the Artifact tool adds around page content: doctype, charset and viewport metas.
    const doc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${pack.page}</body></html>`;
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(doc);
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
    try {
      try {
        browser = await chromium.launch();
      } catch (error) {
        console.warn(
          `quick-artifact: Chromium unavailable (${String(error).split('\n')[0]}); browser check skipped`
        );
        return;
      }
      const page = await browser.newPage();
      const problems: string[] = [];
      const outside: string[] = [];
      page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
      page.on('request', (request) => {
        const url = request.url();
        if (!url.startsWith(origin) && !/^(?:blob|data):/.test(url)) outside.push(url);
      });
      page.on('console', (message) => {
        const text = message.text();
        // Vite's preloads of the reserved .invalid base never resolve; avatars are not embedded.
        if (message.type() === 'error' && !/ERR_NAME_NOT_RESOLVED|\.invalid\/|avatars\//.test(text))
          problems.push(`console: ${text}`);
      });
      await page.goto(`${origin}/`);
      await page.waitForSelector('html[data-protoyard-ready="1"]', {
        state: 'attached',
        timeout: 60_000,
      });
      expect(await page.title()).toBe(pack.manifest.publish.title);
      expect(problems).toEqual([]);
      // Only the reserved .invalid host (RFC 6761), which can never resolve.
      expect(
        outside.filter((url) => !url.startsWith('https://protoyard-single-file.invalid/'))
      ).toEqual([]);
    } finally {
      await browser?.close();
      server.close();
    }
  }, 300_000);
});
