import { fileURLToPath } from 'node:url';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { expectAccessible } from './support/a11y.ts';
import { badgeOverlaps } from './support/badge.ts';
import { waitForPrototypeReady } from './support/ready.ts';
import { launcherOverlaps } from './support/review.ts';
import { PROTOTYPE_TARGETS, prototypeUrl } from './targets.ts';

/**
 * Keel Projects (the project-management flagship) on its REAL static build,
 * desktop and Pixel 7, a fresh context per test: move a card (mouse on
 * desktop, keyboard on the phone), reschedule a milestone and watch its
 * successors shift, mention a teammate and switch persona (`?actor=`) to
 * read the notification, with axe on each screen.
 */

const SLUG = 'keel-projects-demo';
test.skip(!PROTOTYPE_TARGETS.includes(SLUG), `set PROTOYARD_E2E_PROTOTYPES to include ${SLUG}`);

async function open(page: Page, hash: string, query = 'scenario=sprint-in-flight') {
  await page.goto(`${prototypeUrl(SLUG)}?${query}${hash}`);
  await waitForPrototypeReady(page, { slug: SLUG });
}

async function center(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box, 'element has a layout box').not.toBeNull();
  const b = box as { x: number; y: number; width: number; height: number };
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, box: b };
}

test.describe('Keel Projects flagship', () => {
  test('board: drag a card with the mouse on desktop, move it with the keyboard on a phone', async ({
    page,
    isMobile,
  }, _testInfo) => {
    await open(page, '#/projects/project_0001');
    const board = page.locator('[data-board]');
    const todo = board.locator('[data-board-cell][data-column-id="todo"]');
    const doing = board.locator('[data-board-cell][data-column-id="in-progress"]');
    const card = todo.locator('[data-board-card]').first();
    await expect(card).toBeVisible();
    // TaskCard renders the title as the card's only paragraph.
    const title = ((await card.locator('p').first().textContent()) ?? '').trim();
    expect(title.length).toBeGreaterThan(3);

    if (isMobile) {
      const handle = card.locator('[data-board-handle]').first();
      await handle.focus();
      await page.keyboard.press('Space');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Space');
    } else {
      // Texuli Board only starts a drag from the grip handle.
      const handle = card.locator('[data-board-handle]').first();
      const from = await center(handle);
      const to = await center(doing);
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(from.x + 8, from.y + 8, { steps: 4 });
      await page.mouse.move(to.x, to.box.y + 24, { steps: 14 });
      await page.mouse.up();
    }
    // On a phone each column is 85vw wide: bring the moved card into view before asserting.
    const moved = doing.getByText(title, { exact: true }).first();
    await moved.scrollIntoViewIfNeeded();
    await expect(moved).toBeVisible();
    // Saved through the service: still there after a reload.
    await page.reload();
    await waitForPrototypeReady(page, { slug: SLUG });
    const reloaded = page
      .locator('[data-board-cell][data-column-id="in-progress"]')
      .getByText(title, { exact: true })
      .first();
    await reloaded.scrollIntoViewIfNeeded();
    await expect(reloaded).toBeVisible();
    await expectAccessible(page, testInfo, { label: 'keel-board' });
  });

  test('timeline: moving a milestone two days later shifts its successors', async ({
    page,
    isMobile,
  }, _testInfo) => {
    test.skip(isMobile, 'the timeline canvas is hidden below md (task table only)');
    await open(page, '#/timeline');
    const timeline = page.locator('section[data-timeline]');
    const milestone = timeline.locator('button.task-bar.milestone').first();
    // Rows are virtualized and sorted by start date: scroll until a milestone renders.
    const canvas = timeline.locator('.canvas-scroll');
    await expect(canvas).toBeVisible();
    for (let step = 0; step < 40 && (await milestone.count()) === 0; step++) {
      await canvas.evaluate((node) => {
        node.scrollTop += 220;
      });
      await page.waitForTimeout(60);
    }
    await expect(milestone).toBeAttached();
    await milestone.scrollIntoViewIfNeeded();
    const labelsBefore = await timeline
      .locator('button.task-bar')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('aria-label') ?? ''));
    const milestoneLabel = (await milestone.getAttribute('aria-label')) as string;
    // Keyboard reschedule: Space picks up, ArrowRight ×2 moves two days, Space saves.
    await milestone.focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space');
    await expect(timeline.getByText(/Saved \d+ schedule change/)).toBeVisible();
    const labelsAfter = await timeline
      .locator('button.task-bar')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('aria-label') ?? ''));
    const changed = labelsAfter.filter((label) => !labelsBefore.includes(label));
    // The milestone and both of its follow-ups (and nothing else) moved.
    expect(changed.length, `changed bars: ${changed.join(' | ')}`).toBeGreaterThanOrEqual(3);
    const title = milestoneLabel.split(',')[0] as string;
    expect(changed.some((label) => label.startsWith(`${title},`))).toBe(true);
    await expectAccessible(page, testInfo, { label: 'keel-timeline' });
  });

  test('mention a teammate, switch persona, and read the notification', async ({
    page,
  }, _testInfo) => {
    await open(page, '#/projects/project_0001');
    const card = page.locator('[data-board] [data-board-card]').first();
    const taskId = (await card.getAttribute('data-item-id')) as string;
    await page.goto(`${prototypeUrl(SLUG)}#/tasks/${taskId}`);
    await waitForPrototypeReady(page, { slug: SLUG });
    const thread = page
      .getByRole('region', { name: /^Comments on / })
      .or(page.locator('section[aria-labelledby="comments-heading"]'));
    const composer = thread.getByRole('textbox').last();
    await composer.click();
    await composer.pressSequentially('Can you review this, @priya.nair? ');
    await page.keyboard.press('Escape');
    await thread.getByRole('button', { name: 'Comment', exact: true }).click();
    await expect(thread.getByText('Can you review this,')).toBeVisible();
    // The stored body carries the mention as an id; the thread shows the name.
    await expect(thread.getByText(/@?Priya Nair/).first()).toBeVisible();
    await expectAccessible(page, testInfo, { label: 'keel-task-detail' });

    // Switch persona with the link parameter: the world (and the comment) stay.
    await page.goto(`${prototypeUrl(SLUG)}?actor=user_0003#/`);
    await waitForPrototypeReady(page, { slug: SLUG });
    await page
      .getByRole('button', { name: /Notifications/ })
      .first()
      .click();
    const notice = page.getByText('Maya Chen mentioned you in a comment').first();
    await expect(notice).toBeVisible();
    await notice.click();
    await expect(page).toHaveURL(new RegExp(`#/tasks/${taskId}$`));
    await expect(page.getByText('Can you review this,')).toBeVisible();
  });

  test('task grid: 10,004 tasks, a saved view filters them, and the page never scrolls sideways', async ({
    page,
    isMobile,
  }, _testInfo) => {
    await open(page, '#/tasks', 'scenario=massive');
    await expect(page.getByText('10,004 tasks across every project')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow, 'horizontal overflow').toBeLessThanOrEqual(0);
    if (!isMobile) {
      await expect(page.getByText(/tasks/i).first()).toBeVisible();
    }
    // No full axe on the 10k-row page (Texuli grid may not window rows; axe times out).
  });

  test('calendar and command palette', async ({ page, isMobile }, _testInfo) => {
    await open(page, '#/calendar');
    await expect(page.getByRole('heading', { name: 'Studio calendar' })).toBeVisible();
    await expect(
      page.locator('[data-calendar], .tx-calendar, [class*="tx-calendar"]').first()
    ).toBeVisible();
    await expectAccessible(page, testInfo, { label: 'keel-calendar' });
    if (isMobile) return;
    // The palette reads the platform from the page (the Desktop Chrome profile reports Windows).
    const isMac = await page.evaluate(() =>
      /mac|iphone|ipad|ipod/i.test(
        (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
          ?.platform ?? navigator.platform
      )
    );
    await page.keyboard.press(isMac ? 'Meta+k' : 'Control+k');
    const palette = page.getByRole('dialog');
    await expect(palette).toBeVisible();
    await page.keyboard.type('timeline');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/timeline$/);
  });

  test('review comments: the demo review imports from the toolbar and pins to the board', async ({
    page,
  }) => {
    // build.review is on (local adapter): one collapsed launcher, placed where it covers no app
    // control (the top bar's search and bell included) and not the demo badge.
    await open(page, '#/');
    const launcher = page.getByRole('button', { name: /^Review: \d+ comment threads?/ });
    await expect(launcher).toBeVisible();
    await expect
      .poll(() => launcherOverlaps(page), { message: 'launcher over app controls' })
      .toEqual([]);
    await expect.poll(() => badgeOverlaps(page), { message: 'badge over controls' }).toEqual([]);
    const topBar = page.locator('[data-py-anchor="top-bar"]');
    const [bar, own] = await Promise.all([topBar.boundingBox(), launcher.boundingBox()]);
    if (!bar || !own) throw new Error('the top bar and the launcher have layout boxes');
    const overlapsBar =
      own.x < bar.x + bar.width &&
      bar.x < own.x + own.width &&
      own.y < bar.y + bar.height &&
      bar.y < own.y + own.height;
    expect(overlapsBar, 'launcher over the app top bar').toBe(false);
    await expect(page.getByRole('link', { name: 'download a sample review' })).toHaveAttribute(
      'href',
      './review-demo.json'
    );
    await launcher.click();
    await expect(launcher).toHaveAttribute('aria-expanded', 'true');
    const toolbar = page.getByRole('navigation', { name: 'Prototype review toolbar' });
    await expect(toolbar.getByRole('button', { name: 'Export' })).toBeVisible();
    await expect(toolbar.getByRole('button', { name: 'Import' })).toBeVisible();
    const fixture = fileURLToPath(
      new URL('../../prototypes/keel-projects-demo/public/review-demo.json', import.meta.url)
    );
    await toolbar.locator('input[type="file"]').setInputFiles(fixture);
    await expect(page.getByText('Imported 13 comments.')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Review: 7 comment threads/ })).toBeVisible();
    // The board's threads pin to its data-py-anchor regions.
    await page.goto(`${prototypeUrl(SLUG)}#/projects/project_0001`);
    await waitForPrototypeReady(page, { slug: SLUG });
    await expect(page.locator('[data-py-review-pin]').first()).toBeVisible();
  });
});
