import { expect, test } from '@playwright/test';
import { waitForPrototypeReady } from './support/ready.ts';
import { PROTOTYPE_TARGETS, prototypeUrl } from './targets.ts';

test.skip(
  !PROTOTYPE_TARGETS.includes('project-management'),
  'set PROTOYARD_E2E_PROTOTYPES to include project-management'
);

test('board move persists after reload and the phone layout fits', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${prototypeUrl('project-management')}?scenario=active-team`);
  await waitForPrototypeReady(page, { slug: 'project-management' });

  const projectLink = page.locator('a[href^="#/projects/"]').first();
  await projectLink.waitFor();
  const boardUrl = await projectLink.getAttribute('href');
  await projectLink.click();
  const moveMenu = page.getByRole('button', { name: /^Move .+ to…$/ }).first();
  await moveMenu.waitFor();
  const taskName = (await moveMenu.getAttribute('aria-label'))
    ?.replace(/^Move /, '')
    .replace(/ to…$/, '');
  await moveMenu.click();
  await page.getByRole('menuitem', { name: 'Review', exact: true }).first().click();
  await expect(
    page.locator('[data-column="review"] [data-card-id]').filter({ hasText: taskName ?? '' })
  ).toBeVisible();
  await page.reload();
  await waitForPrototypeReady(page, { slug: 'project-management' });
  await expect(
    page.locator('[data-column="review"] [data-card-id]').filter({ hasText: taskName ?? '' })
  ).toBeVisible();

  // The card is the control (role="button"): no nested links (axe:
  // nested-interactive), and Enter opens the task.
  await expect(page.locator('[data-card-id] a')).toHaveCount(0);
  const card = page
    .locator('[data-column="review"] [data-card-id]')
    .filter({ hasText: taskName ?? '' })
    .locator('[data-card-control]');
  await card.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/tasks\/[^/]+$/);
  await expect(page.getByRole('heading', { name: taskName ?? '' }).first()).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  if (boardUrl) await page.goto(`${prototypeUrl('project-management')}${boardUrl}`);
  await waitForPrototypeReady(page, { slug: 'project-management' });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  );
  expect(overflow).toBe(false);
});
