/**
 * Covers for the deck, page and doc examples the gallery shows (`pnpm covers`).
 *
 * Builds the player when it is missing, serves packages/player/dist/app on a
 * loopback port, opens each example from a share link on its kind page
 * (deck.html, page.html, doc.html) in headless Chromium, and writes
 * apps/gallery/public/examples/<name>.png. Deterministic: light color scheme,
 * reduced motion, a fixed viewport, DevTools off, and a capture only after the
 * kind's root is visible, fonts are loaded and the network is idle.
 *
 *   tsx scripts/content-covers.ts [name…]
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from '@playwright/test';
import {
  CONTENT_EXAMPLES,
  type ContentKind,
  contentExampleCover,
  contentExamplePath,
  FLAGSHIP_SLIDES,
  flagshipSlideCover,
} from '../apps/gallery/src/lib/content-examples.ts';
import {
  type AnyBlueprint,
  blueprintShareFragment,
  encodeBlueprintShare,
} from '../packages/blueprint/src/index.ts';
import { optimizePng } from '../packages/cli/src/lib/capture/index.ts';
import { serveDirectory } from './lib/static-server.ts';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = join(ROOT, 'packages/player/dist/app');
const OUT = join(ROOT, 'apps/gallery/public');
const BUDGET_BYTES = 150 * 1024;

/** 16:9 for slides; a taller frame for pages and documents. */
const VIEWPORTS: Record<ContentKind, { width: number; height: number }> = {
  deck: { width: 1024, height: 640 },
  page: { width: 1280, height: 800 },
  doc: { width: 1280, height: 800 },
};
const ROOTS: Record<ContentKind, string> = {
  deck: '[data-py-deck-app]',
  page: '[data-py-page-app]',
  doc: '[data-py-doc-app]',
};

function ensurePlayer(): void {
  if (['index', 'deck', 'page', 'doc'].every((page) => existsSync(join(DIST, `${page}.html`))))
    return;
  // A production build, whatever NODE_ENV the caller has.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => key !== 'NODE_ENV')
  ) as NodeJS.ProcessEnv;
  const run = spawnSync('pnpm', ['--filter', '@protoyard/player', 'build'], {
    cwd: ROOT,
    encoding: 'utf8',
    env,
  });
  if (run.status !== 0) throw new Error(`player build failed:\n${run.stdout}${run.stderr}`);
}

/** Writes a PNG of the slide (decks) or the viewport (pages, documents). */
async function save(page: Page, kind: ContentKind, path: string): Promise<void> {
  const target =
    kind === 'deck'
      ? page.locator('[data-tx-deck-slide][data-tx-deck-active="true"]').first()
      : page;
  const png = optimizePng(await target.screenshot({ type: 'png' }));
  const file = join(OUT, path);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, png);
  const kb = (png.length / 1024).toFixed(1);
  const over = png.length > BUDGET_BYTES ? ' (over the 150 KB budget)' : '';
  console.log(`✓ ${path}: ${kb} KB${over}`);
}

async function main() {
  const only = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  const examples = CONTENT_EXAMPLES.filter((e) => only.length === 0 || only.includes(e.name));
  ensurePlayer();
  const server = await serveDirectory(DIST);
  const browser = await chromium.launch();
  let failures = 0;
  try {
    for (const example of examples) {
      const context = await browser.newContext({
        viewport: VIEWPORTS[example.kind],
        colorScheme: 'light',
        reducedMotion: 'reduce',
      });
      try {
        const blueprint = JSON.parse(
          readFileSync(join(ROOT, contentExamplePath(example)), 'utf8')
        ) as AnyBlueprint;
        const fragment = blueprintShareFragment(await encodeBlueprintShare(blueprint));
        const page = await context.newPage();
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(String(error)));
        await page.goto(`${server.origin}/${example.kind}.html?devtools=0${fragment}`);
        await page
          .locator(ROOTS[example.kind])
          .first()
          .waitFor({ state: 'visible', timeout: 30_000 });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(400);
        if (errors.length > 0) throw new Error(errors.join('\n'));
        await save(page, example.kind, contentExampleCover(example));
        if (example.prototype) {
          // The flagship's highlights: each slide, every step revealed.
          for (const slide of FLAGSHIP_SLIDES) {
            await page.evaluate((hash) => {
              window.location.hash = hash;
            }, `#/${slide.id}/${slide.step}`);
            await page
              .locator(`[data-tx-deck-slide][data-tx-deck-active="true"]`)
              .first()
              .waitFor();
            await page.waitForLoadState('networkidle');
            await page.waitForTimeout(600);
            await save(page, 'deck', flagshipSlideCover(slide));
          }
        }
        if (errors.length > 0) throw new Error(errors.join('\n'));
      } catch (error) {
        failures += 1;
        console.error(`✗ ${example.name}: ${error instanceof Error ? error.message : error}`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
  if (failures > 0) process.exitCode = 1;
}

await main();
