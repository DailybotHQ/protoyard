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
  test('opens stable slide and step links and moves with arrows and space', {
    tag: '@desktop',
  }, async ({ page }) => {
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

  test('a horizontal touch swipe advances a slide on mobile', { tag: '@mobile' }, async ({
    page,
  }) => {
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
