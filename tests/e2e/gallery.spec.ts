import { expect, type Page, test } from '@playwright/test';
import { expectAccessible } from './support/a11y.ts';
import { GALLERY_ENABLED, readRegistry } from './targets.ts';

test.skip(!GALLERY_ENABLED, 'the gallery server is off (PROTOYARD_E2E_GALLERY=0)');

const registry = readRegistry();
const prototypes = registry?.entries.filter((e) => e.kind === 'prototype') ?? [];

/** Islands become interactive after hydration; each exposes data-hydrated="true". */
async function hydrated(page: Page, selector: string) {
  await expect(page.locator(`${selector}[data-hydrated="true"]`)).toHaveCount(1);
}

test.describe('gallery', () => {
  test('lists every prototype from the registry', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Build prototypes that feel real.'
    );
    if (prototypes.length === 0) {
      await expect(page.getByTestId('first-run')).toBeVisible();
      return;
    }
    await expect(page.getByTestId('result-count')).toContainText(`of ${prototypes.length}`);
    for (const entry of prototypes.slice(0, 24)) {
      await expect(
        page.locator(`[data-testid="results"] [data-slug="${entry.slug}"]`)
      ).toBeVisible();
    }
  });

  test(
    'searches, filters and opens an accessible detail page',
    { tag: '@desktop' },
    async ({ page }, testInfo) => {
      test.skip(prototypes.length === 0, 'no prototypes indexed');
      const target = prototypes[prototypes.length - 1];
      if (!target) return;
      await page.goto('/');
      await hydrated(page, '#browse');
      const search = page.getByTestId('search');
      await search.fill(target.name);
      await expect(
        page.locator(`[data-testid="results"] [data-slug="${target.slug}"]`)
      ).toBeVisible();
      // The query is reflected in the URL so the view can be shared.
      await expect(page).toHaveURL(/[?&]q=/);

      await search.fill('zz-no-such-prototype-zz');
      await expect(page.getByTestId('result-count')).toHaveText('No matches');
      await expect(page.getByTestId('browse-empty')).toHaveAttribute('data-empty', 'filters');
      await page.getByTestId('empty-clear-filters').click();
      await expect(page.getByTestId('result-count')).toContainText(`of ${prototypes.length}`);
      await expect(page.getByTestId('results')).toBeVisible();

      await search.fill(target.name);
      await page.getByRole('link', { name: target.name, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/p/${target.slug}/?$`));
      await expect(page.getByTestId('detail-title')).toHaveText(target.name);
      const commandRegions = page.locator('pre[role="region"]');
      const commandRegionCount = await commandRegions.count();
      expect(commandRegionCount).toBeGreaterThan(0);
      for (let index = 0; index < commandRegionCount; index += 1) {
        const region = commandRegions.nth(index);
        await expect(region).toHaveAttribute('aria-label', /\S/);
        // A command that scrolls is always a Tab stop (WCAG 2.1.1). One that fits drops the
        // stop once its island hydrates (unit-tested in apps/gallery/tests/command-block.test.ts).
        const scrolls = await region.evaluate((el) => el.scrollWidth > el.clientWidth);
        if (scrolls) await expect(region).toHaveAttribute('tabindex', '0');
      }
      await expectAccessible(page, testInfo, { label: 'gallery-detail' });
      if (target.scenarios.length > 0) {
        await expect(page.getByTestId('scenarios').getByRole('listitem')).toHaveCount(
          target.scenarios.length
        );
      }
      // Static hosting: no control server, so the page says so and shows the command.
      await expect(page.getByTestId('control-status')).toContainText(
        `pnpm protoyard dev ${target.slug}`
      );
    }
  );
});
