import { expect, type Page, test } from '@playwright/test';

/*
 * Presenter view, presenting tools and print on the built catalog deck
 * (tests/e2e/fixtures/deck-navigation: blueprints/decks/lumen-launch.json,
 * with speaker notes on `cover` and `divider`). The server starts when the
 * spec is named on the command line (PROTOYARD_E2E_DECK=1 forces it).
 *
 * Time never comes from the wall clock: the timer test installs Playwright's
 * clock and advances it explicitly. Every wait is a bounded expect.
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

/** Blocks popups the way a browser or the artifact sandbox does: window.open returns null. */
async function blockPopups(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.open = () => null;
  });
}

test.describe('presenter view', () => {
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

  test('stays on the page and says why when the window is blocked', async ({ page }) => {
    await blockPopups(page);
    await page.goto(`${deckUrl}#/cover/0`);
    await stage(page).focus();
    await page.keyboard.press('p');
    await expect(split(page), 'P opens the presenter view').toBeVisible();
    await expect(app(page)).toHaveAttribute('data-presenter', 'true');
    await viewButton(page, 'Open presenter window').click();
    // The view says why it is not a separate window.
    await expect(
      split(page).locator('[data-tx-deck-presenter-reason="popup-blocked"]')
    ).toContainText('blocked the presenter window');

    // The slides and the view never overlap.
    const slides = await page.locator('.tx-deck-stage__viewport').boundingBox();
    const side = await split(page).boundingBox();
    expect(slides && side, 'the presenter view should lay out beside the slides').toBeTruthy();
    if (slides && side) expect(slides.x + slides.width).toBeLessThanOrEqual(side.x + 1);

    await expect(split(page)).toContainText('Slide 1 of 6');
    await expect(split(page).locator('.tx-deck-stage__notes')).toContainText('Welcome everyone');
    await expect(split(page).locator('.tx-deck-stage__next-title')).toContainText('The plan');

    // The view's own controls drive the deck, and the view follows.
    await viewButton(page, 'Next').click();
    await expectSlide(page, 'divider');
    await expect(split(page)).toContainText('Slide 2 of 6');
    await expect(split(page).locator('.tx-deck-stage__notes')).toContainText('Pause here');
    await expect(split(page).locator('.tx-deck-stage__next-title')).toContainText('Launch path');

    await viewButton(page, 'Next').click();
    await expectSlide(page, 'path');
    await expect(split(page).locator('.tx-deck-stage__notes')).not.toContainText('Pause here');
    await viewButton(page, 'Previous').click();
    await expectSlide(page, 'divider');

    // P again closes the view and leaves the deck where it is.
    await stage(page).focus();
    await page.keyboard.press('p');
    await expect(split(page)).toBeHidden();
    await expectSlide(page, 'divider');
  });

  test('still presents in-page when BroadcastChannel is unavailable', async ({ page }) => {
    await page.addInitScript(() => {
      // Some embedded browsers and sandboxes have no BroadcastChannel.
      Reflect.deleteProperty(window, 'BroadcastChannel');
    });
    await page.goto(`${deckUrl}#/cover/0`);
    expect(await page.evaluate(() => 'BroadcastChannel' in window)).toBe(false);
    await stage(page).focus();
    await page.keyboard.press('s');
    await expect(
      split(page),
      'without BroadcastChannel the presenter view stays in-page'
    ).toBeVisible();
    // Asking for the window says why it stays on the page.
    await viewButton(page, 'Open presenter window').click();
    await expect(
      split(page).locator('[data-tx-deck-presenter-reason="no-broadcast"]')
    ).toContainText('cannot link two windows');
    await viewButton(page, 'Next').click();
    await expectSlide(page, 'divider');
  });

  test('runs elapsed and per-slide timers on the controlled clock', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-03-02T09:00:00Z') });
    // Frozen: time moves only with runFor.
    await page.clock.pauseAt(new Date('2026-03-02T09:00:01Z'));
    await blockPopups(page);
    await page.goto(`${deckUrl}#/cover/0`);
    await stage(page).focus();
    await page.keyboard.press('p');
    const elapsed = split(page).locator('[data-tx-deck-timer="elapsed"]');
    const slideTime = split(page).locator('[data-tx-deck-timer="slide"]');
    // The timers start when the presenter view opens.
    await expect(elapsed).toHaveText('0:00');

    await page.clock.runFor(65_000);
    await expect(elapsed).toHaveText('1:05');
    await expect(slideTime).toHaveText('1:05');

    // A new slide restarts the slide timer; the elapsed timer keeps running.
    await viewButton(page, 'Next').click();
    await page.clock.runFor(10_000);
    await expect(split(page)).toContainText('Slide 2 of 6');
    // The stage restarts the slide timer once the incoming slide is shown (after its
    // transition), so up to a second of these ten may pass before it.
    await expect(slideTime).toHaveText(/^0:(09|10)$/);
    const onSlide = (await slideTime.textContent()) ?? '';
    await expect(elapsed).toHaveText('1:15');

    // Pause holds both timers; start continues from there; reset goes back to zero.
    await viewButton(page, 'Pause timers').click();
    await page.clock.runFor(30_000);
    await expect(elapsed).toHaveText('1:15');
    await expect(slideTime).toHaveText(onSlide);
    await viewButton(page, 'Start timers').click();
    await page.clock.runFor(5_000);
    await expect(elapsed).toHaveText('1:20');
    await viewButton(page, 'Reset timers').click();
    await expect(elapsed).toHaveText('0:00');
    await expect(slideTime).toHaveText('0:00');
    await page.clock.runFor(3_000);
    await expect(elapsed).toHaveText('0:03');
  });
});

test.describe('presenting tools', () => {
  test.skip(
    process.env.PROTOYARD_E2E_DECK !== '1',
    'Opt-in: PROTOYARD_E2E_DECK=1 (or name a deck spec) starts the built deck server.'
  );
  test('blackout hides the slide and returns to it without advancing', async ({ page }) => {
    await page.goto(`${deckUrl}#/divider/0`);
    await page.keyboard.press('b');
    const blackout = page.locator('[data-tx-deck-blackout]');
    await expect(blackout).toBeVisible();
    await expect(page.locator('[data-tx-deck-tool="blackout"]')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await page.keyboard.press('ArrowRight');
    await expectSlide(page, 'divider');
    await blackout.click();
    await expect(blackout).toBeHidden();
    await expectSlide(page, 'divider');
    // The clicked blackout button is gone: focus returns to the slide, so the deck keys still work.
    await expect
      .poll(() => stage(page).evaluate((root) => root.contains(document.activeElement)))
      .toBe(true);
    await page.keyboard.press('.');
    await expect(blackout).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(blackout).toBeHidden();
  });

  test('the laser pointer follows the pointer and clicks do not advance', async ({
    page,
  }, testInfo) => {
    await page.goto(`${deckUrl}#/divider/0`);
    await page.keyboard.press('l');
    const laser = page.locator('[data-tx-deck-tool="laser"]');
    await expect(laser).toHaveAttribute('aria-pressed', 'true');
    // The slide canvas: a click there would advance the deck without the laser.
    const box = await page.locator('[data-tx-deck-canvas]').boundingBox();
    expect(box, 'the deck should be laid out').not.toBeNull();
    if (!box) return;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    if (testInfo.project.use.hasTouch) {
      // A touch has no hover: the dot only exists under the finger, so check that a tap never advances.
      await page.touchscreen.tap(x, y);
    } else {
      await page.mouse.move(x, y);
      await expect(page.locator('[data-tx-deck-laser]').first()).toBeVisible();
      await page.mouse.click(x, y);
    }
    await expectSlide(page, 'divider');
    // A tap or click never strands focus on the page: the deck keeps its keys.
    await expect
      .poll(() => stage(page).evaluate((root) => root.contains(document.activeElement)))
      .toBe(true);
    await page.keyboard.press('Escape');
    await expect(laser).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('[data-tx-deck-laser]')).toHaveCount(0);
  });
});

test.describe('print', () => {
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

  test('a printed PDF has one page per slide', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'page.pdf() is Chromium-only');
    await page.goto(`${deckUrl}?print=1#/cover/0`);
    await expect(page.locator('[data-print-ready="true"]')).toHaveCount(1, { timeout: 15_000 });
    await expect(page.locator('[data-print-ready] [data-slide-id][data-aspect]')).toHaveCount(
      SLIDE_ORDER.length
    );
    await page.emulateMedia({ media: 'print' });
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    const source = pdf.toString('latin1');
    const pageCount = (source.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
    expect(pageCount, 'the PDF should have exactly one page per slide').toBe(SLIDE_ORDER.length);
    // Each page is the 16:9 canvas (1280 x 720 CSS px = 960 x 540 pt), not a paper size.
    const boxes = [...source.matchAll(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/g)].map((m) => [
      Math.round(Number(m[1])),
      Math.round(Number(m[2])),
    ]);
    expect(boxes.length, 'every PDF page should declare its size').toBeGreaterThan(0);
    for (const size of boxes) expect(size).toEqual([960, 540]);
  });

  test('the browser print events swap the deck into the print layout and back', async ({
    page,
  }) => {
    await page.goto(`${deckUrl}#/pillars/0`);
    await expectSlide(page, 'pillars');
    // The print view loads while the browser is idle after the deck opens.
    await expect(app(page)).toHaveAttribute('data-py-deck-print-ready', 'true');
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    await expect(page.locator('[data-py-deck-print]')).toHaveCount(1);
    // The sheet settles off-screen (hidden); once ready, it is what goes on paper.
    await expect(page.locator('[data-py-deck-print] [data-print-ready="true"]')).toHaveCount(1, {
      timeout: 15_000,
    });
    await expect(page.locator('[data-py-deck-print]')).toBeHidden();
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('[data-py-deck-print]')).toBeVisible();
    await expect(
      page.locator('[data-py-deck-print] [data-print-ready] [data-slide-id][data-aspect]')
    ).toHaveCount(SLIDE_ORDER.length);
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    // Back on screen: the stage, with the prepared sheet hidden for the next print.
    await expect(page.locator('[data-py-deck-print]')).toBeHidden();
    await expect(page.locator('[data-py-deck-app] > .tx-deck-stage')).toBeVisible();
    await expectSlide(page, 'pillars');
  });
});
