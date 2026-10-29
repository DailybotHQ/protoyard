import { expect, type Page, test } from '@playwright/test';
import { expectAccessible } from './support/a11y.ts';
import { waitForPrototypeReady } from './support/ready.ts';

/**
 * The DevTools launcher and panel on a real build that ships them: the
 * showcase bundles every prototype with DevTools (prototype targets exclude
 * them, as shipped). Regression for "once opened, the panel cannot be closed":
 * a real pointer click on an icon-only button lands on its <svg>, and the
 * panel host's app-layer isolation used to hide that click from the button.
 *
 * Runs with PROTOYARD_E2E_SHOWCASE=1 (port 4501, or PROTOYARD_E2E_SHOWCASE_PORT), at the reported 2000×1030
 * window, at 1440×900 (Desktop Chrome project) and at 390×844 (mobile project).
 */
const ORIGIN = `http://127.0.0.1:${process.env.PROTOYARD_E2E_SHOWCASE_PORT ?? 4501}`;
const BASE = process.env.PROTOYARD_E2E_SHOWCASE_BASE ?? '/';
const APP = `${ORIGIN}${BASE}p/ai-chat-demo/app/`;
const SLUG = 'ai-chat-demo';

const launcher = (page: Page) => page.getByRole('button', { name: /^Open Protoyard DevTools/ });
const panel = (page: Page) => page.getByRole('complementary', { name: 'Protoyard DevTools' });

async function openApp(page: Page) {
  await page.goto(`${APP}?scenario=active-team#/c/conv_0008`);
  await waitForPrototypeReady(page, { slug: SLUG });
}

async function openPanel(page: Page) {
  await launcher(page).click();
  await expect(panel(page)).toBeVisible();
  await expect(launcher(page)).toHaveCount(0);
}

async function expectClosed(page: Page) {
  await expect(panel(page)).toHaveCount(0);
  await expect(launcher(page)).toBeVisible();
}

const SIZES = [
  { name: '2000×1030', viewport: { width: 2000, height: 1030 }, project: 'chromium' },
  { name: '1440×900', viewport: { width: 1440, height: 900 }, project: 'chromium' },
  { name: '390×844', viewport: { width: 390, height: 844 }, project: 'mobile' },
] as const;

test.describe('DevTools panel open and close', () => {
  test.skip(process.env.PROTOYARD_E2E_SHOWCASE !== '1', 'set PROTOYARD_E2E_SHOWCASE=1');

  for (const size of SIZES) {
    test.describe(size.name, () => {
      test.use({ viewport: size.viewport });

      test('closes by X, Escape and the launcher shortcut, and stays closed after reload', async ({
        page,
      }, testInfo) => {
        test.skip(testInfo.project.name !== size.project, `${size.project} project only`);
        await openApp(page);
        await expectClosed(page);

        // X: a real pointer click (lands on the icon inside the button).
        await openPanel(page);
        await panel(page).getByRole('button', { name: 'Close DevTools' }).click();
        await expectClosed(page);
        await expect(launcher(page)).toBeFocused();

        // A tab switch through its icon still works (same delegation path).
        await openPanel(page);
        await panel(page).getByRole('tab', { name: 'Time' }).click();
        await expect(panel(page).getByRole('tab', { name: 'Time' })).toHaveAttribute(
          'aria-selected',
          'true'
        );

        // Escape from inside the panel.
        await page.keyboard.press('Escape');
        await expectClosed(page);

        // The launcher's own shortcut (Ctrl/⌘ + .) toggles it closed again.
        await openPanel(page);
        await page.keyboard.press('Control+.');
        await expectClosed(page);

        // The closed state is remembered: a reload keeps the launcher, not the panel.
        await page.reload();
        await waitForPrototypeReady(page, { slug: SLUG });
        await expectClosed(page);
        const prefs = await page.evaluate(() =>
          localStorage.getItem('protoyard.ai-chat-demo.devtools')
        );
        expect(JSON.parse(prefs ?? '{}')).toMatchObject({ open: false });
      });
    });
  }
});

test.describe('DevTools theme browser', () => {
  test.skip(process.env.PROTOYARD_E2E_SHOWCASE !== '1', 'set PROTOYARD_E2E_SHOWCASE=1');
  test.use({ viewport: { width: 1440, height: 900 } });

  test('finds a library theme by search and applies it; the panel passes axe', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'chromium project only');
    await openApp(page);
    await openPanel(page);
    await panel(page).getByRole('tab', { name: 'Look' }).click();

    const browser = panel(page).getByTestId('theme-browser');
    await expect(browser.getByRole('button', { name: /^Browse \d+ more themes$/ })).toBeVisible();
    await browser.getByLabel('Search themes').fill('fintech ledger');
    await expect(browser.getByRole('status')).toHaveText(/\d+ themes? match/);

    const card = browser.getByRole('radio', { name: /Fintech Ledger/ });
    await card.click();
    // The library chunk and the theme builder load on first use, then the page switches.
    await expect(page.locator('html')).toHaveAttribute('data-py-theme', 'fintech-ledger');
    await expect(card).toHaveAttribute('aria-checked', 'true');

    await expectAccessible(page, testInfo, { include: '.py-devtools', label: 'devtools-look' });
  });
});
