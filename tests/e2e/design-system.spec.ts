import { expect, type Page, test } from '@playwright/test';
import { expectAccessible } from './support/a11y.ts';
import { waitForPrototypeReady } from './support/ready.ts';
import { DEVTOOLS_TARGETS, devtoolsPrototypeUrl } from './targets.ts';

/**
 * Design systems (PLAN_008 T-design-systems), in a real browser on a DevTools
 * build: Theme Studio creates a Texuli design system from a name, a brand
 * color and a few choices, Texuli compiles it, "Save and apply" paints it
 * with Texuli's runtime, it survives a reload, and the prototype passes axe
 * in light and dark (the chromium and mobile projects cover desktop and phone).
 */

const SLUG = 'mobile-banking-demo';
const ID = 'harbor-ds';

const panel = (page: Page) => page.locator('[data-protoyard-devtools]');
const root = (page: Page) => page.locator('html');

async function openStudio(page: Page) {
  await page.getByRole('button', { name: /Open Protoyard DevTools/ }).click();
  const devtools = panel(page).getByRole('complementary', { name: 'Protoyard DevTools' });
  await expect(devtools).toBeVisible();
  await devtools.getByRole('tab', { name: 'Look' }).click();
  await devtools.getByRole('button', { name: 'Open studio' }).click();
  const studio = devtools.getByTestId('design-system-studio');
  await expect(studio).toBeVisible();
  return { devtools, studio };
}

async function closeDevtools(page: Page) {
  await page.keyboard.press('Escape');
  await expect(panel(page).getByRole('complementary', { name: 'Protoyard DevTools' })).toBeHidden();
}

/** axe on the prototype (DevTools closed) in one color scheme, after the root repaints. */
async function expectAccessibleIn(page: Page, scheme: 'light' | 'dark', label: string) {
  await page.emulateMedia({ colorScheme: scheme });
  await expect(root(page)).toHaveAttribute('data-tx-mode', scheme);
  await expect(root(page)).toHaveAttribute('data-tx-ds', ID);
  // Theme changes animate colors: let them land before axe samples contrast.
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== 'running')
  );
  await expectAccessible(page, test.info(), {
    exclude: ['[data-protoyard-devtools]'],
    label: `${label}-${scheme}`,
  });
}

test.describe('Design systems in Theme Studio (DevTools build)', () => {
  test.skip(
    !DEVTOOLS_TARGETS.includes(SLUG),
    `set PROTOYARD_E2E_DEVTOOLS_PROTOTYPES to include ${SLUG}`
  );

  test('creates a design system, applies it, keeps it after a reload, and passes axe in light and dark', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(devtoolsPrototypeUrl(SLUG));
    await waitForPrototypeReady(page, { slug: SLUG });
    await expect(root(page)).not.toHaveAttribute('data-tx-ds', /.+/);

    const { studio } = await openStudio(page);
    await studio.getByLabel('Design system name').fill('Harbor DS');
    await studio.getByLabel('Brand color (hex)').fill('#0f766e');
    await studio.getByLabel('Body font').fill('Georgia');
    await studio.getByRole('radio', { name: 'Compact' }).click();
    await studio.getByRole('radio', { name: 'Pill' }).click();
    await studio.getByRole('button', { name: 'Create design system' }).click();

    const report = studio.getByTestId('ds-report');
    await expect(report).toContainText(`${ID}@1.0.0`);
    await expect(report).toContainText(/light: (\d+)\/\1 contrast pairs pass/);
    await expect(report).toContainText(/dark: (\d+)\/\1 contrast pairs pass/);
    await studio.getByRole('button', { name: 'Save and apply' }).click();

    // Painted by Texuli's runtime: the scope attributes and the compiled variables.
    await expect(root(page)).toHaveAttribute('data-tx-ds', ID);
    await expect(root(page)).toHaveAttribute('data-tx-scope', '');
    const painted = async () =>
      page.evaluate(() => {
        const style = document.documentElement.style;
        return {
          density: style.getPropertyValue('--tx-density'),
          primary: style.getPropertyValue('--tx-primary'),
          font: style.getPropertyValue('--tx-font-sans'),
          bodyFont: getComputedStyle(document.body).fontFamily,
        };
      });
    const applied = await painted();
    expect(applied.density).toBe('0.875');
    expect(applied.primary).toBe('#0f766e');
    expect(applied.font).toContain('Georgia');

    await closeDevtools(page);
    await expectAccessibleIn(page, 'light', 'applied');
    await expectAccessibleIn(page, 'dark', 'applied');

    // Reload: the saved theme and the stored document paint it again.
    await page.emulateMedia({ colorScheme: 'light' });
    await page.reload();
    await waitForPrototypeReady(page, { slug: SLUG });
    await expect(root(page)).toHaveAttribute('data-tx-ds', ID);
    expect(await painted()).toEqual(applied);
    await expectAccessibleIn(page, 'light', 'reloaded');
    await expectAccessibleIn(page, 'dark', 'reloaded');
  });

  test('refuses a pasted design system with CSS injection and leaves the page as it was', async ({
    page,
  }) => {
    await page.goto(devtoolsPrototypeUrl(SLUG));
    await waitForPrototypeReady(page, { slug: SLUG });
    const { studio } = await openStudio(page);
    await studio.getByLabel('Design-system JSON').fill(
      JSON.stringify({
        format: 'texuli/design-system',
        formatVersion: 1,
        id: 'evil',
        version: '1.0.0',
        name: 'Evil',
        color: { brand: { seed: '#fff;}body{display:none' } },
        assets: { logo: { light: 'https://tracker.example/logo.svg' } },
      })
    );
    await studio.getByRole('button', { name: 'Check JSON' }).click();
    await expect(studio.getByTestId('ds-errors')).toBeVisible();
    await expect(studio.getByRole('button', { name: 'Save and apply' })).toHaveCount(0);
    await expect(root(page)).not.toHaveAttribute('data-tx-ds', /.+/);
    await expect(page.locator('body')).toBeVisible();
  });
});
