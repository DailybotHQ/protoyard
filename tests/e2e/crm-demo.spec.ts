import { expect, type Page, test } from '@playwright/test';
import { PROTOTYPE_TARGETS, prototypeUrl } from './targets.ts';

/**
 * Pipeline CRM against its STATIC production build (served by
 * `protoyard preview`, DevTools excluded, no dev server). Each test gets a
 * fresh browser context, so a fresh IndexedDB. The runtime handle
 * (`window.__protoyard`) is used for setup the standalone build has no UI for
 * (persona switch, theme override, snapshots, ids); assertions go through the UI.
 */
const SLUG = 'crm-demo';
test.skip(!PROTOTYPE_TARGETS.includes(SLUG), `set PROTOYARD_E2E_PROTOTYPES to include ${SLUG}`);

type Runtime = {
  session: { switchActor(id: string): Promise<void> };
  theme: {
    themes(): readonly { id: string }[];
    setOverride(patch: { themeId?: string; mode?: 'light' | 'dark' }): Promise<void>;
  };
  snapshots: {
    save(i: { name: string }): Promise<{ id: string }>;
    restore(id: string): Promise<void>;
  };
  data: {
    counts(): Promise<Record<string, number>>;
    rows(table: string, o?: { limit?: number }): Promise<Record<string, unknown>[]>;
  };
};
declare global {
  interface Window {
    __protoyard?: Runtime;
  }
}

async function openApp(page: Page, hash = '', scenario = 'growing-team') {
  await page.goto(`${prototypeUrl(SLUG)}?scenario=${scenario}${hash}`);
  await expect(page.locator('html')).toHaveAttribute('data-py-ready', 'true', { timeout: 15_000 });
}
const counts = (page: Page) => page.evaluate(() => window.__protoyard?.data.counts());
const toast = (page: Page, text: string) => page.getByText(text, { exact: true }).first();

/** Clicks a sidebar section link; on phones it first opens the drawer ("Open navigation"). */
async function navTo(page: Page, label: string) {
  const link = page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('link', { name: label });
  if (!(await link.isVisible()))
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await link.click();
}

async function createCompany(page: Page, name: string) {
  await page.getByRole('button', { name: 'New company' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByLabel('Website domain').fill('probe.example');
  await dialog.getByLabel('Employees').fill('12');
  await dialog.getByRole('button', { name: 'Create company' }).click();
  return dialog;
}

test.describe('Pipeline CRM (static build)', () => {
  test('section navigation and the role label are reachable on phones', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'phone layout only');
    await openApp(page, '#/', 'viewer-view');
    await page.getByRole('button', { name: 'Open navigation' }).click();
    const nav = page.getByRole('navigation', { name: 'Sections' });
    await expect(nav.getByRole('link', { name: 'Companies' })).toBeVisible();
    // The persona's role label lives in the drawer too.
    const drawer = page.getByRole('dialog', { name: 'Main navigation' });
    await expect(drawer.getByText('Viewer', { exact: true })).toBeVisible();
    await nav.getByRole('link', { name: 'Companies' }).click();
    await expect(page).toHaveURL(/#\/companies$/);
    // Selecting a link closes the drawer.
    await expect(nav.getByRole('link', { name: 'Companies' })).toBeHidden();
  });

  test('flow 9: the standalone build runs with no dev server', async ({ page }) => {
    const response = await page.goto(prototypeUrl(SLUG));
    expect(response?.ok()).toBe(true);
    await expect(page.locator('html')).toHaveAttribute('data-py-ready', 'true', {
      timeout: 15_000,
    });
    // A production bundle: no Vite client, no HMR socket.
    expect(await page.locator('script[src*="@vite/client"]').count()).toBe(0);
    await navTo(page, 'Pipeline');
    await expect(page).toHaveURL(/#\/pipeline$/);
  });

  test('flow 2: create, edit and delete a company, persisted across reloads', async ({ page }) => {
    await openApp(page, '#/companies');
    await createCompany(page, 'E2E Robotics');
    await expect(toast(page, 'Company created')).toBeVisible();
    await expect(page).toHaveURL(/#\/companies\/[^/]+$/);
    await expect(page.getByRole('heading', { level: 1, name: 'E2E Robotics' })).toBeVisible();

    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const edit = page.getByRole('dialog');
    await edit.getByLabel('Name').fill('E2E Robotics Renamed');
    await edit.getByRole('button', { name: 'Save changes' }).click();
    await expect(toast(page, 'Company updated')).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('heading', { level: 1, name: 'E2E Robotics Renamed' })
    ).toBeVisible();

    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete company' }).click();
    await expect(toast(page, 'Company deleted')).toBeVisible();
    await expect(page).toHaveURL(/#\/companies$/);
    await page.reload();
    await page.getByRole('searchbox', { name: 'Search Companies' }).fill('E2E Robotics');
    await expect(page.getByRole('row', { name: /^Open E2E Robotics/ })).toHaveCount(0);
  });

  test('flow 3: a new-company scenario shows the onboarding empty state', async ({ page }) => {
    await openApp(page, '#/', 'new-company');
    await expect(page.getByText('Your pipeline is empty')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add your first company' })).toBeVisible();
    await page.goto(`${prototypeUrl(SLUG)}#/companies`);
    await expect(page.getByText('No companies yet')).toBeVisible();
  });

  test('flow 4: an established scenario shows populated records', async ({ page }) => {
    await openApp(page, '#/');
    await expect(page.getByRole('region', { name: 'Key metrics' })).toBeVisible();
    await navTo(page, 'Companies');
    await expect(page.getByText('18 accounts')).toBeVisible();
    await expect(page.getByRole('row', { name: /^Open / }).first()).toBeVisible();
  });

  test('flow 5: switching admin → viewer blocks writes without touching records', async ({
    page,
    isMobile,
  }) => {
    await openApp(page, '#/companies', 'admin-view');
    await expect(page.getByRole('button', { name: 'New company' })).toBeVisible();
    await page
      .getByRole('row', { name: /^Open / })
      .first()
      .click();
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeVisible();
    const before = await counts(page);

    await page.evaluate(() => window.__protoyard?.session.switchActor('user_0004'));
    if (isMobile) await page.getByRole('button', { name: 'Open navigation' }).click();
    // On phones the visible role label is the drawer's copy (the sidebar one is hidden).
    const roleScope = isMobile ? page.getByRole('dialog', { name: 'Main navigation' }) : page;
    await expect(roleScope.getByText('Viewer', { exact: true }).first()).toBeVisible();
    if (isMobile) await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
    await page.goto(`${prototypeUrl(SLUG)}#/companies`);
    await expect(page.getByRole('button', { name: 'New company' })).toHaveCount(0);
    await expect(page.getByText('18 accounts')).toBeVisible();
    expect(await counts(page)).toEqual(before);
  });

  test('flow 6: dark mode and another theme preset apply live; records persist', async ({
    page,
  }) => {
    await openApp(page, '#/companies');
    await page.evaluate(() => window.__protoyard?.theme.setOverride({ mode: 'light' }));
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-py-mode', 'light');
    const primary = () =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--py-primary').trim()
      );
    const theme = await html.getAttribute('data-py-theme');
    const lightPrimary = await primary();

    await page.evaluate(() => window.__protoyard?.theme.setOverride({ mode: 'dark' }));
    await expect(html).toHaveAttribute('data-py-mode', 'dark');
    await expect(html).toHaveClass(/\bdark\b/);
    expect(await primary()).not.toBe(lightPrimary);

    const other = await page.evaluate(
      (current) => window.__protoyard?.theme.themes().find((t) => t.id !== current)?.id,
      theme
    );
    expect(other).toBeTruthy();
    await page.evaluate((id) => window.__protoyard?.theme.setOverride({ themeId: id }), other);
    await expect(html).toHaveAttribute('data-py-theme', other ?? '');
    await expect(page.getByText('18 accounts')).toBeVisible();
    await page.reload();
    await expect(html).toHaveAttribute('data-py-theme', other ?? '');
    await expect(page.getByText('18 accounts')).toBeVisible();
  });

  test('flow 7: a snapshot restores the exact earlier state', async ({ page }) => {
    await openApp(page, '#/companies');
    const before = await counts(page);
    const snapshotId = await page.evaluate(
      async () => (await window.__protoyard?.snapshots.save({ name: 'before probe' }))?.id
    );
    expect(snapshotId).toBeTruthy();

    await createCompany(page, 'Snapshot Probe');
    await expect(page.getByRole('heading', { level: 1, name: 'Snapshot Probe' })).toBeVisible();
    expect((await counts(page))?.companies).toBe((before?.companies ?? 0) + 1);

    await page.evaluate((id) => window.__protoyard?.snapshots.restore(id ?? ''), snapshotId);
    await page.goto(`${prototypeUrl(SLUG)}#/companies`);
    await expect(page.getByText('18 accounts')).toBeVisible();
    await page.getByRole('searchbox', { name: 'Search Companies' }).fill('Snapshot Probe');
    await expect(page.getByRole('row', { name: /^Open Snapshot Probe/ })).toHaveCount(0);
    expect(await counts(page)).toEqual(before);
  });

  test('flow 11: deep links, back navigation and a refresh of a nested route', async ({ page }) => {
    await openApp(page, '#/');
    const deal = await page.evaluate(
      async () => (await window.__protoyard?.data.rows('deals', { limit: 1 }))?.[0]
    );
    const id = String(deal?.id ?? '');
    const title = String(deal?.title ?? '');
    expect(id).not.toBe('');

    await page.goto(`${prototypeUrl(SLUG)}#/deals/${id}`);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await navTo(page, 'Companies');
    await expect(page).toHaveURL(/#\/companies$/);
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`#/deals/${id}$`));
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-py-ready', 'true');
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await page.goto(`${prototypeUrl(SLUG)}#/deals/does-not-exist`);
    await expect(page.getByText('Deal not found')).toBeVisible();
  });

  test('flow 12: saving while offline shows feedback and saves nothing', async ({ page }) => {
    await openApp(page, '#/companies', 'offline-mode');
    const before = await counts(page);
    const dialog = await createCompany(page, 'Offline Probe');
    await expect(toast(page, 'You are offline')).toBeVisible();
    await expect(page.getByText('Changes were not saved', { exact: false }).first()).toBeVisible();
    await expect(dialog).toBeVisible();
    expect(await counts(page)).toEqual(before);
    await page.reload();
    await page.getByRole('searchbox', { name: 'Search Companies' }).fill('Offline Probe');
    await expect(page.getByRole('row', { name: /^Open Offline Probe/ })).toHaveCount(0);
  });
});
