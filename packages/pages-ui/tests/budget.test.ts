// @vitest-environment node
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { build, type Rollup } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../../..');
const HOSTS = ['page', 'doc'] as const;
type Host = (typeof HOSTS)[number];
const JS_GZIP_BUDGET = 120 * 1024;
// Default 20 KB and it stays. Per-host overrides at the measured size + 5 %
// (2026-10-24: page 24,242 B, doc 24,490 B gzip). Texuli component CSS
// (~23 KB gz) replaces the former UI CSS; eager/lazy split measured; CSS diet
// tracked as a follow-up. The sum covers every emitted stylesheet: the first
// screen loads only the entry one (page 4,166 B, doc 4,414 B); the rest are
// lazy block and chart families, with no repeated rule beyond `.tx-sr-only`.
const CSS_GZIP_BUDGETS: Record<Host, number> = { page: 25_454, doc: 25_714 };

interface HostBuild {
  chunks: Rollup.OutputChunk[];
  assets: Rollup.OutputAsset[];
}

let fixture = '';
const builds = new Map<Host, HostBuild>();
const gzip = (source: string | Uint8Array) => gzipSync(source, { level: 9 }).length;

/** Entry plus chunks reached only through static imports, as the first screen downloads. */
export function staticChunks(chunks: readonly Rollup.OutputChunk[], entryFile: string) {
  const byFile = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  const seen = new Set<string>();
  const queue = [entryFile];
  while (queue.length) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    const chunk = byFile.get(file);
    if (!chunk) throw new Error(`missing statically imported chunk ${file}`);
    seen.add(file);
    queue.push(...chunk.imports);
  }
  return [...seen].map((file) => byFile.get(file) as Rollup.OutputChunk);
}

async function writeHostFixture(host: Host) {
  const entryImport = host === 'page' ? '@protoyard/pages-ui/page' : '@protoyard/pages-ui/doc';
  const component = host === 'page' ? 'PageApp' : 'DocApp';
  const prop = host === 'page' ? 'page' : 'doc';
  await writeFile(
    join(fixture, `${host}.html`),
    `<!doctype html><html><body><div id="app"></div><script type="module" src="./${host}.ts"></script></body></html>`
  );
  await writeFile(
    join(fixture, `${host}.ts`),
    `import { mount } from 'svelte';\nimport { ${component} } from '${entryImport}';\nimport '@protoyard/pages-ui/styles.css';\nmount(${component}, { target: document.getElementById('app') as HTMLElement, props: { ${prop}: {} } as never });\n`
  );
}

beforeAll(async () => {
  fixture = await mkdtemp(join(tmpdir(), 'protoyard-pages-budget-'));
  const scope = join(fixture, 'node_modules', '@protoyard');
  await mkdir(scope, { recursive: true });
  for (const name of [
    'pages-ui',
    'pages',
    'blocks',
    'blocks-ui',
    'ui',
    'renderer-svelte',
    'blueprint',
    'core',
  ]) {
    await symlink(join(ROOT, 'packages', name), join(scope, name), 'dir');
  }
  await symlink(join(ROOT, 'node_modules/svelte'), join(fixture, 'node_modules/svelte'), 'dir');

  const previousEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    for (const host of HOSTS) {
      await writeHostFixture(host);
      const result = await build({
        mode: 'production',
        root: fixture,
        configFile: false,
        logLevel: 'silent',
        plugins: [svelte()],
        build: {
          outDir: join(fixture, 'dist', host),
          emptyOutDir: true,
          rollupOptions: { input: join(fixture, `${host}.html`) },
        },
      });
      const output = ((Array.isArray(result) ? result : [result]) as Rollup.RollupOutput[]).flatMap(
        (item) => item.output
      );
      builds.set(host, {
        chunks: output.filter((item): item is Rollup.OutputChunk => item.type === 'chunk'),
        assets: output.filter((item): item is Rollup.OutputAsset => item.type === 'asset'),
      });
    }
  } finally {
    process.env.NODE_ENV = previousEnv;
  }
}, 600_000);

afterAll(async () => {
  if (fixture) await rm(fixture, { recursive: true, force: true });
});

describe('page and doc entry budgets (real production Vite builds)', () => {
  it('walks static imports without including dynamic imports', () => {
    const entry = {
      type: 'chunk',
      fileName: 'entry.js',
      imports: ['shell.js'],
      dynamicImports: ['lazy.js'],
    } as Rollup.OutputChunk;
    const shell = { ...entry, fileName: 'shell.js', imports: [], dynamicImports: [] };
    const lazy = { ...entry, fileName: 'lazy.js', imports: [], dynamicImports: [] };
    expect(staticChunks([entry, shell, lazy], 'entry.js').map((chunk) => chunk.fileName)).toEqual([
      'entry.js',
      'shell.js',
    ]);
  });

  it.each(HOSTS)('keeps the %s initial JS and CSS inside their budgets', (host) => {
    const output = builds.get(host);
    expect(output, `${host} production build`).toBeDefined();
    const chunks = output?.chunks ?? [];
    const entry = chunks.find((chunk) => chunk.isEntry);
    expect(entry, `${host} entry chunk`).toBeDefined();
    const initial = staticChunks(chunks, entry?.fileName ?? '');
    const jsBytes = initial.reduce((total, chunk) => total + gzip(chunk.code), 0);
    const cssBytes = (output?.assets ?? [])
      .filter((asset) => asset.fileName.endsWith('.css'))
      .reduce((total, asset) => total + gzip(asset.source), 0);
    const modules = initial
      .flatMap((chunk) => chunk.moduleIds)
      .map((id) => id.replaceAll('\\', '/'));

    console.info(
      `${host} entry: ${jsBytes} B JS gzip, ${cssBytes} B CSS gzip (static import graph)`
    );
    expect(initial.length, `${host} static JS chunks`).toBeGreaterThan(0);
    expect(jsBytes, `${host} initial JS gzip`).toBeLessThanOrEqual(JS_GZIP_BUDGET);
    expect(cssBytes, `${host} initial CSS gzip`).toBeLessThanOrEqual(CSS_GZIP_BUDGETS[host]);

    const forbidden = [
      ['crud/app', /\/crud\/src\/(?:app|screens)\//],
      ['Faker', /@faker-js\/faker/],
      ['player worker', /\/player\/src\/.*worker|generate-world.*worker/],
    ] as const;
    for (const [label, pattern] of forbidden) {
      expect(
        modules.filter((id) => pattern.test(id)),
        `${host} excludes ${label}`
      ).toEqual([]);
    }
  });
});
