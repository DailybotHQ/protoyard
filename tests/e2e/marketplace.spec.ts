import { expect, type Page, test } from '@playwright/test';
import { expectAccessible } from './support/a11y.ts';
import { waitForPrototypeReady } from './support/ready.ts';
import { readRegistry } from './targets.ts';

/**
 * The gallery marketplace on its REAL static build (`astro preview`, no control
 * server, so the hosted read-only mode): category rails, search, feature
 * filters and URL state, the empty state, detail pages for each kind, "Try it"
 * and "Use this template" in read-only mode, axe in light and dark, and no
 * horizontal overflow on a phone.
 *
 * With PROTOYARD_E2E_SHOWCASE=1 one more test plays a bundled template demo
 * inside its marketplace frame on the showcase site (port 4501, or
 * PROTOYARD_E2E_SHOWCASE_PORT).
 */

type Shelved = {
  kind: 'prototype' | 'template' | 'blueprint';
  blueprintKind?: 'app' | 'deck' | 'page' | 'doc' | null;
  slug: string;
  name: string;
  catalog?: { category?: string; features?: string[] } | null;
};

const shelved = ((readRegistry()?.entries ?? []) as unknown as Shelved[]).filter(
  (e) => ['prototype', 'template', 'blueprint'].includes(e.kind) && e.catalog?.category
);
const categories = new Set(shelved.map((e) => e.catalog?.category));
const first = (kind: Shelved['kind']) => shelved.find((e) => e.kind === kind);

/**
 * The repository ships prototypes, templates and blueprints on the shelf. Assert
 * it, so a test never passes without exercising the kind it names.
 */
function requireFirst(kind: Shelved['kind']): Shelved {
  const entry = first(kind);
  expect(entry, `the registry shelves at least one ${kind}`).toBeDefined();
  return entry as Shelved;
}

function requireContentBlueprint(kind: 'deck' | 'page' | 'doc'): Shelved {
  const entry = shelved.find((item) => item.kind === 'blueprint' && item.blueprintKind === kind);
  expect(entry, `the registry shelves a ${kind} blueprint`).toBeDefined();
  return entry as Shelved;
}

const hasPublishedContentBlueprints = (['deck', 'page', 'doc'] as const).every((kind) =>
  shelved.some((item) => item.kind === 'blueprint' && item.blueprintKind === kind)
);

async function openMarketplace(page: Page, search = '') {
  await page.goto(`/marketplace/${search}`);
  await expect(
    page.locator('section[aria-labelledby="market-browse-title"][data-hydrated="true"]')
  ).toHaveCount(1);
}

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow, `${label}: horizontal overflow`).toBeLessThanOrEqual(0);
}

test.describe('marketplace', () => {
  test.skip(shelved.length === 0, 'no catalog entries indexed');

  test('shows every shelved item in category rails', async ({ page }) => {
    await openMarketplace(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Start from a product that already works.'
    );
    await expect(page.getByTestId('market-rail')).toHaveCount(categories.size);
    await expect(page.getByTestId('market-card')).toHaveCount(shelved.length);
    for (const kind of ['prototype', 'template', 'blueprint'] as const) {
      const expected = shelved.filter((e) => e.kind === kind).length;
      await expect(page.locator(`[data-testid="market-card"][data-kind="${kind}"]`)).toHaveCount(
        expected
      );
    }
  });

  test('search, feature filters and kind compose and survive a reload through the URL', async ({
    page,
  }) => {
    await openMarketplace(page);
    // Only the most common features get a chip: use the first one a template has.
    const chips = page.getByRole('group', { name: 'Features' }).getByRole('button');
    const labels = (await chips.allTextContents()).map((t) => t.trim().split(/\s+/)[0] ?? '');
    const index = labels.findIndex((label) =>
      shelved.some((e) => e.kind === 'template' && e.catalog?.features?.includes(label))
    );
    expect(
      index,
      `a feature chip shared by a template (chips: ${labels.join(', ')})`
    ).toBeGreaterThanOrEqual(0);
    const chip = chips.nth(index);
    const feature = labels[index] ?? '';
    const target = shelved.find(
      (e) => e.kind === 'template' && e.catalog?.features?.includes(feature)
    ) as Shelved;

    await chip.click();
    await expect(page).toHaveURL(new RegExp(`[?&]feature=${feature}`));
    const withFeature = shelved.filter((e) => e.catalog?.features?.includes(feature)).length;
    await expect(page.getByTestId('market-count')).toHaveText(
      `${withFeature} ${withFeature === 1 ? 'result' : 'results'}`
    );

    await page
      .getByRole('group', { name: 'Source type' })
      .getByRole('button', { name: /^Templates/ })
      .click();
    await page.getByTestId('market-search').fill(target.name);
    const results = page.getByTestId('market-results').getByTestId('market-card');
    await expect(results.first()).toHaveAttribute('data-slug', target.slug);
    await expect(page).toHaveURL(/[?&]kind=template/);
    await expect(page).toHaveURL(/[?&]q=/);

    await page.reload();
    await expect(
      page.locator('section[aria-labelledby="market-browse-title"][data-hydrated="true"]')
    ).toHaveCount(1);
    await expect(page.getByTestId('market-search')).toHaveValue(target.name);
    await expect(
      page.getByTestId('market-results').getByTestId('market-card').first()
    ).toHaveAttribute('data-slug', target.slug);
  });

  test('explains an empty result and restores everything', async ({ page }) => {
    await openMarketplace(page);
    await page.getByTestId('market-search').fill('zz-no-such-product-zz');
    await expect(page.getByTestId('market-count')).toHaveText('No matches');
    await expect(page.getByText('Nothing matches these filters')).toBeVisible();
    await page.getByRole('button', { name: 'Show everything' }).click();
    await expect(page.getByTestId('market-rail')).toHaveCount(categories.size);
    await expect(page).toHaveURL(/\/marketplace\/?$/);
  });

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

  test('opens each content-kind blueprint in the hosted player from its detail page', async ({
    page,
  }) => {
    test.skip(
      !hasPublishedContentBlueprints,
      'the kind examples are not published in the marketplace until they have catalog metadata'
    );
    const labels = { deck: 'Deck', page: 'Page', doc: 'Document' } as const;
    for (const kind of ['deck', 'page', 'doc'] as const) {
      const entry = requireContentBlueprint(kind);
      await page.goto(`/marketplace/blueprint/${entry.slug}/`);
      await expect(page.getByTestId('market-detail-title')).toHaveText(entry.name);
      await expect(
        page.getByText(
          `A ${labels[kind].toLowerCase()} blueprint: validated and ready to open in the player.`
        )
      ).toBeVisible();

      const action = page.getByTestId('open-in-player');
      await expect(action).toHaveText(`Open ${labels[kind]} in player`);
      await expect(action).toHaveAttribute('href', /\/play\/#bp=1\./);
      await action.click();
      await expect(page).toHaveURL(/\/play\/#bp=1\./);
      await expect(page.getByRole('heading', { name: 'Play a blueprint' })).toBeVisible();
      await expect(page.locator('iframe[title="Running Protoyard prototype"]')).toHaveAttribute(
        'src',
        /\/player\/\?embedder=[^#]+#bp=1\./
      );
    }
  });

  test('read-only: Try it shows the dev command and Use this template the exact CLI command', async ({
    page,
  }) => {
    const template = requireFirst('template');
    await page.goto(`/marketplace/template/${template.slug}/`);
    await expect(
      page.locator('section[aria-labelledby="create-title"][data-hydrated="true"]')
    ).toHaveCount(1);

    // Try it: no local control server on a static host, so the preview offers the command.
    const preview = page.locator('section[aria-labelledby="preview-title"]');
    await preview.scrollIntoViewIfNeeded();
    await expect(page.getByTestId('control-status')).toContainText(
      `pnpm protoyard dev ${template.slug}`
    );

    // Use this template: the slug is suggested from the name; the command is exact.
    const create = page.locator('section[aria-labelledby="create-title"]');
    await create.getByLabel('Name', { exact: true }).fill('Team Help Desk');
    await create.getByLabel('Name', { exact: true }).blur();
    await expect(create.getByTestId('create-slug')).toHaveValue('team-help-desk');
    await expect(
      create.getByText(
        `pnpm protoyard new team-help-desk --from ${template.slug} --name 'Team Help Desk'`
      )
    ).toBeVisible();
    await expect(create.getByTestId('create-submit')).toHaveCount(0);
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`has no axe violations in ${scheme} mode`, async ({ page }, testInfo) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await openMarketplace(page);
      await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);
      await expectAccessible(page, testInfo, { label: `marketplace-${scheme}` });

      const template = requireFirst('template');
      await page.goto(`/marketplace/template/${template.slug}/`);
      await expect(
        page.locator('section[aria-labelledby="create-title"][data-hydrated="true"]')
      ).toHaveCount(1);
      await expectAccessible(page, testInfo, { label: `marketplace-detail-${scheme}` });
    });
  }

  test('cards show their default theme; the Theme facet filters by collection through the URL', async ({
    page,
  }) => {
    await openMarketplace(page);
    await expect(page.getByTestId('market-theme').first()).toContainText('Theme:');
    const select = page.getByTestId('market-collection');
    const options = await select
      .locator('option')
      .evaluateAll((nodes) =>
        nodes.map((node) => [(node as HTMLOptionElement).value, node.textContent ?? ''])
      );
    const [value, text] = options.find(([v]) => v !== '') ?? ['', ''];
    expect(value, 'at least one theme collection is shelved').not.toBe('');
    const count = Number(/\((\d+)\)/.exec(text)?.[1]);
    await select.selectOption(value);
    await expect(page).toHaveURL(new RegExp(`collection=${value}`));
    await expect(page.getByTestId('market-results').getByTestId('market-card')).toHaveCount(count);
    await page.reload();
    await expect(page.getByTestId('market-collection')).toHaveValue(value);
    await expect(page.getByTestId('market-results').getByTestId('market-card')).toHaveCount(count);
  });

  test('Try in theme opens the detail page with the demo in that theme', async ({ page }) => {
    const template = requireFirst('template');
    await openMarketplace(page, `?kind=template&q=${encodeURIComponent(template.name)}`);
    const card = page.getByTestId('market-results').locator(`[data-slug="${template.slug}"]`);
    await card.getByText('Try in theme').click();
    const option = card
      .getByRole('list', { name: /in another theme/ })
      .getByRole('link')
      .first();
    const href = (await option.getAttribute('href')) ?? '';
    const themeId = /[?&]theme=([a-z0-9-]+)/.exec(href)?.[1] ?? '';
    expect(themeId, 'a library theme id in the link').not.toBe('');
    await option.click();
    await expect(page).toHaveURL(
      new RegExp(`/marketplace/template/${template.slug}/\\?theme=${themeId}$`)
    );
    // The live preview hydrates when visible (client:visible).
    await page.locator('section[aria-labelledby="preview-title"]').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('preview-theme')).toContainText(themeId);
    await page.getByRole('link', { name: 'Use its default theme' }).click();
    await expect(page).toHaveURL(new RegExp(`/marketplace/template/${template.slug}/$`));
    await expect(page.getByTestId('preview-theme')).toHaveCount(0);
  });

  test('has no horizontal overflow at 390 px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openMarketplace(page);
    await expectNoHorizontalOverflow(page, '/marketplace/');
    const template = requireFirst('template');
    await page.goto(`/marketplace/template/${template.slug}/`);
    await expect(page.getByTestId('market-detail-title')).toBeVisible();
    await expectNoHorizontalOverflow(page, `/marketplace/template/${template.slug}/`);
  });
});

test.describe('marketplace on the showcase site', () => {
  test.skip(process.env.PROTOYARD_E2E_SHOWCASE !== '1', 'set PROTOYARD_E2E_SHOWCASE=1');
  const origin = `http://127.0.0.1:${process.env.PROTOYARD_E2E_SHOWCASE_PORT ?? 4501}`;
  const base = process.env.PROTOYARD_E2E_SHOWCASE_BASE ?? '/';

  test('Try it plays the bundled template demo inside its frame', async ({ page }) => {
    const template =
      shelved.find((e) => e.kind === 'template' && e.slug === 'chat-widget') ??
      requireFirst('template');
    await page.goto(`${origin}${base}marketplace/template/${template.slug}/`);
    const preview = page.locator('section[aria-labelledby="preview-title"]');
    await preview.scrollIntoViewIfNeeded();
    await expect(page.getByTestId('control-status')).toContainText('Live demo');
    const frame = page.frameLocator(`iframe[title^="${template.name} preview"]`);
    await waitForPrototypeReady(page, { slug: template.slug, root: frame, timeoutMs: 20_000 });
    // The demo runs in its own demo namespace, never the template's authoring one.
    const demo = page.frames().find((f) => f.url().includes(`/t/${template.slug}/app/`));
    expect(demo, 'the bundled demo frame').toBeDefined();
    const databases = await demo?.evaluate(async () =>
      (await indexedDB.databases()).map((d) => d.name)
    );
    expect(databases).toContain(`protoyard.template-demo-${template.slug}.data`);
  });

  test('a ?theme= link plays the bundled demo in that library theme', async ({ page }) => {
    const template =
      shelved.find((e) => e.kind === 'template' && e.slug === 'chat-widget') ??
      requireFirst('template');
    await page.goto(`${origin}${base}marketplace/template/${template.slug}/?theme=gaming-neon`);
    await page.locator('section[aria-labelledby="preview-title"]').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('preview-theme')).toContainText('gaming-neon');
    const iframe = page.locator(`iframe[title^="${template.name} preview"]`);
    await expect(iframe).toHaveAttribute('src', /[?&]theme=gaming-neon/);
    const frame = page.frameLocator(`iframe[title^="${template.name} preview"]`);
    await waitForPrototypeReady(page, { slug: template.slug, root: frame, timeoutMs: 20_000 });
    await expect(frame.locator('[data-py-theme]').first()).toHaveAttribute(
      'data-py-theme',
      'gaming-neon'
    );
  });
});
