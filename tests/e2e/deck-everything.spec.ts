import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { slidePositionCount } from '../../packages/decks/src/navigation/index.ts';
import { type DeckSlide, safeParseDeck } from '../../packages/decks/src/schema/index.ts';
import { expectAccessible } from './support/a11y.ts';

/*
 * The "everything" reference deck (T-everything-deck, AC-everything-walk):
 * every slide and every step of blueprints/decks/everything.json renders with
 * no console error and no serious or critical axe violation, in light and
 * dark, on the desktop and Pixel 7 projects. One test per slide and scheme,
 * so a failure names the slide.
 *
 * Opt-in: PROTOYARD_E2E_DECK=1 starts the built deck fixture server
 * (tests/e2e/fixtures/deck-navigation, `?deck=everything&mode=<scheme>`).
 */

const deckPort = Number(process.env.PROTOYARD_E2E_DECK_PORT ?? 4891);
const deckUrl = `http://127.0.0.1:${deckPort}/`;
const FILE = join(process.cwd(), 'blueprints/decks/everything.json');
const PARSED = safeParseDeck((JSON.parse(readFileSync(FILE, 'utf8')) as { deck: unknown }).deck);
if (!PARSED.success || !PARSED.deck) throw new Error(`${FILE} is not a valid deck`);
const DECK_SLIDES = PARSED.deck.slides as DeckSlide[];
const SLIDES = DECK_SLIDES.map((slide) => slide.id);
/**
 * The last step each slide declares, from the engine DeckApp navigates with
 * (`slidePositionCount` over the parsed deck): positions run 0 … last.
 */
const LAST_STEP = new Map(DECK_SLIDES.map((slide) => [slide.id, slidePositionCount(slide) - 1]));

const root = (page: Page) => page.locator('[data-py-deck-app]');

/** Waits until the active slide has no loading placeholder left (lazy layouts and block families). */
async function settled(page: Page, id: string): Promise<void> {
  const slide = page.locator(`[data-tx-deck-slide="${id}"]`);
  await expect(slide).toBeVisible();
  await expect(slide.locator('[role="status"][aria-label^="Loading"]')).toHaveCount(0, {
    timeout: 15_000,
  });
  // Lazy block families finish mounting after their chunk arrives: let the
  // network, fonts and two frames settle before measuring.
  await page.waitForLoadState('networkidle');
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        void document.fonts.ready.then(() =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        );
      })
  );
}

test.describe('the everything deck', () => {
  test.skip(
    process.env.PROTOYARD_E2E_DECK !== '1',
    'Opt-in: PROTOYARD_E2E_DECK=1 starts the built deck fixture server.'
  );

  for (const colorScheme of ['light', 'dark'] as const) {
    test.describe(`${colorScheme} mode`, () => {
      test.use({ colorScheme, reducedMotion: 'reduce' });

      for (const id of SLIDES) {
        test(`slide ${id} renders every step`, async ({ page }, testInfo) => {
          const errors: string[] = [];
          page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
          page.on('console', (message) => {
            if (message.type() === 'error') errors.push(`console: ${message.text()}`);
          });

          await page.goto(`${deckUrl}?deck=everything&mode=${colorScheme}#/${id}/0`);
          await expect(root(page)).toHaveAttribute('data-slide-id', id);
          await expect(root(page)).toHaveAttribute('data-py-deck-mode', colorScheme);
          await settled(page, id);
          const label = `${id} (${colorScheme}, ${testInfo.project.name})`;
          await expectAccessible(page, testInfo, { label: `${label} step 0` });

          // Walk the slide's steps with the keyboard, one per press, until the
          // deck moves on, and require every declared step to be reached.
          const last = LAST_STEP.get(id) ?? 0;
          await root(page).focus();
          let step = 0;
          for (let guard = 0; guard < 40; guard++) {
            await page.keyboard.press('ArrowRight');
            const next = await root(page).getAttribute('data-slide-step');
            const at = await root(page).getAttribute('data-slide-id');
            if (at !== id || Number(next) <= step) break;
            expect(Number(next), `${label}: one step per press`).toBe(step + 1);
            step = Number(next);
            await settled(page, id);
          }
          expect(step, `${label}: steps reached vs. declared (slidePositionCount)`).toBe(last);
          if (step > 0) {
            // The stage drops a hash change that lands during a slide transition: let the
            // last move's transition finish before following the deep link.
            await page.evaluate(() =>
              Promise.race([
                Promise.all(
                  document
                    .getAnimations()
                    .filter(
                      (animation) => animation.effect?.getComputedTiming().iterations !== Infinity
                    )
                    .map((animation) => animation.finished.catch(() => undefined))
                ),
                new Promise((done) => setTimeout(done, 2_000)),
              ])
            );
            await page.waitForFunction(
              () =>
                !document.querySelector('[data-tx-deck-enter]') &&
                !document.documentElement.matches(':active-view-transition')
            );
            await page.goto(`${deckUrl}?deck=everything&mode=${colorScheme}#/${id}/${step}`);
            await expect(root(page)).toHaveAttribute('data-slide-step', String(step));
            await settled(page, id);
            await expectAccessible(page, testInfo, { label: `${label} step ${step}` });
          }
          expect(errors, `${label}: console and page errors`).toEqual([]);
        });
      }
    });
  }

  // The catalog quiz showed `**tone**` literally before T-a11y-mobile. (The card
  // image fix needs a build that ships avatars: content-kinds-a11y.spec.ts.)
  test('the quiz formats its Markdown prompt', async ({ page }) => {
    await page.goto(`${deckUrl}?deck=everything#/poll-quiz/0`);
    await settled(page, 'poll-quiz');
    const legend = page.locator('[data-tx-deck-slide="poll-quiz"] legend', { hasText: 'tone' });
    await expect(legend).toHaveText('What does a tone replace?');
    await expect(legend.locator('strong')).toHaveText('tone');
  });

  // The map block once rendered unstyled on deck pages (blocks-ui's stylesheet
  // did not scan views-ui's map): no basemap, list rows stacked, an axe
  // "button-name" on its list, and no fill for an `accent` place.
  test('the map block draws its basemap, its markers, its place list and every place tone', async ({
    page,
  }) => {
    await page.goto(`${deckUrl}?deck=everything#/map/0`);
    await settled(page, 'map');
    // @protoyard/blocks-ui paints the map family through @texuli/blocks' MapBlockView.
    const map = page.locator('[data-tx-deck-slide="map"] [data-py-block-family="map"]');
    const canvas = map.locator('[data-tx-map-canvas]');
    await expect(canvas).toHaveAccessibleName('Stores on the simulated map');
    // The simulated basemap is drawn (land, roads and labels), not an empty frame.
    const basemap = canvas.locator('svg').first();
    const box = await basemap.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThan(40);
    expect(await basemap.locator('path').count()).toBeGreaterThan(3);
    await expect(basemap.locator('text', { hasText: 'Meridian River' })).toHaveCount(1);
    const places = ['north', 'market'];
    for (const id of places) {
      // Every point is a marker on the basemap…
      const marker = basemap.locator(`[data-tx-map-marker="${id}"]`);
      await expect(marker).toHaveCount(1);
      const markerBox = await marker.boundingBox();
      expect(markerBox?.width ?? 0, `${id} marker`).toBeGreaterThan(0);
      // …and a named row in the place list, whose tone dot is filled.
      const place = map.locator(`[data-tx-map-place="${id}"]`);
      await expect(place).toHaveAccessibleName(/\S/);
      const fill = await place
        .locator('span[aria-hidden="true"]')
        .first()
        .evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(fill, `${id} tone fill`).not.toBe('rgba(0, 0, 0, 0)');
    }
    await expect(map.locator('[data-tx-map-place-list] li[aria-posinset]')).toHaveCount(
      places.length
    );
    // The route between the two places is summarized as text.
    await expect(map.locator('[data-tx-map-route-summary]')).toContainText('2 stops');
  });
});
