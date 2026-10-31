import { expect, type Page, test } from '@playwright/test';
import { expectAccessible } from './support/a11y.ts';
import { waitForPrototypeReady } from './support/ready.ts';
import { chooseOption } from './support/select.ts';
import { PEBBLESTAT_DEMO, PROTOTYPE_TARGETS, prototypeUrl } from './targets.ts';

/**
 * Pebblestat Analytics against its STATIC production build (served by
 * `protoyard preview`, DevTools excluded). Each test gets a fresh browser
 * context, so a fresh IndexedDB. The runtime handle (`window.__protoyard`)
 * does the setup the standalone build has no UI for (persona switch, row
 * reads); every assertion about behavior goes through the UI.
 */
const SLUG = PEBBLESTAT_DEMO;
test.skip(!PROTOTYPE_TARGETS.includes(SLUG), `set PROTOYARD_E2E_PROTOTYPES to include ${SLUG}`);

type Runtime = {
  session: { switchActor(id: string): Promise<void> };
  data: { rows(table: string, o?: { limit?: number }): Promise<Record<string, unknown>[]> };
};
declare global {
  interface Window {
    __protoyard?: Runtime;
  }
}

const OWNER = 'user_0001';
const ANALYST = 'user_0002';
const VIEWER = 'user_0003';

async function openApp(page: Page, hash = '#/', scenario = 'healthy-growth') {
  await page.goto(`${prototypeUrl(SLUG)}?scenario=${scenario}${hash}`);
  await waitForPrototypeReady(page, { slug: SLUG });
}
const actAs = async (page: Page, id: string) => {
  await page.evaluate((persona) => window.__protoyard?.session.switchActor(persona), id);
};
const rows = (page: Page, table: string) =>
  page.evaluate((t) => window.__protoyard?.data.rows(t) ?? [], table);
/** Width (grid columns) of the "Events by type" widget in the stored Web dashboard. */
async function mixWidth(page: Page): Promise<number | undefined> {
  const dashboard = (await rows(page, 'dashboards')).find((d) => d.id === 'dashboard_proj_web');
  const layout = (dashboard?.layout ?? []) as { id: string; w: number }[];
  return layout.find((w) => w.id === 'w-mix')?.w;
}
/** A chart's focusable plot (`role="group"` with the chart title first in its name). */
const plot = (page: Page, title: RegExp) => page.getByRole('group', { name: title }).first();

/**
 * Opens the date range: the popover picker on wide screens, the bottom sheet on phones.
 * Both show the same panel, found by its groups ("Preset ranges", "Compare to").
 */
async function openRange(page: Page, isMobile: boolean) {
  const main = page.locator('#main-content');
  if (isMobile) await main.getByRole('button', { name: /^Last (30|7) days/ }).click();
  else await main.getByRole('button', { name: /^Date range:/ }).click();
  const presets = page.getByRole('group', { name: 'Preset ranges' });
  await expect(presets).toBeVisible();
  return { presets, compare: page.getByRole('group', { name: 'Compare to' }) };
}

test.describe('Pebblestat Analytics (static build)', () => {
  test('Insights: change the range, compare with the previous period, read it as a table', async ({
    page,
    isMobile,
  }, testInfo) => {
    await openApp(page, '#/trends');
    const chart = plot(page, /^Events\./);
    await expect(chart).toBeVisible();
    // The default range compares with the previous period: a dashed series is drawn.
    // ChartRoot is [data-py-chart]; Texuli's figure/figcaption live inside it.
    const figure = page
      .locator('[data-py-chart]')
      .filter({ has: page.locator('figcaption', { hasText: /^Events/ }) });
    await expect(figure.locator('[data-series="previous"]')).toHaveCount(1);

    let panel = await openRange(page, isMobile);
    await panel.presets.getByRole('button', { name: 'Last 7 days' }).click();
    // A new range closes the picker (popover or bottom sheet).
    await expect(panel.presets).toBeHidden();
    await expect(
      page
        .locator('#main-content')
        .getByRole('button', { name: isMobile ? /^Last 7 days/ : /^Date range: Last 7 days/ })
    ).toBeVisible();

    // Turning the comparison off removes the dashed series; a comparison change keeps the panel open.
    panel = await openRange(page, isMobile);
    await panel.compare.getByRole('button', { name: 'No comparison' }).click();
    await page.keyboard.press('Escape');
    await expect(panel.presets).toBeHidden();
    await expect(figure.locator('[data-series="previous"]')).toHaveCount(0);

    // Texuli disclosure: label swaps Show ↔ Hide; track via data-chart-table-toggle.
    const tableToggle = figure.locator('[data-chart-table-toggle]');
    await expect(tableToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(tableToggle).toHaveText('Show data table');
    await tableToggle.click();
    await expect(tableToggle).toHaveAttribute('aria-expanded', 'true');
    await expect(tableToggle).toHaveText('Hide data table');
    await expect(figure.getByRole('table')).toBeVisible();
    await expect(figure.getByRole('table').getByRole('row')).toHaveCount(8); // header + 7 days
    await expectAccessible(page, testInfo, { include: 'main', label: 'insights' });
  });

  test('a saved segment persists across a reload', async ({ page, isMobile }) => {
    test.skip(isMobile, 'filter editing is covered on desktop');
    await openApp(page, '#/trends');
    // The filter builder is Texuli's (native selects; Plan shows its option labels).
    await page.getByRole('button', { name: 'Add condition' }).first().click();
    await chooseOption(page, page.getByLabel('Field', { exact: true }).last(), 'Plan');
    const value = page.getByLabel('Value', { exact: true }).last();
    const valueTag = await value.evaluate((el) => el.tagName);
    if (valueTag === 'INPUT' || valueTag === 'TEXTAREA') await value.fill('team');
    else await chooseOption(page, value, 'Team');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await page.getByLabel('Save current filter as a segment').fill('Team plan (e2e)');
    await page.getByRole('button', { name: 'Save segment' }).click();
    await expect(page.getByText('Saved “Team plan (e2e)”')).toBeVisible();

    await page.reload();
    await waitForPrototypeReady(page, { slug: SLUG });
    await expect(
      page
        .getByRole('group', { name: 'Saved segments' })
        .getByRole('button', { name: /Team plan \(e2e\)/ })
    ).toBeVisible();
    const saved = (await rows(page, 'segments')).find((s) => s.name === 'Team plan (e2e)');
    expect(saved).toMatchObject({ ownerId: OWNER, projectId: 'proj_web' });
  });

  test('Users: a bar drills into the table, the hash keeps the path, a user opens', async ({
    page,
    isMobile,
  }) => {
    await openApp(page, '#/users');
    const chart = plot(page, /^Users by plan/);
    await expect(chart).toBeVisible();
    // Drill via a Texuli bar mark (data-series rect). The explorer overlay can
    // intercept pointer events; force reaches the mark under the hit target.
    const bar = page.locator('[data-py-chart] svg rect[data-series]').first();
    await expect(bar).toBeVisible({ timeout: 15_000 });
    await bar.click({ force: true });
    const crumbs = page.getByRole('navigation', { name: 'Drill path' });
    await expect(crumbs.locator('[aria-current="location"]')).toContainText('Plan:');
    await expect(page).toHaveURL(/#\/users\?drill=/);
    await expect(plot(page, /^Users by country/)).toBeVisible();

    await page.reload();
    await waitForPrototypeReady(page, { slug: SLUG });
    await expect(crumbs.locator('[aria-current="location"]')).toContainText('Plan:');
    const status = await crumbs.getByText(/of \d+ rows/).textContent();
    const [shown, total] = (status?.match(/\d+/g) ?? []).map(Number);
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThan(total ?? 0);

    await page.getByRole('table').getByRole('link').first().click();
    await expect(page).toHaveURL(/#\/users\/usr_/);
    await expect(page.getByRole('heading', { name: 'Activation' })).toBeVisible();
    await crumbs.waitFor({ state: 'detached' });
  });

  test('an analyst rearranges the dashboard and it persists; a viewer cannot edit', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'the grid editing controls are a desktop journey');
    await openApp(page, '#/');
    await actAs(page, ANALYST);
    await page.getByRole('button', { name: 'Edit layout' }).click();
    // Events by type sits at the right edge (x 8, w 4): it can narrow, not widen.
    await page.getByRole('button', { name: 'Narrower: Events by type' }).click();
    // Saving goes through the service; the grid stays busy until it settles.
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    await expect.poll(() => mixWidth(page)).toBe(3);
    await page.reload();
    await waitForPrototypeReady(page, { slug: SLUG });
    expect(await mixWidth(page)).toBe(3);

    await actAs(page, VIEWER);
    await expect(page.getByRole('button', { name: 'Edit layout' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Rename' })).toHaveCount(0);
    await page.getByRole('link', { name: /^Insights/ }).click();
    await expect(page.getByRole('button', { name: 'Save report' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Annotate' })).toHaveCount(0);
  });

  test('enterprise scale shows the sampled data honestly', async ({ page }, testInfo) => {
    await openApp(page, '#/', 'enterprise-scale');
    await expect(page.getByText(/^Sampled · 5 % of users$/)).toBeVisible();
    await expect(page.getByRole('article', { name: 'Active users (est.)' })).toBeVisible();
    await expect(page.getByRole('article', { name: 'Events' })).toContainText(/\d+(\.\d)?K/);
    await expectAccessible(page, testInfo, { include: 'main', label: 'overview-enterprise' });
  });
});
