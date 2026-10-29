import { expect, type Page, test } from '@playwright/test';
import { expectAccessible } from './support/a11y.ts';
import { waitForPrototypeReady } from './support/ready.ts';
import { PROTOTYPE_TARGETS, prototypeUrl } from './targets.ts';

/**
 * The booking-calendar template against its STATIC production build (served
 * by `protoyard preview`, DevTools excluded). Each test gets a fresh browser
 * context, so a fresh IndexedDB. The runtime handle (`window.__protoyard`)
 * reads rows for setup; behavior is asserted through the UI.
 */
const SLUG = 'booking-calendar';
test.skip(!PROTOTYPE_TARGETS.includes(SLUG), `set PROTOYARD_E2E_PROTOTYPES to include ${SLUG}`);

type Row = Record<string, unknown>;
type Runtime = {
  data: { rows(table: string, o?: { limit?: number; offset?: number }): Promise<Row[]> };
};
declare global {
  interface Window {
    __protoyard?: Runtime;
  }
}

async function openApp(page: Page, hash: string, scenario = 'active') {
  await page.goto(`${prototypeUrl(SLUG)}?scenario=${scenario}${hash}`);
  await waitForPrototypeReady(page, { slug: SLUG });
}
/** Every row of a table (the inspector API pages its reads, 50 rows by default). */
const rows = (page: Page, table: string) =>
  page.evaluate(async (t) => {
    const all: Record<string, unknown>[] = [];
    for (let offset = 0; ; offset += 200) {
      const chunk = (await window.__protoyard?.data.rows(t, { limit: 200, offset })) ?? [];
      all.push(...chunk);
      if (chunk.length < 200) return all;
    }
  }, table);

/** Clicks a sidebar section link; on phones it first opens the drawer. */
async function navTo(page: Page, label: string) {
  const link = page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('link', { name: label });
  if (!(await link.isVisible()))
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await link.click();
}

/** Picks an option in a ui Select (a listbox) found by its label. */
async function choose(page: Page, label: string, option: string | RegExp) {
  // The Select trigger is a combobox named by its field label.
  await page.getByRole('dialog').getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: option }).first().click();
}

test.describe('Booking calendar template (static build)', () => {
  test('a client books a free slot online and it persists across a reload', async ({
    page,
  }, testInfo) => {
    await openApp(page, '#/book', 'client');
    await page.getByRole('button', { name: /^Coach Ana Ruiz/ }).click();
    await page
      .getByRole('group', { name: 'Length' })
      .getByRole('button', { name: '60 min' })
      .click();
    const days = page.getByRole('group', { name: 'Day' }).getByRole('button');
    // The first offered day can be today with no free time left: take the first day that has times.
    let picked = false;
    for (let i = 0; i < (await days.count()) && !picked; i++) {
      await days.nth(i).click();
      picked = (await page.getByRole('group', { name: 'Free times' }).count()) > 0;
    }
    expect(picked, 'a day with free times').toBe(true);
    const time = page.getByRole('group', { name: 'Free times' }).getByRole('button').first();
    const label = (await time.textContent())?.trim() ?? '';
    await time.click();
    await page.getByLabel('Your name').fill('Grace Hopper');
    await page.getByLabel('Email').fill('grace@example.com');
    await page.getByRole('button', { name: 'Confirm booking' }).click();
    await expect(page.getByRole('status').filter({ hasText: "You're booked" })).toBeVisible();
    await expect(page.getByText(label, { exact: false }).first()).toBeVisible();
    await expectAccessible(page, testInfo, { include: 'main', label: 'book-online' });

    await page.reload();
    await waitForPrototypeReady(page, { slug: SLUG });
    const mine = (await rows(page, 'bookings')).filter(
      (b) => b.customerEmail === 'grace@example.com'
    );
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      status: 'confirmed',
      source: 'public',
      resourceId: 'res_ana',
      createdBy: 'user_0004',
    });
  });

  test('booking over an existing booking shows the conflict and writes nothing', async ({
    page,
  }, testInfo) => {
    await openApp(page, '#/');
    await expect(page.getByRole('button', { name: 'New booking' })).toBeVisible();
    const all = await rows(page, 'bookings');
    const taken = all
      .filter(
        (b) =>
          b.resourceId === 'res_harbor' &&
          b.status === 'confirmed' &&
          String(b.start) > '2026-10-15'
      )
      .sort((a, b) => String(a.start).localeCompare(String(b.start)))[0];
    if (!taken) throw new Error('the active scenario has an upcoming Harbor booking');
    const start = String(taken.start);

    await page.getByRole('button', { name: 'New booking' }).click();
    const dialog = page.getByRole('dialog');
    await choose(page, 'Resource', 'Harbor room');
    await dialog.getByLabel('Title').fill('Overlapping workshop');
    await dialog.getByLabel('Date (UTC)').fill(start.slice(0, 10));
    await dialog.getByLabel('Start (UTC)').fill(start.slice(11, 16));
    await choose(page, 'Length', '1 h');
    await dialog.getByLabel('Customer name').fill('Alan Turing');
    await dialog.getByLabel('Customer email').fill('alan@example.com');
    await dialog.getByRole('button', { name: 'Confirm booking' }).click();
    await expect(dialog.getByText(/That time overlaps “.+”/)).toBeVisible();
    await expect(dialog).toBeVisible();
    expect((await rows(page, 'bookings')).length).toBe(all.length);
    await expectAccessible(page, testInfo, {
      include: '[role="dialog"]',
      label: 'booking-conflict',
    });
  });

  test('the calendar is read-only for a viewer', async ({ page }, testInfo) => {
    await openApp(page, '#/', 'viewer');
    await expect(page.getByRole('heading', { name: 'Calendar' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New booking' })).toHaveCount(0);
    await navTo(page, 'Book online');
    await expect(
      page.getByRole('note').filter({ hasText: 'can browse free times but not book' })
    ).toBeVisible();
    await expectAccessible(page, testInfo, { include: 'main', label: 'viewer-book-online' });
  });
});
