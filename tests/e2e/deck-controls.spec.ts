import { expect, type Locator, type Page, test } from '@playwright/test';
import { expectAccessible } from './support/a11y.ts';

/*
 * Deck chrome controls (PLAN_006). Started as one reproduction per defect in the
 * plan's analysis_results/CONTROLS_AUDIT.md; every defect is now fixed, so each
 * test asserts the behavior a first-time viewer needs: full screen, print,
 * visible feedback, Debug for agents, understandable controls, accessibility on
 * desktop and phone, and toolbar geometry (every tool on screen, hit-testable).
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

    test('Copy link copies a plain link to this slide (T-agent-debug-panel)', async ({ page }) => {
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
      expect(copied).toBe(`${deckUrl}#/cover/0`);
    });

    test('the laser shows where it is as soon as it is turned on', async ({ page }) => {
      await openDeck(page);
      await root(page).focus();
      await page.keyboard.press('l');
      await expect(root(page)).toHaveAttribute('data-laser', 'true');
      await expect(page.locator('[data-py-deck-laser-dot]')).toBeVisible({ timeout: 2_000 });
    });

    test('the laser works with touch', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile', 'Touch is exercised in the mobile project.');
      await openDeck(page);
      await (await visibleControl(page, tool(page, 'laser'))).tap();
      const stage = await page.locator('[data-py-deck-stage-area]').boundingBox();
      if (!stage) throw new Error('no stage');
      await page.touchscreen.tap(stage.x + stage.width / 2, stage.y + stage.height / 2);
      await expect(page.locator('[data-py-deck-laser-dot]')).toBeVisible({ timeout: 2_000 });
    });

    test('blackout says how to come back', async ({ page }) => {
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

  test.describe('debug for agents (T-agent-debug-panel)', () => {
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
      await root(page).focus();
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
      await root(page).focus();
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
      await expect(page.getByRole('dialog', { name: 'Controls and shortcuts' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: 'Controls and shortcuts' })).toHaveCount(0);
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
      const more = page.locator('[data-py-deck-more]');
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
        await settle(page);
        await expectAccessible(page, testInfo, { label: `${mode}-toolbar` });

        await root(page).focus();
        await page.keyboard.press('Tab');
        await expect(page.getByRole('tooltip')).toBeVisible({ timeout: 2_000 });
        await settle(page);
        await expectAccessible(page, testInfo, { label: `${mode}-tooltip` });

        if (await openMore(page)) {
          await expect(page.locator('[data-py-deck-more-menu]')).toBeVisible();
          await settle(page);
          await expectAccessible(page, testInfo, { label: `${mode}-more-menu` });
          await page.locator('[data-py-deck-more] summary').click();
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

        await root(page).focus();
        await page.keyboard.press('d');
        await expect(page.locator('[data-py-deck-debug]')).toBeVisible();
        await settle(page);
        await expectAccessible(page, testInfo, { label: `${mode}-debug` });
        await page.keyboard.press('Escape');
        await expect(page.locator('[data-py-deck-debug]')).toHaveCount(0);

        await enterFullscreenWithKey(page);
        await expect(page.locator('[data-py-deck-fullscreen-overlay]')).toHaveAttribute(
          'data-visible',
          'true'
        );
        await settle(page);
        await expectAccessible(page, testInfo, { label: `${mode}-fullscreen` });
      });
    }

    test('the chrome works keyboard-only, with a visible focus ring on every stop', async ({
      page,
    }) => {
      await page.goto(`${deckUrl}?debug=1#/cover/0`);
      await expect(root(page)).toHaveAttribute('data-slide-id', 'cover');
      const chrome = page.locator('[data-py-deck-chrome-root]');
      const visibleButtons = await chrome
        .locator('button:visible, summary:visible')
        .evaluateAll((nodes) => nodes.length);

      // Tab from the deck through the whole chrome: every stop shows a focus ring.
      await root(page).focus();
      const reached: string[] = [];
      for (let index = 0; index < 40; index += 1) {
        await page.keyboard.press('Tab');
        const stop = await page.evaluate(() => {
          const element = document.activeElement as HTMLElement | null;
          if (!element?.closest('[data-py-deck-chrome-root]')) return null;
          const style = getComputedStyle(element);
          const ring =
            (style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) >= 2) ||
            style.boxShadow !== 'none';
          const name =
            element.getAttribute('aria-label') ?? element.textContent?.trim() ?? element.tagName;
          return { name, ring };
        });
        if (!stop) {
          if (reached.length > 0) break;
          continue;
        }
        expect(stop.ring, `${stop.name} shows no visible focus ring`).toBe(true);
        if (reached.includes(stop.name)) break;
        reached.push(stop.name);
      }
      expect(reached.length).toBe(visibleButtons);

      // The slide list: Enter opens it on the current slide, arrows move, Enter picks.
      await tool(page, 'jump').focus();
      await page.keyboard.press('Enter');
      const list = page.getByRole('listbox', { name: 'Choose a slide' });
      await expect(list).toBeVisible();
      await expect(list.getByRole('option', { selected: true })).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await expect(list).toHaveCount(0);
      await expect(root(page)).not.toHaveAttribute('data-slide-id', 'cover');
      await expect(tool(page, 'jump')).toBeFocused();

      // Escape closes the list and gives focus back without moving the deck.
      const current = await root(page).getAttribute('data-slide-id');
      await page.keyboard.press('Enter');
      await expect(list).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(list).toHaveCount(0);
      await expect(tool(page, 'jump')).toBeFocused();
      await expect(root(page)).toHaveAttribute('data-slide-id', current ?? '');

      // The More menu (phones): Enter opens it, Escape closes it and returns focus.
      const summary = page.locator('[data-py-deck-more] summary');
      if (await summary.isVisible()) {
        await summary.focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('[data-py-deck-more-menu]')).toBeVisible();
        await page.keyboard.press('Tab');
        await expect(page.locator('[data-py-deck-more-menu] button').first()).toBeFocused();
        // The first Escape closes only the focus tooltip (WCAG 1.4.13), the second the menu.
        await expect(page.getByRole('tooltip')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('tooltip')).toBeHidden();
        await expect(page.locator('[data-py-deck-more-menu]')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.locator('[data-py-deck-more-menu]')).toBeHidden();
        await expect(summary).toBeFocused();
      }

      // Help: Enter opens it, focus moves in, Escape closes it and returns focus.
      await (await visibleControl(page, tool(page, 'help'))).focus();
      await page.keyboard.press('Enter');
      const help = page.getByRole('dialog', { name: 'Controls and shortcuts' });
      await expect(help).toBeVisible();
      await expect
        .poll(() => help.evaluate((dialog) => dialog.contains(document.activeElement)))
        .toBe(true);
      await page.keyboard.press('Escape');
      await expect(help).toHaveCount(0);
      // Back to the opener: Help itself, or "More" on a phone (Help sits in the closed menu).
      await expect((await summary.isVisible()) ? summary : tool(page, 'help')).toBeFocused();
    });

    test('every chrome target is at least 44 px on a phone, menus included', async ({
      page,
    }, testInfo) => {
      test.skip(
        testInfo.project.name !== 'mobile',
        'Coarse-pointer sizing is checked on the phone.'
      );
      await page.goto(`${deckUrl}?debug=1#/cover/0`);
      await expect(root(page)).toHaveAttribute('data-slide-id', 'cover');
      const smallest = (selector: string) =>
        page.locator(selector).evaluateAll(
          (nodes) =>
            nodes
              .filter((node) => node.getClientRects().length > 0)
              .map((node) => {
                const box = node.getBoundingClientRect();
                return { size: Math.min(box.width, box.height), name: node.textContent?.trim() };
              })
              .sort((a, b) => a.size - b.size)[0]
        );
      const expectTargets = async (selector: string) => {
        const target = await smallest(selector);
        expect(target, `no visible ${selector}`).toBeTruthy();
        expect(target?.size, `${target?.name} is under 44 px`).toBeGreaterThanOrEqual(44);
      };
      expect(await openMore(page)).toBe(true);
      await expect(page.locator('[data-py-deck-more-menu]')).toBeVisible();
      await expectTargets('[data-py-deck-chrome-root] button, [data-py-deck-more] summary');
      await page.locator('[data-py-deck-more] summary').click();
      await clickTool(page, 'jump');
      await expect(page.getByRole('listbox', { name: 'Choose a slide' })).toBeVisible();
      await expectTargets('[data-py-deck-slide-list] [role="option"]');
      await page.keyboard.press('Escape');
      await clickTool(page, 'help');
      await expect(page.getByRole('dialog', { name: 'Controls and shortcuts' })).toBeVisible();
      await expectTargets('[role="dialog"] button');
      await page.keyboard.press('Escape');
      await root(page).focus();
      await page.keyboard.press('d');
      await expect(page.locator('[data-py-deck-debug]')).toBeVisible();
      await expectTargets('[data-py-deck-debug] button');
    });

    test('reduced motion removes the chrome fades', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await openDeck(page);
      await root(page).focus();
      await page.keyboard.press('Tab');
      await expect(page.getByRole('tooltip')).toBeVisible({ timeout: 2_000 });
      // themes/base.css turns every transition into 0.01 ms: instant.
      const durations = await page.locator('[data-py-deck-app] *').evaluateAll((nodes) =>
        nodes
          .map((node) => getComputedStyle(node))
          .filter(
            (style) => style.transitionProperty !== 'none' && style.transitionProperty !== 'all'
          )
          .flatMap((style) =>
            style.transitionDuration.split(',').map((value) => Number.parseFloat(value))
          )
          .filter((seconds) => seconds > 0.001)
      );
      expect(durations).toEqual([]);
      const animated = await page.evaluate(() =>
        document
          .getAnimations()
          .map((animation) => Number(animation.effect?.getComputedTiming().duration ?? 0))
          .filter((ms) => ms > 1)
      );
      expect(animated).toEqual([]);
    });
  });

  test.describe('toolbar geometry (Final Review A)', () => {
    test('on a phone, the More menu opens on screen and a tap reaches every item', async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile', 'Touch is checked on the phone.');
      await openDeck(page);
      const summary = page.locator('[data-py-deck-more] summary');
      const tapCenter = async (target: Locator) => {
        const box = await target.boundingBox();
        expect(box, 'the target has a box').not.toBeNull();
        if (box) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      };
      await tapCenter(summary);
      const menu = page.locator('[data-py-deck-more-menu]');
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
            const tool = (event.target as Element).closest('[data-py-deck-more-menu] button');
            if (!tool) return;
            w.__taps?.push(tool.getAttribute('data-py-deck-tool') ?? '');
            event.stopImmediatePropagation();
            event.preventDefault();
          },
          true
        );
      });
      const tools = await menu
        .locator('button[data-py-deck-tool]')
        .evaluateAll((buttons) =>
          buttons.map((button) => button.getAttribute('data-py-deck-tool'))
        );
      expect(tools.length).toBeGreaterThan(4);
      for (const id of tools) {
        const item = menu.locator(`[data-py-deck-tool="${id}"]`);
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

    for (const [width, height] of [
      [1280, 800],
      [1024, 700],
      [760, 700],
    ] as const) {
      test(`at ${width} px every tool is on screen, never in a scrolled strip`, async ({
        page,
      }, testInfo) => {
        test.skip(testInfo.project.name !== 'chromium', 'Desktop widths.');
        await page.setViewportSize({ width, height });
        await openDeck(page);
        const geometry = await page.evaluate(() => {
          const root = document.querySelector('[data-py-deck-chrome-root]') as HTMLElement;
          const box = root.getBoundingClientRect();
          const outside = [
            ...root.querySelectorAll<HTMLElement>(
              '[data-py-deck-tool], [data-py-deck-more] summary'
            ),
          ]
            // Shown tools only: a closed More menu's items are not rendered.
            .filter((element) => element.checkVisibility())
            .filter((element) => {
              const rect = element.getBoundingClientRect();
              const hit = document.elementFromPoint(
                rect.x + rect.width / 2,
                rect.y + rect.height / 2
              );
              return (
                rect.left < box.left ||
                rect.right > box.right ||
                rect.top < box.top ||
                rect.bottom > box.bottom ||
                hit === null ||
                !element.contains(hit)
              );
            })
            .map((element) => element.getAttribute('data-py-deck-tool') ?? 'more');
          const scrolled = [...root.querySelectorAll<HTMLElement>('*')]
            .filter(
              (element) => element.clientWidth > 1 && element.scrollWidth > element.clientWidth + 1
            )
            .filter((element) => getComputedStyle(element).overflowX !== 'visible')
            .map((element) => element.className);
          return {
            outside,
            scrolled,
            more: root.querySelector('[data-py-deck-more]') !== null,
          };
        });
        expect(geometry.outside, 'tools outside the chrome or covered').toEqual([]);
        expect(geometry.scrolled, 'scrolled chrome strips').toEqual([]);
        // Wide screens show every tool; a narrow window folds the rest into More.
        expect(geometry.more).toBe(width < 900);
        if (geometry.more) {
          await page.locator('[data-py-deck-more] summary').click();
          await expect(page.locator('[data-py-deck-more-menu]')).toBeInViewport({ ratio: 1 });
        } else {
          await expect(tool(page, 'help')).toBeInViewport({ ratio: 1 });
        }
      });
    }
  });
});
