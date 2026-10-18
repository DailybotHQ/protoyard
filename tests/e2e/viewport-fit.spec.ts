import { expect, type Page, test } from '@playwright/test';
import { waitForPrototypeReady } from './support/ready.ts';
import { PROTOTYPE_TARGETS, prototypeUrl } from './targets.ts';

/**
 * Full-viewport layout guard: the document must not scroll, and bottom
 * navigation (when present) must sit inside the visual viewport. Covers the
 * reported Lumen Bank desktop bug (page scroll hid the bottom nav).
 *
 * Runs under both Playwright projects (Desktop Chrome and Pixel 7). Desktop
 * cases force 1280×800; the mobile project already uses the Pixel 7 device.
 */

const BANKING = 'mobile-banking-demo';

const DESKTOP = { width: 1280, height: 800 } as const;

async function openPrototype(page: Page, slug: string, hash = '') {
  await page.goto(`${prototypeUrl(slug)}?scenario=active-customer${hash}`);
  await waitForPrototypeReady(page, { slug });
}

/** Document scroll metrics + optional bottom-nav box relative to the viewport. */
async function measureViewportFit(page: Page) {
  return page.evaluate(() => {
    const scrolling = document.scrollingElement ?? document.documentElement;
    const nav =
      document.querySelector<HTMLElement>('[data-py-bottom-nav]') ??
      document.querySelector<HTMLElement>('nav[aria-label="Main"]');
    const navBox = nav?.getBoundingClientRect() ?? null;
    return {
      scrollHeight: scrolling.scrollHeight,
      clientHeight: scrolling.clientHeight,
      innerHeight: window.innerHeight,
      innerWidth: window.innerWidth,
      docScrollTop: scrolling.scrollTop,
      nav: navBox
        ? {
            top: navBox.top,
            bottom: navBox.bottom,
            left: navBox.left,
            right: navBox.right,
            height: navBox.height,
            width: navBox.width,
          }
        : null,
    };
  });
}

function assertNoDocumentScroll(metrics: Awaited<ReturnType<typeof measureViewportFit>>) {
  // Task contract: scrollHeight <= innerHeight + 1 (sub-pixel / scrollbar slack).
  expect(
    metrics.scrollHeight,
    `document.scrollingElement.scrollHeight (${metrics.scrollHeight}) exceeds innerHeight+1 (${metrics.innerHeight + 1})`
  ).toBeLessThanOrEqual(metrics.innerHeight + 1);
  expect(metrics.docScrollTop).toBe(0);
}

function assertBottomNavInViewport(
  metrics: Awaited<ReturnType<typeof measureViewportFit>>,
  label: string
) {
  expect(
    metrics.nav,
    `${label}: expected a bottom nav ([data-py-bottom-nav] or nav[aria-label=Main])`
  ).not.toBeNull();
  const nav = metrics.nav!;
  expect(nav.top).toBeGreaterThanOrEqual(-0.5);
  expect(nav.bottom).toBeLessThanOrEqual(metrics.innerHeight + 1);
  expect(nav.left).toBeGreaterThanOrEqual(-0.5);
  expect(nav.right).toBeLessThanOrEqual(metrics.innerWidth + 1);
  expect(nav.height).toBeGreaterThan(0);
}

test.describe('viewport fit', () => {
  test.skip(
    !PROTOTYPE_TARGETS.includes(BANKING),
    `set PROTOYARD_E2E_PROTOTYPES to include ${BANKING}`
  );

  test.describe('desktop 1280×800', () => {
    test.use({ viewport: DESKTOP });

    // Owning shells lane must land the phone-frame / full-viewport fix first.
    // Remove test.fixme when mobile-banking-demo no longer scrolls the document on desktop.
    test.fixme('mobile-banking-demo fills the viewport without document scroll; bottom nav visible', async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name === 'mobile', 'desktop viewport case');
      await openPrototype(page, BANKING, '#/');
      const home = await measureViewportFit(page);
      assertNoDocumentScroll(home);
      assertBottomNavInViewport(home, `${BANKING} home`);

      await openPrototype(page, BANKING, '#/transfer');
      const transfer = await measureViewportFit(page);
      assertNoDocumentScroll(transfer);
      assertBottomNavInViewport(transfer, `${BANKING} transfer`);
    });
  });

  test.describe('Pixel 7', () => {
    test.fixme('mobile-banking-demo fills the viewport without document scroll; bottom nav visible', async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile', 'Pixel 7 project only');
      await openPrototype(page, BANKING, '#/');
      const home = await measureViewportFit(page);
      assertNoDocumentScroll(home);
      assertBottomNavInViewport(home, `${BANKING} home (Pixel 7)`);

      await openPrototype(page, BANKING, '#/transfer');
      const transfer = await measureViewportFit(page);
      assertNoDocumentScroll(transfer);
      assertBottomNavInViewport(transfer, `${BANKING} transfer (Pixel 7)`);
    });
  });
});
