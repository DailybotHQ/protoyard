import { expect, type Locator, test } from '@playwright/test';
import { waitForPrototypeReady } from './support/ready.ts';
import { PROTOTYPE_TARGETS, prototypeUrl } from './targets.ts';

const SLUG = 'create-anything-deck';
test.skip(!PROTOTYPE_TARGETS.includes(SLUG), `set PROTOYARD_E2E_PROTOTYPES to include ${SLUG}`);

async function expectPaths(locator: Locator) {
  await expect
    .poll(() =>
      locator.evaluateAll(
        (paths) =>
          paths.length > 0 &&
          paths.every((path) => (path.getAttribute('d') ?? '').trim().length > 0)
      )
    )
    .toBe(true);
}

test('deck chart blocks draw categorical paths when their canvas scales and controls change', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto(`${prototypeUrl(SLUG)}#/chart/0`);
  await waitForPrototypeReady(page, { slug: SLUG });

  const canvas = page.locator('[data-testid="deck-canvas"]');
  await expect(canvas).toBeVisible();
  await expect
    .poll(() => canvas.getAttribute('data-scale').then((scale) => Number(scale)))
    .toBeLessThan(1);

  const chartRoot = page.locator('[data-py-block="chart"]');
  await expect(chartRoot).toBeVisible();
  await expect(chartRoot.locator('[aria-label="Loading chart"]')).toHaveCount(0, {
    timeout: 30_000,
  });
  const chart = chartRoot.locator('figure[data-py-chart]');
  await expect(chart).toBeVisible();
  await expectPaths(chart.locator('[data-line], [data-series] path, path[data-line]'));
  // Area/line may share path marks; accept any series geometry once loaded.
  await expect
    .poll(async () => chart.locator('svg path, svg rect[data-series]').count())
    .toBeGreaterThan(0);
  await page.screenshot({ path: 'tmp/blocks-chart-scaled.png', fullPage: true });

  await page.goto(`${prototypeUrl(SLUG)}#/explore/0`);
  const controls = page.locator('[data-py-block="chart-controls"]');
  await expect(controls).toBeVisible({ timeout: 30_000 });
  await expect(controls.locator('[aria-label="Loading block"]')).toHaveCount(0, {
    timeout: 30_000,
  });
  await expectPaths(controls.locator('[data-line], path[data-line], [data-series] path'));

  await controls.getByRole('button', { name: 'area', exact: true }).click();
  await expectPaths(controls.locator('[data-series] path:not([data-line])'));
  await controls.getByRole('button', { name: 'bar', exact: true }).click();
  // Texuli bar marks: rect[data-series] (no data-bar polyfill).
  const bar = controls.locator('svg rect[data-series]').first();
  await expect(bar).toBeVisible();
  await expect
    .poll(() => bar.getAttribute('height').then((height) => Number(height)))
    .toBeGreaterThan(0);

  await page.setViewportSize({ width: 1440, height: 900 });
  await controls.getByRole('button', { name: 'line', exact: true }).click();
  await expectPaths(controls.locator('[data-line]'));
});
