import { expect, test } from '@playwright/test';
import { waitForPrototypeReady } from './support/ready.ts';
import { PROTOTYPE_TARGETS, prototypeUrl } from './targets.ts';

test.skip(
  !PROTOTYPE_TARGETS.includes('logistics-map'),
  'set PROTOYARD_E2E_PROTOTYPES to include logistics-map'
);

test('dispatch persists and the offline map exposes an accessible marker list', async ({
  page,
}) => {
  await page.goto(`${prototypeUrl('logistics-map')}?scenario=active-dispatch`);
  await waitForPrototypeReady(page, { slug: 'logistics-map' });

  const mapList = page.getByRole('region', { name: 'Depots and active shipments' });
  await expect(mapList).toBeVisible();
  await expect(mapList.getByRole('list')).toBeVisible();
  await expect(mapList.getByRole('button', { name: /North Pier depot/ })).toBeVisible();

  const dispatch = page.getByRole('button', { name: 'Dispatch shipment HB-4100', exact: true });
  await expect(dispatch).toHaveCount(1);
  await expect(dispatch).toBeVisible();
  await dispatch.click();
  await expect(dispatch).toHaveCount(0);
  await page.reload();
  await waitForPrototypeReady(page, { slug: 'logistics-map' });
  await expect(mapList.getByRole('list')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Dispatch shipment HB-4100', exact: true })
  ).toHaveCount(0);
});
