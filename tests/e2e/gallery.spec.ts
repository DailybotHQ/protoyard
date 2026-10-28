import { expect, type Page, test } from '@playwright/test';
import { expectAccessible } from './support/a11y.ts';
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

  test('searches, filters and opens an accessible detail page', async ({ page }, testInfo) => {
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
      await expect(region).toHaveAttribute('tabindex', '0');
      await expect(region).toHaveAttribute('aria-label', /\S/);
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

  test('empty-state CTAs clear filters, browse templates, and open create', async ({ page }) => {
    test.skip(prototypes.length === 0, 'no prototypes indexed');
    await page.goto('/');
    await hydrated(page, '#browse');

    // Favorites empty → browse all
    await page.getByRole('button', { name: /^Favorites/ }).click();
    const favResults = page.getByTestId('results');
    while ((await favResults.getByTestId('project-card').count()) > 0) {
      await favResults
        .getByRole('button', { name: /Remove .+ from favorites/ })
        .first()
        .click();
    }
    await expect(page.getByTestId('browse-empty')).toHaveAttribute('data-empty', 'favorites');
    await page.getByTestId('empty-browse-all').click();
    await expect(page.getByTestId('result-count')).toContainText(`of ${prototypes.length}`);

    // No-matches filters → create prototype CTA
    await page.getByTestId('search').fill('zz-no-such-prototype-zz');
    await expect(page.getByTestId('browse-empty')).toHaveAttribute('data-empty', 'filters');
    await page.getByTestId('empty-create-prototype').click();
    await expect(page).toHaveURL(/\/new\/?/);

    // Browse templates jumps to the templates section
    await page.goto('/');
    await hydrated(page, '#browse');
    await page.getByTestId('search').fill('zz-no-such-prototype-zz');
    await page.getByTestId('empty-browse-templates').click();
    await expect(page.locator('#templates')).toBeInViewport();
  });

  test('switches the device preview frame', async ({ page }) => {
    test.skip(prototypes.length === 0, 'no prototypes indexed');
    await page.goto(`/p/${prototypes[0]?.slug}/`);
    await hydrated(page, 'section[aria-labelledby="preview-title"]');
    const devices = page.getByTestId('devices');
    await devices.getByRole('button', { name: 'Phone (pill cutout)' }).click();
    await expect(devices.getByRole('button', { name: 'Phone (pill cutout)' })).toHaveAttribute(
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
    await expect(page.locator('html')).toHaveAttribute('data-tx-mode', 'dark');
    await page.reload();
    // Set by the inline head script before paint, i.e. no flash of light theme.
    await expect(page.locator('html')).toHaveAttribute('data-tx-mode', 'dark');
  });

  test('migrates the previous saved mode into Texuli appearance storage once', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('protoyard.gallery.theme', 'dark'));
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-tx-mode', 'dark');
    const appearance = await page.evaluate(() => {
      const raw = localStorage.getItem('texuli.gallery.appearance');
      return raw ? (JSON.parse(raw) as { themeId: string; mode: string }) : null;
    });
    expect(appearance).toMatchObject({ themeId: 'gallery', mode: 'dark' });
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('protoyard.gallery.theme')))
      .toBeNull();

    await page.evaluate(() => localStorage.setItem('protoyard.gallery.theme', 'light'));
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-tx-mode', 'dark');
  });

  test('theme explorer filters by collection and mood and links a prototype in the selected mode', async ({
    page,
  }, testInfo) => {
    test.skip(prototypes.length === 0, 'no prototypes indexed');
    await page.goto('/themes/');
    await hydrated(page, '[data-testid="theme-explorer"]');
    await expectAccessible(page, testInfo, { label: 'gallery-theme-explorer' });

    const search = page.getByTestId('theme-search');
    await search.fill('health-clinic');
    await expect(page.getByTestId('theme-count')).toContainText('Showing 1 of');
    await expect(page).toHaveURL(/[?&]q=health-clinic/);
    const card = page.locator('[data-theme-card][data-theme-id="health-clinic"]');
    await expect(card).toBeVisible();
    // The light preview shows every chart color (8); the dark one renders hidden beside it.
    await expect(
      card.locator('[data-theme-mode="light"] [aria-label="Chart palette preview"] span')
    ).toHaveCount(8);

    await page.getByTestId('theme-collection').click();
    await page.getByRole('option', { name: 'brand-like' }).click();
    await expect(page.getByTestId('theme-count')).toContainText('Showing 0 of');
    await expect(page).toHaveURL(/[?&]collection=brand-like/);
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await page.getByTestId('theme-mood').click();
    await page.getByRole('option', { name: 'calm' }).click();
    await expect(card).toBeVisible();
    await expect(page).toHaveURL(/[?&]mood=calm/);
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await search.fill('health-clinic');
    await page
      .getByTestId('theme-explorer')
      .getByRole('button', { name: 'Dark', exact: true })
      .click();
    await expect(page).toHaveURL(/[?&]mode=dark/);

    const target = prototypes[0];
    if (!target) return;
    await page.getByTestId('theme-prototype').click();
    await page.getByRole('option', { name: target.name, exact: true }).click();
    const link = card.getByRole('link', { name: `Open ${target.name} in this theme` });
    await expect(link).toHaveAttribute('href', /theme=health-clinic.*mode=dark/);
    await expect(link).toHaveAttribute('target', '_blank');
    const prototypePage = page.context().waitForEvent('page');
    await link.click();
    await expect(await prototypePage).toHaveURL(/theme=health-clinic.*mode=dark/);
  });

  test('command palette opens from the shortcut, searches and navigates by keyboard', async ({
    page,
  }, testInfo) => {
    test.skip(prototypes.length === 0, 'no prototypes indexed');
    const target = prototypes[0];
    if (!target) return;
    await page.goto('/');
    const trigger = page.getByRole('button', {
      name: 'Search (Command or Control K)',
    });
    await expect(trigger).toBeVisible();
    await expect(page.getByTestId('command-palette')).toHaveAttribute('data-hydrated', 'true');
    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog', { name: 'Command palette' });
    await expect(dialog).toBeVisible();
    await expectAccessible(page, testInfo, { label: 'gallery-command-palette' });

    const input = dialog.getByRole('combobox', {
      name: 'Search prototypes, templates, and actions',
    });
    await expect(input).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();

    await page.keyboard.press('Control+k');
    await expect(dialog).toBeVisible();
    await input.fill(`Open ${target.name}`);
    const openTarget = dialog
      .getByRole('option')
      .filter({ hasText: `Open ${target.name}` })
      .first();
    await expect(openTarget).toBeVisible();
    await input.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/p/${target.slug}/?$`));
  });

  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    test(`card opens its detail page with shared transition names (motion: ${reducedMotion})`, async ({
      page,
    }) => {
      test.skip(prototypes.length === 0, 'no prototypes indexed');
      const target = prototypes[0];
      if (!target) return;
      await page.emulateMedia({ reducedMotion });
      await page.goto('/');
      await hydrated(page, '#browse');

      // Names are unique on the page (a duplicate would cancel the whole transition).
      const names = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('[style*="view-transition-name"]')].map(
          (el) => getComputedStyle(el).viewTransitionName
        )
      );
      expect(names.length).toBeGreaterThan(0);
      expect(new Set(names).size).toBe(names.length);

      const card = page.locator(`[data-testid="results"] [data-slug="${target.slug}"]`);
      const cardNames = await card.evaluate((el) =>
        [...el.querySelectorAll<HTMLElement>('[style*="view-transition-name"]')].map(
          (n) => getComputedStyle(n).viewTransitionName
        )
      );
      expect(cardNames).toEqual([`py-icon-${target.slug}`, `py-title-${target.slug}`]);

      // Card motion is skipped entirely with reduced motion.
      await card.hover();
      const translate = await card.evaluate((el) => getComputedStyle(el).translate);
      if (reducedMotion === 'reduce') expect(translate).toBe('none');

      await card.getByRole('link', { name: target.name, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/p/${target.slug}/?$`));
      await expect(page.getByTestId('detail-title')).toHaveText(target.name);
      const detailNames = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('[style*="view-transition-name"]')].map(
          (el) => getComputedStyle(el).viewTransitionName
        )
      );
      expect(detailNames).toEqual(cardNames);
    });
  }

  test('templates are listed separately and feed the create builder', async ({ page }) => {
    test.skip(templates.length === 0, 'no templates indexed');
    const template = templates[0];
    if (!template) return;
    await page.goto(`/t/${template.slug}/`);
    await page.getByRole('link', { name: 'Use this template' }).click();
    await expect(page.locator('[data-testid="create-builder"][data-hydrated="true"]')).toHaveCount(
      1
    );
    const slug = page.getByLabel(/^Slug/);
    await expect(slug).toBeEditable();
    await slug.fill('team-crm');
    await expect(
      page.getByText(`pnpm protoyard new team-crm --template ${template.slug}`).first()
    ).toBeVisible();
    await slug.fill('Bad Slug');
    await expect(page.getByText('Use lowercase kebab-case')).toBeVisible();
  });

  test('compare page without bundled builds explains how to run frames', async ({ page }) => {
    const target = prototypes.find((p) => p.scenarios.length >= 2);
    test.skip(!target, 'no prototype with two scenarios');
    await page.goto(`/p/${target?.slug}/`);
    await page.getByTestId('compare-link').click();
    await expect(page.getByTestId('compare-unavailable')).toContainText(
      `pnpm protoyard dev ${target?.slug}`
    );
    await expect(page.getByTestId('compare-scenario-a')).toBeVisible();
    await expect(page.locator('[data-testid="compare"][data-hydrated="true"]')).toHaveCount(1);
    const a = page.getByTestId('compare-scenario-a');
    const b = page.getByTestId('compare-scenario-b');
    const [beforeA, beforeB] = await Promise.all([
      a.getAttribute('data-value'),
      b.getAttribute('data-value'),
    ]);
    if (!beforeA || !beforeB) throw new Error('Compare select did not expose its selected value');
    expect(beforeA).not.toBe(beforeB);
    await page.getByRole('button', { name: 'Swap A and B' }).click();
    await expect(a).toHaveAttribute('data-value', beforeB);
    await expect(b).toHaveAttribute('data-value', beforeA);
    await expect
      .poll(() => page.evaluate(() => new URL(location.href).searchParams.get('a')))
      .toBe(beforeB);
    await expect
      .poll(() => page.evaluate(() => new URL(location.href).searchParams.get('b')))
      .toBe(beforeA);
  });
});
