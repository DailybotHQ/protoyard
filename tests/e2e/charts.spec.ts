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

/** The chart root titled `title`: charts-ui's named group (`[data-py-chart]`, role="group"). */
const chartRoot = (page: Page, title: RegExp) =>
  page
    .locator('[data-py-chart]')
    .and(page.getByRole('group', { name: title }))
    .first();
/** Its keyboard plot: Texuli's explorer (`aria-roledescription="chart"`, role="application"). */
const plot = (page: Page, title: RegExp) =>
  chartRoot(page, title).locator('[aria-roledescription="chart"]').first();

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
    const figure = chartRoot(page, /^Signups, last 4 weeks\./);
    const chart = plot(page, /^Signups, last 4 weeks\./);
    await chart.focus();
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

  test("the part-whole data table opens from Texuli's disclosure and closes", async ({ page }) => {
    // Cartesian charts toggle their table with a "Show data table" button; the
    // other families use a native <details> disclosure named by the chart title.
    await openDemo(page, 'chart-part-whole');
    const figure = page.locator('[data-py-chart]', { hasText: 'Accounts by plan' });
    const disclosure = figure.locator('details');
    const summary = disclosure.locator('summary');
    await expect(summary).toHaveText('Accounts by plan');
    await expect(disclosure).not.toHaveAttribute('open');
    await summary.click();
    await expect(disclosure).toHaveAttribute('open');
    const table = disclosure.getByRole('table');
    await expect(table).toBeVisible();
    await expect(table.getByRole('columnheader')).toHaveText(['Category', 'Value']);
    // Header + one row per drawn slice (small slices fold into Other).
    const slices = await figure.locator('[data-slice]').count();
    expect(slices).toBeGreaterThan(1);
    await expect(table.getByRole('row')).toHaveCount(slices + 1);
    await summary.click();
    await expect(disclosure).not.toHaveAttribute('open');
    await expect(table).toBeHidden();
    await expect(figure.locator('[data-slice]').first()).toBeVisible();
  });

  test('a cartesian chart toggles its data table with "Show data table"', async ({ page }) => {
    await openDemo(page, 'chart-cartesian');
    const figure = chartRoot(page, /^Signups, last 4 weeks\./);
    const toggle = figure.getByRole('button', { name: 'Show data table' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    const hide = figure.getByRole('button', { name: 'Hide data table' });
    await expect(hide).toHaveAttribute('aria-expanded', 'true');
    await expect(figure.getByRole('table')).toBeVisible();
    await hide.click();
    await expect(figure.getByRole('button', { name: 'Show data table' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    await expect(figure.getByRole('table')).toHaveCount(0);
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

  test('a Texuli chart outside ChartRoot follows the theme in light and dark', async ({ page }) => {
    await openDemo(page, 'chart-cartesian');
    // Move a rendered Texuli figure out of charts-ui's ChartRoot: nothing but the
    // theme on the document root now feeds its --tx-chart-N series colors.
    const figure = page.locator('body > [data-outside-chart-root] figure');
    await page.evaluate(() => {
      const root = [...document.querySelectorAll('[data-py-chart]')].find((el) =>
        el.textContent?.includes('Revenue by region')
      );
      const fig = root?.querySelector('figure');
      if (!fig) throw new Error('no chart figure');
      const host = document.createElement('div');
      host.setAttribute('data-outside-chart-root', '');
      host.append(fig);
      document.body.append(host);
    });
    const bar = figure.locator('svg rect[data-series]').first();
    const state = () =>
      bar.evaluate((el) => ({
        fill: getComputedStyle(el).fill,
        theme: (() => {
          const probe = document.createElement('i');
          probe.style.color = 'var(--tx-chart-1)';
          document.body.append(probe);
          const color = getComputedStyle(probe).color;
          probe.remove();
          return color;
        })(),
      }));
    const light = await state();
    expect(light.fill).toBe(light.theme);
    await page.evaluate(() => window.__protoyard?.theme.setOverride({ mode: 'dark' }));
    await expect(page.locator('html')).toHaveAttribute('data-py-mode', 'dark');
    await expect.poll(async () => (await state()).fill).not.toBe(light.fill);
    const dark = await state();
    expect(dark.fill).toBe(dark.theme);
  });

  test('reduced motion removes chart transitions', async ({ page }) => {
    await openDemo(page, 'chart-cartesian');
    await page.evaluate(() => window.__protoyard?.theme.setOverride({ reducedMotion: true }));
    // The prototype's reduced-motion toggle (Texuli charts mark only the OS preference
    // with data-reduced-motion on the plot, Texuli gap G98).
    await expect(page.locator('html')).toHaveAttribute('data-py-motion', 'reduce');
    // Every animated part of the charts: marks, the hover dot and the active ring.
    const parts = page.locator(
      '[data-py-chart] svg rect[data-series], [data-py-chart] .tx-chart-hover-dot, [data-py-chart] .tx-chart-active-ring'
    );
    await page
      .getByRole('group', { name: /^Signups, last 4 weeks\./ })
      .first()
      .hover();
    const durations = await parts.evaluateAll((els) =>
      els.map((el) => getComputedStyle(el).transitionDuration)
    );
    expect(durations.length).toBeGreaterThan(0);
    // The theme's reduced-motion rule clamps every transition to 0.01 ms (1e-05s): effectively none.
    const ms = (part: string) => Number.parseFloat(part) * (part.trim().endsWith('ms') ? 1 : 1000);
    expect(durations.every((d) => d.split(',').every((part) => ms(part) <= 0.01))).toBe(true);
  });

  test('the renderer choice reaches Texuli: SVG draws 10k points as SVG, Canvas on a canvas', async ({
    page,
  }) => {
    await openDemo(page, 'chart-stress');
    // Auto switches to canvas from 5,000 points, so only a forwarded `renderer="svg"` keeps SVG.
    await page.getByRole('button', { name: 'SVG', exact: true }).click();
    const svgHost = page.locator('[data-stress-chart="line"][data-stress-renderer="svg"]');
    await expect(svgHost.locator('[aria-roledescription="chart"]')).toBeVisible();
    await expect(svgHost.locator('canvas')).toHaveCount(0);
    await page.getByRole('button', { name: 'Canvas', exact: true }).click();
    const canvasHost = page.locator('[data-stress-chart="line"][data-stress-renderer="canvas"]');
    await expect(canvasHost.locator('canvas')).toBeVisible();
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
    // The canvas marks share the plot's box with the SVG axes and the keyboard explorer.
    const fits = () =>
      host.evaluate((el) => {
        const c = el.querySelector('canvas') as HTMLCanvasElement;
        const plotBox = el.querySelector('.tx-chart-plot') as HTMLElement;
        const a = c.getBoundingClientRect();
        const b = plotBox.getBoundingClientRect();
        return Math.abs(a.width - b.width) <= 1 && Math.abs(a.left - b.left) <= 1;
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
    const svg = host.locator('[aria-roledescription="chart"]');
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
