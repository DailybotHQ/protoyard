import { expect, type Page, test } from '@playwright/test';
import { expectAccessible } from './support/a11y.ts';
import { waitForPrototypeReady } from './support/ready.ts';
import { PROTOTYPE_TARGETS, prototypeUrl } from './targets.ts';

test.skip(
  !PROTOTYPE_TARGETS.includes('pulse-revenue-demo'),
  'set PROTOYARD_E2E_PROTOTYPES to include pulse-revenue-demo'
);

const SLUG = 'pulse-revenue-demo';

async function openRoute(page: Page, route: string, scenario = 'quarter-of-history') {
  await page.goto(`${prototypeUrl(SLUG)}?scenario=${scenario}#${route}`);
  await waitForPrototypeReady(page, { slug: SLUG });
}

async function openRange(page: Page) {
  await page.getByRole('button', { name: /^Date range:/ }).click();
  const presets = page.getByRole('group', { name: 'Preset ranges' });
  await expect(presets).toBeVisible();
  return presets;
}

test('dashboard period, analytics controls, CSV export and lifecycle board work', async ({
  page,
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

  const presets = await openRange(page);
  await presets.getByRole('button', { name: 'Last 7 days' }).click();
  await expect(page.getByRole('button', { name: /^Date range: Last 7 days/ })).toBeVisible();
  await expectAccessible(page, testInfo, { include: 'main', label: 'pulse-revenue-analytics' });

  const downloadPromise = page.waitForEvent('download');
  // On phone layouts the sticky chart explorer can intercept the export control.
  const exportCsv = page.getByRole('button', { name: 'Export CSV' });
  await exportCsv.scrollIntoViewIfNeeded();
  await exportCsv.click({ force: true });
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('transactions-analytics.csv');

  await openRoute(page, '/transactions/board', 'launch-spike');
  await expect(page.getByRole('region', { name: 'Revenue Transaction board' })).toBeVisible();
  await expectAccessible(page, testInfo, { include: 'main', label: 'pulse-revenue-board' });
});

test('viewer can inspect analytics but cannot export CSV', async ({ page }, testInfo) => {
  await openRoute(page, '/insights', 'viewer');
  await expect(page.getByRole('heading', { name: 'Revenue analytics' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Analytics chart' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export CSV' })).toHaveCount(0);
  await expectAccessible(page, testInfo, { include: 'main', label: 'pulse-revenue-viewer' });
});
