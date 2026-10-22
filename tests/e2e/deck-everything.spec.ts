import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
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
const SLIDES = (
  JSON.parse(readFileSync(FILE, 'utf8')) as { deck: { slides: { id: string }[] } }
).deck.slides.map((slide) => slide.id);

const root = (page: Page) => page.locator('[data-py-deck-app]');

/** Waits until the active slide has no loading placeholder left (lazy layouts and block families). */
async function settled(page: Page, id: string): Promise<void> {
  const slide = page.locator(`[data-py-deck-slide="${id}"]`);
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

          // Walk the slide's steps with the keyboard until the deck moves on.
          await root(page).focus();
          let step = 0;
          for (let guard = 0; guard < 40; guard++) {
            await page.keyboard.press('ArrowRight');
            const next = await root(page).getAttribute('data-slide-step');
            const at = await root(page).getAttribute('data-slide-id');
            if (at !== id || Number(next) <= step) break;
            step = Number(next);
            await settled(page, id);
          }
          if (step > 0) {
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
    const legend = page.locator('[data-py-deck-slide="poll-quiz"] legend', { hasText: 'tone' });
    await expect(legend).toHaveText('What does a tone replace?');
    await expect(legend.locator('strong')).toHaveText('tone');
  });
});
