/**
 * Built-deck visual QA sweep.
 *
 * Serves a Vite harness that mounts `DeckApp` with a kind:deck blueprint,
 * visits every slide and step, checks overflow / text / images / fragments /
 * navigation / browser noise, writes screenshots + contact sheet under tmp/,
 * and exits 1 on deterministic errors (heuristics stay warnings).
 *
 *   pnpm exec tsx scripts/sweep-deck.ts --blueprint blueprints/decks/example.json
 *   pnpm exec tsx scripts/sweep-deck.ts --out tmp/deck-sweep --no-shots
 *
 * Playwright uses a private loopback port (ephemeral by default). Do not use
 * gallery ports 4321 / 4500 / 4501.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type ConsoleMessage, chromium, type Page, type Request } from '@playwright/test';
import { createServer, type Plugin, type ViteDevServer } from 'vite';
import {
  buildReport,
  classifyBrowserNoise,
  classifySlideMeasure,
  type DeckSlideMeasure,
  type DeckSweepIssue,
  type DeckSweepSlideRow,
  exitCodeForReport,
  MIN_BODY_PX,
  MIN_LABEL_PX,
  parseDeckSweepArgs,
  planDeckVisits,
  renderDeckContactSheet,
} from './lib/deck-sweep.ts';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

async function main(argv: string[]): Promise<number> {
  const args = parseDeckSweepArgs(argv);
  const startedAt = new Date().toISOString();
  const blueprintPath = resolve(ROOT, args.blueprint);
  const blueprint = JSON.parse(readFileSync(blueprintPath, 'utf8')) as unknown;
  const plan = planDeckVisits(blueprint);

  if (args.dryRun) {
    const finishedAt = new Date().toISOString();
    const slides: DeckSweepSlideRow[] = plan.slides.map((slide) => ({
      slideId: slide.id,
      step: 0,
      title: slide.title,
      issues: [],
    }));
    const report = buildReport({
      blueprint: args.blueprint,
      startedAt,
      finishedAt,
      viewport: args.viewport,
      slides,
    });
    const outDir = resolve(ROOT, args.out);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'sweep.json'), `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(join(outDir, 'index.html'), renderDeckContactSheet(report));
    console.log(`dry-run: ${plan.slides.length} slides → ${args.out}`);
    return exitCodeForReport(report);
  }

  const outDir = resolve(ROOT, args.out);
  const shotsDir = join(outDir, 'shots');
  mkdirSync(shotsDir, { recursive: true });

  const server = await startHarness(blueprintPath, args.port);
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox'],
  });
  const rows: DeckSweepSlideRow[] = [];

  try {
    const context = await browser.newContext({
      viewport: args.viewport,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const noise = attachNoise(page);

    await page.goto(server.origin, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForSelector('[data-py-deck-app]', { timeout: 30_000 });
    await page.evaluate(() => document.fonts?.ready);

    for (const slide of plan.slides) {
      for (let step = 0; step < slide.stepCount; step += 1) {
        noise.clear();
        const issues: DeckSweepIssue[] = [];
        const landed = await goTo(page, slide.id, step);
        if (!landed) {
          issues.push({
            code: 'navigation',
            severity: 'error',
            slideId: slide.id,
            step,
            message: `navigation did not land on ${slide.id} step ${step}`,
          });
        } else {
          // Reveal remaining fragments for measurement (overview-style full step).
          await page.keyboard.press('End').catch(() => undefined);
          await page.waitForTimeout(120);
          const measure = await measureSlide(page, slide.id, step, slide.title);
          issues.push(...classifySlideMeasure(measure));
        }
        issues.push(...classifyBrowserNoise(slide.id, step, noise.snapshot()));

        let shotRel: string | undefined;
        if (!args.noShots) {
          const file = `${slide.id}-s${step}.png`;
          await page.screenshot({ path: join(shotsDir, file), type: 'png' });
          shotRel = `shots/${file}`;
        }

        rows.push({
          slideId: slide.id,
          step,
          title: slide.title,
          shot: shotRel,
          issues,
        });
      }
    }

    await context.close();
  } finally {
    await browser.close();
    await server.close();
  }

  const finishedAt = new Date().toISOString();
  const report = buildReport({
    blueprint: args.blueprint,
    startedAt,
    finishedAt,
    viewport: args.viewport,
    slides: rows,
  });
  writeFileSync(join(outDir, 'sweep.json'), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(outDir, 'index.html'), renderDeckContactSheet(report));
  console.log(
    `deck-sweep: ${report.slides.length} visits · ${report.errors} errors · ${report.warnings} warnings → ${args.out}`
  );
  return exitCodeForReport(report);
}

async function startHarness(
  blueprintPath: string,
  port: number
): Promise<{ origin: string; close: () => Promise<void> }> {
  const harnessDir = join(ROOT, 'scripts/fixtures/deck-sweep-harness');
  const { svelte } = await import('@sveltejs/vite-plugin-svelte');
  const server: ViteDevServer = await createServer({
    root: harnessDir,
    configFile: false,
    appType: 'spa',
    server: {
      host: '127.0.0.1',
      port: port || undefined,
      strictPort: port > 0,
      fs: { allow: [ROOT] },
    },
    plugins: [
      ...svelte({
        compilerOptions: { runes: true },
      }),
      workspacePackagesPlugin(ROOT),
      {
        name: 'protoyard-deck-sweep-blueprint',
        resolveId(id) {
          if (id === '@deck-blueprint.json' || id === '\0virtual:deck-blueprint') {
            return '\0virtual:deck-blueprint';
          }
          return null;
        },
        load(id) {
          if (id !== '\0virtual:deck-blueprint') return null;
          const raw = readFileSync(blueprintPath, 'utf8');
          // Force JS so Vite's JSON plugin never parses the virtual module.
          return `export default ${raw};\n`;
        },
      },
    ],
  });

  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') {
    await server.close();
    throw new Error('Deck sweep harness did not bind a TCP port.');
  }
  const origin = `http://127.0.0.1:${address.port}/`;
  return {
    origin,
    close: async () => {
      await server.close();
    },
  };
}

/** Resolve `@protoyard/<pkg>` and subpaths into `packages/<pkg>/src`. */
function workspacePackagesPlugin(root: string): Plugin {
  return {
    name: 'protoyard-workspace-packages',
    enforce: 'pre',
    resolveId(id) {
      const match = /^@protoyard\/([^/]+)(?:\/(.*))?$/.exec(id);
      if (!match) return null;
      const pkg = match[1] as string;
      const rest = match[2];
      const base = resolve(root, 'packages', pkg, 'src');
      const candidates = rest
        ? [
            resolve(base, `${rest}.ts`),
            resolve(base, `${rest}.js`),
            resolve(base, `${rest}.svelte`),
            resolve(base, `${rest}.css`),
            resolve(base, rest, 'index.ts'),
            resolve(base, rest, 'index.js'),
            resolve(base, rest),
          ]
        : [resolve(base, 'index.ts'), resolve(base, 'index.js')];
      for (const candidate of candidates) {
        if (!existsSync(candidate)) continue;
        try {
          if (statSync(candidate).isFile()) return candidate;
        } catch {
          // try next
        }
      }
      return null;
    },
  };
}

function attachNoise(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const requestFailed: string[] = [];
  const onConsole = (message: ConsoleMessage) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  };
  const onPageError = (error: Error) => {
    pageErrors.push(error.message);
  };
  const onRequestFailed = (request: Request) => {
    requestFailed.push(request.url());
  };
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('requestfailed', onRequestFailed);
  return {
    clear() {
      consoleErrors.length = 0;
      pageErrors.length = 0;
      requestFailed.length = 0;
    },
    snapshot() {
      return {
        console: [...consoleErrors],
        pageErrors: [...pageErrors],
        requestFailed: [...requestFailed],
      };
    },
  };
}

async function goTo(page: Page, slideId: string, step: number): Promise<boolean> {
  await page.evaluate(
    ({ id, step: nextStep }) => {
      const hash = nextStep > 0 ? `#/${id}/${nextStep}` : `#/${id}/0`;
      if (location.hash !== hash) location.hash = hash;
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    },
    { id: slideId, step }
  );
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const ok = await page.evaluate((id) => {
      const app = document.querySelector('[data-py-deck-app]');
      return app?.getAttribute('data-slide-id') === id;
    }, slideId);
    if (ok) return true;
    await page.waitForTimeout(50);
  }
  return false;
}

async function measureSlide(
  page: Page,
  slideId: string,
  step: number,
  title: string
): Promise<DeckSlideMeasure> {
  return page.evaluate(
    ({ slideId: id, step: stepIndex, title: slideTitle, minBody, minLabel }) => {
      const app = document.querySelector('[data-py-deck-app]');
      const canvas =
        document.querySelector('[data-testid="deck-canvas"]') ||
        document.querySelector('[data-py-deck-app]');
      const slide =
        document.querySelector(`[data-py-deck-slide="${id}"]`) ||
        document.querySelector('[data-py-deck-slide]');
      const measure: {
        slideId: string;
        step: number;
        title: string;
        hasApp: boolean;
        overflows: string[];
        smallFonts: string[];
        images: Array<{
          src: string;
          ok: boolean;
          hasWidth: boolean;
          hasHeight: boolean;
          hasAlt: boolean;
        }>;
        fragmentIndexes: Array<number | null>;
        contrast: string[];
      } = {
        slideId: id,
        step: stepIndex,
        title: slideTitle,
        hasApp: Boolean(app),
        overflows: [],
        smallFonts: [],
        images: [],
        fragmentIndexes: [],
        contrast: [],
      };
      if (!app || !canvas || !slide) return measure;

      // Bound to the active slide frame (scaled canvas child), not the app chrome.
      const frame = slide.getBoundingClientRect();
      const nodes = slide.querySelectorAll('*');
      for (const el of nodes) {
        const tag = el.tagName.toUpperCase();
        if (['SCRIPT', 'STYLE', 'BR', 'DEFS', 'TITLE'].includes(tag)) continue;
        if (
          el.closest(
            '[data-py-deck-chrome], [data-py-deck-overview], [data-py-deck-help], [data-py-deck-blackout], [data-py-deck-live]'
          )
        ) {
          continue;
        }
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        // 12px slack absorbs sub-pixel transform rounding on the scaled canvas.
        if (
          rect.left < frame.left - 12 ||
          rect.top < frame.top - 12 ||
          rect.right > frame.right + 12 ||
          rect.bottom > frame.bottom + 12
        ) {
          measure.overflows.push(
            `${tag.toLowerCase()} outside slide (${Math.round(rect.left - frame.left)},${Math.round(rect.top - frame.top)})`
          );
        }
        const textNodes = [...el.childNodes].filter(
          (node) => node.nodeType === 3 && (node.textContent ?? '').trim().length > 0
        );
        if (textNodes.length > 0 && !el.closest('aside')) {
          const fontSize = parseFloat(cs.fontSize);
          const isLabel = Boolean(
            el.closest(
              '[data-py-deck-slide-number], [data-py-deck-chrome], kbd, small, .text-xs, [data-label]'
            )
          );
          const min = isLabel ? minLabel : minBody;
          if (Number.isFinite(fontSize) && fontSize + 0.01 < min) {
            const sample = (textNodes[0]?.textContent ?? '').trim().slice(0, 32);
            measure.smallFonts.push(`${fontSize}px<${min} "${sample}"`);
          }
        }
        if (tag === 'IMG') {
          const img = el as HTMLImageElement;
          measure.images.push({
            src: img.getAttribute('src') ?? '',
            ok: img.complete && img.naturalWidth > 0,
            hasWidth:
              img.hasAttribute('width') || Boolean(img.getAttribute('style')?.includes('width')),
            hasHeight:
              img.hasAttribute('height') || Boolean(img.getAttribute('style')?.includes('height')),
            hasAlt: img.hasAttribute('alt'),
          });
        }
        if (el.hasAttribute('data-fragment-index') || el.classList.contains('fragment')) {
          const raw = el.getAttribute('data-fragment-index');
          measure.fragmentIndexes.push(raw === null ? null : Number(raw));
        }
      }
      // Heuristic contrast placeholder: report nothing here; calibrated later.
      // Keeping the field so reports stay stable when the estimator lands.
      void stepIndex;
      return measure;
    },
    { slideId, step, title, minBody: MIN_BODY_PX, minLabel: MIN_LABEL_PX }
  );
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}

export { main };
