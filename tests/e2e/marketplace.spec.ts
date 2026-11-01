import { expect, type Page, test } from '@playwright/test';
import { readRegistry } from './targets.ts';

/**
 * The gallery marketplace on its REAL static build (`astro preview`, no control
 * server, so the hosted read-only mode): a detail page opens for each kind on
 * the shelf. Marketplace axe runs in tests/e2e/a11y.spec.ts.
 */

type Shelved = {
  kind: 'prototype' | 'template' | 'blueprint';
  slug: string;
  name: string;
  catalog?: { category?: string; features?: string[] } | null;
};

const shelved = ((readRegistry()?.entries ?? []) as unknown as Shelved[]).filter(
  (e) => ['prototype', 'template', 'blueprint'].includes(e.kind) && e.catalog?.category
);

/**
 * The repository ships prototypes, templates and blueprints on the shelf. Assert
 * it, so a test never passes without exercising the kind it names.
 */
function requireFirst(kind: Shelved['kind']): Shelved {
  const entry = shelved.find((e) => e.kind === kind);
  expect(entry, `the registry shelves at least one ${kind}`).toBeDefined();
  return entry as Shelved;
}

async function openMarketplace(page: Page, search = '') {
  await page.goto(`/marketplace/${search}`);
  await expect(
    page.locator('section[aria-labelledby="market-browse-title"][data-hydrated="true"]')
  ).toHaveCount(1);
}

test.describe('marketplace', { tag: '@desktop' }, () => {
  test.skip(shelved.length === 0, 'no catalog entries indexed');

  test('opens a detail page for a prototype, a template and a blueprint', async ({ page }) => {
    for (const kind of ['prototype', 'template', 'blueprint'] as const) {
      const entry = requireFirst(kind);
      await openMarketplace(page, `?kind=${kind}`);
      await page.getByTestId('market-results').locator(`[data-slug="${entry.slug}"] a`).click();
      await expect(page).toHaveURL(new RegExp(`/marketplace/${kind}/${entry.slug}/?$`));
      await expect(page.getByTestId('market-detail-title')).toHaveText(entry.name);
      if (kind === 'blueprint') {
        await expect(page.getByRole('heading', { name: 'Try it' })).toBeVisible();
        await expect(
          page.getByText(`--blueprint blueprints/${entry.slug}.json`).first()
        ).toBeVisible();
      } else {
        await expect(page.getByRole('heading', { name: /^Scenarios/ })).toBeVisible();
        await expect(page.getByText(`pnpm protoyard spec ${entry.slug} --check`)).toBeVisible();
      }
    }
  });
});
