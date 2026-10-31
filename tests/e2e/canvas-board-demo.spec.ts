import { expect, type Page, test } from '@playwright/test';
import { expectAccessible } from './support/a11y.ts';
import { PROTOTYPE_TARGETS, prototypeUrl } from './targets.ts';

/**
 * Canvas Board (canvas-board-demo) against its static build: a board opens
 * in the canvas editor, a keyboard move saves through the service and
 * survives a reload, and a viewer gets a read-only canvas.
 */
const SLUG = 'canvas-board-demo';
test.skip(!PROTOTYPE_TARGETS.includes(SLUG), `set PROTOYARD_E2E_PROTOTYPES to include ${SLUG}`);

async function openFirstBoard(page: Page, scenario: string) {
  await page.goto(`${prototypeUrl(SLUG)}?scenario=${scenario}`);
  await expect(page.locator('html')).toHaveAttribute('data-py-ready', 'true', {
    timeout: 15_000,
  });
  await page.getByRole('heading', { level: 2 }).getByRole('link').first().click();
  await expect(page).toHaveURL(/#\/boards\/[^/]+$/);
  await expect(page.getByRole('application')).toBeVisible({ timeout: 15_000 });
}

const noteX = (page: Page) =>
  page.locator('[data-tx-shape="ideas-1"] rect').first().getAttribute('x');

test.describe('Canvas Board (static build)', () => {
  test('a keyboard move saves the board and survives a reload', async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openFirstBoard(page, 'active');
    await expectAccessible(page, testInfo, { label: 'board' });
    await expect(page.getByRole('button', { name: 'Delete board' })).toBeVisible();

    const before = Number(await noteX(page));
    const note = page.locator('[data-tx-shape="ideas-1"]');
    await note.focus();
    await note.press('ArrowRight');
    await expect.poll(async () => Number(await noteX(page))).toBeGreaterThan(before);
    const moved = Number(await noteX(page));

    await page.reload();
    await expect(page.getByRole('application')).toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => Number(await noteX(page))).toBe(moved);
    expect(errors).toEqual([]);
  });

  test('a viewer sees the board read-only', async ({ page }) => {
    await openFirstBoard(page, 'viewer');
    await expect(page.getByRole('button', { name: 'Import JSON' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Delete board' })).toHaveCount(0);
    const before = await noteX(page);
    const note = page.locator('[data-tx-shape="ideas-1"]');
    await note.focus();
    await note.press('ArrowRight');
    await expect.poll(() => noteX(page)).toBe(before);
  });
});
