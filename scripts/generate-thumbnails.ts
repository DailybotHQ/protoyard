/**
 * Gallery thumbnails generated from the REAL apps (`pnpm thumbnails`).
 *
 * For each prototype: build it (`pnpm protoyard build <slug>`), serve
 * `artifacts/<slug>/dist` from a tiny local static server, open it in
 * headless Chromium at 1280×800 and write `prototypes/<slug>/public/thumbnail.png`.
 *
 * Deterministic by construction: the manifest's default scenario via
 * `?scenario=`, DevTools off (`?devtools=0`), reduced motion, light color
 * scheme, a fixed viewport, and a capture only after the runtime marks
 * `html[data-py-ready="true"]`, fonts are loaded and the network is idle.
 * Simulated time comes from the scenario, so dates in the UI never drift.
 * Phone-first prototypes render their manifest preview viewport (a centered
 * phone column), which fits the gallery's 16:10 cards.
 *
 *   tsx scripts/generate-thumbnails.ts [slug…] [--skip-build] [--check]
 *
 * `--check` captures twice in fresh browser contexts and fails if the PNGs differ.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Browser, chromium } from '@playwright/test';
import { screenshot, withReadyPage } from './lib/capture.ts';
import { optimizePng } from './lib/png.ts';
import { serveDirectory } from './lib/static-server.ts';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const WIDTH = 1280;
const HEIGHT = 800;
const BUDGET_BYTES = 150 * 1024;

interface Target {
  slug: string;
  dir: string;
  defaultScenario: string | undefined;
}

function discover(only: readonly string[]): Target[] {
  const base = join(ROOT, 'prototypes');
  const targets: Target[] = [];
  for (const slug of readdirSync(base).sort()) {
    // Same rule as the CLI's discovery: symlinked prototype folders are never
    // processed (writing a thumbnail would go into the link's target).
    if (lstatSync(join(base, slug)).isSymbolicLink()) continue;
    const manifestPath = join(base, slug, 'protoyard.json');
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      kind?: string;
      status?: string;
      defaultScenario?: string;
    };
    if ((manifest.kind ?? 'prototype') !== 'prototype' || manifest.status === 'archived') continue;
    if (only.length > 0 && !only.includes(slug)) continue;
    targets.push({ slug, dir: join(base, slug), defaultScenario: manifest.defaultScenario });
  }
  const missing = only.filter((slug) => !targets.some((t) => t.slug === slug));
  if (missing.length) throw new Error(`Unknown prototype(s): ${missing.join(', ')}`);
  return targets;
}

function capture(browser: Browser, url: string): Promise<Buffer> {
  return withReadyPage(
    browser,
    url,
    { viewport: { width: WIDTH, height: HEIGHT }, colorScheme: 'light' },
    screenshot
  );
}

const sha = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex').slice(0, 12);

async function main() {
  const args = process.argv.slice(2);
  const skipBuild = args.includes('--skip-build');
  const check = args.includes('--check');
  const targets = discover(args.filter((a) => !a.startsWith('--')));
  const browser = await chromium.launch();
  let failures = 0;
  try {
    for (const target of targets) {
      const started = performance.now();
      try {
        if (!skipBuild) {
          const build = spawnSync('pnpm', ['protoyard', 'build', target.slug], {
            cwd: ROOT,
            encoding: 'utf8',
          });
          if (build.status !== 0) throw new Error(`build failed:\n${build.stdout}${build.stderr}`);
        }
        const dist = join(ROOT, 'artifacts', target.slug, 'dist');
        if (!existsSync(join(dist, 'index.html'))) throw new Error(`no build at ${dist}`);
        const server = await serveDirectory(dist);
        try {
          const query = new URLSearchParams({ devtools: '0' });
          if (target.defaultScenario) query.set('scenario', target.defaultScenario);
          const url = `${server.origin}/?${query}`;
          const raw = await capture(browser, url);
          const png = optimizePng(raw);
          if (check) {
            const second = optimizePng(await capture(browser, url));
            if (!second.equals(png)) {
              throw new Error(`not deterministic: ${sha(png)} vs ${sha(second)}`);
            }
          }
          mkdirSync(join(target.dir, 'public'), { recursive: true });
          const out = join(target.dir, 'public', 'thumbnail.png');
          // Never write THROUGH a symlink (a committed public/thumbnail.png -> ~/.zshrc).
          for (const path of [join(target.dir, 'public'), out]) {
            // lstat, not existsSync: a dangling link reports as missing yet still redirects the write.
            let link = false;
            try {
              link = lstatSync(path).isSymbolicLink();
            } catch {}
            if (link) throw new Error(`refusing to write through the symlink ${path}`);
          }
          writeFileSync(out, png);
          const kb = (png.length / 1024).toFixed(1);
          const note =
            png.length > BUDGET_BYTES ? ` (over the ${BUDGET_BYTES / 1024} KB budget)` : '';
          console.log(
            `✓ ${target.slug}: ${WIDTH}×${HEIGHT} ${kb} KB (raw ${(raw.length / 1024).toFixed(1)} KB)${note} sha ${sha(png)}${check ? ' · deterministic' : ''} · ${((performance.now() - started) / 1000).toFixed(1)} s`
          );
        } finally {
          await server.close();
        }
      } catch (error) {
        failures++;
        console.error(
          `✗ ${target.slug}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  } finally {
    await browser.close();
  }
  if (failures) process.exitCode = 1;
}

await main();
