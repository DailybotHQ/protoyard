import { expect, test } from '@playwright/test';
import { expectAccessible } from './support/a11y.ts';
import { waitForPrototypeReady } from './support/ready.ts';
import { prototypeUrl } from './targets.ts';

const SLUG = 'harbor-dispatch-demo';

async function openRoute(page: Parameters<typeof waitForPrototypeReady>[0], route: string) {
  await page.goto(`${prototypeUrl(SLUG)}?scenario=active#${route}`);
  await waitForPrototypeReady(page, { slug: SLUG });
}

test('dispatch persists, map list is available, and timeline reschedules', async ({
  page,
}, info) => {
  await openRoute(page, '/dispatch/board');
  await expectAccessible(page, info, { label: 'harbor-dispatch-board' });

  const queuedCard = page
    .locator('[data-column="queued"] [data-card-id]')
    .filter({ hasText: 'HB-4100' });
  await expect(queuedCard).toHaveCount(1);
  await queuedCard.getByRole('button', { name: 'Move HB-4100 to…' }).click();
  await page.getByRole('menuitem', { name: 'Dispatched', exact: true }).click();
  const dispatchedCard = page
    .locator('[data-column="dispatched"] [data-card-id]')
    .filter({ hasText: 'HB-4100' });
  await expect(dispatchedCard).toHaveCount(1);
  await page.reload();
  await waitForPrototypeReady(page, { slug: SLUG });
  await expect(
    page.locator('[data-column="dispatched"] [data-card-id]').filter({ hasText: 'HB-4100' })
  ).toHaveCount(1);

  await openRoute(page, '/dispatch/map');
  await expectAccessible(page, info, { label: 'harbor-dispatch-map' });
  const shipmentList = page.locator('[data-map-list]');
  await expect(shipmentList.getByRole('list')).toBeVisible();
  await expect(
    shipmentList.locator('[data-list-item]').filter({ hasText: 'HB-4100' })
  ).toBeVisible();

  await openRoute(page, '/dispatch/timeline');
  await expectAccessible(page, info, { label: 'harbor-dispatch-timeline' });
  const shipmentBar = page
    .locator('[data-timeline-screen="shipment"] [aria-roledescription="reschedulable task"]')
    .filter({ hasText: 'HB-4100' });
  await expect(shipmentBar).toHaveCount(1);
  const before = await shipmentBar.getAttribute('aria-label');
  await shipmentBar.focus();
  await shipmentBar.press('Space');
  await shipmentBar.press('ArrowRight');
  await shipmentBar.press('Enter');
  await expect(page.getByText('Saved 1 schedule change')).toBeVisible();
  const updatedBar = page
    .locator('[data-timeline-screen="shipment"] [aria-roledescription="reschedulable task"]')
    .filter({ hasText: 'HB-4100' });
  const after = await updatedBar.getAttribute('aria-label');
  expect(after).not.toBe(before);
  await page.reload();
  await waitForPrototypeReady(page, { slug: SLUG });
  await expect(
    page
      .locator('[data-timeline-screen="shipment"] [aria-roledescription="reschedulable task"]')
      .filter({ hasText: 'HB-4100' })
  ).toHaveAttribute('aria-label', after ?? '');

  await openRoute(page, '/dashboard');
  await expectAccessible(page, info, { label: 'harbor-dispatch-dashboard' });
});
