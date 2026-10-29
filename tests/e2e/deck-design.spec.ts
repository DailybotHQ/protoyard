import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Locator, type Page, test } from '@playwright/test';
import {
  classifyDeckDesign,
  type DeckDesignFinding,
  type DeckDesignMeasure,
  formatDeckDesignFindings,
  planDeckDesign,
} from '../../scripts/lib/deck-design.ts';
import { expectAccessible } from './support/a11y.ts';

/**
 * Deck design gate: the flagship deck (blueprints/decks/protoyard-create-anything.json)
 * at level 1 (the built player's deck.html) and level 2 (the built
 * create-anything-deck prototype), on desktop and phone. On every slide:
 * nothing sticks out of the stage, no text is drawn over other text, the deck
 * theme and the slide (or deck) background preset are applied, cover, divider
 * and big-stat titles render at display size relative to the stage, and every
 * chart series has geometry. The interactive blocks respond (poll vote, quiz
 * answer, calculator recompute, chart kind switch) and the embedded app starts
 * on demand. Thresholds and rules live in scripts/lib/deck-design.ts.
 *
 * Screenshots of every slide land in tmp/deck-design/<level>-<project>/ for a
 * person to review; automated checks do not judge taste. They are never
 * committed (tmp/ is ignored).
 *
 * Opt-in like the other deck specs. Servers: the built player
 * (PROTOYARD_E2E_PLAYER_PORT, default 4861) and the built prototype
 * (PROTOYARD_E2E_DECK_PROTOTYPE_PORT, default 4892).
 */

test.skip(
  process.env.PROTOYARD_E2E_DECK !== '1',
  'set PROTOYARD_E2E_DECK=1 (needs the built player and create-anything-deck servers)'
);

const DECK_FILE = join(process.cwd(), 'blueprints/decks/protoyard-create-anything.json');
const BLUEPRINT = JSON.parse(readFileSync(DECK_FILE, 'utf8')) as unknown;
const PLAN = planDeckDesign(BLUEPRINT);
const PLAYER = `http://127.0.0.1:${Number(process.env.PROTOYARD_E2E_PLAYER_PORT ?? 4861)}/`;
const PROTOTYPE = `http://127.0.0.1:${Number(process.env.PROTOYARD_E2E_DECK_PROTOTYPE_PORT ?? 4892)}/`;

const LEVELS = {
  /** Level 1: the player runs the JSON (served to `?src=` by interception). */
  player: async (page: Page) => {
    const fixture = `${PLAYER}kind-fixtures/protoyard-create-anything.json`;
    await page.route(fixture, (route) =>
      route.fulfill({ contentType: 'application/json', body: readFileSync(DECK_FILE, 'utf8') })
    );
    await page.goto(
      `${PLAYER}deck.html?devtools=0&src=./kind-fixtures/protoyard-create-anything.json`
    );
  },
  /** Level 2: the generated prototype built from the same blueprint. */
  prototype: async (page: Page) => {
    await page.goto(`${PROTOTYPE}?devtools=0`);
  },
} as const;
type Level = keyof typeof LEVELS;

test.use({ reducedMotion: 'reduce' });

const deckRoot = (page: Page) => page.locator('[data-py-deck-app]');

async function open(page: Page, level: Level): Promise<void> {
  await LEVELS[level](page);
  await expect(deckRoot(page)).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => document.fonts?.ready);
}

/** The active slide on the @texuli/slides stage (its neighbours are mounted, inert and hidden). */
function activeSlide(page: Page, slideId: string): Locator {
  return page.locator(`[data-tx-deck-slide="${slideId}"][data-tx-deck-active="true"]`);
}

async function goTo(page: Page, slideId: string): Promise<Locator> {
  await page.evaluate((id) => {
    location.hash = `#/${id}/0`;
  }, slideId);
  await expect(deckRoot(page)).toHaveAttribute('data-slide-id', slideId);
  const slide = activeSlide(page, slideId);
  await expect(slide).toBeVisible();
  // Each layout family is its own chunk: wait until the slide has its layout.
  await expect(
    slide.locator('[role="status"][aria-label="Loading slide layout"], .tx-deck-stage__loading')
  ).toHaveCount(0, { timeout: 15_000 });
  // Block families are lazy chunks: wait until every block on the slide is ready
  // (no loading skeleton) before interactive specs read data-py-block roots.
  await expect(slide.locator('[role="status"][aria-label="Loading block"]')).toHaveCount(0, {
    timeout: 30_000,
  });
  await expect(slide.locator('[aria-label="Loading chart"]')).toHaveCount(0, {
    timeout: 30_000,
  });
  return slide;
}

/** Measures the active slide as drawn (runs in the page; self-contained). */
function measure(page: Page, slideId: string): Promise<DeckDesignMeasure> {
  return page.evaluate((id) => {
    type B = { x: number; y: number; width: number; height: number };
    const toBox = (rect: DOMRect): B => ({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    });
    const app = document.querySelector('[data-py-deck-app]');
    const candidates = [
      ...document.querySelectorAll<HTMLElement>(
        `[data-tx-deck-slide="${CSS.escape(id)}"][data-tx-deck-active="true"]`
      ),
    ].filter((node) => node.checkVisibility({ opacityProperty: true, visibilityProperty: true }));
    const slide = candidates[0];
    const empty = {
      slideId: id,
      stage: null,
      theme: app?.getAttribute('data-py-deck-theme') ?? null,
      background: null,
      displayTitlePx: null,
      textBoxes: [],
      contentBoxes: [],
      charts: 0,
      series: [],
    };
    if (!slide) return empty;
    // The stage slide is the fixed canvas frame (1280 × 720 for 16:9).
    const frame = slide;
    const stage = toBox(frame.getBoundingClientRect());
    // The canvas scales the slide with a CSS transform (a phone shows it small):
    // computed font sizes are in canvas pixels, boxes in screen pixels.
    const scale = frame.offsetWidth > 0 ? stage.width / frame.offsetWidth : 1;
    const shown = (element: Element | null) =>
      element instanceof Element &&
      element.checkVisibility({ opacityProperty: true, visibilityProperty: true });

    /**
     * Visually hidden text under any class name (Tailwind's `.sr-only`, Texuli's
     * `.tx-sr-only` and its families' own): a box clipped to nothing, or a 1 px box
     * that hides its overflow. Its text ranges still report full-size rects.
     */
    const visuallyHidden = (element: Element): boolean => {
      for (let at: Element | null = element; at && at !== frame; at = at.parentElement) {
        const style = getComputedStyle(at);
        const clipped =
          /^rect\(0(px)?,? 0(px)?,? 0(px)?,? 0(px)?\)$/.test(style.clip) ||
          style.clipPath === 'inset(50%)';
        const pixel =
          at instanceof HTMLElement &&
          at.offsetWidth <= 1 &&
          at.offsetHeight <= 1 &&
          style.overflow === 'hidden';
        if (clipped || pixel) return true;
      }
      return false;
    };
    const textBoxes: { label: string; box: B }[] = [];
    let displayTitlePx = 0;
    const walker = document.createTreeWalker(frame, NodeFilter.SHOW_TEXT);
    let index = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      const parent = node.parentElement;
      if (!text || !parent || !shown(parent)) continue;
      // Screen-reader-only text is clipped to a pixel; it is not drawn.
      if (parent.closest('.sr-only') || visuallyHidden(parent)) continue;
      index += 1;
      const range = document.createRange();
      range.selectNodeContents(node);
      const label = `${text.slice(0, 48)} [${index}]`;
      // A range box spans the font's whole ascent and descent (about 1.2x the
      // font size); the line box a design sets is the line-height. Measure that.
      const style = getComputedStyle(parent);
      const fontPx = Number.parseFloat(style.fontSize) * scale;
      const linePx =
        style.lineHeight === 'normal' ? fontPx * 1.2 : Number.parseFloat(style.lineHeight) * scale;
      for (const rect of range.getClientRects()) {
        if (rect.width <= 1 || rect.height <= 1) continue;
        const height = Math.min(rect.height, linePx);
        textBoxes.push({
          label,
          box: { x: rect.x, y: rect.y + (rect.height - height) / 2, width: rect.width, height },
        });
      }
      const size = fontPx;
      if (size > displayTitlePx && !parent.closest('[data-py-deck-footer], .tx-deck-stage__footer'))
        displayTitlePx = size;
    }
    const media = [...frame.querySelectorAll('img, canvas, iframe, svg')]
      .filter((element) => !element.parentElement?.closest('svg') && shown(element))
      .map((element) => ({
        label: `<${element.tagName.toLowerCase()}>`,
        box: toBox(element.getBoundingClientRect()),
      }));

    // Protoyard charts mark their root; the stage's chart layout paints Texuli's chart
    // block, whose root is the figure (or image) around its series marks.
    const roots = new Set<Element>(frame.querySelectorAll('[data-py-chart]'));
    for (const mark of frame.querySelectorAll('[data-series]')) {
      if ([...roots].some((root) => root.contains(mark))) continue;
      const root = mark.closest('figure, [role="img"]');
      if (root) roots.add(root);
    }
    const charts = [...roots].filter(shown);
    const series: {
      chart: string;
      series: string;
      area: number;
      hasPath: boolean;
    }[] = [];
    charts.forEach((chart, chartIndex) => {
      const name = chart.getAttribute('aria-label') ?? `chart ${chartIndex + 1}`;
      const byId = new Map<string, Element[]>();
      for (const mark of chart.querySelectorAll('[data-series]')) {
        const key = mark.getAttribute('data-series') ?? '';
        byId.set(key, [...(byId.get(key) ?? []), mark]);
      }
      for (const [key, marks] of byId) {
        let area = 0;
        let hasPath = true;
        for (const mark of marks) {
          const rect = mark.getBoundingClientRect();
          area += rect.width * Math.max(rect.height, 1);
          const paths =
            mark.tagName.toLowerCase() === 'path' ? [mark] : [...mark.querySelectorAll('path')];
          for (const path of paths) {
            const d = path.getAttribute('d') ?? '';
            if (!d.trim() || /NaN|undefined/.test(d)) hasPath = false;
          }
        }
        series.push({ chart: name, series: key, area, hasPath });
      }
    });
    return {
      slideId: id,
      stage,
      theme: app?.getAttribute('data-py-deck-theme') ?? null,
      background:
        frame.querySelector('[data-tx-deck-bg-preset]')?.getAttribute('data-tx-deck-bg-preset') ??
        null,
      displayTitlePx: displayTitlePx || null,
      textBoxes,
      contentBoxes: [...textBoxes, ...media],
      charts: charts.length,
      series,
    };
  }, slideId);
}

/** What a slide's measurement looks like, rounded, to tell when it stops changing. */
const signature = (m: DeckDesignMeasure) =>
  JSON.stringify([
    m.stage && Math.round(m.stage.height),
    m.displayTitlePx,
    m.charts,
    m.series.map((s) => Math.round(s.area)),
    m.textBoxes.map((t) => [Math.round(t.box.x), Math.round(t.box.y), Math.round(t.box.height)]),
  ]);

/**
 * Measures once the slide has settled: lazy layout, block and chart chunks
 * loaded, text fitted to the stage. It waits (bounded) until what the plan
 * expects is drawn and two samples agree, then returns the last sample, so a
 * slide that never draws its chart or title still fails the gate.
 */
async function settled(
  page: Page,
  slide: (typeof PLAN.slides)[number]
): Promise<DeckDesignMeasure> {
  let last = await measure(page, slide.id);
  let previous = '';
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const ready =
      (!slide.charts || (last.charts > 0 && last.series.every((s) => s.area > 0))) &&
      (slide.displayTitleMinRatio === null || last.displayTitlePx !== null);
    const now = signature(last);
    if (ready && now === previous) return last;
    previous = now;
    await page.waitForTimeout(150);
    last = await measure(page, slide.id);
  }
  return last;
}

/*
 * Level 2 needs the built flagship prototype, which playwright.config.ts
 * serves only when this spec is named on the command line or the run sets
 * PROTOYARD_E2E_PROTOTYPES=create-anything-deck. A full deck run without
 * either skips level 2 with that reason instead of failing to connect.
 */
let prototypeServed: boolean | undefined;
async function requireLevel2Server(): Promise<void> {
  prototypeServed ??= await fetch(PROTOTYPE)
    .then((response) => response.ok)
    .catch(() => false);
  test.skip(
    !prototypeServed,
    'level 2 needs the flagship prototype server: run deck-design.spec.ts by path or set PROTOYARD_E2E_PROTOTYPES=create-anything-deck'
  );
}

for (const level of Object.keys(LEVELS) as Level[]) {
  test.describe(`flagship deck at ${level === 'player' ? 'level 1 (player)' : 'level 2 (prototype)'}`, () => {
    if (level === 'prototype') test.beforeEach(requireLevel2Server);
    test('every slide passes the design gate', async ({ page }, testInfo) => {
      test.setTimeout(240_000);
      const shots = join(process.cwd(), 'tmp', 'deck-design', `${level}-${testInfo.project.name}`);
      mkdirSync(shots, { recursive: true });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await open(page, level);
      const findings: DeckDesignFinding[] = [];
      for (const [index, slide] of PLAN.slides.entries()) {
        await goTo(page, slide.id);
        const measured = await settled(page, slide);
        const found = classifyDeckDesign(slide, measured, PLAN);
        findings.push(...found);
        if (found.length > 0) {
          // The measurements behind a finding, for whoever reads the report.
          await testInfo.attach(`${slide.id}.measure.json`, {
            body: JSON.stringify(measured, null, 2),
            contentType: 'application/json',
          });
          if (process.env.PROTOYARD_E2E_DECK_DEBUG === '1') {
            console.info(`[deck-design] ${slide.id} ${JSON.stringify(measured.textBoxes)}`);
          }
        }
        await page.screenshot({
          path: join(shots, `${String(index + 1).padStart(2, '0')}-${slide.id}.png`),
        });
      }
      expect(
        formatDeckDesignFindings(findings),
        `design findings (${level}, ${testInfo.project.name})`
      ).toEqual([]);
      expect(errors, 'page errors').toEqual([]);
    });

    test('interactive blocks respond and the embed starts on demand', async ({ page }) => {
      test.setTimeout(180_000);
      await open(page, level);
      const exercised = new Set<string>();
      for (const slide of PLAN.slides.filter((item) => item.interactive.length > 0)) {
        const root = await goTo(page, slide.id);
        for (const kind of slide.interactive) {
          // The embed family is painted by @texuli/blocks' EmbedApp (data-tx-block, data-tx-embed-started).
          const block = root
            .locator(
              kind === 'embed-app' ? '[data-tx-block="embed-app"]' : `[data-py-block="${kind}"]`
            )
            .first();
          await expect(block, `${slide.id}: ${kind} block`).toBeVisible();
          if (kind === 'poll') {
            await block.getByRole('list').getByRole('button').first().click();
            await block.getByRole('button', { name: 'Vote', exact: true }).click();
            await expect(block.getByRole('button', { name: 'Clear my vote' })).toBeVisible();
            // The results announce the viewer's own vote (saved under the active persona).
            await expect(block.getByRole('progressbar', { name: /: 1 vote$/ })).toBeVisible();
          } else if (kind === 'quiz') {
            for (const question of await block.locator('fieldset').all()) {
              await question.getByRole('button').first().click();
            }
            const submit = block.getByRole('button', { name: 'Submit answers' });
            if (await submit.count()) await submit.click();
            await expect(block.getByText(/^Score: \d+ of \d+/)).toBeVisible();
          } else if (kind === 'calculator') {
            const outputs = block.locator('[aria-live="polite"]').first();
            const before = await outputs.innerText();
            // Texuli's Slider: the thumb is the role="slider" control that takes the keys.
            const slider = block.getByRole('slider').first();
            await slider.focus();
            await page.keyboard.press('ArrowRight');
            await page.keyboard.press('ArrowRight');
            await expect(outputs, 'the calculator recomputes').not.toHaveText(before);
          } else if (kind === 'chart-controls') {
            const kinds = block.getByRole('group', { name: 'Chart kind' });
            const name = (
              await kinds.locator('button[aria-pressed="false"]').first().innerText()
            ).trim();
            // By name: once pressed, it no longer matches aria-pressed="false".
            const next = kinds.getByRole('button', { name, exact: true });
            await next.click();
            await expect(next).toHaveAttribute('aria-pressed', 'true');
            await expect(block.getByText(`Chart updated as ${name}`)).toBeAttached();
            const after = await settled(page, slide);
            expect(after.series.length, 'the switched chart draws series').toBeGreaterThan(0);
            expect(after.series.filter((s) => s.area <= 0 || !s.hasPath)).toEqual([]);
          } else if (kind === 'embed-app') {
            // A deck without an embed host (mountEmbed) shows a note instead of a start button.
            const startButton = block.getByRole('button', {
              name: /Open the live demo|Start the app/,
            });
            await expect(
              startButton,
              `${level}: no start button; without an embed host (mountEmbed) the app cannot start (a generated deck needs the deck template's embed-host wiring)`
            ).toBeVisible({ timeout: 5_000 });
            // Nothing runs until the viewer asks for it.
            await expect(block).toHaveAttribute('data-tx-embed-started', 'false');
            await expect(block.locator('iframe')).toHaveCount(0);
            await startButton.click();
            await expect(block).toHaveAttribute('data-tx-embed-started', 'true', {
              timeout: 30_000,
            });
            const frame = block.frameLocator('iframe');
            await expect(frame.locator('html')).toHaveAttribute('data-py-ready', 'true', {
              timeout: 30_000,
            });
            await expect(frame.getByRole('heading').first()).toBeVisible();
          }
          exercised.add(kind);
        }
      }
      expect([...exercised].sort()).toEqual(
        ['calculator', 'chart-controls', 'embed-app', 'poll', 'quiz'].sort()
      );
    });
  });
}

/*
 * The generated prototype's own custom slide (Final Review area B, finding 2).
 * It exists only at level 2: prototypes/create-anything-deck/blueprint.json
 * adds it, and the player shows a placeholder card instead. The component runs
 * inside the real deck: plan choice, yearly billing, the breakdown step, axe.
 */
test.describe('flagship deck at level 2 (prototype): the custom configurator slide', () => {
  test.beforeEach(requireLevel2Server);
  test('runs the owned component inside the deck', async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await open(page, 'prototype');
    const slide = await goTo(page, 'configurator');
    const configurator = slide.locator('[data-pricing-configurator]');
    await expect(configurator, 'the custom component mounts (not a placeholder card)').toBeVisible({
      timeout: 15_000,
    });
    const total = configurator.locator('[data-pricing-total]');
    const breakdown = configurator.locator('[data-pricing-breakdown]');
    await expect(total).toHaveText('$375');
    // The breakdown waits for the slide's first step.
    await expect(breakdown).toHaveCount(0);

    await configurator.getByRole('radio', { name: /Starter/ }).check();
    await expect(total).toHaveText('$200');
    await configurator.getByRole('checkbox', { name: /Pay yearly/ }).check();
    await expect(total).toHaveText('$160');
    // Clicks inside the component never advance the deck.
    await expect(deckRoot(page)).toHaveAttribute('data-slide-id', 'configurator');
    await expect(deckRoot(page)).toHaveAttribute('data-slide-step', '0');

    await page.locator('.tx-deck-stage').focus();
    await page.keyboard.press('ArrowRight');
    await expect(deckRoot(page)).toHaveAttribute('data-slide-step', '1');
    await expect(breakdown).toHaveText('25 seats × $8, minus $40 for paying yearly');

    await expectAccessible(page, testInfo, {
      label: `configurator (level 2, ${testInfo.project.name})`,
    });
    expect(errors, 'page errors').toEqual([]);
  });
});
