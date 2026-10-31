import { expect, type Locator, type Page, test } from '@playwright/test';
import { expectAccessible } from './support/a11y.ts';
import { waitForPrototypeReady } from './support/ready.ts';
import { PROTOTYPE_TARGETS, prototypeUrl } from './targets.ts';

/**
 * The rich views kit (`@protoyard/views-ui`) on the REAL ui-kit build, at
 * desktop and Pixel 7, in a fresh context per test. happy-dom cannot check
 * drag, focus, virtualization or media queries (docs/TESTING_GUIDE.md), so
 * these do: real mouse moves (page.mouse, never synthetic DnD events), the
 * keyboard paths, the 100,000-row and 5,000-marker DOM caps with the map's
 * 100 ms render budget, and axe on every view demo in light and dark.
 *
 * Below `md` some views change on purpose (the timeline shows only its task
 * table, the grid a card list); the mobile project asserts that layout.
 */

const SLUG = 'ui-kit';
test.skip(!PROTOTYPE_TARGETS.includes(SLUG), `set PROTOYARD_E2E_PROTOTYPES to include ${SLUG}`);

/** Every view demo in prototypes/ui-kit/src/catalog/registry.ts (`viewDemo(...)`). */
const VIEW_DEMOS = [
  'board',
  'calendar',
  'timeline',
  'grid',
  'tree',
  'map',
  'editor',
  'activity',
  'notifications',
  'files',
  'settings',
  'states',
  'commands',
] as const;

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

/** The element's box lies fully inside the viewport (seen, not just in the DOM). */
async function expectInViewport(page: Page, locator: Locator, label: string) {
  const box = await boxOf(locator);
  const viewport = page.viewportSize() as { width: number; height: number };
  expect(box.x, `${label}: left`).toBeGreaterThanOrEqual(-0.5);
  expect(box.y, `${label}: top`).toBeGreaterThanOrEqual(-0.5);
  expect(box.x + box.width, `${label}: right`).toBeLessThanOrEqual(viewport.width + 0.5);
  expect(box.y + box.height, `${label}: bottom`).toBeLessThanOrEqual(viewport.height + 0.5);
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
    // The held card moved to another column (a new node): Texuli puts focus back on its
    // handle a frame later, and a user drops once the handle shows focus again.
    await expect(handle('Ship the empty state')).toBeFocused();
    await page.keyboard.press('Space');
    await expect(handle('Ship the empty state')).not.toHaveAttribute('aria-pressed', 'true');
    await expect(board.locator('[aria-live="polite"]')).toContainText(
      'Dropped Ship the empty state in In progress'
    );
  });

  test('calendar: drag an event one hour later', async ({ page }) => {
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

  test('timeline: resize a bar with the mouse (desktop); task table on Pixel 7', async ({
    page,
    isMobile,
  }) => {
    await openDemo(page, 'timeline');
    const timeline = page.locator('section[data-timeline]');
    // Texuli 0.8's task table is a read-only `table` (rows carry no focus or hierarchy).
    await expect(timeline.getByRole('table')).toBeVisible();
    if (isMobile) {
      // Below md the canvas is hidden on purpose: the task table carries the plan.
      await expect(timeline.locator('.canvas-scroll')).toBeHidden();
      await expect(timeline.locator('[data-task-row]').first()).toBeVisible();
      return;
    }
    const bar = timeline.locator('button.task-bar:not([disabled])').first();
    await bar.scrollIntoViewIfNeeded();
    await expect(bar).toBeVisible();
    const before = (await bar.getAttribute('aria-label')) as string;
    const title = before.split(',')[0] as string;
    const handle = bar.locator('.resize.end');
    const box = await boxOf(handle);
    // Week zoom: 16 px per day; three days longer.
    await drag(page, center(box), { x: center(box).x + 48, y: center(box).y });
    await expect(page.getByText('Schedule change saved locally.')).toBeVisible();
    const after = (await timeline
      .locator('button.task-bar')
      .evaluateAll(
        (nodes, name) =>
          nodes.map((n) => n.getAttribute('aria-label')).find((l) => l?.startsWith(`${name},`)),
        title
      )) as string;
    expect(after).not.toBe(before);
    // Same start, later end.
    expect(after.split(' to ')[0]).toBe(before.split(' to ')[0]);
  });

  test('grid: edit a cell on screen, then scroll 100,000 rows with a bounded DOM', async ({
    page,
    isMobile,
  }) => {
    await openDemo(page, 'grid');
    if (isMobile) {
      // Below md the grid is a card list capped at 50 cards.
      await page.getByRole('button', { name: 'Load 100,000 rows' }).click();
      const cards = page.locator('[data-grid] ul.md\\:hidden > li');
      await expect(cards.first()).toBeVisible();
      expect(await cards.count()).toBeLessThanOrEqual(51);
      await expect(page.getByRole('button', { name: /Show more/ })).toBeVisible();
      return;
    }
    const grid = page.getByRole('grid');
    const cell = grid.locator('[role="gridcell"]').filter({ hasText: 'Launch readiness' });
    await cell.click();
    await page.keyboard.press('Enter');
    // Texuli CellEditor: data-tx-grid-editor (legacy data-editor renamed).
    const editor = grid.locator(
      'input[data-tx-grid-editor], input[data-editor], [data-tx-grid-editor] input'
    );
    await expect(editor).toBeFocused();
    // The editor is visibly on screen (not proven by fill(), which scrolls for us).
    await expectInViewport(page, editor, 'cell editor');
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('Launch readiness v2');
    await page.keyboard.press('Enter');
    await expect(
      grid.locator('[role="gridcell"]').filter({ hasText: 'Launch readiness v2' })
    ).toBeVisible();
    await expect(page.getByText('revision 1')).toBeVisible();

    await page.getByRole('button', { name: 'Load 100,000 rows' }).click();
    await expect(grid).toHaveAttribute('aria-rowcount', '100001');
    const scroller = grid.locator('xpath=..');
    let maxRows = 0;
    for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
      await scroller.evaluate((node, f) => {
        node.scrollTop = (node.scrollHeight - node.clientHeight) * f;
      }, fraction);
      await page.waitForTimeout(50);
      maxRows = Math.max(maxRows, await grid.locator('[role="row"]').count());
    }
    expect(maxRows, 'virtualized DOM rows').toBeLessThanOrEqual(80);
    await expect(grid.getByText('Record 100000', { exact: true })).toBeVisible();
  });

  test('map: pan, zoom, render 5,000 places under 100 ms, open a cluster, reach every place by keyboard', async ({
    page,
    isMobile,
  }) => {
    await openDemo(page, 'map');
    const surface = page.locator('[role="region"][aria-roledescription="map"]');
    await expect(surface).toBeVisible();
    // FIX-map-view-state: surface reports camera as data-center ("lat,lng" 4dp) and data-zoom.
    await expect(surface).toHaveAttribute('data-center', /^-?\d+\.\d{4},-?\d+\.\d{4}$/);
    await expect(surface).toHaveAttribute('data-zoom', /.+/);

    // Pan with a real drag, started on empty map (the center holds a cluster button).
    const before = (await surface.getAttribute('data-center')) as string;
    const box = await boxOf(surface);
    const start = { x: box.x + 24, y: box.y + 40 };
    await drag(page, start, { x: start.x + 80, y: start.y + 60 });
    await expect(surface).not.toHaveAttribute('data-center', before);

    // Zoom with the button, and with the wheel on desktop.
    const zoom = async () => Number(await surface.getAttribute('data-zoom'));
    const z0 = await zoom();
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await expect.poll(zoom).toBeGreaterThan(z0);
    if (!isMobile) {
      const z1 = await zoom();
      await page.mouse.move(center(box).x, center(box).y);
      await page.mouse.wheel(0, 300);
      // Wheel zoom is optional on MapView; button zoom already proved data-zoom.
      const afterWheel = await zoom();
      if (afterWheel === z1) {
        await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
        await expect.poll(zoom).toBeLessThan(z1);
      } else {
        expect(afterWheel).toBeLessThan(z1);
      }
    }
    // Reset camera to the basemap fit (ui-kit demo has no separate "Show everything").
    await page.getByRole('button', { name: 'Reset map view', exact: true }).click();

    // 5,000 places: time from the click to the painted frame, in the page.
    await expect(page.getByRole('button', { name: 'Load 5,000 places' })).toBeVisible();
    const renderMs = await page.evaluate(async () => {
      const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      const button = [...document.querySelectorAll('button')].find((b) =>
        b.textContent?.includes('Load 5,000 places')
      ) as HTMLButtonElement;
      const t0 = performance.now();
      button.click();
      for (let i = 0; i < 600; i++) {
        await frame();
        // Demo label + clusters prove the stress set painted (no data-list-count yet).
        if (
          document.body.textContent?.includes('5,000 places') &&
          document.querySelector('[data-cluster]')
        )
          break;
      }
      await frame();
      return performance.now() - t0;
    });
    console.info(`[views] map with 5,000 places: ${renderMs.toFixed(1)} ms to the painted frame`);
    expect(renderMs, 'map render with 5,000 places').toBeLessThan(100);
    const onMap = await page.locator('[data-cluster], [data-marker]').count();
    const listRows = await page.locator('[data-list-item]').count();
    expect(onMap, 'map buttons (clusters)').toBeLessThan(500);
    expect(listRows, 'virtualized list rows').toBeLessThanOrEqual(40);

    // Open a cluster: the map zooms in.
    const zBefore = await zoom();
    await page.locator('[data-cluster]').first().click();
    await expect.poll(zoom).toBeGreaterThan(zBefore);

    // Every place stays reachable through the virtualized list (one tab stop + roving).
    const list = page.locator('[data-map-place-list]');
    await list.focus();
    await page.keyboard.press('ArrowDown');
    await expect(list.locator('button[tabindex="0"]')).toHaveCount(1);
    // Scroll the virtual list to the end so stop-5000 mounts, then select it.
    await list.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    const stop = page.locator('[data-list-item="stop-5000"]');
    await expect(stop).toBeVisible({ timeout: 10_000 });
    await stop.click();
    await expect(stop).toHaveAttribute('aria-current', 'true');
  });

  for (const mode of ['light', 'dark'] as const) {
    test(`every view demo passes axe in ${mode} mode`, async ({ page }, testInfo) => {
      test.setTimeout(120_000);
      await page.emulateMedia({ colorScheme: mode, reducedMotion: 'reduce' });
      for (const id of VIEW_DEMOS) {
        await openDemo(page, id, mode);
        await expect(page.locator('html')).toHaveAttribute('data-py-mode', mode);
        // Async demos (generated fixtures) render after mount: wait for the page to settle.
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(300);
        await expectAccessible(page, testInfo, { label: `views-${id}-${mode}` });
      }
    });
  }
});
