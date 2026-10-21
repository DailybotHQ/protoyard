import { expect, test } from '@playwright/test';
import { expectAccessible } from './support/a11y.ts';

/**
 * The published guides on the served gallery build: /docs/ search is a real
 * combobox that fetches its index only when used and works from the
 * keyboard, and every /docs/<slug>/ page passes axe.
 */

const INDEX = /\/docs\/search-index\.json$/;

test('docs search fetches its index on first use and works from the keyboard', async ({ page }) => {
  const fetched: string[] = [];
  page.on('request', (request) => {
    if (INDEX.test(new URL(request.url()).pathname)) fetched.push(request.url());
  });
  await page.goto('/docs/');
  const search = page.getByRole('combobox', { name: 'Search the documentation' });
  await expect(search).toBeVisible();
  await page.waitForLoadState('networkidle');
  // The page stays light: no index until someone uses the search.
  expect(fetched).toEqual([]);

  await search.focus();
  await expect.poll(() => fetched.length).toBe(1);
  await search.fill('player');
  const results = page.getByRole('listbox', { name: 'Documentation search results' });
  await expect(results).toBeVisible();
  await expect(search).toHaveAttribute('aria-expanded', 'true');
  const options = results.getByRole('option');
  expect(await options.count()).toBeGreaterThan(1);

  // Arrow keys move the active option; the input keeps focus.
  await search.press('ArrowDown');
  await expect(search).toHaveAttribute('aria-activedescendant', 'docs-search-option-0');
  await expect(options.nth(0)).toHaveAttribute('aria-selected', 'true');
  await search.press('ArrowDown');
  await expect(search).toHaveAttribute('aria-activedescendant', 'docs-search-option-1');
  await search.press('ArrowUp');
  await expect(search).toHaveAttribute('aria-activedescendant', 'docs-search-option-0');
  await expect(search).toBeFocused();

  // Escape closes the list first, then clears the query.
  await search.press('Escape');
  await expect(search).toHaveAttribute('aria-expanded', 'false');
  await expect(search).toHaveValue('player');
  await search.press('Escape');
  await expect(search).toHaveValue('');

  // Enter opens the active result's guide page; the index was fetched once.
  await search.fill('player');
  await expect(results).toBeVisible();
  await search.press('ArrowDown');
  const href = await options.nth(0).getByRole('link').getAttribute('href');
  expect(href).toMatch(/\/docs\/[a-z0-9_-]+\//);
  await search.press('Enter');
  await expect(page).toHaveURL((url) => `${url.pathname}${url.hash}` === href);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(fetched).toHaveLength(1);
});

test('the docs index and every guide page pass axe', async ({ page }, testInfo) => {
  testInfo.setTimeout(180_000);
  await page.goto('/docs/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectAccessible(page, testInfo, { label: 'docs-index' });
  const slugs = [
    ...new Set(
      (
        await page
          .locator('main a[href*="/docs/"]')
          .evaluateAll((links) =>
            links.map(
              (link) =>
                /\/docs\/([a-z0-9_-]+)\/$/.exec(
                  new URL((link as HTMLAnchorElement).href).pathname
                )?.[1]
            )
          )
      ).filter((slug): slug is string => slug !== undefined)
    ),
  ];
  expect(slugs.length).toBeGreaterThan(20);
  for (const slug of slugs) {
    await page.goto(`/docs/${slug}/`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectAccessible(page, testInfo, { label: `docs-${slug}` });
  }
});
