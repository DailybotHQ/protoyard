/**
 * Measure the chunks each @protoyard/blocks-ui family adds over a realistic
 * shell. Run with `npx tsx scripts/bench-blocks.ts [--check]`.
 * Results are written to tmp/bench-blocks.json.
 */

import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { build, type Rollup } from 'vite';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const FAMILIES = [
  'root',
  'text',
  'media',
  'data',
  'structure',
  'code',
  'diagram',
  'interactive',
  'map',
  'embed',
] as const;
export type Family = (typeof FAMILIES)[number];

/**
 * Per-family ceilings in gzip bytes added over the shell. The first ceilings were estimates; text,
 * structure, interactive and embed were re-measured on 2026-10-22 (11,984 / 12,552 / 19,056 /
 * 2,166 B) and set to measured + 7 % (the views-bundle rule). Lower them as the families shrink;
 * see docs/PERFORMANCE.md -> Blocks UI families.
 */
export const THRESHOLDS: Readonly<Record<Family, number>> = {
  root: 3000,
  text: 12_800,
  media: 4000,
  data: 5000,
  structure: 13_500,
  code: 6000,
  diagram: 6000,
  interactive: 20_400,
  map: 4000,
  embed: 2_400,
};

export interface ChunkLike {
  fileName: string;
  imports: string[];
  code: string;
  modules?: Record<string, { renderedLength: number }>;
}

/** Return the static chunks a new lazy import adds after shell chunks are loaded. */
export function addedChunkClosure(
  chunks: readonly ChunkLike[],
  startFile: string,
  alreadyLoaded: ReadonlySet<string>
) {
  const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  const visited = new Set<string>();
  const pending = [startFile];
  while (pending.length) {
    const name = pending.pop() as string;
    if (visited.has(name) || alreadyLoaded.has(name)) continue;
    visited.add(name);
    for (const imported of byName.get(name)?.imports ?? []) pending.push(imported);
  }
  return [...visited].map((name) => byName.get(name) as ChunkLike);
}

export function gateFamilies(sizes: Readonly<Record<string, number>>) {
  return Object.entries(THRESHOLDS).map(([family, limitBytes]) => {
    const bytes = sizes[family];
    return {
      family,
      bytes: bytes ?? Number.POSITIVE_INFINITY,
      limitBytes,
      ok: bytes !== undefined && bytes <= limitBytes,
    };
  });
}

const gzip = (code: string) => gzipSync(code, { level: 9 }).length;

async function fixtureDir() {
  await mkdir(join(ROOT, 'tmp'), { recursive: true });
  const dir = await mkdtemp(join(ROOT, 'tmp', 'bench-blocks-'));
  const scope = join(dir, 'node_modules', '@protoyard');
  await mkdir(scope, { recursive: true });
  for (const name of ['blocks-ui', 'blocks', 'ui', 'renderer-svelte']) {
    await symlink(join(ROOT, 'packages', name), join(scope, name), 'dir');
  }
  await symlink(join(ROOT, 'node_modules/svelte'), join(dir, 'node_modules/svelte'), 'dir');
  return dir;
}

async function writeFixture(dir: string, family: Family) {
  await writeFile(
    join(dir, 'index.html'),
    '<!doctype html><html><body><div id="shell"></div><div id="family"></div><script type="module" src="./main.ts"></script></body></html>'
  );
  await writeFile(
    join(dir, 'shell.ts'),
    `import { safeParseBlock } from '@protoyard/blocks';\nimport { liveQuery, runService } from '@protoyard/renderer-svelte';\nimport { Button, toast } from '@protoyard/ui';\nimport { mount } from 'svelte';\nconst rows = liveQuery(async () => [] as string[], { initial: [] });\nmount(Button as never, { target: document.getElementById('shell') as HTMLElement, props: { onclick: () => runService(async () => toast.success(String(rows.current?.length ?? 0))) } as never });\nsafeParseBlock({ type: 'divider' });\n`
  );
  const subpath = family === 'root' ? '' : `/${family}`;
  await writeFile(
    join(dir, 'main.ts'),
    `import './shell.ts';\nvoid import('@protoyard/blocks-ui${subpath}');\n`
  );
}

async function buildFixture(dir: string, family: Family): Promise<Rollup.OutputChunk[]> {
  await writeFixture(dir, family);
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const result = await build({
      mode: 'production',
      root: dir,
      configFile: false,
      logLevel: 'silent',
      plugins: [svelte()],
      build: {
        outDir: join(dir, 'dist', family),
        emptyOutDir: true,
        rollupOptions: { input: join(dir, 'index.html') },
      },
    });
    const outputs = (Array.isArray(result) ? result : [result]) as Rollup.RollupOutput[];
    return outputs
      .flatMap((output) => output.output)
      .filter((item): item is Rollup.OutputChunk => item.type === 'chunk');
  } finally {
    process.env.NODE_ENV = previous;
  }
}

export async function measureFamilies() {
  const dir = await fixtureDir();
  try {
    const sizes: Record<Family, number> = {} as Record<Family, number>;
    for (const family of FAMILIES) {
      const chunks = await buildFixture(dir, family);
      const entry = chunks.find((chunk) => chunk.isEntry);
      if (!entry) throw new Error(`Vite did not emit the ${family} fixture entry.`);
      const shell = addedChunkClosure(chunks, entry.fileName, new Set());
      const shellFiles = new Set(shell.map((chunk) => chunk.fileName));
      const subpath = family === 'root' ? '' : `/${family}`;
      const marker = `/blocks-ui/src${subpath ? `${subpath}/index.ts` : '/index.ts'}`;
      const file = entry.dynamicImports.find((name) =>
        chunks
          .find((chunk) => chunk.fileName === name)
          ?.moduleIds.some((id) => id.replaceAll('\\', '/').includes(marker))
      );
      if (!file) throw new Error(`No lazy chunk for blocks-ui ${family}.`);
      const added = addedChunkClosure(chunks, file, shellFiles);
      sizes[family] = added.reduce((sum, chunk) => sum + gzip(chunk.code), 0);
      if (process.env.PROTOYARD_BUNDLE_DEBUG) {
        const modules = added
          .flatMap((chunk) =>
            Object.entries(chunk.modules ?? {}).map(([id, info]) => ({
              id: id.replaceAll('\\', '/'),
              renderedBytes: info.renderedLength,
            }))
          )
          .sort((a, b) => b.renderedBytes - a.renderedBytes)
          .slice(0, 12);
        console.info(`${family} adds ${sizes[family]} gzip bytes`, JSON.stringify(modules));
      }
    }
    return sizes;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--check'))
    throw new Error('Usage: tsx scripts/bench-blocks.ts [--check]');
  const check = args.includes('--check');
  const sizes = await measureFamilies();
  const checks = gateFamilies(sizes);
  const outDir = join(ROOT, 'tmp');
  await mkdir(outDir, { recursive: true });
  const output = join(outDir, 'bench-blocks.json');
  await writeFile(
    output,
    `${JSON.stringify({ format: 'protoyard.bench-blocks', version: 1, measuredAt: new Date().toISOString(), method: 'For each family, real production Vite build; gzip level 9 of lazy family closure excluding chunks loaded by Svelte + UI + blocks shell', thresholdsBytes: THRESHOLDS, familiesGzipBytes: sizes, checks }, null, 2)}\n`
  );
  console.log(
    `Blocks UI family additions over shell (gzip level 9): ${Object.entries(sizes)
      .map(([name, bytes]) => `${name} ${bytes} B`)
      .join(' · ')}`
  );
  console.log(`Wrote ${output}`);
  if (!check) return;
  for (const gate of checks)
    console.log(
      `  ${gate.ok ? '✓' : '✗'} ${gate.family}: ${gate.bytes} B (limit ${gate.limitBytes} B)`
    );
  if (checks.some((gate) => !gate.ok)) process.exitCode = 1;
  else console.log('✓ Blocks UI chunk check passed.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await main();
