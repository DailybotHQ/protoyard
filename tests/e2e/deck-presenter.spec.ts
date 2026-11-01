import { expect, type Page, test } from '@playwright/test';

/*
 * Presenter view and print on the built catalog deck
 * (tests/e2e/fixtures/deck-navigation: blueprints/decks/lumen-launch.json,
 * with speaker notes on `cover` and `divider`). The server starts when the
 * spec is named on the command line (PROTOYARD_E2E_DECK=1 forces it).
 */

const deckPort = Number(process.env.PROTOYARD_E2E_DECK_PORT ?? 4891);
const deckUrl = `http://127.0.0.1:${deckPort}/`;
/** The @texuli/slides presenter protocol channel for DeckApp's default namespace, "deck". */
const CHANNEL = 'texuli-deck-presenter/1:deck';
const SLIDE_ORDER = ['cover', 'divider', 'path', 'pillars', 'quiz', 'close'];

/*
 * The presenter is the @texuli/slides stage's: S or P opens the presenter view
 * beside the slides (notes, up next, timers, Previous and Next), and its "Open
 * presenter window" button opens a second window that follows the deck over
 * the presenter protocol (BroadcastChannel). A blocked window keeps the view on
 * the page and says why.
 */
const app = (page: Page) => page.locator('[data-py-deck-app]');
const stage = (page: Page) => page.locator('.tx-deck-stage');
const split = (page: Page) => page.getByRole('group', { name: 'Presenter view' });
/** The view's own controls (the toolbar has its own Previous and Next). */
const viewButton = (page: Page, name: string) =>
  split(page).getByRole('button', { name, exact: true });

async function expectSlide(page: Page, slideId: string, step = 0): Promise<void> {
  await expect(app(page), `the deck should be on ${slideId}/${step}`).toHaveAttribute(
    'data-slide-id',
    slideId
  );
  await expect(app(page)).toHaveAttribute('data-slide-step', String(step));
}

test.describe('presenter view', { tag: '@desktop' }, () => {
  test.skip(
    process.env.PROTOYARD_E2E_DECK !== '1',
    'Opt-in: PROTOYARD_E2E_DECK=1 (or name a deck spec) starts the built deck server.'
  );
  // The view sits beside the slides; a taller window keeps it clear of the toolbar row.
  test.use({ viewport: { width: 1280, height: 900 } });

  test('opens a window that follows the deck, and syncs both ways over BroadcastChannel', async ({
    page,
    context,
  }) => {
    await page.goto(`${deckUrl}#/cover/0`);
    await expectSlide(page, 'cover');

    await stage(page).focus();
    await page.keyboard.press('s');
    await expect(split(page)).toBeVisible();
    const popupEvent = context.waitForEvent('page', { timeout: 7_000 }).catch(() => null);
    await viewButton(page, 'Open presenter window').click();
    const popup = await popupEvent;
    expect(popup, 'the presenter window should open (was it blocked?)').not.toBeNull();
    if (!popup) return;
    const window_ = popup.locator('[data-tx-deck-presenter-window]');
    await expect(window_).toBeVisible();
    await expect(window_).toContainText('Slide 1 of 6');
    await expect(window_).toContainText('Welcome everyone');

    // The window listens on the deck's channel: it must be able to open one.
    const hasChannel = await popup.evaluate(() => typeof BroadcastChannel === 'function');
    expect(hasChannel, 'the presenter window has no BroadcastChannel').toBe(true);
    await popup.evaluate((name) => {
      const channel = new BroadcastChannel(name);
      const store = window as unknown as { received: unknown[]; channel: BroadcastChannel };
      store.received = [];
      store.channel = channel;
      channel.onmessage = (event) => store.received.push(event.data);
    }, CHANNEL);

    // Deck → presenter: navigation is published as a `sync` message and shown in the window.
    await page.bringToFront();
    await stage(page).focus();
    await page.keyboard.press('ArrowRight');
    await expectSlide(page, 'divider');
    await expect(window_).toContainText('Slide 2 of 6');
    await expect
      .poll(() => popup.evaluate(() => (window as unknown as { received: unknown[] }).received), {
        message: 'the deck never published its position on BroadcastChannel',
      })
      .toContainEqual({ type: 'sync', slideId: 'divider', step: 0 });

    // Presenter → deck: a sync from the presenter side moves the deck.
    await popup.evaluate(() =>
      (window as unknown as { channel: BroadcastChannel }).channel.postMessage({
        type: 'sync',
        slideId: 'pillars',
        step: 0,
      })
    );
    await expectSlide(page, 'pillars');

    // Malformed or hostile messages are ignored.
    await popup.evaluate(() => {
      const channel = (window as unknown as { channel: BroadcastChannel }).channel;
      channel.postMessage({ type: 'sync', slideId: 'close', step: 0, run: 'alert(1)' });
      channel.postMessage({ type: 'sync', slideId: '../close', step: 0 });
      channel.postMessage('javascript:alert(1)');
    });
    await page.waitForTimeout(200);
    await expectSlide(page, 'pillars');

    // The window's own controls drive the deck, and its Close ends it.
    await popup.getByRole('button', { name: 'Next', exact: true }).click();
    await expectSlide(page, 'quiz');
    const closed = popup.waitForEvent('close', { timeout: 7_000 });
    await popup.getByRole('button', { name: 'Close presenter window' }).click();
    await closed;
  });
});

test.describe('print', { tag: '@desktop' }, () => {
  test.skip(
    process.env.PROTOYARD_E2E_DECK !== '1',
    'Opt-in: PROTOYARD_E2E_DECK=1 (or name a deck spec) starts the built deck server.'
  );
  test('?print=1 lays out one page per slide with no app chrome, and notes on request', async ({
    page,
  }) => {
    await page.goto(`${deckUrl}?print=1#/cover/0`);
    // The stage's print view (`@texuli/slides/export`): one page per visible slide.
    const print = page.locator('[data-py-deck-print]');
    await expect(print).toBeVisible();
    await expect(print.locator('[data-print-ready="true"]')).toHaveCount(1, { timeout: 15_000 });
    const pages = print.locator('[data-print-ready] [data-slide-id][data-aspect]');
    await expect(pages).toHaveCount(SLIDE_ORDER.length);
    expect(
      await pages.evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-slide-id')))
    ).toEqual(SLIDE_ORDER);
    // No deck app, chrome, progress or toolbar in print mode.
    await expect(app(page)).toHaveCount(0);
    await expect(page.locator('.tx-deck-stage__toolbar, [role="progressbar"]')).toHaveCount(0);
    await expect(page.locator('[data-tx-deck-chrome]')).toHaveCount(0);
    await expect(page.locator('.tx-deck-print-view__appendix')).toHaveCount(0);

    // Each slide is its own printed page: a canvas-sized named page (break-before on the
    // ones after it); the PDF test below counts the pages.
    await page.emulateMedia({ media: 'print' });
    const paged = await pages.evaluateAll((nodes) =>
      nodes.map((n) => {
        const style = getComputedStyle(n) as CSSStyleDeclaration & { page?: string };
        return (style.page ?? 'auto') !== 'auto' || style.breakBefore === 'page';
      })
    );
    expect(paged.every(Boolean)).toBe(true);
    await page.emulateMedia({ media: 'screen' });

    await page.goto(`${deckUrl}?print=1&notes=1#/cover/0`);
    await expect(page.locator('.tx-deck-print-view__appendix')).toContainText('Welcome everyone');
  });
});
