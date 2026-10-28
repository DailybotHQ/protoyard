import { expect, test } from '@playwright/test';

const deckPort = Number(process.env.PROTOYARD_E2E_DECK_PORT ?? 4891);
const deckUrl = `http://127.0.0.1:${deckPort}/`;

async function expectLocation(
  page: import('@playwright/test').Page,
  slideId: string,
  step: number
): Promise<void> {
  await expect(page.locator('[data-py-deck-app]')).toHaveAttribute('data-slide-id', slideId);
  await expect(page.locator('[data-py-deck-app]')).toHaveAttribute('data-slide-step', String(step));
  await expect(page).toHaveURL(new RegExp(`#/${slideId}/${step}$`));
}

test.describe('deck navigation on a built catalog deck', () => {
  test.skip(
    process.env.PROTOYARD_E2E_DECK !== '1',
    'Opt-in: PROTOYARD_E2E_DECK=1 (or name a deck spec) starts the built deck server.'
  );
  test('opens stable slide and step links and moves with arrows and space', async ({ page }) => {
    await page.goto(`${deckUrl}#/path/1`);
    await expectLocation(page, 'path', 1);

    await page.keyboard.press('ArrowRight');
    await expectLocation(page, 'path', 2);
    // Three step labels: positions 0 (initial) to 3, and the last one is reachable.
    await page.keyboard.press('ArrowRight');
    await expectLocation(page, 'path', 3);
    await page.keyboard.press(' ');
    await expectLocation(page, 'pillars', 0);
    await page.keyboard.press('ArrowLeft');
    await expectLocation(page, 'path', 3);
  });

  test('bare slide clicks advance while interactive controls and links do not', async ({
    page,
  }) => {
    await page.goto(`${deckUrl}#/cover/0`);
    // The @texuli/slides stage marks each slide with data-tx-deck-slide.
    await page.locator('[data-tx-deck-slide="cover"]').click({ position: { x: 8, y: 8 } });
    await expectLocation(page, 'divider', 0);

    await page.goto(`${deckUrl}#/quiz/0`);
    const answer = page.getByRole('button', { name: 'Placeholder series for layout' });
    await answer.click();
    await expect(answer).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-py-deck-app]')).toHaveAttribute('data-slide-id', 'quiz');

    await page.evaluate(() => {
      document.addEventListener(
        'click',
        (event) => {
          if ((event.target as Element | null)?.closest('a[href^="https://example.com/"]')) {
            event.preventDefault();
          }
        },
        { capture: true, once: true }
      );
    });
    await page.getByRole('link', { name: 'Deck guide' }).click();
    await expect(page.locator('[data-py-deck-app]')).toHaveAttribute('data-slide-id', 'quiz');
  });

  test('overview selection and fullscreen escape stay on the chosen slide', async ({ page }) => {
    await page.goto(`${deckUrl}#/cover/0`);
    await page.keyboard.press('o');
    // The stage's overview is a navigation landmark of slide cards.
    const overview = page.getByRole('navigation', { name: 'Slides' });
    await expect(overview).toBeVisible();
    await page.locator('[data-tx-deck-overview-item="quiz"]').click();
    await expectLocation(page, 'quiz', 0);
    await expect(overview).toHaveCount(0);

    // Full screen holds the stage root (the deck, without the host page).
    const stage = page.locator('.tx-deck-stage');
    await page.keyboard.press('f');
    await expect
      .poll(() => stage.evaluate((root) => document.fullscreenElement === root))
      .toBe(true);
    await page.keyboard.press('f');
    await expect.poll(() => stage.evaluate(() => document.fullscreenElement === null)).toBe(true);
    await expectLocation(page, 'quiz', 0);

    await page.keyboard.press('?');
    await expect(page.getByRole('dialog', { name: 'Controls and shortcuts' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Controls and shortcuts' })).toHaveCount(0);
  });

  test('honors a reduced-motion browser preference without disabling navigation', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${deckUrl}#/cover/0`);
    await expect
      .poll(() => page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches))
      .toBe(true);

    await expect(page.locator('.tx-deck-stage')).toHaveAttribute('data-motion', 'reduce');
    await page.keyboard.press('ArrowRight');
    await expectLocation(page, 'divider', 0);
    await expect
      .poll(() =>
        page
          .locator('[data-tx-deck-slide="divider"]')
          .evaluate((slide) => getComputedStyle(slide).animationName)
      )
      .toBe('none');
  });

  test('a horizontal touch swipe advances a slide on mobile', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'mobile',
      'Touch swipe is exercised in the mobile project.'
    );
    await page.goto(`${deckUrl}#/cover/0`);
    // Swipes are read on the stage canvas.
    const root = page.locator('[data-tx-deck-canvas]');
    await root.evaluate((element) => {
      element.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          pointerId: 7,
          pointerType: 'touch',
          clientX: 280,
          clientY: 200,
        })
      );
    });
    await page.waitForTimeout(100);
    await root.evaluate((element) => {
      element.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          pointerId: 7,
          pointerType: 'touch',
          clientX: 180,
          clientY: 202,
        })
      );
    });
    await expectLocation(page, 'divider', 0);
  });
});
