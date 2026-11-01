import { expect, test } from '@playwright/test';
import { expectAccessible } from './support/a11y.ts';

/** The published guides on the served gallery build: the /docs/ index passes axe. */

test('the docs index passes axe', { tag: '@desktop' }, async ({ page }, testInfo) => {
  await page.goto('/docs/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('main a[href*="/docs/"]').first()).toBeVisible();
  await expectAccessible(page, testInfo, { label: 'docs-index' });
});
