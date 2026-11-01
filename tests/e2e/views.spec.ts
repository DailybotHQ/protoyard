import { expect, type Locator, type Page, test } from '@playwright/test';
import { waitForPrototypeReady } from './support/ready.ts';
import { PROTOTYPE_TARGETS, prototypeUrl } from './targets.ts';

/**
 * The rich views kit (`@protoyard/views-ui`) on the REAL ui-kit build, in a
 * fresh context per test. happy-dom cannot check drag or focus
 * (docs/TESTING_GUIDE.md), so these do, with real mouse moves (page.mouse, never
 * synthetic DnD events) and the keyboard: a board drag (desktop and Pixel 7,
 * where one column shows) and a calendar event drag (desktop).
 */

const SLUG = 'ui-kit';
test.skip(!PROTOTYPE_TARGETS.includes(SLUG), `set PROTOYARD_E2E_PROTOTYPES to include ${SLUG}`);

type Box = { x: number; y: number; width: number; height: number };

async function openDemo(page: Page, id: string, mode?: 'light' | 'dark') {
  const query = new URLSearchParams({ devtools: '0', ...(mode ? { mode } : {}) });
  await page.goto(`${prototypeUrl(SLUG)}?${query}#/c/${id}`);
  await waitForPrototypeReady(page, { slug: SLUG });
}

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  expect(box, 'element has a layout box').not.toBeNull();
  return box as Box;
}

/** Real mouse drag in small steps (views use pointer events with a movement threshold). */
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 2, from.y + 2, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

const center = (box: Box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

test.describe('views kit (ui-kit)', () => {
  test('board: drag a card with the mouse, then move one with the keyboard', async ({
    page,
    isMobile,
  }) => {
    await openDemo(page, 'board');
    const board = page.locator('[data-board]');
    // Texuli Board: drag handle is `data-board-handle` named "Drag <title>";
    // the separate "Move <title>" control opens the Move menu (not pointer drag).
    const handle = (title: string) =>
      board.getByRole('button', { name: `Drag ${title}`, exact: true });
    const cardBody = (title: string) =>
      board.locator('[data-board-card]').filter({ hasText: title });
    const column = (id: string) => board.locator(`[data-board-cell][data-column-id="${id}"]`);
    await expect(handle('Map the onboarding flow')).toBeVisible();

    if (!isMobile) {
      // Mouse: drag handle of "Map the onboarding flow" from To do into In progress.
      const from = center(await boxOf(handle('Map the onboarding flow')));
      const target = await boxOf(column('doing'));
      await drag(page, from, { x: target.x + target.width / 2, y: target.y + target.height - 24 });
      await expect(column('doing').getByText('Map the onboarding flow')).toBeVisible();
      await expect(column('todo').getByText('Map the onboarding flow')).toHaveCount(0);
    } else {
      // Pixel 7 shows one 85vw column: reorder inside it with the mouse instead.
      await page.getByRole('button', { name: 'Add local task' }).click();
      const added = handle('Try a board action');
      await expect(added).toBeVisible();
      const first = await boxOf(cardBody('Map the onboarding flow'));
      await drag(page, center(await boxOf(added)), {
        x: first.x + first.width / 2,
        y: first.y + 4,
      });
      await expect(column('todo').locator('[data-board-card]').first()).toContainText(
        'Try a board action'
      );
    }

    // Keyboard: Space lifts on the drag handle, Arrow moves a column, Space drops.
    const keyed = handle('Ship the empty state');
    await keyed.focus();
    await page.keyboard.press('Space');
    await expect(keyed).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('ArrowLeft');
    await expect(column('doing').getByText('Ship the empty state')).toBeVisible();
    // The held card moved to another column: Texuli keeps focus on its handle (G103),
    // so the next Space drops it.
    await expect(handle('Ship the empty state')).toBeFocused();
    await page.keyboard.press('Space');
    await expect(handle('Ship the empty state')).not.toHaveAttribute('aria-pressed', 'true');
    await expect(board.locator('[aria-live="polite"]')).toContainText(
      'Dropped Ship the empty state in In progress'
    );
  });

  test('calendar: drag an event one hour later', { tag: '@desktop' }, async ({ page }) => {
    await openDemo(page, 'calendar');
    const calendar = page.locator('section[data-calendar][data-view="week"]');
    const scroller = calendar.locator('[data-time-scroller]');
    // Texuli event chips: button[data-calendar-event] (not legacy data-key).
    const chips = calendar.locator('[data-day-column] button[data-calendar-event][data-movable]');
    await expect(chips.first()).toBeVisible();
    // A timed chip fully inside the scroller's visible area.
    const view = await boxOf(scroller);
    let chip: Locator | null = null;
    for (const candidate of await chips.all()) {
      const box = await candidate.boundingBox();
      if (
        box &&
        box.height >= 20 &&
        box.y >= view.y &&
        box.y + box.height + 60 <= view.y + view.height
      ) {
        chip = candidate;
        break;
      }
    }
    expect(chip, 'a visible timed event').not.toBeNull();
    const event = chip as Locator;
    const key = (await event.getAttribute('data-calendar-event')) as string;
    const before = (await event.getAttribute('aria-label')) as string;
    const box = await boxOf(event);
    // 48 px per hour (HOUR_PX): move the chip's top area down one hour.
    await drag(
      page,
      { x: box.x + box.width / 2, y: box.y + 6 },
      { x: box.x + box.width / 2, y: box.y + 54 }
    );
    const repeat = page.getByRole('alertdialog', { name: 'Change a repeating event' });
    if (await repeat.isVisible().catch(() => false)) {
      await repeat.getByRole('button', { name: 'Save' }).click();
    }
    await expect(page.getByText('Calendar change saved locally.')).toBeVisible();
    // The event (same title) now shows a different time span.
    const title = before.split(',')[0] as string;
    const labels = await calendar
      .locator(`button[data-calendar-event][aria-label^="${title},"]`)
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('aria-label')));
    expect(labels, `${key} moved`).not.toContain(before);
  });
});
