import { expect, test } from '@playwright/test';
import { expectAccessible } from './support/a11y.ts';
import { waitForPrototypeReady } from './support/ready.ts';
import { PROTOTYPE_TARGETS, prototypeUrl } from './targets.ts';

const SLUG = 'cadence-studio-demo';
test.skip(!PROTOTYPE_TARGETS.includes(SLUG), `set PROTOYARD_E2E_PROTOTYPES to include ${SLUG}`);

test.describe('Cadence Studio booking flow (static build)', () => {
  test('creates a calendar booking, reschedules it, and changes appearance', async ({
    page,
  }, testInfo) => {
    await page.goto(`${prototypeUrl(SLUG)}?scenario=active#/bookings/calendar`);
    await waitForPrototypeReady(page, { slug: SLUG });
    await expect(page.locator('[data-calendar]')).toBeVisible();

    // Phones render the agenda; desktop renders the week time grid. Both create
    // from an accessible empty calendar date/time slot.
    const phone = testInfo.project.name === 'mobile';
    const slot = phone
      ? page.getByRole('button', { name: /Enter adds an all-day event/ }).first()
      : page.getByRole('button', { name: /^Empty slot,/ }).first();
    await slot.click();

    const dialog = page.getByRole('dialog', { name: 'New booking' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Title').fill('Clay forms for beginners');
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(dialog).toBeHidden();

    const booking = page.getByRole('button', { name: /^Clay forms for beginners,/ });
    await expect(booking).toBeVisible();
    const originalLabel = await booking.getAttribute('aria-label');
    await booking.focus();
    await booking.press('Space');
    await booking.press('ArrowDown');
    await booking.press('Enter');
    await expect.poll(() => booking.getAttribute('aria-label')).not.toBe(originalLabel);
    await expectAccessible(page, testInfo, { include: 'main', label: 'calendar-booking' });

    await page.goto(`${prototypeUrl(SLUG)}?scenario=active#/settings`);
    await waitForPrototypeReady(page, { slug: SLUG });
    const mode = page.getByTestId('settings-mode');
    await mode.click();
    await page.getByRole('option', { name: 'Dark', exact: true }).click();
    await expect(mode).toContainText('Dark');
    await expectAccessible(page, testInfo, { include: 'main', label: 'studio-appearance' });

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow, 'the layout should fit the viewport width').toBeLessThanOrEqual(1);
  });

  test('uses the phone tab layout and keeps the calendar inside the viewport', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'phone layout assertion');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${prototypeUrl(SLUG)}?scenario=active#/bookings/calendar`);
    await waitForPrototypeReady(page, { slug: SLUG });
    await expect(page.locator('[data-py-bottom-nav]')).toBeVisible();
    await expect(page.locator('[data-calendar]')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow, 'the calendar should not overflow the phone width').toBeLessThanOrEqual(1);
    await expectAccessible(page, testInfo, { include: 'main', label: 'phone-calendar' });
  });
});
