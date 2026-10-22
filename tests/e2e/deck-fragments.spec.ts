import { expect, type Locator, type Page, test } from '@playwright/test';

// Served by the deck-navigation fixture: `?deck=flagship` is the flagship deck
// (blueprints/decks/protoyard-create-anything.json), the bare URL the catalog deck.
const deckPort = Number(process.env.PROTOYARD_E2E_DECK_PORT ?? 4891);
const deckUrl = `http://127.0.0.1:${deckPort}/`;
const flagship = `${deckUrl}?deck=flagship`;

const app = (page: Page) => page.locator('[data-py-deck-app]');
const slide = (page: Page, id: string) => page.locator(`[data-py-deck-slide="${id}"]`);

async function expectLocation(page: Page, slideId: string, step: number): Promise<void> {
  await expect(app(page)).toHaveAttribute('data-slide-id', slideId);
  await expect(app(page)).toHaveAttribute('data-slide-step', String(step));
  await expect(page).toHaveURL(new RegExp(`#/${slideId}/${step}$`));
}

async function fragmentStates(scope: Locator): Promise<string[]> {
  return scope
    .locator('[data-py-fragment]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-py-fragment') ?? ''));
}

async function highlighted(scope: Locator): Promise<string[]> {
  return scope
    .locator('[data-highlighted]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-line') ?? ''));
}

test.describe('deck fragments on the flagship deck', () => {
  test('stepped blocks reveal in order, keep their space, and hide again going back', async ({
    page,
  }) => {
    await page.goto(`${flagship}#/loop/0`);
    await expectLocation(page, 'loop', 0);
    const loop = slide(page, 'loop');
    await expect.poll(() => fragmentStates(loop)).toEqual(['hidden', 'hidden']);

    // Hidden but laid out: the flow has a real box, is invisible and silent.
    const flow = loop.locator('[data-py-fragment]').first();
    const box = await flow.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThan(20);
    const layoutTop = () => flow.evaluate((el) => (el as HTMLElement).offsetTop);
    const top = await layoutTop();
    await expect(flow).toHaveAttribute('aria-hidden', 'true');
    await expect(flow).toHaveCSS('visibility', 'hidden');
    await expect(loop.getByText('Agents write the JSON')).toBeHidden();

    await page.keyboard.press('ArrowRight');
    await expectLocation(page, 'loop', 1);
    await expect.poll(() => fragmentStates(loop)).toEqual(['shown', 'hidden']);
    await expect(flow).toHaveCSS('visibility', 'visible');
    await expect(flow).not.toHaveAttribute('aria-hidden', 'true');
    // Revealing never moves the slide's layout (the fade-up offset is a transform).
    expect(await layoutTop()).toBe(top);

    await page.keyboard.press('ArrowRight');
    await expectLocation(page, 'loop', 2);
    await expect.poll(() => fragmentStates(loop)).toEqual(['shown', 'shown']);
    await expect(loop.getByText('Agents write the JSON')).toBeVisible();

    await page.keyboard.press('ArrowRight');
    await expectLocation(page, 'blocks', 0);
    await page.keyboard.press('ArrowLeft');
    await expectLocation(page, 'loop', 2);
    await page.keyboard.press('ArrowLeft');
    await expectLocation(page, 'loop', 1);
    await expect.poll(() => fragmentStates(loop)).toEqual(['shown', 'hidden']);
  });

  test('the hash addresses every step, including the last', async ({ page }) => {
    await page.goto(`${flagship}#/loop/2`);
    await expectLocation(page, 'loop', 2);
    await expect.poll(() => fragmentStates(slide(page, 'loop'))).toEqual(['shown', 'shown']);
    await page.goto(`${flagship}#/loop/9`);
    await expectLocation(page, 'loop', 2);
  });

  test('a stepped catalog item (a timeline event) keeps its space until its step', async ({
    page,
  }) => {
    await page.goto(`${flagship}#/timeline/0`);
    const event = slide(page, 'timeline').locator('[data-py-fragment-kind="prop"]');
    await expect(event).toHaveCount(1);
    await expect(event).toHaveAttribute('data-py-fragment', 'hidden');
    await expect(event).toHaveCSS('visibility', 'hidden');
    expect((await event.boundingBox())?.width ?? 0).toBeGreaterThan(40);
    await expect(slide(page, 'timeline').getByText('Decks, pages, docs and blocks')).toBeHidden();
    await page.keyboard.press('ArrowRight');
    await expectLocation(page, 'timeline', 1);
    await expect(event).toHaveCSS('visibility', 'visible');
    await expect(slide(page, 'timeline').getByText('Decks, pages, docs and blocks')).toBeVisible();
  });

  test('code highlights move per step', async ({ page }) => {
    await page.goto(`${flagship}#/code/0`);
    const code = slide(page, 'code');
    await expect.poll(() => highlighted(code)).toEqual(['3']);
    await page.keyboard.press('ArrowRight');
    await expectLocation(page, 'code', 1);
    await expect.poll(() => highlighted(code)).toEqual(['4', '5', '6', '7']);
    await page.keyboard.press('ArrowRight');
    await expectLocation(page, 'what-divider', 0);
  });

  test('reduced motion and motion: none drop the reveal animation', async ({ page }) => {
    const duration = (page: Page) =>
      slide(page, 'loop')
        .locator('[data-py-fragment]')
        .first()
        .evaluate((el) => {
          const style = getComputedStyle(el);
          // Seconds of reveal motion; none when transitions are off.
          return style.transitionProperty === 'none'
            ? 0
            : Number.parseFloat(style.transitionDuration);
        });

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${flagship}#/loop/0`);
    await expect.poll(() => duration(page)).toBeLessThan(0.01);

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(`${flagship}#/loop/0`);
    await page.reload();
    await expect.poll(() => duration(page)).toBeCloseTo(0.5, 2);

    await page.goto(`${flagship}&motion=none#/loop/0`);
    await page.reload();
    await expect(app(page)).toHaveAttribute('data-py-deck-motion', 'none');
    await expect.poll(() => duration(page)).toBeLessThan(0.01);
  });

  test('print and the overview show every step', async ({ page }) => {
    await page.goto(`${flagship}&print=1#/loop/0`);
    const printed = page.locator('[data-py-deck-slide-inner="loop"]');
    await expect.poll(() => fragmentStates(printed)).toEqual(['shown', 'shown']);
    await expect
      .poll(() => highlighted(page.locator('[data-py-deck-slide-inner="code"]')))
      .toEqual(['4', '5', '6', '7']);

    await page.goto(`${flagship}#/cover/0`);
    await page.keyboard.press('o');
    const overview = page.getByRole('dialog', { name: 'Slide overview' });
    await expect(overview).toBeVisible();
    // Wait for the thumbnails' blocks to load, then every fragment is shown.
    await expect
      .poll(async () => {
        const states = await fragmentStates(overview);
        return states.length >= 2 && states.every((state) => state === 'shown');
      })
      .toBe(true);
  });
});

test.describe('free layout text never overlaps', () => {
  test('the quiz slide title, subtitle and blocks keep separate boxes', async ({ page }) => {
    await page.goto(`${deckUrl}#/quiz/0`);
    const quiz = slide(page, 'quiz');
    const title = quiz.locator('[data-slot="title"]');
    await expect(title).toBeVisible();
    // Measure once the blocks have loaded and the content fit has settled.
    await expect(quiz.getByRole('button', { name: 'Placeholder series for layout' })).toBeVisible();
    await page.waitForTimeout(300);
    const boxes = await quiz
      .locator('[data-slot="heading"] > *, [data-slot="blocks"] > *')
      .evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, text: (el.textContent ?? '').slice(0, 30) };
        })
      );
    expect(boxes.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < boxes.length; i += 1) {
      const prev = boxes[i - 1];
      const next = boxes[i];
      // Stacked boxes: each starts at or below the previous one's bottom (1 px rounding).
      expect(next?.top, `${next?.text} overlaps ${prev?.text}`).toBeGreaterThanOrEqual(
        (prev?.bottom ?? 0) - 1
      );
    }
    // And the content stays inside the slide once the lazy blocks load (the fit
    // re-runs then); before that fix the quiz ran past the slide's bottom edge.
    await expect
      .poll(() =>
        quiz.locator('[data-slot="blocks"]').evaluate((el) => {
          const slide = el.closest('section')?.getBoundingClientRect();
          const last = el.lastElementChild?.getBoundingClientRect();
          return !slide || !last || last.bottom <= slide.bottom;
        })
      )
      .toBe(true);
  });
});
