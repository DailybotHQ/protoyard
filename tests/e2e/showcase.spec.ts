import { expect, test } from '@playwright/test';

/**
 * The hosted showcase (`protoyard showcase`): the gallery's live preview
 * frames the bundled crm-demo build with no local control server, and data
 * created inside the iframe persists (IndexedDB) across a reload.
 */
const SHOWCASE = 'http://127.0.0.1:4501';

test.describe('showcase site', () => {
  test.skip(process.env.PROTOYARD_E2E_SHOWCASE !== '1', 'set PROTOYARD_E2E_SHOWCASE=1');

  test('opens a card, previews the bundled CRM and keeps data after reload', async ({ page }) => {
    await page.goto(`${SHOWCASE}/`);
    await expect(page.locator('#browse[data-hydrated="true"]')).toHaveCount(1);
    await page.getByTestId('search').fill('crm-demo');
    await page.locator('[data-testid="results"] [data-slug="crm-demo"] h3 a').click();
    await expect(page).toHaveURL(/\/p\/crm-demo\/?$/);
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
    await page.goto(`${SHOWCASE}/p/crm-demo/`);
    const link = page.getByTestId('scenarios').getByRole('link').first();
    await expect(link).toHaveAttribute('href', /\/p\/crm-demo\/app\/\?scenario=/);
    const response = await page.request.get(
      new URL((await link.getAttribute('href')) ?? '', SHOWCASE).toString()
    );
    expect(response.ok()).toBe(true);
  });
});
