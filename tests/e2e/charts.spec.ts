import { expect, type Page, test } from '@playwright/test';
import { expectAccessible } from './support/a11y.ts';
import { waitForPrototypeReady } from './support/ready.ts';
import { PROTOTYPE_TARGETS, prototypeUrl } from './targets.ts';

/**
 * One @protoyard/charts-ui family (the cartesian demo in ui-kit, `#/c/chart-cartesian`)
 * against the static production build, in a real browser: it renders, passes axe,
 * and re-reads its palette in dark mode. The runtime handle (`window.__protoyard`)
 * sets the theme override, as DevTools would.
 */
const SLUG = 'ui-kit';
test.skip(!PROTOTYPE_TARGETS.includes(SLUG), `set PROTOYARD_E2E_PROTOTYPES to include ${SLUG}`);

type Runtime = {
  theme: {
    setOverride(patch: { mode?: 'light' | 'dark'; reducedMotion?: boolean }): Promise<void>;
  };
};
declare global {
  interface Window {
    __protoyard?: Runtime;
  }
}

async function openDemo(page: Page, id: string) {
  await page.goto(`${prototypeUrl(SLUG)}#/c/${id}`);
  await waitForPrototypeReady(page, { slug: SLUG });
  // The demo is a lazy chunk; framed charts render a figure, compact ones a meter or an image.
  await page
    .locator(
      'main [data-py-chart], main [role="meter"], main [role="progressbar"], main svg[role="img"]'
    )
    .first()
    .waitFor({ timeout: 15_000 });
}

test.describe('charts-ui demos (ui-kit static build)', { tag: '@desktop' }, () => {
  test('chart-cartesian has no serious or critical axe violations', async ({ page }, testInfo) => {
    await openDemo(page, 'chart-cartesian');
    await expectAccessible(page, testInfo, { include: 'main', label: 'chart-cartesian' });
  });

  test('dark mode re-reads the chart palette and stays accessible', async ({ page }, testInfo) => {
    await openDemo(page, 'chart-cartesian');
    // Texuli bar marks use data-series on rects (no data-bar polyfill).
    const bar = page
      .locator('[data-py-chart]', { hasText: 'Revenue by region' })
      .locator('svg rect[data-series]')
      .first();
    await bar.waitFor();
    const fillOf = () => bar.evaluate((el) => getComputedStyle(el).fill);
    const light = await fillOf();
    await page.evaluate(() => window.__protoyard?.theme.setOverride({ mode: 'dark' }));
    await expect(page.locator('html')).toHaveAttribute('data-py-mode', 'dark');
    await expect.poll(fillOf).not.toBe(light);
    await expectAccessible(page, testInfo, { include: 'main', label: 'chart-cartesian-dark' });
  });
});
