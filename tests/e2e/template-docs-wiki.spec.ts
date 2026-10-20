import { expect, type Page, test } from '@playwright/test';
import { expectAccessible } from './support/a11y.ts';
import { waitForPrototypeReady } from './support/ready.ts';
import { PROTOTYPE_TARGETS, prototypeUrl } from './targets.ts';

/**
 * The docs-wiki template against its STATIC production build (served by
 * `protoyard preview`, DevTools excluded). Each test gets a fresh browser
 * context, so a fresh IndexedDB. The runtime handle (`window.__protoyard`)
 * reads rows for setup; behavior is asserted through the UI.
 */
const SLUG = 'docs-wiki';
test.skip(!PROTOTYPE_TARGETS.includes(SLUG), `set PROTOYARD_E2E_PROTOTYPES to include ${SLUG}`);

type Row = Record<string, unknown>;
type Runtime = {
  data: { rows(table: string, o?: { limit?: number; offset?: number }): Promise<Row[]> };
};
declare global {
  interface Window {
    __protoyard?: Runtime;
  }
}

async function open(page: Page, hash: string, scenario = 'active') {
  await page.goto(`${prototypeUrl(SLUG)}?scenario=${scenario}${hash}`);
  await waitForPrototypeReady(page, { slug: SLUG });
}
/** Every row of a table (the inspector API pages its reads, 50 rows by default). */
const rows = (page: Page, table: string) =>
  page.evaluate(async (t) => {
    const all: Record<string, unknown>[] = [];
    for (let offset = 0; ; offset += 200) {
      const chunk = (await window.__protoyard?.data.rows(t, { limit: 200, offset })) ?? [];
      all.push(...chunk);
      if (chunk.length < 200) return all;
    }
  }, table);
async function pageId(page: Page, title: string) {
  const row = (await rows(page, 'pages')).find((p) => p.title === title);
  if (!row) throw new Error(`the scenario has a page titled ${title}`);
  return row as { id: string; version: number; body: string };
}

test.describe('Docs wiki template (static build)', () => {
  test('an editor edits and saves a page, then restores the old version', async ({
    page,
  }, testInfo) => {
    await open(page, '#/');
    const target = await pageId(page, 'Code review');
    const v = Number(target.version);
    await page.goto(`${prototypeUrl(SLUG)}?scenario=active#/pages/${target.id}`);
    await waitForPrototypeReady(page, { slug: SLUG });
    await expect(page.locator('[data-page-meta]')).toContainText(`Version ${v}`);

    await page.getByRole('link', { name: 'Edit', exact: true }).click();
    const editor = page.getByRole('textbox', { name: 'Page content' });
    await editor.fill('# Code review\n\nEvery change needs **two approvals**.');
    // The split preview renders the Markdown as elements while typing.
    await expect(page.locator('strong', { hasText: 'two approvals' }).first()).toBeVisible();
    await expectAccessible(page, testInfo, { include: 'main', label: 'editor' });
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(page.locator('[data-page-meta]')).toContainText(`Version ${v + 1}`);
    const content = page.getByRole('region', { name: 'Page content' });
    await expect(content).toContainText('Every change needs two approvals.');
    await page.reload();
    await waitForPrototypeReady(page, { slug: SLUG });
    await expect(page.getByRole('region', { name: 'Page content' })).toContainText('two approvals');

    await page.getByRole('link', { name: 'History' }).click();
    await page.getByRole('button', { name: new RegExp(`^Version ${v},`) }).click();
    await page.getByRole('button', { name: `Restore version ${v}` }).click();
    await expect(
      page.getByRole('button', { name: new RegExp(`^Version ${v + 2}, Restored v${v}`) })
    ).toBeVisible();
    await expectAccessible(page, testInfo, { include: 'main', label: 'history' });

    const restored = await pageId(page, 'Code review');
    expect(restored).toMatchObject({ version: v + 2, body: target.body });
    const versions = (await rows(page, 'versions')).filter((r) => r.pageId === target.id);
    expect(versions).toHaveLength(v + 2);
  });

  test('hostile Markdown stays inert text', async ({ page }, testInfo) => {
    const dialogs: string[] = [];
    page.on('dialog', (d) => {
      dialogs.push(d.message());
      void d.dismiss();
    });
    await open(page, '#/');
    const hostile = await pageId(page, 'Markdown safety check');
    await page.goto(`${prototypeUrl(SLUG)}?scenario=active#/pages/${hostile.id}`);
    await waitForPrototypeReady(page, { slug: SLUG });
    const content = page.getByRole('region', { name: 'Page content' });
    await expect(content).toContainText('<script>alert("not today")</script>');
    await expect(content).toContainText('<img src="x" onerror="alert(1)">');
    await expect(content.locator('script, img, iframe, object, embed')).toHaveCount(0);
    const hrefs = await content
      .locator('a')
      .evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    expect(hrefs).toEqual(['https://example.com/handbook']);
    expect(dialogs).toEqual([]);
    await expectAccessible(page, testInfo, { include: 'main', label: 'safety-page' });
  });

  test('search finds pages by title and text, with highlighted matches', async ({
    page,
  }, testInfo) => {
    await open(page, '#/');
    await page.getByRole('searchbox', { name: 'Search pages' }).fill('safety check');
    await page.getByRole('button', { name: 'Search' }).click();
    const results = page.getByRole('list', { name: 'Search results' });
    await expect(results.getByRole('link', { name: 'Markdown safety check' })).toBeVisible();
    await expect(results.locator('mark', { hasText: /safety/i }).first()).toBeVisible();
    await expect(page).toHaveURL(/#\/search\?q=safety%20check/);
    await expectAccessible(page, testInfo, { include: 'main', label: 'search' });
    await results.getByRole('link', { name: 'Markdown safety check' }).click();
    await expect(
      page.getByRole('heading', { name: 'Markdown safety check', level: 1 })
    ).toBeVisible();

    await page.goto(`${prototypeUrl(SLUG)}?scenario=active#/search?q=zzqxv`);
    await waitForPrototypeReady(page, { slug: SLUG });
    await expect(page.getByText('No pages match “zzqxv”')).toBeVisible();
  });

  test('a new subpage appears under its parent in the tree', async ({ page }) => {
    await open(page, '#/');
    const parent = await pageId(page, 'Runbooks');
    await page.goto(`${prototypeUrl(SLUG)}?scenario=active#/pages/${parent.id}`);
    await waitForPrototypeReady(page, { slug: SLUG });
    await page.getByRole('button', { name: 'New subpage' }).click();
    await page.getByRole('dialog').getByLabel('Title').fill('Escalation policy');
    await page.getByRole('dialog').getByRole('button', { name: 'Create and edit' }).click();
    await expect(page.getByRole('heading', { name: 'Edit page' })).toBeVisible();
    await page
      .getByRole('textbox', { name: 'Page content' })
      .fill('# Escalation policy\n\nPage the on-call lead after 15 minutes.');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Escalation policy', level: 1 })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Runbooks');
    const item = page.getByRole('treeitem', { name: /Escalation policy/ });
    await expect(item).toBeVisible();
    const created = await pageId(page, 'Escalation policy');
    expect(created).toMatchObject({ version: 2 });
    expect((await rows(page, 'pages')).find((p) => p.id === created.id)?.parentId).toBe(parent.id);
  });

  test('a reader can read, search and see history, but not edit', async ({ page }, testInfo) => {
    await open(page, '#/', 'viewer');
    const target = await pageId(page, 'Time off');
    await page.goto(`${prototypeUrl(SLUG)}?scenario=viewer#/pages/${target.id}`);
    await waitForPrototypeReady(page, { slug: SLUG });
    await expect(page.getByRole('region', { name: 'Page content' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Edit', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'New subpage' })).toHaveCount(0);
    await page.getByRole('link', { name: 'History' }).click();
    await expect(page.getByRole('list', { name: 'Versions' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Restore version/ })).toHaveCount(0);
    await page.goto(`${prototypeUrl(SLUG)}?scenario=viewer#/pages/${target.id}/edit`);
    await waitForPrototypeReady(page, { slug: SLUG });
    await expect(
      page.getByText('Your role can read and search pages, but not edit them.')
    ).toBeVisible();
    await expectAccessible(page, testInfo, { include: 'main', label: 'viewer' });
  });
});
