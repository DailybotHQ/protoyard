import { expect, test } from '@playwright/test';
import { waitForPrototypeReady } from './support/ready.ts';
import { PROTOTYPE_TARGETS, prototypeUrl } from './targets.ts';

test.skip(
  !PROTOTYPE_TARGETS.includes('fintech-dashboard'),
  'set PROTOYARD_E2E_PROTOTYPES to include fintech-dashboard'
);

test('a transfer updates both accounts and persists paired ledger entries', async ({ page }) => {
  await page.goto(`${prototypeUrl('fintech-dashboard')}?scenario=active`);
  await waitForPrototypeReady(page, { slug: 'fintech-dashboard' });

  await expect(page.getByRole('heading', { name: 'Money overview' })).toBeVisible();
  await expect(page.getByRole('figure', { name: 'Checking balance over time' })).toBeVisible();
  const transferButton = page.getByRole('button', { name: 'Transfer funds' });
  await expect(transferButton).toHaveCount(1);
  await page.getByLabel('Amount (USD)').fill('100.00');
  await transferButton.click();
  await expect(
    page.getByText('Transfer saved to both account ledgers.', { exact: true })
  ).toBeVisible();
  await expect(page.getByText('Transfer', { exact: true }).first()).toBeVisible();

  await page.reload();
  await waitForPrototypeReady(page, { slug: 'fintech-dashboard' });
  await expect(page.getByText('Monthly savings transfer', { exact: true })).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Transfer funds' })).toHaveCount(1);
});
