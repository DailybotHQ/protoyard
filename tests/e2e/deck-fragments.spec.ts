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

test.describe('deck fragments on the flagship deck', () => {
  test.skip(
    process.env.PROTOYARD_E2E_DECK !== '1',
    'Opt-in: PROTOYARD_E2E_DECK=1 (or name a deck spec) starts the built deck server.'
  );
  test('stepped blocks reveal in order, keep their space, and hide again going back', {
    tag: '@desktop',
  }, async ({ page }) => {
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
});
