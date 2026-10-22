/**
 * Measure the lazy chunks of each @protoyard/blocks-ui family with a real
 * production Vite build. Run with `npx tsx scripts/bench-blocks.ts [--check]`.
 * Results are written to tmp/bench-blocks.json.
 */

import { mkdir, mkdtemp, readdir, rm, symlink, writeFile } from 'node:fs/promises';
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

/** Per-family ceilings in decimal KB, matching the task contract. */
export const THRESHOLDS_KB: Readonly<Record<Family, number>> = {
  root: 3,
  text: 6,
  media: 4,
  data: 5,
  structure: 8,
  code: 6,
  diagram: 6,
  interactive: 10,
  map: 4,
  embed: 2,
};

export function gateFamilies(
  sizes: Readonly<Record<string, number>>,
  thresholds: Readonly<Record<string, number>> = THRESHOLDS_KB
) {
  return Object.entries(thresholds).map(([family, limitKb]) => {
    const bytes = sizes[family];
    return {
      family,
      bytes: bytes ?? Number.POSITIVE_INFINITY,
      limitBytes: limitKb * 1000,
      ok: bytes !== undefined && bytes <= limitKb * 1000,
    };
  });
}

const gzip = (code: string) => gzipSync(code, { level: 9 }).length;

async function fixtureDir() {
  await mkdir(join(ROOT, 'tmp'), { recursive: true });
  const dir = await mkdtemp(join(ROOT, 'tmp', 'bench-blocks-'));
  const scope = join(dir, 'node_modules', '@protoyard');
  await mkdir(scope, { recursive: true });
  for (const entry of await readdir(join(ROOT, 'packages'), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pkgDir = join(ROOT, 'packages', entry.name);
    try {
      await symlink(pkgDir, join(scope, entry.name), 'dir');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  await symlink(join(ROOT, 'node_modules/svelte'), join(dir, 'node_modules/svelte'), 'dir');
  return dir;
}

async function buildFixture(dir: string): Promise<Rollup.OutputChunk[]> {
  await writeFile(
    join(dir, 'index.html'),
    '<!doctype html><html><body><script type="module" src="./main.ts"></script></body></html>'
  );
  await writeFile(
    join(dir, 'main.ts'),
    `import { mount } from 'svelte';\nvoid mount;\nexport const loaders = {\n${FAMILIES.map(
      (family) => {
        const path = family === 'root' ? '' : `/${family}`;
        return `  '${family}': () => import('@protoyard/blocks-ui${path}'),`;
      }
    ).join('\n')}\n};\n(globalThis as Record<string, unknown>).loaders = loaders;\n`
  );
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
        outDir: join(dir, 'dist'),
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

function closure(
  chunks: Rollup.OutputChunk[],
  start: Rollup.OutputChunk,
  alreadyLoaded: Set<string>
) {
  const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  const visited = new Set<string>();
  const pending = [start.fileName];
  while (pending.length) {
    const name = pending.pop() as string;
    if (visited.has(name) || alreadyLoaded.has(name)) continue;
    visited.add(name);
    for (const imported of byName.get(name)?.imports ?? []) pending.push(imported);
  }
  return [...visited].map((name) => byName.get(name) as Rollup.OutputChunk);
}

export async function measureFamilies() {
  const dir = await fixtureDir();
  try {
    const chunks = await buildFixture(dir);
    const entry = chunks.find((chunk) => chunk.isEntry && chunk.name === 'index');
    if (!entry) throw new Error('Vite did not emit the benchmark entry chunk.');
    const loaded = new Set(closure(chunks, entry, new Set()).map((chunk) => chunk.fileName));
    const sizes: Record<Family, number> = {} as Record<Family, number>;
    for (const family of FAMILIES) {
      const subpath = family === 'root' ? '' : `/${family}`;
      const marker = `/blocks-ui/src${subpath ? `${subpath}/index.ts` : '/index.ts'}`;
      const file = entry.dynamicImports.find((name) =>
        chunks
          .find((chunk) => chunk.fileName === name)
          ?.moduleIds.some((id) => id.replaceAll('\\', '/').includes(marker))
      );
      const start = chunks.find((chunk) => chunk.fileName === file);
      if (!start) throw new Error(`No emitted lazy chunk for blocks-ui ${family}.`);
      sizes[family] = closure(chunks, start, loaded).reduce(
        (sum, chunk) => sum + gzip(chunk.code),
        0
      );
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
  const gates = gateFamilies(sizes);
  const outDir = join(ROOT, 'tmp');
  await mkdir(outDir, { recursive: true });
  const output = join(outDir, 'bench-blocks.json');
  await writeFile(
    output,
    `${JSON.stringify({ format: 'protoyard.bench-blocks', version: 1, measuredAt: new Date().toISOString(), method: 'Vite production build; gzip level 9; family static-import closure beyond entry', thresholdsKb: THRESHOLDS_KB, familiesGzipBytes: sizes, checks: gates }, null, 2)}\n`
  );
  console.log(
    `Blocks UI family chunks (gzip level 9): ${Object.entries(sizes)
      .map(([name, bytes]) => `${name} ${bytes} B`)
      .join(' · ')}`
  );
  console.log(`Wrote ${output}`);
  if (!check) return;
  for (const gate of gates)
    console.log(
      `  ${gate.ok ? '✓' : '✗'} ${gate.family}: ${gate.bytes} B (limit ${gate.limitBytes} B)`
    );
  if (gates.some((gate) => !gate.ok)) process.exitCode = 1;
  else console.log('✓ Blocks UI chunk check passed.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await main();
