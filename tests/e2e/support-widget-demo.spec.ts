import { expect, type Page, test } from '@playwright/test';
import { expectAccessible } from './support/a11y.ts';
import { PROTOTYPE_TARGETS, prototypeUrl } from './targets.ts';

/**
 * Flagship support widget against its static production build: host launcher,
 * order lookup, return flow, reload persistence, and axe.
 */
const SLUG = 'support-widget-demo';
test.skip(!PROTOTYPE_TARGETS.includes(SLUG), `set PROTOYARD_E2E_PROTOTYPES to include ${SLUG}`);

type Runtime = {
  data: { counts(): Promise<Record<string, number>> };
  storage(): { backend: string };
};
declare global {
  interface Window {
    __protoyard?: Runtime;
  }
}

async function openApp(page: Page, scenario = 'returning-customer') {
  await page.goto(`${prototypeUrl(SLUG)}?scenario=${scenario}&shell=widget-host`);
  await expect(page.locator('html')).toHaveAttribute('data-py-ready', 'true', { timeout: 20_000 });
}

test.describe('Northwind Help (support-widget-demo)', () => {
  test('opens the host launcher, looks up an order, starts a return, and persists', async ({
    page,
  }) => {
    await openApp(page);

    // Widget-host launcher on the fictional storefront.
    const launcher = page.getByRole('button', { name: /Open chat|Close chat/i });
    await expect(launcher).toBeVisible({ timeout: 15_000 });
    if ((await launcher.getAttribute('aria-expanded')) !== 'true') {
      await launcher.click();
    }
    await expect(page.getByRole('heading', { name: 'Northwind Help' })).toBeVisible();

    await page.getByTestId('order-lookup-input').fill('NW-10040');
    await page.getByTestId('order-lookup-submit').click();
    await expect(page.getByTestId('order-card')).toBeVisible();
    await expect(page.getByTestId('order-number')).toContainText('NW-');
    await expect(page.getByTestId('order-total')).toBeVisible();

    await page.getByTestId('return-reason').fill('Wrong size for weekend trips');
    await page.getByTestId('start-return').click();
    await expect(page.getByTestId('returns-list')).toBeVisible();
    await expect(page.getByTestId('return-row').first()).toContainText('requested');

    const before = await page.evaluate(() => window.__protoyard?.data.counts());
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-py-ready', 'true', {
      timeout: 20_000,
    });
    // Re-open panel after reload (shell may start closed).
    const launcher2 = page.getByRole('button', { name: /Open chat|Close chat/i });
    await expect(launcher2).toBeVisible({ timeout: 15_000 });
    if ((await launcher2.getAttribute('aria-expanded')) !== 'true') {
      await launcher2.click();
    }
    await expect(page.getByTestId('returns-list')).toBeVisible();
    await expect(page.getByTestId('return-row').first()).toContainText('requested');
    expect(await page.evaluate(() => window.__protoyard?.data.counts())).toEqual(before);
    expect(await page.evaluate(() => window.__protoyard?.storage().backend)).toBe('indexeddb');
  });

  test('has no serious axe violations on the open widget', async ({ page }, testInfo) => {
    await openApp(page, 'first-visit');
    const launcher = page.getByRole('button', { name: /Open chat|Close chat/i });
    await expect(launcher).toBeVisible({ timeout: 15_000 });
    if ((await launcher.getAttribute('aria-expanded')) !== 'true') {
      await launcher.click();
    }
    await expect(page.getByRole('heading', { name: 'Northwind Help' })).toBeVisible();
    await expectAccessible(page, testInfo, { label: 'support-widget-open' });
  });
});
