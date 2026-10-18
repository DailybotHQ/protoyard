import { expect, type Page, test } from '@playwright/test';
import { expectAccessible } from './support/a11y.ts';
import { PROTOTYPE_TARGETS, prototypeUrl } from './targets.ts';

/**
 * Flagship support widget against its static production build.
 *
 * Widget-host only frames when the window is wider than the laptop device plus
 * gutter (≈1328 px). Playwright's default desktop is 1280 px and the mobile
 * project is a phone, so both would full-bleed without an explicit desktop
 * viewport (see shell-layout.spec.ts, ADR-016).
 */
const SLUG = 'support-widget-demo';
test.skip(!PROTOTYPE_TARGETS.includes(SLUG), `set PROTOYARD_E2E_PROTOTYPES to include ${SLUG}`);

type Runtime = {
  data: { counts(): Promise<Record<string, number>> };
  storage(): { backend: string };
};
declare global {
  interface Window {
    __protoyard?: Runtime;
  }
}

async function openApp(page: Page, scenario = 'returning-customer') {
  await page.goto(`${prototypeUrl(SLUG)}?scenario=${scenario}&shell=widget-host`);
  await expect(page.locator('html')).toHaveAttribute('data-py-ready', 'true', { timeout: 20_000 });
}

/** Desktop framed path: wide enough for widget-host + reduced motion for axe. */
async function prepareFramedDesktop(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
}

async function openWidgetPanel(page: Page) {
  const launcher = page.locator('[data-py-widget-launcher]');
  await expect(launcher).toBeVisible({ timeout: 15_000 });
  if ((await launcher.getAttribute('aria-expanded')) !== 'true') {
    await launcher.click();
  }
  await expect(page.locator('[data-py-frame="widget-host"]')).toHaveAttribute(
    'data-py-widget-open',
    'true'
  );
  await expect(page.getByRole('heading', { name: 'Northwind Help' })).toBeVisible();
}

/** Order lookup + return on the open widget UI (framed panel or full-bleed app). */
async function lookupAndReturn(page: Page) {
  await page.getByTestId('order-lookup-input').fill('NW-10040');
  await page.getByTestId('order-lookup-submit').click();
  await expect(page.getByTestId('order-card')).toBeVisible();
  await expect(page.getByTestId('order-number')).toContainText('NW-');
  await expect(page.getByTestId('order-total')).toBeVisible();

  await page.getByTestId('return-reason').fill('Wrong size for weekend trips');
  await page.getByTestId('start-return').click();
  await expect(page.getByTestId('returns-list')).toBeVisible();
  await expect(page.getByTestId('return-row').first()).toContainText('requested');
}

test.describe('Northwind Help (support-widget-demo)', () => {
  test('desktop: framed launcher, order lookup, return, reload persist', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'framed widget-host needs a window wider than the laptop device');
    await prepareFramedDesktop(page);
    await openApp(page);

    await expect(page.locator('html')).toHaveAttribute('data-py-shell', 'widget-host');
    await expect(page.locator('[data-py-frame="widget-host"]')).toBeVisible();
    await openWidgetPanel(page);
    await lookupAndReturn(page);

    const before = await page.evaluate(() => window.__protoyard?.data.counts());
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-py-ready', 'true', {
      timeout: 20_000,
    });
    // Viewport + motion prefs survive reload in Playwright; re-open the panel.
    await openWidgetPanel(page);
    await expect(page.getByTestId('returns-list')).toBeVisible();
    await expect(page.getByTestId('return-row').first()).toContainText('requested');
    expect(await page.evaluate(() => window.__protoyard?.data.counts())).toEqual(before);
    expect(await page.evaluate(() => window.__protoyard?.storage().backend)).toBe('indexeddb');
  });

  test('desktop: axe on the open framed widget', async ({ page, isMobile }, testInfo) => {
    test.skip(isMobile, 'framed widget-host needs a window wider than the laptop device');
    await prepareFramedDesktop(page);
    await openApp(page, 'first-visit');
    await openWidgetPanel(page);
    await expectAccessible(page, testInfo, { label: 'support-widget-open-framed' });
  });

  test('mobile: full-bleed app (no launcher); lookup and return still work', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'full-bleed path runs on the mobile project (Pixel 7)');
    await openApp(page);

    // Window is narrower than the device: no shell frame, no host launcher.
    await expect(page.locator('html')).not.toHaveAttribute('data-py-shell', /.*/);
    await expect(page.locator('[data-py-frame="widget-host"]')).toHaveCount(0);
    await expect(page.locator('[data-py-widget-launcher]')).toHaveCount(0);

    await expect(page.getByRole('heading', { name: 'Northwind Help' })).toBeVisible();
    await lookupAndReturn(page);

    const before = await page.evaluate(() => window.__protoyard?.data.counts());
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-py-ready', 'true', {
      timeout: 20_000,
    });
    await expect(page.getByTestId('returns-list')).toBeVisible();
    await expect(page.getByTestId('return-row').first()).toContainText('requested');
    expect(await page.evaluate(() => window.__protoyard?.data.counts())).toEqual(before);
  });
});
