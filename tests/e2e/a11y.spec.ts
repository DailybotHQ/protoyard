import { expect, type Page, test } from '@playwright/test';
import { expectAccessible } from './support/a11y.ts';
import { PROTOTYPE_TARGETS, prototypeUrl } from './targets.ts';

/**
 * Automated accessibility audit (axe-core, WCAG 2.0/2.1 A + AA) of the gallery
 * home, the marketplace and each demo's main screen, in light and dark mode
 * (crm-demo on both projects). Serious/critical violations fail; the rest are attached.
 */
/** crm-demo runs on both projects; the phone demo on the phone, the chat on desktop. */
const PROJECT_TAGS: Record<string, string> = {
  'mobile-banking-demo': '@mobile',
  'ai-chat-demo': '@desktop',
};

async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  // Contrast rules read computed colors: wait until no transition or
  // animation is running (reduced motion makes them near-instant anyway).
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running')
  );
}

for (const mode of ['light', 'dark'] as const) {
  test.describe(`accessibility (${mode})`, () => {
    test.use({ colorScheme: mode, reducedMotion: 'reduce' });

    test('gallery home', { tag: '@desktop' }, async ({ page }, testInfo) => {
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('data-tx-mode', mode);
      await settle(page);
      await expectAccessible(page, testInfo, { label: `gallery-home-${mode}` });
    });

    if (mode === 'light') {
      test('marketplace page', { tag: '@desktop' }, async ({ page }, testInfo) => {
        await page.goto('/marketplace/');
        await expect(page.locator('html')).toHaveAttribute('data-tx-mode', mode);
        await expect(
          page.locator('section[aria-labelledby="market-browse-title"][data-hydrated="true"]')
        ).toHaveCount(1);
        await settle(page);
        await expectAccessible(page, testInfo, { label: `marketplace-${mode}` });
      });
    }

    for (const slug of PROTOTYPE_TARGETS) {
      test(`${slug} main screen`, { tag: PROJECT_TAGS[slug] ?? [] }, async ({ page }, testInfo) => {
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
