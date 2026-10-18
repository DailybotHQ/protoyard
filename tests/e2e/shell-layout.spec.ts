import { expect, type Page, test } from '@playwright/test';
import { expectAccessible } from './support/a11y.ts';
import { waitForPrototypeReady } from './support/ready.ts';
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

/**
 * Shell matrix (ADR-016): every framed shell via `?shell=` on the same static
 * Lumen Bank build. Desktop runs at 1440×900, wide enough for every frame
 * (the panel shells need the 1280 px laptop device plus a gutter). On the
 * mobile project the window is narrower than any device, so no shell draws a
 * frame and the app is full-bleed, as on a real phone.
 */
type Box = { x: number; y: number; width: number; height: number };

const FRAMED_SHELLS: readonly {
  shell: string;
  frame: string;
  open?: (page: Page) => Promise<void>;
}[] = [
  { shell: 'phone', frame: '[data-py-frame="phone"]' },
  { shell: 'tablet', frame: '[data-py-frame="tablet"]' },
  { shell: 'desktop-window', frame: '[data-py-wallpaper]' },
  { shell: 'browser', frame: '[data-py-frame="browser"]' },
  {
    shell: 'widget-host',
    frame: '[data-py-frame="widget-host"]',
    // The widget starts closed behind its launcher, like a real support widget.
    open: async (page) => {
      await page.locator('[data-py-widget-launcher]').click();
      await expect(page.locator('[data-py-frame="widget-host"]')).toHaveAttribute(
        'data-py-widget-open',
        'true'
      );
    },
  },
  { shell: 'extension-popup', frame: '[data-py-frame="extension-popup"]' },
  { shell: 'side-panel', frame: '[data-py-frame="side-panel"]' },
];

const FRAME_MARKERS = '[data-py-frame], [data-py-wallpaper]';

async function openShell(page: Page, shell: string | null) {
  const query = shell ? `&shell=${shell}` : '';
  await page.goto(`${prototypeUrl(SLUG)}?scenario=active-customer${query}`);
  await waitForPrototypeReady(page, { slug: SLUG });
}

async function boxOf(page: Page, selector: string): Promise<Box> {
  const box = await page.locator(selector).first().boundingBox();
  expect(box, `${selector} has a box`).not.toBeNull();
  return box as Box;
}

function expectInside(inner: Box, outer: Box, label: string) {
  const tol = 1;
  expect(inner.x, `${label}: left`).toBeGreaterThanOrEqual(outer.x - tol);
  expect(inner.y, `${label}: top`).toBeGreaterThanOrEqual(outer.y - tol);
  expect(inner.x + inner.width, `${label}: right`).toBeLessThanOrEqual(outer.x + outer.width + tol);
  expect(inner.y + inner.height, `${label}: bottom`).toBeLessThanOrEqual(
    outer.y + outer.height + tol
  );
}

/**
 * The app is actually painted, not just laid out: at the app heading, the top element
 * (with pointer events forced on for frame parts, so overlays count) must be inside the
 * screen, or a fully transparent frame part. A frame that covered the app with an opaque
 * surface passed every geometric check while showing a blank screen.
 */
async function expectAppPainted(page: Page, label: string) {
  const blocker = await page.evaluate(() => {
    const screenEl = document.querySelector('[data-py-shell-part="screen"]');
    const heading = screenEl?.querySelector('h1');
    if (!screenEl || !heading) return 'no app heading in the screen';
    const force = document.createElement('style');
    force.textContent =
      '[data-py-frame], [data-py-frame] *, [data-py-wallpaper] { pointer-events: auto !important; }';
    document.head.append(force);
    const r = heading.getBoundingClientRect();
    const stack = document.elementsFromPoint(
      r.left + Math.min(r.width / 2, 24),
      r.top + r.height / 2
    );
    force.remove();
    for (const el of stack) {
      if (screenEl.contains(el)) return null;
      const cs = getComputedStyle(el);
      const transparent =
        /^(transparent|rgba\(.*,\s*0\))$/.test(cs.backgroundColor) && cs.backgroundImage === 'none';
      if (!transparent) {
        const marks = [...el.attributes]
          .filter((a) => a.name.startsWith('data-py'))
          .map((a) => a.name);
        return `${el.tagName.toLowerCase()} ${marks.join(' ')} (${cs.backgroundColor}) covers the app`;
      }
    }
    return 'the app heading is not painted';
  });
  expect(blocker, `${label}: app content visible`).toBeNull();
}

async function expectDocumentDoesNotScroll(page: Page) {
  const doc = await page.evaluate(() => {
    const el = document.scrollingElement ?? document.documentElement;
    return {
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    };
  });
  expect(doc.scrollHeight, 'document height').toBeLessThanOrEqual(doc.clientHeight);
  expect(doc.scrollWidth, 'document width').toBeLessThanOrEqual(doc.clientWidth);
}

async function viewportBox(page: Page): Promise<Box> {
  return page.evaluate(() => ({
    x: 0,
    y: 0,
    width: window.innerWidth,
    height: window.innerHeight,
  }));
}

/** Primary actions (Home quick actions) and the bottom nav, inside `bounds`. */
async function expectActionsInside(page: Page, bounds: Box, label: string) {
  await expect(page.locator('[data-py-bottom-nav]')).toBeVisible();
  expectInside(await boxOf(page, '[data-py-bottom-nav]'), bounds, `${label} bottom nav`);
  const transfer = page
    .getByRole('navigation', { name: 'Quick actions' })
    .getByRole('link', { name: 'Transfer' });
  await expect(transfer).toBeVisible();
  expectInside((await transfer.boundingBox()) as Box, bounds, `${label} primary action`);
}

test.describe('shell matrix: framed on desktop', () => {
  for (const { shell, frame, open } of FRAMED_SHELLS) {
    test(`${shell}: framed, actions and fixed children inside the screen, no document scroll, axe`, async ({
      page,
      isMobile,
    }, testInfo) => {
      test.skip(isMobile, 'frames need a window wider than the device');
      await page.setViewportSize({ width: 1440, height: 900 });
      // Settled state only: an opening panel mid-fade blends colors and skews contrast.
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await openShell(page, shell);
      await expect(page.locator('html')).toHaveAttribute('data-py-shell', shell);
      await expect(page.locator(frame).first()).toBeVisible();
      await open?.(page);

      const viewport = await viewportBox(page);
      const screen = await boxOf(page, '[data-py-shell-part="screen"]');
      expectInside(screen, viewport, `${shell} screen`);
      await expectActionsInside(page, screen, shell);
      await expectAppPainted(page, shell);

      // position: fixed descendants (the bottom nav, sheets…) stay in the screen box.
      const escaped = await page.evaluate(() => {
        const screenEl = document.querySelector('[data-py-shell-part="screen"]') as HTMLElement;
        const s = screenEl.getBoundingClientRect();
        const out: string[] = [];
        for (const el of screenEl.querySelectorAll<HTMLElement>('*')) {
          if (getComputedStyle(el).position !== 'fixed') continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (
            r.left < s.left - 1 ||
            r.top < s.top - 1 ||
            r.right > s.right + 1 ||
            r.bottom > s.bottom + 1
          ) {
            out.push(
              `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${[...el.attributes]
                .filter((a) => a.name.startsWith('data-py'))
                .map((a) => `[${a.name}]`)
                .join('')}`
            );
          }
        }
        return out;
      });
      expect(escaped, `${shell}: fixed elements outside the screen`).toEqual([]);

      await expectDocumentDoesNotScroll(page);
      await expectAccessible(page, testInfo, { label: `shell-${shell}` });
    });
  }
});

test.describe('shell matrix: full-bleed on a phone', () => {
  for (const shell of [null, ...FRAMED_SHELLS.map((s) => s.shell)]) {
    test(`${shell ?? 'auto'}: no frame, actions inside the viewport, no document scroll`, async ({
      page,
      isMobile,
    }) => {
      test.skip(!isMobile, 'runs on the mobile project (Pixel 7)');
      await openShell(page, shell);
      await expect(page.locator('html')).not.toHaveAttribute('data-py-shell', /.*/);
      await expect(page.locator(FRAME_MARKERS)).toHaveCount(0);
      await expectActionsInside(page, await viewportBox(page), shell ?? 'auto');
      await expectDocumentDoesNotScroll(page);
    });
  }
});
