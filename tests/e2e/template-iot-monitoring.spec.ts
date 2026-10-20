import { expect, test } from '@playwright/test';
import { waitForPrototypeReady } from './support/ready.ts';
import { PROTOTYPE_TARGETS, prototypeUrl } from './targets.ts';

test.skip(
  !PROTOTYPE_TARGETS.includes('iot-monitoring'),
  'set PROTOYARD_E2E_PROTOTYPES to include iot-monitoring'
);

test('shows the offline device map and telemetry chart', async ({ page }) => {
  await page.goto(`${prototypeUrl('iot-monitoring')}?scenario=active`);
  await waitForPrototypeReady(page, { slug: 'iot-monitoring' });
  await expect(page.getByRole('heading', { name: 'Device monitoring' })).toBeVisible();
  const map = page.getByRole('region', { name: /Harbor Bay device map/ });
  await expect(map).toBeVisible();
  const deviceList = page.getByRole('region', { name: 'Field monitoring devices' });
  await expect(deviceList.getByRole('list')).toBeVisible();
  await expect(page.getByRole('figure', { name: /telemetry/ })).toBeVisible();
  await expect(page.locator('figure[data-py-chart]')).toBeVisible();
});

test('acknowledges an alert and shows its incident state', async ({ page }) => {
  await page.goto(`${prototypeUrl('iot-monitoring')}?scenario=active#/alerts`);
  await waitForPrototypeReady(page, { slug: 'iot-monitoring' });
  await expect(page.getByRole('heading', { name: 'Alerts and incidents' })).toBeVisible();
  const acknowledge = page.getByRole('button', { name: 'Acknowledge', exact: true }).first();
  await expect(acknowledge).toBeVisible();
  await acknowledge.click();
  await expect(page.getByText(/acknowledged/).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: /threshold event/ }).first()).toBeVisible();
});
