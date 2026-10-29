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
    await page.locator('[data-py-deck-slide="cover"]').click({ position: { x: 8, y: 8 } });
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
    await expect(page.getByRole('dialog', { name: 'Slide overview' })).toBeVisible();
    await page.locator('[data-py-deck-overview-item="quiz"]').click();
    await expectLocation(page, 'quiz', 0);
    await expect(page.getByRole('dialog', { name: 'Slide overview' })).toHaveCount(0);

    await page.keyboard.press('f');
    await expect
      .poll(() =>
        page.locator('[data-py-deck-app]').evaluate((root) => document.fullscreenElement === root)
      )
      .toBe(true);
    await page.keyboard.press('f');
    await expect
      .poll(() =>
        page.locator('[data-py-deck-app]').evaluate(() => document.fullscreenElement === null)
      )
      .toBe(true);
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

    await page.keyboard.press('ArrowRight');
    await expectLocation(page, 'divider', 0);
    await expect
      .poll(() =>
        page
          .locator('[data-py-deck-slide="divider"]')
          .evaluate((slide) => getComputedStyle(slide).animationName)
      )
      .toBe('none');
  });

  // Regression: the reduced-motion reset (`@protoyard/themes/base.css`) gave
  // every element a 0.01ms transition of `all`, `visibility` included. A
  // slide mounted hidden beside the current one, with its blocks already
  // loaded, then revealed its subtree one nesting level per style update once
  // it turned active: on a slow device its buttons stayed hidden for frames
  // while the slide showed, so a screen reader (or axe) could meet a button
  // whose label was not visible yet. This rebuilds that state in the real deck
  // page (its stylesheet, reduced motion): content as deep as a deck block,
  // mounted inside a hidden container that then turns visible.
  for (const motion of ['media', 'toggle'] as const) {
    test(`reduced motion (${motion}) shows hidden-mounted content in the same frame it turns visible`, async ({
      page,
    }) => {
      if (motion === 'media') await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(`${deckUrl}#/cover/0`);
      await expectLocation(page, 'cover', 0);
      const result = await page.evaluate(async (useToggle) => {
        if (useToggle) document.documentElement.setAttribute('data-py-motion', 'reduce');
        const frame = () => new Promise((done) => requestAnimationFrame(() => done(null)));
        const container = document.createElement('div');
        container.style.visibility = 'hidden';
        let parent: HTMLElement = container;
        for (let depth = 0; depth < 25; depth += 1) {
          const child = document.createElement('div');
          parent.append(child);
          parent = child;
        }
        const button = document.createElement('button');
        button.type = 'button';
        const label = document.createElement('span');
        label.textContent = 'Deep option';
        button.append(label);
        parent.append(button);
        document.body.append(container);
        await frame();
        await frame();
        const before = getComputedStyle(label).visibility;
        container.style.visibility = 'visible';
        await frame();
        const after = getComputedStyle(label).visibility;
        const duration = getComputedStyle(button).transitionDuration;
        container.remove();
        return { before, after, duration };
      }, motion === 'toggle');
      expect(result.before).toBe('hidden');
      expect(result.after, 'the deepest label is visible on the next frame').toBe('visible');
      expect(result.duration, 'no transition under reduced motion').toBe('0s');
    });
  }

  test('a horizontal touch swipe advances a slide on mobile', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'mobile',
      'Touch swipe is exercised in the mobile project.'
    );
    await page.goto(`${deckUrl}#/cover/0`);
    const root = page.locator('[data-py-deck-app]');
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
