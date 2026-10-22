// @vitest-environment node
/// <reference types="node" />
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import config from '../vite.config.ts';
import { WORKER_GRAPH_GZIP_KB } from './player-budgets.ts';

/**
 * The world-generation worker loads Faker and the blueprint generator. Built
 * as an IIFE, the worker inlined its dynamic imports and shipped every Faker
 * locale (943 KB gzip); as an ES module worker it code-splits and tree-shakes
 * to the English locale. This builds the player and budgets the worker graph.
 */

/** Gzip budget for everything the worker downloads: the one value both player suites share. */
const WORKER_GRAPH_BUDGET_GZIP = WORKER_GRAPH_GZIP_KB * 1024;
/**
 * Locale ids that only appear when Faker ships more than `en` and `base` (the
 * English data itself mentions `de_AT` once, so it is not a marker).
 */
const FOREIGN_LOCALES = ['zh_CN', 'pt_BR', 'fr_CA', 'ja_JP'];

const PLAYER = fileURLToPath(new URL('..', import.meta.url));
let outDir = '';

beforeAll(() => {
  outDir = mkdtempSync(join(tmpdir(), 'protoyard-player-worker-'));
  execFileSync('pnpm', ['exec', 'vite', 'build', '--outDir', outDir, '--emptyOutDir'], {
    cwd: PLAYER,
    stdio: 'pipe',
    timeout: 240_000,
  });
}, 300_000);

afterAll(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true });
});

/** The worker entry and every chunk it imports, statically or dynamically. */
function workerGraph(assets: string): string[] {
  const entry = readdirSync(assets).find((name) => /^generate\.worker-.*\.js$/.test(name));
  if (!entry) throw new Error('No generate.worker chunk in the build.');
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const file = queue.pop() as string;
    if (seen.has(file) || !existsSync(join(assets, file))) continue;
    seen.add(file);
    const source = readFileSync(join(assets, file), 'utf8');
    for (const [, name] of source.matchAll(/["'`](?:\.\/)?([\w.-]+\.js)["'`]/g))
      queue.push(name as string);
  }
  return [...seen];
}

describe('world generation worker bundle', () => {
  it('builds module workers', () => {
    const resolved =
      typeof config === 'function' ? config({ command: 'build', mode: 'production' }) : config;
    expect((resolved as { worker?: { format?: string } }).worker?.format).toBe('es');
  });

  it('stays within its gzip budget and ships only the English Faker locale', () => {
    const assets = join(outDir, 'assets');
    const graph = workerGraph(assets);
    expect(graph.length).toBeGreaterThan(1);
    const sources = graph.map((file) => readFileSync(join(assets, file)));
    const gzip = sources.reduce(
      (total, bytes) => total + gzipSync(bytes, { level: 9 }).byteLength,
      0
    );
    expect(gzip, `worker graph ${(gzip / 1024).toFixed(1)} KB gzip`).toBeLessThanOrEqual(
      WORKER_GRAPH_BUDGET_GZIP
    );
    const text = sources.map((bytes) => bytes.toString('utf8')).join('\n');
    for (const locale of FOREIGN_LOCALES) expect(text.includes(`${locale}`), locale).toBe(false);
  });
});
