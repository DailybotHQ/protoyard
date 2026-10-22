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
/** DeckApp's default presenter namespace is "deck" (protocol.ts presenterChannelName). */
const CHANNEL = 'protoyard.deck.presenter.v1:deck';
const SLIDE_ORDER = ['cover', 'divider', 'path', 'pillars', 'quiz', 'close'];

const app = (page: Page) => page.locator('[data-py-deck-app]');
const split = (page: Page) => page.getByRole('dialog', { name: 'Presenter view' });

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
  test('opens a popup that follows the deck, and syncs both ways over BroadcastChannel', async ({
    page,
    context,
  }) => {
    await page.goto(`${deckUrl}#/cover/0`);
    await expectSlide(page, 'cover');

    const popupEvent = context.waitForEvent('page', { timeout: 7_000 }).catch(() => null);
    await page.keyboard.press('s');
    const popup = await popupEvent;
    expect(popup, 'pressing S should open the presenter popup (was it blocked?)').not.toBeNull();
    if (!popup) return;
    await expect(popup.locator('[data-py-presenter-popup]')).toBeVisible();
    await expect(popup.locator('#pos')).toHaveText('cover · step 0');

    // The popup listens on the deck's channel: it must be able to open one.
    const hasChannel = await popup.evaluate(() => typeof BroadcastChannel === 'function');
    expect(hasChannel, 'the presenter popup has no BroadcastChannel').toBe(true);
    await popup.evaluate((name) => {
      const channel = new BroadcastChannel(name);
      const store = window as unknown as { received: unknown[]; channel: BroadcastChannel };
      store.received = [];
      store.channel = channel;
      channel.onmessage = (event) => store.received.push(event.data);
    }, CHANNEL);

    // Deck → presenter: navigation is published as a `sync` message and shown in the popup.
    await page.bringToFront();
    await page.keyboard.press('ArrowRight');
    await expectSlide(page, 'divider');
    await expect(popup.locator('#pos')).toHaveText('divider · step 0');
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

    // S again closes the presenter and its window.
    const closed = popup.waitForEvent('close', { timeout: 7_000 });
    await page.bringToFront();
    await app(page).focus();
    await page.keyboard.press('s');
    await closed;
  });

  test('falls back to an in-page split view when the popup is blocked', async ({ page }) => {
    await blockPopups(page);
    await page.goto(`${deckUrl}#/cover/0`);
    await page.keyboard.press('p');
    await expect(split(page), 'a blocked popup should open the in-page presenter').toBeVisible();
    // The in-page view says why it is not a separate window.
    await expect(
      split(page).locator('[data-py-presenter-fallback-reason][data-reason="popup-blocked"]')
    ).toContainText('The presenter popup was blocked');

    // The deck and its chrome stay inside their own cell and never cover the presenter panel.
    const main = await split(page).locator('[data-py-deck-presenter-main]').boundingBox();
    const chrome = await split(page).locator('[data-py-deck-chrome-root]').boundingBox();
    expect(main && chrome, 'the split view should lay out the deck and its chrome').toBeTruthy();
    if (main && chrome) {
      expect(
        chrome.x + chrome.width,
        'deck chrome overflows into the presenter panel'
      ).toBeLessThanOrEqual(main.x + main.width + 1);
      expect(
        chrome.y + chrome.height,
        'deck chrome overflows into the presenter panel'
      ).toBeLessThanOrEqual(main.y + main.height + 1);
    }

    const view = split(page).locator('[data-py-deck-presenter]');
    await expect(view.locator('[data-py-presenter-position]')).toHaveText(
      `1 / ${SLIDE_ORDER.length}`
    );
    await expect(view.locator('[data-py-presenter-current-title]')).toContainText('cover');
    await expect(view.locator('[data-py-presenter-notes]')).toContainText('Welcome everyone');
    await expect(view.locator('[data-py-presenter-next-title]')).toContainText('divider');
    await expect(view.locator('[data-py-presenter-next-notes]')).toContainText('Pause here');

    // The presenter's own controls drive the deck, and the view follows.
    await split(page).getByRole('button', { name: 'Next', exact: true }).click();
    await expectSlide(page, 'divider');
    await expect(view.locator('[data-py-presenter-position]')).toHaveText(
      `2 / ${SLIDE_ORDER.length}`
    );
    await expect(view.locator('[data-py-presenter-notes]')).toContainText('Pause here');
    await expect(view.locator('[data-py-presenter-next-title]')).toContainText('path');
    await expect(view.locator('[data-py-presenter-next-notes]')).toHaveText('No notes.');

    await split(page).getByRole('button', { name: 'Next', exact: true }).click();
    await expect(view.locator('[data-py-presenter-notes]')).toHaveText(
      'No speaker notes for this slide.'
    );
    await split(page).getByRole('button', { name: 'Previous', exact: true }).click();
    await expectSlide(page, 'divider');

    await split(page).getByRole('button', { name: 'Close presenter' }).click();
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
    await page.keyboard.press('s');
    await expect(
      split(page),
      'without BroadcastChannel the presenter falls back in-page'
    ).toBeVisible();
    await expect(
      split(page).locator('[data-py-presenter-fallback-reason][data-reason="no-broadcast"]')
    ).toContainText('BroadcastChannel is unavailable');
    await split(page).getByRole('button', { name: 'Next', exact: true }).click();
    await expectSlide(page, 'divider');
  });

  test('runs elapsed and per-slide timers on the controlled clock', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-03-02T09:00:00Z') });
    await blockPopups(page);
    await page.goto(`${deckUrl}#/cover/0`);
    await page.keyboard.press('p');
    const view = split(page).locator('[data-py-deck-presenter]');
    await expect(view.locator('[data-py-presenter-elapsed]')).toHaveText('00:00');

    await page.clock.runFor(65_000);
    await expect(view.locator('[data-py-presenter-elapsed]')).toHaveText('01:05');
    await expect(view.locator('[data-py-presenter-slide-time]')).toHaveText('01:05');

    // A new slide restarts the slide timer; the elapsed timer keeps running.
    await split(page).getByRole('button', { name: 'Next', exact: true }).click();
    await page.clock.runFor(10_000);
    await expect(view.locator('[data-py-presenter-slide-time]')).toHaveText('00:10');
    await expect(view.locator('[data-py-presenter-elapsed]')).toHaveText('01:15');

    // Pause holds both timers; resume continues from there; reset goes back to zero.
    const pause = split(page).getByRole('button', { name: 'Pause', exact: true });
    await pause.click();
    await expect(split(page).getByRole('button', { name: 'Resume', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await page.clock.runFor(30_000);
    await expect(view.locator('[data-py-presenter-elapsed]')).toHaveText('01:15');
    await expect(view.locator('[data-py-presenter-slide-time]')).toHaveText('00:10');
    await split(page).getByRole('button', { name: 'Resume', exact: true }).click();
    await page.clock.runFor(5_000);
    await expect(view.locator('[data-py-presenter-elapsed]')).toHaveText('01:20');
    await split(page).getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(view.locator('[data-py-presenter-elapsed]')).toHaveText('00:00');
    await expect(view.locator('[data-py-presenter-slide-time]')).toHaveText('00:00');
    await page.clock.runFor(3_000);
    await expect(view.locator('[data-py-presenter-elapsed]')).toHaveText('00:03');
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
    const blackout = page.locator('[data-py-deck-blackout]');
    await expect(blackout).toBeVisible();
    await expect(app(page)).toHaveAttribute('data-blackout', 'true');
    await page.keyboard.press('ArrowRight');
    await expectSlide(page, 'divider');
    await blackout.click();
    await expect(blackout).toBeHidden();
    await expectSlide(page, 'divider');
    // The clicked blackout button is gone: focus returns to the deck, so its keys still work.
    await expect(app(page)).toBeFocused();
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
    await expect(app(page)).toHaveAttribute('data-laser', 'true');
    // The deck's own box: slide elements can sit off screen in the canvas track.
    const box = await app(page).boundingBox();
    expect(box, 'the deck should be laid out').not.toBeNull();
    if (!box) return;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    if (testInfo.project.use.hasTouch) {
      // A touch has no hover: the dot only exists under the finger, so check that a tap never advances.
      await page.touchscreen.tap(x, y);
    } else {
      await page.mouse.move(x, y);
      await expect(page.locator('[data-py-deck-laser-dot]')).toBeVisible();
      await page.mouse.click(x, y);
    }
    await expectSlide(page, 'divider');
    // A tap or click never strands focus on the page: the deck keeps its keys.
    await expect(app(page)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(app(page)).not.toHaveAttribute('data-laser', 'true');
    await expect(page.locator('[data-py-deck-laser-dot]')).toHaveCount(0);
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
    const print = page.locator('[data-py-deck-print]');
    await expect(print).toBeVisible();
    const pages = print.locator('[data-py-deck-print-page]');
    await expect(pages).toHaveCount(SLIDE_ORDER.length);
    expect(
      await pages.evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-py-deck-slide')))
    ).toEqual(SLIDE_ORDER);
    // No deck app, chrome, progress or toolbar in print mode.
    await expect(app(page)).toHaveCount(0);
    await expect(page.locator('[data-py-deck-chrome]')).toHaveCount(0);
    await expect(page.locator('[data-py-deck-print-notes-block]')).toHaveCount(0);

    // Each slide breaks to its own printed page.
    const breaks = await pages.evaluateAll((nodes) =>
      nodes.map((n) => getComputedStyle(n).breakAfter || getComputedStyle(n).pageBreakAfter)
    );
    expect(breaks.slice(0, -1).every((value) => value === 'page' || value === 'always')).toBe(true);

    await page.goto(`${deckUrl}?print=1&notes=1#/cover/0`);
    await expect(page.locator('[data-py-deck-print-notes-block]').first()).toContainText(
      'Welcome everyone'
    );
  });

  test('a printed PDF has one page per slide', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'page.pdf() is Chromium-only');
    await page.goto(`${deckUrl}?print=1#/cover/0`);
    await expect(page.locator('[data-py-deck-print-page]')).toHaveCount(SLIDE_ORDER.length);
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
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    await expect(page.locator('[data-py-deck-print]')).toBeVisible();
    await expect(page.locator('[data-py-deck-print-page]')).toHaveCount(SLIDE_ORDER.length);
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await expect(page.locator('[data-py-deck-print]')).toHaveCount(0);
    await expectSlide(page, 'pillars');
  });
});
