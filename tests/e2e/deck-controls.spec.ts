import { expect, type Locator, type Page, test } from '@playwright/test';
import { expectAccessible } from './support/a11y.ts';

/*
 * Deck chrome controls (PLAN_006), the essential subset: Debug for agents (off
 * in production, opens under ?debug=1), the navigation, jump, overview and
 * presenter controls, axe on every chrome surface in light and dark on desktop
 * and phone, and the phone's More menu.
 *
 * Opt-in: PROTOYARD_E2E_DECK=1 starts the built catalog deck server (the same
 * fixture as deck-navigation.spec.ts).
 */

const deckPort = Number(process.env.PROTOYARD_E2E_DECK_PORT ?? 4891);
const deckUrl = `http://127.0.0.1:${deckPort}/`;

/*
 * The chrome is the @texuli/slides stage's (toolbar, More, slide list, help,
 * blackout, laser, full screen overlay, toast); DeckApp adds the "Debug for
 * agents" button and panel. The wrapper keeps the host location attributes.
 */
const root = (page: Page) => page.locator('[data-py-deck-app]');
const stage = (page: Page) => page.locator('.tx-deck-stage');
const MORE = '.tx-deck-chrome-more';
const MORE_MENU = '.tx-deck-chrome-more[open] .tx-deck-chrome-more__panel';
const tool = (page: Page, name: string) =>
  page.locator(name === 'debug' ? '[data-py-deck-tool="debug"]' : `[data-tx-deck-tool="${name}"]`);
/** True when the focused element is inside the stage (the slide, after a jump or full screen). */
const focusInStage = (page: Page) =>
  page.evaluate(() => document.querySelector('.tx-deck-stage')?.contains(document.activeElement));

async function visibleControl(page: Page, control: Locator): Promise<Locator> {
  // The stage measures its toolbar after mount, then folds what does not fit into More.
  await expect
    .poll(async () => (await control.isVisible()) || (await page.locator(MORE).count()) > 0)
    .toBe(true);
  if (await control.isVisible()) return control;
  const more = page.locator(MORE);
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
  await stage(page).focus();
  await page.keyboard.press('f');
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
}

test.describe('deck chrome controls', () => {
  test.skip(
    process.env.PROTOYARD_E2E_DECK !== '1',
    'Opt-in: PROTOYARD_E2E_DECK=1 (or name a deck spec) starts the built deck server.'
  );

  test.describe('debug for agents (T-agent-debug-panel)', { tag: '@desktop' }, () => {
    /** JavaScript files the page has loaded so far. */
    const scripts = (page: Page) =>
      page.evaluate(() =>
        performance
          .getEntriesByType('resource')
          .map((entry) => entry.name)
          .filter((name) => name.endsWith('.js'))
      );

    test('is off in a production build without ?debug=1', async ({ page }) => {
      await openDeck(page);
      await expect(tool(page, 'debug')).toHaveCount(0);
      await stage(page).focus();
      await page.keyboard.press('d');
      await expect(page.locator('[data-py-deck-debug]')).toHaveCount(0);
    });

    test('opens with D under ?debug=1, loads its chunk only then, and copies a reference to the slide', async ({
      page,
    }) => {
      await page.goto(`${deckUrl}?debug=1#/cover/0`);
      await expect(root(page)).toHaveAttribute('data-slide-id', 'cover');
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
      expect((await scripts(page)).some((name) => name.includes('DeckDebugPanel'))).toBe(false);
      await stage(page).focus();
      await page.keyboard.press('d');
      const panel = page.locator('[data-py-deck-debug]');
      await expect(panel).toBeVisible();
      expect((await scripts(page)).some((name) => name.includes('DeckDebugPanel'))).toBe(true);
      await expect(panel.locator('[data-py-deck-debug-slide]')).toHaveText('cover');
      await panel.locator('[data-py-deck-debug-action="reference"]').click();
      const read = () =>
        page.evaluate(() => (window as typeof window & { __copied?: string }).__copied ?? '');
      await expect.poll(read).toContain('id=cover');
      expect(await read()).toMatch(/^\[slide-ref\] /);
      // A click in the panel never advances the deck; Escape closes it.
      await expect(root(page)).toHaveAttribute('data-slide-id', 'cover');
      await page.keyboard.press('Escape');
      await expect(panel).toHaveCount(0);
    });
  });

  test.describe('understandable controls (T-tooltip-primitive, T-toolbar-redesign)', () => {
    test('navigation, jump, overview and presenter controls work on desktop and phone', async ({
      page,
    }, testInfo) => {
      await openDeck(page);
      const before = await root(page).getAttribute('data-slide-id');
      await clickTool(page, 'next');
      await expect.poll(() => root(page).getAttribute('data-slide-id')).not.toBe(before);
      await expect(page.locator('.tx-deck-chrome-tool__count')).toContainText(/\d+ \/ \d+/);

      await clickTool(page, 'jump');
      const list = page.getByRole('listbox', { name: 'Choose a slide' });
      await expect(list).toBeVisible();
      await list.getByRole('option').first().click();
      await expect(root(page)).toHaveAttribute('data-slide-id', 'cover');
      // The stage moves focus to the chosen slide.
      await expect.poll(() => focusInStage(page)).toBe(true);

      const openMoreOnPhone = async () => {
        if (testInfo.project.name !== 'mobile') return;
        const details = page.locator(MORE);
        if ((await details.count()) === 0) return;
        if (!(await details.evaluate((element) => element.hasAttribute('open')))) {
          await details.locator('summary').click();
        }
      };
      await openMoreOnPhone();
      await clickTool(page, 'overview');
      await expect(page.locator('[data-tx-deck-overview]')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-tx-deck-overview]')).toHaveCount(0);

      await openMoreOnPhone();
      await clickTool(page, 'presenter');
      await expect(root(page)).toHaveAttribute('data-presenter', 'true');
    });
  });

  test.describe('accessible chrome on desktop and phone (T-a11y-mobile)', () => {
    /** Waits for every running CSS transition (fades) to finish, so axe sees the final colors. */
    /**
     * Lets the chrome's 200 ms fades finish, so axe sees the final colors. Capped:
     * a transition on a control inside the closed More menu never finishes.
     */
    const settle = (page: Page) =>
      page.evaluate(async () => {
        const finished = Promise.allSettled(
          document.getAnimations().map((animation) => animation.finished)
        );
        await Promise.race([finished, new Promise((done) => setTimeout(done, 1_000))]);
        await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      });

    const openMore = async (page: Page) => {
      // The stage measures its toolbar after mount before it folds tools into More.
      await visibleControl(page, tool(page, 'help'));
      const more = page.locator(MORE);
      if ((await more.count()) === 0) return false;
      if (!(await more.evaluate((element) => element.hasAttribute('open')))) {
        await more.locator('summary').click();
      }
      return true;
    };

    for (const mode of ['light', 'dark'] as const) {
      test(`every chrome surface passes axe in ${mode}`, async ({ page }, testInfo) => {
        await page.goto(`${deckUrl}?debug=1&mode=${mode}#/cover/0`);
        await expect(root(page)).toHaveAttribute('data-slide-id', 'cover');
        // The deck theme loads lazily: measure the colors once the stage has applied it.
        await expect(stage(page)).toHaveAttribute('data-theme-status', 'applied');
        await expect(stage(page)).toHaveAttribute('data-tx-mode', mode);
        await settle(page);
        await expectAccessible(page, testInfo, { label: `${mode}-toolbar` });

        await stage(page).focus();
        await page.keyboard.press('Tab');
        await expect(page.getByRole('tooltip')).toBeVisible({ timeout: 2_000 });
        await settle(page);
        await expectAccessible(page, testInfo, { label: `${mode}-tooltip` });

        if (await openMore(page)) {
          await expect(page.locator(MORE_MENU)).toBeVisible();
          await settle(page);
          await expectAccessible(page, testInfo, { label: `${mode}-more-menu` });
          await page.locator(`${MORE} summary`).click();
        }

        await clickTool(page, 'jump');
        await expect(page.getByRole('listbox', { name: 'Choose a slide' })).toBeVisible();
        await settle(page);
        await expectAccessible(page, testInfo, { label: `${mode}-slide-list` });
        await page.keyboard.press('Escape');
        await expect(page.getByRole('listbox', { name: 'Choose a slide' })).toHaveCount(0);

        await clickTool(page, 'help');
        await expect(page.getByRole('dialog', { name: 'Controls and shortcuts' })).toBeVisible();
        await settle(page);
        await expectAccessible(page, testInfo, { label: `${mode}-help` });
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog', { name: 'Controls and shortcuts' })).toHaveCount(0);

        await stage(page).focus();
        await page.keyboard.press('d');
        await expect(page.locator('[data-py-deck-debug]')).toBeVisible();
        await settle(page);
        await expectAccessible(page, testInfo, { label: `${mode}-debug` });
        await page.keyboard.press('Escape');
        await expect(page.locator('[data-py-deck-debug]')).toHaveCount(0);

        await enterFullscreenWithKey(page);
        await page.mouse.move(300, 300);
        await expect(page.locator('.tx-deck-chrome-overlay')).toHaveAttribute(
          'data-visible',
          'true'
        );
        await settle(page);
        await expectAccessible(page, testInfo, { label: `${mode}-fullscreen` });
      });
    }
  });

  test.describe('toolbar geometry (Final Review A)', () => {
    test('on a phone, the More menu opens on screen and a tap reaches every item', {
      tag: '@mobile',
    }, async ({ page }) => {
      await openDeck(page);
      const summary = page.locator(`${MORE} summary`);
      const tapCenter = async (target: Locator) => {
        const box = await target.boundingBox();
        expect(box, 'the target has a box').not.toBeNull();
        if (box) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      };
      await tapCenter(summary);
      const menu = page.locator(MORE_MENU);
      await expect(menu).toBeVisible();

      const viewport = page.viewportSize() ?? { width: 0, height: 0 };
      const box = await menu.boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
      }

      // Record which tool each tap lands on, without running it (no print dialog,
      // no full screen), so the menu stays open for the next tap.
      await page.evaluate(() => {
        const w = window as typeof window & { __taps?: string[] };
        w.__taps = [];
        window.addEventListener(
          'click',
          (event) => {
            const tool = (event.target as Element).closest('.tx-deck-chrome-more__panel button');
            if (!tool) return;
            w.__taps?.push(tool.getAttribute('data-tx-deck-tool') ?? '');
            event.stopImmediatePropagation();
            event.preventDefault();
          },
          true
        );
      });
      const tools = await menu
        .locator('button[data-tx-deck-tool]')
        .evaluateAll((buttons) =>
          buttons.map((button) => button.getAttribute('data-tx-deck-tool'))
        );
      expect(tools.length).toBeGreaterThan(4);
      for (const id of tools) {
        const item = menu.locator(`[data-tx-deck-tool="${id}"]`);
        // The item is what a finger at its centre touches, and the page never scrolls.
        expect(
          await item.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            const hit = document.elementFromPoint(
              rect.x + rect.width / 2,
              rect.y + rect.height / 2
            );
            return hit !== null && element.contains(hit);
          }),
          `${id} is hit-testable`
        ).toBe(true);
        await tapCenter(item);
      }
      expect(
        await page.evaluate(() => (window as typeof window & { __taps?: string[] }).__taps)
      ).toEqual(tools);
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
    });
  });
});
