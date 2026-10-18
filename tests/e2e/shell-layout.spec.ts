import { expect, type Page, test } from '@playwright/test';
import { PROTOTYPE_TARGETS, prototypeUrl } from './targets.ts';

/**
 * Layout under viewport presets, against the STATIC build of Lumen Bank
 * (manifest `preview.viewport: "iphone"`). The preset narrows #app; it must
 * not grow the document or push fixed descendants (the bottom nav) below
 * the fold: #app is a viewport-tall box and the app scrolls inside its own
 * scroll container (Lumen Bank: MobileAppShell's <main>; other apps: the
 * renderer's scroll root).
 */
const SLUG = 'mobile-banking-demo';
test.skip(!PROTOTYPE_TARGETS.includes(SLUG), `set PROTOYARD_E2E_PROTOTYPES to include ${SLUG}`);

async function openApp(page: Page, hash = '') {
  await page.goto(`${prototypeUrl(SLUG)}?scenario=active-customer${hash}`);
  await expect(page.locator('html')).toHaveAttribute('data-py-ready', 'true', { timeout: 15_000 });
  await expect(page.locator('html')).toHaveAttribute('data-py-viewport', 'iphone');
}

const viewportHeight = (page: Page) => page.evaluate(() => window.innerHeight);

/** Lumen Bank scrolls inside MobileAppShell's <main id="main">, never the document. */
const appScroller = (page: Page) => page.locator('[data-py-scroll-root] main#main');

test.describe('viewport preset layout (Lumen Bank)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('the document does not scroll and the bottom nav is fully visible', async ({ page }) => {
    await openApp(page);
    const nav = page.locator('[data-py-bottom-nav]');
    await expect(nav).toBeVisible();

    const doc = await page.evaluate(() => {
      const el = document.scrollingElement ?? document.documentElement;
      return { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
    });
    expect(doc.scrollHeight).toBeLessThanOrEqual(doc.clientHeight);

    const box = await nav.boundingBox();
    expect(box).not.toBeNull();
    const height = await viewportHeight(page);
    expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(height + 0.5);

    // The nav sits inside the narrowed column, not across the whole window.
    const column = await page.locator('#app').boundingBox();
    expect(box?.x ?? -1).toBeGreaterThanOrEqual((column?.x ?? 0) - 0.5);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
      (column?.x ?? 0) + (column?.width ?? 0) + 0.5
    );
  });

  test('the last Home section is reachable by scrolling the app, above the nav', async ({
    page,
  }) => {
    await openApp(page);
    const scrollRoot = appScroller(page);
    const overflow = await scrollRoot.evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(overflow).toBeGreaterThan(0);

    const last = page.getByRole('heading', { name: 'Spending, last 30 days' });
    await scrollRoot.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
    await expect(last).toBeInViewport();

    const navTop = (await page.locator('[data-py-bottom-nav]').boundingBox())?.y ?? 0;
    const section = page.locator('section', { has: last });
    const sectionBox = await section.boundingBox();
    expect((sectionBox?.y ?? 0) + (sectionBox?.height ?? 0)).toBeLessThanOrEqual(navTop + 0.5);

    // The nav did not move while the app scrolled.
    const height = await viewportHeight(page);
    const navBox = await page.locator('[data-py-bottom-nav]').boundingBox();
    expect((navBox?.y ?? 0) + (navBox?.height ?? 0)).toBeLessThanOrEqual(height + 0.5);
  });

  test('navigating resets the app scroll position', async ({ page }) => {
    await openApp(page);
    const scrollRoot = appScroller(page);
    await scrollRoot.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
    expect(await scrollRoot.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

    await page.locator('[data-py-bottom-nav]').getByRole('link', { name: 'Activity' }).click();
    await expect(page.getByRole('heading', { name: 'Activity', level: 1 })).toBeVisible();
    expect(await scrollRoot.evaluate((el) => el.scrollTop)).toBe(0);
  });
});
