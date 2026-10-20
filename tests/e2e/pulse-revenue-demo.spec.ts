import { expect, type Page, test } from '@playwright/test';
import { expectAccessible } from './support/a11y.ts';
import { waitForPrototypeReady } from './support/ready.ts';
import { prototypeUrl } from './targets.ts';

const SLUG = 'pulse-revenue-demo';

async function openRoute(page: Page, route: string, scenario = 'quarter-of-history') {
  await page.goto(`${prototypeUrl(SLUG)}?scenario=${scenario}#${route}`);
  await waitForPrototypeReady(page, { slug: SLUG });
}

async function openRange(page: Page, isMobile: boolean) {
  const main = page.getByRole('main');
  if (isMobile) await main.getByRole('button', { name: /^Last/ }).click();
  else await main.getByRole('button', { name: /^Date range:/ }).click();
  const presets = page.getByRole('group', { name: 'Preset ranges' });
  await expect(presets).toBeVisible();
  return presets;
}

test('dashboard period, analytics controls, CSV export and lifecycle board work', async ({
  page,
  isMobile,
}, testInfo) => {
  await openRoute(page, '/', 'launch-spike');
  await expect(page.getByRole('heading', { name: 'Revenue overview' })).toBeVisible();
  await page.getByLabel('Period').selectOption('7');
  await expect(page.getByLabel('Period')).toHaveValue('7');
  await expectAccessible(page, testInfo, { include: 'main', label: 'pulse-revenue-dashboard' });

  await openRoute(page, '/insights', 'launch-spike');
  await page.getByLabel('Measure').selectOption({ label: 'Gross revenue' });
  await page.getByLabel('Break down by').selectOption('plan');
  await expect(page).toHaveURL(/measure=1/);
  await expect(page).toHaveURL(/dimension=plan/);

  const presets = await openRange(page, isMobile);
  await presets.getByRole('button', { name: 'Last 7 days' }).click();
  await expect(
    page.locator('#main-content').getByRole('button', {
      name: isMobile ? /^Last 7 days/ : 'Date range: Last 7 days',
    })
  ).toBeVisible();
  await expectAccessible(page, testInfo, { include: 'main', label: 'pulse-revenue-analytics' });

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('transactions-analytics.csv');

  await openRoute(page, '/transactions/board', 'launch-spike');
  await expect(page.getByRole('region', { name: 'Revenue lifecycle' })).toBeVisible();
  await expectAccessible(page, testInfo, { include: 'main', label: 'pulse-revenue-board' });
});

test('viewer can inspect analytics but cannot export CSV', async ({ page }, testInfo) => {
  await openRoute(page, '/insights', 'viewer');
  await expect(page.getByRole('heading', { name: 'Revenue analytics' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Analytics chart' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export CSV' })).toHaveCount(0);
  await expectAccessible(page, testInfo, { include: 'main', label: 'pulse-revenue-viewer' });
});
