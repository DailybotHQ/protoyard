import { expect, type Page, test } from '@playwright/test';
import { expectAccessible } from './support/a11y.ts';
import { waitForPrototypeReady } from './support/ready.ts';
import { PROTOTYPE_TARGETS, prototypeUrl } from './targets.ts';

/**
 * The @protoyard/charts-ui demos in ui-kit (`#/c/chart-*`) against the
 * static production build, in a real browser: layout, focus, live regions,
 * themes, motion and Canvas are what happy-dom cannot check. The runtime
 * handle (`window.__protoyard`) sets the theme override, as DevTools would.
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

const DEMOS = [
  'chart-cartesian',
  'chart-part-whole',
  'chart-matrix',
  'chart-compact',
  'chart-geo',
  'chart-states',
  'chart-stress',
] as const;

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

/** The focusable plot of the chart titled `title` (`role="group"`, `aria-roledescription="chart"`). */
const plot = (page: Page, title: RegExp) => page.getByRole('group', { name: title }).first();

test.describe('charts-ui demos (ui-kit static build)', () => {
  for (const id of DEMOS) {
    test(`${id} has no serious or critical axe violations`, async ({ page }, testInfo) => {
      await openDemo(page, id);
      await expectAccessible(page, testInfo, { include: 'main', label: id });
    });
  }

  test('keyboard traversal moves the active point and updates the live region', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'keyboard traversal is a desktop journey');
    await openDemo(page, 'chart-cartesian');
    const chart = plot(page, /^Signups, last 4 weeks\./);
    await chart.focus();
    const figure = page.locator('[data-py-chart]', { has: chart });
    const live = figure.locator('[data-chart-live]');
    await expect(live).not.toHaveText('');
    const first = await live.textContent();
    await page.keyboard.press('ArrowRight');
    await expect(live).not.toHaveText(first ?? '');
    await page.keyboard.press('End');
    const last = await live.textContent();
    expect(last).toMatch(/\d+ of \d+\.$/);
    // The active point is exposed through aria-activedescendant on the focused plot.
    const active = await chart.getAttribute('aria-activedescendant');
    expect(active && (await page.locator(`[id="${active}"]`).count())).toBe(1);
    await page.keyboard.press('PageDown');
    await expect(live).toContainText('Previous period');
  });

  test('"Show data table" opens Texuli\'s disclosure table and closes it', async ({ page }) => {
    await openDemo(page, 'chart-part-whole');
    const figure = page.locator('[data-py-chart]', { hasText: 'Accounts by plan' });
    const toggle = figure.getByRole('button', { name: 'Show data table' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(figure.getByRole('button', { name: 'Hide data table' })).toBeVisible();
    const table = figure.getByRole('table');
    await expect(table).toBeVisible();
    await expect(table.getByRole('columnheader')).toHaveText(['Slice', 'Value', 'Share']);
    // Header + Free, Pro, Team and Other (Education and Nonprofit are under 3 % and fold into Other).
    await expect(table.getByRole('row')).toHaveCount(5);
    await figure.getByRole('button', { name: 'Hide data table' }).click();
    await expect(figure.getByRole('button', { name: 'Show data table' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    await expect(table).toHaveCount(0);
    await expect(figure.locator('[data-slice]').first()).toBeVisible();
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

  test('reduced motion removes chart transitions', async ({ page }) => {
    await openDemo(page, 'chart-cartesian');
    await page.evaluate(() => window.__protoyard?.theme.setOverride({ reducedMotion: true }));
    // Texuli figure may carry data-motion; ChartRoot is [data-py-chart].
    const frames = page.locator('[data-py-chart] figure, [data-py-chart][data-motion]');
    await expect(frames.first()).toHaveAttribute('data-motion', 'reduce');
    expect(
      await frames.evaluateAll((els) =>
        els.every((el) => el.getAttribute('data-motion') === 'reduce')
      )
    ).toBe(true);
    const durations = await page
      .locator('[data-py-chart] svg rect[data-series]')
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).transitionDuration));
    expect(durations.length).toBeGreaterThan(0);
    // The theme's reduced-motion rule clamps every transition to 0.01 ms (1e-05s): effectively none.
    const ms = (part: string) => Number.parseFloat(part) * (part.trim().endsWith('ms') ? 1 : 1000);
    expect(durations.every((d) => d.split(',').every((part) => ms(part) <= 0.01))).toBe(true);
  });

  test('the 10k-point Canvas demo stays responsive and fits its container', async ({
    page,
    isMobile,
  }) => {
    await openDemo(page, 'chart-stress');
    await page.getByRole('button', { name: 'Canvas', exact: true }).click();
    const host = page.locator('[data-stress-chart="line"][data-stress-renderer="canvas"]');
    const canvas = host.locator('canvas');
    await expect(canvas).toBeVisible();
    const fits = () =>
      host.evaluate((el) => {
        const c = el.querySelector('canvas') as HTMLCanvasElement;
        const svg = el.querySelector('svg[role="group"]') as SVGSVGElement;
        return Math.abs(c.getBoundingClientRect().width - svg.getBoundingClientRect().width) <= 1;
      });
    expect(await fits()).toBe(true);

    // Hovering shows the tooltip quickly, with no long task on the main thread.
    await page.evaluate(() => {
      (window as unknown as { __long: number[] }).__long = [];
      new PerformanceObserver((list) => {
        for (const e of list.getEntries())
          (window as unknown as { __long: number[] }).__long.push(e.duration);
      }).observe({ type: 'longtask' });
    });
    const svg = host.locator('svg[role="group"]');
    const box = await svg.boundingBox();
    if (!box) throw new Error('no plot box');
    if (isMobile) {
      await svg.tap({ position: { x: box.width * 0.6, y: box.height / 2 } });
    } else {
      for (let i = 1; i <= 20; i++)
        await page.mouse.move(box.x + (box.width * i) / 21, box.y + box.height / 2);
    }
    await expect(host.locator('[data-chart-tooltip]')).toBeVisible({ timeout: 2_000 });
    const long = await page.evaluate(() => (window as unknown as { __long: number[] }).__long);
    expect(
      long.filter((d) => d > 50),
      'long tasks during the hover'
    ).toEqual([]);

    // Resizing the window redraws the Canvas at the new width.
    const before = await canvas.evaluate((c) => c.getBoundingClientRect().width);
    const size = page.viewportSize() ?? { width: 1280, height: 800 };
    // Well below the content column's max width, so the container really narrows.
    await page.setViewportSize({ width: size.width > 600 ? 480 : 340, height: size.height });
    await expect
      .poll(() => canvas.evaluate((c) => c.getBoundingClientRect().width))
      .not.toBe(before);
    await expect.poll(fits).toBe(true);
  });
});
