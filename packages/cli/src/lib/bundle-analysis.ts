import { existsSync } from 'node:fs';
import { readdir, readFile, rm, rmdir } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';
import { listFiles } from './checksum.ts';

const gzipAsync = promisify(gzip);

/**
 * Where the renderer's Vite config writes the chunk manifest, relative to the
 * output folder. Mirrors VITE_MANIFEST_PATH in @protoyard/renderer-svelte/vite
 * (not imported: that module loads the whole Vite plugin stack).
 */
export const VITE_MANIFEST_PATH = '.vite/manifest.json';

/** One entry of Vite's `.vite/manifest.json` (the fields this analysis reads). */
export interface ViteManifestChunk {
  file: string;
  src?: string;
  name?: string;
  isEntry?: boolean;
  isDynamicEntry?: boolean;
  imports?: string[];
  dynamicImports?: string[];
  css?: string[];
}

export type ViteManifest = Record<string, ViteManifestChunk>;

export type ChunkKind = 'initial' | 'lazy' | 'css';

export interface BundleChunk {
  /** POSIX path relative to the output folder. */
  file: string;
  kind: ChunkKind;
  /** gzip (level 9) size in bytes. */
  gzip: number;
}

/**
 * Bundle sizes of one build, all gzip level 9 in bytes (the method in
 * docs/PERFORMANCE.md). Initial JS is what the page downloads before the app
 * runs: the entry chunks and everything they import statically. Lazy JS is
 * only fetched through `import()` (Faker, DevTools, shells…).
 */
export interface BundleReport {
  initialJsGzip: number;
  lazyJsGzip: number;
  /** Every stylesheet of the build, initial or lazy. */
  cssGzip: number;
  /** Every file of the output folder (the "whole dist" figure). */
  totalGzip: number;
  /** JS and CSS files, sorted by path. */
  chunks: BundleChunk[];
}

export interface ChunkClassification {
  initialJs: string[];
  lazyJs: string[];
  initialCss: string[];
  lazyCss: string[];
}

/**
 * Walks the Vite manifest: entries and their static `imports` (transitively)
 * are initial; every other JS chunk (reached through `dynamicImports`, or not
 * reached at all) is lazy. Stylesheets follow the chunk that owns them, and a
 * stylesheet owned by any initial chunk counts as initial.
 */
export function classifyChunks(manifest: ViteManifest): ChunkClassification {
  const initialKeys = new Set<string>();
  const queue = Object.keys(manifest).filter((key) => manifest[key]?.isEntry === true);
  while (queue.length > 0) {
    const key = queue.pop() as string;
    if (initialKeys.has(key) || !manifest[key]) continue;
    initialKeys.add(key);
    for (const next of manifest[key].imports ?? []) queue.push(next);
  }
  const initialJs = new Set<string>();
  const lazyJs = new Set<string>();
  const initialCss = new Set<string>();
  const lazyCss = new Set<string>();
  for (const [key, chunk] of Object.entries(manifest)) {
    const initial = initialKeys.has(key);
    if (/\.m?js$/.test(chunk.file)) (initial ? initialJs : lazyJs).add(chunk.file);
    else if (/\.css$/.test(chunk.file)) (initial ? initialCss : lazyCss).add(chunk.file);
    for (const css of chunk.css ?? []) (initial ? initialCss : lazyCss).add(css);
  }
  // A file shared by both sides is downloaded up front.
  for (const file of initialJs) lazyJs.delete(file);
  for (const file of initialCss) lazyCss.delete(file);
  const sorted = (set: Set<string>) => [...set].sort();
  return {
    initialJs: sorted(initialJs),
    lazyJs: sorted(lazyJs),
    initialCss: sorted(initialCss),
    lazyCss: sorted(lazyCss),
  };
}

async function gzipSize(path: string): Promise<number> {
  return (await gzipAsync(await readFile(path), { level: 9 })).length;
}

function toPosix(path: string): string {
  return path.split(sep).join('/');
}

/**
 * Reads `<outDir>/.vite/manifest.json`, measures the build and deletes the
 * manifest (and its folder when empty) so it never reaches digests, ZIPs or
 * uploads. Returns null when the build wrote no manifest (a prototype whose
 * vite.config.ts does not use defineProtoyardConfig).
 */
export async function analyzeBundle(outDir: string): Promise<BundleReport | null> {
  const manifestPath = join(outDir, VITE_MANIFEST_PATH);
  if (!existsSync(manifestPath)) return null;
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as ViteManifest;
  await rm(manifestPath, { force: true });
  const manifestDir = dirname(manifestPath);
  if ((await readdir(manifestDir)).length === 0) await rmdir(manifestDir);

  const classes = classifyChunks(manifest);
  const kindOf = new Map<string, ChunkKind>();
  for (const file of classes.initialJs) kindOf.set(file, 'initial');
  for (const file of classes.lazyJs) kindOf.set(file, 'lazy');
  for (const file of [...classes.initialCss, ...classes.lazyCss]) kindOf.set(file, 'css');

  const files = await listFiles(outDir);
  const sizes = await Promise.all(
    files.map(async (path) => ({
      file: toPosix(relative(outDir, path)),
      gzip: await gzipSize(path),
    }))
  );
  const chunks: BundleChunk[] = [];
  for (const { file, gzip: size } of sizes) {
    // Stylesheets Vite emitted without a manifest owner (rare) still count as CSS.
    const kind = kindOf.get(file) ?? (/\.css$/.test(file) ? 'css' : undefined);
    if (kind) chunks.push({ file, kind, gzip: size });
  }
  const sum = (kind: ChunkKind) =>
    chunks.filter((c) => c.kind === kind).reduce((total, c) => total + c.gzip, 0);
  return {
    initialJsGzip: sum('initial'),
    lazyJsGzip: sum('lazy'),
    cssGzip: sum('css'),
    totalGzip: sizes.reduce((total, s) => total + s.gzip, 0),
    chunks,
  };
}
