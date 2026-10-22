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

  const chart = page.locator('[data-py-block="chart"] figure[data-py-chart]');
  await expect(chart).toBeVisible();
  await expectPaths(chart.locator('[data-line]'));
  await expectPaths(chart.locator('[data-series] path:not([data-line])'));
  await page.screenshot({ path: 'tmp/blocks-chart-scaled.png', fullPage: true });

  await page.goto(`${prototypeUrl(SLUG)}#/explore/0`);
  const controls = page.locator('[data-py-block="chart-controls"]');
  await expect(controls).toBeVisible();
  await expectPaths(controls.locator('[data-line]'));

  await controls.getByRole('button', { name: 'area', exact: true }).click();
  await expectPaths(controls.locator('[data-series] path:not([data-line])'));
  await controls.getByRole('button', { name: 'bar', exact: true }).click();
  const bar = controls.locator('[data-bar]').first();
  await expect(bar).toBeVisible();
  await expect
    .poll(() => bar.getAttribute('height').then((height) => Number(height)))
    .toBeGreaterThan(0);

  await page.setViewportSize({ width: 1440, height: 900 });
  await controls.getByRole('button', { name: 'line', exact: true }).click();
  await expectPaths(controls.locator('[data-line]'));
});
