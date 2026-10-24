import { expect, test } from '@playwright/test';
import { expectAccessible } from './support/a11y.ts';
import { waitForPrototypeReady } from './support/ready.ts';
import { PROTOTYPE_TARGETS, prototypeUrl } from './targets.ts';

test.skip(
  !PROTOTYPE_TARGETS.includes('harbor-dispatch-demo'),
  'set PROTOYARD_E2E_PROTOTYPES to include harbor-dispatch-demo'
);

const SLUG = 'harbor-dispatch-demo';

async function openRoute(page: Parameters<typeof waitForPrototypeReady>[0], route: string) {
  await page.goto(`${prototypeUrl(SLUG)}?scenario=active#${route}`);
  await waitForPrototypeReady(page, { slug: SLUG });
}

test('dispatch board, map list, and timeline surfaces are available', async ({ page }, info) => {
  await openRoute(page, '/dispatch/board');
  await expectAccessible(page, info, { label: 'harbor-dispatch-board' });

  const board = page
    .locator('[data-board]')
    .or(page.getByRole('region', { name: 'Shipment board' }));
  await expect(board.first()).toBeVisible();
  await expect(page.getByText('HB-4100').first()).toBeVisible();
  // Drag handles are present (Move-to menu returns with FIX-board-move-menu on Texuli Board).
  await expect(page.getByRole('button', { name: /Move HB-4100/ }).first()).toBeVisible();

  await openRoute(page, '/dispatch/map');
  await expectAccessible(page, info, { label: 'harbor-dispatch-map' });
  const shipmentList = page.getByRole('complementary', { name: 'Map locations' });
  await expect(shipmentList.getByRole('list')).toBeVisible();
  await expect(shipmentList.getByRole('listitem').filter({ hasText: 'HB-4100' })).toBeVisible();

  await openRoute(page, '/dispatch/timeline');
  await expectAccessible(page, info, { label: 'harbor-dispatch-timeline' });
  await expect(page.getByText('HB-4100').first()).toBeVisible();

  await openRoute(page, '/dashboard');
  await expectAccessible(page, info, { label: 'harbor-dispatch-dashboard' });
});
