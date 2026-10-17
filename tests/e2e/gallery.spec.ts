import { expect, type Page, test } from '@playwright/test';
import { readRegistry } from './targets.ts';

const registry = readRegistry();
const prototypes = registry?.entries.filter((e) => e.kind === 'prototype') ?? [];
const templates = registry?.entries.filter((e) => e.kind === 'template') ?? [];

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

  test('searches, filters and opens a detail page', async ({ page }) => {
    test.skip(prototypes.length === 0, 'no prototypes indexed');
    const target = prototypes[prototypes.length - 1];
    if (!target) return;
    await page.goto('/');
    await hydrated(page, '#browse');
    const search = page.getByTestId('search');
    await search.fill(target.name);
    const results = page.getByTestId('results').getByTestId('project-card');
    await expect(results.first()).toHaveAttribute('data-slug', target.slug);
    // The query is reflected in the URL so the view can be shared.
    await expect(page).toHaveURL(/[?&]q=/);

    await search.fill('zz-no-such-prototype-zz');
    await expect(page.getByTestId('result-count')).toHaveText('No matches');
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page.getByTestId('result-count')).toContainText(`of ${prototypes.length}`);

    await search.fill(target.slug);
    await page.getByRole('link', { name: target.name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/p/${target.slug}/?$`));
    await expect(page.getByTestId('detail-title')).toHaveText(target.name);
    if (target.scenarios.length > 0) {
      await expect(page.getByTestId('scenarios').getByRole('listitem')).toHaveCount(
        target.scenarios.length
      );
    }
    // Static hosting: no control server, so the page says so and shows the command.
    await expect(page.getByTestId('control-status')).toContainText(
      `pnpm protoyard dev ${target.slug}`
    );
  });

  test('favorites persist across reloads in the same browser', async ({ page }) => {
    test.skip(prototypes.length === 0, 'no prototypes indexed');
    const target = prototypes[0];
    if (!target) return;
    await page.goto('/');
    await hydrated(page, '#browse');
    await page
      .getByTestId('results')
      .getByRole('button', { name: `Add ${target.name} to favorites` })
      .click();
    await page.reload();
    await hydrated(page, '#browse');
    await page.getByRole('button', { name: /^Favorites/ }).click();
    const cards = page.getByTestId('results').getByTestId('project-card');
    await expect(cards).toHaveCount(1);
    await expect(cards).toHaveAttribute('data-slug', target.slug);
  });

  test('switches the device preview frame', async ({ page }) => {
    test.skip(prototypes.length === 0, 'no prototypes indexed');
    await page.goto(`/p/${prototypes[0]?.slug}/`);
    await hydrated(page, 'section[aria-labelledby="preview-title"]');
    const devices = page.getByTestId('devices');
    await devices.getByRole('button', { name: 'iPhone-like' }).click();
    await expect(devices.getByRole('button', { name: 'iPhone-like' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect(page.getByText('393×852')).toBeVisible();
  });

  const detailPaths = [
    ...prototypes.slice(0, 1).map((p) => `/p/${p.slug}/`),
    ...templates.slice(0, 1).map((t) => `/t/${t.slug}/`),
  ];
  for (const path of ['/', '/new/', ...detailPaths]) {
    test(`has no horizontal overflow on ${path}`, async ({ page }) => {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test('theme toggle applies without reload and persists', async ({ page }) => {
    await page.goto('/');
    await hydrated(page, '[aria-label="Color theme"]');
    await page.getByRole('button', { name: 'Dark theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    // Set by the inline head script before paint, i.e. no flash of light theme.
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('templates are listed separately and feed the create builder', async ({ page }) => {
    test.skip(templates.length === 0, 'no templates indexed');
    const template = templates[0];
    if (!template) return;
    await page.goto(`/t/${template.slug}/`);
    await page.getByRole('link', { name: 'Use this template' }).click();
    const slug = page.getByLabel(/^Slug/);
    await expect(slug).toBeEditable();
    await slug.fill('team-crm');
    await expect(
      page.getByText(`pnpm protoyard new team-crm --template ${template.slug}`).first()
    ).toBeVisible();
    await slug.fill('Bad Slug');
    await expect(page.getByText('Use lowercase kebab-case')).toBeVisible();
  });
});
