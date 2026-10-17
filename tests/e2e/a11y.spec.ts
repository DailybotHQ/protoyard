import { expect, type Page, test } from '@playwright/test';
import { expectAccessible } from './support/a11y.ts';
import { PROTOTYPE_TARGETS, prototypeUrl, readRegistry } from './targets.ts';

/**
 * Automated accessibility audit (axe-core, WCAG 2.0/2.1 A + AA) of the gallery
 * and each demo's main screen, in light and dark mode, on the desktop and
 * mobile projects. Serious/critical violations fail; the rest are attached.
 */
const registry = readRegistry();
const firstPrototype = registry?.entries.find((e) => e.kind === 'prototype');

async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  // Contrast rules read computed colors: let theme transitions finish.
  await page.waitForTimeout(300);
}

for (const mode of ['light', 'dark'] as const) {
  test.describe(`accessibility (${mode})`, () => {
    test.use({ colorScheme: mode });

    test('gallery home', async ({ page }, testInfo) => {
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('data-theme', mode);
      await settle(page);
      await expectAccessible(page, testInfo, { label: `gallery-home-${mode}` });
    });

    test('gallery detail page', async ({ page }, testInfo) => {
      test.skip(!firstPrototype, 'no prototypes indexed');
      await page.goto(`/p/${firstPrototype?.slug}/`);
      await expect(
        page.locator('section[aria-labelledby="preview-title"][data-hydrated="true"]')
      ).toHaveCount(1);
      await settle(page);
      await expectAccessible(page, testInfo, { label: `gallery-detail-${mode}` });
    });

    test('gallery compare page', async ({ page }, testInfo) => {
      test.skip(!firstPrototype, 'no prototypes indexed');
      await page.goto(`/p/${firstPrototype?.slug}/compare/`);
      await expect(page.locator('[data-testid="compare"][data-hydrated="true"]')).toHaveCount(1);
      await settle(page);
      await expectAccessible(page, testInfo, { label: `gallery-compare-${mode}` });
    });

    for (const slug of PROTOTYPE_TARGETS) {
      test(`${slug} main screen`, async ({ page }, testInfo) => {
        await page.goto(prototypeUrl(slug));
        await expect(page.locator('html')).toHaveAttribute('data-py-ready', 'true', {
          timeout: 15_000,
        });
        // Demos with defaultMode "system" follow the emulated scheme; others (e.g. a
        // dark-only chat) keep their own mode, which is audited as rendered.
        await expect(page.locator('html')).toHaveAttribute('data-py-mode', /^(light|dark)$/);
        await settle(page);
        await expectAccessible(page, testInfo, { label: `${slug}-${mode}` });
      });
    }
  });
}
