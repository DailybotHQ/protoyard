import { expect, type Locator, type Page, test } from '@playwright/test';

/*
 * Deck chrome controls (PLAN_006 T-audit-controls). One reproduction per defect
 * recorded in the plan's analysis_results/CONTROLS_AUDIT.md. Each test asserts
 * the behavior a first-time viewer needs; while the defect stands it is marked
 * `test.fail()`, and the fixing task (named in each title) removes the marker.
 * The passing tests guard what already works.
 *
 * Opt-in: PROTOYARD_E2E_DECK=1 starts the built catalog deck server (the same
 * fixture as deck-navigation.spec.ts).
 */

const deckPort = Number(process.env.PROTOYARD_E2E_DECK_PORT ?? 4891);
const deckUrl = `http://127.0.0.1:${deckPort}/`;

const root = (page: Page) => page.locator('[data-py-deck-app]');
const tool = (page: Page, name: string) => page.locator(`[data-py-deck-tool="${name}"]`);

async function visibleControl(page: Page, control: Locator): Promise<Locator> {
  if (await control.isVisible()) return control;
  const more = page.locator('[data-py-deck-more]');
  if (await more.count()) {
    const disclosure = more.locator('summary');
    if (
      !(await more.evaluate((element) => element.hasAttribute('open'))) &&
      (await disclosure.isVisible())
    ) {
      await disclosure.click();
    }
  }
  return control;
}

async function clickTool(page: Page, name: string): Promise<void> {
  await (await visibleControl(page, tool(page, name))).click();
}

async function openDeck(page: Page, hash = '#/cover/0'): Promise<void> {
  await page.goto(`${deckUrl}${hash}`);
  await expect(root(page)).toHaveAttribute('data-slide-id', 'cover');
}

async function enterFullscreenWithKey(page: Page): Promise<void> {
  await root(page).focus();
  await page.keyboard.press('f');
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
}

/** Stub `window.print` the way a real call behaves: `beforeprint` fires synchronously, then the page is captured. */
async function capturePrintLayout(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as typeof window & { __printLayout?: boolean | null };
    w.__printLayout = null;
    window.print = () => {
      window.dispatchEvent(new Event('beforeprint'));
      w.__printLayout = document.querySelector('[data-py-deck-print]') !== null;
      window.dispatchEvent(new Event('afterprint'));
    };
  });
}

const printedLayout = (page: Page) =>
  page.evaluate(() => (window as typeof window & { __printLayout?: boolean | null }).__printLayout);

/** Visible to a sighted user: rendered and larger than the 1 px `sr-only` box. */
function visiblyShown(page: Page, pattern: RegExp): Promise<boolean> {
  return page.evaluate((source) => {
    const re = new RegExp(source, 'i');
    return [...document.querySelectorAll<HTMLElement>('[data-py-deck-app] *')].some((el) => {
      if (!re.test(el.textContent ?? '') || el.children.length > 0) return false;
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return (
        box.width > 8 && box.height > 8 && style.visibility !== 'hidden' && style.opacity !== '0'
      );
    });
  }, pattern.source);
}

test.describe('deck chrome controls', () => {
  test.skip(
    process.env.PROTOYARD_E2E_DECK !== '1',
    'Opt-in: PROTOYARD_E2E_DECK=1 (or name a deck spec) starts the built deck server.'
  );

  test.describe('full screen (T-fullscreen-fix)', () => {
    test('Escape on the deck leaves full screen', async ({ page }) => {
      await openDeck(page);
      await enterFullscreenWithKey(page);
      // A synthetic key never triggers the browser's own Escape handling, so this
      // measures the deck itself: the same in every engine and inside embeds.
      await root(page).evaluate((element) => {
        element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });
      await expect
        .poll(() => page.evaluate(() => document.fullscreenElement === null), { timeout: 2_000 })
        .toBe(true);
    });

    test('full screen shows a visible way out', async ({ page }) => {
      await openDeck(page);
      await enterFullscreenWithKey(page);
      await page.mouse.move(200, 200);
      const exit = page.getByRole('button', { name: /(exit|leave) full ?screen/i });
      await expect(exit).toBeVisible({ timeout: 2_000 });
      await exit.click();
      await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
      await expect(page.locator('[data-py-deck-toolbar]')).toBeVisible();
      await expect(root(page)).toBeFocused();
    });

    test('the full screen button keeps keyboard control of the deck', async ({ page }) => {
      await openDeck(page);
      await clickTool(page, 'fullscreen');
      await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
      await page.keyboard.press('ArrowRight');
      await expect(root(page)).toHaveAttribute('data-slide-id', 'divider', { timeout: 2_000 });
    });

    test('a refused full screen (cross-origin embed without allow) is not silent', async ({
      page,
    }) => {
      // A real cross-origin embed, like the gallery frame or an artifact viewer:
      // both origins are routed so no browser blocks a public page framing 127.0.0.1.
      await page.route('http://deck.example/**', async (route) => {
        const url = new URL(route.request().url());
        const response = await route.fetch({
          url: `${deckUrl.slice(0, -1)}${url.pathname}${url.search}`,
        });
        await route.fulfill({ response });
      });
      await page.route('http://host.example/', (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><title>Host</title><iframe id="deck" src="http://deck.example/#/cover/0" style="width:900px;height:560px;border:0"></iframe>',
        })
      );
      await page.goto('http://host.example/');
      const frame = page.frameLocator('#deck');
      const deck = frame.locator('[data-py-deck-app]');
      await expect(deck).toHaveAttribute('data-slide-id', 'cover');
      expect(await deck.evaluate(() => document.fullscreenEnabled)).toBe(false);
      // The deck fills the frame instead, and says so.
      await deck.focus();
      await page.keyboard.press('f');
      await expect(deck).toHaveAttribute('data-fullscreen', /.+/, { timeout: 2_000 });
      await expect(deck).toHaveAttribute('data-fullscreen-mode', 'window');
      await expect(frame.locator('[data-py-deck-fullscreen-mode-note]')).toBeVisible();
      const box = await deck.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(899);
      expect(box?.height).toBeGreaterThanOrEqual(559);
      // Escape leaves it and gives the deck its chrome back.
      await page.keyboard.press('Escape');
      await expect(deck).not.toHaveAttribute('data-fullscreen', /.+/);
      await expect(frame.locator('[data-py-deck-toolbar]')).toBeVisible();
      // The button is a real control there too, and the overlay's exit works.
      await frame.locator('[data-py-deck-tool="fullscreen"]').click();
      await expect(deck).toHaveAttribute('data-fullscreen-mode', 'window');
      await frame.getByRole('button', { name: 'Leave full screen' }).click();
      await expect(deck).not.toHaveAttribute('data-fullscreen', /.+/);
      await expect(deck).toBeFocused();
    });

    test('F toggles full screen when the deck has focus (works today)', async ({ page }) => {
      await openDeck(page);
      await enterFullscreenWithKey(page);
      await page.keyboard.press('f');
      await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
      await expect(root(page)).not.toHaveAttribute('data-fullscreen', /.+/);
    });
  });

  test.describe('print (T-print-and-feedback)', () => {
    test('the Print button prints one slide per page', async ({ page }) => {
      await openDeck(page);
      await capturePrintLayout(page);
      await (await visibleControl(page, page.locator('[data-py-print-button]'))).click();
      await expect.poll(() => printedLayout(page)).not.toBeNull();
      expect(await printedLayout(page)).toBe(true);
    });

    test('Ctrl/Cmd+P prints one slide per page (works today)', async ({ page }) => {
      await openDeck(page);
      await capturePrintLayout(page);
      await root(page).focus();
      await page.keyboard.press('ControlOrMeta+p');
      await expect.poll(() => printedLayout(page)).toBe(true);
    });
  });

  test.describe('visible feedback (T-print-and-feedback)', () => {
    test('copying the slide reference is confirmed visibly', async ({ page }) => {
      test.fail(true, 'The result goes only to an sr-only live region (DeckToolbar.svelte:108).');
      await openDeck(page);
      await page.evaluate(() => {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: { writeText: async () => undefined },
        });
      });
      await clickTool(page, 'copy-reference');
      await expect(page.locator('[data-py-deck-copy-status]')).toHaveText(/copied/i);
      await expect.poll(() => visiblyShown(page, /copied/)).toBe(true);
    });

    test('the copied reference names the slide, not its id twice', async ({ page }) => {
      test.fail(
        true,
        'currentReference reads only the top-level slide.title (DeckApp.svelte:377); layout titles in props are ignored, so the label falls back to the id (reference.ts:41).'
      );
      await openDeck(page);
      await page.evaluate(() => {
        const w = window as typeof window & { __copied?: string };
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: {
            writeText: async (text: string) => {
              w.__copied = text;
            },
          },
        });
      });
      await clickTool(page, 'copy-reference');
      const read = () =>
        page.evaluate(() => (window as typeof window & { __copied?: string }).__copied ?? '');
      await expect.poll(read).not.toBe('');
      const copied = await read();
      expect(copied.endsWith('#/cover/0')).toBe(true);
      expect(copied.startsWith('cover · cover')).toBe(false);
    });

    test('the laser shows where it is as soon as it is turned on', async ({ page }) => {
      test.fail(
        true,
        'The dot renders only after a pointermove over the stage (LaserPointer.svelte:21).'
      );
      await openDeck(page);
      await root(page).focus();
      await page.keyboard.press('l');
      await expect(root(page)).toHaveAttribute('data-laser', 'true');
      await expect(page.locator('[data-py-deck-laser-dot]')).toBeVisible({ timeout: 2_000 });
    });

    test('the laser works with touch', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile', 'Touch is exercised in the mobile project.');
      test.fail(
        true,
        'A tap shows no dot (pointerleave follows at once) and clicks are ignored while the laser is on (decide.ts:262).'
      );
      await openDeck(page);
      await (await visibleControl(page, tool(page, 'laser'))).tap();
      const stage = await page.locator('[data-py-deck-stage-area]').boundingBox();
      if (!stage) throw new Error('no stage');
      await page.touchscreen.tap(stage.x + stage.width / 2, stage.y + stage.height / 2);
      await expect(page.locator('[data-py-deck-laser-dot]')).toBeVisible({ timeout: 2_000 });
    });

    test('blackout says how to come back', async ({ page }) => {
      test.fail(
        true,
        'The blackout is a bare black button; its hint is only an aria-label (BlackoutScreen.svelte:20).'
      );
      await openDeck(page);
      await clickTool(page, 'blackout');
      await expect(page.locator('[data-py-deck-blackout]')).toBeVisible();
      await expect.poll(() => visiblyShown(page, /press b|tap|click/)).toBe(true);
    });

    test('blackout closes with Escape, B and a click (works today)', async ({ page }) => {
      await openDeck(page);
      await clickTool(page, 'blackout');
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-py-deck-blackout]')).toHaveCount(0);
      await root(page).focus();
      await page.keyboard.press('b');
      await expect(page.locator('[data-py-deck-blackout]')).toBeVisible();
      await page.keyboard.press('b');
      await expect(page.locator('[data-py-deck-blackout]')).toHaveCount(0);
      await clickTool(page, 'blackout');
      await page.locator('[data-py-deck-blackout]').click();
      await expect(page.locator('[data-py-deck-blackout]')).toHaveCount(0);
    });
  });

  test.describe('understandable controls (T-tooltip-primitive, T-toolbar-redesign)', () => {
    test('a control explains itself on keyboard focus', async ({ page }) => {
      await openDeck(page);
      await root(page).focus();
      await page.keyboard.press('Tab');
      await expect(page.getByRole('tooltip')).toBeVisible({ timeout: 2_000 });
      await expect(page.getByRole('tooltip')).toContainText(/Page Up/);
    });

    test('toolbar buttons use recognizable icons, not bare Unicode glyphs', async ({ page }) => {
      await openDeck(page);
      const glyphOnly = await page
        .locator('[data-py-deck-toolbar] button')
        .evaluateAll((buttons) =>
          buttons
            .filter((button) => !button.querySelector('svg'))
            .map((button) => button.getAttribute('data-py-deck-tool'))
        );
      expect(glyphOnly).toEqual([]);
    });

    test('previous, next, overview and presenter have buttons', async ({ page }) => {
      await openDeck(page);
      if (
        await page
          .getByText('More', { exact: true })
          .isVisible()
          .catch(() => false)
      ) {
        await page.getByText('More', { exact: true }).click();
      }
      for (const name of [/previous/i, /next/i, /overview/i, /presenter/i]) {
        await expect(page.getByRole('button', { name })).toBeVisible();
      }
    });

    test('the help dialog explains the toolbar, not only the keys', async ({ page }) => {
      test.fail(
        true,
        'KeyboardHelp lists DECK_KEY_BINDINGS only (KeyboardHelp.svelte:47); copy and the buttons are missing.'
      );
      await openDeck(page);
      await clickTool(page, 'help');
      const help = page.getByRole('dialog', { name: /keyboard shortcuts|controls/i });
      await expect(help).toBeVisible();
      await expect(help).toContainText(/copy/i);
    });

    test('touch targets are at least 44 px on a phone', async ({ page }, testInfo) => {
      test.skip(
        testInfo.project.name !== 'mobile',
        'Coarse-pointer sizing is checked on the phone.'
      );
      await openDeck(page);
      const sizes = await page.locator('[data-py-deck-chrome-root] button').evaluateAll((buttons) =>
        buttons.map((button) => {
          const box = button.getBoundingClientRect();
          return Math.min(box.width, box.height);
        })
      );
      expect(sizes.length).toBeGreaterThan(0);
      expect(Math.min(...sizes)).toBeGreaterThanOrEqual(44);
    });

    test('navigation, jump, overview and presenter controls work on desktop and phone', async ({
      page,
    }, testInfo) => {
      await openDeck(page);
      const before = await root(page).getAttribute('data-slide-id');
      await clickTool(page, 'next');
      await expect.poll(() => root(page).getAttribute('data-slide-id')).not.toBe(before);
      await expect(page.locator('[data-py-deck-jump-count]')).toContainText(/\d+ \/ \d+/);

      await clickTool(page, 'jump');
      const list = page.getByRole('listbox', { name: 'Choose a slide' });
      await expect(list).toBeVisible();
      await list.getByRole('option').first().click();
      await expect(root(page)).toHaveAttribute('data-slide-id', 'cover');
      await expect(tool(page, 'jump')).toBeFocused();

      const openMoreOnPhone = async () => {
        if (testInfo.project.name !== 'mobile') return;
        const details = page.locator('[data-py-deck-more]');
        if (!(await details.evaluate((element) => element.hasAttribute('open')))) {
          await details.locator('summary').click();
        }
      };
      await openMoreOnPhone();
      await clickTool(page, 'overview');
      await expect(page.locator('[data-py-deck-overview]')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-py-deck-overview]')).toHaveCount(0);

      await openMoreOnPhone();
      await clickTool(page, 'presenter');
      await expect(root(page)).toHaveAttribute('data-presenter', 'true');
    });

    test('the help dialog opens and closes with ? and Escape (works today)', async ({ page }) => {
      await openDeck(page);
      await root(page).focus();
      await page.keyboard.press('?');
      await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveCount(0);
    });
  });
});
