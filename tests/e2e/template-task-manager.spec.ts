import { expect, type Page, test } from '@playwright/test';
import { waitForPrototypeReady } from './support/ready.ts';
import { PROTOTYPE_TARGETS, prototypeUrl } from './targets.ts';

/**
 * The task-manager board is @protoyard/ui's Kanban on Texuli's Board: a card
 * moves through its "Move … to…" menu or the keyboard drag handle (Space,
 * arrows, Space), the move goes through the task service, and it persists.
 */
const SLUG = 'task-manager';

test.skip(!PROTOTYPE_TARGETS.includes(SLUG), `set PROTOYARD_E2E_PROTOTYPES to include ${SLUG}`);
test.skip(({ isMobile }) => isMobile, 'the board columns scroll sideways on phones');

const cell = (page: Page, column: string) =>
  page.locator(`[data-board-cell][data-column-id="${column}"] [data-board-card]`);

async function openBoard(page: Page): Promise<void> {
  await page.goto(`${prototypeUrl(SLUG)}?scenario=active-team`);
  await waitForPrototypeReady(page, { slug: SLUG });
  const project = page.locator('a[href^="#/projects/"]').first();
  await project.waitFor();
  await project.click();
  await page.locator('[data-board-card]').first().waitFor();
}

test('moves a card with its menu and with the keyboard drag handle, and both persist', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBoard(page);

  // Menu: the first to-do card goes to Review.
  const menu = cell(page, 'todo')
    .first()
    .getByRole('button', { name: /^Move .+ to another column$/ });
  const menuName = (await menu.getAttribute('aria-label')) ?? '';
  const viaMenu = menuName.replace(/^Move /, '').replace(/ to another column$/, '');
  await menu.click();
  await page.getByRole('menuitem', { name: 'Review — top', exact: true }).click();
  await expect(cell(page, 'review').filter({ hasText: viaMenu })).toBeVisible();

  // Keyboard drag: the next to-do card goes one column right (In progress).
  const handle = cell(page, 'todo')
    .first()
    .getByRole('button', { name: /^Drag / });
  const viaKeyboard = ((await handle.getAttribute('aria-label')) ?? '').replace(/^Drag /, '');
  // Each key waits for the board's announcement, as a screen reader user hears it.
  await handle.focus();
  await page.keyboard.press('Space');
  await expect(page.getByText(`Picked up ${viaKeyboard}.`, { exact: false })).toBeAttached();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByText(/^In progress, position \d+ of \d+\.$/)).toBeAttached();
  await page.keyboard.press('Space');
  await expect(
    page.getByText(`Dropped ${viaKeyboard} in In progress`, { exact: false })
  ).toBeAttached();
  await expect(cell(page, 'in-progress').filter({ hasText: viaKeyboard })).toBeVisible();

  await page.reload();
  await waitForPrototypeReady(page, { slug: SLUG });
  await expect(cell(page, 'review').filter({ hasText: viaMenu })).toBeVisible();
  await expect(cell(page, 'in-progress').filter({ hasText: viaKeyboard })).toBeVisible();
});
