import { expect, type Page, test } from '@playwright/test';

/**
 * The site tells the whole story: the top navigation reaches Features, Play and
 * Docs; the home page's calls to action and capability cards lead to real
 * pages; /features/ has one h1, a sensible outline, and every guide link opens
 * a published guide.
 */

/** Every distinct same-site link under `selector`, as paths. */
async function links(page: Page, selector: string): Promise<string[]> {
  const hrefs = await page
    .locator(`${selector} a[href]`)
    .evaluateAll((anchors) => anchors.map((a) => new URL((a as HTMLAnchorElement).href).pathname));
  return [...new Set(hrefs)];
}

test('the top navigation reaches Features, Play and Docs', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main' });
  for (const [name, path] of [
    ['Features', '/features/'],
    ['Play', '/play/'],
    ['Docs', '/docs/'],
  ] as const) {
    await expect(nav.getByRole('link', { name, exact: true })).toHaveAttribute('href', path);
  }
  await nav.getByRole('link', { name: 'Features', exact: true }).click();
  await expect(page).toHaveURL(/\/features\/$/);
  await expect(nav.getByRole('link', { name: 'Features', exact: true })).toHaveAttribute(
    'aria-current',
    'page'
  );
});

test('the home page leads to the player, the docs and a guide for every capability', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Try it in your browser' })).toHaveAttribute(
    'href',
    '/play/'
  );
  await expect(page.getByRole('link', { name: 'Read the docs' })).toHaveAttribute('href', '/docs/');
  const section = page.getByRole('region', { name: 'What you can do' });
  await expect(section.getByRole('heading', { level: 3 })).toHaveCount(10);
  const guides = (await links(page, 'section[aria-labelledby="what-title"] li')).filter((p) =>
    p.startsWith('/docs/')
  );
  expect(guides).toHaveLength(10);
  for (const path of guides) {
    const response = await page.request.get(path);
    expect(response.status(), path).toBe(200);
  }
});

test('/features/ has one h1, an ordered outline and only working guide links', async ({ page }) => {
  await page.goto('/features/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  // No level is skipped: every heading is at most one deeper than the one before.
  const levels = await page
    .locator('main h1, main h2, main h3, main h4')
    .evaluateAll((hs) => hs.map((h) => Number(h.tagName.slice(1))));
  for (let i = 1; i < levels.length; i += 1) {
    expect(levels[i]! - levels[i - 1]!, `heading ${i}`).toBeLessThanOrEqual(1);
  }
  await expect(page.getByLabel('Quick start commands')).toContainText(
    'pnpm protoyard quick serve gym --open'
  );
  await expect(page.getByText('Not on npm yet.')).toBeVisible();
  const guides = (await links(page, 'main')).filter((p) => /^\/docs\/[a-z_]+\/$/.test(p));
  expect(guides.length).toBeGreaterThanOrEqual(26);
  for (const path of guides) {
    const response = await page.request.get(path);
    expect(response.status(), path).toBe(200);
  }
});
