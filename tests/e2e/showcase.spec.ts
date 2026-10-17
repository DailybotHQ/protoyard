import { expect, type FrameLocator, test } from '@playwright/test';
import { expectAccessible } from './support/a11y.ts';

/**
 * The hosted showcase (`protoyard showcase`): the gallery's live preview
 * frames the bundled crm-demo build with no local control server, and data
 * created inside the iframe persists (IndexedDB) across a reload.
 *
 * PROTOYARD_E2E_SHOWCASE_BASE=/protoyard/ runs the same checks under a
 * GitHub Pages-style sub-path.
 */
const ORIGIN = 'http://127.0.0.1:4501';
const BASE = process.env.PROTOYARD_E2E_SHOWCASE_BASE ?? '/';
const SITE = `${ORIGIN}${BASE}`;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test.describe('showcase site', () => {
  test.skip(process.env.PROTOYARD_E2E_SHOWCASE !== '1', 'set PROTOYARD_E2E_SHOWCASE=1');

  test('opens a card, previews the bundled CRM and keeps data after reload', async ({ page }) => {
    await page.goto(SITE);
    await expect(page.locator('#browse[data-hydrated="true"]')).toHaveCount(1);
    await page.getByTestId('search').fill('crm-demo');
    await page.locator('[data-testid="results"] [data-slug="crm-demo"] h3 a').click();
    await expect(page).toHaveURL(new RegExp(`${escapeRe(BASE)}p/crm-demo/?$`));
    await expect(page.getByTestId('control-status')).toContainText('Live demo');

    const app = page.frameLocator('iframe[title^="Pipeline CRM preview"]');
    await expect(app.locator('html')).toHaveAttribute('data-py-ready', 'true', { timeout: 20_000 });

    // A real write through the CRM's own UI and services.
    const name = `Showcase Probe ${test.info().project.name}`;
    await app.getByRole('link', { name: 'Companies' }).first().click();
    await app.getByRole('button', { name: 'New company' }).click();
    const dialog = app.getByRole('dialog');
    await dialog.getByLabel('Name').fill(name);
    await dialog.getByLabel('Website domain').fill('probe.example');
    await dialog.getByLabel('Employees').fill('12');
    // Enter submits the form; inside a scaled preview the button can sit below the fold.
    await dialog.getByLabel('Employees').press('Enter');
    await expect(app.getByText(name).first()).toBeVisible();

    // Reload the framed app only: data must come back from IndexedDB.
    await page
      .getByTestId('control-status')
      .getByRole('button', { name: 'Reload', exact: true })
      .click();
    await expect(app.locator('html')).toHaveAttribute('data-py-ready', 'true', { timeout: 20_000 });
    await app.getByRole('link', { name: 'Companies' }).first().click();
    // The list is paginated and sorted; search for the probe like a user would.
    await app.getByRole('searchbox', { name: 'Search Companies' }).fill('Showcase Probe');
    await expect(app.getByText(name).first()).toBeVisible();
  });

  test('scenario links open the bundled build with ?scenario=', async ({ page }) => {
    await page.goto(`${SITE}p/crm-demo/`);
    const link = page.getByTestId('scenarios').getByRole('link').first();
    await expect(link).toHaveAttribute(
      'href',
      new RegExp(`^${escapeRe(BASE)}p/crm-demo/app/\\?scenario=`)
    );
    const response = await page.request.get(
      new URL((await link.getAttribute('href')) ?? '', ORIGIN).toString()
    );
    expect(response.ok()).toBe(true);
  });

  test('thumbnails and assets resolve under the base path', async ({ page }) => {
    const failed: string[] = [];
    page.on('response', (r) => {
      if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
    });
    await page.goto(SITE);
    await expect(page.locator('#browse[data-hydrated="true"]')).toHaveCount(1);
    await page.waitForLoadState('networkidle');
    expect(failed).toEqual([]);
  });

  test('compare scenarios: sandboxed frames never touch each other or the default world', async ({
    page,
  }, testInfo) => {
    const ready = (frame: FrameLocator) =>
      expect(frame.locator('html')).toHaveAttribute('data-py-ready', 'true', { timeout: 20_000 });
    const searchCompanies = async (frame: FrameLocator, text: string) => {
      await frame.getByRole('link', { name: 'Companies' }).first().click();
      await frame.getByRole('searchbox', { name: 'Search Companies' }).fill(text);
    };

    await page.goto(`${SITE}p/crm-demo/`);
    await page.getByTestId('compare-link').click();
    await expect(page).toHaveURL(new RegExp(`${escapeRe(BASE)}p/crm-demo/compare/`));
    await expect(page.locator('[data-testid="compare"][data-hydrated="true"]')).toHaveCount(1);
    const a = page.frameLocator('[data-testid="compare-pane-a"] iframe');
    const b = page.frameLocator('[data-testid="compare-pane-b"] iframe');
    await ready(a);
    await ready(b);
    await expectAccessible(page, testInfo, { label: 'compare' });

    // Both frames on the SAME scenario, so only the sandbox separates them.
    await page.getByTestId('compare-scenario-b').selectOption('growing-team');
    await expect(page).toHaveURL(/[?&]b=growing-team/);
    await ready(b);

    const name = `Compare Probe ${testInfo.project.name}`;
    await a.getByRole('link', { name: 'Companies' }).first().click();
    await a.getByRole('button', { name: 'New company' }).click();
    const dialog = a.getByRole('dialog');
    await dialog.getByLabel('Name').fill(name);
    await dialog.getByLabel('Website domain').fill('compare.example');
    await dialog.getByLabel('Employees').fill('7');
    await dialog.getByLabel('Employees').press('Enter');
    await expect(a.getByRole('heading', { level: 1, name })).toBeVisible();

    await searchCompanies(b, 'Compare Probe');
    await expect(b.getByRole('row', { name: /^Open Compare Probe/ })).toHaveCount(0);
    await expect(b.getByText('18 accounts')).toBeVisible();

    // The prototype's default (non-sandboxed) world is untouched too.
    const app = await page.context().newPage();
    await app.goto(`${SITE}p/crm-demo/app/#/companies`);
    await expect(app.locator('html')).toHaveAttribute('data-py-ready', 'true', { timeout: 20_000 });
    await app.getByRole('searchbox', { name: 'Search Companies' }).fill('Compare Probe');
    await expect(app.getByRole('row', { name: /^Open Compare Probe/ })).toHaveCount(0);
    await app.close();

    // Reset: fresh sandbox names, so frame A re-seeds without the probe.
    await page.getByTestId('compare-reset').click();
    await expect(page.locator('[data-testid="compare-pane-a"] iframe')).toHaveAttribute(
      'data-sandbox',
      'compare-a-1'
    );
    await expect(page).toHaveURL(/[?&]gen=1/);
    await ready(a);
    await searchCompanies(a, 'Compare Probe');
    await expect(a.getByRole('row', { name: /^Open Compare Probe/ })).toHaveCount(0);
  });
});
