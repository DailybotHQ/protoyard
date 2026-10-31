import { expect, type Locator, type Page, test } from '@playwright/test';

// Served by the deck-navigation fixture: `?deck=flagship` is the flagship deck
// (blueprints/decks/protoyard-create-anything.json), the bare URL the catalog deck.
const deckPort = Number(process.env.PROTOYARD_E2E_DECK_PORT ?? 4891);
const deckUrl = `http://127.0.0.1:${deckPort}/`;
const flagship = `${deckUrl}?deck=flagship`;

const app = (page: Page) => page.locator('[data-py-deck-app]');
// The @texuli/slides stage: slides carry data-tx-deck-slide, stepped elements data-tx-deck-fragment.
const slide = (page: Page, id: string) => page.locator(`[data-tx-deck-slide="${id}"]`);

async function expectLocation(page: Page, slideId: string, step: number): Promise<void> {
  await expect(app(page)).toHaveAttribute('data-slide-id', slideId);
  await expect(app(page)).toHaveAttribute('data-slide-step', String(step));
  await expect(page).toHaveURL(new RegExp(`#/${slideId}/${step}$`));
}

async function fragmentStates(scope: Locator): Promise<string[]> {
  return scope
    .locator('[data-tx-deck-fragment]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-tx-deck-fragment') ?? ''));
}

/** The element a free-slide reveal moves: the block inside its box-less step wrapper. */
const revealed = (scope: Locator) =>
  scope.locator('[data-tx-deck-item][data-tx-deck-fragment] > *');

async function highlighted(scope: Locator): Promise<string[]> {
  return scope
    .locator('[data-highlighted]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-line') ?? ''));
}

/**
 * Fragments animate through the stage's motion runtime (`@texuli/core/motion`, Web
 * Animations with `fill: "none"`), not CSS transitions: the stylesheet holds only the end
 * states. Record every animation started on a fragment (or the block inside a box-less
 * fragment wrapper), so a spec can tell what a step change played.
 */
async function recordFragmentAnimations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const played: number[] = [];
    (window as unknown as { __fragmentAnimations: number[] }).__fragmentAnimations = played;
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (this: Element, ...args: Parameters<Element['animate']>) {
      const animation = animate.apply(this, args);
      if (this.matches('[data-tx-deck-fragment], [data-tx-deck-fragment] > *')) {
        const duration = animation.effect?.getTiming().duration;
        played.push(typeof duration === 'number' ? duration : 0);
      }
      return animation;
    };
  });
}

/** Step once on the slide (its first fragment reveals) and return the fragment animations it played. */
async function revealDurations(page: Page, slideId: string): Promise<number[]> {
  await expectLocation(page, slideId, 0);
  // Let the slide settle (lazy families, the motion chunk) before the step.
  await expect(slide(page, slideId).getByText('Loading block')).toHaveCount(0);
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    (window as unknown as { __fragmentAnimations: number[] }).__fragmentAnimations.length = 0;
  });
  await page.keyboard.press('ArrowRight');
  await expectLocation(page, slideId, 1);
  await expect.poll(() => fragmentStates(slide(page, slideId))).toContain('visible');
  // An animation starts in the frame after the step: give it a few frames.
  await page.waitForTimeout(200);
  return page.evaluate(() => [
    ...(window as unknown as { __fragmentAnimations: number[] }).__fragmentAnimations,
  ]);
}

test.describe('deck fragments on the flagship deck', () => {
  test.skip(
    process.env.PROTOYARD_E2E_DECK !== '1',
    'Opt-in: PROTOYARD_E2E_DECK=1 (or name a deck spec) starts the built deck server.'
  );
  test('stepped blocks reveal in order, keep their space, and hide again going back', async ({
    page,
  }) => {
    await page.goto(`${flagship}#/loop/0`);
    await expectLocation(page, 'loop', 0);
    const loop = slide(page, 'loop');
    await expect.poll(() => fragmentStates(loop)).toEqual(['hidden', 'hidden']);

    // Measure once the lazy block families have painted (hidden blocks still lay out).
    await expect(loop.getByText('Loading block')).toHaveCount(0);
    // Hidden but laid out: the flow has a real box, is invisible and silent.
    const step = loop.locator('[data-tx-deck-item][data-tx-deck-fragment]').first();
    const flow = revealed(loop).first();
    const box = await flow.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThan(20);
    const layoutTop = () => flow.evaluate((el) => (el as HTMLElement).offsetTop);
    const top = await layoutTop();
    await expect(step).toHaveAttribute('aria-hidden', 'true');
    await expect(flow).toHaveCSS('visibility', 'hidden');
    await expect(loop.getByText('Agents write the JSON')).toBeHidden();

    await page.keyboard.press('ArrowRight');
    await expectLocation(page, 'loop', 1);
    await expect.poll(() => fragmentStates(loop)).toEqual(['visible', 'hidden']);
    await expect(flow).toHaveCSS('visibility', 'visible');
    await expect(step).not.toHaveAttribute('aria-hidden', 'true');
    // Revealing never moves the slide's layout (the fade-up offset is a transform).
    expect(await layoutTop()).toBe(top);

    await page.keyboard.press('ArrowRight');
    await expectLocation(page, 'loop', 2);
    await expect.poll(() => fragmentStates(loop)).toEqual(['visible', 'visible']);
    await expect(loop.getByText('Agents write the JSON')).toBeVisible();

    await page.keyboard.press('ArrowRight');
    await expectLocation(page, 'blocks', 0);
    await page.keyboard.press('ArrowLeft');
    await expectLocation(page, 'loop', 2);
    await page.keyboard.press('ArrowLeft');
    await expectLocation(page, 'loop', 1);
    await expect.poll(() => fragmentStates(loop)).toEqual(['visible', 'hidden']);
  });

  test('the hash addresses every step, including the last', async ({ page }) => {
    await page.goto(`${flagship}#/loop/2`);
    await expectLocation(page, 'loop', 2);
    await expect.poll(() => fragmentStates(slide(page, 'loop'))).toEqual(['visible', 'visible']);
    await page.goto(`${flagship}#/loop/9`);
    await expectLocation(page, 'loop', 2);
  });

  test('a stepped catalog item (a timeline event) keeps its space until its step', async ({
    page,
  }) => {
    await page.goto(`${flagship}#/timeline/0`);
    const event = slide(page, 'timeline').locator('[data-tx-deck-fragment]');
    await expect(event).toHaveCount(1);
    await expect(event).toHaveAttribute('data-tx-deck-fragment', 'hidden');
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
    await recordFragmentAnimations(page);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${flagship}#/loop/0`);
    expect(await revealDurations(page, 'loop')).toEqual([]);

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(`${flagship}#/loop/0`);
    await page.reload();
    // The stage's motion runtime animates the revealed block from its hidden style (500 ms at full).
    expect(await revealDurations(page, 'loop')).toEqual([500]);

    await page.goto(`${flagship}&motion=none#/loop/0`);
    await page.reload();
    await expect(app(page)).toHaveAttribute('data-py-deck-motion', 'none');
    expect(await revealDurations(page, 'loop')).toEqual([]);
  });

  test('a stepped catalog prop animates unless motion is off', async ({ page }) => {
    // The fixture steps one timeline event; the stage's motion runtime animates its reveal.
    await recordFragmentAnimations(page);

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(`${flagship}#/timeline/0`);
    expect(await revealDurations(page, 'timeline')).toEqual([500]);

    await page.goto(`${flagship}&motion=none#/timeline/0`);
    await page.reload();
    await expect(app(page)).toHaveAttribute('data-py-deck-motion', 'none');
    expect(await revealDurations(page, 'timeline')).toEqual([]);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${flagship}#/timeline/0`);
    await page.reload();
    expect(await revealDurations(page, 'timeline')).toEqual([]);
  });

  test('print and the overview show every step', async ({ page }) => {
    await page.goto(`${flagship}&print=1#/loop/0`);
    // The print page (`?print=1`, the stage's print view): one page per slide.
    const printed = page.locator('[data-print-ready] [data-slide-id="loop"]');
    await expect.poll(() => fragmentStates(printed)).toEqual(['visible', 'visible']);
    await expect
      .poll(() => highlighted(page.locator('[data-print-ready] [data-slide-id="code"]')))
      .toEqual(['4', '5', '6', '7']);

    await page.goto(`${flagship}#/cover/0`);
    await page.keyboard.press('o');
    const overview = page.getByRole('navigation', { name: 'Slides' });
    await expect(overview).toBeVisible();
    // Wait for the thumbnails' blocks to load, then every fragment is shown.
    await expect
      .poll(async () => {
        const states = await fragmentStates(overview);
        return states.length >= 2 && states.every((state) => state === 'visible');
      })
      .toBe(true);
  });
});

test.describe('free layout text never overlaps', () => {
  test.skip(
    process.env.PROTOYARD_E2E_DECK !== '1',
    'Opt-in: PROTOYARD_E2E_DECK=1 (or name a deck spec) starts the built deck server.'
  );
  test('the quiz slide title, subtitle and blocks keep separate boxes', async ({ page }) => {
    await page.goto(`${deckUrl}#/quiz/0`);
    const quiz = slide(page, 'quiz');
    const title = quiz.locator('[data-slot="title"]');
    await expect(title).toBeVisible();
    // Measure once the blocks have loaded and the content fit has settled.
    await expect(quiz.getByRole('button', { name: 'Placeholder series for layout' })).toBeVisible();
    await page.waitForTimeout(300);
    const boxes = await quiz
      // Each block sits in a box-less step wrapper: measure the block itself.
      .locator('[data-slot="heading"] > *, [data-slot="blocks"] > * > *')
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
          const slide = el.closest('[data-tx-deck-slide]')?.getBoundingClientRect();
          const last = el.lastElementChild?.firstElementChild?.getBoundingClientRect();
          return !slide || !last || last.bottom <= slide.bottom;
        })
      )
      .toBe(true);
  });
});
