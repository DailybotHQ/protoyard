/**
 * Visual QA sweep (`pnpm visual:sweep`): screenshots every prototype (and, with
 * `--templates`, every template demo) in every applicable shell × layout ×
 * light/dark × desktop (1440×900) / phone (390×844), deterministically, and
 * writes a contact sheet for review:
 *
 *   tmp/visual-sweep/index.html   filterable sheet (static, no external assets)
 *   tmp/visual-sweep/sweep.json   every shot with its axe count and layout flags
 *   tmp/visual-sweep/shots/…      the PNGs
 *
 * Each shot opens the densest scenario (by name, see lib/sweep.ts) with
 * `?devtools=0&shell=&layout=&mode=` in a fresh browser context, after the
 * same readiness wait as the thumbnails (lib/capture.ts). It then runs axe
 * (WCAG 2.1 A/AA) and the layout-fit measurements (tests/e2e/layout-fit.spec.ts).
 * Failures are recorded and the sweep continues; the exit code is 1 when any
 * shot failed to capture. Flags and axe findings never fail the run.
 *
 *   tsx scripts/visual-sweep.ts [--only a,b] [--shells a,b]
 *     [--themes all|<collection>|a,b] [--route /path]
 *     [--templates] [--skip-build] [--no-axe] [--concurrency N]
 *     [--compare <earlier sweep dir>] [--out <dir under tmp/>]
 *
 * `--themes a,b` multiplies the whole matrix by those theme ids. `--themes
 * all` (or a library collection such as `high-contrast`) is the theme review:
 * one representative screen per target (desktop, the first `--shells` entry
 * or the manifest shell, the manifest layout, the densest scenario, `--route`
 * or the home route) in every selected library theme, light and dark, through
 * `?theme=<id>`. A shot whose page applied another theme (the runtime's
 * visible fallback) is flagged `theme-fallback`.
 *
 * `--compare` decodes both PNGs and counts changed pixels per shot (no image
 * dependency). `--templates` serves the template demos from the showcase
 * build (`artifacts/showcase/t/<name>/app/`), building it unless --skip-build.
 */
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { type Browser, chromium } from '@playwright/test';
import { THEME_LIBRARY_META } from '../packages/themes/src/library/registry.ts';
import { THEME_COLLECTIONS } from '../packages/themes/src/library/types.ts';
import { screenshot, withReadyPage } from './lib/capture.ts';
import { changedPixels, decodePng, optimizePng } from './lib/png.ts';
import { type StaticServer, serveDirectory } from './lib/static-server.ts';
import {
  buildMatrix,
  type FitMetrics,
  fitFlags,
  MEASURE_FIT,
  parseSweepArgs,
  renderContactSheet,
  resolveThemes,
  type Shot,
  type ShotResult,
  type SweepArgs,
  type SweepShell,
  type SweepTarget,
  shotUrl,
  summarize,
  VIEWPORTS,
} from './lib/sweep.ts';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

interface Manifest {
  kind?: string;
  status?: string;
  platform?: SweepTarget['platform'];
  defaultScenario?: string;
  scenarios?: string[];
  preview?: { shell?: SweepShell; layout?: { id?: string; supported?: string[] } };
}

/** Prototypes (and templates when asked) with a manifest; symlinked folders are skipped like the CLI does. */
function discover(args: SweepArgs): SweepTarget[] {
  const targets: SweepTarget[] = [];
  const kinds: [SweepTarget['kind'], string][] = [['prototype', 'prototypes']];
  if (args.templates) kinds.push(['template', 'templates']);
  for (const [kind, folder] of kinds) {
    const base = join(ROOT, folder);
    for (const slug of readdirSync(base).sort()) {
      if (lstatSync(join(base, slug)).isSymbolicLink()) continue;
      const path = join(base, slug, 'protoyard.json');
      if (!existsSync(path)) continue;
      const manifest = JSON.parse(readFileSync(path, 'utf8')) as Manifest;
      if ((manifest.kind ?? kind) !== kind || manifest.status === 'archived') continue;
      if (args.only.length && !args.only.includes(slug)) continue;
      targets.push({
        kind,
        slug,
        platform: manifest.platform ?? 'responsive',
        ...(manifest.defaultScenario ? { defaultScenario: manifest.defaultScenario } : {}),
        scenarios: manifest.scenarios ?? [],
        ...(manifest.preview?.shell ? { previewShell: manifest.preview.shell } : {}),
        ...(manifest.preview?.layout ? { layout: manifest.preview.layout } : {}),
      });
    }
  }
  const missing = args.only.filter((slug) => !targets.some((target) => target.slug === slug));
  if (missing.length) throw new Error(`Unknown prototype(s) or template(s): ${missing.join(', ')}`);
  return targets;
}

/** The output folder must live under tmp/ and be empty or an earlier sweep. */
function prepareOut(out: string, compare: string | null): string {
  const dir = resolve(ROOT, out);
  const tmp = join(ROOT, 'tmp');
  if (!dir.startsWith(tmp + sep)) throw new Error(`--out must be inside tmp/ (got ${out})`);
  if (compare && resolve(ROOT, compare) === dir) {
    throw new Error(
      '--compare must point to an earlier sweep, not the --out folder this run replaces'
    );
  }
  if (existsSync(dir) && readdirSync(dir).length && !existsSync(join(dir, 'sweep.json'))) {
    throw new Error(`${out} is not empty and holds no sweep.json; refusing to replace it`);
  }
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, 'shots'), { recursive: true });
  return dir;
}

function build(command: string[]): string | null {
  const result = spawnSync('pnpm', command, { cwd: ROOT, encoding: 'utf8' });
  return result.status === 0
    ? null
    : `${command.join(' ')} failed:\n${result.stdout}${result.stderr}`.slice(0, 4000);
}

/** Where each target is served from: its own dist, or the showcase for template demos. */
function appRoot(target: SweepTarget): { dir: string; path: string } {
  return target.kind === 'template'
    ? { dir: join(ROOT, 'artifacts', 'showcase'), path: `/t/${target.slug}/app/` }
    : { dir: join(ROOT, 'artifacts', target.slug, 'dist'), path: '/' };
}

async function captureShot(
  browser: Browser,
  origin: string,
  path: string,
  shot: Shot,
  args: SweepArgs,
  outDir: string
): Promise<ShotResult> {
  const started = performance.now();
  const viewport = VIEWPORTS[shot.viewport];
  try {
    const result = await withReadyPage(
      browser,
      `${origin}${shotUrl(path, shot)}`,
      {
        viewport: { width: viewport.width, height: viewport.height },
        colorScheme: shot.mode,
        mobile: viewport.mobile,
      },
      async (page) => {
        const png = optimizePng(await screenshot(page));
        const metrics = (await page.evaluate(MEASURE_FIT)) as FitMetrics;
        const appliedTheme = await page.evaluate(
          () => document.querySelector<HTMLElement>('[data-py-theme]')?.dataset.pyTheme ?? null
        );
        const axe = args.axe
          ? (await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()).violations.length
          : null;
        return { png, metrics, axe, appliedTheme };
      }
    );
    const file = join(outDir, shot.file);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, result.png);
    return {
      ...shot,
      ok: true,
      axeViolations: result.axe,
      flags: [
        ...fitFlags(result.metrics),
        ...(shot.theme && result.appliedTheme !== shot.theme
          ? [`theme-fallback (${result.appliedTheme ?? 'none'})`]
          : []),
      ],
      bytes: result.png.length,
      ms: Math.round(performance.now() - started),
    };
  } catch (error) {
    return {
      ...shot,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      axeViolations: null,
      flags: [],
      ms: Math.round(performance.now() - started),
    };
  }
}

/** Runs `work` over `items` with at most `limit` in flight, keeping the input order. */
async function pool<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await work(items[index] as T);
    }
  });
  await Promise.all(runners);
  return results;
}

/** Changed pixels per shot against an earlier sweep folder. */
function compareWith(results: ShotResult[], compareDir: string, outDir: string): void {
  const earlierPath = join(resolve(ROOT, compareDir), 'sweep.json');
  if (!existsSync(earlierPath)) throw new Error(`--compare: no sweep.json in ${compareDir}`);
  const earlier = new Map(
    (JSON.parse(readFileSync(earlierPath, 'utf8')) as { results: ShotResult[] }).results
      .filter((result) => result.ok)
      .map((result) => [result.key, result.file])
  );
  for (const result of results) {
    if (!result.ok) continue;
    const before = earlier.get(result.key);
    if (!before) {
      result.changed = 'new';
      continue;
    }
    const diff = changedPixels(
      decodePng(readFileSync(join(resolve(ROOT, compareDir), before))),
      decodePng(readFileSync(join(outDir, result.file)))
    );
    result.changed = diff === null ? 'resized' : diff;
  }
}

async function main() {
  const started = performance.now();
  const args = parseSweepArgs(process.argv.slice(2));
  const targets = discover(args);
  const outDir = prepareOut(args.out, args.compare);
  const themes = resolveThemes(args.themes, THEME_LIBRARY_META, THEME_COLLECTIONS);
  const shots = buildMatrix(targets, { ...args, themes: themes.ids, review: themes.review });
  console.log(
    `Visual sweep${themes.review ? ` (theme review, ${themes.ids.length} themes)` : ''}: ${targets.length} target(s), ${shots.length} shot(s) → ${relative(ROOT, outDir)}`
  );

  const buildErrors = new Map<string, string>();
  if (!args.skipBuild) {
    for (const target of targets.filter((entry) => entry.kind === 'prototype')) {
      const error = build(['protoyard', 'build', target.slug]);
      if (error) buildErrors.set(target.slug, error);
      console.log(`${error ? '✗' : '✓'} built ${target.slug}`);
    }
    if (targets.some((target) => target.kind === 'template')) {
      const error = build(['protoyard', 'showcase']);
      for (const target of targets.filter((entry) => entry.kind === 'template')) {
        if (error) buildErrors.set(target.slug, error);
      }
      console.log(`${error ? '✗' : '✓'} built the showcase (template demos)`);
    }
  }

  const servers = new Map<string, StaticServer>();
  const browser = await chromium.launch();
  let results: ShotResult[];
  try {
    for (const target of targets) {
      const { dir } = appRoot(target);
      if (buildErrors.has(target.slug) || servers.has(dir)) continue;
      if (!existsSync(join(dir, appRoot(target).path, 'index.html'))) {
        buildErrors.set(
          target.slug,
          `no build at ${relative(ROOT, join(dir, appRoot(target).path))}`
        );
        continue;
      }
      servers.set(dir, await serveDirectory(dir));
    }
    let done = 0;
    results = await pool(shots, args.concurrency, async (shot) => {
      const target = targets.find(
        (entry) => entry.slug === shot.slug && entry.kind === shot.kind
      ) as SweepTarget;
      const buildError = buildErrors.get(shot.slug);
      const { dir, path } = appRoot(target);
      const server = servers.get(dir);
      const result: ShotResult =
        buildError || !server
          ? {
              ...shot,
              ok: false,
              error: buildError ?? 'not served',
              axeViolations: null,
              flags: [],
            }
          : await captureShot(browser, server.origin, path, shot, args, outDir);
      done += 1;
      const problems = [
        ...(result.ok ? [] : [result.error?.split('\n')[0] ?? 'failed']),
        ...result.flags,
        ...(result.axeViolations ? [`axe ${result.axeViolations}`] : []),
      ];
      console.log(
        `${result.ok ? '✓' : '✗'} [${done}/${shots.length}] ${shot.key}${result.ms ? ` ${(result.ms / 1000).toFixed(1)} s` : ''}${problems.length ? ` · ${problems.join(' · ')}` : ''}`
      );
      return result;
    });
  } finally {
    await browser.close();
    for (const server of servers.values()) await server.close();
  }

  if (args.compare) compareWith(results, args.compare, outDir);
  const durationMs = Math.round(performance.now() - started);
  const generatedAt = new Date().toISOString();
  const command = `tsx scripts/visual-sweep.ts ${process.argv.slice(2).join(' ')}`.trim();
  writeFileSync(
    join(outDir, 'sweep.json'),
    `${JSON.stringify({ format: 'protoyard.visual-sweep', formatVersion: 1, generatedAt, command, durationMs, results }, null, 2)}\n`
  );
  writeFileSync(
    join(outDir, 'index.html'),
    renderContactSheet(results, { generatedAt, command, durationMs, compare: args.compare })
  );
  const summary = summarize(results);
  console.log(
    `${summary.shots} shots · ${summary.failed} failed · ${summary.flagged} with problems${args.compare ? ` · ${summary.changed} changed` : ''} · ${(durationMs / 1000).toFixed(1)} s`
  );
  console.log(`Contact sheet: ${relative(ROOT, join(outDir, 'index.html'))}`);
  if (summary.failed) process.exitCode = 1;
}

await main();
