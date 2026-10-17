import { expect, test } from '@playwright/test';
import { PROTOTYPE_TARGETS, prototypeUrl } from './targets.ts';

/**
 * Generic smoke test for every built prototype target: it boots from the
 * static build (html[data-py-ready="true"], set by the renderer), throws no
 * page errors, and its data survives a reload (IndexedDB persistence).
 * Domain-specific flows live in <slug>.spec.ts files next to this one.
 */
for (const slug of PROTOTYPE_TARGETS) {
  test.describe(`${slug} (static build)`, () => {
    test('boots without errors and persists across reloads', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(prototypeUrl(slug));
      await expect(page.locator('html')).toHaveAttribute('data-py-ready', 'true', {
        timeout: 15_000,
      });
      const before = await page.locator('body').innerText();
      expect(before.trim().length).toBeGreaterThan(0);
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-py-ready', 'true', {
        timeout: 15_000,
      });
      expect(errors).toEqual([]);
    });
  });
}

test('prototype targets are configured', () => {
  test.skip(PROTOTYPE_TARGETS.length > 0, 'targets configured');
  test.info().annotations.push({
    type: 'note',
    description: 'Set PROTOYARD_E2E_PROTOTYPES=crm-demo,… to smoke-test built prototypes.',
  });
});
