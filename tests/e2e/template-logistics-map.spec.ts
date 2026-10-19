import { expect, test } from '@playwright/test';
import { waitForPrototypeReady } from './support/ready.ts';
import { prototypeUrl } from './targets.ts';

test('dispatch persists and the offline map exposes an accessible marker list', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${prototypeUrl('logistics-map')}?scenario=active-dispatch`);
  await waitForPrototypeReady(page, { slug: 'logistics-map' });

  const mapList = page.getByRole('region', { name: 'Depots and active shipments' });
  await expect(mapList).toBeVisible();
  await expect(mapList.getByRole('list')).toBeVisible();
  await expect(mapList.getByRole('button', { name: /North Pier depot/ })).toBeVisible();

  const dispatchButtons = page.getByRole('button', { name: 'Dispatch shipment' });
  const before = await dispatchButtons.count();
  const dispatch = dispatchButtons.first();
  await expect(dispatch).toBeVisible();
  await dispatch.click();
  await page.reload();
  await waitForPrototypeReady(page, { slug: 'logistics-map' });
  await expect(mapList.getByRole('list')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Dispatch shipment' })).toHaveCount(before - 1);
});
