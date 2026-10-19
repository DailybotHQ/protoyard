import { expect, type Page, test } from '@playwright/test';
import { waitForPrototypeReady } from './support/ready.ts';
import { PROTOTYPE_TARGETS, prototypeUrl } from './targets.ts';

/**
 * Domain flows of Lumen Bank against its STATIC production build (DevTools
 * excluded): CRUD with reload persistence, a transfer, persona permissions,
 * scenarios, theme and snapshots. Each test gets a fresh browser context, so
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
  test('creates and removes a payee, persisting across reloads', async ({ page }) => {
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

  test('a transfer updates both account balances, and they persist', async ({ page }) => {
    // Balances are read from the UI (#acct-balance on each account screen) and
    // parsed from the displayed currency, so the check is format-agnostic.
    const balance = async (account: string, name: RegExp) => {
      await page.goto(`${prototypeUrl(SLUG)}#/accounts/${account}`);
      await waitForPrototypeReady(page, { slug: SLUG });
      // Wait for THIS account's screen, so the previous account's figure is never read.
      await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
      await page.waitForLoadState('networkidle');
      const text = (await page.locator('#acct-balance').innerText()).replace(/[^0-9.-]/g, '');
      return Math.round(Number(text) * 100);
    };
    await openApp(page);
    const checkingBefore = await balance('acct_checking', /Everyday Checking/);
    const savingsBefore = await balance('acct_savings', /Rainy-day Savings/);

    await page.goto(`${prototypeUrl(SLUG)}#/transfer`);
    await page.getByRole('button', { name: /Everyday Checking/ }).click();
    await page.getByRole('button', { name: /Rainy-day Savings/ }).click();
    await page.getByLabel(/Amount/).fill('125.50');
    await page.getByRole('button', { name: 'Review transfer' }).click();
    await page.getByRole('button', { name: /Send \$125\.50/ }).click();
    await expect(page.getByTestId('transfer-reference')).toHaveText(/^transfer_u/);

    await page.reload();
    expect(await balance('acct_checking', /Everyday Checking/)).toBe(checkingBefore - 12_550);
    expect(await balance('acct_savings', /Rainy-day Savings/)).toBe(savingsBefore + 12_550);
  });

  test('switching accounts updates the screen without a reload', async ({ page }) => {
    // Regression: AccountDetail's queries declare `deps: () => accountId`.
    await openApp(page, '#/accounts/acct_checking');
    await expect(page.getByRole('heading', { level: 1, name: /Everyday Checking/ })).toBeVisible();
    await page.evaluate(() => {
      location.hash = '#/accounts/acct_savings';
    });
    await expect(page.getByRole('heading', { level: 1, name: /Rainy-day Savings/ })).toBeVisible();
  });

  test('a view-only persona is blocked without wiping data', async ({ page }) => {
    await openApp(page, '#/transfer');
    const before = await counts(page);
    await page.evaluate(() => window.__protoyard?.session.switchActor('user_0003'));
    await expect(page.getByText("Transfers aren't available for your access")).toBeVisible();
    await page.goto(`${prototypeUrl(SLUG)}#/payees`);
    await expect(page.getByText('Read-only list')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add payee' })).toHaveCount(0);
    expect(await counts(page)).toEqual(before);
  });

  test('a brand-new account shows empty states and a real first deposit', async ({ page }) => {
    await openApp(page, '', 'new-account');
    await expect(page.getByText('Welcome to Lumen Bank')).toBeVisible();
    await expect(page.getByTestId('total-balance')).toHaveText('$0.00');
    await page.getByRole('button', { name: /Simulate payroll deposit/ }).click();
    await expect(page.getByTestId('total-balance')).toHaveText('$2,850.00');
    await page.reload();
    await expect(page.getByTestId('total-balance')).toHaveText('$2,850.00');
  });

  test('dark mode is saved per persona and never touches records', async ({ page }) => {
    await openApp(page, '#/profile');
    const before = await counts(page);
    await page.getByText('Dark', { exact: true }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);
    expect(await counts(page)).toEqual(before);
  });

  test('a snapshot brings back a deleted payee', async ({ page }) => {
    await openApp(page, '#/payees');
    const saved = await page.evaluate(() => window.__protoyard?.snapshots.save({ name: 'e2e' }));
    await page.getByRole('button', { name: /^Remove Casey/ }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Remove payee' }).click();
    // Scope to the app content: the removal toast also names the payee.
    const payee = page.locator('#main').getByText('Casey', { exact: true });
    await expect(payee).toHaveCount(0);
    await page.evaluate((id) => window.__protoyard?.snapshots.restore(id), saved?.id ?? '');
    await expect(payee).toBeVisible();
  });

  test('the standalone build ships without DevTools and uses IndexedDB', async ({ page }) => {
    await openApp(page);
    await expect(page.getByTestId('total-balance')).toBeVisible();
    await expect(page.getByRole('button', { name: /devtools/i })).toHaveCount(0);
    expect(await page.evaluate(() => window.__protoyard?.storage().backend)).toBe('indexeddb');
  });

  // Viewport-fit regression for Transfer + bottom nav; see also
  // tests/e2e/viewport-fit.spec.ts (desktop 1280×800 + Pixel 7).
  test('MobileAppShell keeps nav and Transfer submit in view without document scroll', async ({
    page,
  }) => {
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
      mainScrollable:
        document.getElementById('main')?.classList.contains('overflow-y-auto') ?? false,
      shellOverflow: document.querySelector('[class*="overflow-hidden"]') !== null,
    }));
    expect(scroll.docTop).toBe(0);
    expect(scroll.mainScrollable).toBe(true);
  });
});
