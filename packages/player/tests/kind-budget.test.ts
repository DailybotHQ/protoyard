// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { parseBudgetConfig, resolveKindBudget } from '../../cli/src/lib/budgets.ts';
import { classifyChunks, type ViteManifest } from '../../cli/src/lib/bundle-analysis.ts';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const DIST = process.env.PLAYER_DIST ?? join(REPO, 'packages', 'player', 'dist', 'app');
const MANIFEST = join(DIST, '.vite', 'manifest.json');
const KB = 1024;

const ENTRIES = [
  { page: 'index.html', kind: 'app' },
  { page: 'deck.html', kind: 'deck' },
  { page: 'page.html', kind: 'page' },
  { page: 'doc.html', kind: 'doc' },
] as const;

const CONTENT_KIND_ONLY_MODULES: [string, RegExp][] = [
  ['Faker', /@faker-js\/faker|\/faker\/src\//],
  ['world-generation worker', /generate-world|\/worker\//],
  ['CRUD screens or app shell', /\/crud\/src\/(?:screens|app)\//],
  ['DevTools', /\/devtools\/src\//],
];

function entryManifest(manifest: ViteManifest, page: string): ViteManifest {
  return Object.fromEntries(
    Object.entries(manifest).map(([key, chunk]) => [key, { ...chunk, isEntry: key === page }])
  );
}

/** Follows only static imports: these are the chunks downloaded before the entry runs. */
function staticKeys(manifest: ViteManifest, page: string): Set<string> {
  const seen = new Set<string>();
  const queue = [page];
  while (queue.length > 0) {
    const key = queue.pop() as string;
    if (seen.has(key) || !manifest[key]) continue;
    seen.add(key);
    queue.push(...(manifest[key].imports ?? []));
  }
  return seen;
}

function gzipBytes(files: readonly string[]): number {
  return files.reduce(
    (total, file) => total + gzipSync(readFileSync(join(DIST, file)), { level: 9 }).length,
    0
  );
}

const built = existsSync(MANIFEST);

describe.skipIf(!built)('player entry bundle budgets (build the player first)', () => {
  const manifest = built ? (JSON.parse(readFileSync(MANIFEST, 'utf8')) as ViteManifest) : {};
  const config = parseBudgetConfig(
    JSON.parse(readFileSync(join(REPO, 'protoyard.budgets.json'), 'utf8'))
  );
  const defaultBudget = { ...config.defaults, ...(config.overrides.player ?? {}) };
  const measurements: Record<string, { jsBytes: number; cssBytes: number }> = {};

  it.each(ENTRIES)(
    '$page stays within its configured initial JS and CSS limits',
    ({ page, kind }) => {
      expect(manifest[page]?.isEntry, `${page} is present in the build manifest`).toBe(true);
      const scoped = entryManifest(manifest, page);
      const chunks = classifyChunks(scoped);
      const jsBytes = gzipBytes(chunks.initialJs);
      const cssBytes = gzipBytes(chunks.initialCss);
      const jsBudgetKb =
        kind === 'app'
          ? defaultBudget.initialJsGzipKb
          : resolveKindBudget(config, kind).initialJsGzipKb;
      const cssBudgetKb =
        kind === 'app' ? defaultBudget.cssGzipKb : resolveKindBudget(config, kind).cssGzipKb;
      const diagnostics = `${page}: initial JS ${jsBytes.toLocaleString()} B (${(jsBytes / KB).toFixed(2)} KB gzip; limit ${jsBudgetKb} KB), initial CSS ${cssBytes.toLocaleString()} B (${(cssBytes / KB).toFixed(2)} KB gzip; limit ${cssBudgetKb} KB)`;
      measurements[page] = { jsBytes, cssBytes };

      expect(
        chunks.initialJs.length,
        `${diagnostics}; at least one initial JS chunk`
      ).toBeGreaterThan(0);
      expect(
        chunks.initialCss.length,
        `${diagnostics}; at least one initial CSS chunk`
      ).toBeGreaterThan(0);
      expect(jsBytes, diagnostics).toBeLessThanOrEqual(jsBudgetKb * KB);
      expect(cssBytes, diagnostics).toBeLessThanOrEqual(cssBudgetKb * KB);
    }
  );

  it.each(ENTRIES.filter(({ kind }) => kind !== 'app'))(
    '$page keeps app-only dependencies outside its initial graph',
    ({ page }) => {
      const keys = staticKeys(manifest, page);
      const modules = [...keys].map((key) => `${key} ${manifest[key]?.src ?? ''}`);
      for (const [label, pattern] of CONTENT_KIND_ONLY_MODULES) {
        const matches = modules.filter((module) => pattern.test(module));
        expect(matches, `${page} initial dependency graph excludes ${label}`).toEqual([]);
      }
    }
  );

  it('reports measured initial bytes for every player entry', () => {
    console.info(`[player entry budgets] ${JSON.stringify(measurements)}`);
    expect(Object.keys(measurements).sort()).toEqual(ENTRIES.map(({ page }) => page).sort());
  });
});
