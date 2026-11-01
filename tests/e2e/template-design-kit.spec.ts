import { expect, type Page, test } from '@playwright/test';
import { expectAccessible } from './support/a11y.ts';
import { waitForPrototypeReady } from './support/ready.ts';
import { PROTOTYPE_TARGETS, prototypeUrl } from './targets.ts';

/**
 * The design kit's screen sketches are `@protoyard/views-ui/canvas` on a lazy
 * section: a keyboard move saves through the sketch service and survives a
 * reload, and a viewer gets the sketch read-only.
 */
const SLUG = 'design-kit';
test.skip(!PROTOTYPE_TARGETS.includes(SLUG), `set PROTOYARD_E2E_PROTOTYPES to include ${SLUG}`);

async function openSketches(page: Page, scenario: string) {
  await page.goto(`${prototypeUrl(SLUG)}?scenario=${scenario}`);
  await waitForPrototypeReady(page, { slug: SLUG });
  await page.getByRole('button', { name: 'Sketches' }).click();
  await expect(page.getByRole('heading', { name: 'Screen sketches' })).toBeVisible();
  await expect(page.getByRole('application')).toBeVisible({ timeout: 15_000 });
}

const headerX = (page: Page) =>
  page.locator('[data-tx-shape="header"] rect').first().getAttribute('x');

test('a keyboard move in a sketch saves and survives a reload', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openSketches(page, 'default');
  await expectAccessible(page, testInfo, { label: 'sketches' });
  await expect(page.getByRole('button', { name: 'New sketch' })).toBeVisible();

  const before = Number(await headerX(page));
  const header = page.locator('[data-tx-shape="header"]');
  await header.focus();
  await header.press('ArrowRight');
  await expect.poll(async () => Number(await headerX(page))).toBeGreaterThan(before);
  const moved = Number(await headerX(page));

  await page.reload();
  await waitForPrototypeReady(page, { slug: SLUG });
  await page.getByRole('button', { name: 'Sketches' }).click();
  await expect(page.getByRole('application')).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => Number(await headerX(page))).toBe(moved);
  expect(errors).toEqual([]);
});

test('a viewer sees sketches read-only', async ({ page }) => {
  await openSketches(page, 'reviewer');
  await expect(page.getByRole('button', { name: 'New sketch' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Import JSON' })).toHaveCount(0);
  const before = await headerX(page);
  const header = page.locator('[data-tx-shape="header"]');
  await header.focus();
  await header.press('ArrowRight');
  await expect.poll(() => headerX(page)).toBe(before);
});
