import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  truncateSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ARTIFACT_LIMITS,
  ARTIFACT_MANIFEST,
  ARTIFACT_PAGE,
  ARTIFACT_PAGE_STYLE,
  type ArtifactPackManifest,
  checkTextAsset,
  contentTypeFor,
  firstSentence,
  iconForCategory,
  packArtifact,
  planBatches,
  publishArguments,
  transformPage,
} from '../src/lib/artifact-pack.ts';
import { digestDirectory } from '../src/lib/checksum.ts';
import { buildDigest } from '../src/lib/publish-ledger.ts';

/** A build's index.html the way Vite writes it with the relative base. */
const INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <script>(function(){document.documentElement.dataset.pyMode='light';})();</script>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="description" content="Fictional pipeline &amp; deals." />
    <link rel="icon" href="./favicon.svg" type="image/svg+xml" />
    <title>Pipeline CRM</title>
    <meta name="protoyard:prototype" content="example.crm">
    <script type="module" crossorigin src="./assets/index-abc.js"></script>
    <link rel="modulepreload" crossorigin href="./assets/chunk-def.js">
    <link rel="stylesheet" crossorigin href="./assets/index-ghi.css">
  </head>
  <body>
    <div id="app"></div>
  </body>
</html>
`;

const EXPECTED_PAGE = [
  '<title>Pipeline CRM</title>',
  `<style>\n${ARTIFACT_PAGE_STYLE}\n</style>`,
  "<script>(function(){document.documentElement.dataset.pyMode='light';})();</script>",
  '<meta name="description" content="Fictional pipeline &amp; deals.">',
  '<meta name="protoyard:prototype" content="example.crm">',
  '<link rel="stylesheet" crossorigin href="assets/index-ghi.css">',
  '<link rel="modulepreload" crossorigin href="assets/chunk-def.js">',
  '<script type="module" crossorigin src="assets/index-abc.js"></script>',
  '<div id="app"></div>',
  '',
].join('\n');

function page(head: string, body = '<div id="app"></div>'): string {
  return `<!doctype html><html><head><title>Demo</title>${head}<script type="module" src="./assets/index.js"></script></head><body>${body}</body></html>`;
}

function reasons(html: string): string[] {
  return transformPage(html).issues.map((issue) => issue.reason);
}

describe('transformPage', () => {
  it('turns a Vite index.html into Artifact body content, in contract order', () => {
    const result = transformPage(INDEX_HTML);
    expect(result.issues).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.title).toBe('Pipeline CRM');
    expect(result.page).toBe(EXPECTED_PAGE);
    // Scripts first, then links in source order.
    expect(result.references).toEqual([
      'assets/index-abc.js',
      'assets/chunk-def.js',
      'assets/index-ghi.css',
    ]);
    expect(result.page).not.toMatch(/<!doctype|<html|<head|<body|charset|viewport|rel="icon"/i);
  });

  it('defines light and dark tokens and an explicit body background', () => {
    expect(ARTIFACT_PAGE_STYLE).toContain(':root{--py-artifact-background:#fafafa');
    expect(ARTIFACT_PAGE_STYLE).toContain(
      '@media (prefers-color-scheme: dark){:root:not([data-theme="light"])'
    );
    expect(ARTIFACT_PAGE_STYLE).toContain(':root[data-theme="dark"]');
    expect(ARTIFACT_PAGE_STYLE).toMatch(/html,body\{[^}]*background:/);
  });

  it('requires a title and warns when it is longer than four words', () => {
    expect(reasons(INDEX_HTML.replace('<title>Pipeline CRM</title>', ''))).toContain(
      'index.html has no <title>; the Artifact page needs a non-empty title'
    );
    const long = transformPage(INDEX_HTML.replace('Pipeline CRM', 'A very long pipeline CRM name'));
    expect(long.issues).toEqual([]);
    expect(long.warnings[0]).toMatch(/longer than 4 words/);
  });

  it('refuses paths that would not resolve inside the Artifact', () => {
    expect(reasons(page('<base href="/x/">'))).toContain(
      'index.html has a <base> element; relative asset paths would resolve elsewhere'
    );
    expect(reasons(page('<link rel="stylesheet" href="/assets/a.css">'))).toContain(
      'stylesheet href "/assets/a.css" is root-absolute; build with the relative base ./'
    );
    expect(reasons(page('<link rel="modulepreload" href="../outside.js">'))).toContain(
      'preload href "../outside.js" leaves the build folder'
    );
    expect(reasons(page('<script src="javascript:alert(1)"></script>'))).toContain(
      'script src "javascript:alert(1)" is not a file path the Artifact can serve'
    );
  });

  it('allows only the CDN allow-list for scripts and Google Fonts for stylesheets', () => {
    expect(reasons(page('<script src="https://evil.example/x.js"></script>'))[0]).toMatch(
      /^script "https:\/\/evil\.example\/x\.js" is external; the Artifact page loads scripts only from/
    );
    expect(reasons(page('<script src="//cdn.example/x.js"></script>'))).toHaveLength(1);
    expect(
      transformPage(
        page('<script src="https://cdnjs.cloudflare.com/ajax/libs/x/1.0.0/x.js"></script>')
      ).issues
    ).toEqual([]);
    expect(
      transformPage(
        page('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">')
      ).issues
    ).toEqual([]);
    expect(reasons(page('<link rel="stylesheet" href="https://cdn.example/a.css">'))).toEqual([
      'stylesheet "https://cdn.example/a.css" is external; the Artifact page loads stylesheets only from Google Fonts',
    ]);
    expect(reasons(page('<link rel="preload" href="https://cdn.example/f.woff2">'))).toEqual([
      'preload "https://cdn.example/f.woff2" is external; the Artifact page fetches only its own files',
    ]);
    expect(
      reasons(page('', '<div id="app"></div><img src="https://tracker.example/p.gif">'))
    ).toEqual([
      '<img> src "https://tracker.example/p.gif" is external; the Artifact page fetches only its own files',
    ]);
  });

  it('refuses offline builds and a missing entry', () => {
    expect(reasons(page('<script>navigator.serviceWorker.register("./sw.js")</script>'))).toContain(
      'an inline script registers a service worker; build without offline support'
    );
    expect(reasons(page('<link rel="manifest" href="./app.webmanifest">'))).toContain(
      'index.html links a web app manifest; build without offline support'
    );
    expect(
      reasons('<html><head><title>Demo</title></head><body><div id="app"></div></body></html>')
    ).toContain('index.html loads no module script; the prototype entry is missing');
  });

  it('moves body scripts next to the others instead of duplicating them', () => {
    const result = transformPage(
      page('', '<div id="app"></div><script type="module" src="./assets/late.js"></script>')
    );
    expect(result.page.match(/assets\/late\.js/g)).toHaveLength(1);
    expect(result.page.trimEnd().endsWith('<div id="app"></div>')).toBe(true);
  });
});

describe('asset checks', () => {
  it('allows standard web media types and refuses source maps and unknown files', () => {
    expect(contentTypeFor('assets/a.js')).toEqual({ type: 'text/javascript', text: true });
    expect(contentTypeFor('fonts/a.WOFF2')).toEqual({ type: 'font/woff2', text: false });
    expect(contentTypeFor('assets/a.js.map')).toBeNull();
    expect(contentTypeFor('assets/a.js.map', { allowSourceMaps: true })?.type).toBe(
      'application/json'
    );
    expect(contentTypeFor('app.webmanifest')).toBeNull();
    expect(contentTypeFor('README')).toBeNull();
  });

  it('refuses external and root-absolute CSS references but keeps relative ones', () => {
    const css = [
      '@import url("https://fonts.googleapis.com/css2?family=Inter");',
      '@import "https://cdn.example/reset.css";',
      '.a{background:url(./img/a.png)}',
      '.b{background:url("https://cdn.example/b.png")}',
      '.c{background:url(/c.png)}',
      '.d{background:url(data:image/png;base64,AAAA)}',
    ].join('\n');
    expect(checkTextAsset('assets/a.css', css).map((issue) => issue.reason)).toEqual([
      '@import "https://cdn.example/reset.css" is external; only Google Fonts stylesheets are allowed',
      'url(https://cdn.example/b.png) is external; the Artifact fetches only its own files',
      'url(/c.png) is root-absolute; build with the relative base ./',
    ]);
  });

  it('refuses service workers and network imports in scripts, not URL strings in data', () => {
    expect(checkTextAsset('assets/a.js', 'navigator.serviceWorker.register("./sw.js")')).toEqual([
      { path: 'assets/a.js', reason: 'registers a service worker; build without offline support' },
    ]);
    expect(
      checkTextAsset('assets/a.js', 'import("https://esm.example/x.js");').map((i) => i.reason)
    ).toEqual(['imports "https://esm.example/x.js" over the network; bundle it instead']);
    expect(checkTextAsset('assets/a.js', 'import x from "//esm.example/x.js";')).toHaveLength(1);
    expect(
      checkTextAsset(
        'assets/a.js',
        'const site = "https://acme.example"; const ns = "http://www.w3.org/2000/svg";'
      )
    ).toEqual([]);
  });
});

describe('planBatches', () => {
  const files = (count: number, bytes = 10) =>
    Array.from({ length: count }, (_, index) => ({ path: `f${index}.js`, bytes }));

  it('puts everything in one publish when it fits, counting the page', () => {
    const { batches, issues } = planBatches(100, files(254));
    expect(issues).toEqual([]);
    expect(batches).toHaveLength(1);
    expect(batches[0]?.files).toHaveLength(254);
    expect(batches[0]?.bytes).toBe(100 + 2540);
  });

  it('splits by the 255-file and 64 MB publish limits', () => {
    const byCount = planBatches(1, files(300)).batches;
    expect(byCount.map((batch) => batch.files.length)).toEqual([254, 46]);
    const big = ARTIFACT_LIMITS.bytesPerPublish / 2;
    const bySize = planBatches(1, files(3, big)).batches;
    expect(bySize.map((batch) => batch.files.length)).toEqual([1, 2]);
    expect(bySize.every((batch) => batch.bytes <= ARTIFACT_LIMITS.bytesPerPublish)).toBe(true);
  });

  it('refuses a pack over the version limits', () => {
    expect(planBatches(1, files(511)).issues[0]?.reason).toBe(
      '512 files exceed the 511-file limit of one Artifact version'
    );
    expect(planBatches(1, files(5, 60_000_000)).issues[0]?.reason).toMatch(
      /^300000001 bytes exceed the 256000000-byte limit/
    );
  });
});

describe('manifest metadata', () => {
  it('maps categories to one generic icon word and keeps the first sentence', () => {
    expect(iconForCategory('sales')).toBe('briefcase');
    expect(iconForCategory('Analytics')).toBe('chart');
    expect(iconForCategory('general')).toBe('app');
    expect(iconForCategory(undefined)).toBe('app');
    expect(firstSentence('A team chat.  With agents! And more.')).toBe('A team chat.');
    expect(firstSentence('No period at all')).toBe('No period at all');
    expect(firstSentence('Version 1.2 ships today. Then more.')).toBe('Version 1.2 ships today.');
  });
});

describe('packArtifact', () => {
  let root: string;
  let dist: string;
  let out: string;

  const write = (path: string, content: string | Buffer) => {
    const full = join(dist, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  };
  const pack = (extra: Partial<Parameters<typeof packArtifact>[0]> = {}) =>
    packArtifact({
      distDir: dist,
      outDir: out,
      slug: 'crm-demo',
      manifest: {
        id: 'example.crm',
        name: 'Pipeline CRM',
        description: 'A fictional CRM. Deals and contacts.',
        category: 'sales',
      },
      ...extra,
    });

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'protoyard-artifact-pack-'));
    dist = join(root, 'dist');
    out = join(root, 'artifact');
    write('index.html', INDEX_HTML);
    write('assets/index-abc.js', 'import("./chunk-def.js");');
    write('assets/chunk-def.js', 'export const x = 1;');
    write('assets/index-ghi.css', '.a{background:url(./bg.png)}');
    write('assets/bg.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    write('favicon.svg', '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    write('.protoyard-out', '{}');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('writes the page, every asset and a complete manifest', async () => {
    const result = await pack();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const manifest = JSON.parse(
      readFileSync(join(out, ARTIFACT_MANIFEST), 'utf8')
    ) as ArtifactPackManifest;
    expect(manifest).toEqual(result.manifest);
    expect(readFileSync(join(out, ARTIFACT_PAGE), 'utf8')).toBe(EXPECTED_PAGE);
    expect(manifest).toMatchObject({
      format: 'protoyard.artifact-pack',
      formatVersion: 1,
      slug: 'crm-demo',
      manifestId: 'example.crm',
      title: 'Pipeline CRM',
      description: 'A fictional CRM.',
      icon: 'briefcase',
      capabilities: null,
      warnings: [],
    });
    expect(manifest.page).toEqual({
      path: 'page.html',
      bytes: Buffer.byteLength(EXPECTED_PAGE),
      sha256: createHash('sha256').update(EXPECTED_PAGE).digest('hex'),
    });
    expect(manifest.files.map((file) => [file.path, file.contentType])).toEqual([
      ['assets/bg.png', 'image/png'],
      ['assets/chunk-def.js', 'text/javascript'],
      ['assets/index-abc.js', 'text/javascript'],
      ['assets/index-ghi.css', 'text/css'],
      ['favicon.svg', 'image/svg+xml'],
    ]);
    for (const file of manifest.files) {
      const copied = readFileSync(join(out, file.path));
      expect(copied.length).toBe(file.bytes);
      expect(createHash('sha256').update(copied).digest('hex')).toBe(file.sha256);
    }
    expect(manifest.buildSha256).toBe(buildDigest(await digestDirectory(dist)));
    expect(manifest.batches).toEqual([
      { index: 1, files: manifest.files.map((file) => file.path), bytes: manifest.totalBytes },
    ]);
    expect(existsSync(join(out, '.protoyard-out'))).toBe(false);
  });

  it('builds the exact Artifact publish arguments', async () => {
    const result = await pack({ capabilities: { db: {}, user: {} } });
    if (!result.ok) throw new Error('pack failed');
    const args = publishArguments(result.manifest, out);
    expect(args.file_path).toBe(join(out, 'page.html'));
    expect(args.files['assets/index-abc.js']).toBe(join(out, 'assets', 'index-abc.js'));
    expect(Object.keys(args.files)).toHaveLength(5);
    expect(args).toMatchObject({ icon: 'briefcase', description: 'A fictional CRM.' });
    expect(args.capabilities).toEqual({ db: {}, user: {} });
    expect(() => publishArguments(result.manifest, out, 2)).toThrow(/No batch 2/);
    const plain = await pack();
    if (!plain.ok) throw new Error('pack failed');
    expect('capabilities' in publishArguments(plain.manifest, out)).toBe(false);
  });

  it('checks without writing in a dry run', async () => {
    const result = await pack({ dryRun: true });
    expect(result).toMatchObject({ ok: true, written: false });
    expect(existsSync(out)).toBe(false);
  });

  it('reports every broken rule with its path and writes nothing', async () => {
    rmSync(join(dist, 'assets/chunk-def.js'));
    write('assets/index-abc.js.map', '{}');
    write('sw.js', 'self.addEventListener("fetch", () => {});');
    write('assets/remote.css', '.x{background:url(https://cdn.example/x.png)}');
    write('notes.md', '# notes');
    write('assets/huge.js', '');
    truncateSync(join(dist, 'assets/huge.js'), ARTIFACT_LIMITS.textFileBytes + 1);
    const result = await pack();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual([
      {
        path: 'assets/huge.js',
        reason: '16000001 bytes exceed the 16000000-byte limit for a text file',
      },
      {
        path: 'assets/index-abc.js.map',
        reason: 'source maps are not published by default (pass allowSourceMaps to include them)',
      },
      {
        path: 'assets/remote.css',
        reason:
          'url(https://cdn.example/x.png) is external; the Artifact fetches only its own files',
      },
      { path: 'notes.md', reason: 'not a standard web media type the Artifact accepts' },
      { path: 'sw.js', reason: 'a service worker file; build without offline support' },
      { path: 'page.html', reason: 'references "assets/chunk-def.js", which is not in the build' },
    ]);
    expect(existsSync(out)).toBe(false);
  });

  it('includes source maps only when asked', async () => {
    write('assets/index-abc.js.map', '{}');
    const result = await pack({ allowSourceMaps: true });
    expect(result.ok && result.manifest.files.some((file) => file.path.endsWith('.map'))).toBe(
      true
    );
  });

  it('replaces a previous pack but never a foreign or overlapping folder', async () => {
    expect((await pack()).ok).toBe(true);
    writeFileSync(join(out, 'stale.js'), 'old');
    expect((await pack()).ok).toBe(true);
    expect(existsSync(join(out, 'stale.js'))).toBe(false);

    const foreign = join(root, 'foreign');
    mkdirSync(foreign);
    writeFileSync(join(foreign, 'keep.txt'), 'mine');
    const refused = await pack({ outDir: foreign });
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.issues[0]?.reason).toMatch(/not empty and holds no/);
    expect(readFileSync(join(foreign, 'keep.txt'), 'utf8')).toBe('mine');

    const inside = await pack({ outDir: join(dist, 'artifact') });
    expect(!inside.ok && inside.issues.map((issue) => issue.reason)).toContain(
      'the pack folder must not contain, or be inside, the build folder'
    );
  });

  it('fails clearly without a build', async () => {
    rmSync(join(dist, 'index.html'));
    const result = await pack();
    expect(!result.ok && result.issues[0]?.reason).toMatch(
      /^no index.html in .*; build the prototype first$/
    );
  });
});
