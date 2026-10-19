import { expect, test } from '@playwright/test';
import { waitForPrototypeReady } from './support/ready.ts';
import { prototypeUrl } from './targets.ts';

test('a transfer updates both accounts and persists paired ledger entries', async ({ page }) => {
  await page.goto(`${prototypeUrl('fintech-dashboard')}?scenario=active`);
  await waitForPrototypeReady(page, { slug: 'fintech-dashboard' });

  await expect(page.getByRole('heading', { name: 'Money overview' })).toBeVisible();
  await expect(page.getByRole('figure', { name: 'Checking balance over time' })).toBeVisible();
  const transferButton = page.getByRole('button', { name: 'Transfer funds' });
  await expect(transferButton).toHaveCount(1);
  await page.getByLabel('Amount (USD)').fill('100.00');
  await transferButton.click();
  await expect(page.getByRole('status')).toContainText('Transfer saved to both account ledgers.');
  await expect(page.getByText('Transfer', { exact: true }).first()).toBeVisible();

  await page.reload();
  await waitForPrototypeReady(page, { slug: 'fintech-dashboard' });
  await expect(page.getByText('Move to savings', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Transfer funds' })).toHaveCount(1);
});
