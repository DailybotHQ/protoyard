import { expect, type Page, test } from '@playwright/test';
import { waitForPrototypeReady } from './support/ready.ts';
import { PROTOTYPE_TARGETS, prototypeUrl } from './targets.ts';

/**
 * Domain flows of Lumen Bank against its STATIC production build (DevTools
 * excluded): CRUD with reload persistence, a transfer (desktop and phone),
 * persona permissions and the phone layout. Each test gets a fresh browser context, so
 * a fresh IndexedDB. Persona switching uses the runtime handle the renderer
 * exposes (`window.__protoyard`) because the standalone build has no DevTools.
 */
const SLUG = 'mobile-banking-demo';
test.skip(!PROTOTYPE_TARGETS.includes(SLUG), `set PROTOYARD_E2E_PROTOTYPES to include ${SLUG}`);

type Runtime = {
  session: { switchActor(id: string): Promise<void> };
  snapshots: {
    save(i: { name: string }): Promise<{ id: string }>;
    restore(id: string): Promise<void>;
  };
  data: { counts(): Promise<Record<string, number>> };
  storage(): { backend: string };
};
declare global {
  interface Window {
    __protoyard?: Runtime;
  }
}

async function openApp(page: Page, hash = '', scenario = 'active-customer') {
  await page.goto(`${prototypeUrl(SLUG)}?scenario=${scenario}${hash}`);
  await waitForPrototypeReady(page, { slug: SLUG });
}
const counts = (page: Page) => page.evaluate(() => window.__protoyard?.data.counts());

test.describe('Lumen Bank (static build)', () => {
  test('creates and removes a payee, persisting across reloads', { tag: '@desktop' }, async ({
    page,
  }) => {
    await openApp(page, '#/payees');
    await page.getByRole('button', { name: 'Add payee' }).click();
    await page.getByLabel(/Full name/).fill('Robin Vale');
    await page.getByLabel(/Bank/).fill('Seabright Mutual');
    await page.getByLabel(/Last 4/).fill('4242');
    await page.getByRole('button', { name: 'Save payee' }).click();
    await expect(page.getByText('Robin', { exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByText('Robin', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Remove Robin' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Remove payee' }).click();
    await expect(page.getByText('Robin', { exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Payees' })).toBeVisible();
    await expect(page.getByText('Robin', { exact: true })).toHaveCount(0);
  });

  test('a transfer moves money and survives a reload', async ({ page }) => {
    await openApp(page, '#/transfer');
    await page.getByRole('button', { name: /Everyday Checking/ }).click();
    await page.getByRole('button', { name: /Rainy-day Savings/ }).click();
    await page.getByLabel(/Amount/).fill('125.50');
    await page.getByRole('button', { name: 'Review transfer' }).click();
    await page.getByRole('button', { name: /Send \$125\.50/ }).click();
    await expect(page.getByTestId('transfer-reference')).toHaveText(/^transfer_u/);

    await page.goto(`${prototypeUrl(SLUG)}#/accounts/acct_savings`);
    await page.reload();
    await expect(page.getByText('Transfer from Everyday Checking').first()).toBeVisible();
  });

  test('a view-only persona is blocked without wiping data', { tag: '@desktop' }, async ({
    page,
  }) => {
    await openApp(page, '#/transfer');
    const before = await counts(page);
    await page.evaluate(() => window.__protoyard?.session.switchActor('user_0003'));
    await expect(page.getByText("Transfers aren't available for your access")).toBeVisible();
    await page.goto(`${prototypeUrl(SLUG)}#/payees`);
    await expect(page.getByText('Read-only list')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add payee' })).toHaveCount(0);
    expect(await counts(page)).toEqual(before);
  });

  // Phone layout: Transfer and the bottom nav stay in view (the point of this demo).
  test('MobileAppShell keeps nav and Transfer submit in view without document scroll', {
    tag: '@mobile',
  }, async ({ page }) => {
    await openApp(page, '#/transfer');
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav).toBeVisible();
    await expect(nav).toBeInViewport();

    await page.getByRole('button', { name: /Everyday Checking/ }).click();
    await page.getByRole('button', { name: /Rainy-day Savings/ }).click();
    await page.getByLabel(/Amount/).fill('10.00');
    // Primary action is pinned in the shell stickyFooter above BottomNav.
    const review = page.getByRole('button', { name: 'Review transfer' });
    await expect(review).toBeInViewport();
    await review.click();
    const send = page.getByRole('button', { name: /Send \$10\.00/ });
    await expect(send).toBeInViewport();
    await expect(nav).toBeInViewport();

    // Document itself does not scroll — only the shell <main> does.
    const scroll = await page.evaluate(() => ({
      docTop: document.documentElement.scrollTop + document.body.scrollTop,
      mainScrollable: ['auto', 'scroll'].includes(
        getComputedStyle(document.getElementById('main') as HTMLElement).overflowY
      ),
      shellOverflow: document.querySelector('[class*="overflow-hidden"]') !== null,
    }));
    expect(scroll.docTop).toBe(0);
    expect(scroll.mainScrollable).toBe(true);
  });
});
