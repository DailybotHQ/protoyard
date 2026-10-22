import { mkdir, mkdtemp, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { build, type Rollup } from 'vite';

const ROOT = resolve(import.meta.dirname, '../../..');
const KB = 1024;

export type DeckBuild = { chunks: Rollup.OutputChunk[]; assets: Rollup.OutputAsset[] };

export const gzip = (code: string | Uint8Array) => gzipSync(code, { level: 9 }).byteLength;
export const posix = (id: string) => id.replaceAll('\\', '/');

export async function buildDeckEntry(): Promise<{ dir: string; output: DeckBuild }> {
  const dir = await mkdtemp(join(tmpdir(), 'protoyard-decks-bundle-'));
  try {
    await mkdir(join(dir, 'node_modules/@protoyard'), { recursive: true });
    await symlink(join(ROOT, 'node_modules/svelte'), join(dir, 'node_modules/svelte'), 'dir');
    await writeFile(
      join(dir, 'index.html'),
      '<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="app"></div><script type="module" src="/main.ts"></script></body></html>'
    );
    await writeFile(
      join(dir, 'main.ts'),
      "import { mount } from 'svelte';\nimport { DeckApp } from '@protoyard/decks-ui/app';\nimport '@protoyard/decks-ui/styles.css';\n\nmount(DeckApp, { target: document.getElementById('app')!, props: { deck: { id: 'fixture', title: 'Fixture', slides: [] } } });\n"
    );
    const previousEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    let output: DeckBuild;
    try {
      const result = await build({
        mode: 'production',
        root: dir,
        configFile: false,
        logLevel: 'silent',
        plugins: [svelte()],
        resolve: {
          alias: [
            {
              find: '@protoyard/charts/palette/derive',
              replacement: join(ROOT, 'packages/charts/src/palette/chart-palette.ts'),
            },
            ...(await readdir(join(ROOT, 'packages'))).map((name) => ({
              find: `@protoyard/${name}`,
              replacement: join(ROOT, 'packages', name, 'src'),
            })),
          ],
        },
        build: {
          outDir: join(dir, 'dist'),
          emptyOutDir: true,
          manifest: true,
          rollupOptions: { input: { app: join(dir, 'index.html') } },
        },
      });
      const results = (Array.isArray(result) ? result : [result]) as Rollup.RollupOutput[];
      const entries = results.flatMap((item) => item.output);
      output = {
        chunks: entries.filter((item): item is Rollup.OutputChunk => item.type === 'chunk'),
        assets: entries.filter((item): item is Rollup.OutputAsset => item.type === 'asset'),
      };
    } finally {
      process.env.NODE_ENV = previousEnv;
    }
    return { dir, output };
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
}

export function initialChunks(output: DeckBuild): Rollup.OutputChunk[] {
  const byFile = new Map(output.chunks.map((chunk) => [chunk.fileName, chunk]));
  const entry = output.chunks.find((chunk) => chunk.isEntry);
  if (!entry) throw new Error('Deck build has no entry chunk');
  const seen = new Set<string>();
  const queue = [entry.fileName];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    queue.push(...(byFile.get(file)?.imports ?? []));
  }
  return [...seen].map((file) => byFile.get(file)).filter((chunk) => chunk !== undefined);
}

export function cleanupDeckBuild(dir: string): Promise<void> {
  return rm(dir, { recursive: true, force: true });
}

export const sumGzip = (chunks: readonly Rollup.OutputChunk[]) =>
  chunks.reduce((total, chunk) => total + gzip(chunk.code), 0);
export const cssGzip = (assets: readonly Rollup.OutputAsset[]) =>
  assets
    .filter((asset) => asset.fileName.endsWith('.css'))
    .reduce((total, asset) => total + gzip(asset.source), 0);
export const KB_PER_BYTE = 1 / KB;
